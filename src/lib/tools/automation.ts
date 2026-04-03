import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import type { OllamaTool } from '@/lib/ollama.js'

export const run_automation_command: OllamaTool = {
  type: 'function',
  function: {
    name: 'run_automation_command',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['move', 'click', 'press', 'release', 'scroll', 'type', 'key'],
          description: 'The automation action to perform.'
        },
        x: { type: 'number', description: 'The absolute X coordinate.' },
        y: { type: 'number', description: 'The absolute Y coordinate.' },
        button: { type: 'number', description: 'Mouse button (1=left, 2=middle, 3=right).' },
        state: { type: 'number', description: 'State: 0 for released, 1 for pressed.' },
        dx: { type: 'number', description: 'Horizontal scroll amount.' },
        dy: { type: 'number', description: 'Vertical scroll amount.' },
        text: { type: 'string', description: 'Text to type.' },
        key: { type: 'string', description: 'Key name (e.g., "Enter", "a", "Escape").' }
      },
      required: ['action']
    },
    description: 'Performs Wayland desktop automation via RemoteDesktop portal.'
  }
}

let sessionHandle: string | null = null

async function callPortal(
  interfaceName: string,
  methodName: string,
  parameters: GLib.Variant,
  options: Record<string, GLib.Variant> = {}
): Promise<Record<string, GLib.Variant>> {
  const connection = Gio.DBus.session
  if (!connection) {
    throw new Error('No DBus session connection')
  }
  const token = 'gnomeaichat_' + Math.floor(Math.random() * 1000000)
  const uniqueName = (connection.get_unique_name() ?? 'unknown').replace(/\./g, '_').replace(':', '')
  const requestPath = `/org/freedesktop/portal/desktop/request/${uniqueName}/${token}`

  options['handle_token'] = GLib.Variant.new_string(token)

  return new Promise((resolve, reject) => {
    const signalId = connection.signal_subscribe(
      'org.freedesktop.portal.Desktop',
      'org.freedesktop.portal.Request',
      'Response',
      requestPath,
      null,
      Gio.DBusSignalFlags.NONE,
      (conn, sender, path, iface, signal, params) => {
        connection.signal_unsubscribe(signalId)
        const [response, results] = params.deepUnpack() as [number, Record<string, GLib.Variant>]
        if (response === 0) {
          resolve(results)
        } else if (response === 1) {
          reject(new Error('Portal request cancelled by user'))
        } else {
          reject(new Error(`Portal request failed with response code ${response}`))
        }
      }
    )

    connection.call(
      'org.freedesktop.portal.Desktop',
      '/org/freedesktop/portal/desktop',
      interfaceName,
      methodName,
      GLib.Variant.new('(' + parameters.get_type_string() + 'a{sv})', [parameters, options]),
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
      (source, res) => {
        try {
          connection.call_finish(res)
        } catch (e) {
          connection.signal_unsubscribe(signalId)
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      }
    )
  })
}

async function ensureSession(): Promise<string> {
  if (sessionHandle) {
    return sessionHandle
  }

  const createResults = await callPortal(
    'org.freedesktop.portal.RemoteDesktop',
    'CreateSession',
    GLib.Variant.new_array(new GLib.VariantType('{sv}'), []),
    { session_handle_token: GLib.Variant.new_string('gnomeaichat_rd') }
  )
  sessionHandle = (createResults['session_handle']).get_string()[0]

  await callPortal(
    'org.freedesktop.portal.RemoteDesktop',
    'SelectDevices',
    GLib.Variant.new_string(sessionHandle),
    { types: GLib.Variant.new_uint32(7) }
  )

  await callPortal(
    'org.freedesktop.portal.ScreenCast',
    'SelectSources',
    GLib.Variant.new_string(sessionHandle),
    { types: GLib.Variant.new_uint32(1), multiple: GLib.Variant.new_boolean(false) }
  )

  await callPortal(
    'org.freedesktop.portal.RemoteDesktop',
    'Start',
    GLib.Variant.new('(ss)', [sessionHandle, '']),
    {}
  )

  return sessionHandle
}

export async function handle_run_automation_command(args: Record<string, unknown>): Promise<string> {
  try {
    const session = await ensureSession()
    const action = args.action as string
    const connection = Gio.DBus.session
    if (!connection) {
      throw new Error('No DBus session connection')
    }

    if (action === 'move') {
      const x = args.x as number ?? 0
      const y = args.y as number ?? 0
      connection.call(
        'org.freedesktop.portal.Desktop',
        '/org/freedesktop/portal/desktop',
        'org.freedesktop.portal.RemoteDesktop',
        'NotifyPointerMotion',
        GLib.Variant.new('(oa{sv}dd)', [session, {}, x, y]),
        null, Gio.DBusCallFlags.NONE, -1, null, null
      )
    } else if (action === 'click') {
      const button = args.button as number ?? 1
      connection.call(
        'org.freedesktop.portal.Desktop',
        '/org/freedesktop/portal/desktop',
        'org.freedesktop.portal.RemoteDesktop',
        'NotifyPointerButton',
        GLib.Variant.new('(oa{sv}iu)', [session, {}, button, 1]),
        null, Gio.DBusCallFlags.NONE, -1, null, null
      )
      await new Promise((r) => {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
          r(null)
          return false
        })
      })
      connection.call(
        'org.freedesktop.portal.Desktop',
        '/org/freedesktop/portal/desktop',
        'org.freedesktop.portal.RemoteDesktop',
        'NotifyPointerButton',
        GLib.Variant.new('(oa{sv}iu)', [session, {}, button, 0]),
        null, Gio.DBusCallFlags.NONE, -1, null, null
      )
    } else if (action === 'press' || action === 'release') {
      const button = args.button as number ?? 1
      const state = action === 'press' ? 1 : 0
      connection.call(
        'org.freedesktop.portal.Desktop',
        '/org/freedesktop/portal/desktop',
        'org.freedesktop.portal.RemoteDesktop',
        'NotifyPointerButton',
        GLib.Variant.new('(oa{sv}iu)', [session, {}, button, state]),
        null, Gio.DBusCallFlags.NONE, -1, null, null
      )
    } else if (action === 'scroll') {
      const dx = args.dx as number ?? 0
      const dy = args.dy as number ?? 0
      connection.call(
        'org.freedesktop.portal.Desktop',
        '/org/freedesktop/portal/desktop',
        'org.freedesktop.portal.RemoteDesktop',
        'NotifyPointerAxis',
        GLib.Variant.new('(oa{sv}dd)', [session, {}, dx, dy]),
        null, Gio.DBusCallFlags.NONE, -1, null, null
      )
    } else if (action === 'key') {
      const keyName = args.key as string
      const state = args.state as number ?? 1
      const keysym = Gdk.keyval_from_name(keyName)
      if (keysym === 0) {
        return `Error: Unknown key ${keyName}`
      }
      connection.call(
        'org.freedesktop.portal.Desktop',
        '/org/freedesktop/portal/desktop',
        'org.freedesktop.portal.RemoteDesktop',
        'NotifyKeyboardKeysym',
        GLib.Variant.new('(oa{sv}iu)', [session, {}, keysym, state]),
        null, Gio.DBusCallFlags.NONE, -1, null, null
      )
    } else if (action === 'type') {
      const text = args.text as string
      for (const char of text) {
        const keysym = Gdk.unicode_to_keyval(char.charCodeAt(0))
        connection.call(
          'org.freedesktop.portal.Desktop',
          '/org/freedesktop/portal/desktop',
          'org.freedesktop.portal.RemoteDesktop',
          'NotifyKeyboardKeysym',
          GLib.Variant.new('(oa{sv}iu)', [session, {}, keysym, 1]),
          null, Gio.DBusCallFlags.NONE, -1, null, null
        )
        connection.call(
          'org.freedesktop.portal.Desktop',
          '/org/freedesktop/portal/desktop',
          'org.freedesktop.portal.RemoteDesktop',
          'NotifyKeyboardKeysym',
          GLib.Variant.new('(oa{sv}iu)', [session, {}, keysym, 0]),
          null, Gio.DBusCallFlags.NONE, -1, null, null
        )
      }
    }

    return 'Action executed successfully.'
  } catch (err) {
    return `Error starting automation session: ${err instanceof Error ? err.message : String(err)}`
  }
}
