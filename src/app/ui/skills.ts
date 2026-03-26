import Gdk from 'gi://Gdk'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/app/index.js'

export class Skills {
  private _app: AppInterface
  private _textView: Gtk.TextView
  private _parent: Gtk.Widget
  private _popover!: Gtk.Popover
  private _listBox!: Gtk.ListBox
  private _matches: { name: string; prompt: string }[] = []

  constructor(app: AppInterface, textView: Gtk.TextView, parent: Gtk.Widget) {
    this._app = app
    this._textView = textView
    this._parent = parent

    this._setup()
  }

  private _setup(): void {
    this._popover = new Gtk.Popover({
      position: Gtk.PositionType.TOP,
      has_arrow: false,
      autohide: true
    })
    this._popover.set_parent(this._parent)
    this._popover.set_halign(Gtk.Align.START)
    this._popover.add_css_class('menu')

    this._popover.connect('closed', () => {
      this._textView.grab_focus()
    })

    this._listBox = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.SINGLE
    })
    this._listBox.add_css_class('command-list')

    const listKeyCtrl = new Gtk.EventControllerKey()
    listKeyCtrl.connect('key-pressed', (_ctrl, keyval) => {
      const isNav = [
        Gdk.KEY_Up, Gdk.KEY_Down, Gdk.KEY_Page_Up, Gdk.KEY_Page_Down,
        Gdk.KEY_Home, Gdk.KEY_End, Gdk.KEY_Tab, Gdk.KEY_ISO_Left_Tab,
        Gdk.KEY_Return, Gdk.KEY_KP_Enter, Gdk.KEY_Escape
      ].includes(keyval)

      if (!isNav) {
        const buffer = this._textView.get_buffer()

        if (keyval === Gdk.KEY_BackSpace) {
          const cursor = buffer.get_iter_at_mark(buffer.get_insert())
          const prev = cursor.copy()
          if (prev.backward_cursor_position()) {
            buffer.delete(prev, cursor)
          }
          return true
        }

        const unicode = Gdk.keyval_to_unicode(keyval)
        if (unicode !== 0) {
          const char = String.fromCodePoint(unicode)
          buffer.insert_at_cursor(char, -1)
          return true
        }

        return false
      }

      return this.handleKeyPress(keyval)
    })
    this._listBox.add_controller(listKeyCtrl)

    const scrolledWindow = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      max_content_height: 250,
      propagate_natural_height: true
    })
    scrolledWindow.set_child(this._listBox)
    this._popover.set_child(scrolledWindow)

    const buffer = this._textView.get_buffer()
    buffer.connect('changed', () => {
      const cursor = buffer.get_iter_at_mark(buffer.get_insert())
      const start = cursor.copy()
      start.set_line_offset(0)
      const lineText = buffer.get_text(start, cursor, false)

      const lastWordMatch = lineText.match(/(?:^|\s)(@[^\s]*)$/)
      if (lastWordMatch) {
        this._updateList(lastWordMatch[1].slice(1).toLowerCase())
      } else if (this._popover.get_visible()) {
        this._popover.popdown()
      }
    })

    this._listBox.connect('row-activated', (_list, row) => {
      const index = row.get_index()
      const selected = this._matches[index]
      if (selected) {
        this._complete(selected.name)
        this.execute(selected)
      }
    })
  }

  public isVisible(): boolean {
    return this._popover.get_visible()
  }

  public execute(skill: { name: string; prompt: string }): void {
    this._popover.popdown()

    if (this._app.conversation) {
      this._app.conversation.system = skill.prompt
      this._app.storage.saveConversations(this._app.conversations)
      this._app.showToast(`Persona updated to: ${skill.name}`)
    }

    const buffer = this._textView.get_buffer()
    const cursor = buffer.get_iter_at_mark(buffer.get_insert())
    const start = cursor.copy()
    start.set_line_offset(0)
    const lineText = buffer.get_text(start, cursor, false)

    // Replace the @skill part.
    const lastMatch = lineText.match(/(?:^|\s)(@[^\s]*)$/)
    if (lastMatch) {
      const matchText = lastMatch[1]
      const matchIndex = lineText.lastIndexOf(matchText)

      const replaceStart = start.copy()
      replaceStart.forward_chars(matchIndex)

      buffer.delete(replaceStart, cursor)
    }

    this._textView.grab_focus()
  }

  public handleKeyPress(keyval: number): boolean {
    if (!this.isVisible()) {
      return false
    }

    const selectedRow = this._listBox.get_selected_row()
    let index = selectedRow ? selectedRow.get_index() : -1

    const isUp = keyval === Gdk.KEY_Up
    const isDown = keyval === Gdk.KEY_Down
    const isPageUp = keyval === Gdk.KEY_Page_Up
    const isPageDown = keyval === Gdk.KEY_Page_Down
    const isHome = keyval === Gdk.KEY_Home
    const isEnd = keyval === Gdk.KEY_End
    const isReturn = keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter
    const isEscape = keyval === Gdk.KEY_Escape
    const isTab = keyval === Gdk.KEY_Tab || keyval === Gdk.KEY_ISO_Left_Tab

    if (isUp) {
      index = index <= 0 ? this._matches.length - 1 : index - 1
    } else if (isDown) {
      index = index >= this._matches.length - 1 ? 0 : index + 1
    } else if (isPageUp) {
      index = Math.max(0, index - 5)
    } else if (isPageDown) {
      index = Math.min(this._matches.length - 1, index + 5)
    } else if (isHome) {
      index = 0
    } else if (isEnd) {
      index = this._matches.length - 1
    } else if (isTab || isReturn) {
      if (selectedRow) {
        const selected = this._matches[index]
        if (selected) {
          this._complete(selected.name)
          if (isReturn) {
            this.execute(selected)
          }
          return true
        }
      }
      return true
    } else if (isEscape) {
      this._popover.popdown()
      return true
    }

    const row = this._listBox.get_row_at_index(index)
    if (row) {
      this._listBox.select_row(row)
      row.grab_focus()
    }
    return true
  }

  private _complete(skillName: string): void {
    const buffer = this._textView.get_buffer()
    const cursor = buffer.get_iter_at_mark(buffer.get_insert())
    const start = cursor.copy()
    start.set_line_offset(0)
    const lineText = buffer.get_text(start, cursor, false)

    const lastMatch = lineText.match(/(?:^|\s)(@[^\s]*)$/)
    if (lastMatch) {
      const matchText = lastMatch[1]
      const matchIndex = lineText.lastIndexOf(matchText)

      const replaceStart = start.copy()
      replaceStart.forward_chars(matchIndex)

      buffer.delete(replaceStart, cursor)
      buffer.insert(replaceStart, `@${skillName} `, -1)
    }
  }

  private _updateList(filterText: string): void {
    const skills = this._app.settings.skills || []
    const matches = skills.filter((skill) => {
      return skill.name.toLowerCase().startsWith(filterText)
    })

    if (matches.length === 0) {
      this._popover.popdown()
      return
    }

    const matchesChanged = matches.length !== this._matches.length
      || matches.some((m, i) => {
        return m.name !== this._matches[i]?.name
      })

    if (matchesChanged) {
      this._matches = matches
      let child
      while ((child = this._listBox.get_first_child())) {
        this._listBox.remove(child)
      }

      this._matches.forEach(() => {
        const box = new Gtk.Box({
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 6,
          margin_top: 6,
          margin_bottom: 6,
          margin_start: 6,
          margin_end: 6
        })

        const icon = new Gtk.Image({
          icon_name: 'avatar-default-symbolic',
          pixel_size: 16
        })
        icon.add_css_class('dim-label')

        const titleLabel = new Gtk.Label({
          halign: Gtk.Align.START,
          use_markup: true
        })
        box.append(icon)
        box.append(titleLabel)

        const row = new Gtk.ListBoxRow({
          child: box,
          activatable: true,
          selectable: true
        })

        const rowHoverCtrl = new Gtk.EventControllerMotion()
        rowHoverCtrl.connect('enter', () => {
          this._listBox.select_row(row)
        })
        row.add_controller(rowHoverCtrl)

        this._listBox.append(row)
      })
    }

    this._matches.forEach((skill, i) => {
      const row = this._listBox.get_row_at_index(i)
      if (row) {
        const box = row.get_child() as Gtk.Box
        const titleLabel = box.get_first_child()?.get_next_sibling() as Gtk.Label
        if (titleLabel) {
          const name = skill.name
          const filterLower = filterText.toLowerCase()
          const highlighted = filterLower.length > 0
            ? `<b>${name.slice(0, filterLower.length)}</b>${name.slice(filterLower.length)}`
            : name
          titleLabel.set_markup(highlighted)
        }
      }
    })

    const firstRow = this._listBox.get_row_at_index(0)
    if (firstRow) {
      this._listBox.select_row(firstRow)
      firstRow.grab_focus()
    }

    const width = Math.max(this._parent.get_allocated_width(), 200)
    const rect = new Gdk.Rectangle({ x: 0, y: 0, width, height: 0 })
    this._popover.set_pointing_to(rect)

    if (!this._popover.get_visible()) {
      this._popover.popup()
    }
  }
}
