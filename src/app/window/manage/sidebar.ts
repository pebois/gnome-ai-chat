import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk?version=4.0'

import type { NamedItem } from '@/lib/naming.js'
import { createMenuItem, createSimpleAction, setupContextMenu } from '@/lib/ui.js'

export interface SidebarGroup<T> {
  title?: string
  action?: Gtk.Widget
  items: T[]
}

export interface RowBinding<T> {
  child: Gtk.Widget
  update: (item: T, row: Gtk.ListBoxRow) => void
}

export interface ItemSidebarOptions<T extends NamedItem> {
  getItems: () => T[]
  groups: (items: T[], searching: boolean) => SidebarGroup<T>[]
  matches: (item: T, text: string) => boolean
  bindRow: (item: T) => RowBinding<T>
  canDelete: (item: T) => boolean
  deleteLabel: string
  onSelected: (id: string | null) => void
  onDelete: (id: string) => void
  onSearchChanged?: (text: string) => void
  onSearchModeChanged?: (enabled: boolean) => void
}

interface RowEntry<T> {
  row: Gtk.ListBoxRow
  binding: RowBinding<T>
}

export class ItemSidebar<T extends NamedItem> {
  private _options: ItemSidebarOptions<T>
  private _widget: Gtk.Box
  private _searchEntry: Gtk.SearchEntry
  private _searchBar: Gtk.SearchBar
  private _listBox: Gtk.ListBox
  private _rows = new Map<string, RowEntry<T>>()
  private _rowToId = new Map<Gtk.ListBoxRow, string>()
  private _refreshing = false
  private _searchText = ''
  private _selectedId: string | null = null

  public get widget(): Gtk.Box {
    return this._widget
  }

  public get searchMode(): boolean {
    return this._searchBar.search_mode_enabled
  }

  public set searchMode(enabled: boolean) {
    this._searchBar.search_mode_enabled = enabled
  }

  public get searchText(): string {
    return this._searchText
  }

  constructor(options: ItemSidebarOptions<T>) {
    this._options = options

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

    this._widget = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
    this._widget.append(this._searchBar)
    this._widget.append(scrolled)

    this._setupSignals()
  }

  private _setupSignals(): void {
    this._searchBar.connect('notify::search-mode-enabled', () => {
      const enabled = this._searchBar.search_mode_enabled
      if (!enabled) {
        this._searchEntry.set_text('')
        this._setSearchText('')
      }
      this._options.onSearchModeChanged?.(enabled)
    })
    this._searchEntry.connect('search-changed', () => {
      this._setSearchText(this._searchEntry.get_text().toLowerCase().trim())
    })
    this._listBox.connect('row-selected', (_lb, row) => {
      if (this._refreshing) {
        return
      }
      this._selectedId = row ? this._rowToId.get(row) ?? null : null
      this._options.onSelected(this._selectedId)
    })
  }

  private _setSearchText(text: string): void {
    if (text === this._searchText) {
      return
    }
    this._searchText = text
    this.refresh()
    this._options.onSearchChanged?.(text)
  }

  public refresh(selectedId: string | null = this._selectedId): void {
    this._selectedId = selectedId
    this._refreshing = true
    this._rows.clear()
    this._rowToId.clear()
    let child = this._listBox.get_first_child()
    while (child) {
      this._listBox.remove(child)
      child = this._listBox.get_first_child()
    }

    const searching = this._searchText !== ''
    const items = this._options.getItems().filter((item) => {
      return !searching || this._options.matches(item, this._searchText)
    })
    for (const group of this._options.groups(items, searching)) {
      if (group.title) {
        this._addHeaderRow(group.title, group.action)
      }
      for (const item of group.items) {
        this._addRow(item)
      }
    }
    this._refreshing = false

    const selected = (this._selectedId && this._rows.get(this._selectedId)?.row) ?? this._rows.values().next().value?.row ?? null
    if (selected) {
      this._listBox.select_row(selected)
    } else {
      this._selectedId = null
      this._options.onSelected(null)
    }
  }

  public updateRow(item: T): void {
    const entry = this._rows.get(item.id)
    if (entry) {
      entry.binding.update(item, entry.row)
    }
  }

  public updateRows(): void {
    for (const item of this._options.getItems()) {
      this.updateRow(item)
    }
  }

  private _addHeaderRow(title: string, action?: Gtk.Widget): void {
    const label = new Gtk.Label({ label: title, xalign: 0, hexpand: true })
    label.add_css_class('dim-label')
    label.add_css_class('caption-heading')

    const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    box.append(label)
    if (action) {
      box.append(action)
    }

    this._listBox.append(new Gtk.ListBoxRow({
      child: box,
      activatable: false,
      selectable: false
    }))
  }

  private _addRow(item: T): void {
    const binding = this._options.bindRow(item)
    const row = new Gtk.ListBoxRow({ child: binding.child })
    this._rows.set(item.id, { row, binding })
    this._rowToId.set(row, item.id)

    if (this._options.canDelete(item)) {
      const actionGroup = new Gio.SimpleActionGroup()
      actionGroup.add_action(createSimpleAction('delete', () => {
        return this._options.onDelete(item.id)
      }))
      row.insert_action_group('item', actionGroup)
      const menu = new Gio.Menu()
      menu.append_item(createMenuItem(this._options.deleteLabel, 'item.delete', 'user-trash-symbolic'))
      const popover = Gtk.PopoverMenu.new_from_model(menu)
      popover.set_parent(row)
      popover.set_has_arrow(false)
      popover.set_position(Gtk.PositionType.BOTTOM)
      setupContextMenu(row, popover)
    }

    this._listBox.append(row)
    binding.update(item, row)
  }
}
