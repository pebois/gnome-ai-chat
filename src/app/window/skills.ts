import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'
import Pango from 'gi://Pango'

import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_SKILLS, DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'
import type { Skill } from '@/lib/db/types.js'
import { debounce } from '@/lib/timeout.js'
import { createMenuItem, createSimpleAction, setupContextMenu, showDestructiveConfirmation } from '@/lib/ui.js'
import { cosineSimilarity } from '@/lib/utils.js'

export function showSkillsWindow(app: AppInterface): void {
  const win = new Adw.Window({
    title: 'Skills',
    default_width: 800,
    default_height: 600
  })

  let selectedId: string | null = null
  let isSaving = false
  let searchText = ''
  let searchEmbedding: number[] | null = null
  const searchSimilarities = new Map<string, number>()

  const performSearch = debounce(async () => {
    if (!searchText) {
      searchEmbedding = null
      searchSimilarities.clear()
      refreshList()
      return
    }
    try {
      const response = await app.ollama.embed({
        model: DEFAULT_EMBEDDING_MODEL,
        input: searchText
      })
      if (response && response.embeddings && response.embeddings.length > 0) {
        searchEmbedding = response.embeddings[0]
        searchSimilarities.clear()
        for (const skill of app.skills) {
          if (skill.embeddings) {
            const similarity = cosineSimilarity(searchEmbedding, skill.embeddings)
            searchSimilarities.set(skill.id, similarity)
          } else {
            searchSimilarities.set(skill.id, 0)
          }
        }
        refreshList()
      }
    } catch (err) {
      console.error('Failed to perform semantic search:', err)
      searchEmbedding = null
      searchSimilarities.clear()
      refreshList()
    }
  }, 100)

  const rowToSkillId = new Map<Gtk.ListBoxRow, string>()
  const defaultIds = new Set(DEFAULT_SKILLS.map((s) => {
    return s.id
  }))

  const sidebarToolbar = new Adw.ToolbarView()

  const sidebarHeader = new Adw.HeaderBar()
  sidebarHeader.add_css_class('flat')

  const addBtn = new Gtk.Button({
    icon_name: 'list-add-symbolic',
    tooltip_text: 'New skill (ctrl+n)',
    valign: Gtk.Align.CENTER
  })
  addBtn.add_css_class('flat')
  sidebarHeader.pack_start(addBtn)

  const searchBtn = new Gtk.ToggleButton({
    icon_name: 'system-search-symbolic',
    tooltip_text: 'Search skills (ctrl+f)',
    valign: Gtk.Align.CENTER
  })
  searchBtn.add_css_class('flat')
  sidebarHeader.pack_end(searchBtn)

  sidebarToolbar.add_top_bar(sidebarHeader)

  const searchEntry = new Gtk.SearchEntry({ hexpand: true })
  const searchBar = new Gtk.SearchBar({ child: searchEntry })
  searchBar.connect_entry(searchEntry)
  sidebarToolbar.add_top_bar(searchBar)

  const listBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.SINGLE })
  listBox.add_css_class('navigation-sidebar')

  const listScrolled = new Gtk.ScrolledWindow({
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER
  })
  listScrolled.set_child(listBox)
  sidebarToolbar.set_content(listScrolled)

  const contentToolbar = new Adw.ToolbarView()

  const contentHeader = new Adw.HeaderBar()

  const toggleSidebarBtn = new Gtk.ToggleButton({
    icon_name: 'sidebar-show-symbolic',
    tooltip_text: 'Toggle Sidebar (ctrl+b)',
    active: true
  })
  contentHeader.pack_start(toggleSidebarBtn)

  const deleteBtn = new Gtk.Button({
    icon_name: 'user-trash-symbolic',
    tooltip_text: 'Delete skill',
    valign: Gtk.Align.CENTER
  })
  deleteBtn.add_css_class('flat')
  deleteBtn.add_css_class('destructive-action')
  contentHeader.pack_end(deleteBtn)

  const contentResetBtn = new Gtk.Button({
    icon_name: 'edit-undo-symbolic',
    tooltip_text: 'Reset skill to default',
    valign: Gtk.Align.CENTER
  })
  contentResetBtn.add_css_class('flat')
  contentHeader.pack_end(contentResetBtn)

  contentToolbar.add_top_bar(contentHeader)

  const contentBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12
  })

  const metaGroup = new Adw.PreferencesGroup()
  const nameRow = new Adw.EntryRow({ title: 'Name' })
  const descRow = new Adw.EntryRow({ title: 'Description' })
  metaGroup.add(nameRow)
  metaGroup.add(descRow)
  contentBox.append(metaGroup)

  const lm = GtkSource.LanguageManager.get_default()
  const buffer = new GtkSource.Buffer()
  const lang = lm.get_language('markdown')
  if (lang) {
    buffer.set_language(lang)
  }

  const sm = GtkSource.StyleSchemeManager.get_default()
  const scheme = sm.get_scheme(app.settings.syntax || DEFAULT_SYNTAX_THEME)
  if (scheme) {
    buffer.set_style_scheme(scheme)
  }

  const sourceView = new GtkSource.View({
    buffer,
    wrap_mode: Gtk.WrapMode.WORD_CHAR,
    left_margin: 12,
    right_margin: 12,
    top_margin: 12,
    bottom_margin: 12,
    monospace: true,
    vexpand: true
  })

  const editorScrolled = new Gtk.ScrolledWindow({
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER
  })
  editorScrolled.add_css_class('view')
  editorScrolled.add_css_class('frame')
  editorScrolled.set_child(sourceView)
  contentBox.append(editorScrolled)

  contentToolbar.set_content(contentBox)

  const splitView = new Adw.OverlaySplitView({
    min_sidebar_width: 200,
    sidebar_width_fraction: 0.25
  })
  splitView.set_sidebar(sidebarToolbar)
  splitView.set_content(contentToolbar)
  win.set_content(splitView)

  toggleSidebarBtn.connect('toggled', () => {
    splitView.show_sidebar = toggleSidebarBtn.active
  })
  splitView.connect('notify::show-sidebar', () => {
    toggleSidebarBtn.active = splitView.show_sidebar
  })

  function createNewSkill(): void {
    const placeholder: Skill = {
      id: `skill-${Date.now()}`,
      name: 'New Skill',
      description: '',
      prompt: ''
    }
    app.skills.push(placeholder)
    app.skills.sort((a, b) => {
      return a.name.localeCompare(b.name)
    })
    app.saveSkills()
    selectedId = placeholder.id
    refreshList()
    nameRow.grab_focus()
  }

  function deleteSkill(id: string): void {
    const idx = app.skills.findIndex((s) => {
      return s.id === id
    })
    if (idx === -1) {
      return
    }
    const skillName = app.skills[idx].name
    showDestructiveConfirmation(
      win,
      'Delete Skill',
      `Are you sure you want to delete "${skillName}"? This cannot be undone.`,
      () => {
        const i = app.skills.findIndex((s) => {
          return s.id === id
        })
        if (i === -1) {
          return
        }
        app.skills.splice(i, 1)
        app.saveSkills()
        if (selectedId === id) {
          selectedId = app.skills.length > 0 ? app.skills[Math.max(0, i - 1)].id : null
        }
        refreshList()
      }
    )
  }

  const winKeyCtrl = new Gtk.EventControllerKey()
  winKeyCtrl.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
    const isCtrl = !!(state & Gdk.ModifierType.CONTROL_MASK)
    if (isCtrl && keyval === Gdk.KEY_b) {
      toggleSidebarBtn.active = !toggleSidebarBtn.active
      return true
    }
    if (isCtrl && keyval === Gdk.KEY_f) {
      searchBtn.active = !searchBtn.active
      return true
    }
    if (isCtrl && keyval === Gdk.KEY_n) {
      createNewSkill()
      return true
    }
    return false
  })
  win.add_controller(winKeyCtrl)

  function skillDiffersFromDefault(skill: Skill): boolean {
    const def = DEFAULT_SKILLS.find((s) => {
      return s.id === skill.id
    })
    if (!def) {
      return false
    }
    return skill.name !== def.name
      || (skill.description ?? '') !== (def.description ?? '')
      || skill.prompt !== def.prompt
  }

  function loadSkillIntoEditor(skill: Skill | null): void {
    nameRow.set_text(skill?.name ?? '')
    descRow.set_text(skill?.description ?? '')
    buffer.set_text(skill?.prompt ?? '', -1)

    const active = skill !== null
    nameRow.sensitive = active
    descRow.sensitive = active
    sourceView.sensitive = active

    const isCustom = active && !defaultIds.has(skill.id)
    deleteBtn.visible = isCustom
    deleteBtn.sensitive = isCustom

    const isBuiltin = active && defaultIds.has(skill.id)
    contentResetBtn.visible = isBuiltin
    contentResetBtn.sensitive = isBuiltin && skillDiffersFromDefault(skill)
  }

  function addHeaderRow(label: string): void {
    const headerLabel = new Gtk.Label({ label, xalign: 0 })
    headerLabel.add_css_class('dim-label')
    headerLabel.add_css_class('caption-heading')
    listBox.append(new Gtk.ListBoxRow({
      child: headerLabel,
      activatable: false,
      selectable: false
    }))
  }

  function addSkillRow(skill: Skill): void {
    const label = new Gtk.Label({
      label: skill.name,
      xalign: 0,
      ellipsize: Pango.EllipsizeMode.END
    })
    const row = new Gtk.ListBoxRow({
      child: label,
      tooltip_text: skill.name
    })
    rowToSkillId.set(row, skill.id)

    if (!defaultIds.has(skill.id)) {
      const actionGroup = new Gio.SimpleActionGroup()
      const deleteAction = createSimpleAction('delete', () => {
        return deleteSkill(skill.id)
      })
      actionGroup.add_action(deleteAction)
      row.insert_action_group('skill', actionGroup)

      const menu = new Gio.Menu()
      menu.append_item(createMenuItem('Delete Skill', 'skill.delete', 'user-trash-symbolic'))

      const popover = Gtk.PopoverMenu.new_from_model(menu)
      popover.set_parent(row)
      popover.set_has_arrow(false)
      popover.set_position(Gtk.PositionType.BOTTOM)

      setupContextMenu(row, popover)
    }

    listBox.append(row)
  }

  function refreshList(): void {
    isSaving = true
    rowToSkillId.clear()

    let child = listBox.get_first_child()
    while (child) {
      listBox.remove(child)
      child = listBox.get_first_child()
    }

    const skills = app.skills ?? []
    let builtins = skills.filter((s) => {
      return defaultIds.has(s.id)
    })
    let customs = skills.filter((s) => {
      return !defaultIds.has(s.id)
    })

    if (searchText) {
      builtins = builtins.filter((s) => {
        const textMatch = s.name.toLowerCase().includes(searchText)
        const similarity = searchSimilarities.get(s.id) || 0
        const semanticMatch = similarity >= 0.5
        return textMatch || semanticMatch
      })
      customs = customs.filter((s) => {
        const textMatch = s.name.toLowerCase().includes(searchText)
        const similarity = searchSimilarities.get(s.id) || 0
        const semanticMatch = similarity >= 0.5
        return textMatch || semanticMatch
      })
    }

    if (skills.length === 0) {
      selectedId = null
      loadSkillIntoEditor(null)
      isSaving = false
      return
    }

    if (builtins.length > 0) {
      addHeaderRow('Builtins')
      builtins.forEach(addSkillRow)
    }
    if (customs.length > 0) {
      addHeaderRow('Custom')
      customs.forEach(addSkillRow)
    }

    const skill = selectedId !== null
      ? (app.skills.find((s) => {
          return s.id === selectedId
        }) ?? null)
      : null
    if (skill) {
      for (const [row, id] of rowToSkillId) {
        if (id === selectedId) {
          listBox.select_row(row)
          loadSkillIntoEditor(skill)
          break
        }
      }
    } else {
      selectedId = null
      loadSkillIntoEditor(null)
    }

    isSaving = false
  }

  function saveCurrentSkill(): void {
    if (isSaving || selectedId === null) {
      return
    }
    const skill = app.skills.find((s) => {
      return s.id === selectedId
    })
    if (!skill) {
      return
    }

    const newName = nameRow.get_text().trim()
    if (!newName) {
      return
    }

    skill.name = newName
    skill.description = descRow.get_text().trim()
    skill.prompt = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false)

    for (const [row, id] of rowToSkillId) {
      if (id === selectedId) {
        (row.get_child() as Gtk.Label).label = newName
        row.tooltip_text = newName
        break
      }
    }

    const isBuiltin = defaultIds.has(skill.id)
    contentResetBtn.visible = isBuiltin
    contentResetBtn.sensitive = isBuiltin && skillDiffersFromDefault(skill)

    app.saveSkills()
  }

  searchBtn.connect('toggled', () => {
    searchBar.search_mode_enabled = searchBtn.active
  })
  searchBar.connect('notify::search-mode-enabled', () => {
    searchBtn.active = searchBar.search_mode_enabled
    if (!searchBar.search_mode_enabled) {
      searchEntry.set_text('')
      searchText = ''
      searchEmbedding = null
      searchSimilarities.clear()
      refreshList()
    }
  })
  searchEntry.connect('search-changed', () => {
    searchText = searchEntry.get_text().toLowerCase().trim()
    refreshList()
    performSearch()
  })

  listBox.connect('row-selected', (_lb, row) => {
    if (isSaving) {
      return
    }
    if (!row) {
      isSaving = true
      selectedId = null
      loadSkillIntoEditor(null)
      isSaving = false
      return
    }
    const skillId = rowToSkillId.get(row)
    if (!skillId) {
      return
    }
    isSaving = true
    selectedId = skillId
    loadSkillIntoEditor(app.skills.find((s) => {
      return s.id === skillId
    }) ?? null)
    isSaving = false
  })

  nameRow.connect('notify::text', saveCurrentSkill)
  descRow.connect('notify::text', saveCurrentSkill)
  buffer.connect('changed', saveCurrentSkill)

  addBtn.connect('clicked', createNewSkill)

  deleteBtn.connect('clicked', () => {
    if (selectedId !== null) {
      deleteSkill(selectedId)
    }
  })

  contentResetBtn.connect('clicked', () => {
    if (selectedId === null) {
      return
    }
    const idx = app.skills.findIndex((s) => {
      return s.id === selectedId
    })
    if (idx === -1) {
      return
    }
    const skill = app.skills[idx]
    const defaultSkill = DEFAULT_SKILLS.find((s) => {
      return s.id === skill.id
    })
    if (!defaultSkill) {
      return
    }
    showDestructiveConfirmation(
      win,
      'Reset Skill',
      `Are you sure you want to reset "${skill.name}" to its default? This cannot be undone.`,
      () => {
        const i = app.skills.findIndex((s) => {
          return s.id === selectedId
        })
        if (i === -1) {
          return
        }
        app.skills[i] = { ...defaultSkill }
        app.skills[i].embeddings = undefined
        app.saveSkills()
        refreshList()
      }
    )
  })

  const syntaxSignalId = app.connect('syntax-changed', (_: number, theme: string) => {
    const newScheme = sm.get_scheme(theme)
    if (newScheme) {
      buffer.set_style_scheme(newScheme)
    }
  })
  win.connect('destroy', () => {
    return app.disconnect(syntaxSignalId)
  })

  if ((app.skills ?? []).length > 0) {
    selectedId = app.skills[0].id
  }
  refreshList()

  win.present()
}
