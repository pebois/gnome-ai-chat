import { DEFAULT_SETTINGS, MCP_MAX_TOOL_NAME_LENGTH } from '@/lib/constants.js'
import type { McpServer } from '@/lib/db/types.js'
import {
  buildMcpToolName,
  commandLine,
  connectionKey,
  createServer,
  describeServerStatus,
  describeToolList,
  formatKeyValueLines,
  formatMcpPermissionBody,
  formatMcpToolLabel,
  isMcpToolName,
  isValidServerName,
  joinArgs,
  normalizeServer,
  parseKeyValueLines,
  parseMcpToolName,
  resolveMcpTier,
  sanitizeToolName,
  serverSubtitle,
  splitArgs,
  validateServer
} from '@/lib/mcp/config.js'
import {
  createNotification,
  createRequest,
  encodeMessage,
  formatRpcError,
  isNotification,
  isRequest,
  isResponse,
  mcpToolToOllamaTool,
  parseMessage,
  parseMessages,
  SseParser,
  toolResultToString
} from '@/lib/mcp/jsonrpc.js'

function server(overrides: Partial<McpServer> = {}): McpServer {
  return normalizeServer({ id: 'id-1', name: 'fs', command: 'npx', enabled: true, ...overrides })
}

describe('mcp config', () => {
  describe('splitArgs / joinArgs', () => {
    it('splits on whitespace', () => {
      expect(splitArgs('-y  @modelcontextprotocol/server-filesystem /tmp')).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
    })

    it('honors single and double quotes', () => {
      expect(splitArgs(`--path "/home/me/My Files" --name 'a b'`)).toEqual(['--path', '/home/me/My Files', '--name', 'a b'])
    })

    it('honors backslash escapes', () => {
      expect(splitArgs('a\\ b "say \\"hi\\""')).toEqual(['a b', 'say "hi"'])
    })

    it('returns an empty list for blank input', () => {
      expect(splitArgs('')).toEqual([])
      expect(splitArgs('   ')).toEqual([])
    })

    it('keeps empty quoted tokens', () => {
      expect(splitArgs('a "" b')).toEqual(['a', '', 'b'])
    })

    it('round-trips through joinArgs', () => {
      const args = ['-y', 'pkg', '/home/me/My Files', 'say "hi"', '']
      expect(splitArgs(joinArgs(args))).toEqual(args)
    })
  })

  describe('parseKeyValueLines / formatKeyValueLines', () => {
    it('parses KEY=VALUE per line', () => {
      expect(parseKeyValueLines('A=1\nB=two')).toEqual({ A: '1', B: 'two' })
    })

    it('ignores blank lines and lines without =', () => {
      expect(parseKeyValueLines('\nA=1\nnot a pair\n  \n=novalue')).toEqual({ A: '1' })
    })

    it('splits on the first = only and tolerates CRLF', () => {
      expect(parseKeyValueLines('TOKEN=a=b\r\nX= y')).toEqual({ TOKEN: 'a=b', X: ' y' })
    })

    it('round-trips sorted keys', () => {
      const values = { B: '2', A: '1' }
      expect(formatKeyValueLines(values)).toBe('A=1\nB=2')
      expect(parseKeyValueLines(formatKeyValueLines(values))).toEqual(values)
    })
  })

  describe('isValidServerName', () => {
    it('accepts simple names', () => {
      expect(isValidServerName('fs')).toBe(true)
      expect(isValidServerName('my-server_1')).toBe(true)
      expect(isValidServerName('9lives')).toBe(true)
    })

    it('rejects spaces, leading dashes, double underscores and empty', () => {
      expect(isValidServerName('my server')).toBe(false)
      expect(isValidServerName('-x')).toBe(false)
      expect(isValidServerName('a__b')).toBe(false)
      expect(isValidServerName('')).toBe(false)
    })

    it('rejects a trailing underscore that would make tool names ambiguous', () => {
      expect(isValidServerName('srv_')).toBe(false)
    })
  })

  describe('createServer', () => {
    it('creates a disabled stdio server with defaults', () => {
      const created = createServer(['new-server'])
      expect(created.name).toBe('new-server-2')
      expect(created.enabled).toBe(false)
      expect(created.transport).toBe('stdio')
      expect(created.permission).toBe('inherit')
      expect(created.timeoutSec).toBe(30)
      expect(created.id).not.toBe('')
    })
  })

  describe('normalizeServer', () => {
    it('fills every default from an id-only input', () => {
      expect(normalizeServer({ id: 'x' })).toEqual({
        id: 'x',
        name: '',
        enabled: false,
        transport: 'stdio',
        command: '',
        args: [],
        env: {},
        url: '',
        headers: {},
        permission: 'inherit',
        timeoutSec: 30,
        disabledTools: []
      })
    })

    it('preserves provided values and drops malformed ones', () => {
      const normalized = normalizeServer({
        id: 'x',
        name: 'remote',
        transport: 'http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer t' },
        args: ['a', 1 as unknown as string],
        env: { A: '1', B: 2 as unknown as string },
        permission: 'deny',
        timeoutSec: 7.9
      })
      expect(normalized.transport).toBe('http')
      expect(normalized.headers).toEqual({ Authorization: 'Bearer t' })
      expect(normalized.args).toEqual(['a'])
      expect(normalized.env).toEqual({ A: '1' })
      expect(normalized.permission).toBe('deny')
      expect(normalized.timeoutSec).toBe(7)
    })
  })

  describe('validateServer', () => {
    it('accepts valid stdio and http servers', () => {
      expect(validateServer(server(), [])).toBeNull()
      expect(validateServer(server({ transport: 'http', url: 'http://localhost:8000/mcp' }), [])).toBeNull()
    })

    it('rejects duplicate names case-insensitively', () => {
      expect(validateServer(server(), [server({ id: 'id-2', name: 'FS' })])).toMatch(/already exists/)
      expect(validateServer(server(), [server({ id: 'id-1', name: 'FS' })])).toBeNull()
    })

    it('rejects a stdio server without command', () => {
      expect(validateServer(server({ command: '  ' }), [])).toMatch(/command/)
    })

    it('accepts a full command line in the command field', () => {
      expect(validateServer(server({ command: 'npx studio-mcp' }), [])).toBeNull()
    })

    it('rejects an http server with a bad url', () => {
      expect(validateServer(server({ transport: 'http', url: 'ftp://x' }), [])).toMatch(/URL/)
      expect(validateServer(server({ transport: 'http', url: '' }), [])).toMatch(/URL/)
    })

    it('rejects invalid names', () => {
      expect(validateServer(server({ name: 'bad name' }), [])).toMatch(/Server name/)
    })
  })

  describe('tool naming', () => {
    it('sanitizes tool names', () => {
      expect(sanitizeToolName('get-weather.v2')).toBe('get_weather_v2')
    })

    it('builds and parses namespaced names', () => {
      const name = buildMcpToolName('fs', 'read-file')
      expect(name).toBe('mcp__fs__read_file')
      expect(isMcpToolName(name)).toBe(true)
      expect(parseMcpToolName(name)).toEqual({ server: 'fs', tool: 'read_file' })
    })

    it('caps long names with a stable hash suffix', () => {
      const long = 'x'.repeat(80)
      const name = buildMcpToolName('fs', long)
      expect(name.length).toBe(MCP_MAX_TOOL_NAME_LENGTH)
      expect(name).toMatch(/^mcp__fs__x+_[0-9a-f]{8}$/)
      expect(buildMcpToolName('fs', long)).toBe(name)
      expect(buildMcpToolName('fs', `${long}y`)).not.toBe(name)
      expect(buildMcpToolName('fs', 'short')).toBe('mcp__fs__short')
    })

    it('keeps tool-side underscores intact', () => {
      expect(parseMcpToolName('mcp__my-server__list__all')).toEqual({ server: 'my-server', tool: 'list__all' })
    })

    it('returns null for non-mcp or malformed names', () => {
      expect(isMcpToolName('read_file')).toBe(false)
      expect(parseMcpToolName('read_file')).toBeNull()
      expect(parseMcpToolName('mcp__fs')).toBeNull()
      expect(parseMcpToolName('mcp__fs__')).toBeNull()
    })

    it('formats a single human label for a tool', () => {
      expect(formatMcpToolLabel('fs', 'read_file')).toBe('fs · read_file')
    })

    it('describes tool counts and statuses consistently', () => {
      expect(describeToolList(0)).toBe('No tools')
      expect(describeToolList(1)).toBe('1 tool')
      expect(describeToolList(5)).toBe('5 tools')
      expect(describeServerStatus(server(), { state: 'connected', toolCount: 1 })).toBe('Connected, 1 tool')
      expect(describeServerStatus(server(), { state: 'connected', toolCount: 0 })).toBe('Connected, no tools')
      expect(describeServerStatus(server({ enabled: false }))).toBe('Disabled')
      expect(describeServerStatus(server())).toBe('Not connected')
      expect(describeServerStatus(server(), { state: 'error', error: 'boom', toolCount: 0 })).toBe('Error: boom')
    })
  })

  describe('commandLine', () => {
    it('splits the command field and appends arguments', () => {
      expect(commandLine(server({ command: 'npx studio-mcp', args: ['--port', '1'] }))).toEqual(['npx', 'studio-mcp', '--port', '1'])
      expect(commandLine(server({ command: '"/opt/My Tools/server"' }))).toEqual(['/opt/My Tools/server'])
      expect(commandLine(server({ command: '' }))).toEqual([])
    })
  })

  describe('serverSubtitle / connectionKey', () => {
    it('describes the connection', () => {
      expect(serverSubtitle(server({ args: ['-y', 'pkg'] }))).toBe('npx -y pkg')
      expect(serverSubtitle(server({ command: 'npx studio-mcp' }))).toBe('npx studio-mcp')
      expect(serverSubtitle(server({ transport: 'http', url: 'http://x/mcp' }))).toBe('http://x/mcp')
      expect(serverSubtitle(server({ command: '' }))).toBe('No command')
    })

    it('ignores name and permission but tracks connection fields', () => {
      const base = server()
      expect(connectionKey(base)).toBe(connectionKey(server({ name: 'other', permission: 'deny' })))
      expect(connectionKey(base)).not.toBe(connectionKey(server({ args: ['x'] })))
      expect(connectionKey(base)).not.toBe(connectionKey(server({ enabled: false })))
    })
  })

  describe('resolveMcpTier', () => {
    it('inherits from settings and honors overrides', () => {
      const settings = { ...DEFAULT_SETTINGS, permissions: { ...DEFAULT_SETTINGS.permissions, mcp: 'auto-accept' as const } }
      expect(resolveMcpTier(settings, server())).toBe('auto-accept')
      expect(resolveMcpTier(settings, server({ permission: 'deny' }))).toBe('deny')
      expect(resolveMcpTier({ ...DEFAULT_SETTINGS, permissions: {} as typeof DEFAULT_SETTINGS.permissions }, server())).toBe('ask')
    })
  })

  describe('formatMcpPermissionBody', () => {
    it('pretty prints and truncates', () => {
      expect(formatMcpPermissionBody({ path: '/tmp' })).toBe('{\n  "path": "/tmp"\n}')
      const long = formatMcpPermissionBody({ text: 'x'.repeat(2000) }, 50)
      expect(long.length).toBe(51)
      expect(long.endsWith('…')).toBe(true)
    })
  })
})

describe('mcp jsonrpc', () => {
  describe('encode / parse', () => {
    it('encodes with a trailing newline and round-trips', () => {
      const request = createRequest(1, 'tools/list', { cursor: 'abc' })
      const encoded = encodeMessage(request)
      expect(encoded.endsWith('\n')).toBe(true)
      expect(encoded.indexOf('\n')).toBe(encoded.length - 1)
      expect(parseMessage(encoded)).toEqual(request)
    })

    it('omits params when absent', () => {
      expect(createRequest(2, 'ping')).toEqual({ jsonrpc: '2.0', id: 2, method: 'ping' })
      expect(createNotification('notifications/initialized')).toEqual({ jsonrpc: '2.0', method: 'notifications/initialized' })
    })

    it('returns null for empty, invalid or non-jsonrpc input', () => {
      expect(parseMessage('')).toBeNull()
      expect(parseMessage('not json')).toBeNull()
      expect(parseMessage('{"id":1}')).toBeNull()
    })

    it('classifies messages', () => {
      const request = parseMessage('{"jsonrpc":"2.0","id":1,"method":"ping"}')!
      const notification = parseMessage('{"jsonrpc":"2.0","method":"notifications/tools/list_changed"}')!
      const response = parseMessage('{"jsonrpc":"2.0","id":1,"result":{}}')!
      expect(isRequest(request)).toBe(true)
      expect(isNotification(notification)).toBe(true)
      expect(isResponse(response)).toBe(true)
      expect(isResponse(request)).toBe(false)
      expect(isRequest(response)).toBe(false)
    })

    it('parses single and batch bodies', () => {
      expect(parseMessages('{"jsonrpc":"2.0","id":1,"result":{}}')).toHaveLength(1)
      expect(parseMessages('[{"jsonrpc":"2.0","id":1,"result":{}},{"jsonrpc":"2.0","method":"x"},{"nope":1}]')).toHaveLength(2)
      expect(parseMessages('')).toEqual([])
    })
  })

  describe('SseParser', () => {
    it('emits data payloads per blank-line separated event', () => {
      const parser = new SseParser()
      expect(parser.push('event: message\ndata: {"a":1}\n\n')).toEqual(['{"a":1}'])
    })

    it('joins multi-line data and ignores comments and ids', () => {
      const parser = new SseParser()
      expect(parser.push(': keepalive\nid: 7\ndata: line1\ndata: line2\n\n')).toEqual(['line1\nline2'])
    })

    it('buffers partial chunks and tolerates CRLF', () => {
      const parser = new SseParser()
      expect(parser.push('data: {"a"')).toEqual([])
      expect(parser.push(':1}\r\n\r\ndata: x\r\n')).toEqual(['{"a":1}'])
      expect(parser.flush()).toEqual(['x'])
    })
  })

  describe('mcpToolToOllamaTool', () => {
    it('namespaces the name, prefixes the description and fills schema defaults', () => {
      const tool = mcpToolToOllamaTool('fs', { name: 'read-file', description: 'Read a file', inputSchema: { type: 'object', $schema: 'x', required: ['path'] } })
      expect(tool.type).toBe('function')
      expect(tool.function.name).toBe('mcp__fs__read_file')
      expect(tool.function.description).toBe('[fs] Read a file')
      expect(tool.function.parameters).toEqual({ type: 'object', properties: {}, required: ['path'] })
    })

    it('generates a description when missing', () => {
      const tool = mcpToolToOllamaTool('fs', { name: 'ls' })
      expect(tool.function.description).toBe('Tool "ls" from MCP server "fs"')
      expect(tool.function.parameters).toEqual({ type: 'object', properties: {}, required: [] })
    })
  })

  describe('toolResultToString', () => {
    it('joins text blocks', () => {
      expect(toolResultToString({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('a\nb')
    })

    it('describes binary and resource content', () => {
      expect(toolResultToString({ content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }] })).toBe('[image image/png, 3 bytes]')
      expect(toolResultToString({ content: [{ type: 'resource', resource: { uri: 'file:///x', text: 'body' } }] })).toBe('body')
      expect(toolResultToString({ content: [{ type: 'resource', resource: { uri: 'file:///x' } }] })).toBe('[resource file:///x]')
      expect(toolResultToString({ content: [{ type: 'resource_link', uri: 'file:///y', name: 'y' }] })).toBe('[resource link file:///y (y)]')
    })

    it('prefixes errors and handles empty content', () => {
      expect(toolResultToString({ content: [{ type: 'text', text: 'boom' }], isError: true })).toBe('Error: boom')
      expect(toolResultToString({ content: [{ type: 'text', text: 'Error: boom' }], isError: true })).toBe('Error: boom')
      expect(toolResultToString({ content: [], structuredContent: { ok: true } })).toBe('{\n  "ok": true\n}')
      expect(toolResultToString({})).toBe('(no content)')
    })

    it('truncates oversized results', () => {
      expect(toolResultToString({ content: [{ type: 'text', text: 'abcdef' }] }, 4)).toBe('abcd\n… [truncated, 2 more characters]')
      expect(toolResultToString({ content: [{ type: 'text', text: 'abcd' }] }, 4)).toBe('abcd')
    })
  })

  it('formats rpc errors', () => {
    expect(formatRpcError({ code: -32601, message: 'Method not found' })).toBe('Error: MCP -32601: Method not found')
  })
})
