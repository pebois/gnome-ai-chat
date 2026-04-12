# Project Overview

This is a GNOME desktop application built with TypeScript, GJS, GTK4, and Libadwaita. It serves as a simple, modern chat interface that communicates with a local Ollama HTTP API to interact with large language models. The application features a split-view layout with a sidebar for chat history, dynamic model selection, message streaming, and a floating overlay for the chat input.

## Product features
- **Native GNOME Experience**: Seamlessly integrates with the GNOME desktop using GTK4 and Libadwaita, offering responsive layouts and system theme synchronization.
- **Dynamic Model Management**: Automatically detects local Ollama models with support for fine-tuning advanced parameters (Temperature, Top K, Top P, Context Window).
- **In-App Model Pulling**: Download models directly from the Ollama registry through a dedicated dialog featuring real-time download progress, speed, and time estimations.
- **Real-Time Streaming & Reasoning**: Experience immediate feedback with text streaming and adjustable reasoning depth (None, Low, Medium, High) for complex queries.
- **Multimodal Capabilities**: Effortlessly include images in prompts using drag-and-drop or the native file picker for vision-enabled models.
- **Smart Chat Organization**: Automatically categorizes conversations with concise AI-generated titles and relevant emojis for effortless navigation.
- **Rich Text Rendering**: Full Markdown support including code blocks, tables, headers, and text formatting, cleanly rendered natively using Pango markup and GTK widgets.
- **Integrated System Tools**: Expand model capabilities with built-in function calling for time, math calculations, web fetching, HTML parsing, system info, file searching, app launching, desktop automation, code execution, persistent memory, and screenshots.
- **Comprehensive Analytics**: Monitor performance with detailed statistics on API latency, tool execution times, and per-model token consumption.
- **Advanced Chat Controls**: Full-featured chat management including search, message copying, session restarting, keyboard shortcuts, and smart bottom-scrolling.
- **Quick Slash Commands**: Execute powerful inline actions (e.g., `/hn` for Hacker News, `/compress` to optimize context) with a dynamic, filterable autocomplete interface.
- **Local RAG (Chat with your Files)**: Index local folders into a private SQLite vector store to ground model answers in actual code and documentation without cloud uploads.
- **Skills Editor**: Dedicated, full-size window with markdown syntax highlighting for creating and managing custom persona instructions and system prompts. Quickly apply them with @-mentions in the chat input.
- **Auto-Attach Screenshots**: Effortlessly capture and include screen contents directly in the chat input for visual analysis.
- **Semantic History Search**: Locate past conversations conceptually using local vector embeddings, grouped chronologically, with seamless background indexing.
- **Resource Monitoring**: Track active models and their hardware footprint (VRAM, CPU, Total Memory, and TTL) through the 'Running Models' view.
- **Privacy-First Storage**: 100% local, private data persistence using a robust SQLite database to prevent data loss and support efficient, centralized state management.

## Technologies
- **Language**: TypeScript (compiled to JavaScript for GJS)
- **UI Framework**: GTK4, Libadwaita (`Adw`), GtkSourceView 5 (`GtkSource`), and WebKitGTK 6.0 (`WebKit`)
- **HTTP Client**: Libsoup 3.0 (`Soup`) with persistent RFC-compliant caching for web tools.
- **Backend API**: Ollama (Local HTTP API at `localhost:11434`)
- **Testing**: Jest & `ts-jest`
- **Type Definitions**: GNOME JavaScript typings via `@girs/` packages

## Building and Running

### Prerequisites
1.  **Node.js & npm**: Required to manage dependencies and build the TypeScript code.
2.  **Ollama**: Must be installed, running (`ollama serve`), and have at least one model pulled (e.g., `ollama pull gpt-oss`).
3.  **System Dependencies**:
    - Fedora: `sudo dnf install gjs gtk4 libadwaita`
    - Ubuntu: `sudo apt install gjs libgtk-4-dev libadwaita-1-dev`

### Installation
First, install the project's node dependencies:
```bash
npm install
```

### Running the Application
The application must be compiled to JavaScript before running:
```bash
npm run build
npm start
```

For development, you can watch for file changes and automatically rebuild:
```bash
npm run build-watch
```

### Flatpak
```bash
npm run flatpak-build   # build and install the Flatpak
npm run flatpak-run     # run the installed Flatpak
npm run flatpak-cache   # generate npm-cache.tar.gz for offline Flatpak builds
```

### Running Tests
Execute the test suite using Jest:
```bash
npm test
```

## Project Structure

```
src/
  main.ts               # entry point
  app/
    index.ts            # App (Adw.Application) — thin orchestrator
    global.css.ts       # bundled CSS
    dialog/
      files.ts          # local RAG paths management dialog
      image.ts          # image preview and slideshow dialog
      ps.ts             # running models dialog (memory and expiration)
      pull.ts           # model pull dialog (with progress and speed tracking)
      shortcuts.ts      # keyboard shortcuts dialog
      stats.ts          # performance and usage statistics dialog
      toolcall.ts       # tool call and response details dialog
    page/
      empty.ts          # empty state page (no models found)
      error.ts          # error state page (Ollama unreachable)
      loading.ts        # initial loading state page
    ui/
      attachments.ts    # multi-image attachment handling
      chat.ts           # Chat class — right-pane container
      commands.ts       # Slash commands handler and popover
      history.ts        # History class — message list and pagination logic
      images.ts         # Images class — base64 rendering and scaling
      input.ts          # Chat input component with model selector and attachments
      message.ts        # Message class — message bubble component (decomposed)
      models.ts         # Models dropdown component
      scroll.ts         # ScrollManager for "stick to bottom" logic
      sidebar.ts        # Sidebar class — left-pane and conversation lifecycle
      skills.ts         # Skill mentions handler and popover (e.g. @coder)
    window/
      about.ts          # about dialog
      main.ts           # AppWindow class — main window orchestrator
      preferences.ts    # preferences dialog (General, Prompt, Data, Advanced, Vector Indexing)
      skills.ts         # Skills Editor window orchestrator
  lib/
    agent/
      summarize.ts      # AI agent for conversation titles
    commands/           # slash command implementations
      chat.ts           # chat-related commands (/clear, /compress, /hn)
      dialogs.ts        # commands to open dialogs (/settings, /shortcuts, /ps, /pull, /stats, /skills, /about)
      files.ts          # local RAG files management commands (/files)
      index.ts          # command/subcommand definitions (required: name, description, icon)
      memory.ts         # knowledge graph commands (/memory)
      system.ts         # system and app state commands (/debug, /quit)
      ui.ts             # navigation commands (internal, hidden from menu)
    db/
      conversations.ts  # conversation data store
      files.ts          # local file RAG vector store
      index.ts          # SQLite database connection and migration logic
      memory.ts         # knowledge graph data store
      settings.ts       # user preferences store
      skills.ts         # custom skills store
      types.ts          # database schemas
    skills/
      automation.ts     # default instructions for automation
      canvas.ts         # default instructions for canvas rendering
      coder.ts          # default instructions for coding
      files.ts          # default instructions for file search
      index.ts          # skill initialization logic
      memory.ts         # default instructions for memory management
      reviewer.ts       # default instructions for code review
      writer.ts         # default instructions for writing
    tools/
      index.ts          # tools export and runner
      automation.ts     # desktop automation tools
      code.ts           # code evaluation and execution tools
      desktop.ts        # app listing and launching tools
      files.ts          # file search tool
      html.ts           # html parsing and extraction tools
      math.ts           # dice rolling and calculator tools
      memory.ts         # persistent memory tools
      system.ts         # system info and screenshot tools
      time.ts           # time and timezone tools
      web.ts            # web page fetching tool
    ambient.d.ts        # type definitions for GJS and external libraries
    app.ts              # AppInterface definition
    constants.ts        # application-wide constants
    debug.ts            # centralized debug logging utility
    ollama.ts           # Ollama HTTP API client
    screenshot.ts       # screenshot capture logic
    splitter.ts         # text chunking for vector embeddings
    timeout.ts          # async utilities (debounce, poll, sleep)
    tracker.ts          # performance and usage tracking logic
    ui.ts               # UI utility helpers (actions, widgets, confirmation dialogs)
    utils.ts            # markdown→Pango, formatting, and general helpers
  test/
    *.test.ts           # Jest test suites
```

## Development Conventions

### AI Assistant Behaviors
- **Post-Update Workflow**: After executing a plan or making source code updates, you MUST automatically run the following commands in order:
  1. `npm run lint`
  2. `npm run lint-fix`
  3. `npm run build`
- **Changelog**: After verifying that the build and linting commands pass, you MUST update `CHANGELOG.md` to document the changes made during the session.
- **Release Workflow**: When instructed to bump a version or prepare a release, you MUST execute the following exact steps:
  1. Use `npm version <type> --no-git-tag-version` to seamlessly update `package.json` and `package-lock.json`.
  2. Update the `Version` field in `io.github.pebois.gnome-ai-chat.desktop`.
  3. Update `export const VERSION` in `src/lib/constants.ts`.
  4. Update `io.github.pebois.gnome-ai-chat.metainfo.xml` by adding a new `<release>` block with the new version, today's date, and a summary of the most significant changes.
  5. Finalize `CHANGELOG.md` by replacing the `[Unreleased]` header with the new version and today's date (e.g., `## [1.7.0] - YYYY-MM-DD`), and insert a new empty `## [Unreleased]` block above it.
  6. After verifying the build, commit the changes using `git commit -a -m "Release version X.Y.Z"` along with an extended description summarizing the `CHANGELOG.md` additions.

### Architecture & State
- **Orchestration**: `App` (implementing `AppInterface`) is the central source of truth and mediator. All persistent settings and global state transitions flow through it. Use `app.settings` for direct access and `app.saveSettings()` to persist changes. The `handleQuit` lifecycle ensures background indexing and data persistence.
- **Component isolation**: UI components like `Chat`, `Sidebar`, `Input`, `History`, and `Images` should be passed the `AppInterface` to access shared state and actions, but should manage their own internal widget lifecycle.
- **Data persistence**: Use the `Database` class and specialized stores in `src/lib/db/` for all data persistence. Data is stored in the user's data directory using SQLite. The `_queue` in the `Database` class ensures that all SQL operations are executed sequentially to maintain integrity.

### GJS & GNOME Specifics
- **GObject Lifecycle**: Always use `GObject.registerClass` for custom widgets or application classes that need to integrate with the GObject type system.
- **Signal Connections**: When connecting to signals (e.g., `button.connect('clicked', ...)`), ensure that any long-running or repeated connections are properly managed to avoid memory leaks.
- **Promisification**: Leverage `Gio._promisify` (already set up in `lib/ollama.ts` and database modules) to avoid callback hell. Do not use sync methods for I/O on the main thread.
- **Markup**: All user-facing text that may contain formatting should be escaped via `pangoEscape()` before being passed to `markdownToPango()` to prevent XSS-like markup injection.

### UI Patterns
- **Adwaita First**: Use `Adw` widgets (`Adw.StatusPage`, `Adw.PreferencesWindow`, `Adw.ActionRow`) for all standard UI patterns to ensure a native GNOME 45+ look and feel.
- **Dynamic Lists**: Use `Gtk.ListBox` with `Adw.ActionRow` for settings and sidebars. For complex lists, use `Gtk.SignalListItemFactory`.
- **Actions**: Define application-wide logic as `Gio.SimpleAction` inside `App._setupActions`. Use `app.activateAction('name', parameter)` to trigger them from anywhere.
- **Responsiveness**: Use `Adw.Breakpoint` and `Adw.Clamp` to ensure the application remains usable at narrow widths (e.g., on mobile or tiled views).

### Tool Development
- **Definition**: New tools must be defined as a `Tool` object in a relevant file under `lib/tools/`.
- **Registration**: Export the tool and its handler, then register it in `lib/tools/index.ts` within the `onToolCall` dispatcher.
- **Execution**: Handlers should return a `string` (or a `Promise<string>`). Web fetching utilizes a singleton `Soup.Session` with `Soup.Cache` for efficiency.
- **Security & Permissions**: High-risk tools (like shell commands or file writes) must integrate with the Tool Execution Permissions layer to prompt users for approval before executing side effects.

### Testing & Quality
- **No Mocks**: Tests must use real components and logic. For network calls, use the actual `Ollama` client pointing to a local instance or expect it to be available.
- **Path Aliases**: Always use `@/` for internal imports. This is critical for the build pipeline.
- **Type Safety**: Avoid `any`. Define interfaces for all JSON responses (Ollama API, local storage).
- **Comments**: Comments are strictly forbidden. Code must be self-documenting through clear naming and small, focused functions. Remove all existing comments.

## Deployment & Distribution
- **Flatpak**: This is the primary distribution format. The `io.github.pebois.gnome-ai-chat.json` manifest defines the build environment and dependencies.
- **Resources**: Icons and desktop files are located in `icons/` and the root directory, following the Reverse DNS naming convention (`io.github.pebois.gnome-ai-chat`).
