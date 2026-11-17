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
import { TOOL_PERMISSIONS } from '@/lib/tools/permissions.js'
import { advertisedEntries, isEntryAllowed, isEntryEnabled, type ToolAccess, type ToolEntry, type ToolHandler } from '@/lib/tools/registry.js'
import { handle_run_skill, run_skill } from '@/lib/tools/skills.js'
import { get_system_info, handle_get_system_info } from '@/lib/tools/system.js'
import { get_current_datetime, get_user_timezone, handle_get_current_datetime, handle_get_user_timezone } from '@/lib/tools/time.js'
import { fetch_rss_feed, fetch_web_page, handle_fetch_rss_feed, handle_fetch_web_page, handle_web_search, web_search } from '@/lib/tools/web.js'

export { checkToolPermission, TOOL_PERMISSIONS } from '@/lib/tools/permissions.js'
export { canRunInParallel } from '@/lib/tools/registry.js'

type ToolResult = string | Promise<string>

function fromArgs(handler: (args: Record<string, unknown>) => ToolResult): ToolHandler {
  return (_app, args) => {
    return handler(args)
  }
}

function withoutArgs(handler: () => ToolResult): ToolHandler {
  return () => {
    return handler()
  }
}

function builtin(tool: Tool, handler: ToolHandler, parallelSafe = false): ToolEntry {
  const permission = TOOL_PERMISSIONS[tool.function.name]
  return {
    name: tool.function.name,
    source: { kind: 'builtin' },
    tool,
    handler,
    category: permission?.category,
    prompts: permission?.prompts ?? false,
    parallelSafe
  }
}

export const BUILTIN_TOOLS: ToolEntry[] = [
  builtin(add_observations, fromArgs(handle_add_observations)),
  builtin(calculate, fromArgs(handle_calculate), true),
  builtin(create_entities, fromArgs(handle_create_entities)),
  builtin(create_relations, fromArgs(handle_create_relations)),
  builtin(delete_entities, fromArgs(handle_delete_entities)),
  builtin(delete_observations, fromArgs(handle_delete_observations)),
  builtin(delete_relations, fromArgs(handle_delete_relations)),
  builtin(fetch_rss_feed, fromArgs(handle_fetch_rss_feed), true),
  builtin(fetch_web_page, fromArgs(handle_fetch_web_page), true),
  builtin(get_app_details, handle_get_app_details, true),
  builtin(get_current_datetime, fromArgs(handle_get_current_datetime), true),
  builtin(get_system_info, withoutArgs(handle_get_system_info), true),
  builtin(get_user_timezone, withoutArgs(handle_get_user_timezone), true),
  builtin(launch_app, handle_launch_app),
  builtin(launch_app_action, handle_launch_app_action),
  builtin(list_directory, handle_list_directory),
  builtin(list_installed_apps, handle_list_installed_apps, true),
  builtin(open_nodes, fromArgs(handle_open_nodes), true),
  builtin(read_file, handle_read_file),
  builtin(read_graph, withoutArgs(handle_read_graph), true),
  builtin(render_html, handle_render_html),
  builtin(roll_die, fromArgs(handle_roll_die), true),
  builtin(run_shell_command, handle_run_shell_command),
  builtin(run_skill, withoutArgs(handle_run_skill)),
  builtin(search_files, handle_search_files),
  builtin(search_nodes, fromArgs(handle_search_nodes), true),
  builtin(search_vector_index, handle_search_vector_index, true),
  builtin(web_search, handle_web_search, true),
  builtin(write_file, handle_write_file)
]

export const tools: Tool[] = BUILTIN_TOOLS.map((entry) => {
  return entry.tool
})

export function mainAccess(app: AppInterface): ToolAccess {
  return { profile: app.settings.agents.main }
}

export function getAvailableTools(app: AppInterface, access: ToolAccess = mainAccess(app)): Tool[] {
  return advertisedEntries(app.tools.list(), app.settings, access).map((entry) => {
    return entry.tool
  })
}

export async function onToolCall(app: AppInterface, name: string, args: Record<string, unknown>, cancellable?: Gio.Cancellable, access: ToolAccess = mainAccess(app)): Promise<string> {
  const entry = app.tools.get(name)
  if (!entry) {
    return isMcpToolName(name) ? `Error: MCP tool "${name}" is not available.` : `Error: Tool "${name}" not found.`
  }
  if (!isEntryEnabled(entry)) {
    return `Error: Tool "${name}" is turned off in Settings.`
  }
  if (!isEntryAllowed(entry, access)) {
    return `Error: Tool "${name}" is not offered in this context.`
  }
  return entry.handler(app, args, cancellable)
}
