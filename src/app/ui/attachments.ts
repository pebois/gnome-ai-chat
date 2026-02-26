import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/app/index.js'
import { takeScreenshot } from '@/lib/screenshot.js'
import { createMenuItem, createSimpleAction } from '@/lib/ui.js'

export class Attachments {
  private _app: AppInterface
  private _selectedImages: { name: string; base64: string }[] = []
  private _attachButton: Gtk.MenuButton
  private _attachmentsGroup: Gtk.Box
  private _attachmentsListButton: Gtk.MenuButton

  public get attachButton(): Gtk.MenuButton {
    return this._attachButton
  }

  public get attachmentsGroup(): Gtk.Box {
    return this._attachmentsGroup
  }

  public get attachmentsListButton(): Gtk.MenuButton {
    return this._attachmentsListButton
  }

  constructor(app: AppInterface) {
    this._app = app

    this._attachButton = new Gtk.MenuButton({
      icon_name: 'list-add-symbolic',
      tooltip_text: 'Attach',
      valign: Gtk.Align.CENTER
    })
    this._attachButton.add_css_class('circular')

    const attachMenu = new Gio.Menu()
    attachMenu.append_item(createMenuItem('Add Image', 'chat.add_image', 'image-x-generic-symbolic'))
    attachMenu.append_item(createMenuItem('Take Screenshot', 'chat.take_screenshot', 'camera-photo-symbolic'))
    this._attachButton.set_menu_model(attachMenu)

    const attachActionGroup = new Gio.SimpleActionGroup()
    attachActionGroup.add_action(createSimpleAction('add_image', () => {
      return this._handleAttachImage()
    }))

    attachActionGroup.add_action(createSimpleAction('take_screenshot', async () => {
      try {
        const file = await takeScreenshot()
        if (file) {
          this.addFile(file)
        }
      } catch (err) {
        console.error('Failed to take screenshot:', err)
        this._app.showToast('Failed to take screenshot', true)
      }
    }))

    attachActionGroup.add_action(createSimpleAction(
      'remove_attachment',
      (_action, parameter) => {
        if (parameter) {
          const index = parameter.get_int32()
          this._selectedImages.splice(index, 1)
          this._updateAttachmentsUI()
        }
      },
      new GLib.VariantType('i')
    ))

    attachActionGroup.add_action(createSimpleAction('clear_attachments', () => {
      return this.clear()
    }))

    this._attachButton.insert_action_group('chat', attachActionGroup)

    this._attachmentsGroup = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      visible: false
    })

    this._attachmentsListButton = new Gtk.MenuButton({
      icon_name: 'mail-attachment-symbolic',
      tooltip_text: 'View Attachments',
      valign: Gtk.Align.CENTER,
      always_show_arrow: true
    })
    this._attachmentsListButton.add_css_class('flat')
    this._attachmentsListButton.insert_action_group('chat', attachActionGroup)
    this._attachmentsGroup.append(this._attachmentsListButton)
  }

  public addResponsiveBreakpoints(breakpoint: Adw.Breakpoint): void {
    const falseValue = new GObject.Value()
    falseValue.init(GObject.TYPE_BOOLEAN)
    falseValue.set_boolean(false)
    breakpoint.add_setter(this._attachButton, 'always-show-arrow', falseValue)
    breakpoint.add_setter(this._attachmentsListButton, 'always-show-arrow', falseValue)
  }

  public get images(): string[] {
    return this._selectedImages.map((img) => {
      return img.base64
    })
  }

  public get hasImages(): boolean {
    return this._selectedImages.length > 0
  }

  public clear(): void {
    this._selectedImages = []
    this._updateAttachmentsUI()
  }

  private _handleAttachImage(): void {
    const dialog = new Gtk.FileChooserNative({
      title: 'Attach Image(s)',
      transient_for: this._app.window,
      action: Gtk.FileChooserAction.OPEN,
      accept_label: 'Attach',
      cancel_label: 'Cancel',
      select_multiple: true
    })

    const filter = new Gtk.FileFilter()
    filter.set_name('Images')
    filter.add_mime_type('image/png')
    filter.add_mime_type('image/jpeg')
    filter.add_mime_type('image/webp')
    dialog.add_filter(filter)

    dialog.connect('response', (_dialog, responseId) => {
      if (responseId === Gtk.ResponseType.ACCEPT) {
        const files = dialog.get_files()
        for (let i = 0; i < files.get_n_items(); i++) {
          const file = files.get_item(i) as Gio.File
          if (file) {
            this.addFile(file)
          }
        }
      }
      dialog.destroy()
    })

    dialog.show()
  }

  public addFile(file: Gio.File): void {
    file.query_info_async('standard::content-type', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (_src, res) => {
      try {
        const info = file.query_info_finish(res)
        const contentType = info.get_content_type()
        const isImage = contentType && (
          contentType === 'image/png'
          || contentType === 'image/jpeg'
          || contentType === 'image/webp'
        )

        if (!isImage) {
          return
        }

        file.load_contents_async(null, (_source_object, res) => {
          try {
            const [success, contents] = file.load_contents_finish(res)
            if (success && contents) {
              const base64 = GLib.base64_encode(contents)
              const name = file.get_basename() || 'image'
              this._selectedImages.push({ name, base64 })
              this._updateAttachmentsUI()
            }
          } catch (e) {
            console.error('Failed to load image:', e)
          }
        })
      } catch (e) {
        console.error('Failed to query file info:', e)
      }
    })
  }

  private _updateAttachmentsUI(): void {
    if (this._selectedImages.length === 0) {
      this._attachmentsGroup.set_visible(false)
      this._attachmentsListButton.set_menu_model(null)
      return
    }

    this._attachmentsGroup.set_visible(true)
    this._attachmentsListButton.set_tooltip_text(`${this._selectedImages.length} Attachment(s)`)

    const menu = new Gio.Menu()
    const imagesSection = new Gio.Menu()
    this._selectedImages.forEach((image, index) => {
      imagesSection.append_item(createMenuItem(
        `Remove ${image.name}`,
        'chat.remove_attachment',
        'window-close-symbolic',
        new GLib.Variant('i', index)
      ))
    })
    menu.append_section(null, imagesSection)

    const clearSection = new Gio.Menu()
    clearSection.append_item(createMenuItem('Clear All Attachments', 'chat.clear_attachments', 'edit-clear-all-symbolic'))
    menu.append_section(null, clearSection)

    this._attachmentsListButton.set_menu_model(menu)
  }
}
