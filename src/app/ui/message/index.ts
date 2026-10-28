import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'
import Pango from 'gi://Pango'

import { showToolCallDialog } from '@/app/dialog/toolcall.js'
import { Images } from '@/app/ui/images.js'
import { createCodeWidget } from '@/app/ui/message/code.js'
import { createTableWidget, TableRowItem } from '@/app/ui/message/table.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SPACING, DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'
import { markdownToPango, parseCodeBlock, parseMarkdownChunks, parseTable } from '@/lib/parser.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { handle_render_html } from '@/lib/tools/html.js'
import { createBoxedExpanderRow, createMenuItem, createSimpleAction, setupContextMenu } from '@/lib/ui.js'
import { getLanguageMetadata } from '@/lib/utils.js'

export interface MessageProps {
  message: ChatMessage
  onReload: (message: ChatMessage) => void
  onCopy: () => void
  onRegenerate: (message: ChatMessage) => void
}

interface ContentPart {
  type: 'text' | 'code' | 'table'
  widget: Gtk.Widget
  contentLabel?: Gtk.Label
  expanderRow?: Adw.ExpanderRow
  buffer?: GtkSource.Buffer
  columnView?: Gtk.ColumnView
  listStore?: Gio.ListStore
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
  private _currentMessage: ChatMessage
  private _copyButton?: Gtk.Button
  private _copyAction?: Gio.SimpleAction
  private _reloadButton?: Gtk.Button
  private _reloadAction?: Gio.SimpleAction
  private _regenerateButton?: Gtk.Button
  private _regenerateAction?: Gio.SimpleAction
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

    this._updateSensitivity(this._app.isBusy)
  }

  public destroy(): void {
    this._app.disconnect(this._busySignalId)
    this._app.disconnect(this._syntaxSignalId)
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
    this._regenerateButton?.set_sensitive(sensitive)
    this._copyAction?.set_enabled(sensitive)
    this._reloadAction?.set_enabled(sensitive)
    this._regenerateAction?.set_enabled(sensitive)
  }

  private _setupThinking(message: ChatMessage): void {
    const [listBox, expander] = createBoxedExpanderRow('Thought Process', 'dialog-information-symbolic')
    this._thinkingListBox = listBox
    this._thinkingExpander = expander
    this._thinkingListBox.set_visible(!!message.thinking?.length)
    this._widget.append(this._thinkingListBox)

    this._thinkingLabel = new Gtk.Label({
      use_markup: false,
      wrap: true,
      wrap_mode: Pango.WrapMode.WORD_CHAR,
      xalign: 0,
      selectable: true
    })
    this._thinkingLabel.set_text(message.thinking || '')
    this._thinkingLabel.add_css_class('dim-label')
    this._thinkingLabel.add_css_class('thinking-label')
    this._thinkingExpander.add_row(this._thinkingLabel)
  }

  private _setupToolCalls(message: ChatMessage): void {
    const [listBox, expander] = createBoxedExpanderRow('Tool Calls', 'emblem-system-symbolic')
    this._toolCallsListBox = listBox
    this._toolCallsExpander = expander
    this._toolCallsListBox.set_visible(!!message.tool_calls?.length)
    this._widget.append(this._toolCallsListBox)
    this._updateToolCalls(message.tool_calls)
  }

  private _setupImages(message: ChatMessage): void {
    if (message.images?.length) {
      const images = new Images(this._app, message.images, message.role)
      this._widget.append(images.widget)
    }
  }

  private _setupFiles(message: ChatMessage): void {
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
      const metadata = getLanguageMetadata(ext)
      const lang = lm.get_language(metadata.id) || lm.get_language('text')
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

  private _setupContent(message: ChatMessage): void {
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

  private _renderContent(message: ChatMessage): void {
    if (!message.content) {
      this._contentParts.forEach((p) => {
        return this._contentBox.remove(p.widget)
      })
      this._contentParts = []
      return
    }

    const finalChunks = parseMarkdownChunks(message.content)

    for (let i = 0; i < finalChunks.length; i++) {
      const chunk = finalChunks[i]

      if (i < this._contentParts.length) {
        const part = this._contentParts[i]
        if (part.type === chunk.type) {
          if (chunk.type === 'code') {
            const { code, language } = parseCodeBlock(chunk.content)
            const lm = GtkSource.LanguageManager.get_default()
            const metadata = getLanguageMetadata(language)
            part.expanderRow!.set_title(metadata.title)

            const currentCode = part.buffer!.get_text(
              part.buffer!.get_start_iter(),
              part.buffer!.get_end_iter(),
              false
            )

            if (code !== currentCode) {
              if (code.startsWith(currentCode)) {
                const diff = code.substring(currentCode.length)
                part.buffer!.insert(part.buffer!.get_end_iter(), diff, -1)
              } else {
                part.buffer!.set_text(code, -1)
              }
            }

            const lang = lm.get_language(metadata.id) || lm.get_language('text')
            if (part.buffer!.get_language() !== lang) {
              part.buffer!.set_language(lang)
            }
            continue
          } else if (chunk.type === 'table') {
            const { headers, rows } = parseTable(chunk.content)
            if (part.columnView!.get_columns().get_n_items() === headers.length) {
              const currentCount = part.listStore!.get_n_items()
              for (let r = 0; r < rows.length; r++) {
                if (r < currentCount) {
                  const item = part.listStore!.get_item(r) as TableRowItem
                  let changed = false
                  for (let c = 0; c < headers.length; c++) {
                    if (item.cells[c] !== rows[r][c]) {
                      changed = true
                      break
                    }
                  }
                  if (changed) {
                    part.listStore!.splice(r, 1, [new TableRowItem(rows[r])])
                  }
                } else {
                  part.listStore!.append(new TableRowItem(rows[r]))
                }
              }
              if (rows.length < currentCount) {
                part.listStore!.splice(rows.length, currentCount - rows.length, [])
              }
              continue
            }
          } else {
            part.contentLabel!.set_markup(markdownToPango(chunk.content))
            continue
          }
        }

        for (let j = i; j < this._contentParts.length; j++) {
          this._contentBox.remove(this._contentParts[j].widget)
        }
        this._contentParts.splice(i)
      }

      if (chunk.type === 'code') {
        const { code, language } = parseCodeBlock(chunk.content)
        const { buffer, expanderRow, widget } = createCodeWidget(code, language, this._app)

        this._contentBox.append(widget)
        this._contentParts.push({
          type: 'code',
          widget,
          expanderRow,
          buffer
        })
      } else if (chunk.type === 'table') {
        const { headers, rows } = parseTable(chunk.content)
        const { columnView, listStore, widget } = createTableWidget(headers, rows)

        this._contentBox.append(widget)
        this._contentParts.push({ type: 'table', widget, columnView, listStore })
      } else {
        const label = new Gtk.Label({
          use_markup: true,
          wrap: true,
          wrap_mode: Pango.WrapMode.WORD_CHAR,
          xalign: 0,
          selectable: true
        })
        label.add_css_class('message-text')
        label.set_markup(markdownToPango(chunk.content))
        this._contentBox.append(label)
        this._contentParts.push({
          type: 'text',
          widget: label,
          contentLabel: label
        })
      }
    }

    while (this._contentParts.length > finalChunks.length) {
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
      label: message.role === 'user' ? 'You' : 'Assistant',
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

      this._regenerateButton = new Gtk.Button({
        icon_name: 'view-refresh-symbolic',
        tooltip_text: 'Regenerate response',
        has_frame: false,
        valign: Gtk.Align.CENTER
      })
      this._regenerateButton.add_css_class('flat')
      this._regenerateButton.add_css_class('dim-label')
      this._regenerateButton.connect('clicked', () => {
        return props.onRegenerate(message)
      })
      buttonsBox.append(this._regenerateButton)
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
      const reloadMenuItem = createMenuItem('Restart from here', 'chat.reload_message', 'document-edit-symbolic')
      menu.append_item(reloadMenuItem)

      const regenerateMenuItem = createMenuItem('Regenerate response', 'chat.regenerate_message', 'view-refresh-symbolic')
      menu.append_item(regenerateMenuItem)
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

      this._regenerateAction = createSimpleAction('regenerate_message', () => {
        return props.onRegenerate(message)
      })
      actionGroup.add_action(this._regenerateAction)
    }

    const popover = Gtk.PopoverMenu.new_from_model(menu)
    popover.set_parent(this._messageGroup)
    popover.set_has_arrow(false)
    popover.set_position(Gtk.PositionType.BOTTOM)
    this._messageGroup.insert_action_group('chat', actionGroup)

    setupContextMenu(this._messageGroup, popover)
  }

  private _updateToolCalls(calls?: ToolCall[]): void {
    this._toolRows.forEach((row) => {
      return this._toolCallsExpander.remove(row)
    })
    this._toolRows.length = 0
    calls?.forEach((call) => {
      const mcpLabel = this._app.mcp.getToolLabel(call.function.name)
      const row = new Adw.ActionRow({
        title: mcpLabel?.label ?? call.function.name,
        subtitle: mcpLabel?.description ?? '',
        subtitle_lines: 1,
        use_markup: false,
        activatable: true
      })
      row.add_prefix(new Gtk.Image({
        icon_name: mcpLabel ? 'network-server-symbolic' : 'system-run-symbolic'
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
          if (args) {
            handle_render_html(this._app, args)
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

  public update(updated: ChatMessage): void {
    this._currentMessage = updated
    this._thinkingListBox.set_visible(!!updated.thinking?.length)
    this._thinkingLabel.set_text(updated.thinking || '')
    this._toolCallsListBox.set_visible(!!updated.tool_calls?.length)
    this._updateToolCalls(updated.tool_calls)

    const hasContent = !!updated.content?.length
    this._messageGroup.set_visible(hasContent)
    this._renderContent(updated)
    this._contentBox.set_visible(hasContent)
    this._roleBox.set_visible(hasContent)
  }
}
