import GLib from 'gi://GLib?version=2.0'

import { showMcpWindow } from '@/app/window/mcp/index.js'
import type { AppInterface } from '@/lib/app.js'
import type { Command } from '@/lib/commands/index.js'

function parseSubCommand(parameter: GLib.Variant | undefined): string {
  const text = parameter?.get_string()[0] ?? ''
  const parts = text.split(' ').filter((p) => {
    return p.length > 0
  })
  if (parts.length >= 2) {
    return parts[1].toLowerCase()
  }
  if (parts.length === 1 && !parts[0].startsWith('/') && parts[0] !== 'mcp') {
    return parts[0].toLowerCase()
  }
  return 'manage'
}

async function reload(app: AppInterface): Promise<void> {
  await app.mcp.reload()
  const enabled = app.mcp.servers.filter((s) => {
    return s.enabled
  })
  if (enabled.length === 0) {
    app.showToast('No enabled MCP servers')
    return
  }
  const connected = enabled.filter((s) => {
    return app.mcp.status.get(s.id)?.state === 'connected'
  }).length
  const failed = enabled.length - connected
  const message = `MCP: ${connected} of ${enabled.length} server${enabled.length === 1 ? '' : 's'} connected`
  if (failed > 0) {
    app.showToast(message, true, {
      label: 'Manage',
      onClick: () => {
        showMcpWindow(app)
      }
    })
  } else {
    app.showToast(message)
  }
}

export const mcp: Command = {
  name: 'mcp',
  description: 'Manage MCP servers',
  icon: 'network-server-symbolic',
  subCommands: [
    { name: 'manage', description: 'Open the MCP servers window', icon: 'network-server-symbolic' },
    { name: 'reload', description: 'Reconnect all MCP servers', icon: 'view-refresh-symbolic' }
  ],
  accels: ['<Primary><Shift>m'],
  parameterType: GLib.VariantType.new('s'),
  activate: async (app, parameter) => {
    const subCommand = parseSubCommand(parameter)
    if (subCommand === 'manage') {
      showMcpWindow(app)
    } else if (subCommand === 'reload') {
      await reload(app)
    } else {
      app.showToast(`Unknown mcp command: ${subCommand}`)
    }
  }
}
