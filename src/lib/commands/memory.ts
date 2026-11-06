import GLib from 'gi://GLib?version=2.0'

import type { Command } from '@/lib/commands/index.js'
import { commandArguments } from '@/lib/commands/parse.js'

export const memory: Command = {
  name: 'memory',
  description: 'Manage knowledge graph memory',
  icon: 'note-symbolic',
  subCommands: [
    { name: 'summarize', description: 'Summarize stored facts and user history', icon: 'format-justify-left-symbolic' },
    { name: 'clean', description: 'Identify and suggest deletions for redundant data', icon: 'edit-clear-symbolic' },
    { name: 'optimize', description: 'Restructure graph for better performance and clarity', icon: 'view-grid-symbolic' }
  ],
  parameterType: GLib.VariantType.new('s'),
  activate: (app, parameter) => {
    const subCommand = commandArguments(parameter?.get_string()[0] ?? '', 'memory').sub
    if (!subCommand) {
      app.showToast('Usage: /memory [summarize|clean|optimize]')
      return
    }

    let prompt: string
    switch (subCommand) {
      case 'summarize':
        prompt = '@Memory Use your memory tools to read the knowledge graph and provide a concise summary of what you know about me and our past interactions.'
        break
      case 'clean':
        prompt = '@Memory Use your memory tools to review the knowledge graph and identify any duplicate, contradictory, or outdated information. Suggest what should be deleted or corrected.'
        break
      case 'optimize':
        prompt = '@Memory Use your memory tools to optimize the knowledge graph. Look for opportunities to merge similar entities, refine relationship types to be more descriptive, and ensure observations are atomic and well-structured.'
        break
      default:
        app.showToast(`Unknown memory command: ${subCommand}`)
        return
    }

    return app.chat.sendPrompt(prompt, `memory ${subCommand}`)
  }
}
