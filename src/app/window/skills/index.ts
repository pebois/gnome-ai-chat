import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gtk from 'gi://Gtk?version=4.0'

import { SkillEditor } from '@/app/window/skills/editor.js'
import { SkillsSidebar } from '@/app/window/skills/sidebar.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SKILLS } from '@/lib/constants.js'
import type { Skill } from '@/lib/db/types.js'
import { showDestructiveConfirmation } from '@/lib/ui.js'

export class SkillsWindow {
  private _app: AppInterface
  private _win: Adw.Window
  private _selectedId: string | null = null
  private _isSaving = false
  private _lastNameError: string | null = null
  private _sidebar: SkillsSidebar
  private _editor: SkillEditor
  private _splitView: Adw.OverlaySplitView
  private _defaultIds = new Set(DEFAULT_SKILLS.map((s) => {
    return s.id
  }))

  constructor(app: AppInterface) {
    this._app = app
    this._win = new Adw.Window({
      title: 'Skills',
      default_width: 800,
      default_height: 600,
      transient_for: app.window
    })

    this._sidebar = new SkillsSidebar(this._app, {
      onSkillSelected: (id) => {
        return this._onSkillSelected(id)
      },
      onNewSkill: () => {
        return this._createNewSkill()
      },
      onDeleteSkill: (id) => {
        return this._deleteSkill(id)
      },
      onResetBuiltins: () => {
        return this._resetAllBuiltins()
      },
      hasModifiedBuiltins: () => {
        return this._hasModifiedBuiltins()
      }
    })

    this._editor = new SkillEditor(this._app, {
      onChanged: () => {
        return this._saveCurrentSkill()
      },
      onDelete: () => {
        if (this._selectedId) {
          this._deleteSkill(this._selectedId)
        }
      },
      onReset: () => {
        return this._resetCurrentSkill()
      },
      onToggleSidebar: () => {
        this._splitView.show_sidebar = this._editor.toggleSidebarButton.active
      }
    })

    this._splitView = new Adw.OverlaySplitView({
      min_sidebar_width: 200,
      sidebar_width_fraction: 0.25
    })
    this._splitView.set_sidebar(this._sidebar.widget)
    this._splitView.set_content(this._editor.widget)
    this._win.set_content(this._splitView)

    this._setupActions()
    this._setupSignals()

    if ((this._app.skills ?? []).length > 0) {
      this._selectedId = this._app.skills[0].id
    }
    this._sidebar.refresh(this._selectedId)
  }

  private _setupActions(): void {
    const winKeyCtrl = new Gtk.EventControllerKey()
    winKeyCtrl.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
      const isCtrl = !!(state & Gdk.ModifierType.CONTROL_MASK)
      if (isCtrl && keyval === Gdk.KEY_b) {
        this._editor.toggleSidebarButton.active = !this._editor.toggleSidebarButton.active
        return true
      }
      if (isCtrl && keyval === Gdk.KEY_f) {
        this._sidebar.searchButton.active = !this._sidebar.searchButton.active
        return true
      }
      if (isCtrl && keyval === Gdk.KEY_n) {
        this._createNewSkill()
        return true
      }
      return false
    })
    this._win.add_controller(winKeyCtrl)
  }

  private _setupSignals(): void {
    this._splitView.connect('notify::show-sidebar', () => {
      this._editor.toggleSidebarButton.active = this._splitView.show_sidebar
    })

    this._win.connect('close-request', () => {
      this._editor.destroy()
      return false
    })
  }

  private _onSkillSelected(id: string | null): void {
    if (this._isSaving) {
      return
    }
    this._isSaving = true
    this._selectedId = id
    const skill = this._app.skills.find((s) => {
      return s.id === id
    }) ?? null
    this._editor.load(
      skill,
      id !== null && this._defaultIds.has(id),
      skill !== null && this._skillDiffersFromDefault(skill)
    )
    this._isSaving = false
  }

  private _createNewSkill(): void {
    let name = 'new-skill'
    let suffix = 2
    while (this._app.skills.some((s) => {
      return s.name.toLowerCase() === name
    })) {
      name = `new-skill-${suffix}`
      suffix++
    }

    const placeholder: Skill = {
      id: `skill-${Date.now()}`,
      name,
      description: '',
      prompt: ''
    }
    this._app.skills.push(placeholder)
    this._app.skills.sort((a, b) => {
      return a.name.localeCompare(b.name)
    })
    this._app.saveSkills()
    this._selectedId = placeholder.id
    this._sidebar.refresh(this._selectedId)
    this._editor.grabFocus()
  }

  private _deleteSkill(id: string): void {
    const idx = this._app.skills.findIndex((s) => {
      return s.id === id
    })
    if (idx === -1) {
      return
    }

    const skillName = this._app.skills[idx].name
    showDestructiveConfirmation(
      this._win,
      'Delete Skill',
      `Are you sure you want to delete "${skillName}"? This cannot be undone.`,
      () => {
        const i = this._app.skills.findIndex((s) => {
          return s.id === id
        })
        if (i === -1) {
          return
        }
        this._app.skills.splice(i, 1)
        this._app.saveSkills()
        if (this._selectedId === id) {
          this._selectedId = this._app.skills.length > 0 ? this._app.skills[Math.max(0, i - 1)].id : null
        }
        this._sidebar.refresh(this._selectedId)
      }
    )
  }

  private _resetCurrentSkill(): void {
    if (this._selectedId === null) {
      return
    }
    const idx = this._app.skills.findIndex((s) => {
      return s.id === this._selectedId
    })
    if (idx === -1) {
      return
    }

    const skill = this._app.skills[idx]
    const defaultSkill = DEFAULT_SKILLS.find((s) => {
      return s.id === skill.id
    })
    if (!defaultSkill) {
      return
    }

    showDestructiveConfirmation(
      this._win,
      'Reset Skill',
      `Are you sure you want to reset "${skill.name}" to its default? This cannot be undone.`,
      () => {
        const i = this._app.skills.findIndex((s) => {
          return s.id === this._selectedId
        })
        if (i === -1) {
          return
        }
        this._app.skills[i] = { ...defaultSkill }
        this._app.skills[i].embeddings = undefined
        this._app.saveSkills()
        this._sidebar.refresh(this._selectedId)
      }
    )
  }

  private _resetAllBuiltins(): void {
    showDestructiveConfirmation(
      this._win,
      'Reset All Built-ins',
      'Are you sure you want to reset all built-in skills to their defaults? This cannot be undone.',
      () => {
        const customs = this._app.skills.filter((s) => {
          return !this._defaultIds.has(s.id)
        })
        const builtins = DEFAULT_SKILLS.map((s) => {
          return { ...s }
        })
        this._app.skills = [...builtins, ...customs]
        this._app.skills.sort((a, b) => {
          return a.name.localeCompare(b.name)
        })
        this._app.saveSkills()
        this._sidebar.refresh(this._selectedId)
      }
    )
  }

  private _hasModifiedBuiltins(): boolean {
    let builtinCount = 0
    for (const skill of this._app.skills) {
      if (this._defaultIds.has(skill.id)) {
        builtinCount++
        if (this._skillDiffersFromDefault(skill)) {
          return true
        }
      }
    }
    return builtinCount < this._defaultIds.size
  }

  private _skillDiffersFromDefault(skill: Skill): boolean {
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

  private _validateSkillName(name: string, id: string): string | null {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
      return 'Skill names can only contain letters, digits, hyphens and underscores'
    }
    const duplicate = this._app.skills.some((s) => {
      return s.id !== id && s.name.toLowerCase() === name.toLowerCase()
    })
    if (duplicate) {
      return `A skill named "${name}" already exists`
    }
    return null
  }

  private _saveCurrentSkill(): void {
    if (this._isSaving || this._selectedId === null) {
      return
    }
    const skill = this._app.skills.find((s) => {
      return s.id === this._selectedId
    })
    if (!skill) {
      return
    }

    const newName = this._editor.name
    if (!newName) {
      return
    }

    const nameError = this._validateSkillName(newName, skill.id)
    if (nameError) {
      if (nameError !== this._lastNameError) {
        this._lastNameError = nameError
        this._app.showToast(nameError, true)
      }
      return
    }
    this._lastNameError = null

    skill.name = newName
    skill.description = this._editor.description
    skill.prompt = this._editor.prompt

    this._sidebar.updateRowLabel(skill.id, newName)
    this._sidebar.updateResetButton()

    const isBuiltin = this._defaultIds.has(skill.id)
    this._editor.updateActions(isBuiltin, this._skillDiffersFromDefault(skill))

    this._app.saveSkills()
  }

  public show(): void {
    this._win.present()
  }
}

export function showSkillsWindow(app: AppInterface): void {
  const skillsWin = new SkillsWindow(app)
  skillsWin.show()
}
