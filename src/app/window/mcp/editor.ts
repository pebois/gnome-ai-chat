import Adw from 'gi://Adw?version=1'

import type { ItemPanel } from '@/app/window/manage/section.js'
import { McpServerOverview, type McpTestHandler } from '@/app/window/mcp/overview.js'
import { McpServerSettings } from '@/app/window/mcp/settings.js'
import type { AppInterface } from '@/lib/app.js'
import type { McpServer } from '@/lib/db/types.js'

export interface McpPanelCallbacks {
  onChanged: () => void
  onTest: McpTestHandler
}

export class McpServerPanel implements ItemPanel<McpServer> {
  private _app: AppInterface
  private _viewStack: Adw.ViewStack
  private _switcher: Adw.ViewSwitcher
  private _overviewPage: Adw.ViewStackPage
  private _overview: McpServerOverview
  private _settings: McpServerSettings
  private _serverId: string | null = null

  public get widget(): Adw.ViewStack {
    return this._viewStack
  }

  public get switcher(): Adw.ViewSwitcher {
    return this._switcher
  }

  public get name(): string {
    return this._settings.name
  }

  constructor(app: AppInterface, callbacks: McpPanelCallbacks) {
    this._app = app
    this._overview = new McpServerOverview(app, callbacks.onTest)
    this._settings = new McpServerSettings(app, callbacks.onChanged)

    this._viewStack = new Adw.ViewStack({ vexpand: true })
    this._overviewPage = this._viewStack.add_titled_with_icon(this._overview.widget, 'overview', 'Overview', 'network-server-symbolic')
    this._viewStack.add_titled_with_icon(this._settings.widget, 'settings', 'Settings', 'document-edit-symbolic')
    this._switcher = new Adw.ViewSwitcher({ stack: this._viewStack, policy: Adw.ViewSwitcherPolicy.WIDE })
  }

  public applyTo(server: McpServer): void {
    this._settings.applyTo(server)
  }

  public load(server: McpServer | null): void {
    this._serverId = server?.id ?? null
    this._overview.setServer(server)
    this._settings.load(server)
    if (server) {
      this.sync(server)
    } else {
      this._overviewPage.needs_attention = false
    }
  }

  public sync(server: McpServer): void {
    if (this._serverId !== server.id) {
      return
    }
    const status = this._app.mcp.status.get(server.id)
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
