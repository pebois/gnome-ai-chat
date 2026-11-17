import { planTurn } from '@/lib/agent/request.js'
import type { AgentProfile, PermissionCategory, PermissionTier, SkillTools } from '@/lib/db/types.js'
import type { ChatMessage } from '@/lib/providers/index.js'
import type { ToolEntry } from '@/lib/tools/registry.js'

interface TestSkill {
  name: string
  description?: string
  prompt: string
  tools?: SkillTools
}

const skills: TestSkill[] = [
  { name: 'coder', description: 'Writes code', prompt: 'You write code.' },
  { name: 'writer', prompt: 'You write prose.' },
  { name: 'canvas', prompt: 'You render.', tools: { builtin: ['render_html'], mcp: ['s1'] } },
  { name: 'mute', prompt: 'No tools.', tools: { builtin: [], mcp: [] } }
]

function entry(name: string, serverId?: string): ToolEntry {
  return {
    name,
    source: serverId ? { kind: 'mcp', serverId, serverName: serverId, toolName: name } : { kind: 'builtin' },
    tool: { type: 'function', function: { name, parameters: {} } },
    handler: () => {
      return ''
    },
    category: serverId ? 'mcp' : undefined,
    prompts: false,
    parallelSafe: false
  }
}

const entries = [entry('render_html'), entry('read_file'), entry('mcp__s1__list', 's1'), entry('mcp__s2__list', 's2'), entry('mcp__s3__list', 's3'), entry('run_skill')]
const permissions = { terminal: 'ask', files: 'ask', reads: 'ask', apps: 'ask', mcp: 'ask' } as Record<PermissionCategory, PermissionTier>
const settings = { permissions }

function profile(partial: Partial<AgentProfile> = {}): AgentProfile {
  return { disabledTools: [], disabledServers: ['s3'], disabledSkills: [], ...partial }
}

function plan(messages: ChatMessage[], system = 'base') {
  return planTurn({ system, messages, skills, delegable: skills, entries, profile: profile(), settings })
}

function toolNames(messages: ChatMessage[]): string[] {
  return plan(messages).tools.map((tool) => {
    return tool.function.name
  })
}

describe('planTurn', () => {
  it('returns the system prompt and messages untouched without a mention', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }]
    const result = plan(messages)
    expect(result.skill).toBeUndefined()
    expect(result.system).toBe('base')
    expect(result.messages).toBe(messages)
    expect(result.allow).toBeUndefined()
  })

  it('appends the skill prompt and strips the mention from the last user message', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: '@Coder fix this' }]
    const result = plan(messages)
    expect(result.skill?.name).toBe('coder')
    expect(result.system).toBe('base\n\n## Active Skill: coder\n\n*Writes code*\n\nYou write code.')
    expect(result.messages[0].content).toBe('fix this')
    expect(messages[0].content).toBe('@Coder fix this')
  })

  it('uses only the skill prompt when the base system prompt is empty', () => {
    expect(plan([{ role: 'user', content: '@writer hi' }], '').system).toBe('## Active Skill: writer\n\nYou write prose.')
  })

  it('only considers the last user message', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: '@coder first' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'second' }
    ]
    const result = plan(messages)
    expect(result.skill).toBeUndefined()
    expect(result.messages[0].content).toBe('@coder first')
  })

  it('keeps the skill across tool rounds appended after the user message', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: '@coder run it' },
      { role: 'assistant', content: '' },
      { role: 'tool', tool_name: 'calculate', content: '4' }
    ]
    const result = plan(messages)
    expect(result.skill?.name).toBe('coder')
    expect(result.messages[0].content).toBe('run it')
    expect(result.messages[2]).toBe(messages[2])
  })

  it('ignores a mention of an unknown skill', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: '@memory recall' }]
    const result = plan(messages)
    expect(result.skill).toBeUndefined()
    expect(result.messages).toBe(messages)
  })

  it('advertises every tool without a skill or with an unrestricted skill', () => {
    const all = ['render_html', 'read_file', 'mcp__s1__list', 'mcp__s2__list']
    expect(toolNames([{ role: 'user', content: 'hello' }])).toEqual([...all, 'run_skill'])
    expect(toolNames([{ role: 'user', content: '@coder hello' }])).toEqual(all)
  })

  it('restricts tools to the built-in names and MCP servers the skill declares', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: '@canvas draw' }]
    expect(toolNames(messages)).toEqual(['render_html', 'mcp__s1__list'])
    expect(plan(messages).access.custom).toEqual({ builtin: ['render_html'], mcp: ['s1'] })
  })

  it('advertises no tool for a skill with an empty allowlist', () => {
    expect(toolNames([{ role: 'user', content: '@mute hi' }])).toEqual([])
  })

  it('lets the custom list of a skill replace the main profile', () => {
    const result = planTurn({ system: 'base', messages: [{ role: 'user', content: '@canvas draw' }], skills, delegable: skills, entries, profile: profile({ disabledTools: ['render_html'], disabledServers: ['s1'] }), settings })
    expect(result.tools.map((tool) => {
      return tool.function.name
    })).toEqual(['render_html', 'mcp__s1__list'])
  })

  it('offers a server detached from the main agent only to a skill that selects it', () => {
    const picky = [{ name: 'picky', prompt: 'p', tools: { mcp: ['s3'] } }]
    const result = planTurn({ system: 'base', messages: [{ role: 'user', content: '@picky go' }], skills: picky, delegable: [], entries, profile: profile(), settings })
    expect(result.tools.map((tool) => {
      return tool.function.name
    })).toEqual(['render_html', 'read_file', 'mcp__s3__list'])
  })

  it('lists the delegable skills in the run_skill tool when no skill is active', () => {
    const result = planTurn({ system: 'base', messages: [{ role: 'user', content: 'hello' }], skills: [], delegable: skills.slice(0, 2), entries, profile: profile(), settings })
    const tool = result.tools.find((t) => {
      return t.function.name === 'run_skill'
    })
    expect(tool?.function.description).toContain('- coder: Writes code')
    expect(JSON.stringify(tool?.function.parameters)).toContain('"enum":["coder","writer"]')
  })

  it('does not offer delegation without a delegable skill', () => {
    const none = planTurn({ system: 'base', messages: [{ role: 'user', content: 'hello' }], skills, delegable: [], entries, profile: profile(), settings })
    expect(none.tools.some((tool) => {
      return tool.function.name === 'run_skill'
    })).toBe(false)
  })

  it('ignores a mention of a skill that is not attached to the main agent', () => {
    const result = planTurn({ system: 'base', messages: [{ role: 'user', content: '@coder hello' }], skills: [], delegable: skills, entries, profile: profile(), settings })
    expect(result.skill).toBeUndefined()
    expect(result.messages[0].content).toBe('@coder hello')
  })
})
