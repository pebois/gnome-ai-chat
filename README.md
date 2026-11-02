# Gnome AI Chat App

A simple chat application for GNOME built with TypeScript (compiled to GJS), Gtk4, and Libadwaita. It communicates with the Ollama HTTP API.

## Features

- **Native GNOME Experience**: A clean, modern UI built with Libadwaita that respects your system theme and feels like a first-class citizen.
- **Smart Model Management**: Automatically detect local models, pull new ones from the registry with live progress, and monitor detailed VRAM/CPU memory footprints.
- **Intelligent Search**: Find past conversations using semantic vector search—it understands the meaning of your queries, not just keywords. Background indexing ensures results are always up to date without slowing down your exit.
- **Power-User Workflow**: Fast slash commands with dynamic filtering, full keyboard navigation, and `Tab` completion. Quickly fetch Hacker News headlines or compress conversations to save context.
- **Agentic Capabilities**: Give your models the power to fetch web pages (with persistent caching), search local files, launch apps, perform complex math, and more.
- **Tool Execution Permissions**: Maintain full control over model actions. Every shell command or file operation requires manual approval by default, with granular options to auto-authorize trusted tasks.
- **Interactive HTML Canvas**: Generate and render high-quality, self-contained HTML/JS applications, games, or data visualizations directly in a native native WebKitGTK preview window via the `render_html` tool and `@canvas` skill.
- **Local RAG (Chat with your Files)**: Index local project folders into a private vector store. Use the `@files` skill to ground model answers in your actual code and documentation without cloud uploads.
- **Custom @ Skills**: Instantly switch personas using `@` skills (e.g., `@files`, `@coder`, `@writer`, `@canvas`). Manage and define your own custom system prompts natively in Preferences with alphabetical sorting for easy navigation.
- **Rich Conversations**: Full support for multimodal image attachments, **take screenshots directly into the input**, **text file attachments** (Markdown, CSV, JSON, Code), native syntax-highlighted code blocks with one-click copy, and configurable reasoning levels for "thinking" models.
- **MCP Servers**: Connect external Model Context Protocol servers (stdio or Streamable HTTP) from the dedicated MCP Servers window (`/mcp`), and let models call their tools under the same Ask / Auto-accept / Deny permission controls, with per-server overrides and a `/mcp` command. In the Flatpak build, stdio servers run on the host through `flatpak-spawn`.
- **Transparent Answers**: Every reply shows its model, speed and token count, a live list shows what each tool is doing while it runs, and answers based on your files or web pages list them as clickable sources.
- **Web Search**: Point the app at your SearXNG instance and models can search the web with the `web_search` tool.
- **Find in Conversation**: `Ctrl+Shift+F` finds and jumps between matching messages in long chats.
- **Performance Insights**: Built-in statistics to track API latency (including embeddings), tool execution times, and token usage per model.
- **Organized by AI**: New conversations are automatically categorized with AI-generated titles and relevant emojis.
- **Rename & Pin Chats**: Rename any conversation by hand and pin the important ones to a "Pinned" section at the top of the sidebar.
- **Privacy by Design**: Your data never leaves your machine. Chat history, settings, and vector indexes are stored completely locally.

## Prerequisites

1.  **Node.js & npm**: Required to manage dependencies and build the TypeScript code.

2.  **Ollama**: Ensure Ollama is installed and running.
    ```bash
    ollama serve
    ```
    And make sure you have at least one model pulled:
    ```bash
    ollama pull gpt-oss
    ```

3.  **System Dependencies**: You need GJS, Gtk4, Libadwaita, and SQLite3 installed on your system.

    On Fedora:
    ```bash
    sudo dnf install gjs gtk4-devel libadwaita-devel webkitgtk6.0-devel gtksourceview5-devel sqlite
    ```

    On Ubuntu:
    ```bash
    sudo apt install gjs libgtk-4-dev libadwaita-1-dev gir1.2-webkit-6.0 libwebkitgtk-6.0-dev gir1.2-gtksource-5 libgtksourceview-5-dev sqlite3
    ```

## Installation & Running the App

First, install the project's node dependencies:

```bash
npm install
```

The application must be compiled to JavaScript before running. To build and start the application:

```bash
npm run build
npm start
```

For development, you can use watch mode to automatically rebuild on changes:

```bash
npm run build-watch
```

### Flatpak

```bash
npm run flatpak-build   # build and install the Flatpak
npm run flatpak-run     # run the installed Flatpak
npm run flatpak-cache   # generate npm-cache.tar.gz for offline Flatpak builds
```

### GNOME Shell Extension

A native GNOME Shell extension is included to let you easily show/hide the chat window, start a new conversation, or quit the application directly from the GNOME status panel or via a global hotkey.

#### Installation & Enabling

To install and compile the extension schemas to your local user directory:

```bash
npm run extension-install
```

To enable the extension:

```bash
npm run extension-enable
```

*Note: After enabling the extension, you may need to restart GNOME Shell (on X11, press `Alt+F2`, type `r`, and hit `Enter`; on Wayland, log out and log back in) for the extension to load.*

#### Configuration

The extension registers a global shortcut to toggle the chat window visibility:
*   **Default Shortcut**: `<Super>i`
*   **Customization**: You can customize this shortcut using `dconf-editor` under `/org/gnome/shell/extensions/gnome-ai-chat/toggle-shortcut` or via the Extensions/Extensions-Manager app.


## Development Workflow

The project uses TypeScript and compiles down to JavaScript (GJS) targeting GNOME 45+.

### Testing

Tests are written with Jest. To run the test suite:

```bash
npm test
```

### Linting

Code style is strictly enforced using ESLint.

```bash
npm run lint
npm run lint-fix
```
