import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'

import { createResetButton } from '@/app/window/preferences/utils.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SYNTAX_THEME, DEFAULT_THEME } from '@/lib/constants.js'

export function createAppearancePage(app: AppInterface): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Appearance',
    icon_name: 'dark-mode-symbolic'
  })

  const group = new Adw.PreferencesGroup({
    title: 'Style'
  })
  page.add(group)

  const themeMap = [
    Adw.ColorScheme.DEFAULT,
    Adw.ColorScheme.FORCE_LIGHT,
    Adw.ColorScheme.FORCE_DARK
  ]

  let defaultSelectedIndex = themeMap.indexOf(app.settings.theme)
  if (defaultSelectedIndex === -1) {
    defaultSelectedIndex = 0
  }

  const themeRow = new Adw.ComboRow({
    title: 'Color Scheme',
    model: Gtk.StringList.new(['System', 'Light', 'Dark']),
    selected: defaultSelectedIndex
  })

  const themeReset = createResetButton(() => {
    let resetIndex = themeMap.indexOf(DEFAULT_THEME)
    if (resetIndex === -1) {
      resetIndex = 0
    }
    themeRow.selected = resetIndex
  })
  themeReset.sensitive = app.settings.theme !== DEFAULT_THEME

  themeRow.connect('notify::selected', () => {
    const val = themeMap[themeRow.selected]
    app.setTheme(val)
    themeReset.sensitive = val !== DEFAULT_THEME
  })

  themeRow.add_suffix(themeReset)
  group.add(themeRow)

  const sm = GtkSource.StyleSchemeManager.get_default()
  const schemeIds = sm.get_scheme_ids() || []
  const currentScheme = app.settings.syntax || DEFAULT_SYNTAX_THEME
  let selectedSchemeIndex = schemeIds.indexOf(currentScheme)
  if (selectedSchemeIndex === -1) {
    selectedSchemeIndex = 0
  }

  const syntaxRow = new Adw.ComboRow({
    title: 'Syntax Highlighting Theme',
    model: Gtk.StringList.new(schemeIds),
    selected: selectedSchemeIndex
  })

  const syntaxReset = createResetButton(() => {
    const resetIndex = schemeIds.indexOf(DEFAULT_SYNTAX_THEME)
    syntaxRow.selected = resetIndex !== -1 ? resetIndex : 0
  })
  syntaxReset.sensitive = currentScheme !== DEFAULT_SYNTAX_THEME

  syntaxRow.connect('notify::selected', () => {
    const val = schemeIds[syntaxRow.selected]
    app.setSyntax(val)
    syntaxReset.sensitive = val !== DEFAULT_SYNTAX_THEME
  })

  syntaxRow.add_suffix(syntaxReset)
  group.add(syntaxRow)

  return page
}
