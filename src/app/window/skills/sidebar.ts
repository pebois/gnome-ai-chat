import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_SKILLS } from '@/lib/constants.js'
import type { Skill } from '@/lib/db/types.js'
import { debounce } from '@/lib/timeout.js'
import { createMenuItem, createSimpleAction, setupContextMenu } from '@/lib/ui.js'
import { cosineSimilarity } from '@/lib/utils.js'

export interface SidebarCallbacks {
  onSkillSelected: (skillId: string | null) => void
  onNewSkill: () => void
  onDeleteSkill: (skillId: string) => void
  onResetBuiltins?: () => void
  hasModifiedBuiltins?: () => boolean
}

export class SkillsSidebar {
  private _app: AppInterface
  private _callbacks: SidebarCallbacks
  private _widget: Adw.ToolbarView
  private _searchBtn: Gtk.ToggleButton
  private _searchEntry: Gtk.SearchEntry
  private _searchBar: Gtk.SearchBar
  private _listBox: Gtk.ListBox
  private _searchText = ''
  private _searchEmbedding: number[] | null = null
  private _searchSimilarities = new Map<string, number>()
  private _rowToSkillId = new Map<Gtk.ListBoxRow, string>()
  private _defaultIds = new Set(DEFAULT_SKILLS.map((s) => {
    return s.id
  }))

  private _isSaving = false
  private _resetBtn: Gtk.Button | null = null

  public get widget(): Adw.ToolbarView {
    return this._widget
  }

  public get searchButton(): Gtk.ToggleButton {
    return this._searchBtn
  }

  constructor(app: AppInterface, callbacks: SidebarCallbacks) {
    this._app = app
    this._callbacks = callbacks

    this._widget = new Adw.ToolbarView()
    const header = new Adw.HeaderBar()
    header.add_css_class('flat')

    const addBtn = new Gtk.Button({
      icon_name: 'list-add-symbolic',
      tooltip_text: 'New skill (Ctrl+N)',
      valign: Gtk.Align.CENTER
    })
    addBtn.add_css_class('flat')
    addBtn.connect('clicked', () => {
      return this._callbacks.onNewSkill()
    })
    header.pack_start(addBtn)

    this._searchBtn = new Gtk.ToggleButton({
      icon_name: 'system-search-symbolic',
      tooltip_text: 'Search skills (Ctrl+F)',
      valign: Gtk.Align.CENTER
    })
    this._searchBtn.add_css_class('flat')
    header.pack_end(this._searchBtn)

    this._widget.add_top_bar(header)

    this._searchEntry = new Gtk.SearchEntry({ hexpand: true })
    this._searchBar = new Gtk.SearchBar({ child: this._searchEntry })
    this._searchBar.connect_entry(this._searchEntry)

    this._listBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.SINGLE })
    this._listBox.add_css_class('navigation-sidebar')

    const listScrolled = new Gtk.ScrolledWindow({
      vexpand: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER
    })
    listScrolled.set_child(this._listBox)

    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
    box.append(this._searchBar)
    box.append(listScrolled)
    this._widget.set_content(box)

    this._setupSignals()
  }

  private _setupSignals(): void {
    this._searchBtn.connect('toggled', () => {
      this._searchBar.search_mode_enabled = this._searchBtn.active
    })
    this._searchBar.connect('notify::search-mode-enabled', () => {
      this._searchBtn.active = this._searchBar.search_mode_enabled
      if (!this._searchBar.search_mode_enabled) {
        this._searchEntry.set_text('')
        this._searchText = ''
        this._searchEmbedding = null
        this._searchSimilarities.clear()
        this.refresh()
      }
    })
    this._searchEntry.connect('search-changed', () => {
      this._searchText = this._searchEntry.get_text().toLowerCase().trim()
      this.refresh()
      this._performSearch()
    })

    this._listBox.connect('row-selected', (_lb, row) => {
      if (this._isSaving) {
        return
      }
      if (!row) {
        this._callbacks.onSkillSelected(null)
        return
      }
      const skillId = this._rowToSkillId.get(row)
      this._callbacks.onSkillSelected(skillId ?? null)
    })
  }

  private _performSearch = debounce(async () => {
    if (!this._searchText) {
      this._searchEmbedding = null
      this._searchSimilarities.clear()
      this.refresh()
      return
    }
    try {
      const response = await this._app.provider.embed({
        model: DEFAULT_EMBEDDING_MODEL,
        input: this._searchText
      })
      if (response?.embeddings?.length) {
        this._searchEmbedding = response.embeddings[0]
        this._searchSimilarities.clear()
        for (const skill of this._app.skills) {
          this._searchSimilarities.set(
            skill.id,
            skill.embeddings ? cosineSimilarity(this._searchEmbedding, skill.embeddings) : 0
          )
        }
        this.refresh()
      }
    } catch (err) {
      console.error('Failed to perform semantic search:', err)
      this._searchEmbedding = null
      this._searchSimilarities.clear()
      this.refresh()
    }
  }, 100)

  public refresh(selectedId: string | null = null): void {
    this._isSaving = true
    this._rowToSkillId.clear()

    let child = this._listBox.get_first_child()
    while (child) {
      this._listBox.remove(child)
      child = this._listBox.get_first_child()
    }

    const skills = this._app.skills ?? []
    let builtins = skills.filter((s) => {
      return this._defaultIds.has(s.id)
    })
    let customs = skills.filter((s) => {
      return !this._defaultIds.has(s.id)
    })

    if (this._searchText) {
      const filter = (s: Skill) => {
        const textMatch = s.name.toLowerCase().includes(this._searchText)
        const semanticMatch = (this._searchSimilarities.get(s.id) || 0) >= 0.5
        return textMatch || semanticMatch
      }
      builtins = builtins.filter(filter)
      customs = customs.filter(filter)
    }

    if (builtins.length > 0 || (!this._searchText && this._callbacks.hasModifiedBuiltins?.())) {
      this._resetBtn = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        tooltip_text: 'Reset all built-in skills',
        valign: Gtk.Align.CENTER
      })
      this._resetBtn.add_css_class('flat')
      this._resetBtn.add_css_class('circular')
      this._resetBtn.sensitive = !!this._callbacks.hasModifiedBuiltins?.()
      this._resetBtn.connect('clicked', () => {
        return this._callbacks.onResetBuiltins?.()
      })
      this._addHeaderRow('Builtins', this._resetBtn)
      builtins.forEach((s) => {
        return this._addSkillRow(s)
      })
    }
    if (customs.length > 0) {
      this._addHeaderRow('Custom')
      customs.forEach((s) => {
        return this._addSkillRow(s)
      })
    }

    this._isSaving = false

    let found = false
    if (selectedId) {
      for (const [row, id] of this._rowToSkillId) {
        if (id === selectedId) {
          this._listBox.select_row(row)
          found = true
          break
        }
      }
    }

    if (!found) {
      let child = this._listBox.get_first_child()
      while (child) {
        if (child instanceof Gtk.ListBoxRow) {
          const id = this._rowToSkillId.get(child)
          if (id) {
            this._listBox.select_row(child)
            break
          }
        }
        child = child.get_next_sibling()
      }
    }
  }

  private _addHeaderRow(label: string, actionWidget?: Gtk.Widget): void {
    const headerLabel = new Gtk.Label({ label, xalign: 0, hexpand: true })
    headerLabel.add_css_class('dim-label')
    headerLabel.add_css_class('caption-heading')

    const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    box.append(headerLabel)
    if (actionWidget) {
      box.append(actionWidget)
    }

    this._listBox.append(new Gtk.ListBoxRow({
      child: box,
      activatable: false,
      selectable: false
    }))
  }

  private _addSkillRow(skill: Skill): void {
    const label = new Gtk.Label({
      label: skill.name,
      xalign: 0,
      ellipsize: Pango.EllipsizeMode.END
    })
    const row = new Gtk.ListBoxRow({
      child: label,
      tooltip_text: skill.name
    })
    this._rowToSkillId.set(row, skill.id)

    if (!this._defaultIds.has(skill.id)) {
      const actionGroup = new Gio.SimpleActionGroup()
      actionGroup.add_action(createSimpleAction('delete', () => {
        return this._callbacks.onDeleteSkill(skill.id)
      }))
      row.insert_action_group('skill', actionGroup)

      const menu = new Gio.Menu()
      menu.append_item(createMenuItem('Delete Skill', 'skill.delete', 'user-trash-symbolic'))
      const popover = Gtk.PopoverMenu.new_from_model(menu)
      popover.set_parent(row)
      popover.set_has_arrow(false)
      popover.set_position(Gtk.PositionType.BOTTOM)
      setupContextMenu(row, popover)
    }

    this._listBox.append(row)
  }

  public selectRowForId(id: string): void {
    for (const [row, skillId] of this._rowToSkillId) {
      if (skillId === id) {
        this._listBox.select_row(row)
        return
      }
    }
  }

  public updateRowLabel(id: string, name: string): void {
    for (const [row, skillId] of this._rowToSkillId) {
      if (skillId === id) {
        (row.get_child() as Gtk.Label).label = name
        row.tooltip_text = name
        return
      }
    }
  }

  public updateResetButton(): void {
    if (this._resetBtn) {
      this._resetBtn.sensitive = !!this._callbacks.hasModifiedBuiltins?.()
    }
  }
}
