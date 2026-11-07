import Adw from 'gi://Adw?version=1'

import { createAdvancedPage } from '@/app/window/preferences/advanced.js'
import { createAppearancePage } from '@/app/window/preferences/appearance.js'
import { DataPage } from '@/app/window/preferences/data.js'
import { createGeneralPage } from '@/app/window/preferences/general.js'
import { createPermissionsPage } from '@/app/window/preferences/permissions.js'
import { createPromptPage } from '@/app/window/preferences/prompt.js'
import { createToolsPage } from '@/app/window/preferences/tools.js'
import type { AppInterface } from '@/lib/app.js'

export class Preferences {
  private _app: AppInterface
  private _window: Adw.PreferencesDialog

  constructor(app: AppInterface) {
    this._app = app
    this._window = new Adw.PreferencesDialog({
      title: 'Settings',
      content_width: 600,
      content_height: 600,
      search_enabled: true
    })

    this._window.add(createGeneralPage(this._app))
    this._window.add(createAppearancePage(this._app))
    this._window.add(createPromptPage(this._app, this._window))
    this._window.add(createToolsPage(this._app))
    this._window.add(createPermissionsPage(this._app))
    this._window.add(createAdvancedPage(this._app))
    this._window.add(new DataPage(this._app, this._window).page)
  }

  public show(): void {
    this._window.present(this._app.window)
  }
}

export function showPreferencesWindow(app: AppInterface): void {
  const preferences = new Preferences(app)
  preferences.show()
}
