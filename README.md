# Gnome AI Chat

I wrote this app to chat with local language models on my GNOME desktop. It is a native window built with GTK 4 and Libadwaita, and it talks to Ollama on your own machine. Your chats, settings and search index stay on your computer.

It is for people who run Ollama and want a desktop chat that looks like the rest of GNOME. You can pull and manage models, search old conversations, attach images and text files, and let a model use tools such as web search, with a prompt asking for your approval each time.

The code is TypeScript. It is compiled to JavaScript and run with GJS, and it targets GNOME 45 and later.

## What you need

- Node.js and npm, to install the dependencies and build the code.
- Ollama, running, with at least one model:

  ```bash
  ollama serve
  ollama pull gpt-oss
  ```

- GJS, GTK 4, Libadwaita, WebKitGTK, GtkSourceView and SQLite.

  On Fedora:

  ```bash
  sudo dnf install gjs gtk4-devel libadwaita-devel webkitgtk6.0-devel gtksourceview5-devel sqlite
  ```

  On Ubuntu:

  ```bash
  sudo apt install gjs libgtk-4-dev libadwaita-1-dev gir1.2-webkit-6.0 libwebkitgtk-6.0-dev gir1.2-gtksource-5 libgtksourceview-5-dev sqlite3
  ```

## Install and run

```bash
npm install
npm run build
npm start
```

While I work on the code, I use `npm run build-watch` to rebuild on every change.

### Flatpak

```bash
npm run flatpak-build   # build and install the Flatpak
npm run flatpak-run     # run it
npm run flatpak-cache   # make .npm-cache.tar.gz for offline builds
```

### GNOME Shell extension

The extension adds a panel menu and a shortcut to show or hide the chat window, start a new conversation or quit the app.

```bash
npm run extension-install
npm run extension-enable
```

After enabling it, restart GNOME Shell. On X11, press `Alt+F2`, type `r` and press Enter. On Wayland, log out and back in.

The default shortcut is `<Super>i`. You can change it with `dconf-editor` under `/org/gnome/shell/extensions/gnome-ai-chat/toggle-shortcut`, or in the Extensions app.

## Tests and lint

```bash
npm test
npm run lint
npm run lint-fix
```

Tests use Jest. Lint uses ESLint.

## Where things are

- `src/` is the application code.
- `extension/` is the GNOME Shell extension.
- `bin/` holds the launcher script.
- `icons/` and `screenshots/` hold the images.
- `io.github.pebois.gnome-ai-chat.*` are the Flatpak manifest, desktop file, metainfo and D-Bus service.
- `CHANGELOG.md` lists what changed in each version.

## License

MIT. See `LICENSE`.
