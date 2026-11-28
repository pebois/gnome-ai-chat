# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.17.1] - 2026-11-28

### Added
- **CI & CODEOWNERS**: Added a GitHub Actions workflow running lint, build, and tests, along with `.github/CODEOWNERS`.
- **Screenshots Gallery & Generator**: Added a dedicated `screenshots/README.md` gallery and a reproducible `@2x` screenshot generator in `scripts/screenshots/`.

### Changed
- **Documentation & Metadata**: Rewrote `README.md`, cleaned up `CHANGELOG.md`, refreshed `@2x` dark/light screenshots, and aligned AppStream metadata with the current feature set.

## [1.17.0] - 2026-11-17

### Added
- **Import and Export Chats**: Back up all conversations to a single JSON file and restore them from Settings → Data, or with `/export` and `/import`. Imports merge safely without duplicates — missing chats are added, existing ones only update if the file has a newer version, pinned state is kept, active generations are untouched, and the search index is rebuilt for imported chats.
- **License File**: Added the MIT `LICENSE` file to the repository and declared it in `package.json`.

### Changed
- **Single-Chat JSON Export**: Exporting one conversation as JSON now uses the same format as full exports, so any exported chat can be imported back (including files from earlier versions).

### Fixed
- **Cancelled Export Error**: Closing the export file dialog no longer shows a "Failed to export conversation" error.

## [1.16.0] - 2026-11-17

### Added
- **Skills as Sub-agents**: Models can delegate subtasks to a skill in its own isolated context (`run_skill`). Only the final answer returns to the main conversation, keeping long chats lighter. Typing `@Name` still applies a skill directly.
- **Agent Profiles**: Settings → Tools now has a Main Agent / Sub-agents switcher so you can choose which built-in tools, MCP servers, and skills each one gets. For example, an MCP server can stay connected for sub-agents only without cluttering the main context.
- **Custom Tools per Skill**: Any skill can turn on "Use Custom Tools" to pick its own set of built-in tools and MCP servers, overriding the agent profile while it runs. `@Memory`, `@Files`, and `@Canvas` come pre-configured with their own tool lists.
- **Disable Individual Skills**: Skills can be turned off with an Enabled switch instead of deleting them; disabled skills are dimmed in the list and hidden from every agent.
- **Disable Individual MCP Tools**: Each tool on an MCP server now has its own toggle in the server's Overview tab, and the choice persists even if you rename the server.

### Changed
- **Unified Skills & MCP Windows**: The Skills (`/skills`, `Ctrl+Shift+S`) and MCP Servers (`/mcp`, `Ctrl+Shift+M`) windows now share the same sidebar layout, search bar, and shortcuts (`Ctrl+B`, `Ctrl+F`, `Ctrl+N`). Clicking "Manage" on an MCP error toast jumps straight to the failing server.
- **Built-in Skills on Upgrade**: New built-in skills added by an update now appear automatically for existing users without overwriting customized skills.
- **Smarter Skill Saving**: Skill edits are saved shortly after you stop typing instead of on every keystroke, and invalid names are outlined in red just like MCP servers.

### Fixed
- **Duplicate Tool Results**: After the first round of tool calls in a reply, tool calls and their results were sent to the model twice on the next turn. They are now sent once.
- **MCP Reload Overwriting Edits**: Running `/mcp reload` no longer discards edits you just made in the MCP Servers window.

## [1.15.0] - 2026-11-07

### Added
- **Manage Built-in Tools**: Added Settings → Tools to toggle the 28 built-in tools individually or by group (Memory, Files, Shell, Web, Time, Math, System, Applications, Preview). Commands and built-in skills that depend on turned-off tools hide themselves automatically, while `/deepsearch` keeps working even with web tools disabled.
- **MCP Server Catalog**: Added "Add from Catalog" in the MCP Servers window with ready-to-use public servers that require no API key (Memory, Filesystem, Fetch, Exa Search, Desktop Commander, DeepWiki, Context7, Microsoft Learn, Sequential Thinking, Git, Everything). Selected servers are added pre-filled and disabled so you can review them before turning them on.

### Changed
- **Round Skill Picker**: Replaced the "Skill: …" pill with a compact round Skill button next to the attach button. It highlights in the accent color when a skill is active and only lists skills whose tools are enabled.
- **Modern Adaptive Dialogs**: Settings, About, and Pull Model now open as native adaptive dialogs attached to the main window instead of fixed-size separate windows. Closing Pull Model cancels any active download, and file attachments now use the modern GTK file dialog.
- **Consistent Tooltips**: Standardized tooltips across the app to sentence case with uniform shortcut labels, proper plurals for attachment counts, and clearer action wording.

### Fixed
- **Regenerate Right After Streaming**: Clicking Regenerate on a newly finished reply did nothing until the chat was reopened.
- **Message Context Menu**: Right-clicking a message now always opens the message menu ("Copy message", "Regenerate response", "Restart from here") instead of the text widget's Cut/Copy/Paste menu. Selected text still copies with `Ctrl+C`.
- **About Dialog License**: Fixed the About dialog displaying the Artistic License instead of MIT.
- **Duplicate Skills Window**: Opening Skills when it is already open now focuses the existing window.
- **Double Refresh on Empty Page**: Clicking Refresh on the "No Models Found" page no longer triggers two loads.
- **Stop Button Tooltip**: The Stop button no longer keeps the "Send (Enter)" tooltip while generating.
- **Preview Window Cleanup**: Closing an HTML preview window now cleanly detaches its dark-mode listener.

## [1.14.0] - 2026-11-06

### Added
- **Message Details**: Hovering over a reply shows an `ⓘ` button displaying the model, speed (tokens/s), token counts, and generation times without cluttering the chat.
- **Live Tool Calls**: Tool calls now show human-readable labels ("Reading web page", "Searching indexed files"…), their main argument, a live spinner that turns into a check or warning icon, and elapsed time. Clicking a row opens its arguments and full output; `render_html` rows include an "Open Preview" button.
- **Built-in Web Search**: Added a `web_search` tool powered by Wikipedia and DuckDuckGo instant answers that works out of the box with no API key.
- **Deep Search (`/deepsearch`)**: Plans web searches from your question, fetches up to six pages, ranks the best passages, runs a follow-up round if needed, and streams a report with `[n]` citations linked to clickable source buttons. Every step stays inspectable in the chat and can be stopped at any time.
- **Find in Conversation**: Press `Ctrl+Shift+F` (or click the header search button) to highlight every match across paragraphs and code blocks with an occurrence counter ("3 of 7") and `Enter` / `Shift+Enter` navigation that loads older messages as needed.
- **Clickable Answer Sources**: Replies that read local files or web pages show them as clickable source buttons underneath, numbered to match `[n]` citations. Redundant trailing "Sources" lists are hidden visually while still preserved when copying the message.
- **Rename & Pin Chats**: Added "Rename" and "Pin to Top" to the conversation context menu; pinned chats stay grouped at the top of the sidebar regardless of date.

### Changed
- **Indexed Folders Shortcut**: Moved Indexed Folders to `Ctrl+Shift+O` and generated the Keyboard Shortcuts dialog directly from registered commands so bindings never drift out of sync.
- **Regenerate on Assistant Replies**: Moved Regenerate from user messages to assistant replies; user messages keep Copy and Edit.
- **Confirmation for Destructive Commands**: `/clear` and `/compress` now ask for confirmation first, and `/compress` preserves cited sources from deep searches.
- **Smarter Command Palette**: Picking `/deepsearch` prompts with inline ghost text instead of running empty, commands also match by description, and `Enter` is no longer swallowed when nothing is selected.
- **Faster Saves & Re-indexing**: Conversation saves now write only changed rows instead of rewriting entire chats, and background re-embedding waits 30 seconds after edits instead of firing twice per message.

### Fixed
- **Follow-ups After Deep Search**: Follow-up questions keep the deep search report and numbered sources even when the raw research trail no longer fits in the context window.
- **Slash Commands in History**: Messages sent via commands remember the command used — regenerating a `/deepsearch` reruns deep search, "Restart from here" restores the command, and `/hn` / `/memory` display the short command instead of the expanded internal prompt.
- **Messages Starting with `/`**: Normal text starting with a slash (like `/etc/hosts is missing`) is now sent as a message instead of silently dropped, and typos like `/deepserch` suggest the right command.
- **Duplicate Shortcut**: Resolved `Ctrl+Shift+F` being bound to both Find in Conversation and Indexed Folders.
- **Extra Spaces in Commands**: Extra whitespace in `/hn custom`, `/files attach`, or `/mcp reload` no longer breaks argument parsing.
- **Markdown Rendering While Streaming**: Replies no longer fall back to raw Markdown when containing links or overlapping emphasis, and headings, lists, quotes, and rules now render consistently during streaming and after reopening a chat.
- **Database Error Safety**: Failed SQLite reads or writes now report an error toast and roll back cleanly instead of overwriting conversations, skills, settings, or stats with empty defaults.
- **Orphaned Messages**: Deleting a conversation or clearing all chats now removes all associated messages from the database.
- **Switching Chats During Generation**: Leaving and returning to an active conversation keeps streaming live in place instead of dropping chunks or losing the reply.
- **Stuck Loading Indicator**: Replaced the `•••` placeholder with a spinner that clears cleanly on cancel, error, or empty reply, and always re-enables the input after an error.
- **Copy Code While Streaming**: Copying a code block during generation now copies its current contents instead of only the first chunk.
- **Tool Call Result Matching**: Fixed the tool call dialog sometimes showing the first call's result for every tool call when Ollama omitted call IDs.
- **Editing Messages with Attachments**: "Edit message" now restores the message's attached files and images in the input.

## [1.13.0] - 2026-10-28

### Added
- **MCP Servers Window**: Added a dedicated window (`/mcp`, `Ctrl+Shift+M`) to configure Model Context Protocol servers over stdio or Streamable HTTP. It includes live connection status, a Test button, a list of exposed tools, per-server enable toggles, and configurable call timeouts. Servers connect in the background at startup and reconnect automatically with backoff if they drop.
- **MCP Permissions**: Added an "MCP Servers" category in Settings → Permissions (Ask / Auto-accept / Deny, defaulting to Ask) with per-server overrides. Denied servers have their tools omitted from requests.
- **`/mcp` Command & Status Feedback**: Use `/mcp manage` to open the window or `/mcp reload` to reconnect all servers. Connection failures only show a toast when the MCP window is closed, with a Manage button jumping straight to the failing server.
- **Automatic Context Budget**: Requests now fit within the model's context window by trimming the oldest full turns first and truncating very long tool outputs at send time (while keeping full output in history and the tool dialog). A toast notifies you once per chat if older turns were omitted.
- **Capability Warnings**: Shows a toast when the active model does not support tools or images currently in use, instead of silently dropping them.
- **Flatpak Host Spawning**: Stdio MCP servers (such as `npx` or `uvx` tools) now launch on the host via `flatpak-spawn --host` when running inside Flatpak.

### Changed
- **Tool Round Limit**: Responses cap tool-call chaining at 10 rounds, then ask the model for a final answer without tools to prevent infinite loops.
- **Sequential Tool Execution**: Tool calls run in parallel only when all of them are read-only and require no approval; otherwise they run one by one so permission prompts never stack and writes don't collide.
- **Consistent MCP Labels**: MCP tool calls use a uniform `server · tool` label in message rows, tool dialogs, and permission prompts.

### Fixed
- **Freeze When Stopping an MCP Call**: Cancelling a reply while an MCP tool call was running no longer freezes the app.
- **MCP Reconnection & Liveness**: Fixed runaway reconnect loops on crashing servers, silent give-ups on failed HTTP/init reconnects, unreachable HTTP servers staying marked "Connected", protocol version negotiation, and long-running tools timing out despite sending progress updates.
- **MCP Input & Output Safeguards**: Handled invalid UTF-8 from stdio servers, capped oversized tool results, shortened very long tool names safely, stopped repeated pagination loops, and prevented invalid server names from blocking edits to other fields.

## [1.12.1] - 2026-10-09

### Added
- **Active Skill Indicator**: The input bar shows a badge for the active skill whenever your message begins with a valid `@skill` mention.
- **Skill Name Validation**: The Skills editor rejects spaces, special characters, and duplicate names (case-insensitive) with a toast notification.
- **Live Model Reload**: Pulling a new model updates the model dropdown immediately without restarting and automatically selects a newly pulled tool-capable model.

### Changed
- **Cleaner Skill Autocomplete**: `@` skill completion now only triggers at the very beginning of a message, matching when skills actually activate, and strips the `@skill` prefix from the prompt sent to the model while keeping it visible in chat history.

### Fixed
- **Skills Ignored with Attachments**: Fixed `@skill` mentions being skipped whenever files were attached to the message.
- **Skill Name Prefix Collisions**: Typing `@coder` no longer accidentally triggers a skill named `code`.
- **Markup Escaping in Popovers**: Skill and command names containing `&` or `<` no longer break autocomplete rendering.
- **Missing Model Update Banner**: Adapted to Ollama's updated registry digest header so available model updates are detected again.
- **Stale Model List After Pull**: Pulling a model while the app is running now refreshes the dropdown and clears the update banner right away.

## [1.12.0] - 2026-07-03

### Added
- **Three-Tier Tool Permissions**: Every permission category now supports `Ask`, `Auto-accept`, and `Deny`. Denied tools are withheld from the model completely.
- **File Reads & Applications Permissions**: Added "File Reads" (defaulting to Auto-accept) and "Applications" permission categories alongside Terminal Commands and File Edits in Settings → Permissions.

### Changed
- **Cached Model Capabilities**: Model metadata is now cached per model instead of being queried on every turn, making replies start faster. The cache refreshes when models change or the Ollama URL is updated.

### Fixed
- **Reasoning Levels for Tagged `gpt-oss` Models**: Configured reasoning depth (low / medium / high) now applies properly to tagged model IDs like `gpt-oss:latest`.

## [1.11.0] - 2026-06-19

### Added
- **GNOME Shell Extension**: Added a native GNOME Shell extension (GNOME Shell 45–51) with a top-bar menu and customizable global shortcut (`<Super>i` by default) to show/hide the chat window, start a new conversation, or quit the app.
- **Extension Install Scripts**: Added `npm run extension-build`, `extension-install`, and `extension-enable` scripts for local setup.

### Fixed
- **Extension D-Bus Actions**: Fixed the D-Bus object path so "New Conversation" and "Quit" work properly from the panel menu.

## [1.10.0] - 2026-06-19

### Fixed
- **D-Bus Activation**: Enabled `DBusActivatable=true` in the desktop entry and Flatpak configuration so clicking notifications or triggering actions launches the app cleanly from a cold start.

## [1.9.2] - 2026-06-18

### Fixed
- **Startup Database Race**: Deferred loading usage stats until after database tables are initialized, fixing a `no such table: kv_store` error in sandboxed environments.

## [1.9.1] - 2026-06-18

### Added
- **Offline Flatpak Dependencies**: Added offline npm cache support for sandboxed Flathub builds.

### Changed
- **Flathub & Metadata Validation**: Updated the Flatpak manifest, desktop entry, and AppStream metadata to pass validation cleanly.
- **Quieter Debug Logs**: Truncated long message histories and replaced base64 image payloads with placeholders in debug logs, and added clearer logging for vision and skill matching.

## [1.9.0] - 2026-04-14

### Added
- **Automatic Tool Attachments**: Screenshots and files attached to the input are now forwarded automatically during tool-call sequences and cleared once sent.
- **Save Chat Images**: Added a right-click context menu on images in chat history and a download button in the image preview dialog.
- **PDF Export**: Export any conversation to a formatted PDF (with embedded images) via right-click in the sidebar.
- **`@Planner` Skill**: Added a built-in `@Planner` skill that explores, asks clarifying questions, and drafts a plan for approval before making changes.
- **Always-Available Skill Reset**: The "Reset all built-ins" button in the Skills sidebar is now always visible and restores deleted built-in skills too.

### Changed
- **Provider-Agnostic Labels**: Generalized connection and UI labels to no longer hardcode Ollama-specific wording everywhere.

### Removed
- **Desktop Automation & Autonomous Screenshots**: Removed the `@automation` skill and `run_automation_command` tool, and restricted screenshots to user-initiated attachments for better control and privacy.

### Fixed
- **Code Block Flickering**: Appending streamed chunks to existing code buffers eliminates visual flicker while code is generating.
- **File Write Crash**: Fixed a crash when saving files through file tools.
- **HTML Export Formatting**: Removed extraneous leading indentation in exported HTML files.
- **Skills Editor Warnings & Startup**: Fixed editor warnings while typing and a startup error when initializing default skills.
- **Tool Call Text Wrapping**: Improved line wrapping for long arguments and results in the tool call dialog.
- **Shutdown & Cancellation Bugs**: Fixed background indexing being lost on quit, settings resetting on early exit, and active generations continuing after deleting or clearing a chat.

## [1.8.0] - 2026-04-09

### Added
- **Regenerate Response**: Added a "Regenerate response" action to re-submit a prompt and get a fresh answer.
- **RSS Feed Tool**: Added `fetch_rss_feed` to parse RSS and Atom feeds natively.
- **Hacker News Subcommands**: Expanded `/hn` with `/hn best`, `/hn newest`, and `/hn custom <query>`.
- **File Attachment & Search Commands**: Added `/files attach <query>` (fuzzy path search) and `/files search <query>` (local semantic search) with live autocomplete, filename-first display, and a "No matches found" state.

### Changed
- **Smart Summarization Guard**: Disabled "Generate Summary" on empty conversations.
- **Command Arguments Handling**: Subcommands that expect input (such as `/hn custom`) now autocomplete and wait for your text instead of firing immediately.

### Fixed
- **Slash Command Arguments**: Manually typing a slash command with arguments (like `/hn custom typescript`) no longer ignores the arguments.
- **Command Popover Glitch**: Fixed the slash command menu briefly reappearing after attaching a file, and cleared stale matches properly after execution.

## [1.7.0] - 2026-04-08

### Changed
- **Faster File Search**: Raised the file search limit to 50 results and restricted fuzzy matching to relative paths for better performance.

### Fixed
- **Startup Race Conditions**: Actions triggered during startup (`Ctrl+N`, `Ctrl+Q`, or `--new-conversation`) now wait for the database to finish loading so they can no longer overwrite conversations with an empty list.

## [1.6.0] - 2026-04-07

### Added
- **Native Markdown Tables**: Markdown tables now render natively with `Gtk.ColumnView`, including column headers, row separators, and live updates during streaming.
- **Automatic Skill Vector Indexing**: Skills are indexed for semantic search on first startup.
- **Unit Test Suite**: Added unit tests for core logic such as text splitting and skill prompt building.

### Changed
- **Cleaner Slash Command Menu**: Hid internal navigation shortcuts (`/toggle-sidebar`, `/search`, `/focus-input`, `/new-conversation`, `/open-conversation`, `/theme`) from the `/` autocomplete list to reduce clutter.
- **Faster Database Writes & Shutdown**: Wrapped bulk database writes in atomic transactions, moved conversation and skill indexing to background updates, and stopped running semantic indexing on app exit.

### Removed
- **Duplicate Skill Reset**: Removed "Restore Default Skills" from Settings → Data (available directly in the Skills window).

### Fixed
- **Cancelled First Message Summary**: Cancelling the first reply in a chat no longer triggers automatic title generation.
- **Indexed Folders Shortcut**: Fixed the `Ctrl+Shift+F` shortcut failing to open Indexed Folders.
- **Memory Leaks**: Cleaned up widget lifecycles in chat messages, Settings, and Skills windows to prevent memory leaks.
- **Startup Action Warnings**: Fixed GJS critical warnings during action initialization.

## [1.5.1] - 2026-04-07

### Changed
- **Refined Built-in Skill Prompts**: Clarified tool usage across built-in skills — `@Writer` no longer calls tools, `@Reviewer` focuses on code review without running shell commands, and `@Canvas`, `@Coder`, `@Files`, and `@Memory` received clearer instructions.

## [1.5.0] - 2026-04-06

### Added
- **SQLite Storage**: Migrated conversations, settings, skills, and memory from separate JSON files to a local SQLite database with automatic cleanup of old files on startup.
- **Semantic Skill Search**: Search skills by meaning as well as by keyword, with a manual re-index button in Settings → Data.
- **Auto-Attach Screenshots**: Taking a screenshot now attaches it straight to the chat input.

### Changed
- **Improved Code Block Parsing**: Better handling of nested code blocks, varying backtick lengths, language detection, and whitespace.
- **Refined Skills Editor & Chat Spacing**: Added expanding layouts, context menus, and keyboard shortcuts in the Skills editor, and trimmed redundant message padding.
- **Consistent Skill Prompts**: Rebuilt the active skill's system prompt on every request so persona instructions stay intact across multi-step tool calls.

## [1.4.0] - 2026-04-03

### Added
- **Local RAG (Chat with Your Files)**: Index local project folders into a private SQLite vector store and use `@files` to ask questions grounded in your own code and notes.
- **Tool Execution Permissions**: Added approval prompts before running shell commands or writing files, with settings to auto-accept trusted actions.
- **Indexed Folders Management**: Added UI in Settings → Data to add, remove, and re-index local folders.
- **Theme-Aware App Icons**: Reorganized app icons across standard sizes for cleaner GNOME desktop integration.

### Changed
- **Wayland Portals**: Switched desktop screenshot and automation features to native Wayland portals.
- **Updated Appearance Settings**: Refreshed the Appearance tab layout and icons.

## [1.3.1] - 2026-03-31

### Fixed
- **Code Block Syntax Highlighting**: Fixed syntax highlighting not updating when reusing a code block widget during streaming.

## [1.3.0] - 2026-03-31

### Added
- **Skills Editor Window**: Added a dedicated Skills window (`Ctrl+E` or `/skills`) with a searchable sidebar split into Built-ins and Custom sections and a syntax-highlighted Markdown editor.
- **Reset Built-in Skills**: Added per-skill reset buttons for modified built-in skills and a global reset option in Settings → Data.

### Changed
- **`/memory` Skill Activation**: `/memory` subcommands now automatically include `@memory`.
- **Protected Built-in Skills**: Built-in skills can be reset to defaults but cannot be deleted; only custom skills show a Delete button.
- **Simpler Data Settings**: Grouped "Clear All Chats" and "Clear Usage Statistics" together and moved skill editing out of Settings.

### Removed
- **Old Skill Edit Dialog**: Replaced by the dedicated Skills Editor window.

## [1.2.1] - 2026-03-30

### Fixed
- **Image Carousel Navigation**: Fixed an out-of-bounds crash when navigating images with the keyboard.
- **Skill Prompt Layout**: Aligned the system prompt editor styling and margins in the skill dialog.

## [1.2.0] - 2026-03-30

### Added
- **Image Preview & Slideshow**: Click any image in a conversation to open a full-size viewer with swipe and arrow-key navigation across multiple images.
- **Skill Prompt Highlighting**: Added Markdown syntax highlighting to the skill prompt editor, synced with the app's color scheme.
- **Model Update Banner**: Notifies you at the top of the chat when an update is available for the current model, with a one-click Update button.
- **Model Capability Awareness**: Detects each model's `vision` and `tools` support, disabling image attachments for non-vision models and greying out models without tool support.
- **Tool Error Styling**: Failed tool outputs are highlighted in error color inside the tool call dialog.

### Changed
- **Adaptive Header Bar**: The chat header bar turns flat on empty or short conversations that don't scroll.
- **Pre-filled Model Pull**: Opening Pull Model from the update banner pre-fills the model name.
- **Clearer Memory Errors**: Memory tools now return explicit validation errors when an operation fails so the model can recover.

### Fixed
- **Confirmation Dialog Placement**: Destructive confirmations in Settings now center over the Settings window instead of the main window.
- **History Pagination**: Fixed the "Load More" banner showing on empty chats or loading duplicate messages.
- **Visible `@skill` Mentions**: Kept `@skill` prefixes visible in the saved chat history after sending.

## [1.1.0] - 2026-03-30

### Added
- **Auto-Summarized Titles**: Conversations automatically get a generated title and emoji after the first reply.
- **Text File & Screenshot Attachments**: Attach plain text, Markdown, CSV, JSON, HTML, XML, JavaScript, or TypeScript files as collapsible syntax-highlighted blocks, or capture screenshots directly from the attach menu.
- **Interactive HTML Canvas**: Added `render_html` and the `@canvas` skill to generate and preview self-contained HTML/CSS/JS apps, games, and charts in a native WebKitGTK window.
- **Model Pull Dialog**: Pull Ollama models in-app with live progress, download speed, ETA, and cancellation.
- **Appearance & Syntax Themes**: Switch between System, Light, and Dark color schemes and choose any installed GtkSourceView syntax theme.
- **Slash Commands**: Added `/hn`, `/memory` (`summarize`, `clean`, `optimize`), `/compress`, and `/debug` with full keyboard navigation, tab completion, and shortcut hints.
- **Knowledge Graph Memory (`@memory`)**: Persist facts and relationships across chats locally.
- **Vector Indexing Controls**: Added progress bar and Stop controls for manual re-indexing in Settings, plus background indexing on close.
- **Reset to Default Buttons**: Added reset buttons for model parameters, reasoning effort, and system prompt in Settings.
- **Persistent Web Cache**: Cached fetched web pages across sessions.
- **Embedding Usage Stats**: Included embedding requests in performance statistics.

### Changed
- **Project Rebranding**: Renamed the app from **Ollama Chat** to **Gnome AI Chat**.
- **Smarter Auto-Scroll**: Streaming replies pause auto-scrolling when you scroll up manually.
- **Message Layout & Attachments**: Unified message spacing, capped inline image previews at 250 px, and reduced layout shifts during streaming.
- **Organized Search & Stats**: Semantic search results stay grouped chronologically by date, and model usage stats sort by request count.
- **Cleaner Settings**: Moved Behavior and Reasoning to the General tab and trimmed verbose setting subtitles.
- **Slash & Skill Triggering**: `/` now works at the start of any line, and `@` skills append to the system prompt alphabetically.

### Fixed
- **Streaming & UI Crashes**: Fixed crashes on empty final chunks, system messages without actions, and uninitialized command popover bounds.
- **Sidebar Date Grouping**: Conversations immediately move to the right date header when updated, and empty date headers disappear when their last chat is deleted.
- **Safe Exit & Streaming Locks**: Ensured pending data flushes on quit, disabled conflicting buttons while generating, and cleared the input when starting a new conversation.
- **GTK & GJS Compatibility**: Fixed GTK snapshot warnings, GJS argument warnings, focus handling in the pull dialog, and GTK 4.6+ compatibility.
