import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { permission_tiers } from '@/lib/db/types.js'

export function createPermissionsPage(app: AppInterface): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Permissions',
    icon_name: 'security-high-symbolic'
  })

  const permissionsGroup = new Adw.PreferencesGroup({
    title: 'Tool Permissions',
    description: 'Require permission before executing potentially destructive actions.'
  })
  page.add(permissionsGroup)

  const terminalRow = new Adw.ComboRow({
    title: 'Terminal Commands',
    model: Gtk.StringList.new(['Ask', 'Auto-accept']),
    selected: permission_tiers.indexOf(app.settings.permissions?.terminal ?? 'ask')
  })
  terminalRow.connect('notify::selected', () => {
    const val = permission_tiers[terminalRow.selected]
    app.settings.permissions.terminal = val
    app.saveSettings()
  })
  permissionsGroup.add(terminalRow)

  const filesRow = new Adw.ComboRow({
    title: 'File Edits',
    model: Gtk.StringList.new(['Ask', 'Auto-accept']),
    selected: permission_tiers.indexOf(app.settings.permissions?.files ?? 'ask')
  })
  filesRow.connect('notify::selected', () => {
    const val = permission_tiers[filesRow.selected]
    app.settings.permissions.files = val
    app.saveSettings()
  })
  permissionsGroup.add(filesRow)

  return page
}
