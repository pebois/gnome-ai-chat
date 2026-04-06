import Adw from 'gi://Adw?version=1'

import type { AppInterface } from '@/app/index.js'
import { APPLICATION_ID, APPLICATION_NAME, VERSION } from '@/lib/constants.js'

export function showAboutWindow(app: AppInterface): void {
  const about = new Adw.AboutWindow({
    transient_for: app.window,
    application_name: APPLICATION_NAME,
    application_icon: APPLICATION_ID,
    developer_name: 'Pierre-Emmanuel Bois',
    copyright: '© 2024–2026 Pierre-Emmanuel Bois',
    version: VERSION,
    comments: 'A GNOME chat application that talks to a local Ollama server.',
    website: 'https://github.com/pebois/gnome-ai-chat',
    issue_url: 'https://github.com/pebois/gnome-ai-chat/issues',
    license_type: 8
  })
  if (app.settings.debug) {
    about.add_css_class('devel')
  }
  about.present()
}
