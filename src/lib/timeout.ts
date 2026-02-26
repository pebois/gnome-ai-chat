import GLib from 'gi://GLib?version=2.0'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any) => void>(fn: T, delayMs = 500): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      GLib.source_remove(timeoutId)
    }

    timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
      fn(...args)
      timeoutId = null
      return GLib.SOURCE_REMOVE
    })
  }
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
