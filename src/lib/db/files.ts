import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import { db } from '@/lib/db/index.js'
import type { FileChunk, IndexedPath, SearchResult } from '@/lib/db/types.js'
import type { Ollama } from '@/lib/ollama.js'
import { RecursiveCharacterTextSplitter } from '@/lib/splitter.js'
import { cosineSimilarity } from '@/lib/utils.js'

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish')
Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish')

export class FilesStore {
  private _progress = new Map<string, number>()

  public async getPaths(): Promise<IndexedPath[]> {
    const sql = `
      SELECT
        p.path,
        p.status,
        COUNT(c.file_path) as chunkCount,
        COUNT(DISTINCT c.file_path) as fileCount
      FROM vector_paths p
      LEFT JOIN vector_chunks c ON c.file_path = p.path OR c.file_path LIKE p.path || '/%'
      GROUP BY p.path;
    `
    const stdout = await db.execSql(sql, ['-json'])
    if (!stdout) {
      return []
    }
    try {
      const rows = JSON.parse(stdout) as { path: string; status: string; chunkCount: number; fileCount: number }[]
      return rows.map((r) => {
        return {
          path: r.path,
          status: r.status as 'indexed' | 'indexing' | 'pending',
          chunkCount: r.chunkCount,
          fileCount: r.fileCount,
          progress: this._progress.get(r.path)
        }
      })
    } catch (e) {
      console.error('Failed to parse paths JSON:', e)
      return []
    }
  }

  public async addPath(path: string): Promise<void> {
    const escapedPath = db.escape(path)
    await db.execSql(`INSERT OR REPLACE INTO vector_paths (path, status) VALUES ('${escapedPath}', 'pending');`)
  }

  public async removePath(path: string): Promise<void> {
    const escapedPath = db.escape(path)
    await db.execSql(`DELETE FROM vector_paths WHERE path = '${escapedPath}';`)
    await db.execSql(`DELETE FROM vector_chunks WHERE file_path LIKE '${escapedPath}/%';`)
    await db.execSql(`DELETE FROM vector_chunks WHERE file_path = '${escapedPath}';`)
  }

  public async updatePathStatus(path: string, status: string): Promise<void> {
    const escapedPath = db.escape(path)
    await db.execSql(`UPDATE vector_paths SET status = '${status}' WHERE path = '${escapedPath}';`)
  }

  public async saveChunk(chunk: FileChunk): Promise<void> {
    const escapedPath = db.escape(chunk.file_path)
    const escapedContent = db.escape(chunk.content)
    const embeddingStr = JSON.stringify(chunk.embedding)
    await db.execSql(`INSERT INTO vector_chunks (file_path, content, embedding) VALUES ('${escapedPath}', '${escapedContent}', '${embeddingStr}');`)
  }

  public async getAllChunks(): Promise<FileChunk[]> {
    const sql = `SELECT file_path, content, embedding FROM vector_chunks;`
    const stdout = await db.execSql(sql, ['-json'])
    if (!stdout) {
      return []
    }
    try {
      const rows = JSON.parse(stdout) as { file_path: string; content: string; embedding: string }[]
      return rows.map((r) => {
        return {
          file_path: r.file_path,
          content: r.content,
          embedding: JSON.parse(r.embedding) as number[]
        }
      })
    } catch (e) {
      console.error('Failed to parse chunks JSON:', e)
      return []
    }
  }

  public async search(queryEmbedding: number[], limit: number = 3): Promise<SearchResult[]> {
    const chunks = await this.getAllChunks()

    const results: SearchResult[] = chunks.map((chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding)
      return { file_path: chunk.file_path, content: chunk.content, score }
    })

    results.sort((a, b) => {
      return b.score - a.score
    })
    return results.slice(0, limit)
  }

  public async indexPath(ollama: Ollama, targetPath: string): Promise<void> {
    await this.indexPaths(ollama, [{ path: targetPath } as IndexedPath])
  }

  public async indexPaths(ollama: Ollama, paths: IndexedPath[], cancellable?: Gio.Cancellable, onProgress?: (fraction: number) => void): Promise<void> {
    if (paths.length === 0) {
      return
    }

    const allFiles: { file: Gio.File; path: string; rootPath: string }[] = []

    for (const p of paths) {
      if (cancellable?.is_cancelled()) {
        return
      }

      await this.updatePathStatus(p.path, 'indexing')
      const escapedPath = db.escape(p.path)
      await db.execSql(`DELETE FROM vector_chunks WHERE file_path LIKE '${escapedPath}/%';`)
      await db.execSql(`DELETE FROM vector_chunks WHERE file_path = '${escapedPath}';`)

      const isDir = GLib.file_test(p.path, GLib.FileTest.IS_DIR)
      if (isDir) {
        await this._collectFilesRecursive(Gio.File.new_for_path(p.path), allFiles, cancellable, p.path)
      } else if (GLib.file_test(p.path, GLib.FileTest.IS_REGULAR)) {
        allFiles.push({ file: Gio.File.new_for_path(p.path), path: p.path, rootPath: p.path })
      }
    }

    const total = allFiles.length
    if (total === 0) {
      for (const p of paths) {
        await this.updatePathStatus(p.path, 'indexed')
      }
      return
    }

    const totalPerPath = new Map<string, number>()
    const processedPerPath = new Map<string, number>()

    for (const entry of allFiles) {
      totalPerPath.set(entry.rootPath, (totalPerPath.get(entry.rootPath) ?? 0) + 1)
    }

    let processed = 0
    for (const entry of allFiles) {
      if (cancellable?.is_cancelled()) {
        break
      }

      await this._indexFile(ollama, entry.file, entry.path)
      processed++

      const pathProcessed = (processedPerPath.get(entry.rootPath) ?? 0) + 1
      processedPerPath.set(entry.rootPath, pathProcessed)
      this._progress.set(entry.rootPath, pathProcessed / (totalPerPath.get(entry.rootPath) || 1))

      if (onProgress) {
        onProgress(processed / total)
      }
    }

    for (const p of paths) {
      this._progress.delete(p.path)
      await this.updatePathStatus(p.path, 'indexed')
    }
  }

  private async _collectFilesRecursive(dir: Gio.File, results: { file: Gio.File; path: string; rootPath: string }[], cancellable?: Gio.Cancellable, rootPath?: string): Promise<void> {
    if (cancellable?.is_cancelled()) {
      return
    }

    try {
      const enumerator = await dir.enumerate_children_async(
        'standard::name,standard::type',
        Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT,
        null
      )

      while (true) {
        if (cancellable?.is_cancelled()) {
          break
        }

        const files = await enumerator.next_files_async(10, GLib.PRIORITY_DEFAULT, null)
        if (!files || files.length === 0) {
          break
        }

        for (const info of files) {
          const child = enumerator.get_child(info)
          const fileType = info.get_file_type()
          const path = child.get_path()

          if (!path) {
            continue
          }

          if (fileType === Gio.FileType.REGULAR) {
            results.push({ file: child, path, rootPath: rootPath ?? path })
          } else if (fileType === Gio.FileType.DIRECTORY) {
            await this._collectFilesRecursive(child, results, cancellable, rootPath)
          }
        }
      }
      await enumerator.close_async(GLib.PRIORITY_DEFAULT, null)
    } catch (e) {
      console.error(`Error enumerating directory for collection ${dir.get_path()}:`, e)
    }
  }

  private async _indexFile(ollama: Ollama, child: Gio.File, path: string): Promise<void> {
    try {
      const [contents] = await child.load_contents_async(null)
      const text = new TextDecoder().decode(contents)

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200
      })

      const chunks = splitter.splitText(text)
      for (const chunkText of chunks) {
        const resp = await ollama.embed({
          model: DEFAULT_EMBEDDING_MODEL,
          input: chunkText
        })
        if (resp && resp.embeddings && resp.embeddings.length > 0) {
          await this.saveChunk({
            file_path: path,
            content: chunkText,
            embedding: resp.embeddings[0]
          })
        }
      }
    } catch (e) {
      console.error(`Error indexing file ${path}:`, e)
    }
  }
}

export const filesStore = new FilesStore()
