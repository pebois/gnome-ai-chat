import Adw from 'gi://Adw?version=1'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/app/index.js'
import { Message } from '@/app/ui/message.js'
import { ScrollManager } from '@/app/ui/scroll.js'
import { DEFAULT_LIMIT } from '@/lib/constants.js'
import type { Conversation } from '@/lib/db/types.js'
import type { OllamaMessage } from '@/lib/ollama.js'

export interface ChatConversation extends Conversation {
  messages: OllamaMessage[]
}

export interface HistoryCallbacks {
  onScroll?: () => void
  onReachTop?: () => void
  onReachBottom?: () => void
}

export class History {
  private _app: AppInterface
  private _callbacks?: HistoryCallbacks
  private _widget!: Gtk.Box
  private _banner!: Adw.Banner
  private _scrolledWindow!: Gtk.ScrolledWindow
  private _scrollManager!: ScrollManager
  private _list!: Gtk.ListBox
  private _bottomSpacer!: Gtk.Box
  private _currentOffset = 0
  private _loading = false
  private _loaded = false

  public get stickToBottom(): boolean {
    return this._scrollManager.stickToBottom
  }

  public get widget(): Gtk.Widget {
    return this._widget
  }

  public get spacer(): Gtk.Box {
    return this._bottomSpacer
  }

  constructor(app: AppInterface, callbacks?: HistoryCallbacks) {
    this._app = app
    this._callbacks = callbacks

    this._setup()
  }

  private _setup(): void {
    this._widget = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL
    })

    this._banner = new Adw.Banner({
      title: 'Older messages are available',
      button_label: 'Load More'
    })
    this._banner.connect('button-clicked', () => {
      void this.loadOlderMessages()
    })
    this._widget.append(this._banner)

    this._scrolledWindow = new Gtk.ScrolledWindow({
      vexpand: true,
      hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      propagate_natural_height: true
    })
    this._widget.append(this._scrolledWindow)

    this._scrollManager = new ScrollManager(this._scrolledWindow, {
      onScroll: () => {
        this._callbacks?.onScroll?.()
      },
      onReachTop: () => {
        this._callbacks?.onReachTop?.()
        if (!this._loaded && !this._loading) {
          this._banner.revealed = true
        }
      },
      onReachBottom: () => {
        this._callbacks?.onReachBottom?.()
      }
    })

    this._list = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.NONE,
      margin_top: 6,
      margin_bottom: 6,
      margin_start: 6,
      margin_end: 6
    })
    this._list.add_css_class('chat-history')

    const chatClamp = new Adw.Clamp({
      maximum_size: 1024,
      child: this._list
    })

    this._bottomSpacer = new Gtk.Box({
      width_request: 1
    })
    const scrolledContent = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL
    })

    scrolledContent.append(chatClamp)
    scrolledContent.append(this._bottomSpacer)

    this._scrolledWindow.set_child(scrolledContent)
  }

  public loadMessages(conversation: ChatConversation): void {
    this.clear()
    this.scrollToTop()

    const start = Math.max(0, conversation.messages.length - DEFAULT_LIMIT)
    const initialMessages = conversation.messages.slice(start)

    this._currentOffset = start
    this._loaded = start <= 0

    initialMessages.forEach((msg) => {
      this.renderMessage(msg)
    })

    if (this._loaded) {
      this._banner.revealed = false
    } else {
      const vadj = this._scrolledWindow.get_vadjustment()
      if (vadj.get_value() <= 1) {
        this._banner.revealed = true
      }
    }
  }

  public loadOlderMessages(): void {
    this._banner.revealed = false
    if (!this._app.conversation || this._loading || this._loaded) {
      return
    }
    const conversation = this._app.conversation

    if (this._currentOffset <= 0) {
      this._loaded = true
      return
    }

    this._loading = true
    this._scrolledWindow.set_kinetic_scrolling(false)

    const start = Math.max(0, this._currentOffset - DEFAULT_LIMIT)
    const end = this._currentOffset
    const oldMessages = conversation.messages.slice(start, end)

    if (oldMessages.length > 0) {
      const vadj = this._scrolledWindow.get_vadjustment()
      const oldUpper = vadj.get_upper()

      for (let i = oldMessages.length - 1; i >= 0; i--) {
        this.renderMessage(oldMessages[i], true)
      }

      this._currentOffset = start
      if (this._currentOffset <= 0) {
        this._loaded = true
      }

      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        const newUpper = vadj.get_upper()
        const diff = newUpper - oldUpper
        vadj.set_value(vadj.get_value() + diff)

        this._loading = false
        this._scrolledWindow.set_kinetic_scrolling(true)
        return GLib.SOURCE_REMOVE
      })
    } else {
      this._loading = false
      this._scrolledWindow.set_kinetic_scrolling(true)
    }
  }

  public renderMessage(message: OllamaMessage, atStart: boolean = false): Message | undefined {
    if (message.role === 'tool') {
      return undefined
    }

    const msgComponent = new Message(this._app, {
      message,
      onReload: (m) => {
        return this._app.chat.startFromMessage(m)
      },
      onCopy: () => {
        this._app.showToast('Message copied')
      }
    })

    if (atStart) {
      this._list.prepend(msgComponent.widget)
    } else {
      this._list.append(msgComponent.widget)
    }

    const row = msgComponent.widget.get_parent() as Gtk.ListBoxRow
    if (row) {
      row.activatable = false
      row.can_focus = false
      row.focus_on_click = false
    }
    return msgComponent
  }

  public scrollToTop(): void {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._scrollManager.scrollToTop()
      return GLib.SOURCE_REMOVE
    })
  }

  public scrollToBottom(smooth = true): void {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._scrollManager.scrollToBottom(smooth)
      return GLib.SOURCE_REMOVE
    })
  }

  public clear(): void {
    this._list.remove_all()
    this._banner.revealed = false
    this._loaded = true
    this._loading = false
    this._currentOffset = 0
  }
}
