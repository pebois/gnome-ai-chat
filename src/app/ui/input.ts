import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import GLib from 'gi://GLib?version=2.0'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import { Attachments } from '@/app/ui/attachments.js'
import { Commands } from '@/app/ui/commands.js'
import { Models } from '@/app/ui/models.js'
import { SkillPicker } from '@/app/ui/skillpicker.js'
import { Skills } from '@/app/ui/skills.js'
import type { AppInterface } from '@/lib/app.js'
import { COMMANDS } from '@/lib/commands/index.js'
import { resolveCommandInput } from '@/lib/commands/parse.js'

export class Input {
  private _app: AppInterface
  private _widget!: Gtk.Box
  private _commands!: Commands
  private _skills!: Skills
  private _messageInput!: Gtk.TextView
  private _attachments!: Attachments
  private _models!: Models
  private _sendButton!: Gtk.Button
  private _sendButtonContent!: Adw.ButtonContent
  private _skillPicker!: SkillPicker
  private _hint!: Gtk.Label
  private _hintIdle = 0

  public get widget(): Gtk.Box {
    return this._widget
  }

  public get attachments(): Attachments {
    return this._attachments
  }

  public get sendButton(): Gtk.Button {
    return this._sendButton
  }

  public get sendButtonContent(): Adw.ButtonContent {
    return this._sendButtonContent
  }

  constructor(app: AppInterface) {
    this._app = app

    this._setup()
  }

  public addResponsiveBreakpoints(breakpoint: Adw.Breakpoint): void {
    this._attachments.addResponsiveBreakpoints(breakpoint)

    const emptyString = new GObject.Value()
    emptyString.init(GObject.TYPE_STRING)
    emptyString.set_string('')

    breakpoint.add_setter(this._sendButtonContent, 'label', emptyString)
  }

  private _setup(): void {
    const inputToolbar = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      valign: Gtk.Align.END
    })
    inputToolbar.add_css_class('message-input-toolbar')

    this._messageInput = new Gtk.TextView({
      hexpand: true,
      wrap_mode: Gtk.WrapMode.WORD_CHAR
    })

    const placeholder = new Gtk.Label({
      label: 'Send a message',
      halign: Gtk.Align.START,
      valign: Gtk.Align.START,
      can_target: false
    })
    placeholder.add_css_class('message-input-placeholder')
    placeholder.add_css_class('dim-label')

    const inputOverlay = new Gtk.Overlay()
    inputOverlay.set_child(this._messageInput)
    inputOverlay.add_overlay(placeholder)

    this._hint = new Gtk.Label({
      halign: Gtk.Align.START,
      valign: Gtk.Align.START,
      can_target: false,
      ellipsize: Pango.EllipsizeMode.END,
      single_line_mode: true,
      visible: false
    })
    this._hint.add_css_class('dim-label')
    this._hint.add_css_class('message-input-hint')
    inputOverlay.add_overlay(this._hint)

    const buffer = this._messageInput.get_buffer()
    buffer.connect('changed', () => {
      placeholder.set_visible(buffer.get_char_count() === 0)
      this._skillPicker.sync(buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false))
    })
    placeholder.set_visible(buffer.get_char_count() === 0)

    const inputScroll = new Gtk.ScrolledWindow({
      hexpand: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      propagate_natural_height: true,
      max_content_height: 150
    })
    inputScroll.add_css_class('message-input')
    inputScroll.set_child(inputOverlay)

    this._commands = new Commands(this._app, this._messageInput, inputToolbar, (text) => {
      this.setHint(text)
    })
    this._skills = new Skills(this._app, this._messageInput, inputToolbar)

    const keyCtrl = new Gtk.EventControllerKey({
      propagation_phase: Gtk.PropagationPhase.CAPTURE
    })
    keyCtrl.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
      if (this._commands.handleKeyPress(keyval)) {
        return true
      }
      if (this._skills.handleKeyPress(keyval)) {
        return true
      }

      const isReturn = keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter
      const isShift = !!(state & Gdk.ModifierType.SHIFT_MASK)

      if (isReturn && !isShift) {
        this.submit()
        return true
      }

      return false
    })
    this._messageInput.add_controller(keyCtrl)
    inputToolbar.append(inputScroll)

    const actionBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6
    })

    this._attachments = new Attachments(this._app)
    actionBox.append(this._attachments.attachButton)
    actionBox.append(this._attachments.attachmentsGroup)

    this._skillPicker = new SkillPicker(this._app, this._messageInput)
    actionBox.append(this._skillPicker.widget)

    const spacer = new Gtk.Box({
      hexpand: true
    })
    actionBox.append(spacer)

    this._models = new Models(this._app)
    actionBox.append(this._models.modelsDropDown)

    this._sendButtonContent = new Adw.ButtonContent({
      label: 'Send',
      icon_name: 'paper-plane-symbolic'
    })

    this._sendButton = new Gtk.Button({
      child: this._sendButtonContent,
      tooltip_text: 'Send (Enter)'
    })
    this._sendButton.add_css_class('suggested-action')

    this._sendButtonContent.connect('notify::label', () => {
      if (this._sendButtonContent.label === '') {
        this._sendButton.add_css_class('circular')
      } else {
        this._sendButton.remove_css_class('circular')
      }
    })
    this._sendButton.connect('clicked', () => {
      this.submit()
    })
    actionBox.append(this._sendButton)

    const dropTarget = new Gtk.DropTarget({
      formats: Gdk.ContentFormats.new_for_gtype(Gdk.FileList.$gtype),
      actions: Gdk.DragAction.COPY,
      propagation_phase: Gtk.PropagationPhase.CAPTURE
    })
    dropTarget.connect('drop', (_target, value) => {
      if (value instanceof Gdk.FileList) {
        const files = value.get_files()
        files.forEach((file) => {
          return this._attachments.addFile(file)
        })
        return true
      }
      return false
    })
    inputToolbar.add_controller(dropTarget)

    inputToolbar.append(actionBox)
    this._widget = inputToolbar
  }

  public loadModels(): void {
    this._models.load()
  }

  public selectModel(model: string): void {
    this._models.select(model)
  }

  public grabFocus(): void {
    this._messageInput.grab_focus()
  }

  public setSensitive(sensitive: boolean): void {
    this._messageInput.set_sensitive(sensitive)
  }

  public setSendMode(mode: 'send' | 'stop'): void {
    if (mode === 'stop') {
      this._sendButtonContent.label = 'Stop'
      this._sendButtonContent.icon_name = 'media-playback-stop-symbolic'
      this._sendButton.tooltip_text = 'Stop'
      this._sendButton.remove_css_class('suggested-action')
      this._sendButton.add_css_class('destructive-action')
    } else {
      this._sendButtonContent.label = 'Send'
      this._sendButtonContent.icon_name = 'paper-plane-symbolic'
      this._sendButton.tooltip_text = 'Send (Enter)'
      this._sendButton.remove_css_class('destructive-action')
      this._sendButton.add_css_class('suggested-action')
    }
  }

  public submit(): void {
    const buffer = this._messageInput.get_buffer()
    const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false).trim()
    const route = resolveCommandInput(text, COMMANDS)
    if (route.kind === 'command') {
      this._commands.execute(route.line)
      return
    }
    if (route.kind === 'unknown') {
      this._app.showToast(`Unknown command /${route.name}. Did you mean /${route.suggestion}?`)
      return
    }
    void this._app.chat.sendMessage()
  }

  public setHint(text: string | null): void {
    if (this._hintIdle) {
      GLib.source_remove(this._hintIdle)
      this._hintIdle = 0
    }
    if (!text) {
      this._hint.set_visible(false)
      return
    }
    this._hint.set_label(text)
    this._hintIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._hintIdle = 0
      const buffer = this._messageInput.get_buffer()
      const rect = this._messageInput.get_iter_location(buffer.get_iter_at_mark(buffer.get_insert()))
      const [x, y] = this._messageInput.buffer_to_window_coords(Gtk.TextWindowType.WIDGET, rect.x, rect.y)
      const [spaceWidth] = this._messageInput.create_pango_layout(' ').get_pixel_size()
      const left = Math.max(0, x + spaceWidth * 2)
      this._hint.set_margin_start(left)
      this._hint.set_margin_top(Math.max(0, y))
      this._hint.set_size_request(-1, rect.height)
      this._hint.set_max_width_chars(Math.max(4, Math.floor((this._messageInput.get_width() - left) / 8)))
      this._hint.set_visible(true)
      return GLib.SOURCE_REMOVE
    })
  }

  public getBuffer(): Gtk.TextBuffer {
    return this._messageInput.get_buffer()
  }
}
