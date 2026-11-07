import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { createPillButton } from '@/lib/ui.js'

export class EmptyPage {
  private _widget: Gtk.Widget

  public get widget(): Gtk.Widget {
    return this._widget
  }

  constructor(app: AppInterface, props?: Partial<Adw.StatusPage.ConstructorProps>, onRefresh?: () => void) {
    const statusPage = new Adw.StatusPage(props)

    if (onRefresh) {
      const refreshBtn = createPillButton('view-refresh-symbolic', 'Refresh', true)
      refreshBtn.halign = Gtk.Align.CENTER
      refreshBtn.connect('clicked', () => {
        onRefresh()
      })
      statusPage.set_child(refreshBtn)
    }

    this._widget = statusPage
  }
}
