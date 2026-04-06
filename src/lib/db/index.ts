import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { APPLICATION_ID } from '@/lib/constants.js'
import { debug } from '@/lib/debug.js'

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish')
Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish')

export class Database {
  private _dbPath: string
  private _configDir: string
  private _debugMode: boolean = false
  private _queue: Promise<void> = Promise.resolve()

  constructor() {
    this._configDir = GLib.build_filenamev([GLib.get_user_data_dir(), APPLICATION_ID])
    const dir = Gio.File.new_for_path(this._configDir)
    if (!dir.query_exists(null)) {
      dir.make_directory_with_parents(null)
    }
    this._dbPath = GLib.build_filenamev([this._configDir, 'database.sqlite'])
  }

  public setDebug(debugMode: boolean): void {
    this._debugMode = debugMode
  }

  private _debug(msg: string, ...args: unknown[]): void {
    if (this._debugMode) {
      debug('Database', msg, ...args)
    }
  }

  public execSql(sql: string, flags: string[] = []): Promise<string> {
    const task = async (): Promise<string> => {
      this._debug(`SQL: ${sql.slice(0, 100)}${sql.length > 100 ? '...' : ''}`)
      try {
        const proc = new Gio.Subprocess({
          argv: ['sqlite3', ...flags, this._dbPath],
          flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        })
        proc.init(null)
        const [stdout, stderr] = await proc.communicate_utf8_async(sql, null)
        if (!proc.get_successful()) {
          console.error('SQLite error:', stderr)
        }
        return stdout || ''
      } catch (e) {
        console.error('Failed to execute SQLite:', e)
        return ''
      }
    }

    const promise = this._queue.then(task)
    this._queue = promise.catch(() => {}).then(() => {})
    return promise
  }

  public async initDb(): Promise<void> {
    const sql = `
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT, description TEXT, prompt TEXT, embeddings TEXT);
      CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY, title TEXT, model TEXT, created_at TEXT, updated_at TEXT, embeddings TEXT);
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, role TEXT, content TEXT, images TEXT, files TEXT, thinking TEXT, tool_calls TEXT, tool_name TEXT, FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS memory_entities (name TEXT PRIMARY KEY, entityType TEXT);
      CREATE TABLE IF NOT EXISTS memory_relations (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, target TEXT, relationType TEXT);
      CREATE TABLE IF NOT EXISTS memory_observations (id INTEGER PRIMARY KEY AUTOINCREMENT, entityName TEXT, content TEXT, FOREIGN KEY(entityName) REFERENCES memory_entities(name) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS vector_paths (path TEXT PRIMARY KEY, status TEXT);
      CREATE TABLE IF NOT EXISTS vector_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT, content TEXT, embedding TEXT);
    `
    await this.execSql(sql)
    await this._cleanupOldFiles()
  }

  private async _cleanupOldFiles(): Promise<void> {
    const filesToDelete = [
      'settings.json',
      'conversations.json',
      'skills.json',
      'stats.json',
      'memory_graph.json',
      'vector.sqlite'
    ]

    for (const filename of filesToDelete) {
      const path = GLib.build_filenamev([this._configDir, filename])
      const file = Gio.File.new_for_path(path)
      if (file.query_exists(null)) {
        try {
          await file.delete_async(GLib.PRIORITY_DEFAULT, null)
          this._debug(`Deleted old file: ${filename}`)
        } catch (e) {
          console.error(`Failed to delete ${filename}:`, e)
        }
      }
    }

    // Also try to delete any messages_*.json
    const dir = Gio.File.new_for_path(this._configDir)
    try {
      const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null)
      while (true) {
        const info = enumerator.next_file(null)
        if (!info) {
          break
        }
        const name = info.get_name()
        if (name.startsWith('messages_') && name.endsWith('.json')) {
          const child = dir.get_child(name)
          try {
            await child.delete_async(GLib.PRIORITY_DEFAULT, null)
            this._debug(`Deleted old file: ${name}`)
          } catch (deleteError) {
            console.error(`Failed to delete ${name}:`, deleteError)
          }
        }
      }
      enumerator.close(null)
    } catch (enumerateError) {
      console.error('Failed to enumerate files for cleanup:', enumerateError)
    }
  }

  public escape(text: string): string {
    return text.replace(/'/g, '\'\'')
  }

  public async getKv<T>(key: string): Promise<T | null> {
    const stdout = await this.execSql(`SELECT value FROM kv_store WHERE key = '${this.escape(key)}';`, ['-json'])
    if (!stdout) {
      return null
    }
    try {
      const rows = JSON.parse(stdout) as { value: string }[]
      if (rows.length > 0 && rows[0].value) {
        return JSON.parse(rows[0].value) as T
      }
    } catch (parseError) {
      console.error(`Failed to parse KV value for ${key}:`, parseError)
    }
    return null
  }

  public async setKv<T>(key: string, value: T): Promise<void> {
    const jsonStr = JSON.stringify(value)
    await this.execSql(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('${this.escape(key)}', '${this.escape(jsonStr)}');`)
  }
}

export const db = new Database()
