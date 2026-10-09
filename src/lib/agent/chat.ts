import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { summarizeConversation } from '@/lib/agent/summarize.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_CHAT_MODEL } from '@/lib/constants.js'
import { conversationsStore } from '@/lib/db/conversations.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { matchSkill, stripSkillMention } from '@/lib/skills/index.js'
import { filterToolsByPermissions, onToolCall, tools } from '@/lib/tools/index.js'
import { convertSummaryToTitle } from '@/lib/utils.js'

export interface ChatSessionCallbacks {
  onNewResponse?: () => void
  onMessageChunk?: (chunk: ChatMessage) => void
  onFinish?: (messages: ChatMessage[]) => void
  onError?: (error: string) => void
}

export class ChatService {
  private _app: AppInterface
  private _cancellables: Map<number, Gio.Cancellable> = new Map()

  constructor(app: AppInterface) {
    this._app = app
  }

  public stopGeneration(id: number): void {
    const cancellable = this._cancellables.get(id)
    if (cancellable) {
      cancellable.cancel()
      this._cancellables.delete(id)
    }
  }

  public stopAllGenerations(): void {
    for (const cancellable of this._cancellables.values()) {
      cancellable.cancel()
    }
    this._cancellables.clear()
  }

  public isGenerating(id: number): boolean {
    return this._cancellables.has(id)
  }

  public async generateResponse(
    conversationId: number,
    isFirstMessage: boolean,
    callbacks: ChatSessionCallbacks
  ): Promise<void> {
    const conversation = this._app.conversations.find((c) => {
      return c.id === conversationId
    })
    if (!conversation) {
      return
    }

    const chatConversation = this._app.conversation
    if (!chatConversation || chatConversation.id !== conversationId) {
      return
    }

    const cancellable = new Gio.Cancellable()
    this._cancellables.set(conversationId, cancellable)
    this._app.setGeneratingMessage(conversationId, true)

    let fullContent = ''
    let fullThinking = ''
    let fullToolCalls: ToolCall[] = []
    const generatedMessages: ChatMessage[] = []

    const lastUserMessage = [...chatConversation.messages].reverse().find((m) => {
      return m.role === 'user'
    })
    const skill = lastUserMessage ? matchSkill(lastUserMessage.content, this._app.skills ?? []) : undefined

    try {
      const recursiveChat = async (messages: ChatMessage[]): Promise<void> => {
        if (cancellable.is_cancelled()) {
          return
        }

        callbacks.onNewResponse?.()
        fullContent = ''
        fullThinking = ''
        fullToolCalls = []

        const outgoingMessages = skill
          ? messages.map((m) => {
              return m === lastUserMessage ? { ...m, content: stripSkillMention(m.content) } : m
            })
          : messages

        const response = await this._app.provider.chat({
          model: this._app.model ?? DEFAULT_CHAT_MODEL,
          system: this._app.settings.system,
          stream: this._app.settings.stream,
          think: this._app.settings.think,
          options: this._app.settings.options,
          messages: outgoingMessages,
          skill,
          tools: filterToolsByPermissions(this._app, tools),
          onMessageChunk: (chunk) => {
            if (chunk.message?.thinking) {
              fullThinking += chunk.message.thinking
            }
            if (chunk.message?.content) {
              fullContent += chunk.message.content
            }
            if (chunk.message?.tool_calls) {
              fullToolCalls = [...fullToolCalls, ...chunk.message.tool_calls]
            }

            callbacks.onMessageChunk?.({
              ...(chunk.message || {}),
              content: fullContent,
              thinking: fullThinking,
              tool_calls: fullToolCalls.length > 0 ? fullToolCalls : undefined
            })
          },
          cancellable
        })

        if (!response) {
          if (cancellable.is_cancelled() && (fullContent || fullThinking || fullToolCalls.length > 0)) {
            const partialMessage: ChatMessage = {
              role: 'assistant',
              content: fullContent,
              thinking: fullThinking,
              tool_calls: fullToolCalls.length > 0 ? fullToolCalls : undefined
            }
            generatedMessages.push(partialMessage)
            chatConversation.messages.push(partialMessage)
          }
          return
        }

        generatedMessages.push(response)
        chatConversation.messages.push(response)

        if (response.tool_calls?.length) {
          const startToolTime = GLib.get_monotonic_time()

          const toolMessages: ChatMessage[] = await Promise.all(response.tool_calls.map(async (tc) => {
            return {
              role: 'tool' as const,
              tool_name: tc.function.name,
              content: await onToolCall(this._app, tc.function.name, tc.function.arguments) || ''
            }
          }))

          const endToolTime = GLib.get_monotonic_time()
          const toolDurationMs = (endToolTime - startToolTime) / 1000
          this._app.tracker.recordToolCall(toolDurationMs)

          generatedMessages.push(...toolMessages)
          chatConversation.messages.push(...toolMessages)

          await recursiveChat([...messages, response, ...toolMessages])
        }
      }

      await recursiveChat(chatConversation.messages)

      await conversationsStore.saveMessages(chatConversation.id, chatConversation.messages)
      chatConversation.updated_at = new Date().toISOString()
      chatConversation.embeddings = undefined
      const conv = this._app.conversations.find((c) => {
        return c.id === chatConversation.id
      })
      if (conv) {
        conv.updated_at = chatConversation.updated_at
        conv.embeddings = undefined
        this._app.sidebar.updateConversation(conv)
      }
      this._app.saveConversations()

      if (!this._app.window.is_active || this._app.conversation?.id !== chatConversation.id) {
        const notification = new Gio.Notification()
        notification.set_title('Gnome AI Chat')
        notification.set_body('The assistant has finished responding.')
        notification.set_default_action_and_target('app.open-conversation', GLib.Variant.new_string(chatConversation.id.toString()))
        this._app.sendNotification(`message-completed-${chatConversation.id}`, notification)
      }

      if (isFirstMessage && !cancellable.is_cancelled()) {
        this._app.setSummarizing(chatConversation.id, true)
        void summarizeConversation({ provider: this._app.provider, messages: chatConversation.messages })
          .then((summary) => {
            if (summary) {
              const title = convertSummaryToTitle(summary)
              this._app.setConversationTitle(chatConversation, title)
              this._app.saveConversations()
            }
          })
          .catch((err) => {
            console.error('Failed to auto-summarize conversation:', err)
          })
          .finally(() => {
            this._app.setSummarizing(chatConversation.id, false)
          })
      }

      callbacks.onFinish?.(generatedMessages)
    } catch (err) {
      console.error(err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      callbacks.onError?.(errorMessage)
    } finally {
      this._app.setGeneratingMessage(conversationId, false)
      this._cancellables.delete(conversationId)
    }
  }
}
