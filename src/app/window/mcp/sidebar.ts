import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import type { McpServer, McpServerStatus } from '@/lib/db/types.js'
import { describeServerStatus } from '@/lib/mcp/config.js'
import { createMenuItem, createSimpleAction, setupContextMenu } from '@/lib/ui.js'

export interface McpSidebarCallbacks {
  onServerSelected: (id: string | null) => void
  onNewServer: () => void
  onDeleteServer: (id: string) => void
}

interface RowWidgets {
  row: Gtk.ListBoxRow
  name: Gtk.Label
  detail: Gtk.Label
}

export class McpSidebar {
  private _callbacks: McpSidebarCallbacks
  private _widget: Adw.ToolbarView
  private _searchBtn: Gtk.ToggleButton
  private _searchEntry: Gtk.SearchEntry
  private _searchBar: Gtk.SearchBar
  private _listBox: Gtk.ListBox
  private _rows = new Map<string, RowWidgets>()
  private _rowToId = new Map<Gtk.ListBoxRow, string>()
  private _refreshing = false
  private _searchText = ''
  private _servers: McpServer[] = []
  private _statuses = new Map<string, McpServerStatus>()
  private _selectedId: string | null = null

  public get widget(): Adw.ToolbarView {
    return this._widget
  }

  public get searchButton(): Gtk.ToggleButton {
    return this._searchBtn
  }

  constructor(callbacks: McpSidebarCallbacks) {
    this._callbacks = callbacks

    this._widget = new Adw.ToolbarView()
    const header = new Adw.HeaderBar()
    header.add_css_class('flat')

    const addBtn = new Gtk.Button({
      icon_name: 'list-add-symbolic',
      tooltip_text: 'New server (ctrl+n)',
      valign: Gtk.Align.CENTER
    })
    addBtn.add_css_class('flat')
    addBtn.connect('clicked', () => {
      return this._callbacks.onNewServer()
    })
    header.pack_start(addBtn)

    this._searchBtn = new Gtk.ToggleButton({
      icon_name: 'system-search-symbolic',
      tooltip_text: 'Search servers (ctrl+f)',
      valign: Gtk.Align.CENTER
    })
    this._searchBtn.add_css_class('flat')
    header.pack_end(this._searchBtn)

    this._widget.add_top_bar(header)

    this._searchEntry = new Gtk.SearchEntry({ hexpand: true })
    this._searchBar = new Gtk.SearchBar({ child: this._searchEntry })
    this._searchBar.connect_entry(this._searchEntry)

    this._listBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.SINGLE })
    this._listBox.add_css_class('navigation-sidebar')

    const scrolled = new Gtk.ScrolledWindow({
      vexpand: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER
    })
    scrolled.set_child(this._listBox)

    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
    box.append(this._searchBar)
    box.append(scrolled)
    this._widget.set_content(box)

    this._setupSignals()
  }

  private _setupSignals(): void {
    this._searchBtn.connect('toggled', () => {
      this._searchBar.search_mode_enabled = this._searchBtn.active
    })
    this._searchBar.connect('notify::search-mode-enabled', () => {
      this._searchBtn.active = this._searchBar.search_mode_enabled
      if (!this._searchBar.search_mode_enabled) {
        this._searchEntry.set_text('')
        this._searchText = ''
        this._render()
      }
    })
    this._searchEntry.connect('search-changed', () => {
      this._searchText = this._searchEntry.get_text().toLowerCase().trim()
      this._render()
    })
    this._listBox.connect('row-selected', (_lb, row) => {
      if (this._refreshing) {
        return
      }
      this._callbacks.onServerSelected(row ? this._rowToId.get(row) ?? null : null)
    })
  }

  public refresh(servers: McpServer[], statuses: Map<string, McpServerStatus>, selectedId: string | null): void {
    this._servers = servers
    this._statuses = statuses
    this._selectedId = selectedId
    this._render()
  }

  private _matches(server: McpServer): boolean {
    if (!this._searchText) {
      return true
    }
    const haystack = server.transport === 'stdio' ? `${server.command} ${server.args.join(' ')}` : server.url
    return server.name.toLowerCase().includes(this._searchText) || haystack.toLowerCase().includes(this._searchText)
  }

  private _render(): void {
    this._refreshing = true
    this._rows.clear()
    this._rowToId.clear()
    let child = this._listBox.get_first_child()
    while (child) {
      this._listBox.remove(child)
      child = this._listBox.get_first_child()
    }
    for (const server of this._servers) {
      if (this._matches(server)) {
        this._addRow(server, this._statuses.get(server.id))
      }
    }
    this._refreshing = false

    const selected = (this._selectedId && this._rows.get(this._selectedId)?.row) ?? this._rows.values().next().value?.row ?? null
    if (selected) {
      this._listBox.select_row(selected)
    } else {
      this._callbacks.onServerSelected(null)
    }
  }

  public updateRow(server: McpServer, status?: McpServerStatus): void {
    const widgets = this._rows.get(server.id)
    if (!widgets) {
      return
    }
    widgets.name.label = server.name
    widgets.row.tooltip_text = describeServerStatus(server, status)
    widgets.detail.label = status?.state === 'connected' ? String(status.toolCount) : ''
  }

  private _addRow(server: McpServer, status?: McpServerStatus): void {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const name = new Gtk.Label({ label: server.name, xalign: 0, hexpand: true, ellipsize: Pango.EllipsizeMode.END })
    const detail = new Gtk.Label({ label: '' })
    detail.add_css_class('dim-label')
    detail.add_css_class('caption')
    box.append(name)
    box.append(detail)

    const row = new Gtk.ListBoxRow({ child: box, tooltip_text: server.name })
    this._rows.set(server.id, { row, name, detail })
    this._rowToId.set(row, server.id)

    const actionGroup = new Gio.SimpleActionGroup()
    actionGroup.add_action(createSimpleAction('delete', () => {
      return this._callbacks.onDeleteServer(server.id)
    }))
    row.insert_action_group('server', actionGroup)
    const menu = new Gio.Menu()
    menu.append_item(createMenuItem('Remove Server', 'server.delete', 'user-trash-symbolic'))
    const popover = Gtk.PopoverMenu.new_from_model(menu)
    popover.set_parent(row)
    popover.set_has_arrow(false)
    popover.set_position(Gtk.PositionType.BOTTOM)
    setupContextMenu(row, popover)

    this._listBox.append(row)
    this.updateRow(server, status)
  }
}
