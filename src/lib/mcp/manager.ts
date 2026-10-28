import type Gio from 'gi://Gio'

import type { AppInterface } from '@/lib/app.js'
import { MCP_RECONNECT_DELAYS_MS, MCP_STABLE_CONNECTION_MS } from '@/lib/constants.js'
import { mcpStore } from '@/lib/db/mcp.js'
import type { McpServer, McpServerStatus } from '@/lib/db/types.js'
import { debug } from '@/lib/debug.js'
import { McpClient } from '@/lib/mcp/client.js'
import { buildMcpToolName, commandLine, connectionKey, formatMcpToolLabel, parseMcpToolName, resolveMcpTier, validateServer } from '@/lib/mcp/config.js'
import { HttpTransport } from '@/lib/mcp/http.js'
import { type McpToolDefinition, mcpToolToOllamaTool, toolResultToString } from '@/lib/mcp/jsonrpc.js'
import { checkMcpPermission } from '@/lib/mcp/permissions.js'
import { StdioTransport } from '@/lib/mcp/stdio.js'
import { errorMessage, type McpTransport } from '@/lib/mcp/transport.js'
import type { Tool } from '@/lib/providers/index.js'
import { sleep } from '@/lib/timeout.js'

interface IndexedTool {
  serverId: string
  client: McpClient
  definition: McpToolDefinition
}

export interface McpToolInfo {
  server: McpServer
  definition: McpToolDefinition
}

export interface McpToolLabel {
  label: string
  description?: string
}

export class McpManager {
  public servers: McpServer[] = []
  public status: Map<string, McpServerStatus> = new Map()
  public onChanged?: () => void
  public onError?: (server: McpServer, message: string) => void

  private _app: AppInterface
  private _clients: Map<string, McpClient> = new Map()
  private _keys: Map<string, string> = new Map()
  private _retries: Map<string, number> = new Map()
  private _connectedAt: Map<string, number> = new Map()
  private _toolIndex: Map<string, IndexedTool> = new Map()
  private _shuttingDown = false

  constructor(app: AppInterface) {
    this._app = app
  }

  public async start(): Promise<void> {
    this.servers = await mcpStore.getServers()
    await Promise.allSettled(this.servers.map((server) => {
      return this._sync(server, false)
    }))
  }

  public async reload(id?: string): Promise<void> {
    this.servers = await mcpStore.getServers()
    for (const existingId of new Set([...this._clients.keys(), ...this.status.keys()])) {
      if (!this._server(existingId)) {
        this._retries.delete(existingId)
        await this._disconnect(existingId)
      }
    }
    const targets = id
      ? this.servers.filter((s) => {
          return s.id === id
        })
      : this.servers
    for (const server of targets) {
      this._retries.delete(server.id)
    }
    await Promise.allSettled(targets.map((server) => {
      return this._sync(server, !id)
    }))
  }

  public async test(server: McpServer): Promise<McpToolDefinition[]> {
    const error = validateServer(server, this.servers)
    if (error) {
      throw new Error(error)
    }
    const client = new McpClient(this._createTransport(server), this._logger(server.name))
    try {
      await client.connect()
      return [...client.tools]
    } finally {
      await client.close()
    }
  }

  public getServerTools(id: string): McpToolDefinition[] {
    return this._clients.get(id)?.tools ?? []
  }

  public getToolInfo(name: string): McpToolInfo | null {
    const entry = this._toolIndex.get(name)
    const server = entry ? this._server(entry.serverId) : undefined
    return entry && server ? { server, definition: entry.definition } : null
  }

  public getTools(): Tool[] {
    const tools: Tool[] = []
    for (const entry of this._toolIndex.values()) {
      const server = this._server(entry.serverId)
      if (server && resolveMcpTier(this._app.settings, server) !== 'deny') {
        tools.push(mcpToolToOllamaTool(server.name, entry.definition))
      }
    }
    return tools
  }

  public hasTool(name: string): boolean {
    return this._toolIndex.has(name)
  }

  public getToolLabel(name: string): McpToolLabel | null {
    const info = this.getToolInfo(name)
    if (info) {
      return { label: formatMcpToolLabel(info.server.name, info.definition.name), description: info.definition.description?.trim() || undefined }
    }
    const parsed = parseMcpToolName(name)
    return parsed ? { label: formatMcpToolLabel(parsed.server, parsed.tool) } : null
  }

  public async callTool(name: string, args: Record<string, unknown>, cancellable?: Gio.Cancellable): Promise<string> {
    const entry = this._toolIndex.get(name)
    const server = entry ? this._server(entry.serverId) : undefined
    if (!entry || !server) {
      return `Error: MCP tool "${name}" is not available.`
    }
    const denied = await checkMcpPermission(this._app, server, entry.definition.name, args, entry.definition.description)
    if (denied) {
      return denied
    }
    try {
      const result = await entry.client.callTool(entry.definition.name, args, server.timeoutSec * 1000, cancellable)
      const text = toolResultToString(result)
      this._log(server.name, `${entry.definition.name} → ${text.slice(0, 200)}`)
      return text
    } catch (err) {
      const message = errorMessage(err)
      this._log(server.name, `${entry.definition.name} failed: ${message}`)
      return message.startsWith('Error') ? message : `Error: ${message}`
    }
  }

  public async shutdown(): Promise<void> {
    this._shuttingDown = true
    await Promise.allSettled([...this._clients.values()].map((client) => {
      return client.close()
    }))
    this._clients.clear()
    this._keys.clear()
    this._connectedAt.clear()
    this._toolIndex.clear()
    this.status.clear()
  }

  private _server(id: string): McpServer | undefined {
    return this.servers.find((s) => {
      return s.id === id
    })
  }

  private _logger(name: string): (message: string) => void {
    return (message) => {
      this._log(name, message)
    }
  }

  private _log(name: string, message: string): void {
    if (this._app.settings.debug) {
      debug(`MCP:${name}`, message)
    }
  }

  private _createTransport(server: McpServer): McpTransport {
    const log = this._logger(server.name)
    if (server.transport === 'http') {
      return new HttpTransport({ url: server.url.trim(), headers: server.headers, log })
    }
    const [command, ...args] = commandLine(server)
    return new StdioTransport({ command, args, env: server.env, log })
  }

  private _setStatus(id: string, status: McpServerStatus | null): void {
    const previous = this.status.get(id)
    if (status) {
      this.status.set(id, status)
    } else {
      this.status.delete(id)
    }
    if (status?.state === 'error' && previous?.state !== 'error' && !this._retries.get(id)) {
      this._reportError(id, status.error ?? 'error')
    }
    this.onChanged?.()
  }

  private _reportError(id: string, message: string): void {
    const server = this._server(id)
    if (server) {
      this.onError?.(server, message)
    }
  }

  private _rebuildIndex(): void {
    this._toolIndex.clear()
    for (const [id, client] of this._clients) {
      const server = this._server(id)
      if (!server) {
        continue
      }
      for (const definition of client.tools) {
        const name = buildMcpToolName(server.name, definition.name)
        if (this._toolIndex.has(name)) {
          this._log(server.name, `duplicate tool name ${name} ignored`)
          continue
        }
        this._toolIndex.set(name, { serverId: id, client, definition })
      }
    }
  }

  private async _sync(server: McpServer, force: boolean): Promise<void> {
    if (this._shuttingDown) {
      return
    }
    const validationError = validateServer(server, this.servers)
    const shouldConnect = server.enabled && !validationError
    const key = connectionKey(server)
    const connected = this._clients.has(server.id)

    if (!shouldConnect) {
      if (connected) {
        await this._disconnect(server.id)
      }
      this._setStatus(server.id, server.enabled && validationError ? { state: 'error', error: validationError, toolCount: 0 } : null)
      return
    }
    if (connected && !force && this._keys.get(server.id) === key) {
      this._rebuildIndex()
      this.onChanged?.()
      return
    }
    if (connected) {
      await this._disconnect(server.id)
    }
    await this._connect(server)
  }

  private async _disconnect(id: string): Promise<void> {
    const client = this._clients.get(id)
    this._clients.delete(id)
    this._keys.delete(id)
    this._connectedAt.delete(id)
    this._rebuildIndex()
    if (client) {
      await client.close()
    }
    this._setStatus(id, null)
  }

  private async _connect(server: McpServer): Promise<string | null> {
    this._setStatus(server.id, { state: 'connecting', toolCount: 0 })
    const client = new McpClient(this._createTransport(server), this._logger(server.name))
    client.onToolsChanged = () => {
      if (this._clients.get(server.id) === client) {
        this._rebuildIndex()
        this._setStatus(server.id, { state: 'connected', toolCount: client.tools.length })
      }
    }
    client.onClosed = (reason) => {
      if (this._clients.get(server.id) === client) {
        void this._handleUnexpectedClose(server.id, client, reason)
      }
    }
    this._clients.set(server.id, client)
    this._keys.set(server.id, connectionKey(server))
    try {
      await client.connect()
      if (this._clients.get(server.id) !== client) {
        return null
      }
      this._connectedAt.set(server.id, Date.now())
      this._rebuildIndex()
      this._setStatus(server.id, { state: 'connected', toolCount: client.tools.length })
      return null
    } catch (err) {
      const message = errorMessage(err)
      const current = this._clients.get(server.id) === client
      if (current) {
        this._clients.delete(server.id)
        this._keys.delete(server.id)
        this._rebuildIndex()
        this._setStatus(server.id, { state: 'error', error: message, toolCount: 0 })
      }
      await client.close()
      return current ? message : null
    }
  }

  private async _handleUnexpectedClose(id: string, client: McpClient, reason: string): Promise<void> {
    this._clients.delete(id)
    this._keys.delete(id)
    this._rebuildIndex()
    void client.close()
    const connectedAt = this._connectedAt.get(id)
    this._connectedAt.delete(id)
    if (connectedAt !== undefined && Date.now() - connectedAt >= MCP_STABLE_CONNECTION_MS) {
      this._retries.delete(id)
    }
    await this._reconnect(id, reason)
  }

  private async _reconnect(id: string, reason: string): Promise<void> {
    let lastReason = reason
    while (!this._shuttingDown) {
      const attempt = this._retries.get(id) ?? 0
      if (attempt >= MCP_RECONNECT_DELAYS_MS.length) {
        const message = `Disconnected (${lastReason}), gave up after ${attempt} retries`
        this._setStatus(id, { state: 'error', error: message, toolCount: 0 })
        this._reportError(id, message)
        return
      }
      this._retries.set(id, attempt + 1)
      this._setStatus(id, { state: 'error', error: `Disconnected (${lastReason}), reconnecting…`, toolCount: 0 })
      await sleep(MCP_RECONNECT_DELAYS_MS[attempt])
      const server = this._server(id)
      if (this._shuttingDown || !server || !server.enabled || this._clients.has(id) || this._retries.get(id) !== attempt + 1) {
        return
      }
      const error = await this._connect(server)
      if (error === null) {
        return
      }
      lastReason = error
    }
  }
}
