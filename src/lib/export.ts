import Gio, { type PromisifiedFile } from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'
import WebKit from 'gi://WebKit?version=6.0'

import type { AppInterface } from '@/lib/app.js'
import { conversationsStore } from '@/lib/db/conversations.js'
import type { Conversation } from '@/lib/db/types.js'
import { markdownToHtml } from '@/lib/parser.js'
import { buildExport, describeImport, parseImport, toTransferConversation, type TransferFile } from '@/lib/transfer.js'

const activeWebViews = new Set<WebKit.WebView>()

const css = /* css */`
:root {
  --bg-color: #ffffff;
  --text-color: #333333;
  --user-bg: #f3f4f6;
  --assistant-bg: #ffffff;
  --border-color: #e5e7eb;
  --role-color: #6b7280;
  --code-bg: #f8f9fa;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
body {
  font-family: var(--font-sans);
  padding: 3rem 4rem;
  color: var(--text-color);
  background: var(--bg-color);
  line-height: 1.6;
  max-width: 900px;
  margin: 0 auto;
}
h1 {
  margin-top: 0;
  margin-bottom: 2.5rem;
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 1rem;
  font-size: 2rem;
  font-weight: 600;
  color: #111827;
}
.message {
  margin-bottom: 2.5rem;
  padding: 1.5rem;
  border-radius: 12px;
}
.user {
  background: var(--user-bg);
  border: 1px solid var(--border-color);
}
.assistant {
  background: var(--assistant-bg);
}
.role {
  font-weight: 600;
  margin-bottom: 1rem;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: var(--role-color);
}
.thought {
  background: #fafafa;
  border-left: 3px solid var(--border-color);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  font-style: italic;
  color: #666;
  font-size: 0.9rem;
}
.thought-header {
  font-weight: 600;
  font-size: 0.7rem;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
  color: #999;
  letter-spacing: 0.02em;
}
.content {
  font-size: 0.95rem;
}
pre {
  background: var(--code-bg);
  padding: 1.25rem;
  border-radius: 8px;
  overflow-x: auto;
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  border: 1px solid var(--border-color);
  margin: 1.25rem 0;
}
code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--code-bg);
  padding: 0.2em 0.4em;
  border-radius: 4px;
}
pre code {
  padding: 0;
  background: transparent;
  border: none;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  font-size: 0.9rem;
}
th, td {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  text-align: left;
}
th {
  background: var(--user-bg);
  font-weight: 600;
}
.images {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.image {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  object-fit: contain;
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
p { margin-top: 0; margin-bottom: 1rem; }
p:last-child { margin-bottom: 0; }
`

function isDismissed(err: unknown): boolean {
  return err instanceof GLib.Error && err.matches(Gtk.dialog_error_quark(), Gtk.DialogError.DISMISSED)
}

function jsonFilters(): Gio.ListStore<Gtk.FileFilter> {
  const filter = new Gtk.FileFilter({ name: 'JSON files' })
  filter.add_pattern('*.json')
  const filters = new Gio.ListStore<Gtk.FileFilter>({ item_type: Gtk.FileFilter.$gtype })
  filters.append(filter)
  return filters
}

async function writeTransferFile(file: PromisifiedFile, data: TransferFile): Promise<void> {
  const bytes = new GLib.Bytes(new TextEncoder().encode(JSON.stringify(data, null, 2)))
  await file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.NONE, null)
}

export function exportAllConversations(app: AppInterface, parent: Gtk.Widget = app.window): void {
  if (app.conversations.length === 0) {
    app.showToast('There are no chats to export')
    return
  }
  const exportedAt = new Date().toISOString()
  const fileDialog = new Gtk.FileDialog({
    title: 'Export All Chats',
    initial_name: `gnome-ai-chat-conversations-${exportedAt.slice(0, 10)}.json`,
    filters: jsonFilters()
  })
  fileDialog.save(parent.get_root() as Gtk.Window, null, async (_source, result) => {
    try {
      const file = fileDialog.save_finish(result) as PromisifiedFile | null
      if (!file) {
        return
      }
      const conversations = []
      for (const conversation of app.conversations) {
        conversations.push(toTransferConversation(conversation, await conversationsStore.getMessages(conversation.id)))
      }
      await writeTransferFile(file, buildExport(conversations, exportedAt))
      app.showToast(`Exported ${conversations.length} chat${conversations.length === 1 ? '' : 's'}`)
    } catch (err) {
      if (!isDismissed(err)) {
        app.reportError('Failed to export chats', err)
      }
    }
  })
}

export function importConversations(app: AppInterface, parent: Gtk.Widget = app.window): void {
  const fileDialog = new Gtk.FileDialog({
    title: 'Import Chats',
    filters: jsonFilters()
  })
  fileDialog.open(parent.get_root() as Gtk.Window, null, async (_source, result) => {
    try {
      const file = fileDialog.open_finish(result) as PromisifiedFile | null
      if (!file) {
        return
      }
      const [contents] = await file.load_contents_async(null)
      const plan = await app.importConversations(parseImport(new TextDecoder().decode(contents)))
      app.showToast(describeImport(plan))
    } catch (err) {
      if (!isDismissed(err)) {
        app.reportError('Failed to import chats', err)
      }
    }
  })
}

export function exportConversation(app: AppInterface, conversation: Conversation, format: 'json' | 'pdf'): void {
  const fileDialog = new Gtk.FileDialog({
    title: `Export as ${format.toUpperCase()}`,
    initial_name: `${conversation.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${format}`
  })

  fileDialog.save(app.window, null, async (source, result) => {
    try {
      const file = fileDialog.save_finish(result) as PromisifiedFile | null
      if (!file) {
        return
      }

      const messages = await conversationsStore.getMessages(conversation.id)
      if (format === 'json') {
        try {
          await writeTransferFile(file, buildExport([toTransferConversation(conversation, messages)], new Date().toISOString()))
          app.showToast('Conversation exported successfully')
        } catch (err) {
          console.error('Failed to save JSON:', err)
          app.showToast('Failed to export conversation', true)
        }
      } else if (format === 'pdf') {
        const webView = new WebKit.WebView()
        activeWebViews.add(webView)

        const htmlParts: string[] = [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '<meta charset="utf-8">',
          '<style>',
          css,
          '</style>',
          '</head>',
          '<body>',
          `<h1>${conversation.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>`
        ]

        for (const msg of messages) {
          const roleName = msg.role === 'user' ? 'User' : (msg.role === 'assistant' ? 'Assistant' : 'System')
          const contentHtml = markdownToHtml(msg.content)

          htmlParts.push(`<div class="message ${msg.role}">`)
          htmlParts.push(`<div class="role">${roleName}</div>`)

          if (msg.thinking) {
            htmlParts.push('<div class="thought">')
            htmlParts.push('<div class="thought-header">Thought Process</div>')
            htmlParts.push(`${msg.thinking.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}`)
            htmlParts.push('</div>')
          }

          if (msg.images && msg.images.length > 0) {
            htmlParts.push('<div class="images">')
            for (const img of msg.images) {
              const mimeType = img.startsWith('/') ? 'image/jpeg' : 'image/png'
              htmlParts.push(`<img class="image" src="data:${mimeType};base64,${img}" />`)
            }
            htmlParts.push('</div>')
          }

          htmlParts.push(`<div class="content">${contentHtml}</div>`)
          htmlParts.push('</div>')
        }

        htmlParts.push('</body>')
        htmlParts.push('</html>')

        const html = htmlParts.join('\n')

        webView.connect('load-changed', (wv, event) => {
          if (event === WebKit.LoadEvent.FINISHED) {
            try {
              const printOp = new WebKit.PrintOperation({ web_view: webView })
              const printSettings = new Gtk.PrintSettings()
              printSettings.set_printer('Print to File')
              printSettings.set(Gtk.PRINT_SETTINGS_OUTPUT_FILE_FORMAT, 'pdf')
              printSettings.set(Gtk.PRINT_SETTINGS_OUTPUT_URI, file.get_uri())
              printOp.set_print_settings(printSettings)

              printOp.connect('finished', () => {
                app.showToast('Conversation exported successfully')
                activeWebViews.delete(webView)
              })

              printOp.connect('failed', (_op, err) => {
                console.error('PDF export failed:', err.message)
                app.showToast('Failed to export conversation', true)
                activeWebViews.delete(webView)
              })

              printOp.print()
            } catch (err) {
              console.error('Failed to print PDF:', err)
              app.showToast('Failed to export conversation', true)
              activeWebViews.delete(webView)
            }
          }
        })

        webView.load_html(html, null)
      }
    } catch (err) {
      if (!isDismissed(err)) {
        console.error('Failed to handle export:', err)
        app.showToast('Failed to export conversation', true)
      }
    }
  })
}
