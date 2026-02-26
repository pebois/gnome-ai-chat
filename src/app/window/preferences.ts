import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/app/index.js'
import { DEFAULT_OLLAMA_URL, DEFAULT_OPTIONS, DEFAULT_STREAM, DEFAULT_SYSTEM_PROMPT, DEFAULT_THEME, DEFAULT_THINK } from '@/lib/constants.js'
import { think_types } from '@/lib/storage.js'
import { showDestructiveConfirmation } from '@/lib/ui.js'

export class Preferences {
  private _app: AppInterface
  private _window: Adw.PreferencesWindow

  constructor(app: AppInterface) {
    this._app = app
    this._window = new Adw.PreferencesWindow({
      title: 'Settings',
      modal: true,
      transient_for: app.window,
      default_width: 500,
      default_height: 600
    })

    this._setupGeneral()
    this._setupAppearance()
    this._setupPrompt()
    this._setupAdvanced()
    this._setupData()
  }

  private _setupGeneral(): void {
    const page = new Adw.PreferencesPage({
      title: 'General',
      icon_name: 'preferences-system-symbolic'
    })
    this._window.add(page)

    const group = new Adw.PreferencesGroup({
      title: 'Connection'
    })
    page.add(group)

    const urlRow = new Adw.EntryRow({
      title: 'Ollama API URL',
      text: this._app.settings.url
    })
    const urlReset = this._createResetButton(() => {
      urlRow.set_text(DEFAULT_OLLAMA_URL)
    })
    urlReset.sensitive = this._app.settings.url !== DEFAULT_OLLAMA_URL
    urlRow.connect('notify::text', () => {
      const val = urlRow.get_text()
      this._app.settings.url = val
      this._app.saveSettings()
      urlReset.sensitive = val !== DEFAULT_OLLAMA_URL
    })
    urlRow.add_suffix(urlReset)
    group.add(urlRow)

    const behaviorGroup = new Adw.PreferencesGroup({
      title: 'Behavior'
    })
    page.add(behaviorGroup)

    const streamRow = new Adw.SwitchRow({
      title: 'Real-time Streaming',
      active: this._app.settings.stream
    })
    const streamReset = this._createResetButton(() => {
      streamRow.active = DEFAULT_STREAM
    })
    streamReset.sensitive = this._app.settings.stream !== DEFAULT_STREAM
    streamRow.connect('notify::active', () => {
      this._app.settings.stream = streamRow.active
      this._app.saveSettings()
      streamReset.sensitive = streamRow.active !== DEFAULT_STREAM
    })
    streamRow.add_suffix(streamReset)
    behaviorGroup.add(streamRow)

    const thinkGroup = new Adw.PreferencesGroup({
      title: 'Reasoning'
    })
    page.add(thinkGroup)

    const thinkRow = new Adw.ComboRow({
      title: 'Reasoning Effort',
      model: Gtk.StringList.new([...think_types]),
      selected: think_types.indexOf(this._app.settings.think ?? DEFAULT_THINK)
    })
    const thinkReset = this._createResetButton(() => {
      thinkRow.selected = think_types.indexOf(DEFAULT_THINK)
    })
    thinkReset.sensitive = think_types[thinkRow.selected] !== DEFAULT_THINK
    thinkRow.connect('notify::selected', () => {
      const val = think_types[thinkRow.selected]
      this._app.settings.think = val
      this._app.saveSettings()
      thinkReset.sensitive = val !== DEFAULT_THINK
    })
    thinkRow.add_suffix(thinkReset)
    thinkGroup.add(thinkRow)
  }

  private _setupAppearance(): void {
    const page = new Adw.PreferencesPage({
      title: 'Appearance',
      icon_name: 'dark-mode-symbolic'
    })
    this._window.add(page)

    const group = new Adw.PreferencesGroup({
      title: 'Style'
    })
    page.add(group)

    const themeMap = [
      Adw.ColorScheme.DEFAULT,
      Adw.ColorScheme.FORCE_LIGHT,
      Adw.ColorScheme.FORCE_DARK
    ]

    let defaultSelectedIndex = themeMap.indexOf(this._app.settings.theme)
    if (defaultSelectedIndex === -1) {
      defaultSelectedIndex = 0
    }

    const themeRow = new Adw.ComboRow({
      title: 'Color Scheme',
      model: Gtk.StringList.new(['System', 'Light', 'Dark']),
      selected: defaultSelectedIndex
    })

    const themeReset = this._createResetButton(() => {
      let resetIndex = themeMap.indexOf(DEFAULT_THEME)
      if (resetIndex === -1) {
        resetIndex = 0
      }
      themeRow.selected = resetIndex
    })
    themeReset.sensitive = this._app.settings.theme !== DEFAULT_THEME

    themeRow.connect('notify::selected', () => {
      const val = themeMap[themeRow.selected]
      this._app.setTheme(val)
      themeReset.sensitive = val !== DEFAULT_THEME
    })

    themeRow.add_suffix(themeReset)
    group.add(themeRow)
  }

  private _setupPrompt(): void {
    const page = new Adw.PreferencesPage({
      title: 'Prompt',
      icon_name: 'text-x-generic-symbolic'
    })
    this._window.add(page)

    const group = new Adw.PreferencesGroup({
      title: 'System Prompt'
    })
    page.add(group)

    const scrolled = new Gtk.ScrolledWindow({
      propagate_natural_height: true,
      min_content_height: 200,
      max_content_height: 400,
      hscrollbar_policy: Gtk.PolicyType.NEVER
    })
    scrolled.add_css_class('view')
    scrolled.add_css_class('frame')

    const textView = new Gtk.TextView({
      wrap_mode: Gtk.WrapMode.WORD_CHAR,
      left_margin: 12,
      right_margin: 12,
      top_margin: 12,
      bottom_margin: 12
    })
    const buffer = textView.get_buffer()
    buffer.set_text(this._app.settings.system, -1)

    const resetBtn = this._createResetButton(() => {
      buffer.set_text(DEFAULT_SYSTEM_PROMPT, -1)
    })
    resetBtn.sensitive = this._app.settings.system !== DEFAULT_SYSTEM_PROMPT
    group.set_header_suffix(resetBtn)

    buffer.connect('changed', () => {
      const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false)
      this._app.settings.system = text
      this._app.saveSettings()
      resetBtn.sensitive = text !== DEFAULT_SYSTEM_PROMPT
    })

    scrolled.set_child(textView)
    group.add(scrolled)
  }

  private _setupData(): void {
    const page = new Adw.PreferencesPage({
      title: 'Data',
      icon_name: 'folder-remote-symbolic'
    })
    this._window.add(page)

    const searchGroup = new Adw.PreferencesGroup({
      title: 'Search Indexing'
    })
    page.add(searchGroup)

    const indexRow = new Adw.ActionRow({
      title: 'Vector Indexing'
    })
    const indexBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 12,
      valign: Gtk.Align.CENTER
    })
    const indexBtn = new Gtk.Button({
      label: 'Full Re-index'
    })
    const progressBar = new Gtk.ProgressBar({
      visible: false,
      hexpand: true,
      valign: Gtk.Align.CENTER
    })
    indexBtn.connect('clicked', () => {
      if (this._indexingCancellable) {
        this._indexingCancellable.cancel()
        return
      }
      return this._indexConversations(indexBtn, progressBar)
    })
    indexBox.append(progressBar)
    indexBox.append(indexBtn)
    indexRow.add_suffix(indexBox)
    searchGroup.add(indexRow)

    const group = new Adw.PreferencesGroup({
      title: 'Chat History'
    })
    page.add(group)

    const clearRow = new Adw.ActionRow({
      title: 'Clear All Chats'
    })
    const clearBtn = new Gtk.Button({
      label: 'Clear chats',
      valign: Gtk.Align.CENTER
    })
    clearBtn.add_css_class('row-button')
    clearBtn.add_css_class('destructive-action')
    clearBtn.connect('clicked', () => {
      showDestructiveConfirmation(
        this._app.window,
        'Clear All Chats',
        'Are you sure you want to permanently delete all conversation history?\nThis action cannot be undone.',
        async () => {
          await this._app.clearAllConversations()
        }
      )
    })
    clearRow.add_suffix(clearBtn)
    group.add(clearRow)

    const maintenanceGroup = new Adw.PreferencesGroup({
      title: 'Maintenance'
    })
    page.add(maintenanceGroup)

    const clearStatsRow = new Adw.ActionRow({
      title: 'Clear Usage Statistics'
    })
    const clearStatsBtn = new Gtk.Button({
      label: 'Clear stats',
      valign: Gtk.Align.CENTER
    })
    clearStatsBtn.add_css_class('row-button')
    clearStatsBtn.add_css_class('destructive-action')
    clearStatsBtn.connect('clicked', () => {
      showDestructiveConfirmation(
        this._app.window,
        'Clear Performance Stats',
        'Are you sure you want to permanently delete all performance statistics?\nThis action cannot be undone.',
        () => {
          return this._app.tracker.clearStats()
        }
      )
    })
    clearStatsRow.add_suffix(clearStatsBtn)
    maintenanceGroup.add(clearStatsRow)
  }

  private _setupAdvanced(): void {
    const page = new Adw.PreferencesPage({
      title: 'Advanced',
      icon_name: 'preferences-other-symbolic'
    })
    this._window.add(page)

    const group = new Adw.PreferencesGroup({
      title: 'Model Parameters'
    })
    page.add(group)

    const tempRow = new Adw.ActionRow({ title: 'Temperature' })
    const tempScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 1, 0.1)
    tempScale.set_value(this._app.settings.options.temperature)
    tempScale.set_size_request(200, -1)
    const tempReset = this._createResetButton(() => {
      tempScale.set_value(DEFAULT_OPTIONS.temperature)
    })
    tempReset.sensitive = Math.abs(this._app.settings.options.temperature - DEFAULT_OPTIONS.temperature) > 0.001
    tempScale.connect('value-changed', () => {
      const val = tempScale.get_value()
      this._app.settings.options.temperature = val
      this._app.saveSettings()
      tempReset.sensitive = Math.abs(val - DEFAULT_OPTIONS.temperature) > 0.001
    })
    tempRow.add_suffix(tempScale)
    tempRow.add_suffix(tempReset)
    group.add(tempRow)

    const ctxRow = new Adw.ActionRow({ title: 'Context Window' })
    const ctxSpin = Gtk.SpinButton.new_with_range(2048, 128000, 1024)
    ctxSpin.set_value(this._app.settings.options.num_ctx)
    ctxSpin.valign = Gtk.Align.CENTER
    const ctxReset = this._createResetButton(() => {
      ctxSpin.set_value(DEFAULT_OPTIONS.num_ctx)
    })
    ctxReset.sensitive = this._app.settings.options.num_ctx !== DEFAULT_OPTIONS.num_ctx
    ctxSpin.connect('value-changed', () => {
      const val = ctxSpin.get_value()
      this._app.settings.options.num_ctx = val
      this._app.saveSettings()
      ctxReset.sensitive = val !== DEFAULT_OPTIONS.num_ctx
    })
    ctxRow.add_suffix(ctxSpin)
    ctxRow.add_suffix(ctxReset)
    group.add(ctxRow)

    const topKRow = new Adw.ActionRow({ title: 'Top K' })
    const topKSpin = Gtk.SpinButton.new_with_range(1, 100, 1)
    topKSpin.set_value(this._app.settings.options.top_k)
    topKSpin.valign = Gtk.Align.CENTER
    const topKReset = this._createResetButton(() => {
      topKSpin.set_value(DEFAULT_OPTIONS.top_k)
    })
    topKReset.sensitive = this._app.settings.options.top_k !== DEFAULT_OPTIONS.top_k
    topKSpin.connect('value-changed', () => {
      const val = topKSpin.get_value()
      this._app.settings.options.top_k = val
      this._app.saveSettings()
      topKReset.sensitive = val !== DEFAULT_OPTIONS.top_k
    })
    topKRow.add_suffix(topKSpin)
    topKRow.add_suffix(topKReset)
    group.add(topKRow)

    const topPRow = new Adw.ActionRow({ title: 'Top P' })
    const topPScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 1, 0.05)
    topPScale.set_value(this._app.settings.options.top_p)
    topPScale.set_size_request(200, -1)
    const topPReset = this._createResetButton(() => {
      topPScale.set_value(DEFAULT_OPTIONS.top_p)
    })
    topPReset.sensitive = Math.abs(this._app.settings.options.top_p - DEFAULT_OPTIONS.top_p) > 0.001
    topPScale.connect('value-changed', () => {
      const val = topPScale.get_value()
      this._app.settings.options.top_p = val
      this._app.saveSettings()
      topPReset.sensitive = Math.abs(val - DEFAULT_OPTIONS.top_p) > 0.001
    })
    topPRow.add_suffix(topPScale)
    topPRow.add_suffix(topPReset)
    group.add(topPRow)
  }

  public show(): void {
    this._window.present()
  }

  private _createResetButton(callback: () => void): Gtk.Button {
    const btn = new Gtk.Button({
      icon_name: 'edit-undo-symbolic',
      tooltip_text: 'Reset to default',
      valign: Gtk.Align.CENTER,
      margin_start: 6
    })
    btn.add_css_class('flat')
    btn.add_css_class('circular')
    btn.connect('clicked', callback)
    return btn
  }

  private _indexingCancellable: Gio.Cancellable | null = null

  private async _indexConversations(btn: Gtk.Button, progressBar: Gtk.ProgressBar): Promise<void> {
    const oldLabel = btn.get_label()
    btn.set_label('Stop')
    progressBar.set_fraction(0)
    progressBar.set_visible(true)
    this._indexingCancellable = new Gio.Cancellable()

    try {
      await this._app.storage.index(this._app.ollama, this._app.conversations, true, this._indexingCancellable, (fraction) => {
        progressBar.set_fraction(fraction)
      })

      if (this._indexingCancellable.is_cancelled()) {
        this._app.showToast('Indexing cancelled')
      } else {
        this._app.showToast('Indexing completed')
      }
    } catch (err) {
      if (!(err instanceof GLib.Error && err.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))) {
        console.error('Failed to index:', err)
        this._app.showToast('Indexing failed', true)
      }
    } finally {
      btn.set_label(oldLabel ?? '')
      progressBar.set_visible(false)
      this._indexingCancellable = null
    }
  }
}

export function showPreferencesWindow(app: AppInterface): void {
  const preferences = new Preferences(app)
  preferences.show()
}
