import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { findToolResult } from '@/lib/tools/results.js'

const call = (name: string): ToolCall => {
  return { id: '', function: { index: 0, name, arguments: {} } }
}

describe('findToolResult', () => {
  const a = call('read_file')
  const b = call('fetch_web_page')
  const c = call('read_file')
  const messages: ChatMessage[] = [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: '', tool_calls: [a, b] },
    { role: 'tool', tool_name: 'read_file', content: 'file A' },
    { role: 'tool', tool_name: 'fetch_web_page', content: 'page B' },
    { role: 'assistant', content: '', tool_calls: [c] },
    { role: 'tool', tool_name: 'read_file', content: 'file C' }
  ]

  it('finds each result by call identity and position', () => {
    expect(findToolResult(messages, a)?.content).toBe('file A')
    expect(findToolResult(messages, b)?.content).toBe('page B')
    expect(findToolResult(messages, c)?.content).toBe('file C')
  })

  it('ignores a result for another tool', () => {
    const wrong: ChatMessage[] = [{ role: 'assistant', content: '', tool_calls: [a] }, { role: 'tool', tool_name: 'other', content: 'x' }]
    expect(findToolResult(wrong, a)).toBeUndefined()
  })

  it('returns nothing when the result is missing or the call is unknown', () => {
    expect(findToolResult([{ role: 'assistant', content: '', tool_calls: [a] }], a)).toBeUndefined()
    expect(findToolResult(messages, call('read_file'))).toBeUndefined()
  })
})
