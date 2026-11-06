import type { ChatMessage } from '@/lib/providers/index.js'

export function findMessageMatches(messages: ChatMessage[], query: string): number[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return []
  }
  const matches: number[] = []
  messages.forEach((m, i) => {
    if ((m.role === 'user' || m.role === 'assistant') && m.content?.toLowerCase().includes(needle)) {
      matches.push(i)
    }
  })
  return matches
}

export function stepMatch(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) {
    return -1
  }
  if (current < 0) {
    return direction === 1 ? 0 : count - 1
  }
  return (current + direction + count) % count
}

export interface TextRange {
  start: number
  end: number
}

export function findRanges(text: string, query: string): TextRange[] {
  const needle = Array.from(query.trim().toLocaleLowerCase())
  if (needle.length === 0) {
    return []
  }
  const chars = Array.from(text)
  const lower = chars.map((c) => {
    return c.toLocaleLowerCase()
  })
  const ranges: TextRange[] = []
  let i = 0
  while (i + needle.length <= lower.length) {
    let matched = true
    for (let j = 0; j < needle.length; j++) {
      if (lower[i + j] !== needle[j]) {
        matched = false
        break
      }
    }
    if (matched) {
      ranges.push({ start: i, end: i + needle.length })
      i += needle.length
    } else {
      i++
    }
  }
  return ranges
}

export function toByteRanges(text: string, ranges: TextRange[]): TextRange[] {
  const encoder = new TextEncoder()
  const chars = Array.from(text)
  return ranges.map((r) => {
    return {
      start: encoder.encode(chars.slice(0, r.start).join('')).length,
      end: encoder.encode(chars.slice(0, r.end).join('')).length
    }
  })
}
