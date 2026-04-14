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

export const buildSkillPrompt = (skill: { name: string; description?: string; prompt: string }): string => {
  return [
    `## Active Skill: ${skill.name}`,
    skill.description ? `*${skill.description}*` : '',
    skill.prompt,
    `**Note**: You were activated because the user mentioned \`@${skill.name}\` at the beginning of their message. Please address their request natively without getting confused by the trigger text.`
  ].filter(Boolean).join('\n\n')
}
