import Gdk from 'gi://Gdk'
import Gtk from 'gi://Gtk?version=4.0'

import { showImageDialog } from '@/app/dialog/image.js'
import { Photo } from '@/app/ui/photo.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_SPACING } from '@/lib/constants.js'

export class Images {
  private _widget: Gtk.Box

  public get widget(): Gtk.Box {
    return this._widget
  }

  constructor(app: AppInterface, images: string[], role: string) {
    this._widget = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: DEFAULT_SPACING,
      halign: role === 'user' ? Gtk.Align.END : Gtk.Align.START
    })

    images.forEach((base64, index) => {
      const photo = new Photo({
        base64,
        scaled: true,
        canShrink: false
      })

      if (photo.widget) {
        const picture = photo.widget
        picture.add_css_class('message-image')
        picture.set_overflow(Gtk.Overflow.HIDDEN)

        const canvas = new Gtk.Box({
          halign: role === 'user' ? Gtk.Align.END : Gtk.Align.START
        })
        canvas.add_css_class('message-canvas')
        canvas.append(picture)
        canvas.set_cursor(Gdk.Cursor.new_from_name('pointer', null))

        const gesture = new Gtk.GestureClick()
        gesture.connect('pressed', () => {
          showImageDialog(app, images, index)
        })
        canvas.add_controller(gesture)

        this._widget.append(canvas)
      }
    })
  }
}
