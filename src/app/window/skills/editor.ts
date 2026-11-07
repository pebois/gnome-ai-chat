import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'

import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'
import type { Skill } from '@/lib/db/types.js'
import { formatToolTitle, skillToolStatus } from '@/lib/tools/groups.js'

export interface EditorCallbacks {
  onChanged: () => void
  onDelete: () => void
  onReset: () => void
  onToggleSidebar: () => void
}

export class SkillEditor {
  private _app: AppInterface
  private _callbacks: EditorCallbacks
  private _widget: Adw.ToolbarView
  private _nameRow: Adw.EntryRow
  private _descRow: Adw.EntryRow
  private _toolsRow: Adw.ActionRow
  private _toolsStatus: Gtk.Label
  private _buffer: GtkSource.Buffer
  private _sourceView: GtkSource.View
  private _deleteBtn: Gtk.Button
  private _resetBtn: Gtk.Button
  private _toggleSidebarBtn: Gtk.ToggleButton
  private _syntaxSignalId: number

  public get widget(): Adw.ToolbarView {
    return this._widget
  }

  public get name(): string {
    return this._nameRow.get_text().trim()
  }

  public get description(): string {
    return this._descRow.get_text().trim()
  }

  public get prompt(): string {
    return this._buffer.get_text(this._buffer.get_start_iter(), this._buffer.get_end_iter(), false)
  }

  public get toggleSidebarButton(): Gtk.ToggleButton {
    return this._toggleSidebarBtn
  }

  constructor(app: AppInterface, callbacks: EditorCallbacks) {
    this._app = app
    this._callbacks = callbacks

    this._widget = new Adw.ToolbarView()
    const header = new Adw.HeaderBar()

    this._toggleSidebarBtn = new Gtk.ToggleButton({
      icon_name: 'sidebar-show-symbolic',
      tooltip_text: 'Toggle Sidebar (ctrl+b)',
      active: true
    })
    this._toggleSidebarBtn.connect('toggled', () => {
      return this._callbacks.onToggleSidebar()
    })
    header.pack_start(this._toggleSidebarBtn)

    this._deleteBtn = new Gtk.Button({
      icon_name: 'user-trash-symbolic',
      tooltip_text: 'Delete skill',
      valign: Gtk.Align.CENTER
    })
    this._deleteBtn.add_css_class('flat')
    this._deleteBtn.add_css_class('destructive-action')
    this._deleteBtn.connect('clicked', () => {
      return this._callbacks.onDelete()
    })
    header.pack_end(this._deleteBtn)

    this._resetBtn = new Gtk.Button({
      icon_name: 'edit-undo-symbolic',
      tooltip_text: 'Reset skill to default',
      valign: Gtk.Align.CENTER
    })
    this._resetBtn.add_css_class('flat')
    this._resetBtn.connect('clicked', () => {
      return this._callbacks.onReset()
    })
    header.pack_end(this._resetBtn)

    this._widget.add_top_bar(header)

    const contentBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 12,
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12
    })

    const metaGroup = new Adw.PreferencesGroup()
    this._nameRow = new Adw.EntryRow({ title: 'Name' })
    this._descRow = new Adw.EntryRow({ title: 'Description' })
    metaGroup.add(this._nameRow)
    metaGroup.add(this._descRow)
    this._toolsRow = new Adw.ActionRow({ title: 'Linked Tools', visible: false })
    this._toolsStatus = new Gtk.Label({ valign: Gtk.Align.CENTER })
    this._toolsStatus.add_css_class('caption')
    this._toolsRow.add_suffix(this._toolsStatus)
    metaGroup.add(this._toolsRow)
    contentBox.append(metaGroup)

    const lm = GtkSource.LanguageManager.get_default()
    this._buffer = new GtkSource.Buffer()
    const lang = lm.get_language('markdown')
    if (lang) {
      this._buffer.set_language(lang)
    }

    const sm = GtkSource.StyleSchemeManager.get_default()
    const scheme = sm.get_scheme(this._app.settings.syntax || DEFAULT_SYNTAX_THEME)
    if (scheme) {
      this._buffer.set_style_scheme(scheme)
    }

    this._sourceView = new GtkSource.View({
      buffer: this._buffer,
      wrap_mode: Gtk.WrapMode.WORD_CHAR,
      left_margin: 12,
      right_margin: 12,
      top_margin: 12,
      bottom_margin: 12,
      monospace: true,
      vexpand: true
    })

    const editorScrolled = new Gtk.ScrolledWindow({
      vexpand: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER
    })
    editorScrolled.add_css_class('view')
    editorScrolled.add_css_class('frame')
    editorScrolled.set_child(this._sourceView)
    contentBox.append(editorScrolled)

    this._widget.set_content(contentBox)

    this._setupSignals()

    this._syntaxSignalId = this._app.connect('syntax-changed', (_, theme) => {
      const scheme = sm.get_scheme(theme)
      if (scheme) {
        this._buffer.set_style_scheme(scheme)
      }
    })
  }

  public destroy(): void {
    this._app.disconnect(this._syntaxSignalId)
  }

  private _setupSignals(): void {
    this._nameRow.connect('notify::text', () => {
      return this._callbacks.onChanged()
    })
    this._descRow.connect('notify::text', () => {
      return this._callbacks.onChanged()
    })
    this._buffer.connect('changed', () => {
      return this._callbacks.onChanged()
    })
  }

  public load(skill: Skill | null, isBuiltin: boolean, differsFromDefault: boolean): void {
    const name = skill?.name ?? ''
    if (this._nameRow.get_text() !== name) {
      this._nameRow.set_text(name)
    }

    const description = skill?.description ?? ''
    if (this._descRow.get_text() !== description) {
      this._descRow.set_text(description)
    }

    const prompt = skill?.prompt ?? ''
    const currentPrompt = this._buffer.get_text(this._buffer.get_start_iter(), this._buffer.get_end_iter(), false)
    if (currentPrompt !== prompt) {
      this._buffer.set_text(prompt, -1)
    }

    const active = skill !== null
    this._updateLinkedTools(skill)
    this._nameRow.sensitive = active
    this._descRow.sensitive = active
    this._sourceView.sensitive = active

    this.updateActions(active && isBuiltin, differsFromDefault)
    this._deleteBtn.visible = active && !isBuiltin
    this._deleteBtn.sensitive = active && !isBuiltin
  }

  private _updateLinkedTools(skill: Skill | null): void {
    const { disabled, required } = skill ? skillToolStatus(skill, this._app.settings) : { disabled: [], required: [] }
    this._toolsRow.visible = required.length > 0
    if (required.length === 0) {
      return
    }
    this._toolsRow.subtitle = required.map(formatToolTitle).join(', ')
    const hidden = disabled.length > 0
    this._toolsStatus.label = hidden ? `Hidden: ${disabled.length} tool${disabled.length === 1 ? '' : 's'} turned off` : 'Available'
    this._toolsStatus.tooltip_text = hidden ? `Turned off in Settings → Tools: ${disabled.map(formatToolTitle).join(', ')}` : 'All linked tools are on'
    this._toolsStatus.remove_css_class(hidden ? 'success' : 'warning')
    this._toolsStatus.add_css_class(hidden ? 'warning' : 'success')
  }

  public updateActions(isBuiltin: boolean, differsFromDefault: boolean): void {
    this._resetBtn.visible = isBuiltin
    this._resetBtn.sensitive = isBuiltin && differsFromDefault
  }

  public grabFocus(): void {
    this._nameRow.grab_focus()
  }

  public updateSyntax(scheme: GtkSource.StyleScheme): void {
    this._buffer.set_style_scheme(scheme)
  }
}
