import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

export class LoadingPage {
  private _widget: Gtk.Widget

  public get widget(): Gtk.Widget {
    return this._widget
  }

  constructor() {
    const statusPage = new Adw.StatusPage({
      icon_name: 'chat-message-new-symbolic',
      title: 'Starting Gnome AI Chat',
      vexpand: true
    })

    const spinner = new Adw.Spinner({
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER,
      width_request: 44,
      height_request: 44
    })
    statusPage.set_child(spinner)

    this._widget = statusPage
  }
}
