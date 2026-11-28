# Gnome AI Chat

A native desktop client for chatting with local Ollama models on GNOME. Built with GTK 4 and Libadwaita, it keeps everything on your machine — conversations, settings, memory, and search indexes live in a local SQLite database.

See the [screenshots gallery](screenshots/README.md) for a visual tour.

## What it does

- **Local models via Ollama** — detect installed models, pull new ones with live progress, inspect running models, and adjust reasoning levels.
- **Built-in tools & MCP servers** — use built-in tools (web search, page fetching, local files, shell, memory, HTML preview) or connect external Model Context Protocol servers over stdio or Streamable HTTP, including a built-in catalog of public servers. Sensitive actions ask for approval by default, with Ask / Auto-accept / Deny rules per category and per server.
- **Skills & sub-agents** — switch personas with `@skills` or let the model delegate subtasks to a skill in its own context. You can edit, disable, or create custom skills, and configure separate tool profiles for the main agent and sub-agents.
- **Chat with your files & the web** — index local folders for offline RAG search, attach images, screenshots, or text files, and run `/deepsearch` for multi-step cited web research.
- **Built for daily use** — semantic search across past chats, in-conversation find (`Ctrl+Shift+F`), slash commands, pinned chats, answer details and clickable sources, and duplicate-free JSON import/export.

## Requirements

- **Node.js 26** and npm (to build the TypeScript sources)
- **Ollama**, running locally with at least one model:

  ```bash
  ollama serve
  ollama pull gpt-oss
  ```

- **GNOME libraries** — GJS, GTK 4, Libadwaita 1.6+ (GNOME 47+), WebKitGTK 6, GtkSourceView 5, libsoup 3, GLib tools, and SQLite.

  On Fedora:

  ```bash
  sudo dnf install gjs gtk4-devel libadwaita-devel webkitgtk6.0-devel gtksourceview5-devel libsoup3-devel sqlite
  ```

  On Ubuntu:

  ```bash
  sudo apt install gjs libgtk-4-dev libadwaita-1-dev gir1.2-webkit-6.0 libwebkitgtk-6.0-dev gir1.2-gtksource-5 libgtksourceview-5-dev gir1.2-soup-3.0 libglib2.0-dev-bin sqlite3
  ```

## Build and run

```bash
npm install
npm run build
npm start
```

During development, `npm run build-watch` rebuilds automatically on file changes.

### Flatpak

Generate the offline npm cache first, then build and run the Flatpak:

```bash
npm run flatpak-cache   # creates .npm-cache.tar.gz for the sandboxed build
npm run flatpak-build   # builds and installs the Flatpak locally
npm run flatpak-run
```

### GNOME Shell extension

An optional GNOME Shell extension (GNOME Shell 45–51) adds a top-bar menu and a global shortcut to toggle the window, start a new chat, or quit the app.

```bash
npm run extension-install
npm run extension-enable
```

Restart GNOME Shell afterwards: press `Alt+F2`, type `r`, and press Enter on X11, or log out and back in on Wayland.

The default shortcut is `<Super>i`. You can change it in the Extensions app or with `dconf-editor` at `/org/gnome/shell/extensions/gnome-ai-chat/toggle-shortcut`.

## Development

The app is written in TypeScript, bundled with `tsdown` for GJS, tested with Jest, and linted with ESLint:

```bash
npm test
npm run lint
npm run lint-fix
```

Project layout:

- `src/` — application source and tests
- `extension/` — GNOME Shell extension
- `scripts/screenshots/` — reproducible `@2x` screenshot generator
- `bin/`, `icons/`, `screenshots/` — launcher script and visual assets
- `io.github.pebois.gnome-ai-chat.*` — Flatpak manifest, desktop entry, AppStream metainfo, and D-Bus service

See [CHANGELOG.md](CHANGELOG.md) for the release history.

## License

MIT — see [LICENSE](LICENSE).
