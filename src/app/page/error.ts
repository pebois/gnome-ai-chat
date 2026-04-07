import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import { showPreferencesWindow } from '@/app/window/preferences.js'
import type { AppInterface } from '@/lib/app.js'
import { createPillButton } from '@/lib/ui.js'

export class ErrorPage {
  private _widget: Gtk.Widget

  public get widget(): Gtk.Widget {
    return this._widget
  }

  constructor(app: AppInterface) {
    const statusPage = new Adw.StatusPage({
      icon_name: 'network-error-symbolic',
      title: 'Ollama is Unreachable',
      vexpand: true
    })

    const buttonBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 12,
      halign: Gtk.Align.CENTER
    })

    const retryBtn = createPillButton('view-refresh-symbolic', 'Retry', true)
    retryBtn.connect('clicked', () => {
      void app.init()
    })
    buttonBox.append(retryBtn)

    const settingsBtn = createPillButton('emblem-system-symbolic', 'Settings')
    settingsBtn.connect('clicked', () => {
      return showPreferencesWindow(app)
    })
    buttonBox.append(settingsBtn)

    statusPage.set_child(buttonBox)

    this._widget = statusPage
  }
}
