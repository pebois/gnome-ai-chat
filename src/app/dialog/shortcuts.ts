import Adw from 'gi://Adw?version=1'

import type { AppInterface } from '@/app/index.js'

export function showShortcutsDialog(app: AppInterface): void {
  const shortcutsWin = new Adw.ShortcutsDialog()

  const sectionApp = new Adw.ShortcutsSection({
    title: 'App'
  })
  sectionApp.add(new Adw.ShortcutsItem({
    title: 'Settings',
    accelerator: '<Primary>comma'
  }))
  sectionApp.add(new Adw.ShortcutsItem({
    title: 'Skills Editor',
    accelerator: '<Primary><Shift>s'
  }))
  sectionApp.add(new Adw.ShortcutsItem({
    title: 'Shortcuts',
    accelerator: '<Primary>question'
  }))
  sectionApp.add(new Adw.ShortcutsItem({
    title: 'Indexed Folders',
    accelerator: '<Primary><Shift>f'
  }))
  sectionApp.add(new Adw.ShortcutsItem({
    title: 'Running Models',
    accelerator: '<Primary>p'
  }))
  sectionApp.add(new Adw.ShortcutsItem({
    title: 'Performance Stats',
    accelerator: '<Primary>i'
  }))
  sectionApp.add(new Adw.ShortcutsItem({
    title: 'Quit',
    accelerator: '<Primary>q'
  }))
  shortcutsWin.add(sectionApp)

  const sectionHistory = new Adw.ShortcutsSection({
    title: 'Chat history'
  })
  sectionHistory.add(new Adw.ShortcutsItem({
    title: 'New Chat',
    accelerator: '<Primary>n'
  }))
  sectionHistory.add(new Adw.ShortcutsItem({
    title: 'Search',
    accelerator: '<Primary>f'
  }))
  sectionHistory.add(new Adw.ShortcutsItem({
    title: 'Toggle Sidebar',
    accelerator: '<Primary>b'
  }))
  shortcutsWin.add(sectionHistory)

  const sectionInput = new Adw.ShortcutsSection({
    title: 'Chat input'
  })
  sectionInput.add(new Adw.ShortcutsItem({
    title: 'Focus Input',
    accelerator: '<Primary>l'
  }))
  sectionInput.add(new Adw.ShortcutsItem({
    title: 'Emojis',
    accelerator: '<Primary>semicolon'
  }))
  shortcutsWin.add(sectionInput)

  shortcutsWin.present(app.window)
}
