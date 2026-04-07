import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'
import Pango from 'gi://Pango'

import { showToolCallDialog } from '@/app/dialog/toolcall.js'
import { Images } from '@/app/ui/images.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SPACING, DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'
import type { OllamaMessage, OllamaToolCall } from '@/lib/ollama.js'
import { handle_render_html } from '@/lib/tools/html.js'
import { createBoxedExpanderRow, createMenuItem, createSimpleAction, setupContextMenu } from '@/lib/ui.js'
import { getLanguageId, markdownToPango } from '@/lib/utils.js'

export class TableRowItem extends GObject.Object {
  public cells: string[] = []

  constructor(cells: string[] = []) {
    super()
    this.cells = cells
  }
}
GObject.registerClass(TableRowItem)

export interface MessageProps {
  message: OllamaMessage
  onReload: (message: OllamaMessage) => void
  onCopy: () => void
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
    const lines = block.split('\n')
    const firstLine = lines.shift() || ''
    const match = firstLine.match(/^\s*(```+)(.*)/)
    const openingBackticks = match ? match[1] : '```'
    const language = match ? match[2].trim() : ''

    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim()
      if (lastLine.startsWith(openingBackticks)) {
        lines.pop()
      }
    }
    return { language, code: lines.join('\n') }
  }

  private _parseTable(tableContent: string): { headers: string[]; rows: string[][] } {
    const lines = tableContent.split('\n').map((l) => {
      return l.trim()
    })
    const parseRow = (line: string) => {
      let l = line.trim()
      if (l.startsWith('|')) {
        l = l.substring(1)
      }
      if (l.endsWith('|')) {
        l = l.substring(0, l.length - 1)
      }
      return l.split('|').map((cell) => {
        return cell.trim()
      })
    }

    const headers = parseRow(lines[0])
    const rows: string[][] = []

    for (let i = 2; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        continue
      }
      rows.push(parseRow(lines[i]))
    }

    const normalizedRows = rows.map((row) => {
      const newRow = [...row]
      while (newRow.length < headers.length) {
        newRow.push('')
      }
      return newRow.slice(0, headers.length)
    })

    return { headers, rows: normalizedRows }
  }

  private _renderContent(message: OllamaMessage): void {
    if (!message.content) {
      this._contentParts.forEach((p) => {
        return this._contentBox.remove(p.widget)
      })
      this._contentParts = []
      return
    }

    const rawChunks: { type: 'text' | 'code'; content: string }[] = []
    const rawLines = message.content.split('\n')
    let currentChunk: string[] = []
    let inCodeBlock = false
    let openingBackticks = ''
    let nestingLevel = 0

    for (const line of rawLines) {
      if (!inCodeBlock) {
        const match = line.match(/^\s*(```+)(.*)/)
        if (match) {
          if (currentChunk.length > 0) {
            rawChunks.push({ type: 'text', content: currentChunk.join('\n') })
          }
          currentChunk = [line]
          inCodeBlock = true
          openingBackticks = match[1]
          nestingLevel = 1
        } else {
          currentChunk.push(line)
        }
      } else {
        currentChunk.push(line)
        const match = line.match(/^\s*(```+)(.*)/)
        if (match && match[1].length >= openingBackticks.length) {
          const content = match[2].trim()
          if (content.length > 0) {
            nestingLevel++
          } else {
            nestingLevel--
            if (nestingLevel === 0) {
              rawChunks.push({ type: 'code', content: currentChunk.join('\n') })
              currentChunk = []
              inCodeBlock = false
              openingBackticks = ''
            }
          }
        }
      }
    }
    if (currentChunk.length > 0) {
      rawChunks.push({ type: inCodeBlock ? 'code' : 'text', content: currentChunk.join('\n') })
    }

    const finalChunks: { type: 'text' | 'code' | 'table'; content: string }[] = []

    for (const chunk of rawChunks) {
      if (chunk.type === 'code') {
        finalChunks.push(chunk)
        continue
      }

      const lines = chunk.content.split('\n')
      let textBuffer: string[] = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (i < lines.length - 1) {
          const nextLine = lines[i + 1]
          const isTableSep = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(nextLine)
          const hasPipes = line.includes('|')

          if (isTableSep && hasPipes) {
            if (textBuffer.length > 0) {
              const textContent = textBuffer.join('\n').trim()
              if (textContent) {
                finalChunks.push({ type: 'text', content: textContent })
              }
              textBuffer = []
            }

            const tableBuffer = [line, nextLine]
            i += 2

            while (i < lines.length) {
              const rowLine = lines[i]
              if (!rowLine.includes('|') && rowLine.trim() !== '') {
                break
              }
              if (rowLine.trim() === '') {
                break
              }
              tableBuffer.push(rowLine)
              i++
            }
            i--

            finalChunks.push({ type: 'table', content: tableBuffer.join('\n') })
            continue
          }
        }
        textBuffer.push(line)
      }

      if (textBuffer.length > 0) {
        const textContent = textBuffer.join('\n').trim()
        if (textContent) {
          finalChunks.push({ type: 'text', content: textContent })
        }
      }
    }

    for (let i = 0; i < finalChunks.length; i++) {
      const chunk = finalChunks[i]

      if (i < this._contentParts.length) {
        const part = this._contentParts[i]
        if (part.type === chunk.type) {
          if (chunk.type === 'code') {
            const { code, language } = this._parseCodeBlock(chunk.content)
            part.expanderRow!.set_title(language || 'text')
            part.buffer!.set_text(code, -1)

            const lm = GtkSource.LanguageManager.get_default()
            const langId = getLanguageId(language)
            const lang = lm.get_language(langId) || lm.get_language('text')
            if (part.buffer!.get_language() !== lang) {
              part.buffer!.set_language(lang)
            }
            continue
          } else if (chunk.type === 'table') {
            const { headers, rows } = this._parseTable(chunk.content)
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
        const { code, language } = this._parseCodeBlock(chunk.content)
        const [listBox, expander] = createBoxedExpanderRow(language || 'text', 'text-x-generic-symbolic')
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
      } else if (chunk.type === 'table') {
        const { headers, rows } = this._parseTable(chunk.content)

        const listStore = new Gio.ListStore({ item_type: TableRowItem.$gtype })
        for (const row of rows) {
          listStore.append(new TableRowItem(row))
        }

        const selection = new Gtk.NoSelection({ model: listStore })
        const columnView = new Gtk.ColumnView({ model: selection })
        columnView.set_can_focus(false)
        columnView.add_css_class('markdown-table')
        columnView.set_show_row_separators(true)
        columnView.set_show_column_separators(true)

        for (let c = 0; c < headers.length; c++) {
          const factory = new Gtk.SignalListItemFactory()
          factory.connect('setup', (_, listItem: Gtk.ListItem) => {
            const label = new Gtk.Label({
              use_markup: true,
              wrap: false,
              xalign: 0,
              selectable: true,
              margin_top: 8,
              margin_bottom: 8,
              margin_start: 8,
              margin_end: 8
            })
            listItem.set_child(label)
          })
          factory.connect('bind', (_, listItem: Gtk.ListItem) => {
            const label = listItem.get_child() as Gtk.Label
            const item = listItem.get_item()
            if (item instanceof TableRowItem) {
              const cellContent = item.cells[c] || ''
              label.set_markup(markdownToPango(cellContent))
            }
          })

          const titleText = headers[c]
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`(.*?)`/g, '$1')

          const column = new Gtk.ColumnViewColumn({
            title: titleText,
            factory: factory,
            expand: true
          })
          columnView.append_column(column)
        }

        const scrolled = new Gtk.ScrolledWindow({
          child: columnView,
          propagate_natural_height: true,
          propagate_natural_width: false,
          hexpand: true,
          vscrollbar_policy: Gtk.PolicyType.NEVER,
          hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
          has_frame: true
        })

        this._contentBox.append(scrolled)
        this._contentParts.push({ type: 'table', widget: scrolled, columnView, listStore })
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
