import Adw from 'gi://Adw?version=1'

import type { AppInterface } from '@/lib/app.js'
import { serverSubtitle } from '@/lib/mcp/config.js'
import { formatToolTitle, TOOL_GROUPS, type ToolGroup } from '@/lib/tools/groups.js'
import { tools } from '@/lib/tools/index.js'

interface ToolRowInfo {
  name: string
  title: string
  description: string
}

interface ToolGroupRowOptions {
  title: string
  icon: string
  tools: ToolRowInfo[]
  isEnabled: (name: string) => boolean
  setEnabled: (names: string[], enabled: boolean) => void
}

function toolDescription(name: string): string {
  return tools.find((tool) => {
    return tool.function.name === name
  })?.function.description ?? ''
}

function builtinToolRows(group: ToolGroup): ToolRowInfo[] {
  return group.tools.map((name) => {
    return { name, title: formatToolTitle(name), description: toolDescription(name) }
  })
}

function createToolGroupRow(options: ToolGroupRowOptions): Adw.ExpanderRow {
  const anyEnabled = (): boolean => {
    return options.tools.some((tool) => {
      return options.isEnabled(tool.name)
    })
  }
  const expander = new Adw.ExpanderRow({
    title: options.title,
    subtitle: `${options.tools.length} tool${options.tools.length === 1 ? '' : 's'}`,
    icon_name: options.icon,
    show_enable_switch: true,
    enable_expansion: anyEnabled(),
    expanded: false,
    use_markup: false
  })

  let syncing = false
  const switches = options.tools.map((tool) => {
    const row = new Adw.SwitchRow({
      title: tool.title,
      subtitle: tool.description,
      subtitle_lines: 2,
      active: options.isEnabled(tool.name),
      use_markup: false
    })
    row.connect('notify::active', () => {
      if (syncing) {
        return
      }
      options.setEnabled([tool.name], row.active)
      syncing = true
      expander.enable_expansion = anyEnabled()
      syncing = false
    })
    expander.add_row(row)
    return { name: tool.name, row }
  })

  expander.connect('notify::enable-expansion', () => {
    if (syncing) {
      return
    }
    options.setEnabled(options.tools.map((tool) => {
      return tool.name
    }), expander.enable_expansion)
    syncing = true
    for (const { name, row } of switches) {
      row.active = options.isEnabled(name)
    }
    syncing = false
  })

  return expander
}

export interface AccessToggle {
  isOn: (id: string) => boolean
  set: (ids: string[], on: boolean) => void
}

export interface AccessListOptions {
  tools: AccessToggle
  servers: AccessToggle
  skills?: AccessToggle
}

function createSwitchGroup(title: string, emptyTitle: string, items: { id: string; title: string; subtitle: string }[], toggle: AccessToggle): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({ title })
  for (const item of items) {
    const row = new Adw.SwitchRow({
      title: item.title,
      subtitle: item.subtitle,
      subtitle_lines: 1,
      active: toggle.isOn(item.id),
      use_markup: false
    })
    row.connect('notify::active', () => {
      toggle.set([item.id], row.active)
    })
    group.add(row)
  }
  if (items.length === 0) {
    group.add(new Adw.ActionRow({ title: emptyTitle, sensitive: false }))
  }
  return group
}

export function createAccessGroups(app: AppInterface, options: AccessListOptions): Adw.PreferencesGroup[] {
  const builtin = new Adw.PreferencesGroup({ title: 'Built-in Tools' })
  for (const toolGroup of TOOL_GROUPS) {
    builtin.add(createToolGroupRow({
      title: toolGroup.title,
      icon: toolGroup.icon,
      tools: builtinToolRows(toolGroup),
      isEnabled: options.tools.isOn,
      setEnabled: options.tools.set
    }))
  }

  const servers = createSwitchGroup('MCP Servers', 'No enabled MCP servers', app.mcp.servers.filter((server) => {
    return server.enabled
  }).map((server) => {
    return { id: server.id, title: server.name, subtitle: serverSubtitle(server) }
  }), options.servers)

  const groups = [builtin, servers]
  if (options.skills) {
    const skills = [...app.skills ?? []].filter((skill) => {
      return skill.enabled
    }).sort((a, b) => {
      return a.name.localeCompare(b.name)
    })
    groups.push(createSwitchGroup('Skills', 'No enabled skills', skills.map((skill) => {
      return { id: skill.id, title: skill.name, subtitle: skill.description ?? '' }
    }), options.skills))
  }
  return groups
}
