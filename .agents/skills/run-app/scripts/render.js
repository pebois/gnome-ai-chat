import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk?version=4.0'
import GLib from 'gi://GLib'
import Gtk from 'gi://Gtk?version=4.0'
import { exit, programArgs } from 'system'

const usage = `usage: gjs -m render.js <dist module> <export> [--args JSON] [--width 360] [--height 640] [--dark | --light] [--wait 1500] [--out file.png]
  <dist module>  path under dist/, e.g. app/dialog/pull.mjs
  <export>       function to call as fn(app, ...args); it may present a dialog on app.window,
                 open its own window, or return a widget to show as the window content`

const opts = { args: '[]', width: '360', height: '640', wait: '1500', out: '', dark: false, light: false }
const positional = []
for (let i = 0; i < programArgs.length; i++) {
  const arg = programArgs[i]
  if (arg === '--dark') opts.dark = true
  else if (arg === '--light') opts.light = true
  else if (arg.startsWith('--')) opts[arg.slice(2)] = programArgs[++i]
  else positional.push(arg)
}
if (positional.length !== 2) {
  printerr(usage)
  exit(2)
}

const scriptDir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0])
const repo = GLib.canonicalize_filename(GLib.build_filenamev([scriptDir, '..', '..', '..', '..']), null)
const dist = `file://${repo}/dist`
const [modulePath, exportName] = positional
const width = Number(opts.width)
const height = Number(opts.height)
const out = opts.out || `${GLib.get_current_dir()}/${exportName}-${width}${opts.dark ? '-dark' : ''}.png`

const sleep = (ms) => new Promise((resolve) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
  resolve()
  return GLib.SOURCE_REMOVE
}))

Adw.init()
const { css } = await import(`${dist}/app/global.css.mjs`)
const provider = new Gtk.CssProvider()
provider.load_from_string(css)
Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
Adw.StyleManager.get_default().color_scheme = opts.dark ? Adw.ColorScheme.FORCE_DARK : opts.light ? Adw.ColorScheme.FORCE_LIGHT : Adw.ColorScheme.DEFAULT

const { DEFAULT_SETTINGS } = await import(`${dist}/lib/constants.mjs`)
const win = new Adw.ApplicationWindow({ default_width: width, default_height: height, content: new Gtk.Label({ label: 'main window' }) })
const noop = () => undefined
const app = {
  window: win,
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  models: ['llama3.2', 'qwen3'],
  model: 'llama3.2',
  toolModels: [],
  conversations: [],
  skills: [],
  skillsManager: { items: [], hasModifiedBuiltins: () => false, save: async () => undefined, remove: async () => undefined },
  mcp: { servers: [], items: [], status: new Map(), getServerTools: () => [], isToolEnabled: () => true, save: async () => undefined, remove: async () => undefined },
  tools: { list: () => [], get: () => undefined },
  provider: {},
  activeArtifacts: new Map(),
  isLoaded: true,
  isBusy: false,
  supportsVision: false,
  connect: () => 0,
  disconnect: noop,
  getShortcut: () => null,
  isGeneratingMessage: () => false,
  isSummarizing: () => false,
  persistConversation: async () => true,
  requestToolPermission: async () => true,
  reportError: (message, err) => printerr(`reportError: ${message} ${err}`),
  showToast: (message) => printerr(`toast: ${message}`)
}
for (const name of ['activateAction', 'cancelFilesIndexing', 'ensureWindow', 'focusInput', 'setPendingConversationId', 'saveSettings', 'saveSkills', 'saveConversations', 'sendNotification', 'setConversationTitle', 'setGeneratingMessage', 'setModel', 'setSummarizing', 'setTheme', 'setSyntax', 'toggleDebug', 'toggleSidebar']) {
  app[name] = noop
}
for (const name of ['clearAllConversations', 'handleQuit', 'indexFiles', 'init', 'reloadModels', 'setConversation']) {
  app[name] = async () => undefined
}

win.present()
await sleep(300)

const before = new Set(Gtk.Window.list_toplevels())
const mod = await import(`${dist}/${modulePath}`)
if (typeof mod[exportName] !== 'function') {
  printerr(`${modulePath} has no exported function ${exportName}; exports: ${Object.keys(mod).join(', ')}`)
  exit(1)
}
const extra = JSON.parse(opts.args)
const result = await mod[exportName](app, ...extra)
if (result instanceof Gtk.Widget && !(result instanceof Gtk.Window) && !result.get_parent()) win.set_content(result)
await sleep(Number(opts.wait))

const opened = Gtk.Window.list_toplevels().filter((w) => !before.has(w) && w.get_visible())
const target = opened.find((w) => w instanceof Gtk.Window) ?? win
if (target !== win) target.set_default_size(width, height)
await sleep(300)

const paintable = new Gtk.WidgetPaintable({ widget: target })
const snapshot = new Gtk.Snapshot()
paintable.snapshot(snapshot, target.get_width(), target.get_height())
const node = snapshot.to_node()
if (!node) {
  printerr('nothing was drawn')
  exit(1)
}
target.get_native().get_renderer().render_texture(node, null).save_to_png(out)
print(`${out} ${target.get_width()}x${target.get_height()}${target === win ? '' : ` (${target.constructor.name})`}`)
for (const w of Gtk.Window.list_toplevels()) w.close()
exit(0)
