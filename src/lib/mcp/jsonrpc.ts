import { MCP_MAX_RESULT_CHARS } from '@/lib/constants.js'
import { buildMcpToolName } from '@/lib/mcp/config.js'
import type { Tool } from '@/lib/providers/index.js'

export type JsonRpcId = number | string

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: JsonRpcError
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export interface McpInputSchema {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: McpInputSchema
}

export interface McpToolsListResult {
  tools: McpToolDefinition[]
  nextCursor?: string
}

export type McpContent
  = { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'audio'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; text?: string; mimeType?: string; blob?: string } }
    | { type: 'resource_link'; uri: string; name?: string; description?: string }

export interface McpToolResult {
  content?: McpContent[]
  isError?: boolean
  structuredContent?: unknown
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities: Record<string, unknown>
  serverInfo?: { name: string; version: string }
}

export function createRequest(id: JsonRpcId, method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return params ? { jsonrpc: '2.0', id, method, params } : { jsonrpc: '2.0', id, method }
}

export function createNotification(method: string, params?: Record<string, unknown>): JsonRpcNotification {
  return params ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', method }
}

export function createErrorResponse(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

export function createResultResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

export function encodeMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`
}

function isMessageShape(value: unknown): value is JsonRpcMessage {
  return !!value && typeof value === 'object' && (value as { jsonrpc?: unknown }).jsonrpc === '2.0'
}

export function parseMessage(line: string): JsonRpcMessage | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return isMessageShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function parseMessages(text: string): JsonRpcMessage[] {
  const trimmed = text.trim()
  if (!trimmed) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    const items = Array.isArray(parsed) ? parsed : [parsed]
    return items.filter(isMessageShape)
  } catch {
    return []
  }
}

export function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return 'id' in message && !('method' in message)
}

export function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return 'id' in message && 'method' in message
}

export function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return !('id' in message) && 'method' in message
}

export class SseParser {
  private _buffer = ''
  private _data: string[] = []

  public push(chunk: string): string[] {
    this._buffer += chunk
    const events: string[] = []
    let newline = this._buffer.indexOf('\n')
    while (newline !== -1) {
      const line = this._buffer.slice(0, newline).replace(/\r$/, '')
      this._buffer = this._buffer.slice(newline + 1)
      const event = this._consumeLine(line)
      if (event !== null) {
        events.push(event)
      }
      newline = this._buffer.indexOf('\n')
    }
    return events
  }

  public flush(): string[] {
    const events = this._buffer ? this.push('\n') : []
    const tail = this._consumeLine('')
    if (tail !== null) {
      events.push(tail)
    }
    return events
  }

  private _consumeLine(line: string): string | null {
    if (line === '') {
      if (this._data.length === 0) {
        return null
      }
      const payload = this._data.join('\n')
      this._data = []
      return payload
    }
    if (line.startsWith(':')) {
      return null
    }
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }
    if (field === 'data') {
      this._data.push(value)
    }
    return null
  }
}

export function normalizeInputSchema(schema?: McpInputSchema): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = schema ?? {}
  return {
    ...rest,
    type: 'object',
    properties: rest.properties && typeof rest.properties === 'object' ? rest.properties : {},
    required: Array.isArray(rest.required) ? rest.required : []
  }
}

export function mcpToolToOllamaTool(serverName: string, definition: McpToolDefinition): Tool {
  const description = definition.description?.trim()
  return {
    type: 'function',
    function: {
      name: buildMcpToolName(serverName, definition.name),
      description: description ? `[${serverName}] ${description}` : `Tool "${definition.name}" from MCP server "${serverName}"`,
      parameters: normalizeInputSchema(definition.inputSchema)
    }
  }
}

function approximateBase64Bytes(data: string): number {
  return Math.floor(data.length * 3 / 4)
}

function contentToString(content: McpContent): string {
  switch (content.type) {
    case 'text':
      return content.text
    case 'image':
      return `[image ${content.mimeType}, ${approximateBase64Bytes(content.data)} bytes]`
    case 'audio':
      return `[audio ${content.mimeType}, ${approximateBase64Bytes(content.data)} bytes]`
    case 'resource':
      return content.resource.text ?? `[resource ${content.resource.uri}]`
    case 'resource_link':
      return `[resource link ${content.uri}${content.name ? ` (${content.name})` : ''}]`
    default:
      return ''
  }
}

function truncateResult(text: string, max: number): string {
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}\n… [truncated, ${text.length - max} more characters]`
}

export function toolResultToString(result: McpToolResult, max = MCP_MAX_RESULT_CHARS): string {
  const parts = (result.content ?? []).map(contentToString).filter((part) => {
    return part.length > 0
  })
  let text = parts.join('\n')
  if (!text && result.structuredContent !== undefined) {
    text = JSON.stringify(result.structuredContent, null, 2)
  }
  if (!text) {
    text = '(no content)'
  }
  if (result.isError && !text.startsWith('Error')) {
    text = `Error: ${text}`
  }
  return truncateResult(text, max)
}

export function formatRpcError(error: JsonRpcError): string {
  return `Error: MCP ${error.code}: ${error.message}`
}
