import Gio from 'gi://Gio'
import Meta from 'gi://Meta'
import Shell from 'gi://Shell'
import St from 'gi://St'
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'

import { ACTION_NEW_CONVERSATION, ACTION_QUIT, DBUS_BUS_NAME, DBUS_OBJECT_PATH, DESKTOP_ID } from '@/lib/ipc.js'

export default class GnomeAiChatExtension extends Extension {
  private _settings: Gio.Settings | null = null
  private _indicator: PanelMenu.Button | null = null
  private _showHideItem: PopupMenu.PopupMenuItem | null = null

  public enable(): void {
    this._settings = this.getSettings()

    this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false)

    const icon = new St.Icon({
      icon_name: 'chat-message-new-symbolic',
      style_class: 'system-status-icon'
    })
    this._indicator.add_child(icon)

    this._setupMenu()

    Main.panel.addToStatusArea(this.uuid, this._indicator)

    this._bindShortcut()
  }

  public disable(): void {
    this._unbindShortcut()

    if (this._indicator) {
      this._indicator.destroy()
      this._indicator = null
    }

    this._settings = null
    this._showHideItem = null
  }

  private _setupMenu(): void {
    if (!this._indicator) {
      return
    }

    this._showHideItem = new PopupMenu.PopupMenuItem('Show Chat')
    this._showHideItem.connect('activate', () => {
      this._toggleAppWindow()
    })
    this._indicator.menu.addMenuItem(this._showHideItem)

    const newConvItem = new PopupMenu.PopupMenuItem('New Conversation')
    newConvItem.connect('activate', () => {
      this._newConversation()
    })
    this._indicator.menu.addMenuItem(newConvItem)

    this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

    const quitItem = new PopupMenu.PopupMenuItem('Quit')
    quitItem.connect('activate', () => {
      this._quitApp()
    })
    this._indicator.menu.addMenuItem(quitItem)

    this._indicator.menu.connect('open-state-changed', (_menu, open) => {
      if (open) {
        this._updateMenuLabel()
      }
    })
  }

  private _getApp(): Shell.ShellApp | null {
    return Shell.AppSystem.get_default().lookup_app(DESKTOP_ID)
  }

  private _getAppWindows(): Meta.Window[] {
    const app = this._getApp()
    return app ? app.get_windows() : []
  }

  private _updateMenuLabel(): void {
    if (!this._showHideItem) {
      return
    }

    const windows = this._getAppWindows()
    if (windows.length === 0) {
      this._showHideItem.label.set_text('Show Chat')
    } else {
      const focusWindow = global.display.get_focus_window()
      const isFocused = windows.some((w) => {
        return w === focusWindow
      })
      this._showHideItem.label.set_text(isFocused ? 'Hide Chat' : 'Show Chat')
    }
  }

  private _toggleAppWindow(): void {
    const app = this._getApp()
    if (!app) {
      this._newConversation()
      return
    }

    const windows = app.get_windows()
    if (windows.length === 0) {
      app.activate()
    } else {
      const focusWindow = global.display.get_focus_window()
      const isFocused = windows.some((w) => {
        return w === focusWindow
      })
      if (isFocused && focusWindow) {
        focusWindow.minimize()
      } else {
        windows[0].activate(global.get_current_time())
      }
    }
  }

  private _newConversation(): void {
    const actionGroup = Gio.DBusActionGroup.get(
      Gio.DBus.session,
      DBUS_BUS_NAME,
      DBUS_OBJECT_PATH
    )
    actionGroup.activate_action(ACTION_NEW_CONVERSATION, null)

    const app = this._getApp()
    if (app && app.get_windows().length > 0) {
      app.get_windows()[0].activate(global.get_current_time())
    }
  }

  private _quitApp(): void {
    const actionGroup = Gio.DBusActionGroup.get(
      Gio.DBus.session,
      DBUS_BUS_NAME,
      DBUS_OBJECT_PATH
    )
    actionGroup.activate_action(ACTION_QUIT, null)
  }

  private _bindShortcut(): void {
    if (!this._settings) {
      return
    }

    Main.wm.addKeybinding(
      'toggle-shortcut',
      this._settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.ALL,
      () => {
        this._toggleAppWindow()
      }
    )
  }

  private _unbindShortcut(): void {
    Main.wm.removeKeybinding('toggle-shortcut')
  }
}
