import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'
import Pango from 'gi://Pango'

import { showToolCallDialog } from '@/app/dialog/toolcall.js'
import type { AppInterface } from '@/app/index.js'
import { Images } from '@/app/ui/images.js'
import { DEFAULT_SPACING, DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'
import type { OllamaMessage, OllamaToolCall } from '@/lib/ollama.js'
import { handle_render_html } from '@/lib/tools/html.js'
import { createBoxedExpanderRow, createMenuItem, createSimpleAction, setupContextMenu } from '@/lib/ui.js'
import { getLanguageId, markdownToPango } from '@/lib/utils.js'

export interface MessageProps {
  message: OllamaMessage
  onReload: (message: OllamaMessage) => void
  onCopy: () => void
}

interface ContentPart {
  type: 'text' | 'code'
  widget: Gtk.Widget
  contentLabel?: Gtk.Label
  expanderRow?: Adw.ExpanderRow
  buffer?: GtkSource.Buffer
}

export class Message {
  private _app: AppInterface
  private _widget: Gtk.Box
  private _thinkingListBox!: Gtk.ListBox
  private _thinkingExpander!: Adw.ExpanderRow
  private _thinkingLabel!: Gtk.Label
  private _toolCallsListBox!: Gtk.ListBox
  private _toolCallsExpander!: Adw.ExpanderRow
  private _messageGroup!: Gtk.Box
  private _contentBox!: Gtk.Box
  private _contentParts: ContentPart[] = []
  private _fileBuffers: GtkSource.Buffer[] = []
  private _roleBox!: Gtk.Box
  private _toolRows: Gtk.Widget[] = []
  private _currentMessage: OllamaMessage
  private _copyButton?: Gtk.Button
  private _copyAction?: Gio.SimpleAction
  private _reloadButton?: Gtk.Button
  private _reloadAction?: Gio.SimpleAction
  private _busySignalId: number
  private _syntaxSignalId: number

  public get widget(): Gtk.Box {
    return this._widget
  }

  constructor(app: AppInterface, props: MessageProps) {
    this._app = app
    this._currentMessage = props.message

    this._widget = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      hexpand: true,
      spacing: DEFAULT_SPACING
    })

    const isContentVisible = !!props.message.content?.length && ['user', 'assistant'].includes(props.message.role)
    this._messageGroup = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      hexpand: true,
      spacing: 4,
      visible: isContentVisible
    })

    const { message } = props
    this._setupThinking(message)
    this._setupToolCalls(message)
    this._setupImages(message)
    this._setupFiles(message)
    this._widget.append(this._messageGroup)
    this._setupContent(message)
    this._setupRole(props)
    this._setupActions(props)

    this._busySignalId = this._app.connect('busy-changed', (_: number, isBusy: boolean) => {
      this._updateSensitivity(isBusy)
    })

    this._syntaxSignalId = this._app.connect('syntax-changed', (_: number, theme: string) => {
      this._updateSyntax(theme)
    })

    this._widget.connect('destroy', () => {
      this._app.disconnect(this._busySignalId)
      this._app.disconnect(this._syntaxSignalId)
    })

    this._updateSensitivity(this._app.isBusy)
  }

  private _updateSyntax(theme: string): void {
    const sm = GtkSource.StyleSchemeManager.get_default()
    const scheme = sm.get_scheme(theme)
    if (!scheme) {
      return
    }

    this._contentParts.forEach((part) => {
      if (part.type === 'code' && part.buffer) {
        part.buffer.set_style_scheme(scheme)
      }
    })

    this._fileBuffers.forEach((buffer) => {
      buffer.set_style_scheme(scheme)
    })
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
      const images = new Images(this._app, message.images, message.role)
      this._widget.append(images.widget)
    }
  }

  private _setupFiles(message: OllamaMessage): void {
    if (!message.files?.length) {
      return
    }

    const filesBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: DEFAULT_SPACING,
      hexpand: true
    })

    message.files.forEach((file) => {
      const [listBox, expander] = createBoxedExpanderRow(file.name, 'text-x-generic-symbolic')

      const buffer = new GtkSource.Buffer()
      const lm = GtkSource.LanguageManager.get_default()
      const ext = file.name.split('.').pop() || ''
      const langId = getLanguageId(ext)
      const lang = lm.get_language(langId) || lm.get_language('text')
      if (lang) {
        buffer.set_language(lang)
      }
      buffer.set_text(file.content, -1)

      const sm = GtkSource.StyleSchemeManager.get_default()
      const scheme = sm.get_scheme(this._app.settings.syntax || DEFAULT_SYNTAX_THEME)
      if (scheme) {
        buffer.set_style_scheme(scheme)
      }
      this._fileBuffers.push(buffer)

      const sourceView = new GtkSource.View({
        buffer,
        editable: false,
        monospace: true,
        show_line_numbers: true,
        wrap_mode: Gtk.WrapMode.WORD_CHAR,
        top_margin: 6,
        bottom_margin: 6,
        left_margin: 6,
        right_margin: 6,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 6,
        margin_end: 6
      })
      sourceView.add_css_class('code-view')
      expander.add_row(sourceView)
      filesBox.append(listBox)
    })

    this._widget.append(filesBox)
  }

  private _setupContent(message: OllamaMessage): void {
    const isVisible = !!message.content?.length && ['user', 'assistant'].includes(message.role)

    this._contentBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: DEFAULT_SPACING,
      halign: message.role === 'user' ? Gtk.Align.END : Gtk.Align.FILL,
      visible: isVisible
    })

    const roleClasses: Record<string, string> = {
      user: 'user-message',
      assistant: 'assistant-message',
      system: 'system-message'
    }

    if (roleClasses[message.role]) {
      this._contentBox.add_css_class(roleClasses[message.role])
    }

    this._messageGroup.append(this._contentBox)
    this._renderContent(message)
  }

  private _parseCodeBlock(block: string): { language: string; code: string } {
    let raw = block
    if (raw.startsWith('```')) {
      raw = raw.slice(3)
    }
    const lines = raw.split('\n')
    const firstLine = lines.shift() || ''
    const language = firstLine.trim()

    if (lines.length > 0 && lines[lines.length - 1].trim().endsWith('```')) {
      const last = lines.pop()!
      const remainder = last.slice(0, -3).trim()
      if (remainder) {
        lines.push(remainder)
      }
    }
    return { language, code: lines.join('\n') }
  }

  private _renderContent(message: OllamaMessage): void {
    if (!message.content) {
      this._contentParts.forEach((p) => {
        return this._contentBox.remove(p.widget)
      })
      this._contentParts = []
      return
    }

    const rawChunks = message.content.split(/(```[\s\S]*?(?:```|$))/g)
    const chunks = rawChunks
      .map((c) => {
        return c.startsWith('```') ? c : c.trim()
      })
      .filter((c) => {
        return c.length > 0
      })

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const isCode = chunk.startsWith('```')

      if (i < this._contentParts.length) {
        const part = this._contentParts[i]
        if (part.type === (isCode ? 'code' : 'text')) {
          if (isCode) {
            const { code, language } = this._parseCodeBlock(chunk)
            part.expanderRow!.set_title(language || 'text')
            part.buffer!.set_text(code, -1)
          } else {
            part.contentLabel!.set_label(markdownToPango(chunk))
          }
          continue
        } else {
          for (let j = i; j < this._contentParts.length; j++) {
            this._contentBox.remove(this._contentParts[j].widget)
          }
          this._contentParts.splice(i)
        }
      }

      if (isCode) {
        const { code, language } = this._parseCodeBlock(chunk)
        const [listBox, expander] = createBoxedExpanderRow(language || 'text', 'text-x-generic-symbolic')
        listBox.add_css_class('code-block-list')
        expander.set_expanded(true)

        const copyBtn = new Gtk.Button({
          icon_name: 'edit-copy-symbolic',
          tooltip_text: 'Copy code',
          valign: Gtk.Align.CENTER
        })
        copyBtn.add_css_class('flat')
        copyBtn.connect('clicked', () => {
          const cb = Gdk.Display.get_default()!.get_clipboard()
          cb.set(code)
          this._app.showToast('Code copied')
        })
        expander.add_suffix(copyBtn)

        const buffer = new GtkSource.Buffer()
        const lm = GtkSource.LanguageManager.get_default()
        const langId = getLanguageId(language)
        const lang = lm.get_language(langId) || lm.get_language('text')
        if (lang) {
          buffer.set_language(lang)
        }
        buffer.set_text(code, -1)

        const sm = GtkSource.StyleSchemeManager.get_default()
        const scheme = sm.get_scheme(this._app.settings.syntax || DEFAULT_SYNTAX_THEME)
        if (scheme) {
          buffer.set_style_scheme(scheme)
        }

        const sourceView = new GtkSource.View({
          buffer: buffer,
          editable: false,
          monospace: true,
          show_line_numbers: true,
          wrap_mode: Gtk.WrapMode.WORD_CHAR,
          top_margin: 6,
          bottom_margin: 6,
          left_margin: 6,
          right_margin: 6,
          margin_top: 6,
          margin_bottom: 6,
          margin_start: 6,
          margin_end: 6
        })
        sourceView.add_css_class('code-view')

        expander.add_row(sourceView)
        this._contentBox.append(listBox)
        this._contentParts.push({
          type: 'code',
          widget: listBox,
          expanderRow: expander,
          buffer: buffer
        })
      } else {
        const label = new Gtk.Label({
          label: markdownToPango(chunk),
          use_markup: true,
          wrap: true,
          wrap_mode: Pango.WrapMode.WORD_CHAR,
          xalign: 0,
          selectable: true
        })
        this._contentBox.append(label)
        this._contentParts.push({
          type: 'text',
          widget: label,
          contentLabel: label
        })
      }
    }

    while (this._contentParts.length > chunks.length) {
      const part = this._contentParts.pop()!
      this._contentBox.remove(part.widget)
    }
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
    this._messageGroup.add_controller(hoverCtrl)
    buttonsBox.set_opacity(0)

    this._messageGroup.append(this._roleBox)
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
    popover.set_parent(this._messageGroup)
    popover.set_has_arrow(false)
    popover.set_position(Gtk.PositionType.BOTTOM)
    this._messageGroup.insert_action_group('chat', actionGroup)

    setupContextMenu(this._messageGroup, popover)
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

      if (call.function.name === 'render_html') {
        const previewBtn = new Gtk.Button({
          label: 'Open preview',
          hexpand: true,
          margin_top: 6,
          margin_bottom: 6,
          margin_start: 12,
          margin_end: 12
        })
        previewBtn.add_css_class('pill')
        previewBtn.add_css_class('suggested-action')
        previewBtn.connect('clicked', () => {
          const args = call.function.arguments as Record<string, unknown> | undefined
          if (args && typeof args.html_content === 'string') {
            handle_render_html({ html_content: args.html_content })
          }
        })

        const btnBox = new Gtk.Box()
        btnBox.append(previewBtn)

        const btnRow = new Gtk.ListBoxRow({
          child: btnBox,
          activatable: false,
          selectable: false
        })
        this._toolCallsExpander.add_row(btnRow)
        this._toolRows.push(btnRow)
      }
    })
  }

  public update(updated: OllamaMessage): void {
    this._currentMessage = updated
    this._thinkingListBox.set_visible(!!updated.thinking?.length)
    this._thinkingLabel.set_markup(markdownToPango(updated.thinking || ''))
    this._toolCallsListBox.set_visible(!!updated.tool_calls?.length)
    this._updateToolCalls(updated.tool_calls)

    const hasContent = !!updated.content?.length
    this._messageGroup.set_visible(hasContent)
    this._renderContent(updated)
    this._contentBox.set_visible(hasContent)
    this._roleBox.set_visible(hasContent)
  }
}
