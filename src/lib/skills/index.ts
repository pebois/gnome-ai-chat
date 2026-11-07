import type { Skill } from '@/lib/db/types.js'
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
