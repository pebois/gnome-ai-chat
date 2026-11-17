import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

import type { ManagedSection, SectionHost } from '@/app/window/manage/section.js'
import { createMcpSection } from '@/app/window/mcp/section.js'
import { createSkillsSection } from '@/app/window/skills/section.js'
import type { AppInterface } from '@/lib/app.js'

export type ManageSectionId = 'skills' | 'mcp'

export interface ManageTarget {
  section: ManageSectionId
  itemId?: string
}

const SECTION_FACTORIES: Record<ManageSectionId, (app: AppInterface, host: SectionHost) => ManagedSection> = {
  skills: createSkillsSection,
  mcp: createMcpSection
}

export class ManageWindow implements SectionHost {
  private _win: Adw.Window
  private _splitView: Adw.OverlaySplitView
  private _section: ManagedSection
  private _searchBtn: Gtk.ToggleButton

  public get window(): Adw.Window {
    return this._win
  }

  constructor(app: AppInterface, id: ManageSectionId) {
    this._win = new Adw.Window({
      default_width: 800,
      default_height: 600,
      transient_for: app.window
    })

    this._section = SECTION_FACTORIES[id](app, this)
    this._win.title = this._section.labels.windowTitle

    this._splitView = new Adw.OverlaySplitView({
      min_sidebar_width: 240,
      sidebar_width_fraction: 0.25
    })
    this._splitView.bind_property('show-sidebar', this._section.toggleSidebarButton, 'active', GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE)

    this._searchBtn = new Gtk.ToggleButton({
      icon_name: 'system-search-symbolic',
      tooltip_text: this._section.labels.searchTooltip,
      valign: Gtk.Align.CENTER
    })
    this._searchBtn.add_css_class('flat')
    this._searchBtn.connect('toggled', () => {
      this._section.searchMode = this._searchBtn.active
    })

    const header = new Adw.HeaderBar({
      title_widget: new Adw.WindowTitle({ title: this._section.labels.title })
    })
    header.add_css_class('flat')
    header.pack_start(this._section.addButton)
    header.pack_end(this._searchBtn)

    const sidebar = new Adw.ToolbarView()
    sidebar.add_top_bar(header)
    sidebar.set_content(this._section.sidebarWidget)

    this._splitView.set_sidebar(sidebar)
    this._splitView.set_content(this._section.editorWidget)
    this._win.set_content(this._splitView)

    this._setupKeys()
    this._win.connect('close-request', () => {
      this._section.close()
      return false
    })
  }

  private _setupKeys(): void {
    const keyCtrl = new Gtk.EventControllerKey()
    keyCtrl.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
      if (!(state & Gdk.ModifierType.CONTROL_MASK) || (state & Gdk.ModifierType.SHIFT_MASK)) {
        return false
      }
      const key = Gdk.keyval_to_lower(keyval)
      if (key === Gdk.KEY_b) {
        this._splitView.show_sidebar = !this._splitView.show_sidebar
        return true
      }
      if (key === Gdk.KEY_f) {
        this._searchBtn.active = !this._searchBtn.active
        return true
      }
      if (key === Gdk.KEY_n) {
        this._section.create()
        return true
      }
      return false
    })
    this._win.add_controller(keyCtrl)
  }

  public onSearchModeChanged(_sectionId: string, enabled: boolean): void {
    this._searchBtn.active = enabled
  }

  public select(itemId: string): void {
    this._section.select(itemId)
  }

  public show(): void {
    this._win.present()
  }

  public onClosed(callback: () => void): void {
    this._win.connect('close-request', () => {
      callback()
      return false
    })
  }
}

const windows = new Map<ManageSectionId, ManageWindow>()

export function isManageSectionVisible(section: ManageSectionId): boolean {
  return windows.has(section)
}

export function closeManageWindow(): void {
  for (const win of [...windows.values()]) {
    win.window.close()
  }
}

export function showManageWindow(app: AppInterface, target: ManageTarget): void {
  let win = windows.get(target.section)
  if (!win) {
    win = new ManageWindow(app, target.section)
    windows.set(target.section, win)
    win.onClosed(() => {
      windows.delete(target.section)
    })
  }
  if (target.itemId) {
    win.select(target.itemId)
  }
  win.show()
}
