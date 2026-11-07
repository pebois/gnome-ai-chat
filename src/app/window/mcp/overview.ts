import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SPACING } from '@/lib/constants.js'
import type { McpServer, McpServerStatus } from '@/lib/db/types.js'
import { connectionKey, describeServerStatus, describeToolList } from '@/lib/mcp/config.js'
import type { McpToolDefinition } from '@/lib/mcp/jsonrpc.js'
import { errorMessage } from '@/lib/mcp/transport.js'

const STATUS_CLASSES = ['success', 'error']

function applyStatusDot(dot: Gtk.Widget, spinner: Adw.Spinner, server: McpServer, status?: McpServerStatus): void {
  const connecting = status?.state === 'connecting'
  spinner.visible = connecting
  dot.visible = !connecting
  for (const cls of STATUS_CLASSES) {
    dot.remove_css_class(cls)
  }
  if (server.enabled && status?.state === 'connected') {
    dot.add_css_class('success')
  } else if (server.enabled && status?.state === 'error') {
    dot.add_css_class('error')
  }
  dot.tooltip_text = describeServerStatus(server, status)
}

export type McpTestHandler = (server: McpServer) => Promise<McpToolDefinition[]>

interface TestResult {
  key: string
  running: boolean
  error?: string
  tools: McpToolDefinition[]
}

export class McpServerOverview {
  private _app: AppInterface
  private _onTest: McpTestHandler
  private _widget: Gtk.ScrolledWindow
  private _statusRow: Adw.ActionRow
  private _statusDot: Gtk.Box
  private _statusSpinner: Adw.Spinner
  private _testRow: Adw.ActionRow
  private _testBtn: Gtk.Button
  private _testSpinner: Adw.Spinner
  private _toolsGroup: Adw.PreferencesGroup
  private _toolRows: Gtk.Widget[] = []
  private _testResults = new Map<string, TestResult>()
  private _server: McpServer | null = null

  public get widget(): Gtk.ScrolledWindow {
    return this._widget
  }

  constructor(app: AppInterface, onTest: McpTestHandler) {
    this._app = app
    this._onTest = onTest

    this._statusDot = new Gtk.Box({ valign: Gtk.Align.CENTER, css_classes: ['mcp-status-dot'] })
    this._statusSpinner = new Adw.Spinner({ visible: false })
    this._statusRow = new Adw.ActionRow({ title: 'Status' })
    this._testRow = new Adw.ActionRow({ title: 'Test connection', subtitle: 'Not tested' })
    this._testBtn = new Gtk.Button({ label: 'Test', valign: Gtk.Align.CENTER })
    this._testSpinner = new Adw.Spinner({ visible: false, valign: Gtk.Align.CENTER })
    this._toolsGroup = new Adw.PreferencesGroup({ title: 'Tools' })

    this._widget = this._createContent()
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

    const statusBox = new Gtk.Box({ valign: Gtk.Align.CENTER })
    statusBox.append(this._statusSpinner)
    statusBox.append(this._statusDot)
    this._statusRow.add_prefix(statusBox)
    this._testBtn.connect('clicked', () => {
      void this._runTest()
    })
    this._testRow.add_suffix(this._testSpinner)
    this._testRow.add_suffix(this._testBtn)
    const connectionGroup = new Adw.PreferencesGroup({ title: 'Connection' })
    connectionGroup.add(this._statusRow)
    connectionGroup.add(this._testRow)
    box.append(connectionGroup)
    box.append(this._toolsGroup)

    return new Gtk.ScrolledWindow({
      vexpand: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      child: new Adw.Clamp({ maximum_size: 720, child: box })
    })
  }

  public setServer(server: McpServer | null): void {
    this._server = server
  }

  public setStatus(server: McpServer, status?: McpServerStatus): void {
    if (this._server?.id !== server.id) {
      return
    }
    this._statusRow.subtitle = describeServerStatus(server, status)
    applyStatusDot(this._statusDot, this._statusSpinner, server, status)
    this._refreshTest(server)
    this._refreshTools(server, status)
  }

  private _currentTest(server: McpServer): TestResult | undefined {
    const result = this._testResults.get(server.id)
    if (result && result.key !== connectionKey(server)) {
      this._testResults.delete(server.id)
      return undefined
    }
    return result
  }

  private _refreshTest(server: McpServer): void {
    const result = this._currentTest(server)
    const running = result?.running ?? false
    this._testSpinner.visible = running
    this._testBtn.sensitive = !running
    this._testRow.remove_css_class('error')
    if (!result) {
      this._testRow.subtitle = 'Not tested'
    } else if (running) {
      this._testRow.subtitle = 'Testing…'
    } else if (result.error) {
      this._testRow.subtitle = `Failed: ${result.error}`
      this._testRow.add_css_class('error')
    } else {
      this._testRow.subtitle = `OK, ${describeToolList(result.tools.length).toLowerCase()}`
    }
    this._testRow.tooltip_text = result?.error ?? ''
  }

  private _refreshTools(server: McpServer, status?: McpServerStatus): void {
    for (const row of this._toolRows) {
      this._toolsGroup.remove(row)
    }
    this._toolRows = []

    const live = status?.state === 'connected' ? this._app.mcp.getServerTools(server.id) : []
    const test = this._currentTest(server)
    const tools = live.length > 0 || status?.state === 'connected' ? live : test && !test.running ? test.tools : []
    const source = status?.state === 'connected' ? 'Live' : test && !test.running && !test.error ? 'From last test' : ''

    this._toolsGroup.description = source ? `${source} · ${describeToolList(tools.length).toLowerCase()}` : ''
    if (!source) {
      const placeholder = new Adw.ActionRow({
        title: 'No tools yet',
        subtitle: 'Enable the server or run a test to list its tools',
        sensitive: false
      })
      this._toolsGroup.add(placeholder)
      this._toolRows.push(placeholder)
      return
    }
    for (const tool of tools) {
      const description = tool.description?.trim() ?? ''
      const row = new Adw.ActionRow({
        title: tool.name,
        subtitle: description,
        subtitle_lines: 2,
        tooltip_text: description,
        use_markup: false
      })
      this._toolsGroup.add(row)
      this._toolRows.push(row)
    }
  }

  private async _runTest(): Promise<void> {
    const server = this._server
    if (!server) {
      return
    }
    const key = connectionKey(server)
    this._testResults.set(server.id, { key, running: true, tools: [] })
    this._refreshTest(server)
    let result: TestResult
    try {
      const tools = await this._onTest({ ...server })
      result = { key, running: false, tools }
    } catch (err) {
      result = { key, running: false, error: errorMessage(err), tools: [] }
    }
    this._testResults.set(server.id, result)
    if (this._server?.id === server.id) {
      this._refreshTest(server)
      this._refreshTools(server, this._app.mcp.status.get(server.id))
    }
  }
}
