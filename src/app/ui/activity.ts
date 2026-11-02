import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import type { AppInterface } from '@/lib/app.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { isToolError, toolActivityDetail, toolActivityLabel } from '@/lib/tools/labels.js'
import { formatDuration } from '@/lib/utils.js'

interface ActivityRow {
  spinner: Adw.Spinner
  icon: Gtk.Image
  duration: Gtk.Label
}

export class ToolActivity {
  private _app: AppInterface
  private _widget: Gtk.Box
  private _rows: Map<ToolCall, ActivityRow> = new Map()

  public get widget(): Gtk.Box {
    return this._widget
  }

  constructor(app: AppInterface) {
    this._app = app
    this._widget = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 4,
      margin_start: 6,
      margin_top: 4,
      margin_bottom: 4
    })
    this._widget.add_css_class('tool-activity')
  }

  public start(call: ToolCall): void {
    const row = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8
    })
    const spinner = new Adw.Spinner({ width_request: 16, height_request: 16 })
    const icon = new Gtk.Image({ pixel_size: 16, visible: false })
    const mcpLabel = this._app.mcp.getToolLabel(call.function.name)?.label
    const detail = toolActivityDetail(call.function.arguments)
    const label = new Gtk.Label({
      label: toolActivityLabel(call.function.name, mcpLabel),
      xalign: 0
    })
    const detailLabel = new Gtk.Label({
      label: detail,
      xalign: 0,
      hexpand: true,
      ellipsize: Pango.EllipsizeMode.MIDDLE,
      visible: !!detail
    })
    detailLabel.add_css_class('dim-label')
    detailLabel.add_css_class('monospace')
    const duration = new Gtk.Label({ xalign: 1 })
    duration.add_css_class('dim-label')
    duration.add_css_class('caption')

    row.append(spinner)
    row.append(icon)
    row.append(label)
    row.append(detailLabel)
    row.append(duration)
    this._widget.append(row)
    this._rows.set(call, { spinner, icon, duration })
  }

  public end(call: ToolCall, result: ChatMessage, durationMs: number): void {
    const row = this._rows.get(call)
    if (!row) {
      return
    }
    const failed = isToolError(result.content)
    row.spinner.set_visible(false)
    row.icon.set_from_icon_name(failed ? 'dialog-warning-symbolic' : 'object-select-symbolic')
    row.icon.set_visible(true)
    if (failed) {
      row.icon.add_css_class('warning')
    }
    row.duration.set_label(durationMs < 1000 ? `${Math.round(durationMs)} ms` : formatDuration(durationMs))
  }
}
