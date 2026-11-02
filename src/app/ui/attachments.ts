import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { takeScreenshot } from '@/lib/screenshot.js'
import { createMenuItem, createSimpleAction } from '@/lib/ui.js'

type Attachment
  = | { type: 'image'; name: string; base64: string }
    | { type: 'text'; name: string; content: string }

export class Attachments {
  private _app: AppInterface
  private _attachments: Attachment[] = []
  private _attachButton: Gtk.MenuButton
  private _attachmentsGroup: Gtk.Box
  private _attachmentsListButton: Gtk.MenuButton
  private _addPictureAction: Gio.SimpleAction
  private _takeScreenshotAction: Gio.SimpleAction

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
    attachMenu.append_item(createMenuItem('Add Picture', 'chat.add_picture', 'image-x-generic-symbolic'))
    attachMenu.append_item(createMenuItem('Add Text', 'chat.add_text', 'document-open-symbolic'))
    attachMenu.append_item(createMenuItem('Take Screenshot', 'chat.take_screenshot', 'camera-photo-symbolic'))
    this._attachButton.set_menu_model(attachMenu)

    const attachActionGroup = new Gio.SimpleActionGroup()
    this._addPictureAction = createSimpleAction('add_picture', () => {
      return this._handleAttachPicture()
    })
    attachActionGroup.add_action(this._addPictureAction)

    attachActionGroup.add_action(createSimpleAction('add_text', () => {
      return this._handleAttachText()
    }))

    this._takeScreenshotAction = createSimpleAction('take_screenshot', async () => {
      try {
        const file = await takeScreenshot()
        if (file) {
          this.addFile(file)
        }
      } catch (err) {
        console.error('Failed to take screenshot:', err)
        this._app.showToast('Failed to take screenshot', true)
      }
    })
    attachActionGroup.add_action(this._takeScreenshotAction)

    attachActionGroup.add_action(createSimpleAction(
      'remove_attachment',
      (_action, parameter) => {
        if (parameter) {
          const index = parameter.get_int32()
          this._attachments.splice(index, 1)
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

    this._app.connect('capabilities-changed', () => {
      this._updateCapabilities()
    })
    this._updateCapabilities()
  }

  private _updateCapabilities(): void {
    this._addPictureAction.set_enabled(this._app.supportsVision)
    this._takeScreenshotAction.set_enabled(this._app.supportsVision)

    if (!this._app.supportsVision) {
      const initialLength = this._attachments.length
      this._attachments = this._attachments.filter((a) => {
        return a.type !== 'image'
      })
      if (this._attachments.length !== initialLength) {
        this._updateAttachmentsUI()
        this._app.showToast('Removed image attachments as the selected model does not support vision', true)
      }
    }
  }

  public addResponsiveBreakpoints(breakpoint: Adw.Breakpoint): void {
    const falseValue = new GObject.Value()
    falseValue.init(GObject.TYPE_BOOLEAN)
    falseValue.set_boolean(false)
    breakpoint.add_setter(this._attachButton, 'always-show-arrow', falseValue)
    breakpoint.add_setter(this._attachmentsListButton, 'always-show-arrow', falseValue)
  }

  public get images(): string[] {
    return this._attachments
      .filter((a): a is Extract<Attachment, { type: 'image' }> => {
        return a.type === 'image'
      })
      .map((a) => {
        return a.base64
      })
  }

  public get textFiles(): { name: string; content: string }[] {
    return this._attachments
      .filter((a): a is Extract<Attachment, { type: 'text' }> => {
        return a.type === 'text'
      })
      .map((a) => {
        return { name: a.name, content: a.content }
      })
  }

  public get hasAttachments(): boolean {
    return this._attachments.length > 0
  }

  public clear(): void {
    this._attachments = []
    this._updateAttachmentsUI()
  }

  public restore(files?: { name: string; content: string }[], images?: string[]): void {
    this._attachments = [
      ...(files ?? []).map((f): Attachment => {
        return { type: 'text', name: f.name, content: f.content }
      }),
      ...(images ?? []).map((base64, i): Attachment => {
        return { type: 'image', name: `Image ${i + 1}`, base64 }
      })
    ]
    this._updateAttachmentsUI()
  }

  private _openFileChooser(title: string, filter: Gtk.FileFilter): void {
    const dialog = new Gtk.FileChooserNative({
      title,
      transient_for: this._app.window,
      action: Gtk.FileChooserAction.OPEN,
      accept_label: 'Attach',
      cancel_label: 'Cancel',
      select_multiple: true
    })
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

  private _handleAttachPicture(): void {
    const filter = new Gtk.FileFilter()
    filter.set_name('Images')
    filter.add_mime_type('image/png')
    filter.add_mime_type('image/jpeg')
    filter.add_mime_type('image/webp')
    this._openFileChooser('Attach Picture(s)', filter)
  }

  private _handleAttachText(): void {
    const filter = new Gtk.FileFilter()
    filter.set_name('Text Files')
    filter.add_mime_type('text/plain')
    filter.add_mime_type('text/markdown')
    filter.add_mime_type('text/csv')
    filter.add_mime_type('text/html')
    filter.add_mime_type('text/xml')
    filter.add_mime_type('application/json')
    filter.add_mime_type('application/javascript')
    filter.add_mime_type('application/typescript')
    this._openFileChooser('Attach Text File(s)', filter)
  }

  public addFile(file: Gio.File): void {
    file.query_info_async('standard::content-type', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (_src, res) => {
      try {
        const info = file.query_info_finish(res)
        const contentType = info.get_content_type() ?? ''
        const isImage = contentType === 'image/png' || contentType === 'image/jpeg' || contentType === 'image/webp'
        const isText = contentType.startsWith('text/')
          || contentType === 'application/json'
          || contentType === 'application/javascript'
          || contentType === 'application/typescript'

        if (!isImage && !isText) {
          return
        }

        if (isImage && !this._app.supportsVision) {
          this._app.showToast('Selected model does not support vision', true)
          return
        }

        file.load_contents_async(null, (_source_object, result) => {
          try {
            const [success, contents] = file.load_contents_finish(result)
            if (!success || !contents) {
              return
            }
            const name = file.get_basename() || 'file'
            if (isImage) {
              this._attachments.push({ type: 'image', name, base64: GLib.base64_encode(contents) })
            } else {
              this._attachments.push({ type: 'text', name, content: new TextDecoder().decode(contents) })
            }
            this._updateAttachmentsUI()
          } catch (e) {
            console.error('Failed to load file:', e)
          }
        })
      } catch (e) {
        console.error('Failed to query file info:', e)
      }
    })
  }

  private _updateAttachmentsUI(): void {
    if (this._attachments.length === 0) {
      this._attachmentsGroup.set_visible(false)
      this._attachmentsListButton.set_menu_model(null)
      return
    }

    this._attachmentsGroup.set_visible(true)
    this._attachmentsListButton.set_tooltip_text(`${this._attachments.length} Attachment(s)`)

    const menu = new Gio.Menu()
    const imagesSection = new Gio.Menu()
    this._attachments.forEach((attachment, index) => {
      imagesSection.append_item(createMenuItem(
        `Remove ${attachment.name}`,
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
