# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
### Changed
### Fixed
### Removed

## [1.1.0] - 2026-03-30

### Added
- **Auto-Summarize**: Conversation titles and emojis are automatically generated in the background after the first assistant response.
- **Text File Attachments**: Attach text files (plain text, markdown, CSV, JSON, HTML, XML, JavaScript, TypeScript) to messages. Contents are sent to the model as context and displayed as a collapsible syntax-highlighted block above the message bubble.
- **Separate Attachment Actions**: Attach menu now has distinct **Add Picture** and **Add Text** entries, each opening a file chooser filtered to the relevant MIME types.
- **Refined Skill Workflow**: Skills are applied at send time by parsing the `@SkillName` prefix, letting users see and edit the active persona before committing.
- **Enhanced Skill Editing**: Skill configuration dialog now has a significantly larger editing area for easier prompt management.
- **Interactive HTML Canvas**: Added the `render_html` tool powered by WebKitGTK 6.0. The AI can generate and display interactive UIs, games, or data visualizations with embedded CSS and JavaScript in a native preview window.
- **Inline Preview Controls**: Full-size "Open preview" button underneath `render_html` tool calls for immediate on-demand rendering.
- **Model Pull Dialog**: Real-time progress tracking with download speed and estimated time remaining, keyboard support, and cancellation.
- **Vector Indexing Controls**: Progress bar, cancellation, and explicit Stop for the manual indexing tool in Settings.
- **Screenshot Attachment**: "Take Screenshot" added directly to the attachment menu.
- **Global Reset Buttons**: "Reset to default" for all model parameters, reasoning effort, and system prompt in Settings; buttons disable themselves when a value matches its default.
- **Enhanced Slash Command Menu**: Dynamic prefix-bolding filter, full keyboard navigation (`Up/Down`, `PageUp/Down`, `Home/End`, `Tab`, `Return`, `Escape`), wrap-around cycling, tab completion, keyboard shortcut display, and hover-to-select with accent color highlight.
- **Background Search Indexing**: Window hides immediately on close while conversation indexing runs in the background.
- **Appearance Settings**: Dedicated page in Preferences to switch between System, Light, and Dark color schemes.
- **`/debug` Command**: Toggle debug mode and visual development cues.
- **`/hn` Command**: Fetch and summarize the latest Hacker News headlines.
- **`/memory` Command**: Manage knowledge graph memory with sub-commands (`summarize`, `clean`, `optimize`).
- **Syntax Highlighting Themes**: Choose from all available GtkSourceView style schemes (defaulting to `Adwaita-dark`) in Appearance settings.
- **`/compress` Command**: Strip reasoning blocks and tool history from the current conversation to stay within context limits.
- **Persistent Web Caching**: RFC-compliant HTTP cache via `Soup.Cache` for the web fetching tool, persisted across sessions.
- **Wayland Desktop Automation**: `run_automation_command` tool using `ydotool`, with a new `@automation` skill for screenshot-based coordinate analysis.
- **`@canvas` Skill**: Specialized skill for generating and rendering high-quality, self-contained HTML/JS applications, games, and visualizations using the `render_html` tool.
- **`@memory` Skill**: Knowledge Graph specialist skill that proactively persists facts and relationships about the user using the new memory tools.
- **Alphabetical Skill Sorting**: Skills are now sorted alphabetically in the autocomplete menu and settings for easier navigation.
- **Embedding API Tracking**: Embedding API calls are now recorded in performance statistics.

### Changed
- **Conversation Selection**: Default to selecting the most recently updated conversation instead of the oldest one on startup or deletion.
- **Memory Saving Optimization**: Optimized background knowledge graph memory saving and refined file extension to language mapping.
- **Improved Agent Robustness**: Enhanced default system prompt and skill descriptions for better tool sequencing, error recovery, and role-playing accuracy.
- **Refined Tool Metadata**: Updated all tool descriptions with clearer usage constraints, warnings about side effects (e.g., file overwrites, non-interactive shell commands), and discovery prerequisites.
- **Sub-command Autocompletion**: Enhanced slash commands to support nested sub-commands with unique icons and descriptions (e.g., `/memory summarize`).
- **Cumulative System Prompts**: `@` skills now append their specialized instructions to the default system prompt rather than replacing it, maintaining core interaction rules.
- **Robust Syntax Highlighting**: Improved language detection for code blocks and file attachments using a comprehensive extension-to-language mapping (e.g., `ts` -> `typescript`).
- **Intelligent Auto-scroll**: Streaming responses now respect manual scrolling; auto-scroll is temporarily disabled if you scroll up to read previous messages and re-engages once you return to the bottom.
- **Refined Memory Architecture**: Extracted knowledge graph logic into a standalone `MemoryManager` library.
- **Message Layout**: Content and role label are grouped in a shared box with consistent 4px spacing; group is hidden when content is empty.
- **Uniform Message Spacing**: All message parts (thinking, tool calls, images, file attachments, content) use a consistent 12px gap.
- **Optimized Message Rendering**: Content parser streams text and code chunks independently, reducing layout shifts during generation.
- **Project Rebranding**: Renamed from **Ollama Chat** to **Gnome AI Chat** with updated application ID (`io.github.pebois.gnome-ai-chat`).
- **Preferences Reorganization**: Behavior and Reasoning moved to General tab; Maintenance moved to Data tab; Data tab placed last.
- **Improved Tool Architecture**: Web fetching uses a singleton `Soup.Session` for connection pooling and shared cache state.
- **Skill Autocomplete**: Simplified `@` menu removes descriptions and uses a unified symbolic icon.
- **Semantic Search**: Results maintain chronological order grouped by date section; threshold refined to 0.5; full re-index always performed.
- **Sorted Statistics**: Model usage sorted by request count descending.
- **Scroll Button**: 500ms delay before the "Go to bottom" button appears to prevent flicker.
- **Slash Command Behavior**: `/` now triggers at the start of any line; `Return`/click completes the command name before execution; first match auto-focused.
- **Centralized Storage Logic**: Indexing and persistence logic consolidated into the `Storage` class.
- **Clean Settings UI**: Removed verbose descriptions and subtitles from Preferences.
- **Silent Persona Selection**: Removed toast notification when selecting a skill from autocomplete.
- **Images**: Consistently displayed at 250px width via `Gtk.Picture`.
- **`formatSize`**: Always shows exactly two decimal places.

### Fixed
- **Sidebar Dynamic Re-grouping**: Conversations now move between date headers immediately on update.
- **Streaming Resiliency**: Fixed crash on empty final response chunks from the Ollama API.
- **GTK Snapshot Warnings**: Eliminated `Trying to snapshot GtkBox without a current allocation` warnings.
- **Streaming State Protection**: Interaction buttons disabled during response generation to prevent race conditions.
- **Message UI Crash**: Fixed crash when updating button sensitivity for system messages without actions.
- **Data Persistence on Quit**: Mandatory storage flush during exit prevents debounced saves from being lost.
- **Empty Sidebar Headers**: Date headers now removed when their last conversation is deleted.
- **GTK Compatibility**: Replaced `Gtk.ListBox.remove_all()` with manual removal loops for GTK 4.6+ support.
- **GJS Warnings**: Resolved "Too many arguments" warnings for `Gtk.Window.present()`.
- **New Conversation Focus**: Chat input buffer correctly cleared when creating or switching to an empty conversation.
- **Type-Safe Debounce**: Refactored `debounce` to be fully type-safe with a `cancel()` method.
- Fixed sidebar filtering to correctly show/hide date headers during search.
- Fixed command popover not appearing on certain GTK versions due to uninitialized rectangle bounds.
- Fixed focus management in the pull dialog.

### Removed
- **Remote Skill Sync**: Removed "Import from URL" and skill synchronization to focus on local management.
- **Skill Custom Icons**: Removed per-skill icon configuration in favor of a unified style.