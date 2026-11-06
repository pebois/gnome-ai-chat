import type { SearchResult } from '@/lib/tools/searxng.js'
import { SEARCH_MAX_RESULTS } from '@/lib/tools/searxng.js'

const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: '\'',
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_m, code: string) => {
      return String.fromCodePoint(parseInt(code, 10))
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => {
      return String.fromCodePoint(parseInt(code, 16))
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => {
      return ENTITIES[name.toLowerCase()] ?? m
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function wikipediaLanguage(languageNames: string[]): string {
  for (const name of languageNames) {
    const match = name.match(/^([a-z]{2,3})(?:[_.@-]|$)/i)
    if (match && name !== 'C' && name !== 'POSIX') {
      return match[1].toLowerCase()
    }
  }
  return 'en'
}

export function buildWikipediaUrl(language: string, query: string, limit: number = SEARCH_MAX_RESULTS): string {
  return `https://${language}.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`
}

export function parseWikipediaResults(json: string, language: string): SearchResult[] {
  const data = JSON.parse(json) as { query?: { search?: { title?: unknown; snippet?: unknown }[] } }
  return (data.query?.search ?? [])
    .filter((r) => {
      return typeof r.title === 'string' && r.title.length > 0
    })
    .map((r) => {
      const title = r.title as string
      return {
        title,
        url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        snippet: typeof r.snippet === 'string' ? stripHtml(r.snippet) : ''
      }
    })
}

export function buildDuckDuckGoUrl(query: string): string {
  return `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&no_redirect=1`
}

interface DuckDuckGoTopic {
  FirstURL?: string
  Text?: string
  Topics?: DuckDuckGoTopic[]
}

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url) && !/^https?:\/\/(?:[^/]+\.)?duckduckgo\.com\//i.test(url)
}

export function parseDuckDuckGoResults(json: string): SearchResult[] {
  const data = JSON.parse(json) as {
    Heading?: string
    AbstractText?: string
    AbstractURL?: string
    Answer?: string
    Definition?: string
    DefinitionURL?: string
    Results?: DuckDuckGoTopic[]
    RelatedTopics?: DuckDuckGoTopic[]
  }
  const results: SearchResult[] = []
  const heading = data.Heading?.trim() ?? ''
  if (data.AbstractURL && data.AbstractText?.trim()) {
    results.push({ title: heading || data.AbstractURL, url: data.AbstractURL, snippet: data.AbstractText.trim() })
  }
  if (data.DefinitionURL && data.Definition?.trim()) {
    results.push({ title: heading ? `${heading} (definition)` : data.DefinitionURL, url: data.DefinitionURL, snippet: data.Definition.trim() })
  }
  const topics = [...(data.Results ?? []), ...(data.RelatedTopics ?? [])].flatMap((t) => {
    return t.Topics ? t.Topics : [t]
  })
  for (const topic of topics) {
    if (topic.FirstURL && isExternal(topic.FirstURL)) {
      const text = topic.Text?.trim() ?? ''
      results.push({ title: text.split(' - ')[0] || topic.FirstURL, url: topic.FirstURL, snippet: text })
    }
  }
  if (data.Answer?.trim() && results.length === 0) {
    results.push({ title: heading || 'Instant answer', url: 'https://duckduckgo.com', snippet: data.Answer.trim() })
  }
  return results
}

export function mergeResults(lists: SearchResult[][], limit: number = SEARCH_MAX_RESULTS): SearchResult[] {
  const seen = new Set<string>()
  const merged: SearchResult[] = []
  for (const result of lists.flat()) {
    const key = result.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push(result)
  }
  return merged.slice(0, limit)
}
