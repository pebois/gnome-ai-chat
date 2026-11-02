import { findMessageMatches, stepMatch } from '@/lib/find.js'
import type { ChatMessage } from '@/lib/providers/index.js'

describe('findMessageMatches', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Hello GNOME' },
    { role: 'assistant', content: 'Hi! gnome is great' },
    { role: 'tool', content: 'gnome tool output' },
    { role: 'assistant', content: 'Nothing here' }
  ]

  it('matches user and assistant messages case-insensitively', () => {
    expect(findMessageMatches(messages, 'Gnome')).toEqual([0, 1])
  })

  it('returns nothing for an empty query', () => {
    expect(findMessageMatches(messages, '  ')).toEqual([])
  })
})

describe('stepMatch', () => {
  it('starts at the first or last match', () => {
    expect(stepMatch(-1, 3, 1)).toBe(0)
    expect(stepMatch(-1, 3, -1)).toBe(2)
  })

  it('wraps around', () => {
    expect(stepMatch(2, 3, 1)).toBe(0)
    expect(stepMatch(0, 3, -1)).toBe(2)
  })

  it('returns -1 without matches', () => {
    expect(stepMatch(0, 0, 1)).toBe(-1)
  })
})
