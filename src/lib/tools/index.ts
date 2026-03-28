import { handle_run_automation_command, run_automation_command } from '@/lib/tools/automation.js'
import { get_app_details, handle_get_app_details, handle_launch_app, handle_launch_app_action, handle_list_installed_apps, launch_app, launch_app_action, list_installed_apps } from '@/lib/tools/desktop.js'
import { handle_search_files, search_files } from '@/lib/tools/files.js'
import { handle_render_html, render_html } from '@/lib/tools/html.js'
import { calculate, handle_calculate, handle_roll_die, roll_die } from '@/lib/tools/math.js'
import { get_system_info, handle_get_system_info, handle_take_screenshot, take_screenshot } from '@/lib/tools/system.js'
import { get_current_datetime, get_user_timezone, handle_get_current_datetime, handle_get_user_timezone } from '@/lib/tools/time.js'
import { fetch_web_page, handle_fetch_web_page } from '@/lib/tools/web.js'

export const tools = [
  calculate,
  fetch_web_page,
  get_app_details,
  get_current_datetime,
  get_system_info,
  get_user_timezone,
  launch_app,
  launch_app_action,
  list_installed_apps,
  render_html,
  roll_die,
  run_automation_command,
  search_files,
  take_screenshot
]

export async function onToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_user_timezone':
      return handle_get_user_timezone()
    case 'get_current_datetime':
      return handle_get_current_datetime(args)
    case 'roll_die':
      return handle_roll_die(args)
    case 'get_system_info':
      return handle_get_system_info()
    case 'list_installed_apps':
      return handle_list_installed_apps()
    case 'get_app_details':
      return handle_get_app_details(args)
    case 'launch_app':
      return handle_launch_app(args)
    case 'launch_app_action':
      return handle_launch_app_action(args)
    case 'search_files':
      return handle_search_files(args)
    case 'run_automation_command':
      return handle_run_automation_command(args)
    case 'fetch_web_page':
      return handle_fetch_web_page(args)
    case 'calculate':
      return handle_calculate(args)
    case 'take_screenshot':
      return handle_take_screenshot()
    case 'render_html':
      return handle_render_html(args)
    default:
      return ''
  }
}
