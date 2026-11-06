import Adw from 'gi://Adw?version=1'

import type { AppInterface } from '@/lib/app.js'
import { COMMANDS } from '@/lib/commands/index.js'
import { ACTION_NEW_CONVERSATION, ACTION_QUIT } from '@/lib/ipc.js'

const SECTIONS: { title: string; commands: string[] }[] = [
  { title: 'App', commands: ['settings', 'skills', 'mcp', 'shortcuts', 'files', 'ps', 'pull', 'stats', ACTION_QUIT] },
  { title: 'Chat history', commands: [ACTION_NEW_CONVERSATION, 'search', 'find-in-chat', 'toggle-sidebar'] },
  { title: 'Chat input', commands: ['focus-input'] }
]

const EXTRA_INPUT_SHORTCUTS = [{ title: 'Emojis', accelerator: '<Primary>semicolon' }]

export function showShortcutsDialog(app: AppInterface): void {
  const shortcutsWin = new Adw.ShortcutsDialog()
  const listed = new Set(SECTIONS.flatMap((section) => {
    return section.commands
  }))
  const unlisted = COMMANDS.filter((cmd) => {
    return cmd.accels?.length && !listed.has(cmd.name)
  }).map((cmd) => {
    return cmd.name
  })

  SECTIONS.forEach((section, i) => {
    const group = new Adw.ShortcutsSection({ title: section.title })
    const names = i === 0 ? [...section.commands, ...unlisted] : section.commands
    for (const name of names) {
      const cmd = COMMANDS.find((c) => {
        return c.name === name
      })
      if (cmd?.accels?.length) {
        group.add(new Adw.ShortcutsItem({ title: cmd.description, accelerator: cmd.accels[0] }))
      }
    }
    if (section.title === 'Chat input') {
      for (const item of EXTRA_INPUT_SHORTCUTS) {
        group.add(new Adw.ShortcutsItem(item))
      }
    }
    shortcutsWin.add(group)
  })

  shortcutsWin.present(app.window)
}
