import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import { showToolCallDialog } from '@/app/dialog/toolcall.js'
import type { AppInterface } from '@/lib/app.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { handle_render_html } from '@/lib/tools/html.js'
import { isToolError, toolActivityDetail, toolActivityLabel } from '@/lib/tools/labels.js'
import { formatDuration } from '@/lib/utils.js'

export type ToolResultResolver = (call: ToolCall) => ChatMessage | undefined

export class ToolCallRow {
  private _app: AppInterface
  private _call: ToolCall
  private _resolve: ToolResultResolver
  private _row: Adw.ActionRow
  private _status: Gtk.Stack
  private _duration: Gtk.Label
  private _result?: ChatMessage

  public get call(): ToolCall {
    return this._call
  }

  public get widget(): Adw.ActionRow {
    return this._row
  }

  constructor(app: AppInterface, call: ToolCall, resolve: ToolResultResolver) {
    this._app = app
    this._call = call
    this._resolve = resolve

    const mcpLabel = app.mcp.getToolLabel(call.function.name)
    const detail = toolActivityDetail(call.function.arguments)
    const title = toolActivityLabel(call.function.name, mcpLabel?.label)
    const subtitle = detail || mcpLabel?.description || call.function.name
    this._row = new Adw.ActionRow({
      title,
      subtitle,
      title_lines: 1,
      subtitle_lines: 1,
      use_markup: false,
      activatable: true
    })
    this._row.set_tooltip_text([...new Set([title, subtitle, call.function.name])].join('\n'))

    this._status = new Gtk.Stack({ valign: Gtk.Align.CENTER })
    this._status.add_named(new Gtk.Image({ icon_name: mcpLabel ? 'network-server-symbolic' : 'system-run-symbolic' }), 'idle')
    this._status.add_named(new Adw.Spinner({ width_request: 16, height_request: 16 }), 'running')
    this._status.add_named(new Gtk.Image({ icon_name: 'object-select-symbolic', css_classes: ['success'] }), 'done')
    this._status.add_named(new Gtk.Image({ icon_name: 'dialog-warning-symbolic', css_classes: ['warning'] }), 'failed')
    this._row.add_prefix(this._status)

    this._duration = new Gtk.Label({ valign: Gtk.Align.CENTER, visible: false })
    this._duration.add_css_class('dim-label')
    this._duration.add_css_class('caption')
    this._duration.add_css_class('numeric')
    this._row.add_suffix(this._duration)

    if (call.function.name === 'render_html') {
      const previewButton = new Gtk.Button({
        icon_name: 'web-browser-symbolic',
        tooltip_text: 'Open preview',
        valign: Gtk.Align.CENTER
      })
      previewButton.add_css_class('flat')
      previewButton.connect('clicked', () => {
        handle_render_html(app, call.function.arguments ?? {})
      })
      this._row.add_suffix(previewButton)
    }
    this._row.add_suffix(new Gtk.Image({ icon_name: 'view-reveal-symbolic' }))

    const stored = resolve(call)
    if (stored) {
      this._status.set_visible_child_name(isToolError(stored.content) ? 'failed' : 'done')
    }

    this._row.connect('activated', () => {
      showToolCallDialog(this._app, this._call, this._result ?? this._resolve(this._call))
    })
  }

  public setRunning(): void {
    this._status.set_visible_child_name('running')
  }

  public setResult(result: ChatMessage, durationMs?: number): void {
    this._result = result
    this._status.set_visible_child_name(isToolError(result.content) ? 'failed' : 'done')
    if (durationMs !== undefined) {
      this._duration.set_label(durationMs < 1000 ? `${Math.round(durationMs)} ms` : durationMs < 60000 ? `${(durationMs / 1000).toFixed(1)} s` : formatDuration(durationMs))
      this._duration.set_visible(true)
    }
  }
}
