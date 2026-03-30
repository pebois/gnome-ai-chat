import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/app/index.js'
import type { OllamaToolCall } from '@/lib/ollama.js'

export function showToolCallDialog(app: AppInterface, tool_call: OllamaToolCall): void {
  const conversation = app.conversation
  if (!conversation) {
    return
  }

  let toolMessageIndex = -1
  for (let i = 0; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i]
    if (msg.role === 'assistant' && msg.tool_calls) {
      const idx = msg.tool_calls.findIndex((tc) => {
        return tc.id === tool_call.id
      })
      if (idx !== -1) {
        toolMessageIndex = i + 1 + idx
        break
      }
    }
  }

  const toolResponse = toolMessageIndex !== -1 ? conversation.messages[toolMessageIndex] : undefined

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

  const nameGroup = new Adw.PreferencesGroup({
    title: 'Function Name'
  })
  page.add(nameGroup)

  const nameLabel = new Gtk.Label({
    label: tool_call.function.name,
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
