import Gdk from 'gi://Gdk'
import GdkPixbuf from 'gi://GdkPixbuf'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

export interface PhotoOptions {
  base64: string
  scaled?: boolean
  canShrink?: boolean
  halign?: Gtk.Align
  valign?: Gtk.Align
}

export class Photo {
  private _widget: Gtk.Picture | null = null

  public get widget(): Gtk.Picture | null {
    return this._widget
  }

  constructor(options: PhotoOptions) {
    try {
      const bytes = GLib.base64_decode(options.base64)
      const inputStream = Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes))
      const pixbuf = GdkPixbuf.Pixbuf.new_from_stream(inputStream, null)

      if (pixbuf) {
        let finalPixbuf = pixbuf

        if (options.scaled) {
          const width = pixbuf.get_width()
          const height = pixbuf.get_height()
          const aspectRatio = width / height
          const reqWidth = 250
          const reqHeight = Math.round(reqWidth / aspectRatio)

          const scaledPixbuf = pixbuf.scale_simple(reqWidth, reqHeight, GdkPixbuf.InterpType.BILINEAR)
          if (!scaledPixbuf) {
            throw new Error('Failed to scale image')
          }
          finalPixbuf = scaledPixbuf
        }

        const paintable = Gdk.Texture.new_for_pixbuf(finalPixbuf)
        this._widget = new Gtk.Picture({
          paintable,
          can_shrink: options.canShrink ?? true,
          halign: options.halign ?? Gtk.Align.FILL,
          valign: options.valign ?? Gtk.Align.FILL
        })
      }
    } catch (e) {
      console.error('Failed to render photo:', e)
    }
  }
}
