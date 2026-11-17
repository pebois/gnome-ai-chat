import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import { type ManagedSection, ManageSection, type SectionHost } from '@/app/window/manage/section.js'
import type { RowBinding } from '@/app/window/manage/sidebar.js'
import { showMcpCatalogDialog } from '@/app/window/mcp/catalog.js'
import { McpServerPanel } from '@/app/window/mcp/editor.js'
import type { AppInterface } from '@/lib/app.js'
import type { McpServer } from '@/lib/db/types.js'
import { createServerFromCatalog } from '@/lib/mcp/catalog.js'
import { createServer, describeServerStatus, SERVER_NAME_RULES } from '@/lib/mcp/config.js'
import { createMenuItem, createSimpleAction } from '@/lib/ui.js'

function matchesServer(server: McpServer, text: string): boolean {
  const haystack = server.transport === 'stdio' ? `${server.command} ${server.args.join(' ')}` : server.url
  return server.name.toLowerCase().includes(text) || haystack.toLowerCase().includes(text)
}

function bindServerRow(app: AppInterface): RowBinding<McpServer> {
  const child = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
  const name = new Gtk.Label({ xalign: 0, hexpand: true, ellipsize: Pango.EllipsizeMode.END })
  const detail = new Gtk.Label({ label: '' })
  detail.add_css_class('dim-label')
  detail.add_css_class('caption')
  child.append(name)
  child.append(detail)
  return {
    child,
    update: (server, row) => {
      const status = app.mcp.status.get(server.id)
      name.label = server.name
      row.tooltip_text = describeServerStatus(server, status)
      detail.label = status?.state === 'connected' ? String(status.toolCount) : ''
    }
  }
}

function createAddMenuButton(onNew: () => void, onCatalog: () => void): Gtk.MenuButton {
  const menu = new Gio.Menu()
  menu.append_item(createMenuItem('New Server', 'servers.new', 'list-add-symbolic'))
  menu.append_item(createMenuItem('Add from Catalog', 'servers.catalog', 'view-grid-symbolic'))

  const button = new Gtk.MenuButton({
    icon_name: 'list-add-symbolic',
    tooltip_text: 'Add server (Ctrl+N for a blank one)',
    valign: Gtk.Align.CENTER,
    menu_model: menu
  })
  button.add_css_class('flat')

  const actionGroup = new Gio.SimpleActionGroup()
  actionGroup.add_action(createSimpleAction('new', onNew))
  actionGroup.add_action(createSimpleAction('catalog', onCatalog))
  button.insert_action_group('servers', actionGroup)
  return button
}

function createEmptyPage(onNew: () => void, onCatalog: () => void): Gtk.Widget {
  const page = new Adw.StatusPage({
    icon_name: 'network-server-symbolic',
    title: 'No MCP Servers',
    description: 'Add a Model Context Protocol server to give the model extra tools.'
  })
  const addBtn = new Gtk.Button({ label: 'Add Server', halign: Gtk.Align.CENTER })
  addBtn.add_css_class('pill')
  addBtn.add_css_class('suggested-action')
  addBtn.connect('clicked', onNew)
  const catalogBtn = new Gtk.Button({ label: 'Browse Catalog', halign: Gtk.Align.CENTER })
  catalogBtn.add_css_class('pill')
  catalogBtn.connect('clicked', onCatalog)
  const buttons = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, halign: Gtk.Align.CENTER })
  buttons.append(addBtn)
  buttons.append(catalogBtn)
  page.set_child(buttons)
  return page
}

export function createMcpSection(app: AppInterface, host: SectionHost): ManagedSection {
  const holder: { section?: ManageSection<McpServer> } = {}

  const onNew = (): void => {
    holder.section?.create()
  }
  const onCatalog = (): void => {
    showMcpCatalogDialog(host.window, (entry) => {
      const names = app.mcp.servers.map((s) => {
        return s.name
      })
      const server = createServerFromCatalog(entry, names, GLib.get_home_dir())
      holder.section?.add(server)
      app.showToast(`Added "${server.name}", turn it on in Settings to connect`)
    })
  }

  const panel = new McpServerPanel(app, {
    onChanged: () => {
      holder.section?.onPanelChanged()
    },
    onTest: (server) => {
      return app.mcp.test(server)
    }
  })

  holder.section = new ManageSection<McpServer>(app, host, {
    id: 'mcp',
    labels: {
      title: 'MCP Servers',
      windowTitle: 'MCP Servers',
      addTooltip: 'Add server (Ctrl+N for a blank one)',
      searchTooltip: 'Search servers (Ctrl+F)',
      deleteTooltip: 'Remove server',
      deleteMenuLabel: 'Remove Server',
      deleteHeading: 'Remove Server',
      deleteBody: (name) => {
        return `Remove "${name}" and disconnect it? This cannot be undone.`
      },
      saveError: 'Failed to save MCP server'
    },
    source: app.mcp,
    signal: 'mcp-changed',
    nameRules: SERVER_NAME_RULES,
    panel,
    emptyPage: createEmptyPage(onNew, onCatalog),
    addButton: createAddMenuButton(onNew, onCatalog),
    titleWidget: panel.switcher,
    createItem: createServer,
    canDelete: () => {
      return true
    },
    matches: matchesServer,
    bindRow: () => {
      return bindServerRow(app)
    },
    onCreated: () => {
      panel.showSettings()
    }
  })
  return holder.section
}
