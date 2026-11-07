import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { APPLICATION_ID, APPLICATION_NAME, VERSION } from '@/lib/constants.js'

export function showAboutWindow(app: AppInterface): void {
  const about = new Adw.AboutDialog({
    application_name: APPLICATION_NAME,
    application_icon: APPLICATION_ID,
    developer_name: 'Pierre-Emmanuel Bois',
    copyright: '© 2024–2026 Pierre-Emmanuel Bois',
    version: VERSION,
    comments: 'A GNOME chat application that talks to a local LLM provider.',
    website: 'https://pebois.github.io/gnome-ai-chat',
    issue_url: 'https://github.com/pebois/gnome-ai-chat/issues',
    license_type: Gtk.License.MIT_X11
  })
  if (app.settings.debug) {
    about.add_css_class('devel')
  }
  about.present(app.window)
}
