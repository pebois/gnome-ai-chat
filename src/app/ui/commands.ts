import Gdk from 'gi://Gdk'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { type Command, COMMANDS, type SubCommand } from '@/lib/commands/index.js'
import { pangoEscape } from '@/lib/parser.js'

export class Commands {
  private _app: AppInterface
  private _textView: Gtk.TextView
  private _parent: Gtk.Widget
  private _popover!: Gtk.Popover
  private _listBox!: Gtk.ListBox
  private _matches: { name: string; title: string; description: string; icon: string }[] = []
  private _currentCommand: Command | null = null
  private _currentSubCommand: SubCommand | null = null
  private _updateId = 0
  private _isExecuting = false

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
      if (this._isExecuting) {
        return
      }

      const cursor = buffer.get_iter_at_mark(buffer.get_insert())
      const start = cursor.copy()
      start.set_line_offset(0)
      const lineText = buffer.get_text(start, cursor, false)

      if (lineText.startsWith('/')) {
        this._updateList(lineText)
      } else if (this._popover.get_visible()) {
        this._popover.popdown()
      }
    })

    this._listBox.connect('row-activated', (_list, row) => {
      const index = row.get_index()
      const selected = this._matches[index]
      if (selected) {
        if (this._currentSubCommand) {
          this._isExecuting = true
          this._complete(selected.name)
          this.execute(`${this._currentCommand!.name} ${this._currentSubCommand.name} ${selected.name}`)
        } else if (this._currentCommand && this._currentCommand.subCommands?.some((s) => {
          return s.name === selected.name
        })) {
          const subCmd = this._currentCommand.subCommands.find((s) => {
            return s.name === selected.name
          })
          if (subCmd?.getDynamicMatches || subCmd?.requiresArgument) {
            this._complete(selected.name)
            this._updateList(`/${this._currentCommand.name} ${selected.name} `)
          } else {
            this._isExecuting = true
            this._complete(selected.name)
            this.execute(`${this._currentCommand.name} ${selected.name}`)
          }
        } else {
          const cmd = COMMANDS.find((c) => {
            return c.name === selected.name
          })
          if (cmd?.subCommands) {
            this._complete(selected.name)
            this._updateList(`/${cmd.name} `)
          } else {
            this._isExecuting = true
            this._complete(selected.name)
            this.execute(selected.name)
          }
        }
      }
    })
  }

  public isVisible(): boolean {
    return this._popover.get_visible()
  }

  public execute(commandPath: string): void {
    this._isExecuting = true
    this._updateId++
    this._popover.popdown()
    this._matches = []
    let child
    while ((child = this._listBox.get_first_child())) {
      this._listBox.remove(child)
    }

    const parts = commandPath.split(' ')
    const commandName = parts[0]
    const cmd = COMMANDS.find((c) => {
      return c.name === commandName
    })

    let parameter: GLib.Variant | undefined
    if (cmd?.parameterType) {
      parameter = GLib.Variant.new_string(commandPath)
    }

    this._app.activateAction(commandName, parameter)

    const buffer = this._textView.get_buffer()
    const start = buffer.get_start_iter()
    const end = buffer.get_end_iter()
    buffer.delete(start, end)
    this._textView.grab_focus()
    this._isExecuting = false
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
          if (this._currentSubCommand) {
            if (isReturn) {
              this._isExecuting = true
              this._complete(selected.name)
              this.execute(`${this._currentCommand!.name} ${this._currentSubCommand.name} ${selected.name}`)
            } else {
              this._complete(selected.name)
            }
          } else {
            if (isReturn) {
              if (this._currentCommand && this._currentCommand.subCommands?.some((s) => {
                return s.name === selected.name
              })) {
                const subCmd = this._currentCommand.subCommands.find((s) => {
                  return s.name === selected.name
                })
                if (subCmd?.getDynamicMatches || subCmd?.requiresArgument) {
                  this._complete(selected.name)
                  this._updateList(`/${this._currentCommand.name} ${selected.name} `)
                } else {
                  this._isExecuting = true
                  this._complete(selected.name)
                  this.execute(`${this._currentCommand.name} ${selected.name}`)
                }
              } else {
                const cmd = COMMANDS.find((c) => {
                  return c.name === selected.name
                })
                if (cmd?.subCommands) {
                  this._complete(selected.name)
                  this._updateList(`/${cmd.name} `)
                } else {
                  this._isExecuting = true
                  this._complete(selected.name)
                  this.execute(selected.name)
                }
              }
            } else {
              this._complete(selected.name)
            }
          }
          return true
        }
      }
      return true
    } else if (isEscape) {
      this._popover.popdown()
      return true
    } else {
      return false
    }

    const row = this._listBox.get_row_at_index(index)
    if (row) {
      this._listBox.select_row(row)
      row.grab_focus()
    }
    return true
  }

  private _complete(name: string): void {
    const buffer = this._textView.get_buffer()
    const cursor = buffer.get_iter_at_mark(buffer.get_insert())
    const start = cursor.copy()
    start.set_line_offset(0)

    buffer.delete(start, cursor)
    if (this._currentSubCommand) {
      buffer.insert(start, `/${this._currentCommand!.name} ${this._currentSubCommand.name} ${name} `, -1)
    } else if (this._currentCommand) {
      buffer.insert(start, `/${this._currentCommand.name} ${name} `, -1)
    } else {
      buffer.insert(start, `/${name} `, -1)
    }
  }

  private _updateList(lineText: string): void {
    let filterText = lineText.startsWith('/') ? lineText.slice(1).toLowerCase() : lineText.toLowerCase()
    let matches: { name: string; title: string; description: string; icon: string }[] = []
    this._currentCommand = null
    this._currentSubCommand = null

    const parts = filterText.split(' ')
    if (parts.length > 1) {
      const baseCmdName = parts[0]
      const subFilter = parts.slice(1).join(' ')
      const baseCmd = COMMANDS.find((c) => {
        return c.name === baseCmdName && c.visible !== false
      })
      if (baseCmd && baseCmd.subCommands) {
        this._currentCommand = baseCmd

        const activeSubCmd = baseCmd.subCommands.find((sub) => {
          return subFilter.startsWith(`${sub.name} `)
        })

        if (activeSubCmd && activeSubCmd.getDynamicMatches) {
          this._currentSubCommand = activeSubCmd
          const query = subFilter.slice(activeSubCmd.name.length + 1).trim()
          this._loadDynamicMatches(activeSubCmd, query, filterText)
          return
        }

        matches = baseCmd.subCommands
          .filter((sub) => {
            return sub.name.startsWith(subFilter)
          })
          .map((sub) => {
            return {
              name: sub.name,
              title: sub.name,
              description: sub.description,
              icon: sub.icon
            }
          })
        filterText = subFilter
      }
    } else {
      matches = COMMANDS.filter((cmd) => {
        return cmd.visible !== false && cmd.name.startsWith(filterText)
      }).map((cmd) => {
        return {
          name: cmd.name,
          title: cmd.name,
          description: cmd.description,
          icon: cmd.icon
        }
      })
    }

    this._renderMatches(matches, filterText)
  }

  private _loadDynamicMatches(subCmd: SubCommand, query: string, filterText: string): void {
    const updateId = ++this._updateId
    if (!subCmd.getDynamicMatches) {
      return
    }

    void subCmd.getDynamicMatches(this._app, query).then((matches) => {
      if (this._updateId !== updateId) {
        return
      }
      this._renderMatches(matches, filterText)
    }).catch((err) => {
      console.error(err)
    })
  }

  private _renderMatches(matches: { name: string; title: string; description: string; icon: string }[], filterText: string): void {
    if (matches.length === 0) {
      this._matches = []
      let child
      while ((child = this._listBox.get_first_child())) {
        this._listBox.remove(child)
      }

      if (this._currentSubCommand) {
        const box = new Gtk.Box({
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 6,
          margin_top: 6,
          margin_bottom: 6,
          margin_start: 6,
          margin_end: 6
        })

        const icon = new Gtk.Image({
          icon_name: 'edit-find-symbolic',
          pixel_size: 16
        })
        icon.add_css_class('dim-label')

        const label = new Gtk.Label({
          label: 'No matches found',
          halign: Gtk.Align.START
        })
        label.add_css_class('dim-label')

        box.append(icon)
        box.append(label)

        const row = new Gtk.ListBoxRow({
          child: box,
          activatable: false,
          selectable: false
        })
        this._listBox.append(row)

        const width = Math.max(this._parent.get_allocated_width(), 200)
        const rect = new Gdk.Rectangle({ x: 0, y: 0, width, height: 0 })
        this._popover.set_pointing_to(rect)

        if (!this._popover.get_visible()) {
          this._popover.popup()
        }
      } else {
        this._popover.popdown()
      }
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

      this._matches.forEach((cmd) => {
        const box = new Gtk.Box({
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 6,
          margin_top: 6,
          margin_bottom: 6,
          margin_start: 6,
          margin_end: 6
        })

        const icon = new Gtk.Image({
          icon_name: cmd.icon,
          pixel_size: 16
        })
        icon.add_css_class('dim-label')

        const titleLabel = new Gtk.Label({
          halign: Gtk.Align.START,
          use_markup: true
        })
        box.append(icon)
        box.append(titleLabel)

        const descLabel = new Gtk.Label({
          label: cmd.description,
          halign: Gtk.Align.START,
          hexpand: true
        })
        descLabel.add_css_class('dim-label')
        box.append(descLabel)

        const shortcut = this._currentCommand ? null : this._app.getShortcut(cmd.name)
        if (shortcut) {
          const shortcutLabel = new Gtk.Label({
            label: shortcut,
            halign: Gtk.Align.END
          })
          shortcutLabel.add_css_class('dim-label')
          box.append(shortcutLabel)
        }

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

    this._matches.forEach((cmd, i) => {
      const row = this._listBox.get_row_at_index(i)
      if (row) {
        const box = row.get_child() as Gtk.Box
        const titleLabel = box.get_first_child()?.get_next_sibling() as Gtk.Label
        if (titleLabel) {
          const displayStr = cmd.title
          let highlighted = pangoEscape(displayStr)
          if (filterText.length > 0 && !this._currentSubCommand) {
            if (displayStr.toLowerCase().startsWith(filterText.toLowerCase())) {
              highlighted = `<b>${pangoEscape(displayStr.slice(0, filterText.length))}</b>${pangoEscape(displayStr.slice(filterText.length))}`
            }
          }

          if (this._currentSubCommand) {
            titleLabel.set_markup(highlighted)
          } else if (this._currentCommand) {
            titleLabel.set_markup(highlighted)
          } else {
            titleLabel.set_markup(`/${highlighted}`)
          }
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
