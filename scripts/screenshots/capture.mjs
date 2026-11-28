import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import GLib from 'gi://GLib?version=2.0'
import Graphene from 'gi://Graphene'
import Gsk from 'gi://Gsk'
import Gtk from 'gi://Gtk?version=4.0'
import WebKit from 'gi://WebKit?version=6.0'

import { showFilesDialog } from '../../dist/app/dialog/files.mjs'
import { showStatsDialog } from '../../dist/app/dialog/stats.mjs'
import { App } from '../../dist/app/index.mjs'
import { ArtifactWindow } from '../../dist/app/window/artifact.mjs'
import { ManageWindow } from '../../dist/app/window/manage/index.mjs'
import { showMcpCatalogDialog } from '../../dist/app/window/mcp/catalog.mjs'
import { Preferences } from '../../dist/app/window/preferences/index.mjs'
import { DEFAULT_SETTINGS } from '../../dist/lib/constants.mjs'
import { conversationsStore } from '../../dist/lib/db/conversations.mjs'
import { db } from '../../dist/lib/db/index.mjs'
import { mcpStore } from '../../dist/lib/db/mcp.mjs'
import {
  buildDemoConversations,
  CALCULATOR_HTML,
  DEMO_MCP_SERVERS,
  DEMO_MCP_TOOLS,
  DEMO_STATS
} from './fixtures.mjs'

const RAW_DIR = GLib.getenv('SCREENSHOT_RAW_DIR')
const OLLAMA_URL = GLib.getenv('SCREENSHOT_OLLAMA_URL')

if (!RAW_DIR || !OLLAMA_URL) {
  throw new Error('SCREENSHOT_RAW_DIR and SCREENSHOT_OLLAMA_URL must be set')
}

const SCALE = 2
const WIN_W = 800
const WIN_H = 600

function sleep(ms) {
  return new Promise((resolve) => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve()
      return GLib.SOURCE_REMOVE
    })
  })
}

function findWidget(widget, predicate) {
  if (!widget) return null
  if (predicate(widget)) return widget
  let child = widget.get_first_child()
  while (child) {
    const found = findWidget(child, predicate)
    if (found) return found
    child = child.get_next_sibling()
  }
  return null
}

function findAllWidgets(widget, predicate, acc = []) {
  if (!widget) return acc
  if (predicate(widget)) acc.push(widget)
  let child = widget.get_first_child()
  while (child) {
    findAllWidgets(child, predicate, acc)
    child = child.get_next_sibling()
  }
  return acc
}

function captureWindow(window, outPath, popovers = []) {
  const width = window.get_width() || WIN_W
  const height = window.get_height() || WIN_H
  const paintable = Gtk.WidgetPaintable.new(window)
  const snapshot = Gtk.Snapshot.new()
  snapshot.scale(SCALE, SCALE)
  paintable.snapshot(snapshot, width, height)

  for (const item of popovers) {
    const pop = item?.widget ?? item
    if (!pop || !pop.get_visible()) continue
    const pw = pop.get_width()
    const ph = pop.get_height()
    if (pw <= 0 || ph <= 0) continue

    const anchor = item?.anchor ?? pop.get_parent()
    if (!anchor) continue
    const [ok, bounds] = anchor.compute_bounds(window)
    if (!ok) continue

    const ax = bounds.get_x()
    const ay = bounds.get_y()
    const aw = bounds.get_width()
    const ah = bounds.get_height()
    const gap = item?.gap ?? 8
    const align = item?.align ?? 'center'
    const placement = item?.placement ?? 'top'

    let x = align === 'start' ? ax : align === 'end' ? ax + aw - pw : ax + (aw - pw) / 2
    let y = placement === 'top' ? ay - ph - gap : ay + ah + gap

    if (x + pw > width - 12) x = Math.max(12, width - pw - 12)
    if (x < 12) x = 12
    if (y < 12) y = 12
    if (y + ph > height - 12) y = Math.max(12, height - ph - 12)

    const clipBounds = new Graphene.Rect()
    clipBounds.init(x, y, pw, ph)
    const rrect = new Gsk.RoundedRect()
    rrect.init_from_rect(clipBounds, 12)

    const shadowColor = new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 0.28 })
    snapshot.append_outset_shadow(rrect, shadowColor, 0, 4, 0, 14)

    snapshot.save()
    snapshot.push_rounded_clip(rrect)
    const pt = new Graphene.Point()
    pt.init(x, y)
    snapshot.translate(pt)
    const popPaintable = Gtk.WidgetPaintable.new(pop)
    popPaintable.snapshot(snapshot, pw, ph)
    snapshot.pop()
    snapshot.restore()
  }

  const node = snapshot.to_node()
  if (!node) {
    throw new Error(`Failed to snapshot ${outPath}`)
  }
  const renderer = Gsk.CairoRenderer.new()
  renderer.realize(null)
  const rect = new Graphene.Rect()
  rect.init(0, 0, width * SCALE, height * SCALE)
  const texture = renderer.render_texture(node, rect)
  texture.save_to_png(outPath)
  renderer.unrealize()
  printerr(`Captured ${outPath} (${width * SCALE}x${height * SCALE})`)
}

async function capturePair(window, name, opts = {}) {
  const manager = Adw.StyleManager.get_default()
  const { afterTheme, popovers } = opts

  manager.set_color_scheme(Adw.ColorScheme.FORCE_DARK)
  if (afterTheme) await afterTheme(true)
  await sleep(350)
  captureWindow(window, `${RAW_DIR}/${name}.png`, popovers ? popovers() : [])

  manager.set_color_scheme(Adw.ColorScheme.FORCE_LIGHT)
  if (afterTheme) await afterTheme(false)
  await sleep(350)
  captureWindow(window, `${RAW_DIR}/light/${name}.png`, popovers ? popovers() : [])

  manager.set_color_scheme(Adw.ColorScheme.FORCE_DARK)
}

let settingsSeeded = false
async function seedInitialSettings() {
  if (settingsSeeded) return
  settingsSeeded = true
  await db.initDb()

  const settings = {
    ...DEFAULT_SETTINGS,
    url: OLLAMA_URL,
    theme: Adw.ColorScheme.FORCE_DARK
  }

  await db.execSql([
    `INSERT OR REPLACE INTO kv_store (key, value) VALUES ('settings', '${db.escape(JSON.stringify(settings))}');`
  ])
}

async function seedDemoContent(app) {
  const sqls = [
    `DELETE FROM messages;`,
    `DELETE FROM conversations;`,
    `INSERT OR REPLACE INTO kv_store (key, value) VALUES ('stats', '${db.escape(JSON.stringify(DEMO_STATS))}');`
  ]

  for (const server of DEMO_MCP_SERVERS) {
    const { id, ...cfg } = server
    sqls.push(`INSERT OR REPLACE INTO mcp_servers (id, config) VALUES ('${db.escape(id)}', '${db.escape(JSON.stringify(cfg))}');`)
  }

  const ragPath = '/home/alex/Projects/gnome-ai-chat/src'
  sqls.push(`INSERT OR REPLACE INTO vector_paths (path, status) VALUES ('${db.escape(ragPath)}', 'indexed');`)
  for (let f = 1; f <= 48; f++) {
    const filePath = `${ragPath}/module_${f}.ts`
    for (let c = 0; c < 6; c++) {
      sqls.push(`INSERT INTO vector_chunks (file_path, content, embedding) VALUES ('${db.escape(filePath)}', 'chunk ${c}', '[0.1,0.2,0.3,0.4]');`)
    }
  }

  const conversations = buildDemoConversations()
  for (const conv of conversations) {
    sqls.push(
      `INSERT OR REPLACE INTO conversations (id, title, model, created_at, updated_at, embeddings, pinned) VALUES (${conv.id}, '${db.escape(conv.title)}', '${db.escape(conv.model)}', '${db.escape(conv.created_at)}', '${db.escape(conv.updated_at)}', '${db.escape(JSON.stringify(conv.embeddings))}', ${conv.pinned ? 1 : 0});`
    )
    for (const msg of conv.messages) {
      const thinking = msg.thinking ? `'${db.escape(msg.thinking)}'` : 'NULL'
      const toolCalls = msg.tool_calls ? `'${db.escape(JSON.stringify(msg.tool_calls))}'` : 'NULL'
      const toolName = msg.tool_name ? `'${db.escape(msg.tool_name)}'` : 'NULL'
      const stats = msg.stats ? `'${db.escape(JSON.stringify(msg.stats))}'` : 'NULL'
      const command = msg.command ? `'${db.escape(msg.command)}'` : 'NULL'
      sqls.push(
        `INSERT INTO messages (conversation_id, role, content, images, files, thinking, tool_calls, tool_name, stats, command) VALUES (${conv.id}, '${db.escape(msg.role)}', '${db.escape(msg.content)}', NULL, NULL, ${thinking}, ${toolCalls}, ${toolName}, ${stats}, ${command});`
      )
    }
  }

  await db.execSql(sqls)
  await app.tracker.load()
  await app.mcp.start()
  app.conversations = await conversationsStore.getConversations()
  app.sidebar.populateList()
  printerr('Seeded demo SQLite content.')
}

async function openConversation(app, id) {
  await app.sidebar.selectConversationById(id)
  await sleep(350)
}

function scrollHistoryToBottom(app) {
  const sw = findWidget(app.chat.history.widget, (w) => w instanceof Gtk.ScrolledWindow)
  if (sw) {
    const adj = sw.get_vadjustment()
    adj.set_value(adj.get_upper())
  }
}

function scrollHistoryToTop(app) {
  const sw = findWidget(app.chat.history.widget, (w) => w instanceof Gtk.ScrolledWindow)
  if (sw) {
    const adj = sw.get_vadjustment()
    adj.set_value(0)
  }
}

const app = new App('io.github.pebois.gnome-ai-chat.screenshot')

// Seed only the mock Ollama URL before app.init() so main.png is a true fresh start
const originalInit = app.init.bind(app)
app.init = async () => {
  await seedInitialSettings()
  return originalInit()
}

// Disable remote registry update checks so no "Model update available" banner appears
app.provider.checkUpdate = async () => false

// Prevent real network MCP connections; inject deterministic connected state
app.mcp.start = async () => {
  app.mcp.servers = await mcpStore.list()
  for (const server of app.mcp.servers) {
    const tools = DEMO_MCP_TOOLS[server.id] ?? []
    if (server.enabled && tools.length > 0) {
      app.mcp._clients.set(server.id, { tools })
      app.mcp.status.set(server.id, { state: 'connected', toolCount: tools.length })
    }
  }
  app.mcp.onChanged?.()
}

app.connect('activate', () => {
  void (async () => {
    try {
      const gtkSettings = Gtk.Settings.get_default()
      if (gtkSettings) {
        gtkSettings.gtk_decoration_layout = ':close'
        gtkSettings.gtk_cursor_blink = false
      }

      const cssProvider = new Gtk.CssProvider()
      cssProvider.load_from_string(`
        window.solid-csd {
          border-width: 0;
          padding: 0;
          margin: 0;
          box-shadow: none;
          outline: none;
        }
        popover.background > contents {
          border-radius: 12px;
        }
      `)
      Gtk.StyleContext.add_provider_for_display(
        Gdk.Display.get_default(),
        cssProvider,
        Gtk.STYLE_PROVIDER_PRIORITY_USER
      )

      for (let i = 0; i < 100 && !app.isLoaded; i++) {
        await sleep(100)
      }
      if (!app.isLoaded) {
        throw new Error('App did not finish loading in time')
      }

      app.window.set_size_request(WIN_W, WIN_H)
      app.window.set_default_size(WIN_W, WIN_H)
      await sleep(400)

      // 1. main.png — true fresh start on an empty database (only "New chat")
      app.window.set_focus(null)
      await capturePair(app.window, 'main')

      // Now seed the full demo dataset for the feature screenshots
      await seedDemoContent(app)
      await sleep(300)

      // 2. commands.png — slash command palette cleanly aligned above the input card
      await openConversation(app, 102)
      const textView = findWidget(app.chat.input.widget, (w) => w instanceof Gtk.TextView)
      if (textView) {
        textView.get_buffer().set_text('/', -1)
      }
      await sleep(350)
      const cmdPopover = app.chat.input._commands?._popover
      await capturePair(app.window, 'commands', {
        popovers: () => (cmdPopover
          ? [{ widget: cmdPopover, anchor: app.chat.input.widget, align: 'center', placement: 'top', gap: 8 }]
          : [])
      })
      if (cmdPopover) cmdPopover.popdown()
      if (textView) textView.get_buffer().set_text('', -1)
      await sleep(200)

      // 3. code.png — syntax-highlighted code blocks + hover actions / Message Details popover centered above ⓘ
      await openConversation(app, 103)
      scrollHistoryToBottom(app)
      await sleep(250)
      const detailsBtn = findAllWidgets(app.chat.history.widget, (w) => w instanceof Gtk.MenuButton && w.get_visible()).pop()
      if (detailsBtn) {
        detailsBtn.get_parent()?.set_opacity(1)
        detailsBtn.popup()
        await sleep(200)
        const detailsPop = detailsBtn.get_popover()
        if (detailsPop) {
          detailsPop.set_has_arrow(false)
          await sleep(150)
        }
      }
      app.window.set_focus(null)
      await capturePair(app.window, 'code', {
        popovers: () => (detailsBtn?.get_popover()
          ? [{ widget: detailsBtn.get_popover(), anchor: detailsBtn, align: 'center', placement: 'top', gap: 8 }]
          : [])
      })
      if (detailsBtn) detailsBtn.popdown()
      await sleep(150)

      // 4. find.png — Find in Conversation (Ctrl+Shift+F) with highlighted matches & counter
      await openConversation(app, 104)
      scrollHistoryToTop(app)
      app.chat.openFind()
      await sleep(200)
      const findEntry = findWidget(app.chat.history.findBar, (w) => w instanceof Gtk.SearchEntry)
      if (findEntry) {
        findEntry.set_text('portal')
      }
      await sleep(350)
      await capturePair(app.window, 'find')
      app.chat.history.findBar.set_search_mode(false)
      await sleep(150)

      // 5. subagents.png — Sub-agent delegation with expanded Live Tool Calls
      await openConversation(app, 105)
      const subExpanders = findAllWidgets(
        app.chat.history.widget,
        (w) => w instanceof Adw.ExpanderRow && w.get_title() === 'Tool Calls'
      )
      for (const exp of subExpanders) {
        exp.set_expanded(true)
      }
      await sleep(200)
      scrollHistoryToBottom(app)
      app.window.set_focus(null)
      await sleep(250)
      await capturePair(app.window, 'subagents')

      // 6. deepsearch.png — /deepsearch cited report with clickable numbered sources
      await openConversation(app, 106)
      scrollHistoryToBottom(app)
      app.window.set_focus(null)
      await sleep(300)
      await capturePair(app.window, 'deepsearch')

      // 7. canvas-1.png — @Canvas chat view with modern Live Tool Calls + Open Preview button
      await openConversation(app, 107)
      const canvasExpanders = findAllWidgets(
        app.chat.history.widget,
        (w) => w instanceof Adw.ExpanderRow && w.get_title() === 'Tool Calls'
      )
      for (const exp of canvasExpanders) {
        exp.set_expanded(true)
      }
      await sleep(200)
      scrollHistoryToBottom(app)
      app.window.set_focus(null)
      await sleep(250)
      await capturePair(app.window, 'canvas-1')

      // 8. canvas-2.png — WebKitGTK ArtifactWindow rendering the Calculator
      const artifactWin = new ArtifactWindow(app, 'Calculator', CALCULATOR_HTML)
      artifactWin.set_size_request(WIN_W, WIN_H)
      artifactWin.set_default_size(WIN_W, WIN_H)
      artifactWin.present()
      const webView = findWidget(artifactWin, (w) => w instanceof WebKit.WebView)
      if (webView) {
        await new Promise((resolve) => {
          let done = false
          const finish = () => {
            if (!done) {
              done = true
              resolve()
            }
          }
          webView.connect('load-changed', (_wv, ev) => {
            if (ev === WebKit.LoadEvent.FINISHED) finish()
          })
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
            finish()
            return GLib.SOURCE_REMOVE
          })
        })
      }
      await sleep(500)
      await capturePair(artifactWin, 'canvas-2', {
        afterTheme: async () => {
          await sleep(450)
        }
      })
      artifactWin.close()
      await sleep(200)

      // 9. search.png — Semantic search in sidebar ("weather" -> "Why the Sky Is Blue")
      await openConversation(app, 108)
      app.sidebar.searchButton.set_active(true)
      app.sidebar.searchEntry.set_text('weather')
      await sleep(600)
      await capturePair(app.window, 'search')
      app.sidebar.searchEntry.set_text('')
      app.sidebar.searchButton.set_active(false)
      await sleep(200)

      // Return to New chat as clean backdrop for Settings / Dialogs
      await openConversation(app, 102)

      // 10-12. Settings dialogs: tools.png, permissions.png, data.png
      const prefs = new Preferences(app)
      prefs.show()
      await sleep(300)
      for (const [pageTitle, outName] of [
        ['Tools', 'tools'],
        ['Permissions', 'permissions'],
        ['Data', 'data']
      ]) {
        const page = findWidget(
          prefs._window,
          (w) => w instanceof Adw.PreferencesPage && w.get_title() === pageTitle
        )
        if (page) {
          prefs._window.set_visible_page(page)
          await sleep(250)
        }
        await capturePair(app.window, outName)
      }
      prefs._window.close()
      await sleep(200)

      // 13. rag.png — Indexed Folders dialog with clean path expanded
      showFilesDialog(app)
      await sleep(400)
      const ragDialog = app.window.get_visible_dialog?.()
      const ragExpanders = findAllWidgets(app.window, (w) => w instanceof Adw.ExpanderRow)
      for (const exp of ragExpanders) {
        exp.set_expanded(true)
      }
      await sleep(250)
      await capturePair(app.window, 'rag')
      if (ragDialog) ragDialog.close()
      await sleep(200)

      // 14. stats.png — Performance Stats dialog
      showStatsDialog(app)
      await sleep(400)
      const statsDialog = app.window.get_visible_dialog?.()
      await capturePair(app.window, 'stats')
      if (statsDialog) statsDialog.close()
      await sleep(200)

      // 15. skills.png — Skills management window (Canvas selected showing Enabled + Custom Tools + editor)
      const skillsWin = new ManageWindow(app, 'skills')
      skillsWin.window.set_size_request(WIN_W, WIN_H)
      skillsWin.window.set_default_size(WIN_W, WIN_H)
      skillsWin.select('canvas')
      skillsWin.show()
      await sleep(300)
      skillsWin.window.set_focus(null)
      await sleep(200)
      await capturePair(skillsWin.window, 'skills')
      skillsWin.window.close()
      await sleep(200)

      // 16 & 17. mcp.png + mcp-catalog.png — MCP Servers window (deepwiki connected + per-tool switches) & Catalog
      const mcpWin = new ManageWindow(app, 'mcp')
      mcpWin.window.set_size_request(WIN_W, WIN_H)
      mcpWin.window.set_default_size(WIN_W, WIN_H)
      mcpWin.select('deepwiki')
      mcpWin.show()
      await sleep(450)
      await capturePair(mcpWin.window, 'mcp')

      showMcpCatalogDialog(mcpWin.window, () => {})
      await sleep(350)
      await capturePair(mcpWin.window, 'mcp-catalog')
      mcpWin.window.close()
      await sleep(200)

      printerr('All 17 @2x screenshot pairs captured successfully.')
    } catch (e) {
      printerr('CAPTURE ERROR:', e)
      if (e && e.stack) printerr(e.stack)
    } finally {
      app.quit()
    }
  })()
})

app.run([])
