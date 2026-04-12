import { showRunningModelsDialog } from '@/app/dialog/ps.js'
import { showPullDialog } from '@/app/dialog/pull.js'
import { showShortcutsDialog } from '@/app/dialog/shortcuts.js'
import { showStatsDialog } from '@/app/dialog/stats.js'
import { showAboutWindow } from '@/app/window/about.js'
import { showPreferencesWindow } from '@/app/window/preferences/index.js'
import { showSkillsWindow } from '@/app/window/skills/index.js'
import type { Command } from '@/lib/commands/index.js'

export const settings: Command = {
  name: 'settings',
  description: 'Open preferences',
  icon: 'preferences-system-symbolic',
  accels: ['<Primary>comma'],
  activate: (app) => {
    return showPreferencesWindow(app)
  }
}

export const shortcuts: Command = {
  name: 'shortcuts',
  description: 'Open keyboard shortcuts',
  icon: 'preferences-desktop-keyboard-shortcuts-symbolic',
  accels: ['<Primary>question'],
  activate: (app) => {
    return showShortcutsDialog(app)
  }
}

export const ps: Command = {
  name: 'ps',
  description: 'Show running models',
  icon: 'processor-symbolic',
  accels: ['<Primary>p'],
  activate: (app) => {
    return showRunningModelsDialog(app)
  }
}

export const pull: Command = {
  name: 'pull',
  description: 'Pull a new model',
  icon: 'folder-download-symbolic',
  accels: ['<Primary>j'],
  activate: (app) => {
    return showPullDialog(app)
  }
}

export const stats: Command = {
  name: 'stats',
  description: 'Open performance statistics',
  icon: 'resources-symbolic',
  accels: ['<Primary>i'],
  activate: (app) => {
    return showStatsDialog(app)
  }
}

export const skills: Command = {
  name: 'skills',
  description: 'Open skills editor',
  icon: 'avatar-default-symbolic',
  accels: ['<Primary><Shift>s'],
  activate: (app) => {
    return showSkillsWindow(app)
  }
}

export const about: Command = {
  name: 'about',
  description: 'Show about dialog',
  icon: 'help-about-symbolic',
  activate: (app) => {
    return showAboutWindow(app)
  }
}
