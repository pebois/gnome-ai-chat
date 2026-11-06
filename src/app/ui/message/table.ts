import Gio from 'gi://Gio'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

import { setMarkdownMarkup } from '@/lib/ui.js'

export class TableRowItem extends GObject.Object {
  public cells: string[] = []

  constructor(cells: string[] = []) {
    super()
    this.cells = cells
  }
}
GObject.registerClass(TableRowItem)

export function createTableWidget(headers: string[], rows: string[][]): {
  widget: Gtk.Widget
  columnView: Gtk.ColumnView
  listStore: Gio.ListStore
} {
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
        setMarkdownMarkup(label, cellContent)
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

  return { widget: scrolled, columnView, listStore }
}
