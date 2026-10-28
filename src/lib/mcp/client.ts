import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { APPLICATION_NAME, MCP_INIT_TIMEOUT_MS, MCP_PROTOCOL_VERSION, MCP_SUPPORTED_PROTOCOL_VERSIONS, VERSION } from '@/lib/constants.js'
import {
  createErrorResponse,
  createNotification,
  createRequest,
  createResultResponse,
  formatRpcError,
  isNotification,
  isRequest,
  isResponse,
  type JsonRpcId,
  type JsonRpcMessage,
  type McpInitializeResult,
  type McpToolDefinition,
  type McpToolResult,
  type McpToolsListResult
} from '@/lib/mcp/jsonrpc.js'
import { errorMessage, type McpLogger, type McpTransport } from '@/lib/mcp/transport.js'

interface PendingRequest {
  method: string
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeoutMs: number
  timeoutId: number
  requestCancellable: Gio.Cancellable
  external?: Gio.Cancellable
  externalId: number
}

export class McpClient {
  public tools: McpToolDefinition[] = []
  public serverInfo?: { name: string; version: string }
  public protocolVersion?: string
  public onToolsChanged?: () => void
  public onClosed?: (reason: string) => void

  private _transport: McpTransport
  private _log: McpLogger
  private _pending: Map<JsonRpcId, PendingRequest> = new Map()
  private _nextId = 1
  private _cancellable = new Gio.Cancellable()
  private _initialized = false
  private _disconnected = false
  private _closed = false

  constructor(transport: McpTransport, log: McpLogger) {
    this._transport = transport
    this._log = log
    this._transport.onMessage = (message) => {
      this._handleMessage(message)
    }
    this._transport.onClose = (reason) => {
      this._handleClose(reason)
    }
  }

  public async connect(): Promise<void> {
    await this._transport.start(this._cancellable)
    const result = await this._request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: APPLICATION_NAME, version: VERSION }
    }, MCP_INIT_TIMEOUT_MS) as McpInitializeResult
    if (!MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) {
      throw new Error(`Unsupported MCP protocol version "${result.protocolVersion}"`)
    }
    this.serverInfo = result.serverInfo
    this.protocolVersion = result.protocolVersion
    this._transport.setProtocolVersion(result.protocolVersion)
    this._log(`initialized ${result.serverInfo?.name ?? 'server'} (protocol ${result.protocolVersion})`)
    await this._transport.send(createNotification('notifications/initialized'))
    await this.listTools()
    this._initialized = true
    this._transport.listen()
  }

  public async listTools(): Promise<McpToolDefinition[]> {
    const tools: McpToolDefinition[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const result = await this._request('tools/list', cursor ? { cursor } : undefined, MCP_INIT_TIMEOUT_MS) as McpToolsListResult
      tools.push(...(result.tools ?? []))
      cursor = result.nextCursor
      if (cursor && seen.has(cursor)) {
        this._log(`tools/list repeated cursor ${cursor}, stopping`)
        break
      }
      if (cursor) {
        seen.add(cursor)
      }
    } while (cursor)
    this.tools = tools
    return tools
  }

  public callTool(name: string, args: Record<string, unknown>, timeoutMs: number, cancellable?: Gio.Cancellable): Promise<McpToolResult> {
    return this._request('tools/call', { name, arguments: args }, timeoutMs, cancellable, true) as Promise<McpToolResult>
  }

  public async close(): Promise<void> {
    if (this._closed) {
      return
    }
    this._closed = true
    this._rejectAll(new Error('MCP client closed'))
    this._cancellable.cancel()
    await this._transport.close()
  }

  private _request(method: string, params: Record<string, unknown> | undefined, timeoutMs: number, external?: Gio.Cancellable, withProgress = false): Promise<unknown> {
    const id = this._nextId++
    const requestParams = withProgress ? { ...params, _meta: { progressToken: id } } : params
    return new Promise<unknown>((resolve, reject) => {
      if (external?.is_cancelled()) {
        reject(new Error('Cancelled'))
        return
      }
      const entry: PendingRequest = {
        method,
        resolve,
        reject,
        timeoutMs,
        timeoutId: 0,
        requestCancellable: new Gio.Cancellable(),
        external,
        externalId: 0
      }
      this._pending.set(id, entry)
      this._armTimeout(id, entry)
      if (external) {
        entry.externalId = external.connect(() => {
          GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._abort(id, new Error('Cancelled'))
            return GLib.SOURCE_REMOVE
          })
        })
      }
      this._log(`→ ${method} #${id}`)
      this._transport.send(createRequest(id, method, requestParams), entry.requestCancellable).catch((err: unknown) => {
        this._settle(id)?.reject(err instanceof Error ? err : new Error(errorMessage(err)))
      })
    })
  }

  private _armTimeout(id: JsonRpcId, entry: PendingRequest): void {
    if (entry.timeoutId) {
      GLib.source_remove(entry.timeoutId)
    }
    entry.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, entry.timeoutMs, () => {
      entry.timeoutId = 0
      this._abort(id, new Error(`Request timed out after ${Math.round(entry.timeoutMs / 1000)}s`))
      return GLib.SOURCE_REMOVE
    })
  }

  private _abort(id: JsonRpcId, error: Error): void {
    const entry = this._settle(id)
    if (!entry) {
      return
    }
    entry.reject(error)
    if (entry.method !== 'initialize' && !this._closed && !this._disconnected) {
      this._transport.send(createNotification('notifications/cancelled', { requestId: id, reason: error.message })).catch(() => {})
    }
  }

  private _settle(id: JsonRpcId): PendingRequest | null {
    const entry = this._pending.get(id)
    if (!entry) {
      return null
    }
    this._pending.delete(id)
    if (entry.timeoutId) {
      GLib.source_remove(entry.timeoutId)
      entry.timeoutId = 0
    }
    if (entry.external && entry.externalId) {
      entry.external.disconnect(entry.externalId)
    }
    entry.requestCancellable.cancel()
    return entry
  }

  private _rejectAll(error: Error): void {
    for (const id of [...this._pending.keys()]) {
      this._settle(id)?.reject(error)
    }
  }

  private _handleProgress(params?: Record<string, unknown>): void {
    const token = params?.progressToken
    if (typeof token !== 'number' && typeof token !== 'string') {
      return
    }
    const entry = this._pending.get(token)
    if (entry) {
      this._armTimeout(token, entry)
    }
  }

  private _handleMessage(message: JsonRpcMessage): void {
    if (isResponse(message)) {
      const entry = this._settle(message.id)
      if (!entry) {
        this._log(`unexpected response #${String(message.id)}`)
        return
      }
      if (message.error) {
        entry.reject(new Error(formatRpcError(message.error)))
      } else {
        entry.resolve(message.result)
      }
      return
    }
    if (isRequest(message)) {
      const reply = message.method === 'ping'
        ? createResultResponse(message.id, {})
        : createErrorResponse(message.id, -32601, 'Method not found')
      this._transport.send(reply).catch((err: unknown) => {
        this._log(`reply failed: ${errorMessage(err)}`)
      })
      return
    }
    if (!isNotification(message)) {
      return
    }
    if (message.method === 'notifications/progress') {
      this._handleProgress(message.params)
    } else if (message.method === 'notifications/tools/list_changed') {
      this.listTools().then(() => {
        this.onToolsChanged?.()
      }).catch((err: unknown) => {
        this._log(`tools refresh failed: ${errorMessage(err)}`)
      })
    }
  }

  private _handleClose(reason: string): void {
    this._rejectAll(new Error(`MCP server disconnected: ${reason}`))
    if (this._closed || this._disconnected || !this._initialized) {
      return
    }
    this._disconnected = true
    this.onClosed?.(reason)
  }
}
