import type Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Soup from 'gi://Soup?version=3.0'

import type { PageText } from '@/lib/agent/research.js'
import { htmlToText } from '@/lib/agent/research.js'
import type { AppInterface } from '@/lib/app.js'
import { APPLICATION_ID, DEEPSEARCH_PAGE_MAX_BYTES, VERSION } from '@/lib/constants.js'
import type { Tool } from '@/lib/providers/index.js'
import type { SearchResult } from '@/lib/tools/websearch.js'
import { buildDuckDuckGoUrl, buildWikipediaUrl, mergeResults, parseDuckDuckGoResults, parseWikipediaResults, wikipediaLanguage } from '@/lib/tools/websearch.js'

let _session: Soup.Session | undefined

function getSession(): Soup.Session {
  if (_session) {
    return _session
  }

  _session = new Soup.Session()
  _session.timeout = 15

  const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), APPLICATION_ID, 'web-cache'])
  const cache = Soup.Cache.new(cacheDir, Soup.CacheType.SINGLE_USER)
  cache.set_max_size(50 * 1024 * 1024) // 50MB
  cache.load()
  _session.add_feature(cache)

  return _session
}

export const fetch_web_page: Tool = {
  type: 'function',
  function: {
    name: 'fetch_web_page',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the web page to fetch.'
        }
      },
      required: ['url']
    },
    description: 'Fetches the raw HTML source of a web page (truncated to 50k characters).'
  }
}

export const fetch_rss_feed: Tool = {
  type: 'function',
  function: {
    name: 'fetch_rss_feed',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the RSS or Atom feed to fetch.'
        }
      },
      required: ['url']
    },
    description: 'Fetches and parses an RSS or Atom feed, returning a structured JSON list of the top 20 items with their titles, links, and descriptions.'
  }
}

export const web_search: Tool = {
  type: 'function',
  function: {
    name: 'web_search',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Short keyword queries work best.'
        },
        language: {
          type: 'string',
          description: 'Optional two-letter language code for the results, such as "en" or "fr". Defaults to the user\'s language.'
        }
      },
      required: ['query']
    },
    description: 'Searches the web (encyclopedia articles, official sites and instant answers) and returns the top results as a JSON list of titles, URLs and snippets. Use fetch_web_page to read a result.'
  }
}

async function getJson(url: string, cancellable: Gio.Cancellable | null = null): Promise<string> {
  const msg = Soup.Message.new('GET', url)
  if (!msg) {
    throw new Error(`Invalid URL: ${url}`)
  }
  const headers = msg.get_request_headers()
  headers.append('Accept', 'application/json')
  headers.append('User-Agent', `${APPLICATION_ID}/${VERSION}`)
  const bytes = await getSession().send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable)
  if (msg.get_status() !== Soup.Status.OK || !bytes) {
    throw new Error(`${msg.get_reason_phrase() || msg.get_status()}`)
  }
  return new TextDecoder().decode(bytes.toArray())
}

export async function searchWeb(query: string, language: string, cancellable: Gio.Cancellable | null = null): Promise<SearchResult[]> {
  const [ddg, wikipedia] = await Promise.allSettled([
    getJson(buildDuckDuckGoUrl(query), cancellable).then(parseDuckDuckGoResults),
    getJson(buildWikipediaUrl(language, query), cancellable).then((json) => {
      return parseWikipediaResults(json, language)
    })
  ])
  if (ddg.status === 'rejected' && wikipedia.status === 'rejected') {
    throw ddg.reason instanceof Error ? ddg.reason : new Error(String(ddg.reason))
  }
  return mergeResults([
    ddg.status === 'fulfilled' ? ddg.value : [],
    wikipedia.status === 'fulfilled' ? wikipedia.value : []
  ])
}

export function defaultSearchLanguage(): string {
  return wikipediaLanguage(GLib.get_language_names())
}

export async function fetchPageText(url: string, cancellable: Gio.Cancellable | null = null): Promise<PageText> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('Only http and https URLs are allowed.')
  }
  const msg = Soup.Message.new('GET', url)
  if (!msg) {
    throw new Error(`Invalid URL: ${url}`)
  }
  msg.get_request_headers().append('User-Agent', `${APPLICATION_ID}/${VERSION}`)
  const bytes = await getSession().send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable)
  if (msg.get_status() !== Soup.Status.OK || !bytes) {
    throw new Error(`${msg.get_reason_phrase() || msg.get_status()}`)
  }
  const [contentType] = msg.get_response_headers().get_content_type()
  if (contentType && !contentType.startsWith('text/') && !contentType.includes('xml')) {
    throw new Error(`Unsupported content type ${contentType}`)
  }
  const data = bytes.toArray()
  const html = new TextDecoder().decode(data.length > DEEPSEARCH_PAGE_MAX_BYTES ? data.subarray(0, DEEPSEARCH_PAGE_MAX_BYTES) : data)
  return contentType?.startsWith('text/plain') ? { title: '', text: html } : htmlToText(html)
}

export async function handle_web_search(app: AppInterface, args: Record<string, unknown>): Promise<string> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return 'Error: A search query is required.'
  }
  const requestedLanguage = typeof args.language === 'string' ? args.language.trim().toLowerCase() : ''
  const language = /^[a-z]{2,3}$/.test(requestedLanguage) ? requestedLanguage : defaultSearchLanguage()

  try {
    const results = await searchWeb(query, language)
    if (results.length === 0) {
      return `No results found for "${query}". Try a shorter query, or different keywords.`
    }
    return JSON.stringify(results, null, 2)
  } catch (e) {
    return `Error searching the web: ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function handle_fetch_web_page(args: Record<string, unknown>): Promise<string> {
  const url = typeof args.url === 'string' ? args.url : ''

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'Error: Only http and https URLs are allowed.'
  }

  const session = getSession()
  const msg = Soup.Message.new('GET', url)

  try {
    const bytes = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const text = decoder.decode(bytes.toArray())
      return text.length > 50000 ? text.substring(0, 50000) + '\n[...Truncated...]' : text
    }
    return `Failed to fetch ${url}: ${msg.get_reason_phrase() || msg.get_status()}`
  } catch (e) {
    return `Error fetching web page: ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function handle_fetch_rss_feed(args: Record<string, unknown>): Promise<string> {
  const url = typeof args.url === 'string' ? args.url : ''

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'Error: Only http and https URLs are allowed.'
  }

  const session = getSession()
  const msg = Soup.Message.new('GET', url)

  try {
    const bytes = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const xml = decoder.decode(bytes.toArray())

      const items: Record<string, string>[] = []
      const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/ig
      let match: RegExpExecArray | null
      let count = 0

      const clean = (str: string): string => {
        return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim()
      }

      while ((match = itemRegex.exec(xml)) !== null && count < 20) {
        const inner = match[1]
        const titleMatch = inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i)

        let linkStr = ''
        const linkMatch = inner.match(/<link[^>]*>([\s\S]*?)<\/link>/i)
        if (linkMatch && linkMatch[1].trim()) {
          linkStr = linkMatch[1]
        } else {
          const hrefMatch = inner.match(/<link[^>]*href="([^"]+)"/i)
          if (hrefMatch) {
            linkStr = hrefMatch[1]
          }
        }

        const descMatch = inner.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i)

        items.push({
          title: titleMatch ? clean(titleMatch[1]) : '',
          link: linkStr.trim(),
          description: descMatch ? clean(descMatch[1]) : ''
        })
        count++
      }

      return JSON.stringify(items, null, 2)
    }
    return `Failed to fetch RSS feed ${url}: ${msg.get_reason_phrase() || msg.get_status()}`
  } catch (e) {
    return `Error fetching RSS feed: ${e instanceof Error ? e.message : String(e)}`
  }
}
