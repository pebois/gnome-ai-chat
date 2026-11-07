import Adw from 'gi://Adw?version=1'

import type { AppInterface } from '@/lib/app.js'
import { formatToolTitle, isGroupEnabled, isToolEnabled, setGroupEnabled, setToolEnabled, TOOL_GROUPS, type ToolGroup } from '@/lib/tools/groups.js'
import { tools } from '@/lib/tools/index.js'

function toolDescription(name: string): string {
  return tools.find((tool) => {
    return tool.function.name === name
  })?.function.description ?? ''
}

function createGroupRow(app: AppInterface, group: ToolGroup): Adw.ExpanderRow {
  const expander = new Adw.ExpanderRow({
    title: group.title,
    subtitle: `${group.tools.length} tool${group.tools.length === 1 ? '' : 's'}`,
    icon_name: group.icon,
    show_enable_switch: true,
    enable_expansion: isGroupEnabled(app.settings, group),
    expanded: false
  })

  let syncing = false
  const switches = group.tools.map((name) => {
    const row = new Adw.SwitchRow({
      title: formatToolTitle(name),
      subtitle: toolDescription(name),
      subtitle_lines: 2,
      active: isToolEnabled(app.settings, name)
    })
    row.connect('notify::active', () => {
      if (syncing) {
        return
      }
      setToolEnabled(app.settings, name, row.active)
      app.saveSettings()
      syncing = true
      expander.enable_expansion = isGroupEnabled(app.settings, group)
      syncing = false
    })
    expander.add_row(row)
    return { name, row }
  })

  expander.connect('notify::enable-expansion', () => {
    if (syncing) {
      return
    }
    setGroupEnabled(app.settings, group, expander.enable_expansion)
    app.saveSettings()
    syncing = true
    for (const { name, row } of switches) {
      row.active = isToolEnabled(app.settings, name)
    }
    syncing = false
  })

  return expander
}

export function createToolsPage(app: AppInterface): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Tools',
    icon_name: 'applications-engineering-symbolic'
  })

  const group = new Adw.PreferencesGroup({
    title: 'Built-in Tools',
    description: 'Turn off built-in tools you don\'t need or have replaced with an MCP server. Turned-off tools are hidden from the model.'
  })
  for (const toolGroup of TOOL_GROUPS) {
    group.add(createGroupRow(app, toolGroup))
  }
  page.add(group)

  return page
}
