import { DEFAULT_MCP_TIMEOUT_SEC, MCP_MAX_TOOL_NAME_LENGTH, MCP_TOOL_PREFIX } from '@/lib/constants.js'
import type { McpServer, McpServerStatus, PermissionTier, Settings } from '@/lib/db/types.js'
import { generateId, isValidItemName, type NameRules, uniqueName, validateItemName } from '@/lib/naming.js'

export const SERVER_NAME_RULES: NameRules = {
  noun: 'server',
  invalidMessage: 'Server name must start with a letter or digit, contain only letters, digits, hyphens or single underscores, and not end with an underscore',
  isValid: isValidServerName
}

export function isValidServerName(name: string): boolean {
  return isValidItemName(name) && !name.includes('__') && !name.endsWith('_')
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === 'string') {
      result[key] = val
    }
  }
  return result
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((v): v is string => {
    return typeof v === 'string'
  })
}

export function normalizeServer(partial: Partial<McpServer> & { id: string }): McpServer {
  const timeout = Number(partial.timeoutSec)
  return {
    id: partial.id,
    name: typeof partial.name === 'string' ? partial.name : '',
    enabled: partial.enabled === true,
    transport: partial.transport === 'http' ? 'http' : 'stdio',
    command: typeof partial.command === 'string' ? partial.command : '',
    args: asStringArray(partial.args),
    env: asRecord(partial.env),
    url: typeof partial.url === 'string' ? partial.url : '',
    headers: asRecord(partial.headers),
    permission: partial.permission === 'ask' || partial.permission === 'auto-accept' || partial.permission === 'deny' ? partial.permission : 'inherit',
    timeoutSec: Number.isFinite(timeout) && timeout >= 1 ? Math.floor(timeout) : DEFAULT_MCP_TIMEOUT_SEC,
    disabledTools: asStringArray(partial.disabledTools)
  }
}

export function createServer(existingNames: string[]): McpServer {
  return normalizeServer({
    id: generateId(),
    name: uniqueName('new-server', existingNames)
  })
}

export function validateServerName(name: string, id: string, others: McpServer[]): string | null {
  return validateItemName(name, id, others, SERVER_NAME_RULES)
}

export function validateServer(server: McpServer, others: McpServer[]): string | null {
  const nameError = validateServerName(server.name, server.id, others)
  if (nameError) {
    return nameError
  }
  if (server.transport === 'stdio' && commandLine(server).length === 0) {
    return 'A stdio server needs a command'
  }
  if (server.transport === 'http' && !/^https?:\/\/\S+$/.test(server.url.trim())) {
    return 'An HTTP server needs a valid http:// or https:// URL'
  }
  if (!Number.isFinite(server.timeoutSec) || server.timeoutSec < 1) {
    return 'Timeout must be at least 1 second'
  }
  return null
}

export function splitArgs(text: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: string | null = null
  let hasToken = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) {
        quote = null
      } else if (ch === '\\' && quote === '"' && i + 1 < text.length) {
        current += text[++i]
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === '\'') {
      quote = ch
      hasToken = true
    } else if (ch === '\\' && i + 1 < text.length) {
      current += text[++i]
      hasToken = true
    } else if (/\s/.test(ch)) {
      if (hasToken) {
        args.push(current)
        current = ''
        hasToken = false
      }
    } else {
      current += ch
      hasToken = true
    }
  }
  if (hasToken) {
    args.push(current)
  }
  return args
}

export function commandLine(server: McpServer): string[] {
  return [...splitArgs(server.command), ...server.args]
}

export function joinArgs(args: string[]): string {
  return args.map((arg) => {
    if (arg === '') {
      return '""'
    }
    if (/[\s"'\\]/.test(arg)) {
      return `"${arg.replace(/(["\\])/g, '\\$1')}"`
    }
    return arg
  }).join(' ')
}

export function parseKeyValueLines(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const eq = line.indexOf('=')
    if (!line || eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    if (key) {
      result[key] = line.slice(eq + 1)
    }
  }
  return result
}

export function formatKeyValueLines(values: Record<string, string>): string {
  return Object.keys(values).sort().map((key) => {
    return `${key}=${values[key]}`
  }).join('\n')
}

export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

function hashName(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildMcpToolName(serverName: string, toolName: string): string {
  const name = `${MCP_TOOL_PREFIX}${serverName}__${sanitizeToolName(toolName)}`
  if (name.length <= MCP_MAX_TOOL_NAME_LENGTH) {
    return name
  }
  const hash = hashName(`${serverName}/${toolName}`)
  return `${name.slice(0, MCP_MAX_TOOL_NAME_LENGTH - hash.length - 1)}_${hash}`
}

export function isMcpToolName(name: string): boolean {
  return name.startsWith(MCP_TOOL_PREFIX)
}

export function parseMcpToolName(name: string): { server: string; tool: string } | null {
  if (!isMcpToolName(name)) {
    return null
  }
  const rest = name.slice(MCP_TOOL_PREFIX.length)
  const sep = rest.indexOf('__')
  if (sep <= 0 || sep + 2 >= rest.length) {
    return null
  }
  return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) }
}

export function formatMcpToolLabel(server: string, tool: string): string {
  return `${server} · ${tool}`
}

export function describeToolList(count: number): string {
  if (count === 0) {
    return 'No tools'
  }
  return `${count} tool${count === 1 ? '' : 's'}`
}

export function describeServerStatus(server: McpServer, status?: McpServerStatus): string {
  if (!server.enabled) {
    return 'Disabled'
  }
  if (!status) {
    return 'Not connected'
  }
  if (status.state === 'connected') {
    return `Connected, ${describeToolList(status.toolCount).toLowerCase()}`
  }
  if (status.state === 'connecting') {
    return 'Connecting…'
  }
  return `Error: ${status.error ?? 'unknown'}`
}

export function serverSubtitle(server: McpServer): string {
  if (server.transport === 'http') {
    return server.url || 'No URL'
  }
  const argv = commandLine(server)
  return argv.length > 0 ? joinArgs(argv) : 'No command'
}

export function connectionKey(server: McpServer): string {
  return JSON.stringify({
    enabled: server.enabled,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    headers: server.headers,
    timeoutSec: server.timeoutSec
  })
}

export function resolveMcpTier(settings: Settings, server: McpServer): PermissionTier {
  if (server.permission !== 'inherit') {
    return server.permission
  }
  return settings.permissions?.mcp ?? 'ask'
}

export function formatMcpPermissionBody(args: Record<string, unknown>, max = 800): string {
  const text = JSON.stringify(args, null, 2) ?? ''
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}…`
}
