import GLib from 'gi://GLib?version=2.0'

import type { Command } from '@/lib/commands/index.js'

export const debug: Command = {
  name: 'debug',
  description: 'Toggle debug mode',
  icon: 'bug-symbolic',
  activate: (app) => {
    return app.toggleDebug()
  }
}

export const theme: Command = {
  name: 'theme',
  description: 'Change application theme',
  icon: 'dark-mode-symbolic',
  visible: false,
  parameterType: GLib.VariantType.new('i'),
  getInitialState: (app) => {
    return GLib.Variant.new_int32(app.settings.theme)
  },
  activate: (app, parameter) => {
    if (parameter) {
      const themeValue = parameter.get_int32()
      app.setTheme(themeValue)
    }
  }
}

export const quit: Command = {
  name: 'quit',
  description: 'Exit the application',
  icon: 'application-exit-symbolic',
  accels: ['<Primary>q'],
  activate: (app) => {
    return app.handleQuit()
  }
}
