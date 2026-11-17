import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import { type ManagedSection, ManageSection, type SectionHost } from '@/app/window/manage/section.js'
import type { RowBinding, SidebarGroup } from '@/app/window/manage/sidebar.js'
import { SkillPanel } from '@/app/window/skills/editor.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import type { Skill } from '@/lib/db/types.js'
import { generateId, uniqueName } from '@/lib/naming.js'
import { isBuiltinSkill, SKILL_NAME_RULES, skillDiffersFromDefault } from '@/lib/skills/index.js'
import { debounce } from '@/lib/timeout.js'
import { showDestructiveConfirmation } from '@/lib/ui.js'
import { cosineSimilarity } from '@/lib/utils.js'

const SEMANTIC_MATCH_THRESHOLD = 0.5
const SEARCH_DELAY_MS = 100

function bindSkillRow(): RowBinding<Skill> {
  const child = new Gtk.Label({ xalign: 0, ellipsize: Pango.EllipsizeMode.END })
  return {
    child,
    update: (skill, row) => {
      child.label = skill.name
      row.tooltip_text = skill.enabled ? skill.name : `${skill.name} (disabled)`
      if (skill.enabled) {
        child.remove_css_class('dim-label')
      } else {
        child.add_css_class('dim-label')
      }
    }
  }
}

function createSkill(names: string[]): Skill {
  return {
    id: generateId(),
    name: uniqueName('new-skill', names),
    description: '',
    prompt: '',
    enabled: true
  }
}

export function createSkillsSection(app: AppInterface, host: SectionHost): ManagedSection {
  const manager = app.skillsManager
  const holder: { section?: ManageSection<Skill>; resetAllButton?: Gtk.Button } = {}
  const similarities = new Map<string, number>()
  let searchText = ''

  const reportError = (err: unknown): void => {
    app.reportError('Could not save skills', err)
  }

  const resetCurrent = (): void => {
    const skill = holder.section?.selected
    if (!skill) {
      return
    }
    showDestructiveConfirmation(
      host.window,
      'Reset Skill',
      `Are you sure you want to reset "${skill.name}" to its default? This cannot be undone.`,
      () => {
        manager.reset(skill.id).catch(reportError)
        holder.section?.reloadSelected()
      }
    )
  }

  const resetAll = (): void => {
    showDestructiveConfirmation(
      host.window,
      'Reset All Built-ins',
      'Are you sure you want to reset all built-in skills to their defaults? This cannot be undone.',
      () => {
        manager.resetAll().catch(reportError)
        holder.section?.refresh()
        holder.section?.reloadSelected()
      }
    )
  }

  const createResetAllButton = (): Gtk.Button => {
    const button = new Gtk.Button({
      icon_name: 'edit-undo-symbolic',
      tooltip_text: 'Reset all built-in skills',
      valign: Gtk.Align.CENTER,
      sensitive: manager.hasModifiedBuiltins()
    })
    button.add_css_class('flat')
    button.add_css_class('circular')
    button.connect('clicked', resetAll)
    holder.resetAllButton = button
    return button
  }

  const groups = (items: Skill[]): SidebarGroup<Skill>[] => {
    const builtins = items.filter((s) => {
      return isBuiltinSkill(s.id)
    })
    const customs = items.filter((s) => {
      return !isBuiltinSkill(s.id)
    })
    const result: SidebarGroup<Skill>[] = []
    if (builtins.length > 0) {
      result.push({ title: 'Builtins', action: createResetAllButton(), items: builtins })
    }
    if (customs.length > 0) {
      result.push({ title: 'Custom', items: customs })
    }
    return result
  }

  const semanticSearch = debounce(() => {
    const text = searchText
    similarities.clear()
    if (!text) {
      return
    }
    app.provider.embed({ model: DEFAULT_EMBEDDING_MODEL, input: text }).then((response) => {
      const embedding = response?.embeddings?.[0]
      if (!embedding || text !== searchText) {
        return
      }
      for (const skill of manager.items) {
        similarities.set(skill.id, skill.embeddings ? cosineSimilarity(embedding, skill.embeddings) : 0)
      }
      holder.section?.refresh()
    }).catch((err: unknown) => {
      console.error('Failed to perform semantic search:', err)
    })
  }, SEARCH_DELAY_MS)

  const panel = new SkillPanel(app, {
    onChanged: () => {
      holder.section?.onPanelChanged()
    },
    onReset: resetCurrent
  })

  holder.section = new ManageSection<Skill>(app, host, {
    id: 'skills',
    labels: {
      title: 'Skills',
      windowTitle: 'Skills',
      addTooltip: 'New skill (Ctrl+N)',
      searchTooltip: 'Search skills (Ctrl+F)',
      deleteTooltip: 'Delete skill',
      deleteMenuLabel: 'Delete Skill',
      deleteHeading: 'Delete Skill',
      deleteBody: (name) => {
        return `Are you sure you want to delete "${name}"? This cannot be undone.`
      },
      saveError: 'Could not save skills'
    },
    source: manager,
    signal: 'skills-changed',
    nameRules: SKILL_NAME_RULES,
    panel,
    emptyPage: new Adw.StatusPage({
      icon_name: 'avatar-default-symbolic',
      title: 'No Skills',
      description: 'No skill matches the current search.'
    }),
    endWidgets: [panel.resetButton],
    createItem: createSkill,
    canDelete: (skill) => {
      return !isBuiltinSkill(skill.id)
    },
    matches: (skill, text) => {
      return skill.name.toLowerCase().includes(text) || (similarities.get(skill.id) ?? 0) >= SEMANTIC_MATCH_THRESHOLD
    },
    bindRow: bindSkillRow,
    groups,
    onSearchChanged: (text) => {
      searchText = text
      semanticSearch()
    },
    onItemShown: (skill) => {
      panel.updateActions(skill !== null && isBuiltinSkill(skill.id), skill !== null && skillDiffersFromDefault(skill))
      if (holder.resetAllButton) {
        holder.resetAllButton.sensitive = manager.hasModifiedBuiltins()
      }
    }
  })
  return holder.section
}
