import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import type { AppInterface } from '@/lib/app.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'

export function showToolCallDialog(app: AppInterface, tool_call: ToolCall): void {
  const conversation = app.conversation
  if (!conversation) {
    return
  }

  let toolResponse: ChatMessage | undefined
  const ownerIndex = conversation.messages.findIndex((m) => {
    return m.tool_calls?.includes(tool_call)
  })
  if (ownerIndex !== -1) {
    const position = conversation.messages[ownerIndex].tool_calls!.indexOf(tool_call)
    const candidate = conversation.messages[ownerIndex + 1 + position]
    if (candidate?.role === 'tool' && (!candidate.tool_name || candidate.tool_name === tool_call.function.name)) {
      toolResponse = candidate
    }
  }

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
    use_markup: false,
    xalign: 0,
    selectable: true,
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
        use_markup: false,
        xalign: 0,
        selectable: true,
        wrap: true,
        wrap_mode: Pango.WrapMode.WORD_CHAR,
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

    const isError = toolResponse.content.startsWith('Error') || toolResponse.content.startsWith('Failed') || toolResponse.content.includes('failed:')
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
