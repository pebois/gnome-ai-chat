import { CANCELLED_RESULT, NOT_CITED_RESULT } from '@/lib/agent/research.js'
import type { ChatMessage } from '@/lib/providers/index.js'
import { isToolError } from '@/lib/tools/labels.js'
import { findToolResult } from '@/lib/tools/results.js'

export interface Source {
  kind: 'file' | 'web'
  target: string
  label: string
}

export const MAX_SOURCES = 8

const SOURCES_LABEL = /^\s*(?:#{1,6}\s+)?(?:\*\*|__)?\s*(?:sources?(?: cited| used)?|references|r[ée]f[ée]rences|citations|bibliography)\s*:?\s*(?:\*\*|__)?\s*:?\s*$/i
const SOURCE_ITEM = /^\s*(?:[-*+]|\d+[.)]|\[\d+\]:?)\s+.*(?:https?:\/\/|\]\()/

export function stripSourcesSection(content: string): string {
  const lines = content.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!SOURCES_LABEL.test(lines[i])) {
      continue
    }
    const rest = lines.slice(i + 1).filter((line) => {
      return line.trim() !== ''
    })
    if (rest.length > 0 && rest.every((line) => {
      return SOURCE_ITEM.test(line)
    })) {
      return lines.slice(0, i).join('\n').trimEnd()
    }
    return content
  }
  return content
}

function fileSource(path: string): Source {
  return { kind: 'file', target: path, label: path.split('/').filter(Boolean).pop() || path }
}

function webSource(url: string): Source {
  const match = url.match(/^https?:\/\/([^/?#]+)([^?#]*)/i)
  if (!match) {
    return { kind: 'web', target: url, label: url }
  }
  const host = match[1].replace(/^www\./, '')
  const segment = match[2].split('/').filter(Boolean).pop()
  let name = ''
  if (segment) {
    try {
      name = decodeURIComponent(segment)
    } catch {
      name = segment
    }
    name = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim()
  }
  return { kind: 'web', target: url, label: name ? `${name} · ${host}` : host }
}

function sourcesFromToolResult(message: ChatMessage): Source[] {
  if (message.tool_name === 'search_vector_index') {
    return [...message.content.matchAll(/^File: (.+)$/gm)].map((m) => {
      return fileSource(m[1].trim())
    })
  }
  return []
}

const SKIPPED_RESULTS = [CANCELLED_RESULT, NOT_CITED_RESULT]

function sourcesFromToolCalls(messages: ChatMessage[], message: ChatMessage): Source[] {
  return (message.tool_calls ?? []).flatMap((call) => {
    const result = findToolResult(messages, call)
    if (result && (isToolError(result.content) || SKIPPED_RESULTS.some((prefix) => {
      return result.content.startsWith(prefix)
    }))) {
      return []
    }
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
      found.unshift(...sourcesFromToolCalls(messages, m))
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
