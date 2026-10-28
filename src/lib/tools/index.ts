import type Gio from 'gi://Gio'

import type { AppInterface } from '@/lib/app.js'
import { isMcpToolName } from '@/lib/mcp/config.js'
import type { Tool } from '@/lib/providers/index.js'
import { handle_list_directory, handle_read_file, handle_run_shell_command, handle_write_file, list_directory, read_file, run_shell_command, write_file } from '@/lib/tools/code.js'
import { get_app_details, handle_get_app_details, handle_launch_app, handle_launch_app_action, handle_list_installed_apps, launch_app, launch_app_action, list_installed_apps } from '@/lib/tools/desktop.js'
import { handle_search_files, handle_search_vector_index, search_files, search_vector_index } from '@/lib/tools/files.js'
import { handle_render_html, render_html } from '@/lib/tools/html.js'
import { calculate, handle_calculate, handle_roll_die, roll_die } from '@/lib/tools/math.js'
import { add_observations, create_entities, create_relations, delete_entities, delete_observations, delete_relations, handle_add_observations, handle_create_entities, handle_create_relations, handle_delete_entities, handle_delete_observations, handle_delete_relations, handle_open_nodes, handle_read_graph, handle_search_nodes, open_nodes, read_graph, search_nodes } from '@/lib/tools/memory.js'
import { filterToolsByPermissions } from '@/lib/tools/permissions.js'
import { get_system_info, handle_get_system_info } from '@/lib/tools/system.js'
import { get_current_datetime, get_user_timezone, handle_get_current_datetime, handle_get_user_timezone } from '@/lib/tools/time.js'
import { fetch_rss_feed, fetch_web_page, handle_fetch_rss_feed, handle_fetch_web_page } from '@/lib/tools/web.js'

export { checkToolPermission, filterToolsByPermissions, TOOL_PERMISSIONS } from '@/lib/tools/permissions.js'

export const tools = [
  add_observations,
  calculate,
  create_entities,
  create_relations,
  delete_entities,
  delete_observations,
  delete_relations,
  fetch_rss_feed,
  fetch_web_page,
  get_app_details,
  get_current_datetime,
  get_system_info,
  get_user_timezone,
  launch_app,
  launch_app_action,
  list_directory,
  list_installed_apps,
  open_nodes,
  read_file,
  read_graph,
  render_html,
  roll_die,
  run_shell_command,
  search_files,
  search_nodes,
  search_vector_index,
  write_file
]

const PARALLEL_SAFE_TOOLS = new Set([
  'calculate',
  'fetch_rss_feed',
  'fetch_web_page',
  'get_app_details',
  'get_current_datetime',
  'get_system_info',
  'get_user_timezone',
  'list_installed_apps',
  'open_nodes',
  'read_graph',
  'roll_die',
  'search_nodes',
  'search_vector_index'
])

export function canRunInParallel(names: string[]): boolean {
  return names.every((name) => {
    return PARALLEL_SAFE_TOOLS.has(name)
  })
}

export function getAvailableTools(app: AppInterface): Tool[] {
  return [...filterToolsByPermissions(app, tools), ...app.mcp.getTools()]
}

export async function onToolCall(app: AppInterface, name: string, args: Record<string, unknown>, cancellable?: Gio.Cancellable): Promise<string> {
  if (isMcpToolName(name)) {
    return app.mcp.callTool(name, args, cancellable)
  }
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
      return handle_list_installed_apps(app)
    case 'get_app_details':
      return handle_get_app_details(app, args)
    case 'launch_app':
      return handle_launch_app(app, args)
    case 'launch_app_action':
      return handle_launch_app_action(app, args)
    case 'search_files':
      return handle_search_files(app, args)
    case 'search_vector_index':
      return handle_search_vector_index(app, args)
    case 'fetch_rss_feed':
      return handle_fetch_rss_feed(args)
    case 'fetch_web_page':
      return handle_fetch_web_page(args)
    case 'calculate':
      return handle_calculate(args)
    case 'render_html':
      return handle_render_html(app, args)
    case 'read_file':
      return handle_read_file(app, args)
    case 'write_file':
      return handle_write_file(app, args)
    case 'list_directory':
      return handle_list_directory(app, args)
    case 'run_shell_command':
      return handle_run_shell_command(app, args)
    case 'create_entities':
      return handle_create_entities(args)
    case 'create_relations':
      return handle_create_relations(args)
    case 'add_observations':
      return handle_add_observations(args)
    case 'delete_entities':
      return handle_delete_entities(args)
    case 'delete_observations':
      return handle_delete_observations(args)
    case 'delete_relations':
      return handle_delete_relations(args)
    case 'read_graph':
      return handle_read_graph()
    case 'search_nodes':
      return handle_search_nodes(args)
    case 'open_nodes':
      return handle_open_nodes(args)
    default:
      return `Error: Tool "${name}" not found.`
  }
}
