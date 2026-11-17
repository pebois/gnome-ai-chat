import type { AgentProfile, McpServer, Skill, SkillTools } from '@/lib/db/types.js'
import { type NameRules, uniqueName } from '@/lib/naming.js'
import { canvas } from '@/lib/skills/canvas.js'
import { coder } from '@/lib/skills/coder.js'
import { files } from '@/lib/skills/files.js'
import { memory } from '@/lib/skills/memory.js'
import { planner } from '@/lib/skills/planner.js'
import { reviewer } from '@/lib/skills/reviewer.js'
import { writer } from '@/lib/skills/writer.js'

export const DEFAULT_SKILLS: Skill[] = [
  canvas,
  coder,
  files,
  memory,
  planner,
  reviewer,
  writer
]

export const SKILL_NAME_RULES: NameRules = {
  noun: 'skill',
  invalidMessage: 'Skill names can only contain letters, digits, hyphens and underscores'
}

export const matchSkill = <T extends { name: string }>(content: string, skills: T[]): T | undefined => {
  const mention = content.match(/^@(\S+)/)?.[1]?.toLowerCase()
  if (!mention) {
    return undefined
  }
  return skills.find((s) => {
    return s.name.toLowerCase() === mention
  })
}

export const stripSkillMention = (content: string): string => {
  return content.replace(/^@\S+\s*/, '')
}

export const applySkillMention = (text: string, skills: { name: string }[], name: string | null): string => {
  const rest = matchSkill(text, skills) ? stripSkillMention(text) : text
  return name ? `@${name} ${rest}` : rest
}

export const buildSkillPrompt = (skill: { name: string; description?: string; prompt: string }): string => {
  return [
    `## Active Skill: ${skill.name}`,
    skill.description ? `*${skill.description}*` : '',
    skill.prompt
  ].filter(Boolean).join('\n\n')
}

type SkillProfile = Pick<AgentProfile, 'disabledSkills'>
type ServerState = Pick<McpServer, 'id' | 'enabled'>

export interface SkillRow {
  id: string
  name: string
  description?: string | null
  prompt: string
  enabled?: number | null
  tools?: string | null
  embeddings?: string | null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((v): v is string => {
    return typeof v === 'string'
  })
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? asStringArray(value) : undefined
}

export function normalizeSkillTools(tools: SkillTools | undefined): SkillTools | undefined {
  if (!tools || (!tools.builtin && !tools.mcp)) {
    return undefined
  }
  const result: SkillTools = {}
  if (tools.builtin) {
    result.builtin = [...tools.builtin]
  }
  if (tools.mcp) {
    result.mcp = [...tools.mcp]
  }
  return result
}

export function parseSkillTools(text: string | null | undefined): SkillTools | undefined {
  if (!text) {
    return undefined
  }
  try {
    const parsed = JSON.parse(text) as Partial<Record<keyof SkillTools, unknown>> | null
    if (!parsed || typeof parsed !== 'object') {
      return undefined
    }
    return normalizeSkillTools({ builtin: optionalStringArray(parsed.builtin), mcp: optionalStringArray(parsed.mcp) })
  } catch {
    return undefined
  }
}

export function skillFromRow(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    prompt: row.prompt,
    enabled: row.enabled !== 0,
    tools: parseSkillTools(row.tools),
    embeddings: row.embeddings ? JSON.parse(row.embeddings) as number[] : undefined
  }
}

export function cloneSkill(skill: Skill): Skill {
  return {
    ...skill,
    tools: normalizeSkillTools(skill.tools),
    embeddings: skill.embeddings ? [...skill.embeddings] : undefined
  }
}

export function sortSkills(skills: Skill[]): Skill[] {
  return skills.sort((a, b) => {
    return a.name.localeCompare(b.name)
  })
}

export function defaultSkill(id: string, defaults: Skill[] = DEFAULT_SKILLS): Skill | undefined {
  return defaults.find((s) => {
    return s.id === id
  })
}

export function isBuiltinSkill(id: string, defaults: Skill[] = DEFAULT_SKILLS): boolean {
  return defaultSkill(id, defaults) !== undefined
}

function sortedKey(list: string[] | undefined): string[] | null {
  return list ? [...list].sort() : null
}

function toolsKey(tools: SkillTools | undefined): string {
  return JSON.stringify([sortedKey(tools?.builtin), sortedKey(tools?.mcp)])
}

export function skillDiffersFromDefault(skill: Skill, defaults: Skill[] = DEFAULT_SKILLS): boolean {
  const def = defaultSkill(skill.id, defaults)
  if (!def) {
    return false
  }
  return skill.name !== def.name
    || (skill.description ?? '') !== (def.description ?? '')
    || skill.prompt !== def.prompt
    || toolsKey(skill.tools) !== toolsKey(def.tools)
}

export function resetSkill(skill: Skill, defaults: Skill[] = DEFAULT_SKILLS): boolean {
  const def = defaultSkill(skill.id, defaults)
  if (!def) {
    return false
  }
  const fresh = cloneSkill(def)
  skill.name = fresh.name
  skill.description = fresh.description
  skill.prompt = fresh.prompt
  skill.tools = fresh.tools
  skill.embeddings = undefined
  return true
}

export function mergeBuiltinSkills(rows: Skill[], defaults: Skill[] = DEFAULT_SKILLS): { skills: Skill[]; added: Skill[] } {
  const ids = new Set(rows.map((s) => {
    return s.id
  }))
  const skills = [...rows]
  const added: Skill[] = []
  for (const def of defaults) {
    if (ids.has(def.id)) {
      continue
    }
    const skill = cloneSkill(def)
    skill.name = uniqueName(def.name, skills.map((s) => {
      return s.name
    }))
    skills.push(skill)
    added.push(skill)
  }
  return { skills: sortSkills(skills), added }
}

export function isSkillAvailable(skill: Pick<Skill, 'id' | 'enabled' | 'tools'>, profile: SkillProfile, servers: ServerState[]): boolean {
  if (!skill.enabled || profile.disabledSkills.includes(skill.id)) {
    return false
  }
  const builtin = skill.tools?.builtin
  const mcp = skill.tools?.mcp ?? []
  if (!builtin || builtin.length > 0 || mcp.length === 0) {
    return true
  }
  return mcp.some((id) => {
    return servers.some((server) => {
      return server.id === id && server.enabled
    })
  })
}

export function availableSkills<T extends Pick<Skill, 'id' | 'enabled' | 'tools'>>(skills: T[], profile: SkillProfile, servers: ServerState[]): T[] {
  return skills.filter((skill) => {
    return isSkillAvailable(skill, profile, servers)
  })
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function describeSkillTools(tools: SkillTools | undefined): string {
  if (!tools?.builtin && !tools?.mcp) {
    return 'Follows the agent\'s tools'
  }
  const builtin = tools.builtin
    ? tools.builtin.length > 0 ? countLabel(tools.builtin.length, 'built-in tool') : 'No built-in tools'
    : 'Agent\'s built-in tools'
  const mcp = tools.mcp
    ? tools.mcp.length > 0 ? countLabel(tools.mcp.length, 'MCP server') : 'no MCP servers'
    : 'agent\'s MCP servers'
  return `${builtin} · ${mcp}`
}
