import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'

import { createResetButton } from '@/app/window/preferences/utils.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SYNTAX_THEME, DEFAULT_SYSTEM_PROMPT } from '@/lib/constants.js'

export function createPromptPage(app: AppInterface, window: Adw.PreferencesWindow): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Prompt',
    icon_name: 'text-x-generic-symbolic'
  })

  const group = new Adw.PreferencesGroup({
    title: 'System Prompt'
  })
  page.add(group)

  const scrolled = new Gtk.ScrolledWindow({
    propagate_natural_height: true,
    min_content_height: 200,
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vexpand: true,
    hexpand: true
  })
  scrolled.add_css_class('view')
  scrolled.add_css_class('frame')

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

  const textView = new GtkSource.View({
    buffer,
    wrap_mode: Gtk.WrapMode.WORD_CHAR,
    left_margin: 12,
    right_margin: 12,
    top_margin: 12,
    bottom_margin: 12,
    monospace: true,
    vexpand: true,
    hexpand: true
  })
  buffer.set_text(app.settings.system, -1)

  const syntaxSignalId = app.connect('syntax-changed', (_, theme: string) => {
    const scheme = sm.get_scheme(theme)
    if (scheme) {
      buffer.set_style_scheme(scheme)
    }
  })

  window.connect('close-request', () => {
    app.disconnect(syntaxSignalId)
    return false
  })

  const resetBtn = createResetButton(() => {
    buffer.set_text(DEFAULT_SYSTEM_PROMPT, -1)
  })
  resetBtn.sensitive = app.settings.system !== DEFAULT_SYSTEM_PROMPT
  group.set_header_suffix(resetBtn)

  buffer.connect('changed', () => {
    const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false)
    app.settings.system = text
    app.saveSettings()
    resetBtn.sensitive = text !== DEFAULT_SYSTEM_PROMPT
  })

  scrolled.set_child(textView)
  group.add(scrolled)

  return page
}
