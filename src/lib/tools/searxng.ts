export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export const SEARCH_MAX_RESULTS = 8

export function buildSearxngUrl(base: string, query: string): string {
  const trimmed = base.trim().replace(/\/+$/, '').replace(/\/search$/, '')
  return `${trimmed}/search?q=${encodeURIComponent(query)}&format=json`
}

export function parseSearxngResults(json: string, limit: number = SEARCH_MAX_RESULTS): SearchResult[] {
  const data = JSON.parse(json) as { results?: { title?: unknown; url?: unknown; content?: unknown }[] }
  return (data.results ?? [])
    .filter((r) => {
      return typeof r.url === 'string' && r.url.length > 0
    })
    .slice(0, limit)
    .map((r) => {
      return {
        title: typeof r.title === 'string' ? r.title.trim() : '',
        url: r.url as string,
        snippet: typeof r.content === 'string' ? r.content.trim() : ''
      }
    })
}
