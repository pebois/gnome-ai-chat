import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { showFilesDialog } from '@/app/dialog/files.js'
import type { Command } from '@/lib/commands/index.js'
import { DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import { filesStore } from '@/lib/db/files.js'
import type { SearchResult } from '@/lib/db/types.js'

export const files: Command = {
  name: 'files',
  description: 'Manage Local RAG files and folders',
  icon: 'folder-symbolic',
  subCommands: [
    { name: 'manage', description: 'Open the indexed folders management window', icon: 'preferences-system-symbolic' },
    {
      name: 'attach',
      description: 'Search and attach an indexed file',
      icon: 'mail-attachment-symbolic',
      getDynamicMatches: async (_app, query) => {
        if (!query) {
          return []
        }
        const results = await filesStore.searchPaths(query)
        return results.map((r) => {
          let relPath = r.file_path
          if (r.file_path.startsWith(r.root_path)) {
            relPath = r.file_path.substring(r.root_path.length)
            if (relPath.startsWith('/')) {
              relPath = relPath.substring(1)
            }
          }

          let desc = GLib.path_get_dirname(relPath)
          if (desc === '.') {
            desc = '(root)'
          }

          return {
            name: r.file_path,
            title: GLib.path_get_basename(r.file_path),
            description: desc,
            icon: 'text-x-generic-symbolic'
          }
        })
      }
    },
    {
      name: 'search',
      description: 'Semantic search and attach an indexed file',
      icon: 'edit-find-symbolic',
      getDynamicMatches: async (app, query) => {
        if (!query) {
          return []
        }
        try {
          const resp = await app.ollama.embed({
            model: DEFAULT_EMBEDDING_MODEL,
            input: query
          })
          if (!resp?.embeddings?.length) {
            return []
          }
          const results = await filesStore.search(resp.embeddings[0], 15)
          const uniquePaths = new Set<string>()
          const deduped: SearchResult[] = []
          for (const r of results) {
            if (!uniquePaths.has(r.file_path)) {
              uniquePaths.add(r.file_path)
              deduped.push(r)
            }
          }

          return deduped.map((r) => {
            let relPath = r.file_path
            if (r.file_path.startsWith(r.root_path)) {
              relPath = r.file_path.substring(r.root_path.length)
              if (relPath.startsWith('/')) {
                relPath = relPath.substring(1)
              }
            }

            let desc = GLib.path_get_dirname(relPath)
            if (desc === '.') {
              desc = '(root)'
            }

            return {
              name: r.file_path,
              title: GLib.path_get_basename(r.file_path),
              description: desc,
              icon: 'text-x-generic-symbolic'
            }
          })
        } catch (err) {
          console.error('Semantic search failed:', err)
          return []
        }
      }
    }
  ],
  accels: ['<Primary><Shift>f'],
  parameterType: GLib.VariantType.new('s'),
  activate: (app, parameter) => {
    let subCommand = 'manage'
    let argument = ''
    if (parameter) {
      const text = parameter.get_string()[0]
      if (text) {
        const parts = text.split(' ')
        if (parts.length >= 2) {
          subCommand = parts[1].toLowerCase()
          argument = parts.slice(2).join(' ').trim()
        } else if (parts.length === 1 && parts[0] && !parts[0].startsWith('/') && parts[0] !== 'files') {
          subCommand = parts[0].toLowerCase()
        }
      }
    }

    if (subCommand === 'manage') {
      showFilesDialog(app)
    } else if (subCommand === 'attach' || subCommand === 'search') {
      if (argument) {
        app.chat.input.attachments.addFile(Gio.File.new_for_path(argument))
      }
    } else {
      app.showToast(`Unknown files command: ${subCommand}`)
    }
  }
}
