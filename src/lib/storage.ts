import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { APPLICATION_ID, DEFAULT_EMBEDDING_MODEL, DEFAULT_SETTINGS, DEFAULT_SKILLS } from '@/lib/constants.js'
import { debug } from '@/lib/debug.js'
import type { Ollama, OllamaMessage } from '@/lib/ollama.js'
import { debounce, type DebouncedFunction } from '@/lib/timeout.js'

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish')
Gio._promisify(Gio.File.prototype, 'replace_contents_async', 'replace_contents_finish')
Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish')

interface StorageState {
  saving: boolean
  pending: boolean
  data?: string
  debouncedSave?: DebouncedFunction<() => void>
}

export const think_types = ['none', 'low', 'medium', 'high'] as const

export type StorageThink = typeof think_types[number]

export const permission_tiers = ['ask', 'auto-accept'] as const

export type StoragePermissionTier = typeof permission_tiers[number]

export interface StorageSkill {
  id: string
  name: string
  description?: string
  prompt: string
}

export interface StorageSettings {
  url: string
  system: string
  stream: boolean
  think: StorageThink
  theme: number
  syntax: string
  debug: boolean
  options: Record<string, number>
  permissions: {
    terminal: StoragePermissionTier
    files: StoragePermissionTier
  }
}

export interface StorageConversation {
  id: number
  title: string
  model: string
  created_at: string
  updated_at?: string
  embeddings?: number[]
}

export interface StoragePerformanceStats {
  wallTimeMs: number
  apiTimeMs: number
  toolTimeMs: number
  modelUsage: Array<{
    model: string
    requests: number
    inputTokens: number
    outputTokens: number
  }>
}

export class Storage {
  private _configDir: string
  private _conversationsFile: Gio.File
  private _settingsFile: Gio.File
  private _skillsFile: Gio.File
  private _statsFile: Gio.File
  private _settings: StorageSettings
  private _conversationsState: StorageState = { saving: false, pending: false }
  private _settingsState: StorageState = { saving: false, pending: false }
  private _skillsState: StorageState = { saving: false, pending: false }
  private _statsState: StorageState = { saving: false, pending: false }
  private _messagesStates: Map<number, StorageState> = new Map()

  constructor(settings: StorageSettings) {
    this._settings = settings
    this._configDir = GLib.build_filenamev([GLib.get_user_data_dir(), APPLICATION_ID])
    this._conversationsFile = Gio.File.new_for_path(GLib.build_filenamev([this._configDir, 'conversations.json']))
    this._settingsFile = Gio.File.new_for_path(GLib.build_filenamev([this._configDir, 'settings.json']))
    this._skillsFile = Gio.File.new_for_path(GLib.build_filenamev([this._configDir, 'skills.json']))
    this._statsFile = Gio.File.new_for_path(GLib.build_filenamev([this._configDir, 'stats.json']))
  }

  private _debug(msg: string, ...args: unknown[]): void {
    if (this._settings.debug) {
      debug('Storage', msg, ...args)
    }
  }

  private async _read<T>(file: Gio.File): Promise<T | undefined> {
    try {
      if (!file.query_exists(null)) {
        return undefined
      }
      this._debug(`Reading ${file.get_basename()}...`)
      const [contents] = await file.load_contents_async(null)
      if (contents) {
        const decoder = new TextDecoder()
        return JSON.parse(decoder.decode(contents)) as T
      }
    } catch (err: unknown) {
      console.error(`Failed to load ${file.get_basename()}:`, err)
    }
    return undefined
  }

  private _save(file: Gio.File, state: StorageState): void {
    if (!state.debouncedSave) {
      state.debouncedSave = debounce(() => {
        void this._executeSave(file, state)
      }, 500)
    }
    state.debouncedSave?.()
  }

  private async _executeSave(file: Gio.File, state: StorageState): Promise<void> {
    if (state.saving) {
      state.pending = true
      return
    }

    this._debug(`Saving ${file.get_basename()}...`)
    state.saving = true
    try {
      const dir = Gio.File.new_for_path(this._configDir)
      if (!dir.query_exists(null)) {
        dir.make_directory_with_parents(null)
      }
      const encoder = new TextEncoder()
      const data = state.data || ''
      await file.replace_contents_async(encoder.encode(data), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null)
    } catch (err: unknown) {
      console.error(`Failed to save ${file.get_basename()}:`, err)
    } finally {
      state.saving = false
      if (state.pending) {
        state.pending = false
        void this._executeSave(file, state)
      }
    }
  }

  public async getConversations(): Promise<StorageConversation[]> {
    const conversations = await this._read<StorageConversation[]>(this._conversationsFile)
    return conversations || []
  }

  public saveConversations(conversations: StorageConversation[]): void {
    this._conversationsState.data = JSON.stringify(conversations)
    this._save(this._conversationsFile, this._conversationsState)
  }

  public async getMessages(conversation_id: number): Promise<OllamaMessage[]> {
    const file = Gio.File.new_for_path(GLib.build_filenamev([this._configDir, `messages_${conversation_id}.json`]))
    const messages = await this._read<OllamaMessage[]>(file)
    return messages || []
  }

  public saveMessages(conversation_id: number, messages: OllamaMessage[]): void {
    const file = Gio.File.new_for_path(GLib.build_filenamev([this._configDir, `messages_${conversation_id}.json`]))
    let state = this._messagesStates.get(conversation_id)
    if (!state) {
      state = { saving: false, pending: false }
      this._messagesStates.set(conversation_id, state)
    }
    state.data = JSON.stringify(messages)
    this._save(file, state)
  }

  public async deleteMessages(conversation_id: number): Promise<void> {
    const file = Gio.File.new_for_path(GLib.build_filenamev([this._configDir, `messages_${conversation_id}.json`]))
    try {
      if (file.query_exists(null)) {
        await file.delete_async(GLib.PRIORITY_DEFAULT, null)
      }
    } catch (err: unknown) {
      console.error(`Failed to delete messages for ${conversation_id}:`, err)
    }
    this._messagesStates.delete(conversation_id)
  }

  public async loadSettings(): Promise<void> {
    const data = await this._read<Partial<StorageSettings>>(this._settingsFile)

    Object.assign(this._settings, {
      ...DEFAULT_SETTINGS,
      ...data,
      options: {
        ...DEFAULT_SETTINGS.options,
        ...(data?.options || {})
      },
      permissions: {
        ...DEFAULT_SETTINGS.permissions,
        ...(data?.permissions || {})
      }
    })
  }

  public async getSkills(): Promise<StorageSkill[]> {
    const data = await this._read<StorageSkill[]>(this._skillsFile)
    if (data && data.length > 0) {
      return data.sort((a, b) => {
        return a.name.localeCompare(b.name)
      })
    }
    return JSON.parse(JSON.stringify(DEFAULT_SKILLS)) as StorageSkill[]
  }

  public saveSkills(skills: StorageSkill[]): void {
    this._skillsState.data = JSON.stringify(skills)
    this._save(this._skillsFile, this._skillsState)
  }

  public saveSettings(settings: StorageSettings): void {
    this._settingsState.data = JSON.stringify(settings)
    this._save(this._settingsFile, this._settingsState)
  }

  public async getStats(): Promise<StoragePerformanceStats | undefined> {
    return this._read<StoragePerformanceStats>(this._statsFile)
  }

  public saveStats(stats: StoragePerformanceStats): void {
    this._statsState.data = JSON.stringify(stats)
    this._save(this._statsFile, this._statsState)
  }

  public async flush(): Promise<void> {
    const saves: Promise<void>[] = []

    const processState = (file: Gio.File, state: StorageState): void => {
      state.debouncedSave?.cancel()
      if (state.data !== undefined) {
        saves.push(this._executeSave(file, state))
      }
    }

    processState(this._conversationsFile, this._conversationsState)
    processState(this._settingsFile, this._settingsState)
    processState(this._skillsFile, this._skillsState)
    processState(this._statsFile, this._statsState)

    for (const [id, state] of this._messagesStates) {
      const file = Gio.File.new_for_path(GLib.build_filenamev([this._configDir, `messages_${id}.json`]))
      processState(file, state)
    }

    await Promise.all(saves)
  }

  public async index(ollama: Ollama, conversations: StorageConversation[], force: boolean = false, cancellable?: Gio.Cancellable, onProgress?: (fraction: number) => void): Promise<void> {
    const total = conversations.length
    if (total === 0) {
      return
    }

    let processed = 0
    for (const conv of conversations) {
      if (cancellable?.is_cancelled()) {
        break
      }

      if (!force && conv.embeddings) {
        processed++
        if (onProgress) {
          onProgress(processed / total)
        }
        continue
      }

      const messages = await this.getMessages(conv.id)
      if (messages.length > 0) {
        const textContent = messages.map((m) => {
          return m.content
        }).join('\n')
        try {
          const response = await ollama.embed({
            model: DEFAULT_EMBEDDING_MODEL,
            input: textContent.slice(0, 8000)
          })
          if (response && response.embeddings && response.embeddings.length > 0) {
            conv.embeddings = response.embeddings[0]
          }
        } catch (err) {
          console.error(`Failed to index conversation ${conv.id}:`, err)
        }
      }
      processed++
      if (onProgress) {
        onProgress(processed / total)
      }
    }
    this.saveConversations(conversations)
  }
}
