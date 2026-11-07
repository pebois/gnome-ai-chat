import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import { showMcpCatalogDialog } from '@/app/window/mcp/catalog.js'
import { McpServerEditor } from '@/app/window/mcp/editor.js'
import { McpSidebar } from '@/app/window/mcp/sidebar.js'
import type { AppInterface } from '@/lib/app.js'
import { mcpStore } from '@/lib/db/mcp.js'
import type { McpServer } from '@/lib/db/types.js'
import { createServerFromCatalog, type McpCatalogEntry } from '@/lib/mcp/catalog.js'
import { createServer, validateServerName } from '@/lib/mcp/config.js'
import { errorMessage } from '@/lib/mcp/transport.js'
import { debounce } from '@/lib/timeout.js'
import { showDestructiveConfirmation } from '@/lib/ui.js'

const SAVE_DELAY_MS = 500

export class McpWindow {
  private _app: AppInterface
  private _win: Adw.Window
  private _sidebar: McpSidebar
  private _editor: McpServerEditor
  private _splitView: Adw.OverlaySplitView
  private _servers: McpServer[] = []
  private _selectedId: string | null = null
  private _dirtyIds = new Set<string>()
  private _lastNameError: string | null = null
  private _statusSignalId: number
  private _save = debounce(() => {
    this._flush()
  }, SAVE_DELAY_MS)

  constructor(app: AppInterface) {
    this._app = app
    this._win = new Adw.Window({
      title: 'Servers',
      default_width: 800,
      default_height: 600,
      transient_for: app.window
    })

    this._sidebar = new McpSidebar({
      onServerSelected: (id) => {
        this._onSelected(id)
      },
      onNewServer: () => {
        void this._createNew()
      },
      onOpenCatalog: () => {
        this._openCatalog()
      },
      onDeleteServer: (id) => {
        this._delete(id)
      }
    })

    this._editor = new McpServerEditor(this._app, {
      onChanged: () => {
        this._onChanged()
      },
      onDelete: () => {
        if (this._selectedId) {
          this._delete(this._selectedId)
        }
      },
      onTest: (server) => {
        return this._app.mcp.test(server)
      },
      onNewServer: () => {
        void this._createNew()
      },
      onOpenCatalog: () => {
        this._openCatalog()
      },
      onToggleSidebar: () => {
        this._splitView.show_sidebar = this._editor.toggleSidebarButton.active
      }
    })

    this._splitView = new Adw.OverlaySplitView({
      min_sidebar_width: 200,
      sidebar_width_fraction: 0.25
    })
    this._splitView.set_sidebar(this._sidebar.widget)
    this._splitView.set_content(this._editor.widget)
    this._win.set_content(this._splitView)

    this._statusSignalId = this._app.connect('mcp-changed', () => {
      this._refreshStatuses()
    })
    this._setupActions()
    this._setupSignals()
    void this._load()
  }

  private _setupActions(): void {
    const keyCtrl = new Gtk.EventControllerKey()
    keyCtrl.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
      const isCtrl = !!(state & Gdk.ModifierType.CONTROL_MASK)
      if (isCtrl && keyval === Gdk.KEY_b) {
        this._editor.toggleSidebarButton.active = !this._editor.toggleSidebarButton.active
        return true
      }
      if (isCtrl && keyval === Gdk.KEY_f) {
        this._sidebar.searchButton.active = !this._sidebar.searchButton.active
        return true
      }
      if (isCtrl && keyval === Gdk.KEY_n) {
        void this._createNew()
        return true
      }
      return false
    })
    this._win.add_controller(keyCtrl)
  }

  private _setupSignals(): void {
    this._splitView.connect('notify::show-sidebar', () => {
      this._editor.toggleSidebarButton.active = this._splitView.show_sidebar
    })
    this._win.connect('close-request', () => {
      this._app.disconnect(this._statusSignalId)
      this._save.cancel()
      this._flush()
      return false
    })
  }

  private async _load(): Promise<void> {
    this._servers = await mcpStore.getServers()
    this._sidebar.refresh(this._servers, this._app.mcp.status, this._selectedId)
  }

  private _server(id: string | null): McpServer | null {
    return this._servers.find((s) => {
      return s.id === id
    }) ?? null
  }

  private _onSelected(id: string | null): void {
    this._selectedId = id
    const server = this._server(id)
    this._editor.load(server, server ? this._app.mcp.status.get(server.id) : undefined)
    this._lastNameError = null
    this._editor.setNameError(false)
  }

  private _onChanged(): void {
    const server = this._server(this._selectedId)
    if (!server) {
      return
    }
    const name = this._editor.name
    const nameError = validateServerName(name, server.id, this._servers)
    this._editor.setNameError(nameError !== null)
    if (nameError) {
      if (nameError !== this._lastNameError) {
        this._lastNameError = nameError
        this._app.showToast(nameError, true)
      }
    } else {
      this._lastNameError = null
      server.name = name
    }
    this._editor.applyTo(server)
    this._sidebar.updateRow(server, this._app.mcp.status.get(server.id))
    this._editor.setStatus(server, this._app.mcp.status.get(server.id))
    this._dirtyIds.add(server.id)
    this._save()
  }

  private _flush(): void {
    const ids = [...this._dirtyIds]
    this._dirtyIds.clear()
    for (const id of ids) {
      const server = this._server(id)
      if (!server) {
        continue
      }
      mcpStore.saveServer(server).then(() => {
        return this._app.mcp.reload(id)
      }).catch((err: unknown) => {
        this._app.showToast(`Failed to save MCP server: ${errorMessage(err)}`, true)
      })
    }
  }

  private async _createNew(): Promise<void> {
    await this._addServer(createServer(this._serverNames()))
    this._editor.showSettings()
    this._editor.grabFocus()
  }

  private _serverNames(): string[] {
    return this._servers.map((s) => {
      return s.name
    })
  }

  private _openCatalog(): void {
    showMcpCatalogDialog(this._win, (entry) => {
      void this._addFromCatalog(entry)
    })
  }

  private async _addFromCatalog(entry: McpCatalogEntry): Promise<void> {
    const server = createServerFromCatalog(entry, this._serverNames(), GLib.get_home_dir())
    await this._addServer(server)
    this._app.showToast(`Added "${server.name}", turn it on in Settings to connect`)
  }

  private async _addServer(server: McpServer): Promise<void> {
    await mcpStore.saveServer(server)
    this._servers.push(server)
    this._selectedId = server.id
    this._sidebar.refresh(this._servers, this._app.mcp.status, this._selectedId)
  }

  private _delete(id: string): void {
    const server = this._server(id)
    if (!server) {
      return
    }
    showDestructiveConfirmation(
      this._win,
      'Remove Server',
      `Remove "${server.name}" and disconnect it? This cannot be undone.`,
      async () => {
        const idx = this._servers.findIndex((s) => {
          return s.id === id
        })
        if (idx === -1) {
          return
        }
        this._servers.splice(idx, 1)
        this._dirtyIds.delete(id)
        if (this._selectedId === id) {
          this._selectedId = this._servers.length > 0 ? this._servers[Math.max(0, idx - 1)].id : null
        }
        this._sidebar.refresh(this._servers, this._app.mcp.status, this._selectedId)
        await mcpStore.removeServer(id)
        await this._app.mcp.reload()
      }
    )
  }

  private _refreshStatuses(): void {
    for (const server of this._servers) {
      const status = this._app.mcp.status.get(server.id)
      this._sidebar.updateRow(server, status)
      this._editor.setStatus(server, status)
    }
  }

  public show(): void {
    this._win.present()
  }

  public select(id: string): void {
    this._selectedId = id
    if (this._servers.length > 0) {
      this._sidebar.refresh(this._servers, this._app.mcp.status, id)
    }
  }

  public onClosed(callback: () => void): void {
    this._win.connect('close-request', () => {
      callback()
      return false
    })
  }
}

let current: McpWindow | null = null

export function isMcpWindowOpen(): boolean {
  return current !== null
}

export function showMcpWindow(app: AppInterface, serverId?: string): void {
  if (!current) {
    current = new McpWindow(app)
    current.onClosed(() => {
      current = null
    })
  }
  if (serverId) {
    current.select(serverId)
  }
  current.show()
}
