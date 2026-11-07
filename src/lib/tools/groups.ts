import type { Settings } from '@/lib/db/types.js'

export interface ToolGroup {
  id: string
  title: string
  icon: string
  tools: string[]
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'memory',
    title: 'Memory',
    icon: 'user-bookmarks-symbolic',
    tools: ['create_entities', 'create_relations', 'add_observations', 'delete_entities', 'delete_observations', 'delete_relations', 'read_graph', 'search_nodes', 'open_nodes']
  },
  {
    id: 'files',
    title: 'Files',
    icon: 'folder-symbolic',
    tools: ['read_file', 'write_file', 'list_directory', 'search_files', 'search_vector_index']
  },
  {
    id: 'shell',
    title: 'Shell',
    icon: 'utilities-terminal-symbolic',
    tools: ['run_shell_command']
  },
  {
    id: 'web',
    title: 'Web',
    icon: 'web-browser-symbolic',
    tools: ['web_search', 'fetch_web_page', 'fetch_rss_feed']
  },
  {
    id: 'time',
    title: 'Time',
    icon: 'preferences-system-time-symbolic',
    tools: ['get_current_datetime', 'get_user_timezone']
  },
  {
    id: 'math',
    title: 'Math',
    icon: 'accessories-calculator-symbolic',
    tools: ['calculate', 'roll_die']
  },
  {
    id: 'system',
    title: 'System',
    icon: 'computer-symbolic',
    tools: ['get_system_info']
  },
  {
    id: 'apps',
    title: 'Applications',
    icon: 'view-app-grid-symbolic',
    tools: ['list_installed_apps', 'get_app_details', 'launch_app', 'launch_app_action']
  },
  {
    id: 'preview',
    title: 'Preview',
    icon: 'view-reveal-symbolic',
    tools: ['render_html']
  }
]

type ToolSettings = Pick<Settings, 'disabledTools'>

export function isToolEnabled(settings: ToolSettings, name: string): boolean {
  return !(settings.disabledTools ?? []).includes(name)
}

export function setToolEnabled(settings: ToolSettings, name: string, enabled: boolean): void {
  const disabled = new Set(settings.disabledTools ?? [])
  if (enabled) {
    disabled.delete(name)
  } else {
    disabled.add(name)
  }
  settings.disabledTools = [...disabled].sort()
}

export function setGroupEnabled(settings: ToolSettings, group: ToolGroup, enabled: boolean): void {
  for (const name of group.tools) {
    setToolEnabled(settings, name, enabled)
  }
}

export function isGroupEnabled(settings: ToolSettings, group: ToolGroup): boolean {
  return group.tools.some((name) => {
    return isToolEnabled(settings, name)
  })
}

export function areToolsEnabled(settings: ToolSettings, names: string[]): boolean {
  return names.every((name) => {
    return isToolEnabled(settings, name)
  })
}

export function isCommandAvailable(command: { visible?: boolean; requiredTools?: string[] }, settings: ToolSettings): boolean {
  return command.visible !== false && areToolsEnabled(settings, command.requiredTools ?? [])
}

export const SKILL_REQUIRED_TOOLS: Record<string, string[]> = {
  memory: ['read_graph', 'search_nodes', 'open_nodes'],
  files: ['search_vector_index'],
  canvas: ['render_html']
}

export function isSkillAvailable(skill: { id: string }, settings: ToolSettings): boolean {
  return areToolsEnabled(settings, SKILL_REQUIRED_TOOLS[skill.id] ?? [])
}

export function availableSkills<T extends { id: string }>(skills: T[], settings: ToolSettings): T[] {
  return skills.filter((skill) => {
    return isSkillAvailable(skill, settings)
  })
}

export function skillToolStatus(skill: { id: string }, settings: ToolSettings): { required: string[]; disabled: string[] } {
  const required = SKILL_REQUIRED_TOOLS[skill.id] ?? []
  return {
    required,
    disabled: required.filter((name) => {
      return !isToolEnabled(settings, name)
    })
  }
}

export function formatToolTitle(name: string): string {
  return name.split('_').filter(Boolean).map((word) => {
    return word.charAt(0).toUpperCase() + word.slice(1)
  }).join(' ')
}
