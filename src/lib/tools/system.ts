import GLib from 'gi://GLib?version=2.0'

import type { OllamaTool } from '@/lib/ollama.js'
import { takeScreenshot } from '@/lib/screenshot.js'

export const get_system_info: OllamaTool = {
  type: 'function',
  function: {
    name: 'get_system_info',
    parameters: {},
    description: 'Returns information about the user\'s system, including OS, kernel version, hostname, and CPU architecture.'
  }
}

export const take_screenshot: OllamaTool = {
  type: 'function',
  function: {
    name: 'take_screenshot',
    parameters: {},
    description: 'Takes a screenshot of the entire screen and returns the file URI where it was saved.'
  }
}

export function handle_get_system_info(): string {
  let osName = GLib.get_os_info('PRETTY_NAME')
  if (!osName) {
    osName = 'Unknown OS'
  }
  const hostname = GLib.get_host_name()
  return `OS: ${osName}\nHostname: ${hostname}`
}

export async function handle_take_screenshot(): Promise<string> {
  try {
    const file = await takeScreenshot()
    if (file) {
      return `Screenshot saved to ${file.get_uri()}`
    }
    return 'Screenshot failed or cancelled.'
  } catch (e) {
    return `Error taking screenshot: ${e instanceof Error ? e.message : String(e)}`
  }
}
