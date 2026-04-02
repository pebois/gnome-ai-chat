import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

export function setupContextMenu(widget: Gtk.Widget, popover: Gtk.PopoverMenu): void {
  const gesture = new Gtk.GestureClick({
    button: 3
  })
  gesture.connect('pressed', (_gesture: Gtk.GestureClick, _n_press: number, x: number, y: number) => {
    const rect = new Gdk.Rectangle({ x: Math.round(x), y: Math.round(y), width: 1, height: 1 })
    popover.set_pointing_to(rect)
    popover.popup()
  })
  widget.add_controller(gesture)

  const keyCtrl = new Gtk.EventControllerKey()
  keyCtrl.connect('key-pressed', (_ctrl, keyval, _keycode) => {
    if (keyval === Gdk.keyval_from_name('Menu')) {
      const width = widget.get_allocated_width()
      const height = widget.get_allocated_height()
      const rect = new Gdk.Rectangle({ x: Math.round(width / 2), y: Math.round(height / 2), width: 1, height: 1 })
      popover.set_pointing_to(rect)
      popover.popup()
      return true
    }
    return false
  })
  widget.add_controller(keyCtrl)
}

export function createStatusPageWrapper(statusPage: Gtk.Widget): Gtk.Box {
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL
  })
  const header = new Adw.HeaderBar({
    title_widget: new Gtk.Box()
  })
  header.add_css_class('flat')

  box.append(header)
  box.append(statusPage)

  return box
}

export function createPillButton(iconName: string, label: string, suggested: boolean = false): Gtk.Button {
  const btn = new Gtk.Button({
    child: new Adw.ButtonContent({
      icon_name: iconName,
      label: label
    })
  })
  btn.add_css_class('pill')
  if (suggested) {
    btn.add_css_class('suggested-action')
  }
  return btn
}

export function createMenuItem(label: string, action: string, iconName: string, targetValue?: GLib.Variant): Gio.MenuItem {
  const item = new Gio.MenuItem()
  item.set_label(label)
  item.set_icon(Gio.Icon.new_for_string(iconName))

  if (targetValue) {
    item.set_action_and_target_value(action, targetValue)
  } else {
    item.set_action_and_target_value(action, null)
  }

  return item
}

export function createSimpleAction(name: string, callback: (action: Gio.SimpleAction, parameter: GLib.Variant | null) => void, parameterType?: GLib.VariantType): Gio.SimpleAction {
  const action = new Gio.SimpleAction({
    name,
    ...(parameterType ? { parameter_type: parameterType } : {})
  })

  action.connect('activate', (act, param) => {
    return callback(act, param)
  })

  return action
}

export function createBoxedExpanderRow(title: string, iconName: string): [Gtk.ListBox, Adw.ExpanderRow] {
  const listBox = new Gtk.ListBox({
    selection_mode: Gtk.SelectionMode.NONE
  })
  listBox.add_css_class('boxed-list')

  const expanderRow = new Adw.ExpanderRow({
    title,
    icon_name: iconName
  })
  listBox.append(expanderRow)

  return [listBox, expanderRow]
}

export function showDestructiveConfirmation(
  parent: Gtk.Window,
  heading: string,
  body: string,
  onConfirm: () => void | Promise<void>
): void {
  const alertDialog = new Adw.AlertDialog({
    heading,
    body
  })

  alertDialog.add_response('cancel', 'Cancel')
  alertDialog.add_response('confirm', 'Confirm')
  alertDialog.set_response_appearance('confirm', Adw.ResponseAppearance.DESTRUCTIVE)

  alertDialog.connect('response', async (_, response) => {
    if (response === 'confirm') {
      await onConfirm()
    }
  })

  alertDialog.present(parent)
}

export const ResizeTracker = GObject.registerClass({
  GTypeName: 'ResizeTracker'
}, class extends Gtk.DrawingArea {
  public onSizeAllocate?: (width: number, height: number) => void

  vfunc_size_allocate(width: number, height: number, baseline: number): void {
    super.vfunc_size_allocate(width, height, baseline)
    if (this.onSizeAllocate) {
      this.onSizeAllocate(width, height)
    }
  }
})
