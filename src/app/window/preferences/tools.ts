import Adw from 'gi://Adw?version=1'

import { type AccessToggle, createAccessGroups } from '@/app/window/preferences/access.js'
import { setProfileItems } from '@/lib/agent/profiles.js'
import type { AppInterface } from '@/lib/app.js'
import type { AgentKind, AgentProfile } from '@/lib/db/types.js'

const PROFILE_LABELS: Record<AgentKind, { label: string; description: string }> = {
  main: {
    label: 'Main Agent',
    description: 'Tools and MCP servers offered to the model in the chat. Skills listed here appear in the skill picker and @-mentions.'
  },
  sub: {
    label: 'Sub-agents',
    description: 'Tools and MCP servers offered to a skill running as a sub-agent. Skills listed here can be delegated to by the model.'
  }
}

function profileToggle(app: AppInterface, kind: AgentKind, key: keyof AgentProfile): AccessToggle {
  return {
    isOn: (id) => {
      return !app.settings.agents[kind][key].includes(id)
    },
    set: (ids, on) => {
      const profile = app.settings.agents[kind]
      profile[key] = setProfileItems(profile[key], ids, on)
      app.saveSettings()
    }
  }
}

export function createToolsPage(app: AppInterface): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Tools',
    icon_name: 'applications-engineering-symbolic'
  })

  const toggleGroup = new Adw.ToggleGroup({ homogeneous: true })
  for (const kind of Object.keys(PROFILE_LABELS) as AgentKind[]) {
    toggleGroup.add(new Adw.Toggle({ name: kind, label: PROFILE_LABELS[kind].label }))
  }
  const header = new Adw.PreferencesGroup()
  header.add(toggleGroup)
  page.add(header)

  let groups: Adw.PreferencesGroup[] = []
  const show = (kind: AgentKind): void => {
    for (const group of groups) {
      page.remove(group)
    }
    header.description = PROFILE_LABELS[kind].description
    groups = createAccessGroups(app, {
      tools: profileToggle(app, kind, 'disabledTools'),
      servers: profileToggle(app, kind, 'disabledServers'),
      skills: profileToggle(app, kind, 'disabledSkills')
    })
    for (const group of groups) {
      page.add(group)
    }
  }
  toggleGroup.connect('notify::active-name', () => {
    show(toggleGroup.active_name === 'sub' ? 'sub' : 'main')
  })
  toggleGroup.active_name = 'main'
  show('main')

  return page
}
