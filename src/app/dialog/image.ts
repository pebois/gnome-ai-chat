import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import GdkPixbuf from 'gi://GdkPixbuf'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'

export function showImageDialog(app: AppInterface, images: string[], startIndex: number): void {
  const dialog = new Adw.Dialog({
    title: 'Image Preview',
    content_width: 800,
    content_height: 800
  })

  const toolbarView = new Adw.ToolbarView()
  const headerBar = new Adw.HeaderBar()
  headerBar.add_css_class('flat')
  toolbarView.add_top_bar(headerBar)

  const carousel = new Adw.Carousel({
    interactive: true,
    spacing: 0
  })

  const children: Gtk.Widget[] = []

  images.forEach((base64) => {
    try {
      const bytes = GLib.base64_decode(base64)
      const inputStream = Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes))
      const pixbuf = GdkPixbuf.Pixbuf.new_from_stream(inputStream, null)

      if (pixbuf) {
        const paintable = Gdk.Texture.new_for_pixbuf(pixbuf)
        const picture = new Gtk.Picture({
          paintable,
          can_shrink: true
        })

        const scrolled = new Gtk.ScrolledWindow({
          vexpand: true,
          hexpand: true,
          hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
          vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
        })
        scrolled.set_child(picture)

        carousel.append(scrolled)
        children.push(scrolled)
      }
    } catch (e) {
      console.error('Failed to render preview image:', e)
    }
  })

  const indicators = new Adw.CarouselIndicatorDots({
    carousel: carousel,
    margin_top: 12,
    margin_bottom: 12,
    halign: Gtk.Align.CENTER
  })

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    vexpand: true,
    hexpand: true
  })
  box.append(carousel)
  box.append(indicators)

  toolbarView.set_content(box)
  dialog.set_child(toolbarView)

  const keyCtrl = new Gtk.EventControllerKey()
  keyCtrl.connect('key-pressed', (_controller, keyval) => {
    const n = carousel.get_n_pages()
    const index = Math.round(carousel.get_position())
    if (keyval === Gdk.KEY_Left) {
      if (index > 0) {
        carousel.scroll_to(children[index - 1], true)
      }
      return true
    } else if (keyval === Gdk.KEY_Right) {
      if (index < n - 1) {
        carousel.scroll_to(children[index + 1], true)
      }
      return true
    }
    return false
  })
  dialog.add_controller(keyCtrl)

  dialog.present(app.window)

  if (startIndex >= 0 && startIndex < children.length) {
    carousel.scroll_to(children[startIndex], false)
  }
}
