import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import { McpServerOverview, type McpTestHandler } from '@/app/window/mcp/overview.js'
import { McpServerSettings } from '@/app/window/mcp/settings.js'
import type { AppInterface } from '@/lib/app.js'
import type { McpServer, McpServerStatus } from '@/lib/db/types.js'

export interface McpEditorCallbacks {
  onChanged: () => void
  onDelete: () => void
  onTest: McpTestHandler
  onNewServer: () => void
  onOpenCatalog: () => void
  onToggleSidebar: () => void
}

export class McpServerEditor {
  private _callbacks: McpEditorCallbacks
  private _widget: Adw.ToolbarView
  private _stack: Gtk.Stack
  private _viewStack: Adw.ViewStack
  private _switcher: Adw.ViewSwitcher
  private _overviewPage: Adw.ViewStackPage
  private _overview: McpServerOverview
  private _settings: McpServerSettings
  private _toggleSidebarBtn: Gtk.ToggleButton
  private _deleteBtn: Gtk.Button
  private _serverId: string | null = null

  public get widget(): Adw.ToolbarView {
    return this._widget
  }

  public get toggleSidebarButton(): Gtk.ToggleButton {
    return this._toggleSidebarBtn
  }

  public get name(): string {
    return this._settings.name
  }

  constructor(app: AppInterface, callbacks: McpEditorCallbacks) {
    this._callbacks = callbacks
    this._overview = new McpServerOverview(app, callbacks.onTest)
    this._settings = new McpServerSettings(app, callbacks.onChanged)

    this._viewStack = new Adw.ViewStack({ vexpand: true })
    this._overviewPage = this._viewStack.add_titled_with_icon(this._overview.widget, 'overview', 'Overview', 'network-server-symbolic')
    this._viewStack.add_titled_with_icon(this._settings.widget, 'settings', 'Settings', 'document-edit-symbolic')
    this._switcher = new Adw.ViewSwitcher({ stack: this._viewStack, policy: Adw.ViewSwitcherPolicy.WIDE })

    this._widget = new Adw.ToolbarView()
    const header = new Adw.HeaderBar({ title_widget: this._switcher })

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
      tooltip_text: 'Remove server',
      valign: Gtk.Align.CENTER
    })
    this._deleteBtn.add_css_class('flat')
    this._deleteBtn.add_css_class('destructive-action')
    this._deleteBtn.connect('clicked', () => {
      return this._callbacks.onDelete()
    })
    header.pack_end(this._deleteBtn)

    this._widget.add_top_bar(header)

    this._stack = new Gtk.Stack({ vexpand: true })
    this._stack.add_named(this._createEmptyPage(), 'empty')
    this._stack.add_named(this._viewStack, 'server')
    this._widget.set_content(this._stack)

    this.load(null)
  }

  private _createEmptyPage(): Gtk.Widget {
    const page = new Adw.StatusPage({
      icon_name: 'network-server-symbolic',
      title: 'No MCP Servers',
      description: 'Add a Model Context Protocol server to give the model extra tools.'
    })
    const addBtn = new Gtk.Button({ label: 'Add Server', halign: Gtk.Align.CENTER })
    addBtn.add_css_class('pill')
    addBtn.add_css_class('suggested-action')
    addBtn.connect('clicked', () => {
      return this._callbacks.onNewServer()
    })
    const catalogBtn = new Gtk.Button({ label: 'Browse Catalog', halign: Gtk.Align.CENTER })
    catalogBtn.add_css_class('pill')
    catalogBtn.connect('clicked', () => {
      return this._callbacks.onOpenCatalog()
    })
    const buttons = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, halign: Gtk.Align.CENTER })
    buttons.append(addBtn)
    buttons.append(catalogBtn)
    page.set_child(buttons)
    return page
  }

  public applyTo(server: McpServer): void {
    this._settings.applyTo(server)
  }

  public load(server: McpServer | null, status?: McpServerStatus): void {
    this._serverId = server?.id ?? null
    this._stack.visible_child_name = server ? 'server' : 'empty'
    this._deleteBtn.visible = server !== null
    this._switcher.visible = server !== null
    this._overview.setServer(server)
    this._settings.load(server)
    if (server) {
      this.setStatus(server, status)
    } else {
      this._overviewPage.needs_attention = false
    }
  }

  public setStatus(server: McpServer, status?: McpServerStatus): void {
    if (this._serverId !== server.id) {
      return
    }
    this._overview.setStatus(server, status)
    this._settings.refreshPermissionSubtitle()
    this._overviewPage.needs_attention = server.enabled && status?.state === 'error'
  }

  public showSettings(): void {
    this._viewStack.visible_child_name = 'settings'
  }

  public setNameError(hasError: boolean): void {
    this._settings.setNameError(hasError)
  }

  public grabFocus(): void {
    this._settings.grabFocus()
  }
}
