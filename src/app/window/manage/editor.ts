import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

export interface EditorShellOptions {
  content: Gtk.Widget
  emptyPage: Gtk.Widget
  deleteTooltip: string
  titleWidget?: Gtk.Widget
  endWidgets?: Gtk.Widget[]
  onDelete: () => void
}

export class EditorShell {
  private _widget: Adw.ToolbarView
  private _stack: Gtk.Stack
  private _toggleSidebarBtn: Gtk.ToggleButton
  private _deleteBtn: Gtk.Button
  private _titleWidget?: Gtk.Widget

  public get widget(): Adw.ToolbarView {
    return this._widget
  }

  public get toggleSidebarButton(): Gtk.ToggleButton {
    return this._toggleSidebarBtn
  }

  constructor(options: EditorShellOptions) {
    this._titleWidget = options.titleWidget
    this._widget = new Adw.ToolbarView()
    const header = new Adw.HeaderBar({ show_title: options.titleWidget !== undefined })
    if (options.titleWidget) {
      header.set_title_widget(options.titleWidget)
    }

    this._toggleSidebarBtn = new Gtk.ToggleButton({
      icon_name: 'sidebar-show-symbolic',
      tooltip_text: 'Toggle sidebar (Ctrl+B)',
      active: true
    })
    header.pack_start(this._toggleSidebarBtn)

    this._deleteBtn = new Gtk.Button({
      icon_name: 'user-trash-symbolic',
      tooltip_text: options.deleteTooltip,
      valign: Gtk.Align.CENTER
    })
    this._deleteBtn.add_css_class('flat')
    this._deleteBtn.add_css_class('destructive-action')
    this._deleteBtn.connect('clicked', () => {
      return options.onDelete()
    })
    header.pack_end(this._deleteBtn)
    for (const widget of options.endWidgets ?? []) {
      header.pack_end(widget)
    }

    this._widget.add_top_bar(header)

    this._stack = new Gtk.Stack({ vexpand: true })
    this._stack.add_named(options.emptyPage, 'empty')
    this._stack.add_named(options.content, 'content')
    this._widget.set_content(this._stack)
    this.setState(false, false)
  }

  public setState(hasItem: boolean, canDelete: boolean): void {
    this._stack.visible_child_name = hasItem ? 'content' : 'empty'
    this._deleteBtn.visible = hasItem && canDelete
    if (this._titleWidget) {
      this._titleWidget.visible = hasItem
    }
  }
}
