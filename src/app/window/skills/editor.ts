import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'

import type { ItemPanel } from '@/app/window/manage/section.js'
import { createAccessGroups } from '@/app/window/preferences/access.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'
import type { Skill } from '@/lib/db/types.js'
import { describeSkillTools } from '@/lib/skills/index.js'
import { TOOL_GROUPS } from '@/lib/tools/groups.js'

export interface SkillPanelCallbacks {
  onChanged: () => void
  onReset: () => void
}

export class SkillPanel implements ItemPanel<Skill> {
  private _app: AppInterface
  private _callbacks: SkillPanelCallbacks
  private _widget: Gtk.ScrolledWindow
  private _nameRow: Adw.EntryRow
  private _descRow: Adw.EntryRow
  private _enabledRow: Adw.SwitchRow
  private _toolsRow: Adw.SwitchRow
  private _toolsBox: Gtk.Box
  private _loading = false
  private _buffer: GtkSource.Buffer
  private _sourceView: GtkSource.View
  private _resetBtn: Gtk.Button
  private _syntaxSignalId: number
  private _skill: Skill | null = null

  public get widget(): Gtk.Widget {
    return this._widget
  }

  public get resetButton(): Gtk.Button {
    return this._resetBtn
  }

  public get name(): string {
    return this._nameRow.get_text().trim()
  }

  constructor(app: AppInterface, callbacks: SkillPanelCallbacks) {
    this._app = app
    this._callbacks = callbacks

    this._resetBtn = new Gtk.Button({
      icon_name: 'edit-undo-symbolic',
      tooltip_text: 'Reset skill to default',
      valign: Gtk.Align.CENTER
    })
    this._resetBtn.add_css_class('flat')
    this._resetBtn.connect('clicked', () => {
      return this._callbacks.onReset()
    })

    const contentBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 12,
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12
    })

    const metaGroup = new Adw.PreferencesGroup()
    this._nameRow = new Adw.EntryRow({ title: 'Name' })
    this._descRow = new Adw.EntryRow({ title: 'Description' })
    metaGroup.add(this._nameRow)
    this._enabledRow = new Adw.SwitchRow({ title: 'Enabled', subtitle: 'Turn off to hide this skill from every agent' })
    metaGroup.add(this._descRow)
    metaGroup.add(this._enabledRow)
    this._toolsRow = new Adw.SwitchRow({ title: 'Use Custom Tools' })
    this._toolsRow.connect('notify::active', () => {
      this._onCustomToolsToggled()
    })
    metaGroup.add(this._toolsRow)
    contentBox.append(metaGroup)

    this._toolsBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, visible: false })
    contentBox.append(this._toolsBox)

    const lm = GtkSource.LanguageManager.get_default()
    this._buffer = new GtkSource.Buffer()
    const lang = lm.get_language('markdown')
    if (lang) {
      this._buffer.set_language(lang)
    }

    const sm = GtkSource.StyleSchemeManager.get_default()
    const scheme = sm.get_scheme(this._app.settings.syntax || DEFAULT_SYNTAX_THEME)
    if (scheme) {
      this._buffer.set_style_scheme(scheme)
    }

    this._sourceView = new GtkSource.View({
      buffer: this._buffer,
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
      min_content_height: 240,
      hscrollbar_policy: Gtk.PolicyType.NEVER
    })
    editorScrolled.add_css_class('view')
    editorScrolled.add_css_class('frame')
    editorScrolled.set_child(this._sourceView)
    contentBox.append(editorScrolled)

    this._widget = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      child: contentBox
    })

    this._setupSignals()

    this._syntaxSignalId = this._app.connect('syntax-changed', (_, theme) => {
      const scheme = sm.get_scheme(theme)
      if (scheme) {
        this._buffer.set_style_scheme(scheme)
      }
    })
  }

  public destroy(): void {
    this._app.disconnect(this._syntaxSignalId)
  }

  private _setupSignals(): void {
    this._nameRow.connect('notify::text', () => {
      return this._callbacks.onChanged()
    })
    this._descRow.connect('notify::text', () => {
      return this._callbacks.onChanged()
    })
    this._enabledRow.connect('notify::active', () => {
      return this._callbacks.onChanged()
    })
    this._buffer.connect('changed', () => {
      return this._callbacks.onChanged()
    })
  }

  public load(skill: Skill | null): void {
    const name = skill?.name ?? ''
    if (this._nameRow.get_text() !== name) {
      this._nameRow.set_text(name)
    }

    const description = skill?.description ?? ''
    if (this._descRow.get_text() !== description) {
      this._descRow.set_text(description)
    }

    this._enabledRow.active = skill?.enabled ?? true

    const prompt = skill?.prompt ?? ''
    if (this._prompt() !== prompt) {
      this._buffer.set_text(prompt, -1)
    }

    this._skill = skill
    this._updateTools(skill)
  }

  public applyTo(skill: Skill): void {
    skill.description = this._descRow.get_text().trim()
    skill.prompt = this._prompt()
    skill.enabled = this._enabledRow.active
  }

  private _prompt(): string {
    return this._buffer.get_text(this._buffer.get_start_iter(), this._buffer.get_end_iter(), false)
  }

  private _subProfileTools(): string[] {
    const disabled = this._app.settings.agents.sub.disabledTools
    return TOOL_GROUPS.flatMap((group) => {
      return group.tools
    }).filter((name) => {
      return !disabled.includes(name)
    }).sort()
  }

  private _subProfileServers(): string[] {
    const disabled = this._app.settings.agents.sub.disabledServers
    return this._app.mcp.servers.filter((server) => {
      return server.enabled && !disabled.includes(server.id)
    }).map((server) => {
      return server.id
    }).sort()
  }

  private _onCustomToolsToggled(): void {
    const skill = this._skill
    if (this._loading || !skill) {
      return
    }
    skill.tools = this._toolsRow.active
      ? { builtin: this._subProfileTools(), mcp: this._subProfileServers() }
      : undefined
    this._updateTools(skill)
    this._callbacks.onChanged()
  }

  private _setCustom(skill: Skill, key: 'builtin' | 'mcp', ids: string[], on: boolean): void {
    const current = new Set(skill.tools?.[key] ?? (key === 'builtin' ? this._subProfileTools() : this._subProfileServers()))
    for (const id of ids) {
      if (on) {
        current.add(id)
      } else {
        current.delete(id)
      }
    }
    skill.tools = { ...skill.tools, [key]: [...current].sort() }
    this._toolsRow.subtitle = describeSkillTools(skill.tools)
    this._callbacks.onChanged()
  }

  private _updateTools(skill: Skill | null): void {
    const custom = skill?.tools !== undefined
    this._loading = true
    this._toolsRow.active = custom
    this._loading = false
    this._toolsRow.subtitle = custom ? describeSkillTools(skill.tools) : 'Replace the agent\'s tools while this skill runs'

    let child = this._toolsBox.get_first_child()
    while (child) {
      this._toolsBox.remove(child)
      child = this._toolsBox.get_first_child()
    }
    this._toolsBox.visible = custom
    if (!skill || !custom) {
      return
    }
    const groups = createAccessGroups(this._app, {
      tools: {
        isOn: (name) => {
          return skill.tools?.builtin ? skill.tools.builtin.includes(name) : this._subProfileTools().includes(name)
        },
        set: (names, on) => {
          this._setCustom(skill, 'builtin', names, on)
        }
      },
      servers: {
        isOn: (id) => {
          return skill.tools?.mcp ? skill.tools.mcp.includes(id) : this._subProfileServers().includes(id)
        },
        set: (ids, on) => {
          this._setCustom(skill, 'mcp', ids, on)
        }
      }
    })
    for (const group of groups) {
      this._toolsBox.append(group)
    }
  }

  public updateActions(isBuiltin: boolean, differsFromDefault: boolean): void {
    this._resetBtn.visible = isBuiltin
    this._resetBtn.sensitive = isBuiltin && differsFromDefault
  }

  public setNameError(hasError: boolean): void {
    if (hasError) {
      this._nameRow.add_css_class('error')
    } else {
      this._nameRow.remove_css_class('error')
    }
  }

  public grabFocus(): void {
    this._nameRow.grab_focus()
  }
}
