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
- **Integrated System Tools**: Expand model capabilities with built-in function calling for time, math calculations, web fetching, HTML parsing, system info, file searching, app launching, code execution, and persistent memory.
- **MCP Servers**: Register Model Context Protocol servers (stdio or Streamable HTTP) in the MCP Servers window; their tools are advertised to the model next to the built-in ones under the MCP permission tier with per-server overrides, and managed with the `/mcp` command.
- **Comprehensive Analytics**: Monitor performance with detailed statistics on API latency, tool execution times, and per-model token consumption.
- **Advanced Chat Controls**: Full-featured chat management including search, message copying, session restarting, keyboard shortcuts, and smart bottom-scrolling.
- **Quick Slash Commands**: Execute powerful inline actions (e.g., `/hn` for Hacker News, `/compress` to optimize context) with a dynamic, filterable autocomplete interface.
- **Local RAG (Chat with your Files)**: Index local folders into a private SQLite vector store to ground model answers in actual code and documentation without cloud uploads.
- **Skills Editor**: Skills window with markdown syntax highlighting for creating and managing custom persona instructions (a persona is a skill). Each skill can be turned off, can replace the agent's tools with its own built-in tools and MCP servers, and can be run by the model as a sub-agent (`run_skill`). Settings → Tools attaches tools, MCP servers and skills to the main agent and to sub-agents separately. Quickly apply them with @-mentions in the chat input.
- **Auto-Attach Screenshots**: Effortlessly capture and include screen contents directly in the chat input for visual analysis.
- **Semantic History Search**: Locate past conversations conceptually using local vector embeddings, grouped chronologically, with seamless background indexing.
- **Resource Monitoring**: Track active models and their hardware footprint (VRAM, CPU, Total Memory, and TTL) through the 'Running Models' view.
- **Chat Import and Export**: Export all chats (or one) to JSON and import them back with a merge that never duplicates: missing chats are added and an existing chat is replaced only by a newer version.
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
      preferences/      # preferences window pages (General, Appearance, Prompt, Tools, Permissions, Advanced, Data)
        tools.ts        # Tools page: Main Agent / Sub-agents profiles
        access.ts       # shared list of switches (built-in tools, MCP servers, skills) used by profiles and skills
      manage/           # window shared by skills and MCP servers, one window per section
        index.ts        # ManageWindow: one section, shortcuts, deep links (showManageWindow)
        section.ts      # ManageSection<T>: selection, debounced save, name validation, create, delete
        sidebar.ts      # ItemSidebar<T>: search, grouped list, row context menu
        editor.ts       # EditorShell: header (sidebar toggle, delete, extras) and empty/content stack
      mcp/
        section.ts      # MCP section: rows with status and tool counts, catalog, empty page
        editor.ts       # server panel: Overview and Settings tabs
        overview.ts     # Overview tab: live status, connection test, per-tool switches
        settings.ts     # Settings tab: transport fields, environment/headers, permission override, timeout
        catalog.ts      # catalog dialog
      skills/
        section.ts      # Skills section: Builtins/Custom groups, reset, semantic search
        editor.ts       # skill panel: name, description, enabled, custom tools list, prompt editor
  lib/
    agent/
      profiles.ts       # agent profiles (main, sub): defaults, migration of the old disabledTools, attach/detach
      delegate.ts       # run_skill helpers: delegate tool definition, delegation parsing, sub-agent system prompt
      request.ts        # planTurn: active skill, system prompt and advertised tools for one turn
      summarize.ts      # AI agent for conversation titles
    commands/           # slash command implementations
      chat.ts           # chat-related commands (/clear, /compress, /hn)
      dialogs.ts        # commands to open dialogs (/settings, /shortcuts, /ps, /pull, /stats, /skills, /about)
      files.ts          # local RAG files management commands (/files)
      mcp.ts            # MCP server commands (/mcp manage, reload, status)
      index.ts          # command/subcommand definitions (required: name, description, icon)
      memory.ts         # knowledge graph commands (/memory)
      system.ts         # system and app state commands (/debug, /quit)
      ui.ts             # navigation commands (internal, hidden from menu)
    db/
      conversations.ts  # conversation data store
      files.ts          # local file RAG vector store
      index.ts          # SQLite database connection and migration logic
      mcp.ts            # MCP server definitions store (mcp_servers table)
      memory.ts         # knowledge graph data store
      settings.ts       # user preferences store
      skills.ts         # custom skills store
      types.ts          # database schemas
    mcp/
      config.ts         # pure helpers: server validation, arg/env parsing, tool-name namespacing, tier resolution
      jsonrpc.ts        # pure JSON-RPC / MCP types, SSE parser, tool schema and result conversion
      permissions.ts    # MCP permission check (global tier with per-server override)
      transport.ts      # transport interface and error helpers
      stdio.ts          # stdio transport (child process, newline-delimited JSON)
      http.ts           # Streamable HTTP transport (Soup, JSON or SSE responses)
      client.ts         # per-server client: initialize, tools/list, tools/call, timeouts, cancellation
      manager.ts        # McpManager (app.mcp): owns the server list, lifecycle, reconnect, registers tools in app.tools
    skills/
      canvas.ts         # default instructions for canvas rendering
      coder.ts          # default instructions for coding
      files.ts          # default instructions for file search
      index.ts          # built-in skills, mentions, merge/reset helpers, availability
      manager.ts        # SkillsManager (app.skillsManager): owns the skill list, save, reset, indexing
      memory.ts         # default instructions for memory management
      reviewer.ts       # default instructions for code review
      writer.ts         # default instructions for writing
    tools/
      index.ts          # BUILTIN_TOOLS table and runner (onToolCall)
      registry.ts       # ToolRegistry (app.tools) and pure enable/permission/profile rules (ToolAccess)
      skills.ts         # run_skill tool (delegation to a skill running as a sub-agent)
      code.ts           # code evaluation and execution tools
      desktop.ts        # app listing and launching tools
      files.ts          # file search tool
      html.ts           # html parsing and extraction tools
      math.ts           # dice rolling and calculator tools
      memory.ts         # persistent memory tools
      system.ts         # system info tools
      time.ts           # time and timezone tools
      web.ts            # web page fetching tool
    ambient.d.ts        # type definitions for GJS and external libraries
    app.ts              # AppInterface definition
    constants.ts        # application-wide constants
    debug.ts            # centralized debug logging utility
    items.ts            # ItemStore / ItemSource contracts shared by skills and MCP servers
    naming.ts           # shared item name validation, unique names and ids
    ollama.ts           # Ollama HTTP API client
    screenshot.ts       # screenshot capture logic
    splitter.ts         # text chunking for vector embeddings
    timeout.ts          # async utilities (debounce, poll, sleep)
    tracker.ts          # performance and usage tracking logic
    transfer.ts         # pure chat import/export: file format, parsing, merge plan (newest wins, no duplicates)
    ui.ts               # UI utility helpers (actions, widgets, confirmation dialogs)
    utils.ts            # markdown→Pango, formatting, and general helpers
  test/
    *.test.ts           # Jest test suites
```

## Development Conventions

### AI Assistant Behaviors
- **Identity**: Your name is Domino.
- **Keyboard Layout**: The user uses an AZERTY keyboard layout. Keep this in mind when suggesting or configuring keyboard shortcuts.
- **Post-Update Workflow**: After executing a plan or making source code updates, you MUST automatically run the following commands in order:
  1. `npm run lint`
  2. `npm run lint-fix`
  3. `npm run build`
- **Changelog**: After verifying that the build and linting commands pass, you MUST update `CHANGELOG.md` to document the changes made during the session.
- **Release Workflow**: When instructed to bump a version or prepare a release, follow the `release` skill (`.agents/skills/release/SKILL.md`):
  1. `npm version <type> --no-git-tag-version` updates `package.json` and `package-lock.json`.
  2. Update `export const VERSION` in `src/lib/constants.ts`.
  3. Rename `## [Unreleased]` in `CHANGELOG.md` to `## [X.Y.Z] - YYYY-MM-DD` and insert a new empty `## [Unreleased]` above it.
  4. Add a `<release>` block to `io.github.pebois.gnome-ai-chat.metainfo.xml` with the version, today's date and a user-facing summary.
  5. Verify (versions, lint, build, tests, `appstreamcli validate`), commit with `Release version X.Y.Z` and a condensed changelog body, then create the lightweight tag `vX.Y.Z`.
  - Never push: give the user `git push origin main vX.Y.Z` instead.
  - Do NOT touch the `Version` field in `io.github.pebois.gnome-ai-chat.desktop`: it declares the Desktop Entry Specification version (fixed at `1.1`), not the application version.

### Architecture & State
- **Orchestration**: `App` (implementing `AppInterface`) is the central source of truth and mediator. All persistent settings and global state transitions flow through it. Use `app.settings` for direct access and `app.saveSettings()` to persist changes. The `handleQuit` lifecycle ensures background indexing and data persistence.
- **Component isolation**: UI components like `Chat`, `Sidebar`, `Input`, `History`, and `Images` should be passed the `AppInterface` to access shared state and actions, but should manage their own internal widget lifecycle.
- **Data persistence**: Use the `Database` class and specialized stores in `src/lib/db/` for all data persistence. Data is stored in the user's data directory using SQLite. The `_queue` in the `Database` class ensures that all SQL operations are executed sequentially to maintain integrity.

### GJS & GNOME Specifics
- **GObject Lifecycle**: Always use `GObject.registerClass` for custom widgets or application classes that need to integrate with the GObject type system.
- **Signal Connections**: When connecting to signals (e.g., `button.connect('clicked', ...)`), ensure that any long-running or repeated connections are properly managed to avoid memory leaks.
- **Promisification**: Leverage `Gio._promisify` (already set up in `lib/ollama.ts` and database modules) to avoid callback hell. Do not use sync methods for I/O on the main thread.
- **Markup**: All user-facing text that may contain formatting should be escaped via `pangoEscape()` before being passed to `markdownToPango()` to prevent XSS-like markup injection.

### GNOME Shell Extension Conventions
- **TypeScript & GJS**: The GNOME Shell extension is located in the `extension/` directory and written in TypeScript (`extension.ts`). It must be compiled to standard ES6 JavaScript (`extension.js`) before distribution.
- **Ambient Type Declarations**: Ambient types for internal GNOME Shell classes are located in `extension/ambient.d.ts`. Add typing declarations there when using new GNOME Shell modules or GJS constructs.
- **Compiling**: Run `npm run extension-build` to compile `extension.ts` into a clean ES JavaScript `extension.js` using `tsdown` (configured via `tsdown.extension.config.js`).
- **GSettings Schemas**: Extension preferences and keybindings are stored in the GSettings schema located in `extension/schemas/org.gnome.shell.extensions.gnome-ai-chat.gschema.xml`. If you modify settings, ensure the XML is updated.
- **Clean Lifecycle**: Always clean up in `disable()`. Remove keybindings, destroy status icons/menus, and nullify references to avoid memory leaks in GNOME Shell.

### UI Patterns
- **Adwaita First**: Use `Adw` widgets (`Adw.StatusPage`, `Adw.PreferencesWindow`, `Adw.ActionRow`) for all standard UI patterns to ensure a native GNOME 45+ look and feel.
- **Dynamic Lists**: Use `Gtk.ListBox` with `Adw.ActionRow` for settings and sidebars. For complex lists, use `Gtk.SignalListItemFactory`.
- **Actions**: Define application-wide logic as `Gio.SimpleAction` inside `App._setupActions`. Use `app.activateAction('name', parameter)` to trigger them from anywhere.
- **Responsiveness**: Use `Adw.Breakpoint` and `Adw.Clamp` to ensure the application remains usable at narrow widths (e.g., on mobile or tiled views).

### Tool Development
- **Definition**: New tools must be defined as a `Tool` object in a relevant file under `lib/tools/`.
- **Registration**: Export the tool and its handler, then add a `builtin(tool, handler, parallelSafe?)` line to `BUILTIN_TOOLS` in `lib/tools/index.ts`, its name to a group in `lib/tools/groups.ts` and, if it needs approval, an entry in `TOOL_PERMISSIONS`.
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
