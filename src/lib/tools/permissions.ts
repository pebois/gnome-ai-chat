import type { AppInterface } from '@/lib/app.js'
import type { PermissionCategory } from '@/lib/db/types.js'
import { resolveToolTier } from '@/lib/tools/registry.js'

interface ToolPermission {
  category: PermissionCategory
  prompts: boolean
}

export const TOOL_PERMISSIONS: Record<string, ToolPermission> = {
  run_shell_command: { category: 'terminal', prompts: true },
  write_file: { category: 'files', prompts: true },
  read_file: { category: 'reads', prompts: true },
  list_directory: { category: 'reads', prompts: true },
  search_files: { category: 'reads', prompts: true },
  launch_app: { category: 'apps', prompts: true },
  launch_app_action: { category: 'apps', prompts: true },
  list_installed_apps: { category: 'apps', prompts: false },
  get_app_details: { category: 'apps', prompts: false }
}

export async function checkToolPermission(
  app: AppInterface,
  toolName: string,
  title = '',
  body = ''
): Promise<string | null> {
  const entry = app.tools.get(toolName)
  const tier = entry ? resolveToolTier(entry, app.settings) : null
  if (tier === 'deny') {
    return 'Error: denied by user settings.'
  }
  if (tier === 'ask' && entry?.prompts) {
    const allowed = await app.requestToolPermission(title, body)
    if (!allowed) {
      return 'Error: User denied permission.'
    }
  }
  return null
}
