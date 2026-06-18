import GLib from 'gi://GLib?version=2.0'

import { DEFAULT_STATS } from '@/lib/constants.js'
import { settingsStore } from '@/lib/db/settings.js'
import type { PerformanceStats } from '@/lib/db/types.js'

export class Tracker {
  private _stats: PerformanceStats
  private _startTime: number

  constructor() {
    this._stats = DEFAULT_STATS
    this._startTime = GLib.get_monotonic_time()
  }

  public async load(): Promise<void> {
    try {
      const data = await settingsStore.getStats()
      if (data) {
        this._stats = {
          wallTimeMs: data.wallTimeMs || 0,
          apiTimeMs: data.apiTimeMs || 0,
          toolTimeMs: data.toolTimeMs || 0,
          modelUsage: data.modelUsage || []
        }
      }
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }

  public getStats(): PerformanceStats {
    const currentUptimeMs = (GLib.get_monotonic_time() - this._startTime) / 1000
    return {
      ...this._stats,
      wallTimeMs: this._stats.wallTimeMs + currentUptimeMs
    }
  }

  public clearStats(): void {
    this._stats = {
      wallTimeMs: 0,
      apiTimeMs: 0,
      toolTimeMs: 0,
      modelUsage: []
    }
    this._startTime = GLib.get_monotonic_time()
    this.save()
  }

  public recordApiCall(model: string, inputTokens: number, outputTokens: number, durationMs: number): void {
    this._stats.apiTimeMs += durationMs
    let record = this._stats.modelUsage.find((m) => {
      return m.model === model
    })
    if (!record) {
      record = { model, requests: 0, inputTokens: 0, outputTokens: 0 }
      this._stats.modelUsage.push(record)
    }
    record.requests += 1
    record.inputTokens += inputTokens
    record.outputTokens += outputTokens
    this.save()
  }

  public recordToolCall(durationMs: number): void {
    this._stats.toolTimeMs += durationMs
    this.save()
  }

  public save(): void {
    const currentUptimeMs = (GLib.get_monotonic_time() - this._startTime) / 1000
    const statsToSave = {
      ...this._stats,
      wallTimeMs: this._stats.wallTimeMs + currentUptimeMs
    }

    this._stats.wallTimeMs = statsToSave.wallTimeMs
    this._startTime = GLib.get_monotonic_time()

    void settingsStore.saveStats(this._stats)
  }
}
