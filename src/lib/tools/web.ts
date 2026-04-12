import GLib from 'gi://GLib?version=2.0'
import Soup from 'gi://Soup?version=3.0'

import { APPLICATION_ID } from '@/lib/constants.js'
import type { Tool } from '@/lib/providers/index.js'

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
