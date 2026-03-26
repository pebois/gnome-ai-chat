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
      fn(...args)
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
    void fn()
  }

  const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
    void fn()
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
