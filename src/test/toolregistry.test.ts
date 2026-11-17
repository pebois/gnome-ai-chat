import type { AgentProfile, PermissionCategory, PermissionTier } from '@/lib/db/types.js'
import { advertisedEntries, canRunInParallel, isEntryAllowed, isEntryEnabled, resolveToolTier, type ToolEntry, ToolRegistry } from '@/lib/tools/registry.js'

function builtin(name: string, partial: Partial<ToolEntry> = {}): ToolEntry {
  return {
    name,
    source: { kind: 'builtin' },
    tool: { type: 'function', function: { name, parameters: {} } },
    handler: () => {
      return name
    },
    prompts: false,
    parallelSafe: false,
    ...partial
  }
}

function mcp(serverId: string, toolName: string, partial: Partial<ToolEntry> = {}): ToolEntry {
  return builtin(`mcp__${serverId}__${toolName}`, {
    source: { kind: 'mcp', serverId, serverName: serverId, toolName },
    category: 'mcp',
    prompts: true,
    ...partial
  })
}

function permissions(overrides: Partial<Record<PermissionCategory, PermissionTier>> = {}): Record<PermissionCategory, PermissionTier> {
  return { terminal: 'ask', files: 'ask', reads: 'ask', apps: 'ask', mcp: 'ask', ...overrides }
}

function profile(partial: Partial<AgentProfile> = {}): AgentProfile {
  return { disabledTools: [], disabledServers: [], disabledSkills: [], ...partial }
}

function names(entries: ToolEntry[]): string[] {
  return entries.map((entry) => {
    return entry.name
  })
}

describe('ToolRegistry', () => {
  it('lists built-in tools first, then MCP tools, and finds them by name', () => {
    const registry = new ToolRegistry()
    registry.setBuiltins([builtin('calculate')])
    registry.setMcp([mcp('fs', 'read')])
    expect(names(registry.list())).toEqual(['calculate', 'mcp__fs__read'])
    expect(registry.get('mcp__fs__read')?.source.kind).toBe('mcp')
    expect(registry.get('missing')).toBeUndefined()
  })

  it('replaces MCP entries without touching built-ins', () => {
    const registry = new ToolRegistry()
    registry.setBuiltins([builtin('calculate')])
    registry.setMcp([mcp('fs', 'read')])
    registry.setMcp([mcp('git', 'log')])
    expect(names(registry.list())).toEqual(['calculate', 'mcp__git__log'])
    registry.setMcp([])
    expect(names(registry.list())).toEqual(['calculate'])
  })

  it('keeps the first entry when names collide', () => {
    const registry = new ToolRegistry()
    registry.setBuiltins([builtin('calculate')])
    registry.setMcp([builtin('calculate', { parallelSafe: true })])
    expect(registry.get('calculate')?.parallelSafe).toBe(false)
  })
})

describe('isEntryEnabled', () => {
  it('uses the per-server flag for MCP tools', () => {
    expect(isEntryEnabled(builtin('read_file'))).toBe(true)
    expect(isEntryEnabled(mcp('fs', 'read'))).toBe(true)
    expect(isEntryEnabled(mcp('fs', 'read', { disabled: true }))).toBe(false)
  })
})

describe('resolveToolTier', () => {
  it('returns null for tools without a permission category', () => {
    expect(resolveToolTier(builtin('calculate'), { permissions: permissions() })).toBeNull()
  })

  it('reads the category tier from settings', () => {
    expect(resolveToolTier(builtin('write_file', { category: 'files' }), { permissions: permissions({ files: 'deny' }) })).toBe('deny')
    expect(resolveToolTier(mcp('fs', 'read'), { permissions: permissions({ mcp: 'auto-accept' }) })).toBe('auto-accept')
  })

  it('prefers the per-server override', () => {
    expect(resolveToolTier(mcp('fs', 'read', { tier: 'deny' }), { permissions: permissions({ mcp: 'auto-accept' }) })).toBe('deny')
  })
})

describe('isEntryAllowed', () => {
  it('allows everything with an empty profile', () => {
    expect(isEntryAllowed(builtin('read_file'), { profile: profile() })).toBe(true)
    expect(isEntryAllowed(mcp('fs', 'read'), { profile: profile() })).toBe(true)
  })

  it('hides the tools and servers detached from the profile', () => {
    const access = { profile: profile({ disabledTools: ['write_file'], disabledServers: ['git'] }) }
    expect(isEntryAllowed(builtin('read_file'), access)).toBe(true)
    expect(isEntryAllowed(builtin('write_file'), access)).toBe(false)
    expect(isEntryAllowed(mcp('fs', 'read'), access)).toBe(true)
    expect(isEntryAllowed(mcp('git', 'log'), access)).toBe(false)
  })

  it('lets a custom list replace the profile', () => {
    const access = { profile: profile({ disabledTools: ['read_file'], disabledServers: ['fs'] }), custom: { builtin: ['read_file'], mcp: ['fs'] } }
    expect(isEntryAllowed(builtin('read_file'), access)).toBe(true)
    expect(isEntryAllowed(builtin('write_file'), access)).toBe(false)
    expect(isEntryAllowed(mcp('fs', 'read'), access)).toBe(true)
    expect(isEntryAllowed(mcp('git', 'log'), access)).toBe(false)
  })

  it('keeps the two custom lists independent', () => {
    const detached = profile({ disabledTools: ['write_file'], disabledServers: ['fs'] })
    expect(isEntryAllowed(mcp('fs', 'read'), { profile: detached, custom: { builtin: ['read_file'] } })).toBe(false)
    expect(isEntryAllowed(mcp('git', 'log'), { profile: detached, custom: { builtin: ['read_file'] } })).toBe(true)
    expect(isEntryAllowed(builtin('write_file'), { profile: detached, custom: { mcp: ['fs'] } })).toBe(false)
    expect(isEntryAllowed(builtin('read_file'), { profile: detached, custom: { mcp: ['fs'] } })).toBe(true)
    expect(isEntryAllowed(mcp('fs', 'read'), { profile: profile(), custom: { mcp: [] } })).toBe(false)
  })
})

describe('advertisedEntries', () => {
  const entries = [
    builtin('calculate'),
    builtin('write_file', { category: 'files' }),
    mcp('fs', 'read'),
    mcp('fs', 'write', { disabled: true }),
    mcp('git', 'log', { tier: 'deny' })
  ]

  it('hides turned-off, detached and denied tools', () => {
    expect(names(advertisedEntries(entries, { permissions: permissions() }, { profile: profile() }))).toEqual(['calculate', 'write_file', 'mcp__fs__read'])
    expect(names(advertisedEntries(entries, { permissions: permissions({ files: 'deny' }) }, { profile: profile({ disabledTools: ['calculate'] }) }))).toEqual(['mcp__fs__read'])
    expect(names(advertisedEntries(entries, { permissions: permissions({ mcp: 'deny' }) }, { profile: profile() }))).toEqual(['calculate', 'write_file'])
    expect(names(advertisedEntries(entries, { permissions: permissions() }, { profile: profile({ disabledServers: ['fs'] }) }))).toEqual(['calculate', 'write_file'])
  })

  it('applies the custom list of a skill instead of the profile', () => {
    const detached = profile({ disabledTools: ['calculate'] })
    expect(names(advertisedEntries(entries, { permissions: permissions() }, { profile: detached, custom: { builtin: ['calculate'], mcp: [] } }))).toEqual(['calculate'])
    expect(names(advertisedEntries(entries, { permissions: permissions() }, { profile: detached, custom: { builtin: ['calculate'] } }))).toEqual(['calculate', 'mcp__fs__read'])
  })

  it('never offers an MCP tool turned off on its server', () => {
    expect(names(advertisedEntries(entries, { permissions: permissions() }, { profile: profile(), custom: { mcp: ['fs'] } }))).toEqual(['calculate', 'write_file', 'mcp__fs__read'])
  })
})

describe('canRunInParallel', () => {
  it('needs every tool to be known and parallel-safe', () => {
    const safe = builtin('calculate', { parallelSafe: true })
    expect(canRunInParallel([safe, safe])).toBe(true)
    expect(canRunInParallel([safe, builtin('write_file')])).toBe(false)
    expect(canRunInParallel([safe, undefined])).toBe(false)
    expect(canRunInParallel([safe, mcp('fs', 'read')])).toBe(false)
  })
})
