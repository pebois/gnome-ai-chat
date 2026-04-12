import Gio from 'gi://Gio'
import GioUnix from 'gi://GioUnix?version=2.0'

import type { Tool } from '@/lib/providers/index.js'

interface DesktopAppInfoProxy {
  get_display_name(): string
  get_commandline(): string | null
  list_actions(): string[]
  get_action_name(action: string): string
  launch_action(action: string, context: Gio.AppLaunchContext | null): void
}

export const list_installed_apps: Tool = {
  type: 'function',
  function: {
    name: 'list_installed_apps',
    parameters: {},
    description: 'Lists all installed desktop applications with their names and IDs. Use this before launching apps to find the correct app_id.'
  }
}

export const launch_app: Tool = {
  type: 'function',
  function: {
    name: 'launch_app',
    parameters: {
      type: 'object',
      properties: {
        app_id: {
          type: 'string',
          description: 'The desktop ID of the application to launch (e.g., "org.gnome.Calculator.desktop").'
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of arguments or files to pass to the application.'
        }
      },
      required: ['app_id']
    },
    description: 'Launches a desktop application by its ID with optional arguments. ALWAYS use list_installed_apps to find the correct app_id.'
  }
}

export const get_app_details: Tool = {
  type: 'function',
  function: {
    name: 'get_app_details',
    parameters: {
      type: 'object',
      properties: {
        app_id: {
          type: 'string',
          description: 'The desktop ID of the application (e.g., "org.gnome.Calculator.desktop").'
        }
      },
      required: ['app_id']
    },
    description: 'Retrieves details about an application, including its launch command and available desktop actions. IMPORTANT: Use this tool to discover available actions before using launch_app_action.'
  }
}

export const launch_app_action: Tool = {
  type: 'function',
  function: {
    name: 'launch_app_action',
    parameters: {
      type: 'object',
      properties: {
        app_id: {
          type: 'string',
          description: 'The desktop ID of the application.'
        },
        action_name: {
          type: 'string',
          description: 'The name of the action to launch (e.g., "new-window").'
        }
      },
      required: ['app_id', 'action_name']
    },
    description: 'Launches a specific desktop action for an application. Always verify actions with get_app_details first.'
  }
}

export function handle_list_installed_apps(): string {
  const apps = Gio.AppInfo.get_all()
  return apps.map((app) => {
    return `${app.get_display_name()} (${app.get_id()})`
  }).join('\n')
}

export function handle_launch_app(args: Record<string, unknown>): string {
  const app_id = typeof args.app_id === 'string' ? args.app_id : ''
  const launchArgs = Array.isArray(args.args)
    ? args.args.filter((a) => {
        return typeof a === 'string'
      })
    : []

  if (!app_id) {
    return 'Error: app_id is required and must be a string.'
  }

  const apps = Gio.AppInfo.get_all()
  const target = apps.find((a) => {
    return a.get_id() === app_id
  })

  if (target) {
    try {
      const files: Gio.File[] = []
      for (const arg of launchArgs) {
        if (arg.startsWith('http://') || arg.startsWith('https://')) {
          files.push(Gio.File.new_for_uri(arg))
        } else if (arg.startsWith('/')) {
          files.push(Gio.File.new_for_path(arg))
        }
      }

      const launchContext = Gio.AppLaunchContext.new()
      const success = target.launch(files.length > 0 ? files : null, launchContext)

      if (success) {
        return `Launched ${target.get_display_name()}${files.length > 0 ? ` with ${files.length} file(s)/URI(s)` : ''}`
      } else {
        return `Failed to launch ${target.get_display_name()}: Unknown error during launch.`
      }
    } catch (e) {
      return `Error launching ${target.get_display_name()}: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  return `Application with ID '${app_id}' not found.`
}

export function handle_get_app_details(args: Record<string, unknown>): string {
  const app_id = typeof args.app_id === 'string' ? args.app_id : ''
  if (!app_id) {
    return 'Error: app_id is required and must be a string.'
  }

  const appRaw = GioUnix.DesktopAppInfo.new(app_id)
  if (!appRaw) {
    return `Application with ID '${app_id}' not found.`
  }

  const app = (appRaw as unknown) as DesktopAppInfoProxy

  const details = [
    `Name: ${app.get_display_name()}`,
    `Command: ${app.get_commandline() || 'Unknown'}`
  ]

  const actions = app.list_actions()

  if (actions && actions.length > 0) {
    details.push('Actions:')
    actions.forEach((actionId) => {
      const actionName = app.get_action_name(actionId)
      details.push(`  - ${actionId} (${actionName})`)
    })
  } else {
    details.push('Actions: None')
  }

  return details.join('\n')
}

export function handle_launch_app_action(args: Record<string, unknown>): string {
  const app_id = typeof args.app_id === 'string' ? args.app_id : ''
  const action_name = typeof args.action_name === 'string' ? args.action_name : ''

  if (!app_id || !action_name) {
    return 'Error: app_id and action_name are required and must be strings.'
  }

  const appRaw = GioUnix.DesktopAppInfo.new(app_id)
  if (!appRaw) {
    return `Application with ID '${app_id}' not found.`
  }

  const app = (appRaw as unknown) as DesktopAppInfoProxy

  const actions = app.list_actions()
  if (!actions || !actions.includes(action_name)) {
    return `Action '${action_name}' not found for application '${app_id}'.`
  }

  try {
    const launchContext = Gio.AppLaunchContext.new()
    app.launch_action(action_name, launchContext)
    return `Launched action '${action_name}' for ${app.get_display_name()}`
  } catch (e) {
    return `Error launching action '${action_name}' for ${app.get_display_name()}: ${e instanceof Error ? e.message : String(e)}`
  }
}
