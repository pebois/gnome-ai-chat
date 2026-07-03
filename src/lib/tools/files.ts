import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import { filesStore } from '@/lib/db/files.js'
import type { Tool } from '@/lib/providers/index.js'
import { checkToolPermission } from '@/lib/tools/permissions.js'

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish')

export const search_vector_index: Tool = {
  type: 'function',
  function: {
    name: 'search_vector_index',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to match against file contents.'
        }
      },
      required: ['query']
    },
    description: 'Searches the local vector index of project files using semantic similarity. Returns the most relevant file chunks.'
  }
}

export async function handle_search_vector_index(app: AppInterface, args: Record<string, unknown>): Promise<string> {
  const { query } = args as { query: string }
  if (!query) {
    return 'Error: query is required.'
  }

  try {
    const resp = await app.provider.embed({
      model: DEFAULT_EMBEDDING_MODEL,
      input: query
    })
    if (!resp || !resp.embeddings || resp.embeddings.length === 0) {
      return 'Error: Failed to generate embedding for query.'
    }

    const results = await filesStore.search(resp.embeddings[0], 5)
    if (results.length === 0) {
      return 'No relevant files found in the index.'
    }

    return results.map((r) => {
      return `File: ${r.file_path}\nScore: ${r.score.toFixed(3)}\nContent:\n${r.content}\n---`
    }).join('\n')
  } catch (e) {
    return `Search failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

export const search_files: Tool = {
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
    description: 'Searches for files in specific user directories. Performs a recursive, case-insensitive partial match limited to a depth of 3 and 20 results.'
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

export async function handle_search_files(app: AppInterface, args: Record<string, unknown>): Promise<string> {
  const { directory = 'home', query } = args as { query: string; directory: string }

  if (typeof query !== 'string' || !query.trim()) {
    return 'Error: A valid query string is required.'
  }

  const denied = await checkToolPermission(
    app,
    'search_files',
    'Allow File Search?',
    `The model wants to search for files matching:\n\n${query}\n\nin the '${directory}' directory.`
  )
  if (denied) {
    return denied
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
