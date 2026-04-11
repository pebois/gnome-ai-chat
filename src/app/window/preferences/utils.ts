import Gtk from 'gi://Gtk?version=4.0'

export function createResetButton(callback: () => void): Gtk.Button {
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
