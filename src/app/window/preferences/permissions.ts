import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import type { PermissionCategory } from '@/lib/db/types.js'
import { permission_tiers } from '@/lib/db/types.js'

const PERMISSION_ROWS: { key: PermissionCategory; title: string; subtitle: string }[] = [
  { key: 'terminal', title: 'Terminal Commands', subtitle: 'Execute shell commands' },
  { key: 'files', title: 'File Edits', subtitle: 'Write or overwrite files' },
  { key: 'reads', title: 'File Reads', subtitle: 'Read files and list or search directories' },
  { key: 'apps', title: 'Applications', subtitle: 'Launch installed applications' },
  { key: 'mcp', title: 'MCP Servers', subtitle: 'Call tools exposed by external MCP servers (override per server)' }
]

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

  for (const { key, subtitle, title } of PERMISSION_ROWS) {
    const row = new Adw.ComboRow({
      title,
      subtitle,
      model: Gtk.StringList.new(['Ask', 'Auto-accept', 'Deny']),
      selected: permission_tiers.indexOf(app.settings.permissions?.[key] ?? 'ask')
    })
    row.connect('notify::selected', () => {
      app.settings.permissions[key] = permission_tiers[row.selected]
      app.saveSettings()
    })
    permissionsGroup.add(row)
  }

  return page
}
