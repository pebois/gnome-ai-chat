import type { Tool } from '@/lib/providers/index.js'
import { buildSkillPrompt } from '@/lib/skills/index.js'
import { run_skill } from '@/lib/tools/skills.js'

interface DelegableSkill {
  name: string
  description?: string
  prompt: string
}

export type Delegation<S> = { skill: S; task: string } | { error: string }

export const SUB_AGENT_INSTRUCTIONS = [
  '## Sub-agent',
  'You are running as a sub-agent on a delegated task. The caller sees only your final message, not your tool calls.',
  'Finish the task with your tools, then reply once with a concise answer containing every fact, path or value the caller needs.'
].join('\n')

function skillNames(skills: DelegableSkill[]): string {
  return skills.map((skill) => {
    return skill.name
  }).join(', ')
}

export function buildDelegateTool(skills: DelegableSkill[]): Tool {
  const list = skills.map((skill) => {
    return skill.description ? `- ${skill.name}: ${skill.description}` : `- ${skill.name}`
  }).join('\n')
  return {
    type: 'function',
    function: {
      name: run_skill.function.name,
      parameters: {
        type: 'object',
        properties: {
          skill: {
            type: 'string',
            enum: skills.map((skill) => {
              return skill.name
            }),
            description: 'Name of the skill to run.'
          },
          task: {
            type: 'string',
            description: 'Complete, self-contained instructions for the skill. It does not see this conversation, so include every detail it needs.'
          }
        },
        required: ['skill', 'task']
      },
      description: `${run_skill.function.description} Use it when a task matches one of these skills and needs several tool calls:\n${list}`
    }
  }
}

export function resolveDelegation<S extends DelegableSkill>(args: Record<string, unknown>, skills: S[]): Delegation<S> {
  const requested = typeof args.skill === 'string' ? args.skill.trim() : ''
  const name = requested.replace(/^@/, '').toLowerCase()
  const task = typeof args.task === 'string' ? args.task.trim() : ''
  const skill = skills.find((s) => {
    return s.name.toLowerCase() === name
  })
  if (!skill) {
    return { error: `Error: Unknown skill "${requested}". Available skills: ${skillNames(skills) || 'none'}.` }
  }
  if (!task) {
    return { error: 'Error: The task is empty. Describe what the skill should do.' }
  }
  return { skill, task }
}

export function buildSubAgentSystem(system: string, skill: DelegableSkill): string {
  return [system, buildSkillPrompt(skill), SUB_AGENT_INSTRUCTIONS].filter(Boolean).join('\n\n')
}
