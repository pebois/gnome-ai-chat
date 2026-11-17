import { buildDelegateTool, buildSubAgentSystem, resolveDelegation, SUB_AGENT_INSTRUCTIONS } from '@/lib/agent/delegate.js'

const skills = [
  { name: 'Files', description: 'Searches indexed files', prompt: 'You search files.' },
  { name: 'writer', prompt: 'You write prose.' }
]

describe('buildDelegateTool', () => {
  const tool = buildDelegateTool(skills)

  it('keeps the run_skill name and requires a skill and a task', () => {
    expect(tool.function.name).toBe('run_skill')
    expect(tool.function.parameters).toMatchObject({ required: ['skill', 'task'] })
  })

  it('restricts the skill argument to the delegable names', () => {
    expect(tool.function.parameters).toMatchObject({ properties: { skill: { enum: ['Files', 'writer'] } } })
  })

  it('lists names and descriptions but never the prompts', () => {
    expect(tool.function.description).toContain('- Files: Searches indexed files')
    expect(tool.function.description).toContain('- writer')
    expect(tool.function.description).not.toContain('You search files.')
  })
})

describe('resolveDelegation', () => {
  it('finds the skill case-insensitively and tolerates a leading @', () => {
    expect(resolveDelegation({ skill: 'files', task: ' find x ' }, skills)).toEqual({ skill: skills[0], task: 'find x' })
    expect(resolveDelegation({ skill: '@Writer', task: 'draft' }, skills)).toEqual({ skill: skills[1], task: 'draft' })
  })

  it('reports an unknown skill with the valid names', () => {
    expect(resolveDelegation({ skill: 'coder', task: 'x' }, skills)).toEqual({ error: 'Error: Unknown skill "coder". Available skills: Files, writer.' })
    expect(resolveDelegation({ task: 'x' }, [])).toEqual({ error: 'Error: Unknown skill "". Available skills: none.' })
    expect(resolveDelegation({ skill: { name: 'Files' }, task: 'x' }, skills)).toEqual({ error: 'Error: Unknown skill "". Available skills: Files, writer.' })
  })

  it('rejects an empty task', () => {
    expect(resolveDelegation({ skill: 'Files', task: '  ' }, skills)).toEqual({ error: 'Error: The task is empty. Describe what the skill should do.' })
    expect(resolveDelegation({ skill: 'Files' }, skills)).toEqual({ error: 'Error: The task is empty. Describe what the skill should do.' })
  })
})

describe('buildSubAgentSystem', () => {
  it('joins the base prompt, the skill prompt and the sub-agent instructions', () => {
    expect(buildSubAgentSystem('base', skills[0])).toBe(`base\n\n## Active Skill: Files\n\n*Searches indexed files*\n\nYou search files.\n\n${SUB_AGENT_INSTRUCTIONS}`)
  })

  it('skips an empty base prompt', () => {
    expect(buildSubAgentSystem('', skills[1])).toBe(`## Active Skill: writer\n\nYou write prose.\n\n${SUB_AGENT_INSTRUCTIONS}`)
  })
})
