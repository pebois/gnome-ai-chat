import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import { createResetButton } from '@/app/window/preferences/utils.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_OPTIONS } from '@/lib/constants.js'

export function createAdvancedPage(app: AppInterface): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Advanced',
    icon_name: 'preferences-other-symbolic'
  })

  const group = new Adw.PreferencesGroup({
    title: 'Model Parameters'
  })
  page.add(group)

  const tempRow = new Adw.ActionRow({ title: 'Temperature' })
  const tempScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 1, 0.1)
  tempScale.set_value(app.settings.options.temperature)
  tempScale.set_size_request(200, -1)
  const tempReset = createResetButton(() => {
    tempScale.set_value(DEFAULT_OPTIONS.temperature)
  })
  tempReset.sensitive = Math.abs(app.settings.options.temperature - DEFAULT_OPTIONS.temperature) > 0.001
  tempScale.connect('value-changed', () => {
    const val = tempScale.get_value()
    app.settings.options.temperature = val
    app.saveSettings()
    tempReset.sensitive = Math.abs(val - DEFAULT_OPTIONS.temperature) > 0.001
  })
  tempRow.add_suffix(tempScale)
  tempRow.add_suffix(tempReset)
  group.add(tempRow)

  const ctxRow = new Adw.ActionRow({ title: 'Context Window' })
  const ctxSpin = Gtk.SpinButton.new_with_range(2048, 128000, 1024)
  ctxSpin.set_value(app.settings.options.num_ctx)
  ctxSpin.valign = Gtk.Align.CENTER
  const ctxReset = createResetButton(() => {
    ctxSpin.set_value(DEFAULT_OPTIONS.num_ctx)
  })
  ctxReset.sensitive = app.settings.options.num_ctx !== DEFAULT_OPTIONS.num_ctx
  ctxSpin.connect('value-changed', () => {
    const val = ctxSpin.get_value()
    app.settings.options.num_ctx = val
    app.saveSettings()
    ctxReset.sensitive = val !== DEFAULT_OPTIONS.num_ctx
  })
  ctxRow.add_suffix(ctxSpin)
  ctxRow.add_suffix(ctxReset)
  group.add(ctxRow)

  const topKRow = new Adw.ActionRow({ title: 'Top K' })
  const topKSpin = Gtk.SpinButton.new_with_range(1, 100, 1)
  topKSpin.set_value(app.settings.options.top_k)
  topKSpin.valign = Gtk.Align.CENTER
  const topKReset = createResetButton(() => {
    topKSpin.set_value(DEFAULT_OPTIONS.top_k)
  })
  topKReset.sensitive = app.settings.options.top_k !== DEFAULT_OPTIONS.top_k
  topKSpin.connect('value-changed', () => {
    const val = topKSpin.get_value()
    app.settings.options.top_k = val
    app.saveSettings()
    topKReset.sensitive = val !== DEFAULT_OPTIONS.top_k
  })
  topKRow.add_suffix(topKSpin)
  topKRow.add_suffix(topKReset)
  group.add(topKRow)

  const topPRow = new Adw.ActionRow({ title: 'Top P' })
  const topPScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 1, 0.05)
  topPScale.set_value(app.settings.options.top_p)
  topPScale.set_size_request(200, -1)
  const topPReset = createResetButton(() => {
    topPScale.set_value(DEFAULT_OPTIONS.top_p)
  })
  topPReset.sensitive = Math.abs(app.settings.options.top_p - DEFAULT_OPTIONS.top_p) > 0.001
  topPScale.connect('value-changed', () => {
    const val = topPScale.get_value()
    app.settings.options.top_p = val
    app.saveSettings()
    topPReset.sensitive = Math.abs(val - DEFAULT_OPTIONS.top_p) > 0.001
  })
  topPRow.add_suffix(topPScale)
  topPRow.add_suffix(topPReset)
  group.add(topPRow)

  return page
}
