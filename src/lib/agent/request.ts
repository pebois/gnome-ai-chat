import { buildDelegateTool } from '@/lib/agent/delegate.js'
import type { AgentProfile, Settings, SkillTools } from '@/lib/db/types.js'
import type { ChatMessage, Tool } from '@/lib/providers/index.js'
import { buildSkillPrompt, matchSkill, stripSkillMention } from '@/lib/skills/index.js'
import { advertisedEntries, type ToolAccess, type ToolEntry } from '@/lib/tools/registry.js'
import { RUN_SKILL_TOOL } from '@/lib/tools/skills.js'

interface TurnSkill {
  name: string
  description?: string
  prompt: string
  tools?: SkillTools
}

export interface TurnInput<S extends TurnSkill> {
  system: string
  messages: ChatMessage[]
  skills: S[]
  delegable: S[]
  entries: ToolEntry[]
  profile: AgentProfile
  settings: Pick<Settings, 'permissions'>
}

export interface TurnPlan<S extends TurnSkill> {
  skill?: S
  system: string
  messages: ChatMessage[]
  tools: Tool[]
  access: ToolAccess
}

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i
    }
  }
  return -1
}

export function planTurn<S extends TurnSkill>(input: TurnInput<S>): TurnPlan<S> {
  const index = lastUserIndex(input.messages)
  const skill = index === -1 ? undefined : matchSkill(input.messages[index].content, input.skills)
  const access: ToolAccess = { profile: input.profile, custom: skill?.tools }
  const canDelegate = !skill && input.delegable.length > 0
  const tools = advertisedEntries(input.entries, input.settings, access).filter((entry) => {
    return canDelegate || entry.name !== RUN_SKILL_TOOL
  }).map((entry) => {
    return entry.name === RUN_SKILL_TOOL ? buildDelegateTool(input.delegable) : entry.tool
  })
  if (!skill) {
    return { system: input.system, messages: input.messages, tools, access }
  }
  return {
    skill,
    system: [input.system, buildSkillPrompt(skill)].filter(Boolean).join('\n\n'),
    messages: input.messages.map((m, i) => {
      return i === index ? { ...m, content: stripSkillMention(m.content) } : m
    }),
    tools,
    access
  }
}
