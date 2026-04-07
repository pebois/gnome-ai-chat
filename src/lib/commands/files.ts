import GLib from 'gi://GLib?version=2.0'

import { showFilesDialog } from '@/app/dialog/files.js'
import type { Command } from '@/lib/commands/index.js'

export const files: Command = {
  name: 'files',
  description: 'Manage Local RAG files and folders',
  icon: 'folder-symbolic',
  subCommands: [
    { name: 'manage', description: 'Open the indexed folders management window', icon: 'preferences-system-symbolic' }
  ],
  accels: ['<Primary><Shift>f'],
  parameterType: GLib.VariantType.new('s'),
  activate: (app, parameter) => {
    let subCommand = 'manage'
    if (parameter) {
      const text = parameter.get_string()[0]
      const parts = text.split(' ')
      if (parts.length >= 2) {
        subCommand = parts[1].toLowerCase()
      } else if (parts.length === 1 && parts[0] && !parts[0].startsWith('/') && parts[0] !== 'files') {
        subCommand = parts[0].toLowerCase()
      }
    }

    if (subCommand === 'manage') {
      showFilesDialog(app)
    } else {
      app.showToast(`Unknown files command: ${subCommand}`)
    }
  }
}
