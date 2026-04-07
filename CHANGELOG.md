# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.0] - 2026-04-07
### Added
- **Unit Tests**: Added robust, mock-free unit tests for pure logic modules in `src/lib/` including the text splitter and skill prompt builder.
- Index skills using vector embeddings on first application start.

### Removed
- "Restore Default Skills" option from the settings dialog.

### Changed
- **DB Batch Transactions**: Improved database performance by wrapping bulk insert operations (conversations, messages, skills) in SQLite atomic transactions.
- Automatic background indexing for conversations and skills when updated or modified.
- Disabled semantic search indexing on app close to significantly improve shutdown times.

### Fixed
- **Auto-Summarization**: Fixed a bug where cancelling the generation of the first message would still trigger the automatic conversation summarization process.
- **Keyboard Shortcuts**: Fixed "Indexed Folders" shortcut (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) failing to trigger due to missing action parameters.
- Improved parameterized action handling to allow accelerators to trigger commands that normally require string arguments.
- **Memory Leaks**: Addresssed critical memory leaks in chat messages, preferences, and skills dialogs by explicitly managing component lifecycles and utilizing `close-request` handlers instead of the deprecated GTK4 `destroy` signal.
- **Test Configuration**: Resolved TypeScript errors (`TS5011`, `TS5101`) preventing tests from running by explicitly setting `rootDir` and silencing `baseUrl` deprecation warnings in `tsconfig.json`.

### Added
- **Native Markdown Tables**: Implemented a robust markdown table parser that natively renders tables using `Gtk.ColumnView`. This provides a state-of-the-art GTK4 appearance with native column headers, row separators, and dynamic updates during text streaming. Refined header styling to look like plain muted labels and ensured height is based on content. The default AI system prompt has been updated to explicitly allow table generation.
- **Command Visibility Control**: Introduced a `visible` property to the `Command` interface, allowing specific commands to be registered for keyboard shortcuts and actions while remaining hidden from the slash command autocomplete menu.
- **Strict Command Metadata**: The `Command` and `SubCommand` interfaces now require `description` and `icon` properties, ensuring a consistent and documented user experience across the entire command suite.

### Changed
- **Command Menu Refinement**: Hidden internal navigation and system commands (`/toggle-sidebar`, `/search`, `/focus-input`, `/new-conversation`, `/open-conversation`, `/theme`) from the slash command menu to reduce clutter and focus on user-facing actions.
- **Type Safety Improvements**: Refactored the `Command` interface to use `undefined` instead of `null` for optional variants and states, aligning with modern TypeScript standards and improving compatibility with the GJS environment.

### Fixed
- **Linting & Type Safety**: Resolved several `@typescript-eslint` warnings related to unsafe arguments and returns in `src/app/index.ts` and `src/lib/commands/system.ts`.
- **Action Initialization**: Fixed a `Gjs-CRITICAL` error in `src/app/index.ts` by ensuring that `Gio.SimpleAction` properties are correctly initialized with `null` when `undefined`, satisfying the underlying GObject requirements.

## [1.5.1] - 2026-04-07

### Added
- Updated all skill prompts with detailed tool usage instructions and strategies for maximum agent orientation.

### Changed
- The Writer skill prompt now explicitly states it should not use any tools to ensure focus on pure content creation.
- The Reviewer skill prompt no longer includes `run_shell_command` to focus on code analysis rather than execution.
- The Automation skill prompt no longer includes `get_system_info` or `launch_app`.
- The Automation, Canvas, Coder, Files, Memory, and Reviewer skills have received more detailed and tool-integrated prompts.

## [1.5.0] - 2026-04-06

### Added
- **SQLite Database Migration**: Migrated data storage from legacy JSON files to a robust SQLite database. This includes specialized stores for conversations, settings, skills, and memory, with centralized data models and automatic cleanup of old data files on startup. All data operations are now fully asynchronous.
- **Semantic Skill Search**: Implemented semantic matching for skills using local text embeddings. Added a manual re-indexing tool to the Data settings and updated the search interface to support both keyword and conceptual discovery.
- **Auto-Attach Screenshots**: Enhanced the screenshot tool to automatically attach captured images to the chat input, simplifying the workflow for visual analysis.

### Changed
- **Ollama Client Refactoring**: Optimized the `Ollama` client by moving skill detection to the internal request builder and rebuilding the system prompt for every request. This ensures consistent persona application during complex tool-call sequences.
- **Improved Code Block Parsing**: Switched to a more reliable line-by-line parsing strategy with support for nested blocks, varying backtick lengths, better language tag detection, and improved whitespace management.
- **Enhanced Skills Editor**: Refined the Skills Editor UI with expanding layouts, context menus for item management, and new internal shortcuts for search and creation. Updated the global shortcut for opening the editor.
- **Refined UI Styling**: Removed redundant padding from chat messages and cleaned up unused CSS classes and storage properties for a sharper interface.

## [1.4.0] - 2026-04-03

### Added
- **Local RAG (Chat with your Files)**: Index local folders into a private SQLite vector store. Use the `@files` skill to ground model answers in your actual code and documentation without cloud uploads.
- **Tool Execution Permissions**: Added a security layer that prompts for approval before running shell commands or writing files. Includes a new settings page to manage permissions and an auto-accept toggle for trusted workflows.
- **Project Path Management**: New UI in Preferences > Data to manage, remove, and re-index local project paths for the vector store.
- **Enhanced Icon Assets**: Reorganized icon resources with multiple sizes and a theme index for better GNOME theme integration.

### Changed
- **Native Wayland Automation**: Moved desktop automation from external dependencies to native Wayland portals for better security and compatibility.
- **Refined Appearance Settings**: Updated the appearance settings UI with new symbolic icons and improved layout.

### Fixed
- **Standardized Code Style**: Unified logic and formatting within the Skills Editor and core automation tools.

## [1.3.1] - 2026-03-31

### Fixed
- **Code Block Syntax Highlighting**: Fixed an issue where the `GtkSource.Buffer` language was not correctly updated when reusing code block widgets during content streaming.

## [1.3.0] - 2026-03-31

### Added
- **Skills Editor**: Dedicated full-size window (`Ctrl+E`) with a sidebar skill list and a GtkSource markdown editor. Accessible from the main menu, keyboard shortcut, and `/skills` slash command.
- **Skill Sidebar Groups**: Skills are grouped into "Builtins" and "Custom" sections in the sidebar.
- **Skill Sidebar Search**: Search bar (toggle button) in the skills sidebar header to filter skills by name.
- **Skills Slash Command**: `/skills` command added to the command palette.
- **Skills Keyboard Shortcut**: `Ctrl+E` opens the Skills Editor; entry added to the Keyboard Shortcuts dialog.
- **Restore Default Skills**: New action in Settings > Data to reset all builtin skills to their defaults while keeping custom skills.

### Changed
- **Memory Sub-commands**: Pre-filled prompts for `/memory` sub-commands now include the `@memory` trigger at the start to automatically activate the Memory skill.
- **Skills Storage**: Skills are now stored in a separate `skills.json` file instead of inside `settings.json`.
- **Skills Editor Delete**: Delete button is only shown for custom skills; builtin skills cannot be deleted.
- **Skills Editor Reset**: Per-skill reset button (content header) only shown for builtin skills that differ from their defaults.
- **Preferences Skills Tab**: Removed — skill editing moved to the dedicated Skills Editor window.
- **Modular Skill Prompts**: Default skill prompts extracted into individual files under `src/lib/skills/`.
- **Preferences Data Tab**: "Clear All Chats" and "Clear Usage Statistics" grouped together; "Maintenance" section removed.

### Removed
- **Skill Edit Dialog** (`src/app/dialog/skill.ts`): Replaced by the dedicated Skills Editor window.

## [1.2.1] - 2026-03-30

### Fixed
- **Image Carousel**: Fixed an out-of-bounds array access and simplified keyboard navigation logic for the image previewer.
- **Skill Dialog**: Wrapped the system prompt text view in an `Adw.PreferencesRow` to ensure consistent styling and margins.
- **Chat UI**: Removed redundant header CSS class additions during empty state transitions.

## [1.2.0] - 2026-03-30

### Added
- **Image Preview & Slideshow**: Click any image in a message to open a full-size preview. Includes a slideshow with `Adw.Carousel` to cycle through all images in the message using swipe or arrow keys.
- **Skill Prompt Syntax Highlighting**: The skill editor now uses `GtkSource.View` for the system prompt, providing markdown syntax highlighting and automatic theme synchronization with the app's global style.
- **Model Update Notifications**: A banner now appears at the top of the chat when an update is available for the currently selected model. Includes an **Update** button that opens the pull dialog pre-filled with the model name.
- **Dynamic Model Capabilities**: The app now tracks model capabilities (`vision`, `tools`) and adjusts the UI accordingly.
- **Vision-Aware Attachments**: "Add Picture" and "Take Screenshot" actions are automatically disabled if the selected model does not support vision. Existing image attachments are cleared when switching to a non-vision model.
- **Tool Call Error Display**: Responses from tool calls that indicate failure (e.g., starting with "Error" or "Failed") are now styled with an error color in the tool call dialog for better visibility.

### Changed
- **Refined Skill Dialog**: Improved the layout of the Add/Edit Skill dialog using `Adw.PreferencesGroup` and optimized the prompt editor height for a more compact and consistent look.
- **Header Bar Styling**: The chat header bar now automatically becomes flat when viewing an empty conversation or when the message list is short enough to not require scrolling.
- **Improved Scroll Detection**: The scroll management system now correctly identifies reaching the top or bottom of the view even when the content is not scrollable.
- **Tool-Required Model Selection**: The model selector now greys out and disables selection for models that do not support tools, ensuring the active model can always use the app's core features (Skills, Memory, etc.).
- **Model Pull Dialog**: Now supports pre-filling the model name when opened from the update banner.
- **Enhanced Memory Validation**: Improved error handling and validation in the memory management system. The system now provides explicit feedback when operations fail (e.g., trying to add observations to a non-existent entity), helping the AI agent recover from mistakes.
- **Robust Memory Tools**: All memory tool handlers now include comprehensive error catching, returning clear error strings to the model and UI.

### Fixed
- **Preferences Confirmation Placement**: Destructive confirmation dialogs (Clear Chats, Clear Stats) now correctly appear centered over the Preferences window instead of the main application window.
- **History Pagination & Visibility**: Fixed issues where the "Load More" banner would display incorrectly, load duplicate messages, or appear on empty conversations. Refactored history state management to be more robust against layout shifts.
- **Skill Mentions**: The `@persona` trigger is no longer removed from the user's message text when submitted, ensuring it remains visible in the chat history.

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
- **Wayland Desktop Automation**: `run_automation_command` tool using Wayland portals, with a new `@automation` skill for screenshot-based coordinate analysis.
- **`@canvas` Skill**: Specialized skill for generating and rendering high-quality, self-contained HTML/JS applications, games, and visualizations using the `render_html` tool.
- **`@memory` Skill**: Knowledge Graph specialist skill that proactively persists facts and relationships about the user using the new memory tools.
- **Alphabetical Skill Sorting**: Skills are now sorted alphabetically in the autocomplete menu and settings for easier navigation.
- **Embedding API Tracking**: Embedding API calls are now recorded in performance statistics.

### Changed
- **`@canvas` Skill & `render_html` Tool**: Updated descriptions and prompts to prioritize responsive design using the shadcn UI style and zinc theme for all generated HTML content.
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
