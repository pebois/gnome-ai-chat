import { findMessageMatches, findRanges, stepMatch, toByteRanges } from '@/lib/find.js'
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

describe('findRanges', () => {
  it('finds every occurrence case-insensitively', () => {
    expect(findRanges('Gnome and GNOME and gnome', 'gnome')).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 15 },
      { start: 20, end: 25 }
    ])
  })

  it('does not overlap occurrences', () => {
    expect(findRanges('aaa', 'aa')).toEqual([{ start: 0, end: 2 }])
  })

  it('returns nothing for an empty query', () => {
    expect(findRanges('text', '  ')).toEqual([])
  })

  it('counts characters, not code units', () => {
    expect(findRanges('😀 Été été', 'été')).toEqual([
      { start: 2, end: 5 },
      { start: 6, end: 9 }
    ])
  })
})

describe('toByteRanges', () => {
  it('converts character offsets to UTF-8 byte offsets', () => {
    const text = '😀 Été été'
    expect(toByteRanges(text, findRanges(text, 'été'))).toEqual([
      { start: 5, end: 10 },
      { start: 11, end: 16 }
    ])
  })
})
