import Adw from 'gi://Adw?version=1'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import { catalogEntrySubtitle, MCP_CATALOG, type McpCatalogCategory, type McpCatalogEntry } from '@/lib/mcp/catalog.js'

const CATEGORY_GROUPS: { category: McpCatalogCategory; title: string; description: string }[] = [
  {
    category: 'replacement',
    title: 'Built-in Tool Alternatives',
    description: 'Public servers that cover the same ground as built-in tools'
  },
  {
    category: 'addition',
    title: 'More Servers',
    description: 'Public servers that add new capabilities'
  }
]

function createEntryRow(entry: McpCatalogEntry, home: string, onAdd: (entry: McpCatalogEntry) => void): Adw.ActionRow {
  const row = new Adw.ActionRow({
    title: entry.title,
    subtitle: `${entry.description}\n${catalogEntrySubtitle(entry, home)}`,
    subtitle_lines: 3
  })
  const typeLabel = new Gtk.Label({ label: entry.transport === 'http' ? 'HTTP' : 'npx', valign: Gtk.Align.CENTER })
  typeLabel.add_css_class('dim-label')
  typeLabel.add_css_class('caption')
  row.add_suffix(typeLabel)
  const addBtn = new Gtk.Button({ icon_name: 'list-add-symbolic', tooltip_text: `Add ${entry.title}`, valign: Gtk.Align.CENTER })
  addBtn.add_css_class('flat')
  addBtn.connect('clicked', () => {
    onAdd(entry)
  })
  row.add_suffix(addBtn)
  row.activatable_widget = addBtn
  return row
}

export function showMcpCatalogDialog(parent: Gtk.Widget, onAdd: (entry: McpCatalogEntry) => void): void {
  const home = GLib.get_home_dir()
  const dialog = new Adw.Dialog({
    title: 'Server Catalog',
    content_width: 560,
    content_height: 640
  })

  const toolbarView = new Adw.ToolbarView()
  const headerBar = new Adw.HeaderBar()
  headerBar.add_css_class('flat')
  toolbarView.add_top_bar(headerBar)

  const page = new Adw.PreferencesPage({
    description: 'No API key needed. Servers are added disabled: review them, then turn them on.'
  })
  for (const group of CATEGORY_GROUPS) {
    const prefGroup = new Adw.PreferencesGroup({ title: group.title, description: group.description })
    for (const entry of MCP_CATALOG.filter((e) => {
      return e.category === group.category
    })) {
      prefGroup.add(createEntryRow(entry, home, (picked) => {
        dialog.close()
        onAdd(picked)
      }))
    }
    page.add(prefGroup)
  }

  toolbarView.set_content(page)
  dialog.set_child(toolbarView)
  dialog.present(parent)
}
