import { CONTEXT_CHARS_PER_TOKEN } from '@/lib/constants.js'
import type { SearchResult } from '@/lib/tools/websearch.js'
import { stripHtml } from '@/lib/tools/websearch.js'

export const RESEARCH_MAX_QUERIES = 4
export const RESEARCH_MAX_FOLLOW_UPS = 2
export const RESEARCH_PASSAGES_PER_PAGE = 3
export const RESEARCH_SEARCH_RESULT_CHARS = 1500
export const CANCELLED_RESULT = 'Cancelled'
export const NOT_CITED_RESULT = 'Read, not cited'

export interface PageText {
  title: string
  text: string
}

export interface Passage {
  url: string
  title: string
  text: string
}

export interface ResearchSource {
  url: string
  title: string
  passages: string[]
}

const DROPPED_ELEMENTS = ['script', 'style', 'noscript', 'svg', 'nav', 'header', 'footer', 'form', 'aside', 'template']
const BLOCK_TAGS = /<\/?(?:p|div|li|ul|ol|h[1-6]|br|tr|table|section|article|main|blockquote|pre|dd|dt|figcaption)\b[^>]*>/gi

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'de', 'des', 'du', 'est', 'et', 'for', 'from', 'how', 'in', 'is', 'it',
  'la', 'le', 'les', 'of', 'on', 'or', 'pour', 'que', 'qui', 'the', 'to', 'un', 'une', 'what', 'when', 'where', 'which',
  'who', 'why', 'with'
])

export function htmlToText(html: string): PageText {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? stripHtml(titleMatch[1]) : ''

  let body = html.replace(/<!--[\s\S]*?-->/g, ' ')
  const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (bodyMatch) {
    body = bodyMatch[1]
  }
  for (const tag of DROPPED_ELEMENTS) {
    body = body.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ')
  }
  body = body.replace(BLOCK_TAGS, '\n')

  const text = body
    .split('\n')
    .map((line) => {
      return stripHtml(line)
    })
    .filter((line) => {
      return line.length > 0
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return { title, text }
}

export function queryTerms(question: string): string[] {
  const terms = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => {
      return t.length > 1 && !STOP_WORDS.has(t)
    })
  return [...new Set(terms)]
}

export function scorePassage(text: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0
  }
  const lower = text.toLowerCase()
  const hits = terms.filter((t) => {
    return lower.includes(t)
  }).length
  return hits / terms.length
}

export function selectPassages(passages: Passage[], scores: number[], budgetChars: number): ResearchSource[] {
  const ranked = passages
    .map((passage, i) => {
      return { passage, score: scores[i] ?? 0, order: i }
    })
    .sort((a, b) => {
      return b.score - a.score || a.order - b.order
    })

  const perPage = new Map<string, number>()
  const chosen: { passage: Passage; order: number }[] = []
  let used = 0
  for (const { order, passage } of ranked) {
    const count = perPage.get(passage.url) ?? 0
    if (count >= RESEARCH_PASSAGES_PER_PAGE) {
      continue
    }
    if (used + passage.text.length > budgetChars) {
      continue
    }
    perPage.set(passage.url, count + 1)
    chosen.push({ passage, order })
    used += passage.text.length
  }

  const sources = new Map<string, ResearchSource>()
  for (const { passage } of chosen.sort((a, b) => {
    return a.order - b.order
  })) {
    const source = sources.get(passage.url) ?? { url: passage.url, title: passage.title, passages: [] }
    source.passages.push(passage.text)
    sources.set(passage.url, source)
  }
  return [...sources.values()]
}

export function researchBudget(numCtx: number): number {
  return Math.floor(numCtx * CONTEXT_CHARS_PER_TOKEN * 0.55)
}

function parseStringList(json: string, key: string, limit: number): string[] {
  try {
    const data = JSON.parse(json) as Record<string, unknown>
    const list = data?.[key]
    if (!Array.isArray(list)) {
      return []
    }
    const items = list
      .filter((q): q is string => {
        return typeof q === 'string'
      })
      .map((q) => {
        return q.trim()
      })
      .filter(Boolean)
    return [...new Set(items)].slice(0, limit)
  } catch {
    return []
  }
}

export function parsePlan(json: string, question: string): string[] {
  const queries = parseStringList(json, 'queries', RESEARCH_MAX_QUERIES)
  return queries.length > 0 ? queries : [question]
}

export function parseFollowUps(json: string): string[] {
  return parseStringList(json, 'followUps', RESEARCH_MAX_FOLLOW_UPS)
}

export const PLAN_FORMAT = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short web search queries that together cover the question'
    }
  },
  required: ['queries']
}

export const FOLLOW_UP_FORMAT = {
  type: 'object',
  properties: {
    followUps: {
      type: 'array',
      items: { type: 'string' },
      description: 'Web search queries for aspects of the question the passages do not answer yet. Empty when the passages are enough.'
    }
  },
  required: ['followUps']
}

export function buildPlanPrompt(question: string, context: string): string {
  return [
    `Break the research question below into 2 to ${RESEARCH_MAX_QUERIES} short, distinct web search queries (keywords, not sentences) that together cover it.`,
    'Write the queries in the language most likely to give good results.',
    context ? `Recent conversation, for context:\n${context}` : '',
    `Research question: ${question}`
  ].filter(Boolean).join('\n\n')
}

export function buildFollowUpPrompt(question: string, sources: ResearchSource[]): string {
  const digest = sources.map((s, i) => {
    return `[${i + 1}] ${s.title}\n${s.passages.join('\n').slice(0, 600)}`
  }).join('\n\n')
  return [
    `Research question: ${question}`,
    `Passages found so far:\n${digest || '(none)'}`,
    `List at most ${RESEARCH_MAX_FOLLOW_UPS} web search queries for important parts of the question that these passages do not answer. Return an empty list if they are enough.`
  ].join('\n\n')
}

export const REPORT_SYSTEM_PROMPT = [
  'You are a careful research assistant.',
  'Answer the research question using only the numbered sources provided.',
  'Answer in the language of the question. Structure the answer with short markdown headings and bullet points where useful.',
  'Cite sources inline as [n] right after the facts they support. Never invent sources or facts.',
  'If the sources disagree, say so. If they do not cover part of the question, say clearly what is missing.'
].join(' ')

export function buildReportPrompt(question: string, sources: ResearchSource[], snippetsOnly: boolean = false): string {
  const blocks = sources.map((s, i) => {
    return `[${i + 1}] ${s.title || s.url} (${s.url})\n${s.passages.join('\n…\n')}`
  })
  const list = sources.map((s, i) => {
    return `${i + 1}. [${(s.title || s.url).replace(/[[\]]/g, '')}](${s.url})`
  })
  return [
    `Research question: ${question}`,
    snippetsOnly ? 'Note: no page could be read, only search result snippets are available.' : '',
    `Sources:\n\n${blocks.join('\n\n') || '(no sources found)'}`,
    snippetsOnly
      ? `Write the answer now. End with a "## Sources" section that repeats exactly this list:\n${list.join('\n')}`
      : 'Write the answer now. Do not add a sources or references list at the end: the app shows the numbered sources below the answer.'
  ].filter(Boolean).join('\n\n')
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export function recentContext(messages: { role: string; content: string }[], turns: number = 4, maxChars: number = 300): string {
  return messages
    .slice(0, -1)
    .filter((m) => {
      return (m.role === 'user' || m.role === 'assistant') && m.content?.trim()
    })
    .slice(-turns)
    .map((m) => {
      const text = m.content.trim().replace(/\s+/g, ' ')
      return `${m.role.toUpperCase()}: ${text.length > maxChars ? `${text.slice(0, maxChars)}…` : text}`
    })
    .join('\n')
}

export function describeSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results.'
  }
  const text = results.map((r, i) => {
    return `${i + 1}. ${r.title || r.url}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ''}`
  }).join('\n')
  return text.length > RESEARCH_SEARCH_RESULT_CHARS ? `${text.slice(0, RESEARCH_SEARCH_RESULT_CHARS)}…` : text
}

export function describeSources(sources: ResearchSource[]): string {
  if (sources.length === 0) {
    return 'No relevant passages found.'
  }
  return sources.map((s, i) => {
    return `[${i + 1}] ${s.title || s.url} — ${s.url} (${s.passages.length} passages)`
  }).join('\n')
}
