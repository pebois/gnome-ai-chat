import GLib from 'gi://GLib?version=2.0'

export interface DebouncedFunction<T extends (...args: unknown[]) => void> {
  (...args: Parameters<T>): void
  cancel(): void
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, delayMs = 500): DebouncedFunction<T> {
  let timeoutId: number | null = null

  const debounced = (...args: Parameters<T>): void => {
    if (timeoutId !== null) {
      GLib.source_remove(timeoutId)
    }

    timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
      const result = fn(...args)
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error('Debounced function failed:', err)
        })
      }
      timeoutId = null
      return GLib.SOURCE_REMOVE
    })
  }

  debounced.cancel = () => {
    if (timeoutId !== null) {
      GLib.source_remove(timeoutId)
      timeoutId = null
    }
  }

  return debounced
}

export function poll(fn: () => void | Promise<void>, intervalMs: number, immediate = false): () => void {
  if (immediate) {
    const result = fn()
    if (result instanceof Promise) {
      result.catch((err) => {
        console.error('Initial poll call failed:', err)
      })
    }
  }

  const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
    const result = fn()
    if (result instanceof Promise) {
      result.catch((err) => {
        console.error('Polled function failed:', err)
      })
    }
    return GLib.SOURCE_CONTINUE
  })

  return () => {
    GLib.source_remove(timeoutId)
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve()
      return GLib.SOURCE_REMOVE
    })
  })
}
