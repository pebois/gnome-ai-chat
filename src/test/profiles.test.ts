import { emptyProfile, normalizeAgents, setProfileItems } from '@/lib/agent/profiles.js'

describe('normalizeAgents', () => {
  it('attaches everything to both agents by default', () => {
    expect(normalizeAgents(undefined)).toEqual({ main: emptyProfile(), sub: emptyProfile() })
    expect(normalizeAgents('nope', 42)).toEqual({ main: emptyProfile(), sub: emptyProfile() })
  })

  it('carries the old list of turned-off tools over to both agents', () => {
    const agents = normalizeAgents(undefined, ['write_file', 'calculate', 3])
    expect(agents.main).toEqual({ disabledTools: ['calculate', 'write_file'], disabledServers: [], disabledSkills: [] })
    expect(agents.sub).toEqual(agents.main)
    expect(agents.sub.disabledTools).not.toBe(agents.main.disabledTools)
  })

  it('prefers stored profiles over the old list', () => {
    const agents = normalizeAgents({ main: { disabledServers: ['s1', 's1'], disabledSkills: 'x' }, sub: { disabledTools: ['calculate'] } }, ['write_file'])
    expect(agents.main).toEqual({ disabledTools: [], disabledServers: ['s1'], disabledSkills: [] })
    expect(agents.sub).toEqual({ disabledTools: ['calculate'], disabledServers: [], disabledSkills: [] })
  })

  it('fills a missing profile from the old list', () => {
    const agents = normalizeAgents({ main: { disabledTools: [] } }, ['write_file'])
    expect(agents.main.disabledTools).toEqual([])
    expect(agents.sub.disabledTools).toEqual(['write_file'])
  })
})

describe('setProfileItems', () => {
  it('detaches and reattaches items without duplicates', () => {
    expect(setProfileItems([], ['b', 'a', 'b'], false)).toEqual(['a', 'b'])
    expect(setProfileItems(['a', 'b'], ['a'], true)).toEqual(['b'])
    expect(setProfileItems(['a'], ['z'], true)).toEqual(['a'])
  })
})
