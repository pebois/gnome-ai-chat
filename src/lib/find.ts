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
