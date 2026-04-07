import GLib from 'gi://GLib?version=2.0'

import type { Command } from '@/lib/commands/index.js'
import { conversationsStore } from '@/lib/db/conversations.js'

export const clear: Command = {
  name: 'clear',
  description: 'Clear current conversation',
  icon: 'edit-clear-all-symbolic',
  activate: (app) => {
    app.chat.clearAllMessages()
  }
}

export const newConversation: Command = {
  name: 'new-conversation',
  description: 'Start a new conversation',
  icon: 'list-add-symbolic',
  visible: false,
  accels: ['<Primary>n'],
  activate: (app) => {
    return app.sidebar.createNewConversation()
  }
}

export const openConversation: Command = {
  name: 'open-conversation',
  description: 'Open a specific conversation',
  icon: 'document-open-symbolic',
  visible: false,
  parameterType: GLib.VariantType.new('s'),
  activate: (app, parameter) => {
    if (!parameter) {
      return
    }
    const idStr = parameter.get_string()[0]
    const id = parseInt(idStr, 10)
    void app.sidebar.selectConversationById(id)
    app.window.present()
  }
}

export const compress: Command = {
  name: 'compress',
  description: 'Strip think and tools from conversation',
  icon: 'package-x-generic-symbolic',
  activate: async (app) => {
    if (!app.conversation) {
      return
    }

    const compressedMessages = app.conversation.messages
      .filter((msg) => {
        return msg.role !== 'tool'
      })
      .map((msg) => {
        if (msg.role === 'assistant') {
          const { thinking: _, tool_calls: __, ...rest } = msg
          return rest
        }
        return msg
      })

    app.conversation.messages = compressedMessages
    await conversationsStore.saveMessages(app.conversation.id, compressedMessages)
    app.conversation.updated_at = new Date().toISOString()
    const conv = app.conversations.find((c) => {
      return c.id === app.conversation?.id
    })
    if (conv) {
      conv.updated_at = app.conversation.updated_at
      app.sidebar.updateConversation(conv)
    }
    await conversationsStore.saveConversations(app.conversations)
    app.chat.loadMessages(app.conversation)
    app.showToast('Conversation compressed')
  }
}

export const hn: Command = {
  name: 'hn',
  description: 'Get Hacker News headlines',
  icon: 'newspaper-symbolic',
  activate: (app) => {
    app.chat.input.getBuffer().set_text('http get https://hnrss.org/best list headlines', -1)
    void app.chat.sendMessage()
  }
}
