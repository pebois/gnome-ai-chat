import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { applySkillMention, matchSkill } from '@/lib/skills/index.js'
import { availableSkills } from '@/lib/tools/groups.js'

const NO_SKILL_TOOLTIP = 'Skill (type @ to pick)'

export class SkillPicker {
  private _app: AppInterface
  private _textView: Gtk.TextView
  private _button: Gtk.MenuButton
  private _selectAction: Gio.SimpleAction

  public get widget(): Gtk.MenuButton {
    return this._button
  }

  constructor(app: AppInterface, textView: Gtk.TextView) {
    this._app = app
    this._textView = textView

    this._button = new Gtk.MenuButton({
      icon_name: 'avatar-default-symbolic',
      tooltip_text: NO_SKILL_TOOLTIP,
      valign: Gtk.Align.CENTER
    })
    this._button.add_css_class('circular')

    this._selectAction = new Gio.SimpleAction({
      name: 'select',
      parameter_type: GLib.VariantType.new('s'),
      state: GLib.Variant.new_string('')
    })
    this._selectAction.connect('activate', (_action, parameter) => {
      this._select(parameter?.get_string()[0] ?? '')
    })
    const actionGroup = new Gio.SimpleActionGroup()
    actionGroup.add_action(this._selectAction)
    this._button.insert_action_group('skill', actionGroup)

    this._button.set_create_popup_func(() => {
      this._button.set_menu_model(this._buildMenu())
    })
    this._button.set_menu_model(this._buildMenu())
  }

  private _availableSkills() {
    return availableSkills(this._app.skills ?? [], this._app.settings)
  }

  private _buildMenu(): Gio.Menu {
    const menu = new Gio.Menu()
    const noneSection = new Gio.Menu()
    noneSection.append_item(SkillPicker._radioItem('None', ''))
    menu.append_section(null, noneSection)

    const skills = [...this._availableSkills()].sort((a, b) => {
      return a.name.localeCompare(b.name)
    })
    if (skills.length > 0) {
      const skillSection = new Gio.Menu()
      for (const skill of skills) {
        skillSection.append_item(SkillPicker._radioItem(skill.name, skill.name))
      }
      menu.append_section(null, skillSection)
    }
    return menu
  }

  private static _radioItem(label: string, value: string): Gio.MenuItem {
    const item = new Gio.MenuItem()
    item.set_label(label)
    item.set_action_and_target_value('skill.select', GLib.Variant.new_string(value))
    return item
  }

  private _select(name: string): void {
    const buffer = this._textView.get_buffer()
    const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false)
    buffer.set_text(applySkillMention(text, this._app.skills ?? [], name || null), -1)
    buffer.place_cursor(buffer.get_end_iter())
    this._textView.grab_focus()
  }

  public sync(text: string): void {
    const skill = matchSkill(text, this._availableSkills())
    this._button.tooltip_text = skill ? `Skill: ${skill.name}` : NO_SKILL_TOOLTIP
    this._selectAction.set_state(GLib.Variant.new_string(skill?.name ?? ''))
    if (skill) {
      this._button.add_css_class('accent')
    } else {
      this._button.remove_css_class('accent')
    }
  }
}
