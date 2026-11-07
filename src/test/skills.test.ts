import { applySkillMention, buildSkillPrompt, matchSkill, stripSkillMention } from '@/lib/skills/index.js'

describe('matchSkill', () => {
  const skills = [
    { name: 'Coder', prompt: 'coder prompt' },
    { name: 'code', prompt: 'code prompt' },
    { name: 'Writer', prompt: 'writer prompt' }
  ]

  it('matches a mention at the start of the message', () => {
    expect(matchSkill('@Coder explain closures', skills)?.name).toBe('Coder')
  })

  it('matches case-insensitively', () => {
    expect(matchSkill('@coder explain closures', skills)?.name).toBe('Coder')
    expect(matchSkill('@WRITER draft a post', skills)?.name).toBe('Writer')
  })

  it('requires exact token equality, not prefix', () => {
    expect(matchSkill('@coder review', skills)?.name).toBe('Coder')
    expect(matchSkill('@code review', skills)?.name).toBe('code')
    expect(matchSkill('@coders review', skills)).toBeUndefined()
  })

  it('matches a mention with no trailing text', () => {
    expect(matchSkill('@coder', skills)?.name).toBe('Coder')
  })

  it('matches on multi-line messages', () => {
    expect(matchSkill('@coder\nexplain this', skills)?.name).toBe('Coder')
  })

  it('ignores mentions that are not at the start', () => {
    expect(matchSkill('hey @coder help', skills)).toBeUndefined()
    expect(matchSkill(' @coder help', skills)).toBeUndefined()
  })

  it('returns undefined for unknown names and plain text', () => {
    expect(matchSkill('@unknown hello', skills)).toBeUndefined()
    expect(matchSkill('hello world', skills)).toBeUndefined()
    expect(matchSkill('@', skills)).toBeUndefined()
    expect(matchSkill('', skills)).toBeUndefined()
  })

  it('returns undefined when there are no skills', () => {
    expect(matchSkill('@coder hello', [])).toBeUndefined()
  })
})

describe('stripSkillMention', () => {
  it('removes the leading mention and following whitespace', () => {
    expect(stripSkillMention('@coder explain closures')).toBe('explain closures')
    expect(stripSkillMention('@coder\nexplain this')).toBe('explain this')
  })

  it('returns an empty string for a bare mention', () => {
    expect(stripSkillMention('@coder')).toBe('')
  })

  it('leaves text without a leading mention intact', () => {
    expect(stripSkillMention('hello @coder')).toBe('hello @coder')
  })
})

describe('buildSkillPrompt', () => {
  it('includes name, description and prompt', () => {
    const result = buildSkillPrompt({ name: 'Coder', description: 'Expert engineer', prompt: 'Be concise.' })
    expect(result).toBe('## Active Skill: Coder\n\n*Expert engineer*\n\nBe concise.')
  })

  it('omits the description block when absent', () => {
    const result = buildSkillPrompt({ name: 'Coder', prompt: 'Be concise.' })
    expect(result).toBe('## Active Skill: Coder\n\nBe concise.')
  })

  it('does not include the trigger-text note', () => {
    const result = buildSkillPrompt({ name: 'Coder', prompt: 'Be concise.' })
    expect(result).not.toContain('activated')
  })
})

describe('applySkillMention', () => {
  const skills = [{ name: 'Coder' }, { name: 'Writer' }, { name: 'Memory' }]

  it('adds a mention to plain text', () => {
    expect(applySkillMention('hello', skills, 'Memory')).toBe('@Memory hello')
  })

  it('replaces an existing skill mention', () => {
    expect(applySkillMention('@Coder fix this', skills, 'Writer')).toBe('@Writer fix this')
    expect(applySkillMention('@coder fix this', skills, 'Writer')).toBe('@Writer fix this')
  })

  it('removes the mention when no skill is chosen', () => {
    expect(applySkillMention('@Coder fix this', skills, null)).toBe('fix this')
  })

  it('keeps a leading mention that is not a skill', () => {
    expect(applySkillMention('@john hi', skills, 'Coder')).toBe('@Coder @john hi')
    expect(applySkillMention('@john hi', skills, null)).toBe('@john hi')
  })

  it('handles empty text', () => {
    expect(applySkillMention('', skills, 'Coder')).toBe('@Coder ')
    expect(applySkillMention('', skills, null)).toBe('')
  })
})
