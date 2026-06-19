import GLib from 'gi://GLib?version=2.0'

import type { Command } from '@/lib/commands/index.js'
import { conversationsStore } from '@/lib/db/conversations.js'

export const clear: Command = {
  name: 'clear',
  description: 'Clear current conversation',
  icon: 'edit-clear-all-symbolic',
  activate: (app) => {
    if (!app.isLoaded) {
      return
    }
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
    if (!app.isLoaded) {
      return
    }
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
    app.ensureWindow()
    app.window.present()
    if (!app.isLoaded) {
      app.setPendingConversationId(id)
      void app.init()
    } else {
      void app.sidebar.selectConversationById(id)
    }
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
    app.saveConversations()
    app.chat.loadMessages(app.conversation)
    app.showToast('Conversation compressed')
  }
}

export const hn: Command = {
  name: 'hn',
  description: 'Get Hacker News headlines',
  icon: 'newspaper-symbolic',
  subCommands: [
    { name: 'best', description: 'Get the best stories from Hacker News', icon: 'view-paged-symbolic' },
    { name: 'newest', description: 'Get the newest stories from Hacker News', icon: 'view-list-bullet-symbolic' },
    { name: 'custom', description: 'Search Hacker News by custom query', icon: 'system-search-symbolic', requiresArgument: true }
  ],
  parameterType: GLib.VariantType.new('s'),
  activate: (app, parameter) => {
    let url = 'https://hnrss.org/best'
    let subCommand = 'best'
    let argument = ''

    if (parameter) {
      const text = parameter.get_string()[0]
      if (text) {
        const parts = text.split(' ')
        if (parts.length >= 2) {
          subCommand = parts[1].toLowerCase()
          argument = parts.slice(2).join(' ').trim()
        }
      }
    }

    if (subCommand === 'newest') {
      url = 'https://hnrss.org/newest'
    } else if (subCommand === 'custom') {
      if (!argument) {
        app.chat.input.getBuffer().set_text('', -1)
        return
      }
      url = `https://hnrss.org/newest?q=${encodeURIComponent(argument)}`
    }

    app.chat.input.getBuffer().set_text(`Use fetch_rss_feed on ${url} to get the latest Hacker News headlines. Please summarize all of the headlines and present them with an informative tone.`, -1)
    return app.chat.sendMessage()
  }
}
