import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gtk from 'gi://Gtk?version=4.0'
import GtkSource from 'gi://GtkSource?version=5'

import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SYNTAX_THEME } from '@/lib/constants.js'
import { createBoxedExpanderRow } from '@/lib/ui.js'
import { getLanguageMetadata } from '@/lib/utils.js'

export function createCodeWidget(
  code: string,
  language: string,
  app: AppInterface
): {
  widget: Gtk.Widget
  expanderRow: Adw.ExpanderRow
  buffer: GtkSource.Buffer
} {
  const lm = GtkSource.LanguageManager.get_default()
  const metadata = getLanguageMetadata(language)

  const [listBox, expander] = createBoxedExpanderRow(metadata.title, 'text-x-generic-symbolic')
  expander.set_expanded(true)

  const copyBtn = new Gtk.Button({
    icon_name: 'edit-copy-symbolic',
    tooltip_text: 'Copy code',
    valign: Gtk.Align.CENTER
  })
  copyBtn.add_css_class('flat')
  expander.add_suffix(copyBtn)

  const buffer = new GtkSource.Buffer()
  copyBtn.connect('clicked', () => {
    const cb = Gdk.Display.get_default()!.get_clipboard()
    cb.set(buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false))
    app.showToast('Code copied')
  })
  const lang = lm.get_language(metadata.id) || lm.get_language('text')
  if (lang) {
    buffer.set_language(lang)
  }
  buffer.set_text(code, -1)

  const sm = GtkSource.StyleSchemeManager.get_default()
  const scheme = sm.get_scheme(app.settings.syntax || DEFAULT_SYNTAX_THEME)
  if (scheme) {
    buffer.set_style_scheme(scheme)
  }

  const sourceView = new GtkSource.View({
    buffer: buffer,
    editable: false,
    monospace: true,
    show_line_numbers: true,
    wrap_mode: Gtk.WrapMode.WORD_CHAR,
    top_margin: 6,
    bottom_margin: 6,
    left_margin: 6,
    right_margin: 6,
    margin_top: 6,
    margin_bottom: 6,
    margin_start: 6,
    margin_end: 6
  })
  sourceView.add_css_class('code-view')

  expander.add_row(sourceView)

  return { widget: listBox, expanderRow: expander, buffer }
}
