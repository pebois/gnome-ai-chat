import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import Graphene from 'gi://Graphene'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'
import Pango from 'gi://Pango'

import { Images } from '@/app/ui/images.js'
import { createCodeWidget } from '@/app/ui/message/code.js'
import { createTableWidget, TableRowItem } from '@/app/ui/message/table.js'
import { ToolCallRow } from '@/app/ui/toolcall.js'
import type { AppInterface } from '@/lib/app.js'
import { messageDisplayText } from '@/lib/commands/parse.js'
import { DEFAULT_SPACING, DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'
import { findRanges, type TextRange, toByteRanges } from '@/lib/find.js'
import { parseCodeBlock, parseMarkdownChunks, parseTable } from '@/lib/parser.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { type Source, stripSourcesSection } from '@/lib/sources.js'
import { findToolResult } from '@/lib/tools/results.js'
import { createBoxedExpanderRow, createMenuItem, createSimpleAction, setMarkdownMarkup, setupContextMenu } from '@/lib/ui.js'
import { getLanguageMetadata, messageDetails } from '@/lib/utils.js'

export interface MessageProps {
  message: ChatMessage
  onReload: (message: ChatMessage) => void
  onCopy: () => void
  onRegenerate: (message: ChatMessage) => void
  pending?: boolean
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

interface Occurrence {
  part: ContentPart
  range: TextRange
}

interface SearchColors {
  match: Gdk.RGBA
  current: Gdk.RGBA
  currentFg: Gdk.RGBA
}

const MATCH_TAG = 'find-match'
const CURRENT_TAG = 'find-current'

function rgba(color: Gdk.RGBA, alpha: number): Gdk.RGBA {
  return new Gdk.RGBA({ red: color.red, green: color.green, blue: color.blue, alpha })
}

function colorAttributes(color: Gdk.RGBA, foreground: boolean): Pango.Attribute[] {
  const [r, g, b] = [color.red, color.green, color.blue].map((c) => {
    return Math.round(c * 65535)
  })
  if (foreground) {
    return [Pango.attr_foreground_new(r, g, b), Pango.attr_foreground_alpha_new(Math.round(color.alpha * 65535))]
  }
  return [Pango.attr_background_new(r, g, b), Pango.attr_background_alpha_new(Math.round(color.alpha * 65535))]
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
  private _toolRows: ToolCallRow[] = []
  private _toolCallsAutoExpanded = false
  private _currentMessage: ChatMessage
  private _copyButton?: Gtk.Button
  private _copyAction?: Gio.SimpleAction
  private _reloadButton?: Gtk.Button
  private _reloadAction?: Gio.SimpleAction
  private _regenerateButton?: Gtk.Button
  private _regenerateAction?: Gio.SimpleAction
  private _busySignalId: number
  private _syntaxSignalId: number
  private _popover?: Gtk.PopoverMenu
  private _detailsButton?: Gtk.MenuButton
  private _sourcesBox?: Adw.WrapBox
  private _hasSources = false
  private _pendingSpinner?: Adw.Spinner
  private _query: string | null = null
  private _occurrences: Occurrence[] = []
  private _currentOccurrence = -1

  public get widget(): Gtk.Box {
    return this._widget
  }

  public get message(): ChatMessage {
    return this._currentMessage
  }

  public setSources(sources: Source[]): void {
    if (this._sourcesBox) {
      this._widget.remove(this._sourcesBox)
      this._sourcesBox = undefined
    }
    this._hasSources = sources.length > 0
    this._renderContent(this._currentMessage)
    if (sources.length === 0) {
      return
    }
    const numbered = /\[\d+\]/.test(stripSourcesSection(this._currentMessage.content || ''))
    const box = new Adw.WrapBox({
      child_spacing: 6,
      line_spacing: 6,
      hexpand: true,
      halign: Gtk.Align.FILL
    })
    box.add_css_class('message-sources')
    sources.forEach((source, i) => {
      const content = new Adw.ButtonContent({
        icon_name: source.kind === 'file' ? 'text-x-generic-symbolic' : 'web-browser-symbolic',
        label: numbered ? `${i + 1} · ${source.label}` : source.label
      })
      const button = new Gtk.Button({
        child: content,
        tooltip_text: source.target
      })
      button.add_css_class('pill')
      button.add_css_class('small')
      button.connect('clicked', () => {
        this._openSource(source)
      })
      box.append(button)
    })
    this._sourcesBox = box
    this._widget.append(box)
  }

  private _openSource(source: Source): void {
    const onDone = (launcher: Gtk.FileLauncher | Gtk.UriLauncher, result: Gio.AsyncResult): void => {
      try {
        launcher.launch_finish(result)
      } catch (err) {
        this._app.showToast(`Could not open ${source.label}`, true)
        console.error('Failed to open source:', err)
      }
    }
    if (source.kind === 'file') {
      const launcher = new Gtk.FileLauncher({ file: Gio.File.new_for_path(source.target) })
      launcher.launch(this._app.window, null, (_src, result) => {
        onDone(launcher, result)
      })
    } else {
      const launcher = new Gtk.UriLauncher({ uri: source.target })
      launcher.launch(this._app.window, null, (_src, result) => {
        onDone(launcher, result)
      })
    }
  }

  public setSearch(query: string | null): number {
    this._query = query?.trim() || null
    this._currentOccurrence = -1
    this._applySearch()
    return this._occurrences.length
  }

  public setCurrentOccurrence(index: number): void {
    this._currentOccurrence = index
    this._paintSearch()
  }

  public occurrenceY(index: number, target: Gtk.Widget): number | null {
    const occurrence = this._occurrences[index]
    if (!occurrence) {
      return null
    }
    const { part, range } = occurrence
    let widget = part.widget
    let y = 0
    if (part.contentLabel) {
      widget = part.contentLabel
      const [, layoutY] = part.contentLabel.get_layout_offsets()
      y = layoutY + part.contentLabel.get_layout().index_to_pos(range.start).y / Pango.SCALE
    }
    const [ok, point] = widget.compute_point(target, new Graphene.Point({ x: 0, y }))
    return ok ? point.y : null
  }

  private _applySearch(): void {
    this._occurrences = []
    for (const part of this._contentParts) {
      if (!this._query) {
        continue
      }
      if (part.contentLabel) {
        const text = part.contentLabel.get_text()
        for (const range of toByteRanges(text, findRanges(text, this._query))) {
          this._occurrences.push({ part, range })
        }
      } else if (part.buffer) {
        const text = part.buffer.get_text(part.buffer.get_start_iter(), part.buffer.get_end_iter(), false)
        for (const range of findRanges(text, this._query)) {
          this._occurrences.push({ part, range })
        }
      }
    }
    if (this._currentOccurrence >= this._occurrences.length) {
      this._currentOccurrence = -1
    }
    this._paintSearch()
  }

  public refreshSearch(): void {
    this._paintSearch()
  }

  private _searchColors(): SearchColors {
    const manager = Adw.StyleManager.get_default()
    const accent = manager.get_accent_color_rgba()
    const white = new Gdk.RGBA({ red: 1, green: 1, blue: 1, alpha: 1 })
    if (this._currentMessage.role === 'user') {
      return { match: rgba(white, 0.28), current: rgba(white, 0.92), currentFg: accent }
    }
    return { match: rgba(accent, manager.get_dark() ? 0.32 : 0.22), current: accent, currentFg: white }
  }

  private _paintSearch(): void {
    const current = this._occurrences[this._currentOccurrence]
    const colors = this._searchColors()
    for (const part of this._contentParts) {
      const ranges = this._occurrences.filter((o) => {
        return o.part === part
      })
      if (part.contentLabel) {
        if (ranges.length === 0) {
          part.contentLabel.set_attributes(null)
          continue
        }
        const attrs = new Pango.AttrList()
        for (const occurrence of ranges) {
          const isCurrent = occurrence === current
          const list = colorAttributes(isCurrent ? colors.current : colors.match, false)
          if (isCurrent) {
            list.push(...colorAttributes(colors.currentFg, true), Pango.attr_weight_new(Pango.Weight.BOLD))
          }
          for (const attr of list) {
            attr.start_index = occurrence.range.start
            attr.end_index = occurrence.range.end
            attrs.insert(attr)
          }
        }
        part.contentLabel.set_attributes(attrs)
      } else if (part.buffer) {
        const buffer = part.buffer
        const table = buffer.get_tag_table()
        const tag = (name: string): Gtk.TextTag => {
          let found = table.lookup(name)
          if (!found) {
            found = new Gtk.TextTag({ name })
            table.add(found)
          }
          found.set_priority(table.get_size() - 1)
          return found
        }
        const matchTag = tag(MATCH_TAG)
        const currentTag = tag(CURRENT_TAG)
        matchTag.background_rgba = colors.match
        currentTag.background_rgba = colors.current
        currentTag.foreground_rgba = colors.currentFg
        currentTag.weight = Pango.Weight.BOLD
        buffer.remove_tag(matchTag, buffer.get_start_iter(), buffer.get_end_iter())
        buffer.remove_tag(currentTag, buffer.get_start_iter(), buffer.get_end_iter())
        for (const occurrence of ranges) {
          const start = buffer.get_iter_at_offset(occurrence.range.start)
          const end = buffer.get_iter_at_offset(occurrence.range.end)
          buffer.apply_tag(occurrence === current ? currentTag : matchTag, start, end)
        }
      }
    }
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
    this._setupPending(message, !!props.pending)
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

  public get isEmpty(): boolean {
    const m = this._currentMessage
    return !m.content?.length && !m.thinking?.length && !m.tool_calls?.length && !m.images?.length && !m.files?.length
  }

  public destroy(): void {
    this._app.disconnect(this._busySignalId)
    this._app.disconnect(this._syntaxSignalId)
    this._popover?.unparent()
    this._popover = undefined
  }

  public setPending(pending: boolean): void {
    this._pendingSpinner?.set_visible(pending && this.isEmpty)
  }

  private _setupPending(message: ChatMessage, pending: boolean): void {
    if (!pending) {
      return
    }
    this._pendingSpinner = new Adw.Spinner({
      halign: Gtk.Align.START,
      width_request: 24,
      height_request: 24,
      margin_start: 6,
      tooltip_text: 'Waiting for the model'
    })
    this._widget.append(this._pendingSpinner)
    this._pendingSpinner.set_visible(!message.content?.length && !message.thinking?.length && !message.tool_calls?.length)
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
    this._detailsButton?.get_first_child()?.set_sensitive(sensitive)
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
    this._toolCallsExpander.connect('notify::expanded', () => {
      this._toolCallsAutoExpanded = true
    })
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
    const content = messageDisplayText(message)
    const text = content && this._hasSources ? stripSourcesSection(content) : content
    if (!text) {
      this._contentParts.forEach((p) => {
        return this._contentBox.remove(p.widget)
      })
      this._contentParts = []
      return
    }

    const finalChunks = parseMarkdownChunks(text)

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
            setMarkdownMarkup(part.contentLabel!, chunk.content)
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
        setMarkdownMarkup(label, chunk.content)
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
    if (this._query) {
      this._applySearch()
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
    }

    if (message.role === 'assistant') {
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

    this._detailsButton = new Gtk.MenuButton({
      icon_name: message.role === 'user' ? 'utilities-terminal-symbolic' : 'info-outline-symbolic',
      tooltip_text: message.role === 'user' ? 'Command details' : 'Message details',
      has_frame: false,
      valign: Gtk.Align.CENTER
    })
    this._detailsButton.get_first_child()?.add_css_class('flat')
    this._detailsButton.get_first_child()?.add_css_class('dim-label')
    this._detailsButton.set_create_popup_func((button) => {
      button.set_popover(this._createDetailsPopover())
    })
    buttonsBox.append(this._detailsButton)
    this._updateDetails(message)

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

  private _createDetailsPopover(): Gtk.Popover {
    const grid = new Gtk.Grid({
      column_spacing: 12,
      row_spacing: 6,
      margin_top: 6,
      margin_bottom: 6,
      margin_start: 6,
      margin_end: 6
    })
    messageDetails(this._currentMessage).forEach((detail, row) => {
      const key = new Gtk.Label({ label: detail.label, xalign: 1, yalign: 0 })
      key.add_css_class('dim-label')
      const value = new Gtk.Label({
        label: detail.value,
        xalign: 0,
        selectable: true,
        wrap: true,
        wrap_mode: Pango.WrapMode.WORD_CHAR,
        max_width_chars: 48
      })
      grid.attach(key, 0, row, 1, 1)
      grid.attach(value, 1, row, 1, 1)
    })
    return new Gtk.Popover({ child: grid })
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
    } else {
      menu.append_item(createMenuItem('Regenerate response', 'chat.regenerate_message', 'view-refresh-symbolic'))
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
    } else {
      this._regenerateAction = createSimpleAction('regenerate_message', () => {
        return props.onRegenerate(message)
      })
      actionGroup.add_action(this._regenerateAction)
    }

    const popover = Gtk.PopoverMenu.new_from_model(menu)
    this._popover = popover
    popover.set_parent(this._messageGroup)
    popover.set_has_arrow(false)
    popover.set_position(Gtk.PositionType.BOTTOM)
    this._messageGroup.insert_action_group('chat', actionGroup)

    setupContextMenu(this._messageGroup, popover)
  }

  private _updateToolCalls(calls?: ToolCall[]): void {
    const next = calls ?? []
    const sameStart = this._toolRows.length <= next.length && this._toolRows.every((row, i) => {
      return row.call === next[i]
    })
    if (!sameStart) {
      this._toolRows.forEach((row) => {
        this._toolCallsExpander.remove(row.widget)
      })
      this._toolRows = []
    }
    for (const call of next.slice(this._toolRows.length)) {
      const row = new ToolCallRow(this._app, call, (c) => {
        return findToolResult(this._app.conversation?.messages ?? [], c)
      })
      this._toolCallsExpander.add_row(row.widget)
      this._toolRows.push(row)
    }
  }

  public toolRow(call: ToolCall): ToolCallRow | undefined {
    return this._toolRows.find((row) => {
      return row.call === call
    })
  }

  public expandToolCalls(): void {
    if (this._toolCallsAutoExpanded) {
      return
    }
    this._toolCallsAutoExpanded = true
    this._toolCallsExpander.set_expanded(true)
  }

  private _updateDetails(message: ChatMessage): void {
    this._detailsButton?.set_visible(messageDetails(message).length > 0)
  }

  public update(updated: ChatMessage): void {
    this._currentMessage = updated
    this._updateDetails(updated)
    if (this._pendingSpinner?.get_visible()) {
      this.setPending(true)
    }
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
