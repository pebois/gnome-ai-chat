import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import { Message } from '@/app/ui/message/index.js'
import { ScrollManager } from '@/app/ui/scroll.js'
import type { AppInterface } from '@/lib/app.js'
import { CONVERSATION_MAX_WIDTH, DEFAULT_LIMIT } from '@/lib/constants.js'
import type { Conversation } from '@/lib/db/types.js'
import { findMessageMatches, stepMatch } from '@/lib/find.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { collectSources } from '@/lib/sources.js'

export interface ChatConversation extends Conversation {
  messages: ChatMessage[]
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
  private _messages: Message[] = []
  private _streaming?: Message
  private _scrolledContent!: Gtk.Box
  private _findBar!: Gtk.SearchBar
  private _findEntry!: Gtk.SearchEntry
  private _findLabel!: Gtk.Label
  private _findButtons!: Gtk.Box
  private _findOccurrences: { message: Message; local: number }[] = []
  private _findIndex = -1
  private _findCurrent?: Message

  public get stickToBottom(): boolean {
    return this._scrollManager.stickToBottom
  }

  public get widget(): Gtk.Widget {
    return this._widget
  }

  public get spacer(): Gtk.Box {
    return this._bottomSpacer
  }

  public get findBar(): Gtk.SearchBar {
    return this._findBar
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
    this._setupFind()

    this._banner = new Adw.Banner({
      title: 'Older messages are available',
      button_label: 'Load More'
    })
    this._banner.connect('button-clicked', () => {
      void this.loadOlderMessages()
    })
    this._widget.append(this._banner)

    const styleManager = Adw.StyleManager.get_default()
    const refresh = (): void => {
      if (this._findQuery) {
        for (const message of this._messages) {
          message.refreshSearch()
        }
      }
    }
    styleManager.connect('notify::accent-color-rgba', refresh)
    styleManager.connect('notify::dark', refresh)

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
      maximum_size: CONVERSATION_MAX_WIDTH,
      child: this._list
    })

    this._bottomSpacer = new Gtk.Box({
      width_request: 1
    })
    this._scrolledContent = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL
    })

    this._scrolledContent.append(chatClamp)
    this._scrolledContent.append(this._bottomSpacer)

    this._scrolledWindow.set_child(this._scrolledContent)
  }

  private _setupFind(): void {
    this._findEntry = new Gtk.SearchEntry({
      placeholder_text: 'Search in conversation'
    })
    this._findLabel = new Gtk.Label({
      halign: Gtk.Align.END,
      valign: Gtk.Align.CENTER,
      can_target: false,
      margin_end: 30
    })
    this._findLabel.add_css_class('dim-label')
    this._findLabel.add_css_class('numeric')
    this._findLabel.add_css_class('find-count')

    const entryOverlay = new Gtk.Overlay({
      child: this._findEntry,
      hexpand: true
    })
    entryOverlay.add_overlay(this._findLabel)

    const prevButton = new Gtk.Button({
      icon_name: 'go-up-symbolic',
      tooltip_text: 'Previous Match (shift+enter)',
      valign: Gtk.Align.CENTER
    })
    prevButton.add_css_class('flat')
    prevButton.connect('clicked', () => {
      this.findStep(-1)
    })
    const nextButton = new Gtk.Button({
      icon_name: 'go-down-symbolic',
      tooltip_text: 'Next Match (enter)',
      valign: Gtk.Align.CENTER
    })
    nextButton.add_css_class('flat')
    nextButton.connect('clicked', () => {
      this.findStep(1)
    })

    this._findButtons = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 2,
      valign: Gtk.Align.CENTER,
      visible: false
    })
    this._findButtons.append(prevButton)
    this._findButtons.append(nextButton)

    const box = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      margin_start: 12,
      margin_end: 12
    })
    box.append(entryOverlay)
    box.append(this._findButtons)

    const clamp = new Adw.Clamp({
      maximum_size: CONVERSATION_MAX_WIDTH,
      child: box,
      hexpand: true
    })

    this._findBar = new Gtk.SearchBar({
      child: clamp
    })
    this._findBar.add_css_class('searchbar')
    this._findBar.add_css_class('find-bar')
    this._findBar.connect_entry(this._findEntry)
    this._findBar.connect('notify::search-mode-enabled', () => {
      if (!this._findBar.search_mode_enabled) {
        this._findEntry.set_text('')
        this._resetFind()
      }
    })
    this._findEntry.connect('search-changed', () => {
      this._runFind()
    })
    this._findEntry.connect('activate', () => {
      this.findStep(1)
    })
    this._findEntry.connect('next-match', () => {
      this.findStep(1)
    })
    this._findEntry.connect('previous-match', () => {
      this.findStep(-1)
    })
    const keys = new Gtk.EventControllerKey()
    keys.connect('key-pressed', (_ctrl: Gtk.EventControllerKey, keyval: number, _code: number, state: Gdk.ModifierType) => {
      if ((keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) && (state & Gdk.ModifierType.SHIFT_MASK)) {
        this.findStep(-1)
        return true
      }
      return false
    })
    this._findEntry.add_controller(keys)
    this._widget.append(this._findBar)
  }

  public openFind(): void {
    this._findBar.search_mode_enabled = true
    this._findEntry.grab_focus()
    this._findEntry.select_region(0, -1)
  }

  public findStep(direction: 1 | -1): void {
    if (this._findOccurrences.length === 0) {
      return
    }
    this._findIndex = stepMatch(this._findIndex, this._findOccurrences.length, direction)
    this._showMatch()
  }

  private get _findQuery(): string | null {
    return this._findBar.search_mode_enabled ? this._findEntry.get_text().trim() || null : null
  }

  private _runFind(): void {
    const query = this._findQuery
    this._resetFind()
    if (!query) {
      return
    }
    const matches = findMessageMatches(this._app.conversation?.messages ?? [], query)
    if (matches.length > 0) {
      this._renderFrom(matches[0])
    }
    for (const message of this._messages) {
      const count = message.setSearch(query)
      for (let local = 0; local < count; local++) {
        this._findOccurrences.push({ message, local })
      }
    }
    this._findButtons.set_visible(true)
    if (this._findOccurrences.length === 0) {
      this._findLabel.set_label('No matches')
      return
    }
    this._findIndex = this._findOccurrences.length - 1
    this._showMatch()
  }

  private _resetFind(): void {
    this._findCurrent?.setCurrentOccurrence(-1)
    this._findCurrent = undefined
    this._findOccurrences = []
    this._findIndex = -1
    this._findLabel.set_label('')
    this._findButtons.set_visible(false)
    for (const message of this._messages) {
      message.setSearch(null)
    }
  }

  private _showMatch(): void {
    const occurrence = this._findOccurrences[this._findIndex]
    if (!occurrence) {
      return
    }
    this._findLabel.set_label(`${this._findIndex + 1} of ${this._findOccurrences.length}`)
    if (this._findCurrent !== occurrence.message) {
      this._findCurrent?.setCurrentOccurrence(-1)
    }
    this._findCurrent = occurrence.message
    occurrence.message.setCurrentOccurrence(occurrence.local)
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      const y = occurrence.message.occurrenceY(occurrence.local, this._scrolledContent)
      if (y !== null) {
        const vadj = this._scrolledWindow.get_vadjustment()
        vadj.set_value(Math.max(0, y - vadj.get_page_size() / 3))
      }
      return GLib.SOURCE_REMOVE
    })
  }

  private _renderFrom(index: number): void {
    const conversation = this._app.conversation
    if (!conversation || index >= this._currentOffset) {
      return
    }
    const older = conversation.messages.slice(index, this._currentOffset)
    for (let i = older.length - 1; i >= 0; i--) {
      this.renderMessage(older[i], true)
    }
    this._currentOffset = index
    this._loaded = index <= 0
    this._banner.revealed = false
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

  public beginStreaming(message?: ChatMessage): void {
    this.endStreaming()
    this._streaming = this.renderMessage(message ?? { role: 'assistant', content: '' }, false, true)
  }

  public updateStreaming(message: ChatMessage): void {
    this._streaming?.update(message)
  }

  public commitStreaming(message: ChatMessage): void {
    if (!this._streaming) {
      return
    }
    this._streaming.update(message)
    this._streaming.setPending(false)
    this._applySources(this._streaming, message)
    this._streaming = undefined
  }

  public endStreaming(): void {
    const streaming = this._streaming
    this._streaming = undefined
    if (!streaming) {
      return
    }
    if (streaming.isEmpty) {
      this._removeMessage(streaming)
    } else {
      streaming.setPending(false)
    }
  }

  public toolStarted(call: ToolCall): void {
    for (const message of this._messages) {
      const row = message.toolRow(call)
      if (row) {
        message.expandToolCalls()
        row.setRunning()
        return
      }
    }
  }

  public toolFinished(call: ToolCall, result: ChatMessage, durationMs: number): void {
    for (const message of this._messages) {
      const row = message.toolRow(call)
      if (row) {
        row.setResult(result, durationMs)
        return
      }
    }
  }

  public updateLive(message: ChatMessage): void {
    const component = this._messages.find((m) => {
      return m.message === message
    })
    if (component) {
      component.update(message)
    } else {
      this.renderMessage(message)
    }
  }

  private _applySources(component: Message, message: ChatMessage): void {
    const messages = this._app.conversation?.messages ?? []
    const index = messages.indexOf(message)
    if (index !== -1) {
      component.setSources(collectSources(messages, index))
    }
  }

  private _disableRow(widget: Gtk.Widget): void {
    const row = widget.get_parent() as Gtk.ListBoxRow | null
    if (row) {
      row.activatable = false
      row.can_focus = false
      row.focus_on_click = false
    }
  }

  private _removeMessage(message: Message): void {
    const index = this._messages.indexOf(message)
    if (index !== -1) {
      this._messages.splice(index, 1)
    }
    message.destroy()
    const row = message.widget.get_parent()
    if (row) {
      this._list.remove(row)
    }
  }

  public renderMessage(message: ChatMessage, atStart: boolean = false, pending: boolean = false): Message | undefined {
    if (message.role === 'tool') {
      return undefined
    }

    const msgComponent = new Message(this._app, {
      message,
      pending,
      onReload: (m) => {
        return this._app.chat.startFromMessage(m)
      },
      onRegenerate: (m) => {
        return this._app.chat.regenerateFromMessage(m)
      },
      onCopy: () => {
        this._app.showToast('Message copied')
      }
    })

    if (atStart) {
      this._list.prepend(msgComponent.widget)
      this._messages.unshift(msgComponent)
    } else {
      this._list.append(msgComponent.widget)
      this._messages.push(msgComponent)
    }

    this._disableRow(msgComponent.widget)
    if (!pending) {
      this._applySources(msgComponent, message)
    }
    const query = this._findQuery
    if (query) {
      msgComponent.setSearch(query)
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
    this._messages.forEach((m) => {
      m.destroy()
    })
    this._messages = []
    this._findCurrent = undefined
    this._findBar.search_mode_enabled = false
    this._streaming = undefined
    this._list.remove_all()
    this._banner.revealed = false
    this._loaded = true
    this._loading = false
    this._currentOffset = 0
  }
}
