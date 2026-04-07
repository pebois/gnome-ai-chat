import type { Command } from '@/lib/commands/index.js'

export const toggleSidebar: Command = {
  name: 'toggle-sidebar',
  description: 'Toggle sidebar visibility',
  icon: 'sidebar-show-symbolic',
  visible: false,
  accels: ['<Primary>b'],
  activate: (app) => {
    return app.toggleSidebar()
  }
}

export const search: Command = {
  name: 'search',
  description: 'Search conversations',
  icon: 'system-search-symbolic',
  visible: false,
  accels: ['<Primary>f'],
  activate: (app) => {
    app.window.showSidebar()
    app.sidebar.searchButton.active = true
    app.sidebar.searchEntry.grab_focus()
  }
}

export const focusInput: Command = {
  name: 'focus-input',
  description: 'Focus chat input',
  icon: 'insert-text-symbolic',
  visible: false,
  accels: ['<Primary>l'],
  activate: (app) => {
    return app.chat.input.grabFocus()
  }
}
