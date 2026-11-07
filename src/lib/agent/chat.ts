import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import type { ChatConversation } from '@/app/ui/history.js'
import { buildContext, type ContextResult } from '@/lib/agent/context.js'
import type { Passage, ResearchSource } from '@/lib/agent/research.js'
import { buildFollowUpPrompt, buildPlanPrompt, buildReportPrompt, CANCELLED_RESULT, describeSearchResults, describeSources, FOLLOW_UP_FORMAT, mapWithConcurrency, NOT_CITED_RESULT, parseFollowUps, parsePlan, PLAN_FORMAT, queryTerms, recentContext, REPORT_SYSTEM_PROMPT, researchBudget, scorePassage, selectPassages } from '@/lib/agent/research.js'
import { summarizeConversation } from '@/lib/agent/summarize.js'
import type { AppInterface } from '@/lib/app.js'
import { DEEPSEARCH_CHUNK_CHARS, DEEPSEARCH_CHUNKS_PER_PAGE, DEEPSEARCH_EMBED_BATCH, DEEPSEARCH_FETCH_CONCURRENCY, DEEPSEARCH_FOLLOWUP_PAGES, DEEPSEARCH_MAX_PAGES, DEFAULT_CHAT_MODEL, DEFAULT_EMBEDDING_MODEL, DEFAULT_OPTIONS, MAX_TOOL_ROUNDS } from '@/lib/constants.js'
import { debug } from '@/lib/debug.js'
import type { ChatMessage, ChatProps, ToolCall } from '@/lib/providers/index.js'
import { buildSkillPrompt, matchSkill, stripSkillMention } from '@/lib/skills/index.js'
import { RecursiveCharacterTextSplitter } from '@/lib/splitter.js'
import { availableSkills } from '@/lib/tools/groups.js'
import { canRunInParallel, getAvailableTools, onToolCall } from '@/lib/tools/index.js'
import { defaultSearchLanguage, fetchPageText, searchWeb } from '@/lib/tools/web.js'
import type { SearchResult } from '@/lib/tools/websearch.js'
import { mergeResults } from '@/lib/tools/websearch.js'
import { convertSummaryToTitle, cosineSimilarity } from '@/lib/utils.js'

export interface ChatSessionCallbacks {
  onNewResponse?: () => void
  onMessageChunk?: (chunk: ChatMessage) => void
  onResponse?: (message: ChatMessage) => void
  onMessage?: (message: ChatMessage) => void
  onToolStart?: (call: ToolCall) => void
  onToolEnd?: (call: ToolCall, result: ChatMessage, durationMs: number) => void
  onFinish?: (messages: ChatMessage[]) => void
  onError?: (error: string) => void
}

interface GenerationSession {
  conversation: ChatConversation
  cancellable: Gio.Cancellable
  generated: ChatMessage[]
}

export class ChatService {
  private _app: AppInterface
  private _cancellables: Map<number, Gio.Cancellable> = new Map()
  private _conversations: Map<number, ChatConversation> = new Map()
  private _streaming: Map<number, ChatMessage> = new Map()
  private _capabilityWarnings: Set<string> = new Set()
  private _trimWarnings: Set<number> = new Set()

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

  public getActiveConversation(id: number): ChatConversation | undefined {
    return this._conversations.get(id)
  }

  public getStreamingMessage(id: number): ChatMessage | undefined {
    return this._streaming.get(id)
  }

  public generateResponse(
    conversationId: number,
    isFirstMessage: boolean,
    callbacks: ChatSessionCallbacks
  ): Promise<void> {
    return this._runSession(conversationId, isFirstMessage, callbacks, async (session) => {
      const { cancellable, conversation } = session
      const lastUserMessage = [...conversation.messages].reverse().find((m) => {
        return m.role === 'user'
      })
      const skill = lastUserMessage ? matchSkill(lastUserMessage.content, availableSkills(this._app.skills ?? [], this._app.settings)) : undefined
      const model = this._app.model ?? DEFAULT_CHAT_MODEL
      const system = [this._app.settings.system, skill ? buildSkillPrompt(skill) : ''].filter(Boolean).join('\n\n')
      const numCtx = this._app.settings.options.num_ctx ?? DEFAULT_OPTIONS.num_ctx

      await this._warnMissingCapabilities(model, conversation.messages)

      const recursiveChat = async (messages: ChatMessage[], round: number): Promise<void> => {
        if (cancellable.is_cancelled()) {
          return
        }

        const outgoingMessages = skill
          ? messages.map((m) => {
              return m === lastUserMessage ? { ...m, content: stripSkillMention(m.content) } : m
            })
          : messages

        const tools = round < MAX_TOOL_ROUNDS ? getAvailableTools(this._app) : undefined
        const context = buildContext({ system, messages: outgoingMessages, tools: tools ?? [], numCtx })
        this._reportContext(conversation.id, context, numCtx)

        const response = await this._streamReply(session, callbacks, {
          model,
          system: this._app.settings.system,
          stream: this._app.settings.stream,
          think: this._app.settings.think,
          options: this._app.settings.options,
          messages: context.messages,
          skill,
          tools
        })

        if (!response?.tool_calls?.length) {
          return
        }

        const startToolTime = GLib.get_monotonic_time()
        const toolMessages = await this._runToolCalls(response.tool_calls, cancellable, callbacks)
        this._app.tracker.recordToolCall((GLib.get_monotonic_time() - startToolTime) / 1000)

        session.generated.push(...toolMessages)
        conversation.messages.push(...toolMessages)

        await recursiveChat([...messages, response, ...toolMessages], round + 1)
      }

      await recursiveChat(conversation.messages, 0)
    })
  }

  public deepSearch(
    conversationId: number,
    question: string,
    isFirstMessage: boolean,
    callbacks: ChatSessionCallbacks
  ): Promise<void> {
    return this._runSession(conversationId, isFirstMessage, callbacks, async (session) => {
      const { cancellable, conversation } = session
      const model = this._app.model ?? DEFAULT_CHAT_MODEL
      const numCtx = this._app.settings.options.num_ctx ?? DEFAULT_OPTIONS.num_ctx
      const language = defaultSearchLanguage()
      const splitter = new RecursiveCharacterTextSplitter({ chunkSize: DEEPSEARCH_CHUNK_CHARS, chunkOverlap: 100 })
      const seen = new Set<string>()
      const passages: Passage[] = []
      const snippets: Passage[] = []

      const research: ChatMessage = { role: 'assistant', content: '', tool_calls: [] }
      const calls = research.tool_calls!
      const results = new Map<ToolCall, string>()
      const fetched = new Map<string, { call: ToolCall; title: string }>()
      let flushed = false
      const flush = (): void => {
        if (flushed) {
          return
        }
        flushed = true
        const toolMessages = calls.map((call): ChatMessage => {
          return { role: 'tool', tool_name: call.function.name, content: results.get(call) ?? CANCELLED_RESULT }
        })
        session.generated.push(...toolMessages)
        conversation.messages.push(...toolMessages)
      }
      session.generated.push(research)
      conversation.messages.push(research)
      callbacks.onMessage?.(research)

      const step = async <T>(name: string, args: Record<string, unknown>, run: (call: ToolCall) => Promise<T>, describe: (result: T) => string): Promise<T> => {
        const call: ToolCall = { id: '', function: { index: calls.length, name, arguments: args } }
        calls.push(call)
        callbacks.onMessage?.(research)
        callbacks.onToolStart?.(call)
        const start = GLib.get_monotonic_time()
        const finish = (text: string): void => {
          results.set(call, text)
          callbacks.onToolEnd?.(call, { role: 'tool', tool_name: name, content: text }, (GLib.get_monotonic_time() - start) / 1000)
        }
        try {
          const result = await run(call)
          finish(describe(result))
          return result
        } catch (err) {
          finish(cancellable.is_cancelled() ? CANCELLED_RESULT : `Error: ${err instanceof Error ? err.message : String(err)}`)
          throw err
        }
      }

      const askJson = async (prompt: string, format: object): Promise<string> => {
        const response = await this._app.provider.chat({
          model,
          stream: false,
          format,
          options: this._app.settings.options,
          messages: [{ role: 'user', content: prompt }],
          cancellable
        })
        return response?.content ?? ''
      }

      const gather = async (queries: string[], maxPages: number): Promise<void> => {
        const lists = await Promise.all(queries.map((query) => {
          return step('web_search', { query }, () => {
            return searchWeb(query, language, cancellable)
          }, describeSearchResults).catch((): SearchResult[] => {
            return []
          })
        }))
        if (cancellable.is_cancelled()) {
          return
        }
        const results = mergeResults(lists, Number.MAX_SAFE_INTEGER).filter((r) => {
          return !seen.has(r.url)
        })
        for (const r of results) {
          seen.add(r.url)
          if (r.snippet) {
            snippets.push({ url: r.url, title: r.title, text: r.snippet })
          }
        }
        const pages = results.filter((r) => {
          return /^https?:\/\//.test(r.url) && !/^https?:\/\/(?:[^/]+\.)?duckduckgo\.com\/?$/.test(r.url)
        }).slice(0, maxPages)
        await mapWithConcurrency(pages, DEEPSEARCH_FETCH_CONCURRENCY, async (r) => {
          if (cancellable.is_cancelled()) {
            return
          }
          try {
            let call: ToolCall | undefined
            const page = await step('fetch_web_page', { url: r.url }, (stepCall) => {
              call = stepCall
              return fetchPageText(r.url, cancellable)
            }, (result) => {
              const chunks = splitter.splitText(result.text).filter((chunk) => {
                return chunk.trim().length > 80
              }).slice(0, DEEPSEARCH_CHUNKS_PER_PAGE)
              for (const chunk of chunks) {
                passages.push({ url: r.url, title: result.title || r.title, text: chunk.trim() })
              }
              return `${result.title || r.title || r.url}\n${r.url}\n\nRead ${chunks.length} passages.`
            })
            if (call) {
              fetched.set(r.url, { call, title: page.title || r.title })
            }
          } catch (err) {
            if (!cancellable.is_cancelled()) {
              console.error(`Deep search could not read ${r.url}:`, err)
            }
          }
        })
      }

      const select = (): Promise<ResearchSource[]> => {
        return step('deepsearch_select', {}, async () => {
          const pool = passages.length > 0 ? passages : snippets
          const scores = await this._scorePassages(question, pool)
          return selectPassages(pool, scores, researchBudget(numCtx))
        }, describeSources)
      }

      const run = async (): Promise<void> => {
        const queries = await step('deepsearch_plan', { question }, async () => {
          return parsePlan(await askJson(buildPlanPrompt(question, recentContext(conversation.messages)), PLAN_FORMAT), question)
        }, (list) => {
          return `Queries:\n${list.map((q) => {
            return `- ${q}`
          }).join('\n')}`
        })
        if (cancellable.is_cancelled()) {
          return
        }

        await gather(queries, DEEPSEARCH_MAX_PAGES)
        if (cancellable.is_cancelled()) {
          return
        }
        let sources = await select()

        const followUps = await step('deepsearch_followup', {}, async () => {
          return parseFollowUps(await askJson(buildFollowUpPrompt(question, sources), FOLLOW_UP_FORMAT))
        }, (list) => {
          return list.length > 0
            ? `Follow-up queries:\n${list.map((q) => {
              return `- ${q}`
            }).join('\n')}`
            : 'Nothing missing.'
        }).catch((): string[] => {
          return []
        })
        if (followUps.length > 0 && !cancellable.is_cancelled()) {
          await gather(followUps, DEEPSEARCH_FOLLOWUP_PAGES)
          if (cancellable.is_cancelled()) {
            return
          }
          sources = await select()
        }
        if (cancellable.is_cancelled()) {
          return
        }

        const fetchOrder = [...fetched.keys()]
        sources = [...sources].sort((a, b) => {
          return fetchOrder.indexOf(a.url) - fetchOrder.indexOf(b.url)
        })
        for (const [url, page] of fetched) {
          const source = sources.find((s) => {
            return s.url === url
          })
          results.set(page.call, source
            ? `${source.title || page.title}\n${url}\n\n${source.passages.join('\n\n')}`
            : `${NOT_CITED_RESULT}: ${page.title || url}`)
        }
        flush()

        await this._streamReply(session, callbacks, {
          model,
          system: REPORT_SYSTEM_PROMPT,
          stream: this._app.settings.stream,
          think: this._app.settings.think,
          options: this._app.settings.options,
          messages: [{ role: 'user', content: buildReportPrompt(question, sources, passages.length === 0) }]
        })
      }

      try {
        await run()
      } finally {
        flush()
      }
    })
  }

  private async _scorePassages(question: string, passages: Passage[]): Promise<number[]> {
    if (passages.length === 0) {
      return []
    }
    try {
      const [questionResponse, ...batches] = await Promise.all([
        this._app.provider.embed({ model: DEFAULT_EMBEDDING_MODEL, input: question }),
        ...Array.from({ length: Math.ceil(passages.length / DEEPSEARCH_EMBED_BATCH) }, (_, i) => {
          return this._app.provider.embed({
            model: DEFAULT_EMBEDDING_MODEL,
            input: passages.slice(i * DEEPSEARCH_EMBED_BATCH, (i + 1) * DEEPSEARCH_EMBED_BATCH).map((p) => {
              return p.text
            })
          })
        })
      ])
      const target = questionResponse?.embeddings?.[0]
      const vectors = batches.flatMap((b) => {
        return b?.embeddings ?? []
      })
      if (target && vectors.length === passages.length) {
        return vectors.map((v) => {
          return cosineSimilarity(target, v)
        })
      }
    } catch (err) {
      console.error('Deep search could not embed passages, using keyword scores:', err)
    }
    const terms = queryTerms(question)
    return passages.map((p) => {
      return scorePassage(p.text, terms)
    })
  }

  private async _runSession(
    conversationId: number,
    isFirstMessage: boolean,
    callbacks: ChatSessionCallbacks,
    run: (session: GenerationSession) => Promise<void>
  ): Promise<void> {
    const known = this._app.conversations.some((c) => {
      return c.id === conversationId
    })
    const conversation = this._app.conversation
    if (!known || !conversation || conversation.id !== conversationId) {
      return
    }

    const cancellable = new Gio.Cancellable()
    this._cancellables.set(conversationId, cancellable)
    this._conversations.set(conversationId, conversation)
    this._app.setGeneratingMessage(conversationId, true)
    const session: GenerationSession = { conversation, cancellable, generated: [] }

    try {
      await run(session)

      await this._app.persistConversation(conversation)

      if (!this._app.window.is_active || this._app.conversation?.id !== conversation.id) {
        const notification = new Gio.Notification()
        notification.set_title('Gnome AI Chat')
        notification.set_body('The assistant has finished responding.')
        notification.set_default_action_and_target('app.open-conversation', GLib.Variant.new_string(conversation.id.toString()))
        this._app.sendNotification(`message-completed-${conversation.id}`, notification)
      }

      if (isFirstMessage && !cancellable.is_cancelled()) {
        this._app.setSummarizing(conversation.id, true)
        void summarizeConversation({ provider: this._app.provider, messages: conversation.messages })
          .then((summary) => {
            if (summary) {
              const title = convertSummaryToTitle(summary)
              this._app.setConversationTitle(conversation, title)
              this._app.saveConversations()
            }
          })
          .catch((err) => {
            console.error('Failed to auto-summarize conversation:', err)
          })
          .finally(() => {
            this._app.setSummarizing(conversation.id, false)
          })
      }

      callbacks.onFinish?.(session.generated)
    } catch (err) {
      console.error(err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      callbacks.onError?.(errorMessage)
    } finally {
      this._streaming.delete(conversationId)
      this._conversations.delete(conversationId)
      this._app.setGeneratingMessage(conversationId, false)
      if (this._cancellables.get(conversationId) === cancellable) {
        this._cancellables.delete(conversationId)
      }
    }
  }

  private async _streamReply(
    session: GenerationSession,
    callbacks: ChatSessionCallbacks,
    request: Omit<ChatProps, 'cancellable' | 'onMessageChunk'>
  ): Promise<ChatMessage | undefined> {
    const { cancellable, conversation } = session
    let fullContent = ''
    let fullThinking = ''
    let fullToolCalls: ToolCall[] = []

    this._streaming.set(conversation.id, { role: 'assistant', content: '' })
    callbacks.onNewResponse?.()

    const response = await this._app.provider.chat({
      ...request,
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

        const partial: ChatMessage = {
          ...(chunk.message || {}),
          role: 'assistant',
          content: fullContent,
          thinking: fullThinking,
          tool_calls: fullToolCalls.length > 0 ? fullToolCalls : undefined
        }
        this._streaming.set(conversation.id, partial)
        callbacks.onMessageChunk?.(partial)
      },
      cancellable
    })

    this._streaming.delete(conversation.id)

    const message = response ?? (cancellable.is_cancelled() && (fullContent || fullThinking || fullToolCalls.length > 0)
      ? {
          role: 'assistant' as const,
          content: fullContent,
          thinking: fullThinking,
          tool_calls: fullToolCalls.length > 0 ? fullToolCalls : undefined
        }
      : undefined)
    if (message) {
      session.generated.push(message)
      conversation.messages.push(message)
      callbacks.onResponse?.(message)
    }
    return response
  }

  private async _runToolCalls(toolCalls: ToolCall[], cancellable: Gio.Cancellable, callbacks: ChatSessionCallbacks): Promise<ChatMessage[]> {
    const run = async (tc: ToolCall): Promise<ChatMessage> => {
      callbacks.onToolStart?.(tc)
      const start = GLib.get_monotonic_time()
      const result: ChatMessage = {
        role: 'tool',
        tool_name: tc.function.name,
        content: await onToolCall(this._app, tc.function.name, tc.function.arguments, cancellable) || ''
      }
      callbacks.onToolEnd?.(tc, result, (GLib.get_monotonic_time() - start) / 1000)
      return result
    }

    const names = toolCalls.map((tc) => {
      return tc.function.name
    })
    if (canRunInParallel(names)) {
      return Promise.all(toolCalls.map(run))
    }

    const results: ChatMessage[] = []
    for (const tc of toolCalls) {
      if (cancellable.is_cancelled()) {
        results.push({ role: 'tool', tool_name: tc.function.name, content: 'Error: Cancelled by user.' })
        continue
      }
      results.push(await run(tc))
    }
    return results
  }

  private async _warnMissingCapabilities(model: string, messages: ChatMessage[]): Promise<void> {
    const details = await this._app.provider.model(model).catch(() => {
      return null
    })
    if (!details) {
      return
    }
    const capabilities = details.capabilities ?? []
    const tools = getAvailableTools(this._app)
    const hasImages = messages.some((m) => {
      return (m.images?.length ?? 0) > 0
    })

    const missing: string[] = []
    if (tools.length > 0 && !capabilities.includes('tools')) {
      missing.push('tools')
    }
    if (hasImages && !capabilities.includes('vision')) {
      missing.push('vision')
    }

    for (const capability of missing) {
      const key = `${model}:${capability}`
      if (this._capabilityWarnings.has(key)) {
        continue
      }
      this._capabilityWarnings.add(key)
      this._app.showToast(capability === 'tools'
        ? `${model} does not support tools, they will not be used`
        : `${model} does not support images, they will be ignored`)
    }
  }

  private _reportContext(conversationId: number, context: ContextResult, numCtx: number): void {
    if (this._app.settings.debug) {
      debug('Context', `~${context.estimatedTokens}/${numCtx} tokens, ${context.droppedMessages} messages dropped, ${context.slimmedTurns} turns slimmed, ${context.truncatedResults} tool results truncated`)
    }
    if (context.droppedMessages > 0 && !this._trimWarnings.has(conversationId)) {
      this._trimWarnings.add(conversationId)
      this._app.showToast('Older messages were left out to fit the context window. A larger Context Window in Preferences › Advanced keeps more.')
    }
  }
}
