import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import { showToolCallDialog } from '@/app/dialog/toolcall.js'
import type { AppInterface } from '@/app/index.js'
import { Images } from '@/app/ui/images.js'
import type { OllamaMessage, OllamaToolCall } from '@/lib/ollama.js'
import { createBoxedExpanderRow, createMenuItem, createSimpleAction, setupContextMenu } from '@/lib/ui.js'
import { markdownToPango } from '@/lib/utils.js'

export interface MessageProps {
  message: OllamaMessage
  onReload: (message: OllamaMessage) => void
  onCopy: () => void
}

export class Message {
  private _app: AppInterface
  private _widget: Gtk.Box
  private _thinkingListBox!: Gtk.ListBox
  private _thinkingExpander!: Adw.ExpanderRow
  private _thinkingLabel!: Gtk.Label
  private _toolCallsListBox!: Gtk.ListBox
  private _toolCallsExpander!: Adw.ExpanderRow
  private _contentLabel!: Gtk.Label
  private _roleBox!: Gtk.Box
  private _toolRows: Gtk.Widget[] = []
  private _currentMessage: OllamaMessage
  private _copyButton?: Gtk.Button
  private _copyAction?: Gio.SimpleAction
  private _reloadButton?: Gtk.Button
  private _reloadAction?: Gio.SimpleAction
  private _busySignalId: number

  public get widget(): Gtk.Box {
    return this._widget
  }

  constructor(app: AppInterface, props: MessageProps) {
    this._app = app
    this._currentMessage = props.message

    this._widget = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      hexpand: true,
      spacing: 4
    })

    const { message } = props
    this._setupThinking(message)
    this._setupToolCalls(message)
    this._setupImages(message)
    this._setupContent(message)
    this._setupRole(props)
    this._setupActions(props)

    this._busySignalId = this._app.connect('busy-changed', (_: number, isBusy: boolean) => {
      this._updateSensitivity(isBusy)
    })

    this._widget.connect('destroy', () => {
      this._app.disconnect(this._busySignalId)
    })

    this._updateSensitivity(this._app.isBusy)
  }

  private _updateSensitivity(isBusy: boolean): void {
    const sensitive = !isBusy
    this._copyButton?.set_sensitive(sensitive)
    this._reloadButton?.set_sensitive(sensitive)
    this._copyAction?.set_enabled(sensitive)
    this._reloadAction?.set_enabled(sensitive)
  }

  private _setupThinking(message: OllamaMessage): void {
    const [listBox, expander] = createBoxedExpanderRow('Thought Process', 'dialog-information-symbolic')
    this._thinkingListBox = listBox
    this._thinkingExpander = expander
    this._thinkingListBox.set_visible(!!message.thinking?.length)
    this._widget.append(this._thinkingListBox)

    this._thinkingLabel = new Gtk.Label({
      label: markdownToPango(message.thinking || ''),
      use_markup: true,
      wrap: true,
      wrap_mode: Pango.WrapMode.WORD_CHAR,
      xalign: 0,
      selectable: true
    })
    this._thinkingLabel.add_css_class('dim-label')
    this._thinkingLabel.add_css_class('thinking-label')
    this._thinkingExpander.add_row(this._thinkingLabel)
  }

  private _setupToolCalls(message: OllamaMessage): void {
    const [listBox, expander] = createBoxedExpanderRow('Tool Calls', 'emblem-system-symbolic')
    this._toolCallsListBox = listBox
    this._toolCallsExpander = expander
    this._toolCallsListBox.set_visible(!!message.tool_calls?.length)
    this._widget.append(this._toolCallsListBox)
    this._updateToolCalls(message.tool_calls)
  }

  private _setupImages(message: OllamaMessage): void {
    if (message.images?.length) {
      const images = new Images(message.images, message.role)
      this._widget.append(images.widget)
    }
  }

  private _setupContent(message: OllamaMessage): void {
    const isVisible = !!message.content?.length && ['user', 'assistant'].includes(message.role)

    this._contentLabel = new Gtk.Label({
      label: markdownToPango(message.content || ''),
      use_markup: true,
      wrap: true,
      wrap_mode: Pango.WrapMode.WORD_CHAR,
      xalign: 0,
      halign: message.role === 'user' ? Gtk.Align.END : Gtk.Align.FILL,
      selectable: true,
      visible: isVisible
    })

    const roleClasses: Record<string, string> = {
      user: 'user-message',
      assistant: 'assistant-message',
      system: 'system-message'
    }

    if (roleClasses[message.role]) {
      this._contentLabel.add_css_class(roleClasses[message.role])
    }

    this._widget.append(this._contentLabel)
  }

  private _setupRole(props: MessageProps): void {
    const { message, onCopy, onReload } = props
    const isVisible = !!message.content?.length && ['user', 'assistant'].includes(message.role)

    this._roleBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      halign: message.role === 'user' ? Gtk.Align.END : Gtk.Align.START,
      visible: isVisible
    })

    const roleLabel = new Gtk.Label({
      label: message.role === 'user' ? 'You' : 'Ollama',
      selectable: false
    })
    roleLabel.add_css_class('dim-label')
    roleLabel.add_css_class('caption-heading')

    const buttonsBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL
    })

    this._copyButton = new Gtk.Button({
      icon_name: 'edit-copy-symbolic',
      tooltip_text: 'Copy message',
      has_frame: false,
      valign: Gtk.Align.CENTER
    })
    this._copyButton.add_css_class('flat')
    this._copyButton.connect('clicked', () => {
      const clipboard = Gdk.Display.get_default()!.get_clipboard()
      clipboard.set(this._currentMessage.content || '')
      onCopy()
    })
    this._copyButton.add_css_class('dim-label')
    buttonsBox.append(this._copyButton)

    if (message.role === 'user') {
      this._reloadButton = new Gtk.Button({
        icon_name: 'document-edit-symbolic',
        tooltip_text: 'Edit message',
        has_frame: false,
        valign: Gtk.Align.CENTER
      })
      this._reloadButton.add_css_class('flat')
      this._reloadButton.add_css_class('dim-label')
      this._reloadButton.connect('clicked', () => {
        return onReload(message)
      })
      buttonsBox.append(this._reloadButton)
    }

    if (message.role === 'user') {
      this._roleBox.append(buttonsBox)
      this._roleBox.append(roleLabel)
    } else {
      this._roleBox.append(roleLabel)
      this._roleBox.append(buttonsBox)
    }

    const hoverCtrl = new Gtk.EventControllerMotion()
    hoverCtrl.connect('enter', () => {
      return buttonsBox.set_opacity(1)
    })
    hoverCtrl.connect('leave', () => {
      return buttonsBox.set_opacity(0)
    })
    this._widget.add_controller(hoverCtrl)
    buttonsBox.set_opacity(0)

    this._widget.append(this._roleBox)
  }

  private _setupActions(props: MessageProps): void {
    const { message, onCopy, onReload } = props
    if (!['user', 'assistant'].includes(message.role)) {
      return
    }

    const menu = new Gio.Menu()

    const copyMenuItem = createMenuItem('Copy message', 'chat.copy_message', 'edit-copy-symbolic')
    menu.append_item(copyMenuItem)

    if (message.role === 'user') {
      const reloadMenuItem = createMenuItem('Restart from here', 'chat.reload_message', 'view-refresh-symbolic')
      menu.append_item(reloadMenuItem)
    }

    const actionGroup = new Gio.SimpleActionGroup()
    this._copyAction = createSimpleAction('copy_message', () => {
      const clipboard = Gdk.Display.get_default()!.get_clipboard()
      clipboard.set(this._currentMessage.content || '')
      onCopy()
    })
    actionGroup.add_action(this._copyAction)

    if (message.role === 'user') {
      this._reloadAction = createSimpleAction('reload_message', () => {
        return onReload(message)
      })
      actionGroup.add_action(this._reloadAction)
    }

    const popover = Gtk.PopoverMenu.new_from_model(menu)
    popover.set_parent(this._widget)
    popover.set_has_arrow(false)
    popover.set_position(Gtk.PositionType.BOTTOM)
    this._widget.insert_action_group('chat', actionGroup)

    setupContextMenu(this._widget, popover)
  }

  private _updateToolCalls(calls?: OllamaToolCall[]): void {
    this._toolRows.forEach((row) => {
      return this._toolCallsExpander.remove(row)
    })
    this._toolRows.length = 0
    calls?.forEach((call) => {
      const row = new Adw.ActionRow({
        title: call.function.name,
        use_markup: false,
        activatable: true
      })
      row.add_prefix(new Gtk.Image({
        icon_name: 'system-run-symbolic'
      }))
      row.add_suffix(new Gtk.Image({
        icon_name: 'view-reveal-symbolic'
      }))
      row.connect('activated', () => {
        return showToolCallDialog(this._app, call)
      })
      row.add_css_class('monospace')
      this._toolCallsExpander.add_row(row)
      this._toolRows.push(row)
    })
  }

  public update(updated: OllamaMessage): void {
    this._currentMessage = updated
    this._thinkingListBox.set_visible(!!updated.thinking?.length)
    this._thinkingLabel.set_markup(markdownToPango(updated.thinking || ''))
    this._toolCallsListBox.set_visible(!!updated.tool_calls?.length)
    this._updateToolCalls(updated.tool_calls)
    this._contentLabel.set_markup(markdownToPango(updated.content || ''))
    this._contentLabel.set_visible(!!updated.content?.length)
    this._roleBox.set_visible(!!updated.content?.length)
  }
}
