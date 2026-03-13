# Ollama Chat GNOME App

A simple chat application for GNOME built with TypeScript (compiled to GJS), Gtk4, and Libadwaita. It communicates with the Ollama HTTP API.

## Features

- **Native GNOME Experience**: A clean, modern UI built with Libadwaita that respects your system theme and feels like a first-class citizen.
- **Smart Model Management**: Automatically detect local models, pull new ones from the registry with live progress, and monitor detailed VRAM/CPU memory footprints.
- **Intelligent Search**: Find past conversations using semantic vector search—it understands the meaning of your queries, not just keywords. Background indexing ensures results are always up to date without slowing down your exit.
- **Power-User Workflow**: Fast slash commands with dynamic filtering, full keyboard navigation, and `Tab` completion. Quickly fetch Hacker News headlines or compress conversations to save context.
- **Agentic Capabilities**: Give your models the power to fetch web pages (with persistent caching), search local files, launch apps, perform complex math, and take screenshots.
- **Rich Conversations**: Full support for multimodal image attachments, markdown formatting, and configurable reasoning levels for "thinking" models.
- **Performance Insights**: Built-in statistics to track API latency (including embeddings), tool execution times, and token usage per model.
- **Organized by AI**: New conversations are automatically categorized with AI-generated titles and relevant emojis.
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

3.  **System Dependencies**: You need GJS, Gtk4, and Libadwaita installed on your system.

    On Fedora:
    ```bash
    sudo dnf install gjs gtk4 libadwaita
    ```

    On Ubuntu:
    ```bash
    sudo apt install gjs libgtk-4-dev libadwaita-1-dev gir1.2-webkit-6.0 libwebkitgtk-6.0-dev
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
