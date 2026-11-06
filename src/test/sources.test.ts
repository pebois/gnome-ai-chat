import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { collectSources, MAX_SOURCES, stripSourcesSection } from '@/lib/sources.js'

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
      { kind: 'web', target: 'https://www.gnome.org/about', label: 'about · gnome.org' },
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

  it('skips pages that were not cited, failed or were cancelled', () => {
    const ok = call('fetch_web_page', { url: 'https://ok.org' })
    const unused = call('fetch_web_page', { url: 'https://unused.org' })
    const failed = call('fetch_web_page', { url: 'https://failed.org' })
    const stopped = call('fetch_web_page', { url: 'https://stopped.org' })
    const trail: ChatMessage[] = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '', tool_calls: [ok, unused, failed, stopped] },
      { role: 'tool', tool_name: 'fetch_web_page', content: 'OK\nhttps://ok.org\n\npassage' },
      { role: 'tool', tool_name: 'fetch_web_page', content: 'Read, not cited: Unused' },
      { role: 'tool', tool_name: 'fetch_web_page', content: 'Error: 404' },
      { role: 'tool', tool_name: 'fetch_web_page', content: 'Cancelled' },
      { role: 'assistant', content: 'report' }
    ]
    expect(collectSources(trail, 6).map((s) => {
      return s.target
    })).toEqual(['https://ok.org'])
  })

  it('labels web pages with their name and host', () => {
    const trail: ChatMessage[] = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '', tool_calls: [call('fetch_web_page', { url: 'https://en.wikipedia.org/wiki/GNOME_3' }), call('fetch_web_page', { url: 'https://os.gnome.org/' }), call('fetch_web_page', { url: 'https://x.org/docs/caf%C3%A9-guide.html?a=1' })] },
      { role: 'assistant', content: 'report' }
    ]
    expect(collectSources(trail, 2).map((s) => {
      return s.label
    })).toEqual(['GNOME 3 · en.wikipedia.org', 'os.gnome.org', 'café guide · x.org'])
  })
})

describe('stripSourcesSection', () => {
  it('removes a trailing Sources heading with linked items', () => {
    const content = 'GNOME is a desktop [1].\n\n## Sources\n\n1. [GNOME](https://gnome.org)\n2. https://en.wikipedia.org/wiki/GNOME\n'
    expect(stripSourcesSection(content)).toBe('GNOME is a desktop [1].')
  })

  it('removes a bold References label with citation lines', () => {
    const content = 'Answer.\n\n**References:**\n[1] https://a.org\n[2]: https://b.org'
    expect(stripSourcesSection(content)).toBe('Answer.')
  })

  it('keeps a Sources label followed by prose', () => {
    const content = 'Answer.\n\nSources:\nI could not find any reliable page about this.'
    expect(stripSourcesSection(content)).toBe(content)
  })

  it('keeps sources mentioned in the text', () => {
    const content = 'Check the sources below the answer for details.\n- see https://a.org'
    expect(stripSourcesSection(content)).toBe(content)
  })

  it('leaves content without a sources section unchanged', () => {
    expect(stripSourcesSection('Just an answer.')).toBe('Just an answer.')
  })
})
