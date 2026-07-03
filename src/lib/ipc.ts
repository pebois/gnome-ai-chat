export const DBUS_BUS_NAME = 'io.github.pebois.gnome-ai-chat'

export const DBUS_OBJECT_PATH = `/${DBUS_BUS_NAME.replace(/\./g, '/').replace(/-/g, '_')}`

export const DESKTOP_ID = `${DBUS_BUS_NAME}.desktop`

export const ACTION_NEW_CONVERSATION = 'new-conversation'

export const ACTION_QUIT = 'quit'
