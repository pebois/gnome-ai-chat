import { generateId, isValidItemName, uniqueName, validateItemName } from '@/lib/naming.js'

const rules = { noun: 'skill', invalidMessage: 'invalid name' }

describe('naming', () => {
  describe('isValidItemName', () => {
    it('accepts letters, digits, hyphens and underscores', () => {
      expect(isValidItemName('coder')).toBe(true)
      expect(isValidItemName('My-skill_2')).toBe(true)
      expect(isValidItemName('9lives')).toBe(true)
    })

    it('rejects spaces, leading separators and empty names', () => {
      expect(isValidItemName('my skill')).toBe(false)
      expect(isValidItemName('-x')).toBe(false)
      expect(isValidItemName('_x')).toBe(false)
      expect(isValidItemName('')).toBe(false)
    })
  })

  describe('uniqueName', () => {
    it('returns the base when free and suffixes otherwise', () => {
      expect(uniqueName('new-server', [])).toBe('new-server')
      expect(uniqueName('new-server', ['new-server'])).toBe('new-server-2')
      expect(uniqueName('new-server', ['New-Server', 'new-server-2'])).toBe('new-server-3')
    })
  })

  describe('generateId', () => {
    it('generates distinct ids', () => {
      expect(generateId()).not.toBe(generateId())
    })
  })

  describe('validateItemName', () => {
    const others = [{ id: 'a', name: 'Coder' }, { id: 'b', name: 'writer' }]

    it('accepts a free valid name', () => {
      expect(validateItemName('planner', 'c', others, rules)).toBeNull()
    })

    it('accepts the current name of the same item', () => {
      expect(validateItemName('coder', 'a', others, rules)).toBeNull()
    })

    it('reports an invalid name with the configured message', () => {
      expect(validateItemName('my skill', 'c', others, rules)).toBe('invalid name')
    })

    it('reports a case-insensitive duplicate using the noun', () => {
      expect(validateItemName('CODER', 'c', others, rules)).toBe('A skill named "CODER" already exists')
    })

    it('uses a custom validity rule when provided', () => {
      const strict = { ...rules, isValid: (name: string) => {
        return name.length > 3
      } }
      expect(validateItemName('abc', 'c', others, strict)).toBe('invalid name')
    })
  })
})
