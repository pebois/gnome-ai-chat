import Adw from 'gi://Adw?version=1'

import type { AppInterface } from '@/app/index.js'
import { APPLICATION_ID, APPLICATION_NAME, VERSION } from '@/lib/constants.js'

export function showAboutWindow(app: AppInterface): void {
  const about = new Adw.AboutWindow({
    transient_for: app.window,
    application_name: APPLICATION_NAME,
    application_icon: APPLICATION_ID,
    developer_name: 'Pierre-Emmanuel Bois',
    version: VERSION,
    comments: 'A GNOME chat application that talks to a local Ollama server.',
    website: 'https://github.com/pebois/gnome-ai-chat',
    issue_url: 'https://github.com/pebois/gnome-ai-chat/issues',
    license_type: 0
  })
  if (app.settings.debug) {
    about.add_css_class('devel')
  }
  about.present()
}
