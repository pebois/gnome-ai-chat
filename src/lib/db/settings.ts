import { DEFAULT_SETTINGS } from '@/lib/constants.js'
import { db } from '@/lib/db/index.js'
import type { PerformanceStats, Settings } from '@/lib/db/types.js'

export class SettingsStore {
  private _settings: Settings

  constructor() {
    this._settings = { ...DEFAULT_SETTINGS }
  }

  public get settings(): Settings {
    return this._settings
  }

  public async loadSettings(): Promise<void> {
    const data = await db.getKv<Partial<Settings>>('settings')
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
      },
      disabledTools: Array.isArray(data?.disabledTools) ? data.disabledTools : []
    })
    db.setDebug(this._settings.debug)
  }

  public async saveSettings(settings: Settings): Promise<void> {
    this._settings = settings
    db.setDebug(settings.debug)
    await db.setKv('settings', settings)
  }

  public async getStats(): Promise<PerformanceStats | undefined> {
    const data = await db.getKv<PerformanceStats>('stats')
    return data || undefined
  }

  public async saveStats(stats: PerformanceStats): Promise<void> {
    await db.setKv('stats', stats)
  }
}

export const settingsStore = new SettingsStore()
