import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gtk from 'gi://Gtk?version=4.0'

import { Photo } from '@/app/ui/photo.js'
import type { AppInterface } from '@/lib/app.js'
import { downloadImage } from '@/lib/ui.js'

export function showImageDialog(app: AppInterface, images: string[], startIndex: number): void {
  const dialog = new Adw.Dialog({
    title: 'Image Preview',
    content_width: 800,
    content_height: 800
  })

  const toolbarView = new Adw.ToolbarView({
    top_bar_style: Adw.ToolbarStyle.RAISED
  })
  const headerBar = new Adw.HeaderBar()

  const downloadBtn = new Gtk.Button({
    icon_name: 'document-save-symbolic',
    tooltip_text: 'Download Image'
  })

  downloadBtn.connect('clicked', () => {
    const index = Math.round(carousel.get_position())
    const base64 = images[index]
    downloadImage(app.window, base64)
  })

  headerBar.pack_start(downloadBtn)

  const carousel = new Adw.Carousel({
    interactive: true,
    spacing: 0,
    vexpand: true,
    hexpand: true
  })

  const children: Gtk.Widget[] = []

  images.forEach((base64) => {
    const photo = new Photo({
      base64,
      canShrink: true,
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER
    })

    if (photo.widget) {
      const scrolled = new Gtk.ScrolledWindow({
        vexpand: true,
        hexpand: true,
        hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
      })
      scrolled.set_child(photo.widget)

      carousel.append(scrolled)
      children.push(scrolled)
    }
  })

  if (images.length > 1) {
    const indicators = new Adw.CarouselIndicatorDots({
      carousel
    })
    headerBar.set_title_widget(indicators)
  }

  toolbarView.add_top_bar(headerBar)

  const overlay = new Gtk.Overlay({
    vexpand: true,
    hexpand: true
  })
  overlay.set_child(carousel)

  toolbarView.set_content(overlay)
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
