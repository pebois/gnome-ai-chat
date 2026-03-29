import Gdk from 'gi://Gdk'
import GdkPixbuf from 'gi://GdkPixbuf'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import { DEFAULT_SPACING } from '@/lib/constants.js'

export class Images {
  private _widget: Gtk.Box

  public get widget(): Gtk.Box {
    return this._widget
  }

  constructor(images: string[], role: string) {
    this._widget = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: DEFAULT_SPACING,
      halign: role === 'user' ? Gtk.Align.END : Gtk.Align.START
    })

    images.forEach((base64) => {
      try {
        const bytes = GLib.base64_decode(base64)
        const inputStream = Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes))
        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream(inputStream, null)
        if (pixbuf) {
          const width = pixbuf.get_width()
          const height = pixbuf.get_height()
          const aspectRatio = width / height
          const reqWidth = 250
          const reqHeight = Math.round(reqWidth / aspectRatio)

          const scaledPixbuf = pixbuf.scale_simple(reqWidth, reqHeight, GdkPixbuf.InterpType.BILINEAR)
          if (!scaledPixbuf) {
            throw new Error('Failed to scale image')
          }

          const paintable = Gdk.Texture.new_for_pixbuf(scaledPixbuf)
          const picture = new Gtk.Picture({
            paintable,
            can_shrink: false
          })
          picture.add_css_class('message-image')
          picture.set_overflow(Gtk.Overflow.HIDDEN)

          const canvas = new Gtk.Box({
            halign: role === 'user' ? Gtk.Align.END : Gtk.Align.START
          })
          canvas.add_css_class('message-canvas')
          canvas.append(picture)

          this._widget.append(canvas)
        }
      } catch (e) {
        console.error('Failed to render image:', e)
      }
    })
  }
}
