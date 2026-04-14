import GLib from 'gi://GLib?version=2.0'

import type { Tool } from '@/lib/providers/index.js'

export const get_system_info: Tool = {
  type: 'function',
  function: {
    name: 'get_system_info',
    parameters: {},
    description: 'Returns information about the user\'s system, including OS, kernel version, hostname, and CPU architecture.'
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
