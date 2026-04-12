import GLib from 'gi://GLib?version=2.0'

import type { Tool } from '@/lib/providers/index.js'

export const get_user_timezone: Tool = {
  type: 'function',
  function: {
    name: 'get_user_timezone',
    parameters: {},
    description: 'Returns the user\'s local timezone identifier (e.g., \'Europe/Paris\' or \'America/New_York\').'
  }
}

export const get_current_datetime: Tool = {
  type: 'function',
  function: {
    name: 'get_current_datetime',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'A valid IANA timezone identifier (e.g., "America/New_York", "Europe/Paris").'
        }
      },
      required: ['timezone']
    },
    description: 'Returns the current date and time for a specific timezone identifier.'
  }
}

export function handle_get_user_timezone(): string {
  return GLib.TimeZone.new_local().get_identifier()
}

export function handle_get_current_datetime(args: Record<string, unknown>): string {
  const timezone = typeof args.timezone === 'string' ? args.timezone : ''
  let tz = GLib.TimeZone.new(timezone)
  if (!tz) {
    tz = GLib.TimeZone.new_utc()
  }
  const dt = GLib.DateTime.new_now(tz)
  return dt ? dt.format('%Y-%m-%d %H:%M:%S %Z') ?? '' : 'Error: Could not determine time'
}
