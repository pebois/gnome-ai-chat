import type { ChatMessage } from '@/lib/providers/index.js'

export interface Source {
  kind: 'file' | 'web'
  target: string
  label: string
}

export const MAX_SOURCES = 8

function fileSource(path: string): Source {
  return { kind: 'file', target: path, label: path.split('/').filter(Boolean).pop() || path }
}

function webSource(url: string): Source {
  const match = url.match(/^https?:\/\/([^/?#]+)/i)
  return { kind: 'web', target: url, label: match ? match[1].replace(/^www\./, '') : url }
}

function sourcesFromToolResult(message: ChatMessage): Source[] {
  if (message.tool_name === 'search_vector_index') {
    return [...message.content.matchAll(/^File: (.+)$/gm)].map((m) => {
      return fileSource(m[1].trim())
    })
  }
  return []
}

function sourcesFromToolCalls(message: ChatMessage): Source[] {
  return (message.tool_calls ?? []).flatMap((call) => {
    const args = call.function.arguments ?? {}
    if (call.function.name === 'read_file' && typeof args.path === 'string') {
      return [fileSource(args.path)]
    }
    if (call.function.name === 'fetch_web_page' && typeof args.url === 'string' && /^https?:\/\//i.test(args.url)) {
      return [webSource(args.url)]
    }
    return []
  })
}

export function collectSources(messages: ChatMessage[], index: number): Source[] {
  const message = messages[index]
  if (!message || message.role !== 'assistant' || !message.content?.trim()) {
    return []
  }
  const found: Source[] = []
  for (let i = index - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') {
      break
    }
    if (m.role === 'tool') {
      found.unshift(...sourcesFromToolResult(m))
    } else if (m.role === 'assistant') {
      found.unshift(...sourcesFromToolCalls(m))
    }
  }
  const seen = new Set<string>()
  return found.filter((s) => {
    if (seen.has(s.target)) {
      return false
    }
    seen.add(s.target)
    return true
  }).slice(0, MAX_SOURCES)
}
