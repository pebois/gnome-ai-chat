import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import type { AppInterface } from '@/lib/app.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { isToolError } from '@/lib/tools/labels.js'
import { findToolResult } from '@/lib/tools/results.js'

export function showToolCallDialog(app: AppInterface, tool_call: ToolCall, result?: ChatMessage): void {
  const conversation = app.conversation
  if (!conversation) {
    return
  }

  const toolResponse = result ?? findToolResult(conversation.messages, tool_call)

  const window = new Adw.Dialog({
    title: 'Tool Call',
    content_width: 500,
    content_height: 500
  })

  const toolbarView = new Adw.ToolbarView()
  const headerBar = new Adw.HeaderBar()
  toolbarView.add_top_bar(headerBar)

  const page = new Adw.PreferencesPage()
  toolbarView.set_content(page)
  window.set_child(toolbarView)

  const mcpLabel = app.mcp.getToolLabel(tool_call.function.name)
  const nameGroup = new Adw.PreferencesGroup({
    title: mcpLabel ? 'MCP Tool' : 'Function Name'
  })
  page.add(nameGroup)

  const nameLabel = new Gtk.Label({
    label: mcpLabel?.label ?? tool_call.function.name,
    tooltip_text: mcpLabel?.label ?? tool_call.function.name,
    use_markup: false,
    xalign: 0,
    selectable: true,
    ellipsize: Pango.EllipsizeMode.END,
    single_line_mode: true,
    css_classes: ['monospace'],
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12
  })
  nameGroup.add(new Gtk.ListBoxRow({
    child: nameLabel,
    activatable: false
  }))

  if (mcpLabel?.description) {
    const descriptionGroup = new Adw.PreferencesGroup({
      title: 'Description'
    })
    page.add(descriptionGroup)
    descriptionGroup.add(new Gtk.ListBoxRow({
      child: new Gtk.Label({
        label: mcpLabel.description,
        tooltip_text: mcpLabel.description,
        use_markup: false,
        xalign: 0,
        selectable: true,
        ellipsize: Pango.EllipsizeMode.END,
        single_line_mode: true,
        css_classes: ['dim-label'],
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12
      }),
      activatable: false
    }))
  }

  const argsGroup = new Adw.PreferencesGroup({
    title: 'Arguments'
  })
  page.add(argsGroup)

  const argsLabel = new Gtk.Label({
    label: JSON.stringify(tool_call.function.arguments, null, 2),
    use_markup: false,
    xalign: 0,
    selectable: true,
    wrap: true,
    wrap_mode: Pango.WrapMode.WORD_CHAR,
    css_classes: ['dim-label', 'monospace'],
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12
  })
  argsGroup.add(new Gtk.ListBoxRow({
    child: argsLabel,
    activatable: false
  }))

  if (toolResponse) {
    const responseGroup = new Adw.PreferencesGroup({
      title: 'Response'
    })
    page.add(responseGroup)

    const isError = isToolError(toolResponse.content)
    const cssClass = isError ? 'error' : 'dim-label'

    const responseLabel = new Gtk.Label({
      label: toolResponse.content,
      use_markup: false,
      xalign: 0,
      selectable: true,
      wrap: true,
      wrap_mode: Pango.WrapMode.WORD_CHAR,
      css_classes: [cssClass, 'monospace'],
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12
    })
    responseGroup.add(new Gtk.ListBoxRow({
      child: responseLabel,
      activatable: false
    }))
  }

  window.present(app.window)
}
