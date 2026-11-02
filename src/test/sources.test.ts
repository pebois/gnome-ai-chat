import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { collectSources, MAX_SOURCES } from '@/lib/sources.js'

const call = (name: string, args: Record<string, unknown>): ToolCall => {
  return { id: '', function: { index: 0, name, arguments: args } }
}

describe('collectSources', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'old question' },
    { role: 'assistant', content: '', tool_calls: [call('read_file', { path: '/old/file.ts' })] },
    { role: 'tool', tool_name: 'read_file', content: '...' },
    { role: 'assistant', content: 'old answer' },
    { role: 'user', content: 'question' },
    { role: 'assistant', content: '', tool_calls: [call('search_vector_index', { query: 'x' }), call('fetch_web_page', { url: 'https://www.gnome.org/about' })] },
    { role: 'tool', tool_name: 'search_vector_index', content: 'File: /src/a.ts\nScore: 0.9\nContent:\n...\n---\nFile: /src/b.md\nScore: 0.8\nContent:\n...\n---\nFile: /src/a.ts\nScore: 0.7' },
    { role: 'tool', tool_name: 'fetch_web_page', content: '<html>' },
    { role: 'assistant', content: 'answer' }
  ]

  it('collects files and pages used in the current turn only', () => {
    expect(collectSources(messages, 8)).toEqual([
      { kind: 'web', target: 'https://www.gnome.org/about', label: 'gnome.org' },
      { kind: 'file', target: '/src/a.ts', label: 'a.ts' },
      { kind: 'file', target: '/src/b.md', label: 'b.md' }
    ])
  })

  it('returns nothing for messages without content or that are not from the assistant', () => {
    expect(collectSources(messages, 5)).toEqual([])
    expect(collectSources(messages, 4)).toEqual([])
  })

  it('limits the number of sources', () => {
    const many: ChatMessage[] = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '', tool_calls: Array.from({ length: 20 }, (_, i) => {
        return call('read_file', { path: `/f${i}` })
      }) },
      { role: 'assistant', content: 'a' }
    ]
    expect(collectSources(many, 2)).toHaveLength(MAX_SOURCES)
  })
})
