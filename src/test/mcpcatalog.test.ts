import { catalogEntrySubtitle, createServerFromCatalog, MCP_CATALOG } from '@/lib/mcp/catalog.js'
import { isValidServerName, validateServer } from '@/lib/mcp/config.js'

describe('MCP catalog', () => {
  it('has unique, valid server names', () => {
    const names = MCP_CATALOG.map((e) => {
      return e.name
    })
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(isValidServerName(name)).toBe(true)
    }
  })

  it('only uses npx or public https endpoints', () => {
    for (const entry of MCP_CATALOG) {
      if (entry.transport === 'stdio') {
        expect(entry.command).toBe('npx')
        expect(entry.args?.('/home/u')[0]).toBe('-y')
      } else {
        expect(entry.url).toMatch(/^https:\/\//)
      }
    }
  })

  it('creates valid, disabled servers', () => {
    for (const entry of MCP_CATALOG) {
      const server = createServerFromCatalog(entry, [], '/home/u')
      expect(server.enabled).toBe(false)
      expect(server.name).toBe(entry.name)
      expect(validateServer(server, [])).toBeNull()
    }
  })

  it('suffixes the name when it is already taken', () => {
    const entry = MCP_CATALOG.find((e) => {
      return e.name === 'memory'
    })!
    expect(createServerFromCatalog(entry, ['memory'], '/home/u').name).toBe('memory-2')
  })

  it('passes the home folder to the filesystem server', () => {
    const entry = MCP_CATALOG.find((e) => {
      return e.name === 'filesystem'
    })!
    expect(createServerFromCatalog(entry, [], '/home/u').args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/home/u'])
    expect(catalogEntrySubtitle(entry, '/home/u')).toBe('npx -y @modelcontextprotocol/server-filesystem /home/u')
  })

  it('shows the URL for HTTP servers', () => {
    const entry = MCP_CATALOG.find((e) => {
      return e.name === 'deepwiki'
    })!
    expect(catalogEntrySubtitle(entry, '/home/u')).toBe('https://mcp.deepwiki.com/mcp')
  })
})
