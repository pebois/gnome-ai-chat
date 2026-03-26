import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

export async function takeScreenshot(): Promise<Gio.File | null> {
  const connection = Gio.DBus.session
  return new Promise((resolve, reject) => {
    let signalId = 0

    try {
      const uniqueName = connection.get_unique_name()
      if (!uniqueName) {
        throw new Error('No unique DBus name available')
      }

      const token = 'gnomeaichat_' + new Date().getTime()
      const sender = uniqueName.replace(/\./g, '_').replace(':', '')
      const requestPath = `/org/freedesktop/portal/desktop/request/${sender}/${token}`

      const cleanup = () => {
        if (signalId !== 0) {
          connection.signal_unsubscribe(signalId)
          signalId = 0
        }
      }

      signalId = connection.signal_subscribe(
        'org.freedesktop.portal.Desktop',
        'org.freedesktop.portal.Request',
        'Response',
        requestPath,
        null,
        Gio.DBusSignalFlags.NONE,
        (conn, senderName, objectPath, interfaceName, signalName, parameters) => {
          cleanup()
          const [responseCode, results] = parameters.deepUnpack() as [number, Record<string, GLib.Variant>]
          if (responseCode === 0 && results.uri) {
            const uriStr = results.uri.get_string()[0]
            resolve(Gio.File.new_for_uri(uriStr))
          } else {
            resolve(null)
          }
        }
      )

      connection.call(
        'org.freedesktop.portal.Desktop',
        '/org/freedesktop/portal/desktop',
        'org.freedesktop.portal.Screenshot',
        'Screenshot',
        GLib.Variant.new('(sa{sv})', ['', { interactive: GLib.Variant.new_boolean(true), handle_token: GLib.Variant.new_string(token) }]),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (source, res) => {
          try {
            connection.call_finish(res)
          } catch (e) {
            cleanup()
            reject(e instanceof Error ? e : new Error(String(e)))
          }
        }
      )
    } catch (e) {
      if (signalId !== 0) {
        connection.signal_unsubscribe(signalId)
      }
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}
