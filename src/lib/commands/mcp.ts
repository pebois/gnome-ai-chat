import GLib from 'gi://GLib?version=2.0'

import { showManageWindow } from '@/app/window/manage/index.js'
import type { AppInterface } from '@/lib/app.js'
import type { Command } from '@/lib/commands/index.js'
import { commandArguments } from '@/lib/commands/parse.js'

function parseSubCommand(parameter: GLib.Variant | undefined): string {
  return commandArguments(parameter?.get_string()[0] ?? '', 'mcp').sub || 'manage'
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
        showManageWindow(app, { section: 'mcp' })
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
      showManageWindow(app, { section: 'mcp' })
    } else if (subCommand === 'reload') {
      await reload(app)
    } else {
      app.showToast(`Unknown mcp command: ${subCommand}`)
    }
  }
}
