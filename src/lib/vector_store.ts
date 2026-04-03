import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { APPLICATION_ID, DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import { debug } from '@/lib/debug.js'
import type { Ollama } from '@/lib/ollama.js'
import type { StorageSettings } from '@/lib/storage.js'

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish')
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish')
Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish')
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish')

export interface IndexedPath {
  path: string
  status: 'indexed' | 'indexing' | 'pending'
  chunkCount: number
  fileCount: number
  progress?: number
}

export interface FileChunk {
  file_path: string
  content: string
  embedding: number[]
}

export interface SearchResult {
  file_path: string
  content: string
  score: number
}

export class VectorStore {
  private _settings: StorageSettings
  private _dbPath: string
  private _progress = new Map<string, number>()

  constructor(settings: StorageSettings) {
    this._settings = settings
    const configDir = GLib.build_filenamev([GLib.get_user_data_dir(), APPLICATION_ID])
    const dir = Gio.File.new_for_path(configDir)
    if (!dir.query_exists(null)) {
      dir.make_directory_with_parents(null)
    }
    this._dbPath = GLib.build_filenamev([configDir, 'vector.sqlite'])
    this._initDb()
  }

  private _debug(msg: string, ...args: unknown[]): void {
    if (this._settings.debug) {
      debug('VectorStore', msg, ...args)
    }
  }

  private _initDb(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS paths (path TEXT PRIMARY KEY, status TEXT);
      CREATE TABLE IF NOT EXISTS chunks (file_path TEXT, content TEXT, embedding TEXT);
      
      -- Helper to migrate if old table exists
      CREATE TABLE IF NOT EXISTS folders (path TEXT PRIMARY KEY, status TEXT);
      INSERT OR IGNORE INTO paths (path, status) SELECT path, status FROM folders;
      DROP TABLE IF EXISTS folders;
    `
    this._execSql(sql)
  }

  private _execSql(sql: string, flags: string[] = []): string {
    this._debug(`SQL: ${sql.slice(0, 100)}${sql.length > 100 ? '...' : ''}`)
    try {
      const proc = new Gio.Subprocess({
        argv: ['sqlite3', ...flags, this._dbPath],
        flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
      })
      proc.init(null)
      const [, stdout, stderr] = proc.communicate_utf8(sql, null)
      if (!proc.get_successful()) {
        console.error('SQLite error:', stderr)
      }
      return stdout || ''
    } catch (e) {
      console.error('Failed to execute SQLite:', e)
      return ''
    }
  }

  public getPaths(): IndexedPath[] {
    const sql = `
      SELECT 
        p.path, 
        p.status, 
        COUNT(c.file_path) as chunkCount,
        COUNT(DISTINCT c.file_path) as fileCount
      FROM paths p 
      LEFT JOIN chunks c ON c.file_path = p.path OR c.file_path LIKE p.path || '/%' 
      GROUP BY p.path;
    `
    const stdout = this._execSql(sql, ['-json'])
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

  public addPath(path: string): void {
    const escapedPath = path.replace(/'/g, '\'\'')
    this._execSql(`INSERT OR REPLACE INTO paths (path, status) VALUES ('${escapedPath}', 'pending');`)
  }

  public removePath(path: string): void {
    const escapedPath = path.replace(/'/g, '\'\'')
    this._execSql(`DELETE FROM paths WHERE path = '${escapedPath}';`)
    this._execSql(`DELETE FROM chunks WHERE file_path LIKE '${escapedPath}/%';`)
    this._execSql(`DELETE FROM chunks WHERE file_path = '${escapedPath}';`)
  }

  public updatePathStatus(path: string, status: string): void {
    const escapedPath = path.replace(/'/g, '\'\'')
    this._execSql(`UPDATE paths SET status = '${status}' WHERE path = '${escapedPath}';`)
  }

  public saveChunk(chunk: FileChunk): void {
    const escapedPath = chunk.file_path.replace(/'/g, '\'\'')
    const escapedContent = chunk.content.replace(/'/g, '\'\'')
    const embeddingStr = JSON.stringify(chunk.embedding)
    this._execSql(`INSERT INTO chunks (file_path, content, embedding) VALUES ('${escapedPath}', '${escapedContent}', '${embeddingStr}');`)
  }

  public getAllChunks(): FileChunk[] {
    const sql = `SELECT file_path, content, embedding FROM chunks;`
    const stdout = this._execSql(sql, ['-json'])
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

  public search(queryEmbedding: number[], limit: number = 3): SearchResult[] {
    this._debug('Searching vector index...')
    const chunks = this.getAllChunks()

    // JS Cosine Similarity calculation
    const results: SearchResult[] = chunks.map((chunk) => {
      let dotProduct = 0
      let normA = 0
      let normB = 0
      for (let i = 0; i < queryEmbedding.length; i++) {
        dotProduct += queryEmbedding[i] * chunk.embedding[i]
        normA += queryEmbedding[i] * queryEmbedding[i]
        normB += chunk.embedding[i] * chunk.embedding[i]
      }
      const score = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
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

  private async _indexDirectoryRecursive(ollama: Ollama, dir: Gio.File): Promise<void> {
    try {
      const enumerator = await dir.enumerate_children_async(
        'standard::*',
        Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT,
        null
      )

      while (true) {
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
            await this._indexFile(ollama, child, path)
          } else if (fileType === Gio.FileType.DIRECTORY) {
            await this._indexDirectoryRecursive(ollama, child)
          }
        }
      }
      await enumerator.close_async(GLib.PRIORITY_DEFAULT, null)
    } catch (e) {
      console.error(`Error enumerating directory ${dir.get_path()}:`, e)
    }
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

      this.updatePathStatus(p.path, 'indexing')
      const escapedPath = p.path.replace(/'/g, '\'\'')
      this._execSql(`DELETE FROM chunks WHERE file_path LIKE '${escapedPath}/%';`)
      this._execSql(`DELETE FROM chunks WHERE file_path = '${escapedPath}';`)

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
        this.updatePathStatus(p.path, 'indexed')
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
      this._progress.set(entry.rootPath, pathProcessed / totalPerPath.get(entry.rootPath)!)

      if (onProgress) {
        onProgress(processed / total)
      }
    }

    for (const p of paths) {
      this._progress.delete(p.path)
      this.updatePathStatus(p.path, 'indexed')
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
    this._debug(`Indexing file: ${path}`)
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
          this.saveChunk({
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

class RecursiveCharacterTextSplitter {
  private chunkSize: number
  private chunkOverlap: number
  private separators: string[]

  constructor(options: { chunkSize?: number; chunkOverlap?: number; separators?: string[] } = {}) {
    this.chunkSize = options.chunkSize ?? 1000
    this.chunkOverlap = options.chunkOverlap ?? 200
    this.separators = options.separators ?? ['\n\n', '\n', ' ', '']
  }

  public splitText(text: string): string[] {
    const finalChunks: string[] = []
    const pieces = this._recursiveSplit(text, this.separators)

    let currentChunk: string[] = []
    let currentLength = 0

    for (const piece of pieces) {
      if (currentLength + piece.length > this.chunkSize && currentChunk.length > 0) {
        finalChunks.push(currentChunk.join(''))

        let overlapWeight = 0
        const newChunk: string[] = []
        for (let i = currentChunk.length - 1; i >= 0; i--) {
          const p = currentChunk[i]
          if (overlapWeight + p.length <= this.chunkOverlap) {
            newChunk.unshift(p)
            overlapWeight += p.length
          } else {
            break
          }
        }
        currentChunk = newChunk
        currentLength = overlapWeight
      }
      currentChunk.push(piece)
      currentLength += piece.length
    }

    if (currentChunk.length > 0) {
      finalChunks.push(currentChunk.join(''))
    }

    return finalChunks
  }

  private _recursiveSplit(text: string, separators: string[]): string[] {
    const finalPieces: string[] = []
    let separator = separators[separators.length - 1]
    let remainingSeparators: string[] = []

    for (let i = 0; i < separators.length; i++) {
      const s = separators[i]
      if (s === '') {
        separator = s
        break
      }
      if (text.includes(s)) {
        separator = s
        remainingSeparators = separators.slice(i + 1)
        break
      }
    }

    const pieces = text.split(separator)
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]
      const isLast = i === pieces.length - 1
      const pieceWithSeparator = isLast ? piece : piece + separator

      if (pieceWithSeparator.length <= this.chunkSize) {
        finalPieces.push(pieceWithSeparator)
      } else if (remainingSeparators.length > 0) {
        finalPieces.push(...this._recursiveSplit(pieceWithSeparator, remainingSeparators))
      } else {
        finalPieces.push(pieceWithSeparator)
      }
    }

    return finalPieces
  }
}
