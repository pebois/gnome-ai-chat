import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SPACING } from '@/lib/constants.js'
import { mcp_permissions, mcp_transports, type McpServer } from '@/lib/db/types.js'
import { formatKeyValueLines, joinArgs, parseKeyValueLines, resolveMcpTier, splitArgs } from '@/lib/mcp/config.js'

export class McpServerSettings {
  private _app: AppInterface
  private _onChanged: () => void
  private _widget: Gtk.ScrolledWindow
  private _nameRow: Adw.EntryRow
  private _enabledRow: Adw.SwitchRow
  private _transportRow: Adw.ComboRow
  private _commandRow: Adw.EntryRow
  private _argsRow: Adw.EntryRow
  private _envBuffer: Gtk.TextBuffer
  private _urlRow: Adw.EntryRow
  private _headersBuffer: Gtk.TextBuffer
  private _permissionRow: Adw.ComboRow
  private _timeoutRow: Adw.SpinRow
  private _stdioGroups: Gtk.Widget[] = []
  private _httpGroups: Gtk.Widget[] = []
  private _loading = false
  private _server: McpServer | null = null

  public get widget(): Gtk.ScrolledWindow {
    return this._widget
  }

  public get name(): string {
    return this._nameRow.get_text().trim()
  }

  constructor(app: AppInterface, onChanged: () => void) {
    this._app = app
    this._onChanged = onChanged

    this._nameRow = new Adw.EntryRow({ title: 'Name' })
    this._enabledRow = new Adw.SwitchRow({ title: 'Enabled', subtitle: 'Connect at startup and expose tools to the model' })
    this._transportRow = new Adw.ComboRow({
      title: 'Transport',
      model: Gtk.StringList.new(['Stdio (local process)', 'Streamable HTTP'])
    })
    this._commandRow = new Adw.EntryRow({ title: 'Command' })
    this._argsRow = new Adw.EntryRow({ title: 'Arguments' })
    this._envBuffer = new Gtk.TextBuffer()
    this._urlRow = new Adw.EntryRow({ title: 'URL' })
    this._headersBuffer = new Gtk.TextBuffer()
    this._permissionRow = new Adw.ComboRow({
      title: 'Permission',
      model: Gtk.StringList.new(['Inherit', 'Ask', 'Auto-accept', 'Deny'])
    })
    this._timeoutRow = new Adw.SpinRow({
      title: 'Timeout (seconds)',
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 600, step_increment: 5, page_increment: 30, value: 30 })
    })

    this._widget = this._createContent()
    this._setupSignals()
  }

  private _createContent(): Gtk.ScrolledWindow {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 24,
      margin_top: DEFAULT_SPACING,
      margin_bottom: DEFAULT_SPACING,
      margin_start: DEFAULT_SPACING,
      margin_end: DEFAULT_SPACING
    })

    const generalGroup = new Adw.PreferencesGroup({ title: 'Server' })
    generalGroup.add(this._nameRow)
    generalGroup.add(this._enabledRow)
    generalGroup.add(this._transportRow)
    box.append(generalGroup)

    const stdioGroup = new Adw.PreferencesGroup({ title: 'Process' })
    stdioGroup.add(this._commandRow)
    stdioGroup.add(this._argsRow)
    const envGroup = McpServerSettings._createTextGroup('Environment', 'One KEY=VALUE per line, added to the process environment', this._envBuffer)
    this._stdioGroups = [stdioGroup, envGroup]

    const httpGroup = new Adw.PreferencesGroup({ title: 'Endpoint' })
    httpGroup.add(this._urlRow)
    const headersGroup = McpServerSettings._createTextGroup('Headers', 'One Header-Name=value per line, sent with every request', this._headersBuffer)
    this._httpGroups = [httpGroup, headersGroup]

    for (const group of [...this._stdioGroups, ...this._httpGroups]) {
      box.append(group)
    }

    const permissionGroup = new Adw.PreferencesGroup({ title: 'Permissions' })
    permissionGroup.add(this._permissionRow)
    permissionGroup.add(this._timeoutRow)
    box.append(permissionGroup)

    return new Gtk.ScrolledWindow({
      vexpand: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      child: new Adw.Clamp({ maximum_size: 720, child: box })
    })
  }

  private static _createTextGroup(title: string, description: string, buffer: Gtk.TextBuffer): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title, description })
    const view = new Gtk.TextView({
      buffer,
      monospace: true,
      accepts_tab: false,
      top_margin: 8,
      bottom_margin: 8,
      left_margin: DEFAULT_SPACING,
      right_margin: DEFAULT_SPACING
    })
    const scrolled = new Gtk.ScrolledWindow({
      child: view,
      min_content_height: 80,
      max_content_height: 200,
      propagate_natural_height: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER
    })
    scrolled.add_css_class('card')
    group.add(scrolled)
    return group
  }

  private static _bufferText(buffer: Gtk.TextBuffer): string {
    return buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false)
  }

  private _setupSignals(): void {
    const changed = (): void => {
      if (!this._loading) {
        this._onChanged()
      }
    }
    this._nameRow.connect('notify::text', changed)
    this._enabledRow.connect('notify::active', changed)
    this._transportRow.connect('notify::selected', () => {
      this._applyTransportVisibility()
      changed()
    })
    this._commandRow.connect('notify::text', changed)
    this._argsRow.connect('notify::text', changed)
    this._envBuffer.connect('changed', changed)
    this._urlRow.connect('notify::text', changed)
    this._headersBuffer.connect('changed', changed)
    this._permissionRow.connect('notify::selected', () => {
      this.refreshPermissionSubtitle()
      changed()
    })
    this._timeoutRow.connect('notify::value', changed)
  }

  private _applyTransportVisibility(): void {
    const isStdio = this._transportRow.selected === mcp_transports.indexOf('stdio')
    for (const group of this._stdioGroups) {
      group.visible = isStdio
    }
    for (const group of this._httpGroups) {
      group.visible = !isStdio
    }
  }

  public refreshPermissionSubtitle(): void {
    const permission = mcp_permissions[this._permissionRow.selected]
    this._permissionRow.subtitle = permission === 'inherit' && this._server
      ? `Inherits "${resolveMcpTier(this._app.settings, { ...this._server, permission })}" from Preferences → Permissions`
      : ''
  }

  public applyTo(server: McpServer): void {
    server.enabled = this._enabledRow.active
    server.transport = mcp_transports[this._transportRow.selected]
    server.command = this._commandRow.get_text().trim()
    server.args = splitArgs(this._argsRow.get_text())
    server.env = parseKeyValueLines(McpServerSettings._bufferText(this._envBuffer))
    server.url = this._urlRow.get_text().trim()
    server.headers = parseKeyValueLines(McpServerSettings._bufferText(this._headersBuffer))
    server.permission = mcp_permissions[this._permissionRow.selected]
    server.timeoutSec = Math.max(1, Math.round(this._timeoutRow.value))
  }

  public load(server: McpServer | null): void {
    this._loading = true
    this._server = server
    if (server) {
      this._nameRow.set_text(server.name)
      this._enabledRow.active = server.enabled
      this._transportRow.selected = mcp_transports.indexOf(server.transport)
      this._commandRow.set_text(server.command)
      this._argsRow.set_text(joinArgs(server.args))
      this._envBuffer.set_text(formatKeyValueLines(server.env), -1)
      this._urlRow.set_text(server.url)
      this._headersBuffer.set_text(formatKeyValueLines(server.headers), -1)
      this._permissionRow.selected = mcp_permissions.indexOf(server.permission)
      this._timeoutRow.value = server.timeoutSec
      this._applyTransportVisibility()
      this.refreshPermissionSubtitle()
    }
    this._loading = false
  }

  public setNameError(hasError: boolean): void {
    if (hasError) {
      this._nameRow.add_css_class('error')
    } else {
      this._nameRow.remove_css_class('error')
    }
  }

  public grabFocus(): void {
    this._nameRow.grab_focus()
  }
}
