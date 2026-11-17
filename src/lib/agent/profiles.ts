import type { AgentKind, AgentProfile } from '@/lib/db/types.js'

export const AGENT_KINDS: AgentKind[] = ['main', 'sub']

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.filter((v): v is string => {
    return typeof v === 'string'
  }))].sort()
}

export function emptyProfile(): AgentProfile {
  return { disabledTools: [], disabledServers: [], disabledSkills: [] }
}

function normalizeProfile(value: unknown, legacyDisabledTools: string[]): AgentProfile {
  if (!value || typeof value !== 'object') {
    return { ...emptyProfile(), disabledTools: [...legacyDisabledTools] }
  }
  const profile = value as Partial<Record<keyof AgentProfile, unknown>>
  return {
    disabledTools: asStringArray(profile.disabledTools),
    disabledServers: asStringArray(profile.disabledServers),
    disabledSkills: asStringArray(profile.disabledSkills)
  }
}

export function normalizeAgents(agents: unknown, legacyDisabledTools?: unknown): Record<AgentKind, AgentProfile> {
  const legacy = asStringArray(legacyDisabledTools)
  const source = agents && typeof agents === 'object' ? agents as Partial<Record<AgentKind, unknown>> : {}
  return {
    main: normalizeProfile(source.main, legacy),
    sub: normalizeProfile(source.sub, legacy)
  }
}

export function setProfileItems(list: string[], names: string[], attached: boolean): string[] {
  const detached = new Set(list)
  for (const name of names) {
    if (attached) {
      detached.delete(name)
    } else {
      detached.add(name)
    }
  }
  return [...detached].sort()
}
