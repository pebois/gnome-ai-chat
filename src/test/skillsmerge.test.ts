import type { Skill } from '@/lib/db/types.js'
import { availableSkills, DEFAULT_SKILLS, describeSkillTools, isBuiltinSkill, isSkillAvailable, mergeBuiltinSkills, parseSkillTools, resetSkill, skillDiffersFromDefault, skillFromRow } from '@/lib/skills/index.js'

function skill(partial: Partial<Skill> & { id: string }): Skill {
  return { name: partial.id, prompt: '', enabled: true, ...partial }
}

const defaults: Skill[] = [
  skill({ id: 'coder', name: 'Coder', prompt: 'code' }),
  skill({ id: 'memory', name: 'Memory', prompt: 'remember', tools: { builtin: ['read_graph', 'search_nodes'], mcp: [] } })
]

describe('parseSkillTools', () => {
  it('returns undefined for empty or invalid values', () => {
    expect(parseSkillTools(null)).toBeUndefined()
    expect(parseSkillTools('')).toBeUndefined()
    expect(parseSkillTools('not json')).toBeUndefined()
    expect(parseSkillTools('null')).toBeUndefined()
  })

  it('keeps only string entries', () => {
    expect(parseSkillTools('{"builtin":["read_file",3],"mcp":"x"}')).toEqual({ builtin: ['read_file'] })
    expect(parseSkillTools('{"mcp":["s1"]}')).toEqual({ mcp: ['s1'] })
    expect(parseSkillTools('{"builtin":[],"mcp":[]}')).toEqual({ builtin: [], mcp: [] })
    expect(parseSkillTools('{}')).toBeUndefined()
  })
})

describe('skillFromRow', () => {
  it('maps database columns to a skill', () => {
    expect(skillFromRow({ id: 'a', name: 'A', description: null, prompt: 'p', enabled: 0, tools: '{"builtin":[],"mcp":["s1"]}', embeddings: '[1,2]' })).toEqual({
      id: 'a',
      name: 'A',
      description: undefined,
      prompt: 'p',
      enabled: false,
      tools: { builtin: [], mcp: ['s1'] },
      embeddings: [1, 2]
    })
  })

  it('treats a missing enabled column as enabled and missing tools as unrestricted', () => {
    const result = skillFromRow({ id: 'a', name: 'A', prompt: 'p' })
    expect(result.enabled).toBe(true)
    expect(result.tools).toBeUndefined()
  })
})

describe('mergeBuiltinSkills', () => {
  it('returns every default on an empty table', () => {
    const { added, skills } = mergeBuiltinSkills([], defaults)
    expect(skills.map((s) => {
      return s.id
    })).toEqual(['coder', 'memory'])
    expect(added).toHaveLength(2)
    expect(skills[0]).not.toBe(defaults[0])
  })

  it('keeps edited rows and adds only the missing built-ins', () => {
    const edited = skill({ id: 'coder', name: 'Coder', prompt: 'my own prompt' })
    const custom = skill({ id: 'x1', name: 'Zed' })
    const { added, skills } = mergeBuiltinSkills([edited, custom], defaults)
    expect(skills).toContain(edited)
    expect(added.map((s) => {
      return s.id
    })).toEqual(['memory'])
    expect(skills.map((s) => {
      return s.name
    })).toEqual(['Coder', 'Memory', 'Zed'])
  })

  it('renames an added built-in whose name is already taken', () => {
    const custom = skill({ id: 'x1', name: 'memory' })
    const { added } = mergeBuiltinSkills([custom], defaults)
    expect(added.find((s) => {
      return s.id === 'memory'
    })?.name).toBe('Memory-2')
  })

  it('adds nothing when every built-in exists', () => {
    expect(mergeBuiltinSkills(defaults.map((s) => {
      return { ...s }
    }), defaults).added).toEqual([])
  })
})

describe('built-in detection and reset', () => {
  it('detects built-ins by id', () => {
    expect(isBuiltinSkill('coder', defaults)).toBe(true)
    expect(isBuiltinSkill('x1', defaults)).toBe(false)
    expect(isBuiltinSkill('coder')).toBe(true)
  })

  it('reports differences in name, description, prompt and tools but not enabled', () => {
    expect(skillDiffersFromDefault(skill({ id: 'coder', name: 'Coder', prompt: 'code' }), defaults)).toBe(false)
    expect(skillDiffersFromDefault(skill({ id: 'coder', name: 'Coder', prompt: 'code', enabled: false }), defaults)).toBe(false)
    expect(skillDiffersFromDefault(skill({ id: 'coder', name: 'Coder', prompt: 'other' }), defaults)).toBe(true)
    expect(skillDiffersFromDefault(skill({ id: 'coder', name: 'Coder', prompt: 'code', tools: { builtin: [], mcp: [] } }), defaults)).toBe(true)
    expect(skillDiffersFromDefault(skill({ id: 'memory', name: 'Memory', prompt: 'remember', tools: { builtin: ['search_nodes', 'read_graph'], mcp: [] } }), defaults)).toBe(false)
    expect(skillDiffersFromDefault(skill({ id: 'memory', name: 'Memory', prompt: 'remember', tools: { builtin: ['read_graph', 'search_nodes'] } }), defaults)).toBe(true)
    expect(skillDiffersFromDefault(skill({ id: 'x1' }), defaults)).toBe(false)
  })

  it('resets a built-in in place, keeping enabled and dropping embeddings', () => {
    const edited = skill({ id: 'memory', name: 'Mem', prompt: 'x', enabled: false, embeddings: [1] })
    expect(resetSkill(edited, defaults)).toBe(true)
    expect(edited).toEqual({ id: 'memory', name: 'Memory', description: undefined, prompt: 'remember', enabled: false, tools: { builtin: ['read_graph', 'search_nodes'], mcp: [] }, embeddings: undefined })
    expect(edited.tools).not.toBe(defaults[1].tools)
  })

  it('does not reset a custom skill', () => {
    expect(resetSkill(skill({ id: 'x1' }), defaults)).toBe(false)
  })

  it('ships built-ins that are enabled and unmodified', () => {
    for (const s of DEFAULT_SKILLS) {
      expect(s.enabled).toBe(true)
      expect(skillDiffersFromDefault(s)).toBe(false)
    }
  })
})

describe('isSkillAvailable', () => {
  const servers = [{ id: 's1', enabled: true }, { id: 's2', enabled: false }]
  const profile = { disabledSkills: ['detached'] }

  it('hides disabled skills and skills detached from the profile', () => {
    expect(isSkillAvailable({ id: 'a', enabled: false }, profile, servers)).toBe(false)
    expect(isSkillAvailable({ id: 'detached', enabled: true }, profile, servers)).toBe(false)
    expect(isSkillAvailable({ id: 'detached', enabled: true }, { disabledSkills: [] }, servers)).toBe(true)
  })

  it('keeps skills that follow the agent or declare built-in tools', () => {
    expect(isSkillAvailable({ id: 'a', enabled: true }, profile, servers)).toBe(true)
    expect(isSkillAvailable({ id: 'a', enabled: true, tools: { builtin: [], mcp: [] } }, profile, servers)).toBe(true)
    expect(isSkillAvailable({ id: 'a', enabled: true, tools: { builtin: ['read_graph'], mcp: ['s2'] } }, profile, servers)).toBe(true)
    expect(isSkillAvailable({ id: 'a', enabled: true, tools: { mcp: ['s2'] } }, profile, servers)).toBe(true)
  })

  it('needs a connected server when a skill only declares servers', () => {
    expect(isSkillAvailable({ id: 'a', enabled: true, tools: { builtin: [], mcp: ['s1'] } }, profile, servers)).toBe(true)
    expect(isSkillAvailable({ id: 'a', enabled: true, tools: { builtin: [], mcp: ['s2'] } }, profile, servers)).toBe(false)
    expect(isSkillAvailable({ id: 'a', enabled: true, tools: { builtin: [], mcp: ['gone'] } }, profile, servers)).toBe(false)
  })

  it('filters a list down to the available skills', () => {
    const skills = [skill({ id: 'a' }), skill({ id: 'b', enabled: false }), skill({ id: 'detached' })]
    expect(availableSkills(skills, profile, servers).map((s) => {
      return s.id
    })).toEqual(['a'])
  })
})

describe('skill tool summaries', () => {
  it('describes the declared tools', () => {
    expect(describeSkillTools(undefined)).toBe('Follows the agent\'s tools')
    expect(describeSkillTools({})).toBe('Follows the agent\'s tools')
    expect(describeSkillTools({ builtin: [], mcp: [] })).toBe('No built-in tools · no MCP servers')
    expect(describeSkillTools({ builtin: ['read_file'] })).toBe('1 built-in tool · agent\'s MCP servers')
    expect(describeSkillTools({ builtin: ['read_file', 'write_file'], mcp: ['s1'] })).toBe('2 built-in tools · 1 MCP server')
    expect(describeSkillTools({ mcp: ['s1', 's2'] })).toBe('Agent\'s built-in tools · 2 MCP servers')
  })
})
