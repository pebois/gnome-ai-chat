import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { formatModelName, selectDefaultModel } from '@/lib/utils.js'

export class Models {
  private _app: AppInterface
  private _modelsDropDown: Gtk.DropDown

  public get modelsDropDown(): Gtk.DropDown {
    return this._modelsDropDown
  }

  constructor(app: AppInterface) {
    this._app = app

    this._modelsDropDown = new Gtk.DropDown({
      valign: Gtk.Align.CENTER
    })

    const child = this._modelsDropDown.get_first_child()
    if (child && child instanceof Gtk.Button) {
      child.add_css_class('flat')
    }

    const selectedFactory = new Gtk.SignalListItemFactory()
    selectedFactory.connect('setup', (_factory, listItem: Gtk.ListItem) => {
      listItem.set_child(new Gtk.Label({ halign: Gtk.Align.START }))
    })
    selectedFactory.connect('bind', (_factory, listItem: Gtk.ListItem) => {
      const label = listItem.get_child() as Gtk.Label
      const item = listItem.get_item()
      if (item instanceof Gtk.StringObject) {
        label.set_label(formatModelName(item.get_string()))
      }
    })
    this._modelsDropDown.set_factory(selectedFactory)

    const listFactory = new Gtk.SignalListItemFactory()
    listFactory.connect('setup', (_factory, listItem: Gtk.ListItem) => {
      listItem.set_child(new Gtk.Label({ halign: Gtk.Align.START }))
    })
    listFactory.connect('bind', (_factory, listItem: Gtk.ListItem) => {
      const label = listItem.get_child() as Gtk.Label
      const item = listItem.get_item()
      if (item instanceof Gtk.StringObject) {
        const model = item.get_string()
        label.set_label(model)

        if (!this._app.toolModels.includes(model)) {
          listItem.set_selectable(false)
          label.add_css_class('dim-label')
        } else {
          listItem.set_selectable(true)
          label.remove_css_class('dim-label')
        }
      }
    })
    this._modelsDropDown.set_list_factory(listFactory)

    this._modelsDropDown.connect('notify::selected-item', () => {
      const selected = this._modelsDropDown.get_selected_item<Gtk.StringObject>()
      if (selected) {
        this._app.setModel(selected.get_string())
      }
    })
  }

  public load(): void {
    if (this._app.models.length > 0) {
      const stringList = Gtk.StringList.new(this._app.models)
      this._modelsDropDown.set_model(stringList)
    }
    let model = selectDefaultModel(this._app.models)
    if (!this._app.toolModels.includes(model) && this._app.toolModels.length > 0) {
      model = this._app.toolModels[0]
    }
    this._app.setModel(model)
    const index = this._app.models.indexOf(model)
    if (index !== -1) {
      this._modelsDropDown.set_selected(index)
    }
  }

  public select(model: string): void {
    if (this._app.models.includes(model)) {
      this._app.setModel(model)
      this._modelsDropDown.set_selected(this._app.models.indexOf(model))
    }
  }
}
