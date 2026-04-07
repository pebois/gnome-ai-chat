import { buildSkillPrompt } from '@/lib/skills/index.js'

describe('skills index', () => {
  describe('buildSkillPrompt', () => {
    it('builds a prompt with a description', () => {
      const skill = {
        name: 'Coder',
        description: 'Expert software engineer',
        prompt: 'You write code.'
      }

      const expected = '## Active Skill: Coder\n\n*Expert software engineer*\n\nYou write code.\n\n**Note**: You were activated because the user mentioned `@Coder` at the beginning of their message. Please address their request natively without getting confused by the trigger text.'

      expect(buildSkillPrompt(skill)).toBe(expected)
    })

    it('builds a prompt without a description', () => {
      const skill = {
        name: 'QuietSkill',
        prompt: 'You do not talk.'
      }

      const expected = '## Active Skill: QuietSkill\n\nYou do not talk.\n\n**Note**: You were activated because the user mentioned `@QuietSkill` at the beginning of their message. Please address their request natively without getting confused by the trigger text.'

      expect(buildSkillPrompt(skill)).toBe(expected)
    })

    it('handles empty prompt gracefully', () => {
      const skill = {
        name: 'Empty',
        prompt: ''
      }

      const expected = '## Active Skill: Empty\n\n**Note**: You were activated because the user mentioned `@Empty` at the beginning of their message. Please address their request natively without getting confused by the trigger text.'

      expect(buildSkillPrompt(skill)).toBe(expected)
    })
  })
})
