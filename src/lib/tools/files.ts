import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import type { OllamaTool } from '@/lib/ollama.js'

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish')

export const search_files: OllamaTool = {
  type: 'function',
  function: {
    name: 'search_files',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The filename or partial name to search for.'
        },
        directory: {
          type: 'string',
          enum: ['home', 'documents', 'downloads', 'desktop', 'pictures'],
          description: 'The directory to search in.'
        }
      },
      required: ['query']
    },
    description: 'Searches for files in specific user directories.'
  }
}

async function recursiveSearch(dir: Gio.File, query: string, depth: number, maxResults: number, results: string[]): Promise<void> {
  if (depth <= 0 || results.length >= maxResults) {
    return
  }

  try {
    const enumerator = await dir.enumerate_children_async(
      'standard::name,standard::type',
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT,
      null
    )

    while (results.length < maxResults) {
      const files = await enumerator.next_files_async(20, GLib.PRIORITY_DEFAULT, null)
      if (!files || files.length === 0) {
        break
      }

      for (const info of files) {
        if (results.length >= maxResults) {
          break
        }

        const fileName = info.get_name()
        const fileType = info.get_file_type()

        if (fileName.toLowerCase().includes(query.toLowerCase())) {
          results.push(dir.get_child(fileName).get_path() || fileName)
        }

        if (fileType === Gio.FileType.DIRECTORY && !fileName.startsWith('.')) {
          const subDir = dir.get_child(fileName)
          await recursiveSearch(subDir, query, depth - 1, maxResults, results)
        }
      }
    }
    await enumerator.close_async(GLib.PRIORITY_DEFAULT, null)
  } catch (_) {
    // Ignore access denied or missing dir errors during recursive search
  }
}

export async function handle_search_files(args: Record<string, unknown>): Promise<string> {
  const { directory = 'home', query } = args as { query: string; directory: string }

  if (typeof query !== 'string' || !query.trim()) {
    return 'Error: A valid query string is required.'
  }

  const sanitizedQuery = query.replace(/\\/g, '').replace(/\//g, '')

  let path: string
  switch (directory) {
    case 'documents':
      path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS) || ''
      break
    case 'downloads':
      path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) || ''
      break
    case 'desktop':
      path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP) || ''
      break
    case 'pictures':
      path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) || ''
      break
    case 'home':
    default:
      path = GLib.get_home_dir()
  }

  if (!path) {
    return 'Directory not found.'
  }

  const results: string[] = []
  const startDir = Gio.File.new_for_path(path)

  try {
    await recursiveSearch(startDir, sanitizedQuery, 3, 20, results)
  } catch (e) {
    return `Search failed: ${e instanceof Error ? e.message : String(e)}`
  }

  if (results.length === 0) {
    return 'No files found.'
  }

  return results.join('\n')
}
