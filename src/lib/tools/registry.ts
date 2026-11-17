import type Gio from 'gi://Gio'

import type { AppInterface } from '@/lib/app.js'
import type { AgentProfile, PermissionCategory, PermissionTier, Settings, SkillTools } from '@/lib/db/types.js'
import type { Tool } from '@/lib/providers/index.js'

export type ToolSource
  = { kind: 'builtin' }
    | { kind: 'mcp'; serverId: string; serverName: string; toolName: string; description?: string }

export type ToolHandler = (app: AppInterface, args: Record<string, unknown>, cancellable?: Gio.Cancellable) => string | Promise<string>

export interface ToolEntry {
  name: string
  source: ToolSource
  tool: Tool
  handler: ToolHandler
  category?: PermissionCategory
  prompts: boolean
  tier?: PermissionTier
  disabled?: boolean
  parallelSafe: boolean
}

export interface ToolAccess {
  profile: Pick<AgentProfile, 'disabledTools' | 'disabledServers'>
  custom?: SkillTools
}

type TierSettings = Pick<Settings, 'permissions'>

export class ToolRegistry {
  private _builtins: ToolEntry[] = []
  private _mcp: ToolEntry[] = []
  private _index = new Map<string, ToolEntry>()

  public setBuiltins(entries: ToolEntry[]): void {
    this._builtins = entries
    this._reindex()
  }

  public setMcp(entries: ToolEntry[]): void {
    this._mcp = entries
    this._reindex()
  }

  public get(name: string): ToolEntry | undefined {
    return this._index.get(name)
  }

  public list(): ToolEntry[] {
    return [...this._index.values()]
  }

  private _reindex(): void {
    this._index.clear()
    for (const entry of [...this._builtins, ...this._mcp]) {
      if (!this._index.has(entry.name)) {
        this._index.set(entry.name, entry)
      }
    }
  }
}

export function isEntryEnabled(entry: ToolEntry): boolean {
  return !entry.disabled
}

export function resolveToolTier(entry: ToolEntry, settings: TierSettings): PermissionTier | null {
  if (!entry.category) {
    return null
  }
  return entry.tier ?? settings.permissions?.[entry.category] ?? 'ask'
}

export function isEntryAllowed(entry: ToolEntry, access: ToolAccess): boolean {
  if (entry.source.kind === 'mcp') {
    return access.custom?.mcp
      ? access.custom.mcp.includes(entry.source.serverId)
      : !access.profile.disabledServers.includes(entry.source.serverId)
  }
  return access.custom?.builtin
    ? access.custom.builtin.includes(entry.name)
    : !access.profile.disabledTools.includes(entry.name)
}

export function advertisedEntries(entries: ToolEntry[], settings: TierSettings, access: ToolAccess): ToolEntry[] {
  return entries.filter((entry) => {
    return isEntryEnabled(entry) && resolveToolTier(entry, settings) !== 'deny' && isEntryAllowed(entry, access)
  })
}

export function canRunInParallel(entries: (ToolEntry | undefined)[]): boolean {
  return entries.every((entry) => {
    return entry?.parallelSafe === true
  })
}
