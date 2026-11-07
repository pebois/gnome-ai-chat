import Adw from 'gi://Adw?version=1'
import GObject from 'gi://GObject'
import WebKit from 'gi://WebKit?version=6.0'

import type { AppInterface } from '@/lib/app.js'

export class ArtifactWindow extends Adw.Window {
  private _app: AppInterface
  private _title: string
  private _webView: WebKit.WebView

  constructor(app: AppInterface, title: string, html: string) {
    super({
      title,
      default_width: 800,
      default_height: 600
    })
    this._app = app
    this._title = title

    this._webView = new WebKit.WebView()
    this._webView.load_html(html, null)

    const manager = Adw.StyleManager.get_default()
    this._syncTheme(manager.dark)
    const darkSignalId = manager.connect('notify::dark', () => {
      this._syncTheme(manager.dark)
    })

    const toolbarView = new Adw.ToolbarView()
    const headerBar = new Adw.HeaderBar()

    toolbarView.add_top_bar(headerBar)
    toolbarView.set_content(this._webView)

    this.set_content(toolbarView)

    this.connect('close-request', () => {
      manager.disconnect(darkSignalId)
      this._app.activeArtifacts.delete(this._title)
      return false
    })
  }

  private _syncTheme(isDark: boolean): void {
    const script = `document.documentElement.style.colorScheme = '${isDark ? 'dark' : 'light'}';`
    this._webView.evaluate_javascript(script, -1, null, null, null, null)
  }

  public update(title: string, html: string): void {
    if (this._title !== title) {
      this._app.activeArtifacts.delete(this._title)
      this._title = title
      this._app.activeArtifacts.set(title, this)
      this.set_title(title)
    }
    this._webView.load_html(html, null)
    this.present()
  }
}

GObject.registerClass({
  GTypeName: 'ArtifactWindow'
}, ArtifactWindow)
