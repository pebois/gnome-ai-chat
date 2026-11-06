import GLib from 'gi://GLib?version=2.0'

import { compressMessages } from '@/lib/agent/compress.js'
import type { Command } from '@/lib/commands/index.js'
import { commandArguments, DEEPSEARCH_COMMAND } from '@/lib/commands/parse.js'
import { ACTION_NEW_CONVERSATION } from '@/lib/ipc.js'
import { showDestructiveConfirmation } from '@/lib/ui.js'

export const clear: Command = {
  name: 'clear',
  description: 'Clear current conversation',
  icon: 'edit-clear-all-symbolic',
  activate: (app) => {
    const count = app.conversation?.messages.length ?? 0
    if (!app.isLoaded || count === 0) {
      return
    }
    showDestructiveConfirmation(app.window, `Clear ${count} message${count === 1 ? '' : 's'}?`, 'All messages in this conversation will be deleted. This cannot be undone.', () => {
      return app.chat.clearAllMessages()
    })
  }
}

export const newConversation: Command = {
  name: ACTION_NEW_CONVERSATION,
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
  activate: (app) => {
    const conversation = app.conversation
    if (!conversation || conversation.messages.length === 0) {
      return
    }
    showDestructiveConfirmation(app.window, 'Compress conversation?', 'Thinking and tool calls are removed from every reply. Pages cited by a deep search are kept as sources. This cannot be undone.', async () => {
      conversation.messages = compressMessages(conversation.messages)
      if (!await app.persistConversation(conversation)) {
        return
      }
      app.chat.loadMessages(conversation)
      app.showToast('Conversation compressed')
    })
  }
}

export const deepsearch: Command = {
  name: DEEPSEARCH_COMMAND,
  description: 'Research a question on the web and write a cited report',
  icon: 'system-search-symbolic',
  requiresArgument: 'Type a question',
  parameterType: GLib.VariantType.new('s'),
  activate: (app, parameter) => {
    const question = commandArguments(parameter?.get_string()[0] ?? '', DEEPSEARCH_COMMAND).args
    if (question) {
      return app.chat.deepSearch(question)
    }
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
    const { sub, subArgs } = commandArguments(parameter?.get_string()[0] ?? '', 'hn')
    const subCommand = sub || 'best'
    let url = 'https://hnrss.org/best'
    if (subCommand === 'newest') {
      url = 'https://hnrss.org/newest'
    } else if (subCommand === 'custom') {
      if (!subArgs) {
        return
      }
      url = `https://hnrss.org/newest?q=${encodeURIComponent(subArgs)}`
    } else if (subCommand !== 'best') {
      app.showToast(`Unknown hn command: ${subCommand}`)
      return
    }
    const command = ['hn', subCommand, subCommand === 'custom' ? subArgs : ''].filter(Boolean).join(' ')
    return app.chat.sendPrompt(`Use fetch_rss_feed on ${url} to get the latest Hacker News headlines. Please summarize all of the headlines and present them with an informative tone.`, command)
  }
}
