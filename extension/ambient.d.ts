declare module 'resource:///org/gnome/shell/extensions/extension.js' {
  import Gio from 'gi://Gio'

  export class Extension {
    uuid: string
    metadata: {
      'name': string
      'description': string
      'uuid': string
      'url': string
      'settings-schema'?: string
    }

    path: string
    getSettings(schema?: string): Gio.Settings
  }
}

declare module 'resource:///org/gnome/shell/ui/main.js' {
  import Gio from 'gi://Gio'
  import Meta from 'gi://Meta'
  import Shell from 'gi://Shell'

  export const panel: {
    addToStatusArea(role: string, indicator: unknown, position?: number, container?: unknown): unknown
  }
  export const wm: {
    addKeybinding(
      name: string,
      settings: Gio.Settings,
      flags: Meta.KeyBindingFlags,
      modes: Shell.ActionMode,
      handler: () => void
    ): number
    removeKeybinding(name: string): void
  }
}

declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
  import St from 'gi://St'
  import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'

  export class Button {
    constructor(menuAlignment: number, nameText: string, dontCreateMenu?: boolean)
    menu: PopupMenu.PopupMenu
    destroy(): void
    add_child(child: St.Widget): void
  }
}

declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
  import St from 'gi://St'

  export class PopupMenu {
    addMenuItem(menuItem: unknown, position?: number): void
    connect(signal: string, callback: (...args: unknown[]) => void): number
  }

  export class PopupMenuItem {
    constructor(text: string)
    label: St.Label
    connect(signal: string, callback: (...args: unknown[]) => void): number
  }

  export class PopupSeparatorMenuItem {
    constructor()
  }
}

declare module 'gi://Shell' {
  import Meta from 'gi://Meta'

  export enum ActionMode {
    ALL = 15
  }

  export class AppSystem {
    static get_default(): AppSystem
    lookup_app(id: string): ShellApp | null
  }

  export class ShellApp {
    get_windows(): Meta.Window[]
    activate(): void
  }
}

declare module 'gi://Meta' {

  export enum KeyBindingFlags {
    NONE = 0
  }

  export class Window {
    minimize(): void
    activate(time: number): void
  }
}

declare module 'gi://St' {
  import GObject from 'gi://GObject'

  export class Widget extends GObject.Object {}

  export class Icon extends Widget {
    constructor(params?: { icon_name?: string; gicon?: unknown; style_class?: string })
  }

  export class Label extends Widget {
    set_text(text: string): void
  }
}

declare const global: {
  display: {
    get_focus_window(): import('gi://Meta').Window | null
  }
  get_current_time(): number
}
