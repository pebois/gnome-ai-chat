# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Agent rules at the repository root**: `AGENTS.md` moves from `.agents/` to the root, where the [agents.md](https://agents.md/) standard and the coding agents look for it. Sub-agents now have their place in `.agents/agents/`, read by Claude Code and by opencode through the links `.claude/agents` and `.opencode/agents`.

## [1.16.0] - 2026-11-17

### Added
- **Skills as Sub-agents**: The model can delegate a task to a skill with the new `run_skill` tool. The skill runs in its own context, with its own instructions and tools and only the task it was given, and just its final answer comes back into the conversation, so intermediate tool calls and tool definitions no longer fill the main context. Only skill names and descriptions are sent with each message. The tool call shows as "Delegating to a skill" with the task; a sub-agent cannot delegate further. Typing `@Name` still applies the skill directly. Delegation is offered as long as at least one skill is attached to the sub-agents.
- **Agent Profiles**: Settings → Tools has a Main Agent / Sub-agents switch. Each profile lists the same switches: built-in tools, enabled MCP servers and enabled skills. The main agent profile decides what the model gets in the chat and which skills appear in the skill button and `@` completion; the sub-agents profile decides what a delegated skill gets and which skills the model can delegate to. An MCP server can stay connected and be attached to sub-agents only, so its tools never enter the main context. New tools, servers and skills are attached to both. Tools turned off before this version stay off in both profiles.
- **Custom Tools per Skill**: A skill can turn on "Use Custom Tools" in its editor and pick its own built-in tools and MCP servers from the same list. The custom list replaces the agent profile while the skill runs, inline or as a sub-agent. `@Memory`, `@Files` and `@Canvas` ship with their own built-in lists (the memory tools; the file search and read tools; preview, file read and web tools). A tool that is not offered is refused if the model still calls it.
- **Turn Skills Off**: Skills have an Enabled switch. A turned-off skill is dimmed in the list and hidden from every agent.
- **Turn Single MCP Tools Off**: Each tool of an MCP server has a switch in the server's Overview tab. Turned-off tools are hidden from every agent and refused if called. The choice is stored with the server and survives renaming it.

### Changed
- **Skills and MCP Windows**: The Skills (`/skills`, Ctrl+Shift+S) and MCP Servers (`/mcp`, Ctrl+Shift+M) windows keep their own window each and now share the same layout: sidebar with search, Ctrl+B, Ctrl+F and Ctrl+N. The "Manage" button of MCP error toasts selects the failing server.
- **New Built-in Skills Reach Existing Users**: Built-in skills missing from the database are added at startup, so skills introduced by an update appear without resetting. Edited built-ins are kept and can still be reset. The `skills` table gains `enabled` and `tools` columns (migration 4).
- **Skill Saving**: Skill edits are saved half a second after the last change and only the edited skill is written, instead of rewriting every skill on each keystroke. An invalid name is outlined in red, as for MCP servers.
- **Shared Tool Registry**: Built-in and MCP tools are registered in one place (`app.tools`) with their handler, permission category and parallel-safety, and go through the same profile, permission and skill checks. The system prompt and skill prompt are assembled once (`lib/agent/request.ts`) instead of in both the chat service and the Ollama provider.
- **Shared Management Code**: The Skills and MCP windows share one window class, sidebar, editor shell and save logic (`src/app/window/manage/`), name validation and id helpers (`lib/naming.ts`), and a `skills-changed` signal next to `mcp-changed`. The MCP manager is now the only owner of the server list.

### Fixed
- **Tool Results Sent Twice**: After the first round of tool calls in a reply, the tool calls and their results were sent to the model twice on the next request. They are now sent once.
- **MCP Reload While Editing**: `/mcp reload` no longer re-reads servers from the database, so it cannot discard edits made in the window during the last half second.

## [1.15.0] - 2026-11-07

### Added
- **Manage Built-in Tools**: A new Tools page in Settings lists the 28 built-in tools in groups (Memory, Files, Shell, Web, Time, Math, System, Applications, Preview). Turn a whole group or a single tool off to hide it from the model, for example after replacing it with an MCP server. Turned-off tools are refused if a model still calls them, and slash commands that rely on them are hidden (`/memory` without the memory read tools, `/hn` without Fetch Rss Feed); typing one shows a toast pointing to Settings → Tools. The `@Memory`, `@Files` and `@Canvas` skills are likewise hidden and not applied while their tools are off. The Skills window shows each of these skills' linked tools and whether it is currently hidden. `/deepsearch` keeps working with the web tools off.
- **MCP Server Catalog**: The "+" button in the MCP Servers window now opens a menu with "New Server" and "Add from Catalog" (also offered on the empty page). The catalog lists public servers that need no API key and run with `npx` or over HTTP: alternatives to built-in tools (Memory, Filesystem, Fetch, Exa Search, Desktop Commander) and new capabilities (DeepWiki, Context7, Microsoft Learn, Sequential Thinking, Git, Everything). Picking one adds it pre-filled and disabled, ready to review and turn on.
- **Release Skill**: A `release` agent skill (`.agents/skills/release/`) walks through a release: it picks the version from the `[Unreleased]` entries, bumps it in `package.json`, `package-lock.json` and `src/lib/constants.ts`, dates the CHANGELOG section, writes the metainfo release notes, verifies everything, commits `Release version X.Y.Z` and tags `vX.Y.Z`. It never pushes.
- **Adwaita UI Skill**: An `adwaita-ui` agent skill (`.agents/skills/adwaita-ui/`) gives GNOME HIG and Libadwaita 1.9 guidance for UI work: which Adw widget fits which pattern, deprecated widgets and their replacements, adaptive breakpoints, dialogs, toasts and banners, boxed lists and CSS, plus this codebase's own UI idioms.
- **Run App Skill**: A `run-app` agent skill (`.agents/skills/run-app/`) proves changes work at runtime: it renders dialogs and widgets to PNG at phone or desktop width in light or dark, launches an isolated instance on a virtual display, triggers app actions over D-Bus, clicks and types into it, seeds its database and checks the log for GTK/JS errors.

### Changed
- **Tooltips**: Tooltips use sentence case and one shortcut format ("New chat (Ctrl+N)", "Next match (Enter)"). The scroll-to-bottom button has a tooltip, the attachments count uses a real plural ("1 attachment", "3 attachments"), the MCP "+" mentions Ctrl+N again, and a few labels are clearer ("Attach files or a screenshot", "Stop generating", "Choose a skill (@)", "Reset all built-in skills").
- **Skill Dropdown**: The "Skill: …" pill next to the attach button is replaced by a round Skill button, like the attach button, whose icon turns accent-coloured while a skill is active. Pick a skill or None without typing @; typing `@Name` still works and updates the button. The menu only lists skills whose tools are on.
- **Settings and About as Dialogs**: Settings (`Adw.PreferencesDialog`, with search) and About (`Adw.AboutDialog`) now open as dialogs attached to the main window instead of separate windows. They adapt to narrow windows, and indexing errors raised in Settings appear inside it rather than behind it. Both replace widgets deprecated in Libadwaita 1.6.
- **Pull Model Dialog**: Pull Model is now an `Adw.Dialog` laid out like the other dialogs, with a single Pull button that turns into Stop during a download. It becomes a bottom sheet on narrow windows instead of a fixed 400 px window, and closing it stops a running download. Progress text uses the standard caption and numeric styles.
- **File Picker**: Attaching pictures or text files uses `Gtk.FileDialog` instead of the deprecated `Gtk.FileChooserNative`.

### Fixed
- **Regenerate Button**: Regenerate did nothing on a reply that had just been generated; it only worked after reopening the conversation. The message actions now use the reply as saved once streaming ends.
- **Message Context Menu**: Right-clicking a message opened the text's Cut/Copy/Paste menu, so "Copy message", "Regenerate response" and "Restart from here" were unreachable. Right-click now always opens the message menu; selected text still copies with Ctrl+C.
- **About License**: The About dialog showed the Artistic License; it now shows MIT, matching the project.
- **One Skills Window**: Opening Skills while the editor is already open focuses it instead of opening a second editor on the same skills.
- **Refresh Ran Twice**: The Refresh button on the "No Models Found" page started loading twice.
- **Stop Button Tooltip**: The Stop button no longer keeps the "Send (Enter)" tooltip while a reply is generating.
- **Artifact Window Leak**: Closing an artifact preview window now disconnects its dark-mode listener.
- **MCP Spinners**: The MCP Servers window uses `Adw.Spinner` like the rest of the app.

## [1.14.0] - 2026-11-06

### Added
- **Message Details**: Hovering a reply reveals an ⓘ button next to Copy and Regenerate. It opens the model, generation speed (tokens per second), output and prompt tokens, generation time and total time, so the conversation itself carries no metadata lines. Stats come from Ollama's final response and are saved in a new `messages.stats` column (migration 2).
- **Live Tool Calls**: Each tool call on an assistant message now shows what the tool does ("Reading web page", "Searching indexed files", "Calling GitHub: search"…) with its main argument, a live status (spinner, then a check mark or a warning icon) and its duration. Clicking a row opens the tool call dialog with the arguments and the result, and `render_html` rows have an "Open Preview" button. The "Tool Calls" group expands on its own when the first tool starts, and stays collapsed if you close it while later tools run. Rows update in place while tools run and stay on the message afterwards. Row titles and subtitles, and the dialog's tool name and description, stay on one line, with the full text in a tooltip.
- **Web Search Tool**: A new `web_search` tool returns titles, URLs and snippets for `fetch_web_page` to follow up on. It works with no setup, using the Wikipedia search API (in the user's language) and DuckDuckGo instant answers.
- **Deep Search**: `/deepsearch <question>` researches a question on the web and writes a cited report. The model breaks the question into search queries, the app searches and reads up to six pages, picks the most relevant passages (ranked by embeddings, or by keyword overlap when no embedding model is available), and asks the model whether anything is missing for one follow-up round. The model then streams an answer with `[n]` citations that match the numbered source buttons. Each step (plan, searches, page reads, passage selection, follow-up check) is a tool row that opens its result in the tool call dialog, and stays in the conversation as the research trail. The cited pages appear as source buttons, and their passages are kept for follow-up questions. Stop works at any step; unfinished steps are marked as cancelled.
- **Find in Conversation**: `Ctrl+Shift+F`, or the search button in the header, opens a find bar styled like the sidebar search, as wide as the conversation column and aligned with the messages. Every occurrence is highlighted inside paragraphs and code blocks, with a soft tint of the accent colour, and the current one is solid accent and bold, including inside user bubbles and code blocks. The counter ("3 of 7") sits inside the search field and counts occurrences, not messages. Enter and Shift+Enter (or the arrows) move between them, loading older messages as needed and scrolling each occurrence into view. Highlights follow streamed text and are cleared when the bar closes.
- **Answer Sources**: Answers that used indexed files (`search_vector_index`), `read_file` or `fetch_web_page` show the files and pages they drew on as buttons below the reply, labelled with the page name and host. Clicking one opens it with the default app. When the answer cites sources as `[n]`, the buttons are numbered to match. A trailing "Sources" or "References" list of links in the answer is hidden when the same sources are shown as buttons, so they are not listed twice; copying the message keeps the full text. `/deepsearch` no longer writes its own Sources list, and its `[n]` numbers follow the button order.
- **Rename Chats**: A "Rename" item in the conversation context menu opens a dialog for editing the title by hand. Before, the only way to change a title was "Generate Summary".
- **Pinned Chats**: "Pin to Top" in the conversation context menu moves a conversation into a "Pinned" section at the top of the sidebar, whatever its date. The pin is saved in a new `pinned` column on `conversations`.
- **Schema Migrations**: The database now has a schema version (`PRAGMA user_version`) and a list of ordered migrations (`src/lib/db/migrations.ts`). Pending migrations run in a single transaction at startup, and a newer schema is left untouched. Migration 1 adds `conversations.pinned`.

### Fixed
- **Follow-ups After a Deep Search**: A follow-up question after a deep search no longer loses the report. When the full research (plan, searches, page reads) no longer fits in the context window, the exchange is kept as the question, the report and its numbered source list, instead of being dropped whole. The model can refer to the report, cite its sources and open one with `fetch_web_page` to dig deeper. The "Older messages were left out" toast now points to the Context Window setting.
- **Commands in the Conversation**: A message sent by a command now remembers it (new `messages.command` column, migration 3). Regenerating a `/deepsearch` question or its report runs a new deep search instead of a plain reply, and **Restart from here** puts `/deepsearch <question>` back in the input. `/hn` and `/memory` messages show the command (for example "/hn best") instead of the long internal prompt. A message sent with a command has a terminal button among its hover actions that shows the command and, for `/hn` and `/memory`, the full prompt that was sent.
- **Messages Starting with `/`**: Pressing Enter on text that starts with `/` but is not a command (such as `/etc/hosts is missing`) now sends it as a normal message instead of silently erasing it. A near miss such as `/deepserch` keeps the text and suggests the right command. The Send button now runs commands the same way as Enter, so re-sending an edited `/deepsearch` message starts a new deep search instead of sending the text to the model.
- **Duplicate Shortcut**: Ctrl+Shift+F was bound to both Find in Conversation and Indexed Folders. It now only opens Find in Conversation.
- **Command Argument Parsing**: Commands share one parser, so extra spaces in `/hn custom …`, `/files attach …` or `/mcp reload` no longer break them.
- **Markdown Rendering**: Replies no longer switch to raw Markdown halfway through streaming. Any text containing a link was always shown raw, and overlapping emphasis such as `**watch *logs***` or a `*` inside a URL made the whole reply fall back to raw text. Emphasis is now always well nested, and a line that still cannot be rendered only affects itself. Headings are sized by level, `-`/`*` lists show bullets with indentation, quotes get a bar, and `---` rules show as a line. A reply looks the same while streaming, once finished and after reopening the chat.
- **Data Loss on Database Errors**: A failed database read was treated as an empty result, so the app could overwrite real data with defaults. Failing to read the conversation list led the next save to delete every conversation. Failing to read skills, settings or stats led them to be replaced by the defaults on quit. `Database.execSql` now throws a `DatabaseError` with the `sqlite3` error message, and invalid stored JSON for skills, conversations, messages or settings raises the same error instead of falling back to defaults. If loading fails at startup, the error page is shown and nothing is saved. Stats are only saved once they have loaded.
- **Partial Transactions**: `sqlite3` now runs with `-bail`, so a failing statement inside a transaction rolls the whole transaction back. Before, the `DELETE` that starts each full rewrite (skills, messages, conversations) was still committed when a later `INSERT` failed.
- **Visible Save Errors**: Failures to save messages, conversations, skills or settings, to load a conversation, to delete or compress a conversation, or to start MCP servers now show an error toast through a new `app.reportError`. Before, they were only logged. A conversation that fails to load is no longer opened empty, which would have let the next message overwrite its history. Deleting a conversation removes it from the list only after the database delete succeeds. Quitting always completes even if a final save fails.
- **Orphaned Messages**: Deleting a conversation or clearing all conversations now also deletes its messages. Foreign-key cascades are not enabled on the connections that run these deletes, so messages were left behind in the database.
- **Lost Replies When Switching Conversations**: Opening a conversation that is still generating now reuses the in-flight conversation instead of reloading it from the database. Before, the reply was written to a detached copy. It did not appear until the conversation was opened again, and sending another message first saved the conversation without it.
- **Live Streaming After Switching Back**: The partial reply of a conversation that is still generating is shown again when you return to it, and keeps streaming. Before, chunks went to a widget that had already been removed. `ChatService` keeps the in-flight message per conversation, and `History` owns a single streaming slot (`beginStreaming`, `updateStreaming`, `commitStreaming`, `endStreaming`).
- **Stuck Placeholder**: A spinner replaces the `•••` placeholder while waiting for the model. It is removed if the generation is cancelled before the first token, fails, or returns nothing. Before, `•••` stayed in the conversation. The input is also re-enabled after an error.
- **Copy Code During Streaming**: The copy button of a code block now copies the current contents of the block instead of the first streamed fragment.
- **Wrong Tool Result in Tool Call Dialog**: The dialog now finds a tool call's result from the assistant message that contains it and the call's position. Before, it matched on `id`, which Ollama often leaves out, so every call could show the result of the first tool call in the conversation.
- **Blank Paragraphs on Invalid Markup**: Text and table cells whose markdown produces invalid Pango markup, such as overlapping `**` and `*`, now show the raw text instead of rendering empty (`setMarkupSafe`).
- **Edit Message Drops Attachments**: "Edit message" now puts the message's files and images back in the input along with its text.
- **Message Popover Leak**: Each message's context menu is unparented when the message is destroyed.

### Changed
- **Indexed Folders Shortcut**: Indexed Folders moved to Ctrl+Shift+O. The keyboard shortcuts dialog is now built from the registered commands, so it always matches the real bindings (it was also missing Pull Model).
- **Regenerate on Replies**: Regenerate moved from user messages to assistant replies (button and menu item). It regenerates from the question before the reply. User messages keep Copy and Edit.
- **Safer `/clear` and `/compress`**: Both ask for confirmation first. `/compress` keeps the pages a deep search cited, so the answer keeps its sources.
- **Command Palette**: Choosing `/deepsearch` no longer runs it empty: the input shows "Type a question" as ghost text after the cursor until you type. The menu no longer shows placeholder rows: hints such as "Type to search" or "No matches found" appear as ghost text in the input, and when a `/files attach` or `/files search` query stops matching, the files already listed stay in the menu. Commands also match by description (for example `/model` finds Pull Model and Running Models), and Enter is no longer swallowed when the palette has nothing to select.
- **Incremental Conversation Saves**: `ConversationsStore` now remembers what it last wrote, so a save only writes the difference. Sending a message appends just the new rows instead of deleting and re-inserting the whole conversation, images included. Regenerating or editing from a message deletes only the rows after it, and anything that no longer matches falls back to a full rewrite. `saveConversations` writes only conversations whose title, model, dates or embedding changed, instead of rewriting the whole table after every message. Saves for the same conversation run in order, and a failed write forces a full rewrite next time.
- **Debounced Re-Embedding**: Conversations are re-embedded after 30 seconds without changes (`CONVERSATION_INDEX_DELAY_MS`) instead of after every save. Before, each message triggered two embedding passes and two full rewrites of the conversations table. Any pending indexing still runs on quit.
- **Single Save Path**: The save-and-sync block (save messages, bump `updated_at`, update the sidebar, save the list), repeated in `sendMessage`, `regenerateFromMessage`, `startFromMessage`, the agent loop and `/compress`, is now `app.persistConversation()`. It reports failures itself.

## [1.13.0] - 2026-10-28

### Added
- **MCP Servers**: New dedicated "MCP Servers" window (sidebar + editor, like the Skills editor) to register Model Context Protocol servers over stdio (command, arguments, environment) or Streamable HTTP (URL, headers). The window matches the Skills editor in size and layout: the sidebar lists servers by name with their tool count and has a search bar (toggle button, `Ctrl+F`) that filters by name, command or URL; the server pane has two tabs switched from the header bar: Overview, with a Connection group (a green/red status dot with the live state, and a Test row whose result is shown inline and reset when the connection settings change) and a Tools group listing every tool the server exposes with its description (live when connected, otherwise from the last test), and Settings, with the server settings, a per-server enable switch and a configurable call timeout. The Overview tab shows an attention dot while the server is in error, the selected tab is kept when switching servers, and a new server opens on Settings with its name focused. The window is a singleton, so reopening it focuses the existing one. The command field accepts a full command line (e.g. `npx studio-mcp`), split with shell-style quoting. Servers are persisted in a new `mcp_servers` SQLite table (`src/lib/db/mcp.ts`) and connected in the background at startup, so chat is never blocked by a slow server. Their tools are advertised to the model as `mcp__<server>__<tool>` next to the built-in tools and resolve live, so reconnects and `tools/list_changed` notifications apply on the next message. Crashed servers reconnect with bounded backoff.
- **MCP Permissions**: New "MCP Servers" category in Preferences → Permissions (Ask / Auto-accept / Deny, defaults to Ask) with a per-server override (Inherit / Ask / Auto-accept / Deny). Denied servers have their tools removed from requests entirely; prompts are titled `MCP: <server> / <tool>` and show the call arguments.
- **`/mcp` Command**: `manage` opens the MCP Servers window (also reachable from the main menu), `reload` reconnects all servers and reports how many connected in a single toast with a Manage button when some failed. Bound to `Ctrl+Shift+M`.
- **MCP Status Feedback**: The MCP Servers window is the single place where connection status is shown; nothing toasts while it is open. When it is closed, a server that fails to connect or gives up reconnecting raises one error toast with a Manage button that opens the window on that server.
- **MCP Client Library**: New `src/lib/mcp/` with pure, tested JSON-RPC / SSE / config helpers (`config.ts`, `jsonrpc.ts`, covered by `src/test/mcp.test.ts`), a stdio transport (`Gio.SubprocessLauncher`, newline-delimited JSON, serialized writes, graceful SIGTERM then force exit), a Streamable HTTP transport (`Mcp-Session-Id`, `MCP-Protocol-Version`, JSON and `text/event-stream` responses), a client with per-request timeouts and cancellation, and an `McpManager` exposed as `app.mcp` with an `mcp-changed` signal.
- **Context Budget**: New `src/lib/agent/context.ts` fits each request into the model's context window (`num_ctx`). It estimates tokens for the system prompt (including the active skill), the tool schemas and the messages, reserves a quarter of the window for the response, and drops the oldest whole turns first, so the system prompt and the current turn are always sent and history never starts with an orphaned tool result. Tool results are shortened at send time only (head and tail kept with a `[...truncated N chars...]` marker): up to 8,000 characters for the current turn, 1,500 for earlier turns. The stored conversation and the tool-call dialog keep the full output. A toast is shown once per conversation when older messages are left out, and debug mode logs the estimated usage of every request. Covered by `src/test/context.test.ts`.
- **Capability Warnings**: A toast now tells the user once per model when the selected model does not support tools or images that are in use, instead of dropping them silently.
- **Flatpak Host Spawning**: The manifest now requests `--talk-name=org.freedesktop.Flatpak` and stdio servers are launched through `flatpak-spawn --host` inside the sandbox, so `npx` / `uvx` based servers work from the Flatpak build.

### Changed
- **Tool Round Limit**: A response can now chain at most 10 rounds of tool calls (`MAX_TOOL_ROUNDS`). The next request is then sent without tools so the model has to answer, instead of looping without end.
- **Sequential Tool Calls**: Tool calls from one response now run in parallel only when they are all read-only and never prompt (time, math, web fetch, memory reads, RAG search, app listing). Otherwise they run in order, so permission prompts appear one at a time and writes or shell commands are not interleaved. Calls still pending when the response is stopped return `Error: Cancelled by user.` and are not run.
- **Dynamic Tool List**: `ChatService` now builds its tool list per round via `getAvailableTools(app)` (built-ins filtered by permissions plus connected MCP tools), and `onToolCall` receives the generation cancellable so stopping a response aborts an in-flight MCP call.
- **Tool Call Rows**: MCP tool calls use one `server · tool` label everywhere: in the message's "Tool Calls" expander (with the tool description as subtitle and a server icon), in the tool-call dialog (with a Description group) and as the heading of the permission prompt, whose body shows the call arguments first and then the server-provided tool description, labelled as such.

### Fixed
- **MCP Cancellation Deadlock**: Stopping a response while an MCP tool call was in flight froze the application, because the request's `Gio.Cancellable` handler disconnected itself from inside the `cancelled` signal. The abort is now deferred to an idle callback.
- **MCP Reconnect Loop**: A server that crashed shortly after connecting was retried forever and raised an error toast on every cycle, because a successful handshake reset the retry budget. The budget now resets only after a connection stays up for 60 seconds, reconnect attempts no longer toast, and a single toast is raised when retries are exhausted.
- **MCP Reconnect Give-Up**: A reconnect attempt that failed for any reason other than the process exiting (connection refused, initialization timeout, HTTP error) stopped retrying silently. Reconnection now loops through the full backoff schedule.
- **MCP HTTP Liveness**: An unreachable Streamable HTTP server is now detected as a disconnection and reconnected with backoff instead of staying "Connected". The client also opens the optional GET event stream after initialization, so `tools/list_changed` notifications reach the app, and the Soup session allows enough connections per host for it.
- **MCP Protocol Negotiation**: The protocol version returned by `initialize` is now validated against the supported versions and sent in the `MCP-Protocol-Version` header of every later HTTP request, instead of always sending `2025-06-18`.
- **MCP Request Lifecycle**: Each request has its own cancellable, so a timed-out or cancelled HTTP call closes its connection and response stream. Timeouts also send `notifications/cancelled`, and `tools/call` carries a progress token so `notifications/progress` extends the timeout of long-running tools.
- **MCP Robustness**: A stdio server writing invalid UTF-8 no longer stops the reader. Tool results are capped at 100,000 characters. Tool names longer than 64 characters are shortened with a stable hash suffix. `tools/list` stops on a repeated pagination cursor. Server names may no longer end with an underscore, which made namespaced tool names ambiguous.
- **MCP Servers Window**: An invalid server name no longer prevents the other fields from being saved; the previous valid name is kept until it is fixed.

## [1.12.1] - 2026-10-09

### Added
- **Active Skill Chip**: The input toolbar now shows a pill-shaped indicator with the matched skill name whenever the message starts with a valid `@skill` mention, making per-message skill activation visible before sending.
- **Skill Name Validation**: The Skills editor now rejects names containing whitespace or special characters (letters, digits, hyphens and underscores only) and case-insensitive duplicates, surfacing errors via toast instead of silently saving. New skills are created with a conforming unique `new-skill` placeholder name.
- **Skill Matching Tests**: New `src/test/skills.test.ts` covering `matchSkill`, `stripSkillMention`, and `buildSkillPrompt`.
- **Registry Helpers**: New `src/lib/registry.ts` with pure `parseModelReference`, `registryManifestUrl`, `normalizeDigest`, and `isModelOutdated` helpers (registry host now lives in `OLLAMA_REGISTRY_URL`), covered by `src/test/registry.test.ts`.
- **Live Model Reload**: New `app.reloadModels()` refreshes the model list and tool capabilities without restarting the app. After a successful pull the dropdown is rebuilt, a newly pulled tool-capable model is selected automatically, and a confirmation toast is shown.

### Changed
- **Provider-Agnostic Skill Resolution**: Skill matching moved out of the Ollama provider into pure `matchSkill`/`stripSkillMention` helpers in `src/lib/skills/index.ts`, resolved once per generation in `ChatService`. `ChatProps` now receives the single resolved `skill` instead of the full skills list.
- **Cleaner Skill Prompts**: The `@skill` mention is stripped from the outgoing message (stored history keeps it), so `buildSkillPrompt` no longer needs the "don't get confused by the trigger text" note.
- **Aligned Autocomplete Semantics**: The `@` skill autocomplete now only triggers at the very start of the message, matching exactly what the backend honors, instead of offering completions mid-message that silently did nothing.

### Fixed
- **Skills Ignored with Attachments**: Skill mentions were matched after file blocks were prepended to the message content, so any message with an attached file silently skipped skill activation.
- **Skill Name Prefix Collisions**: Matching used `startsWith`, so with skills named `code` and `coder`, typing `@coder` could activate `code` depending on list order; matching is now exact on the full mention token.
- **Pango Markup Injection in Popovers**: Skill and command names are now escaped with `pangoEscape` before being rendered as markup in the autocomplete popovers, preventing broken rendering for names containing `&` or `<`.
- **Model Update Banner Never Shown**: The Ollama registry now returns the manifest digest in an `ollama-content-digest` header instead of `Docker-Content-Digest`, so the update check always reported "up to date". The provider reads the new header (with the old one as fallback) and compares digests with the `sha256:` prefix and case normalized.
- **Stale Model List After Pull**: Pulling a model while the app was already loaded called `app.init()`, which returns early once loaded, so the new model never appeared in the dropdown and the update banner stayed visible. The pull dialog now reloads models in place, keeps the current selection, and the banner is hidden as soon as the update is started and re-checked after the reload.

## [1.12.0] - 2026-07-03

### Added
- **Three-Tier Tool Permissions**: Every tool permission now supports `Ask`, `Auto-accept`, and `Deny`. Denied tools are filtered out of the request entirely so models never attempt calls that would fail.
- **Expanded Permission Coverage**: New "File Reads" (`read_file`, `list_directory`, `search_files` — defaults to Auto-accept) and "Applications" (`launch_app`, `launch_app_action` prompt on Ask; `list_installed_apps`, `get_app_details` are removed on Deny without prompting) permission categories, joining the existing Terminal and File Edits gates. All four are configurable in Preferences → Permissions.
- **Centralized Permission Layer**: New `src/lib/tools/permissions.ts` with a single tool-to-category mapping, a shared `checkToolPermission` helper used by all gated handlers, and `filterToolsByPermissions` applied before each chat request.
- **Shared D-Bus Contract**: New `src/lib/ipc.ts` as the single source of truth for the D-Bus bus name, derived object path, desktop id, and action names, consumed by the application (`constants.ts`, command definitions) and the GNOME Shell extension to prevent silent contract drift.

### Changed
- **Model Capability Caching**: `/api/show` lookups are now cached per model in the Ollama provider instead of being fetched on every chat turn. The cache is invalidated on model pull, delete, copy, model list reloads, and Ollama URL changes.
- **Unified Markdown Rendering**: Replaced the two near-duplicate inline markdown renderers with a single style-parameterized `renderInline` in `parser.ts` producing identical Pango and HTML output, with new unit tests locking the HTML export path.
- **Internal Cleanups**: Tool timing now uses the app tracker directly instead of reaching into the provider's private field; renamed `DEFAULT_GENRATE_MODEL` to `DEFAULT_GENERATE_MODEL`; deduplicated the streaming callback wiring between send and regenerate flows into a shared `_startGeneration` helper.

### Fixed
- **Reasoning Levels for gpt-oss**: Think levels (low/medium/high) were silently downgraded to a boolean for tagged model ids like `gpt-oss:latest` because of an exact-match comparison; the provider now matches on the base model name, so configured reasoning depth reaches the model.

## [1.11.0] - 2026-06-19

### Added
- **GNOME Shell Extension**: Introduced a native GNOME Shell extension (located under `extension/`) compatible with GNOME Shell 45+ written in TypeScript. It provides a panel status indicator and customizable global keyboard shortcut (default: `<Super>i`) to show/hide the main window, start new conversations, and quit the application via GApplication D-Bus actions.
- **NPM Integration**: Added `npm run extension-build` to compile TypeScript to ESM JavaScript using `tsdown` (configured via `tsdown.extension.config.js`), along with `npm run extension-install` and `npm run extension-enable` scripts to ease local installation and activation.
- **Project Rules**: Merged assistant identity guidelines and extension development conventions directly into `GEMINI.md` to centralize agent instructions.

### Changed
- **GNOME Shell Extension Compatibility**: Expanded GNOME Shell compatibility in `metadata.json` to officially support versions 48, 49, 50, and 51.

### Fixed
- **GNOME Shell Extension Actions**: Fixed the D-Bus object path in the extension (`/io/github/pebois/gnome_ai_chat` instead of using invalid dashes) to correctly activate "New Conversation" and "Quit" actions exported by GApplication.

## [1.10.0] - 2026-06-19

### Fixed
- **D-Bus Activation & Notification Handling**: Implemented D-Bus activation capability (`DBusActivatable=true` in desktop launcher and D-Bus service helper registration in Flatpak) and restructured GApplication initialization lifecycle to handle incoming notifications / activation actions when the app is completely closed.

## [1.9.2] - 2026-06-18

### Fixed
- **Database Initialization Race Condition**: Deferred loading of tracker performance stats until after the database has been initialized and tables migrated (`db.initDb()`), resolving the startup `no such table: kv_store` SQLite critical error inside sandboxed environments.

## [1.9.1] - 2026-06-18

### Added
- **Flathub Offline Dependencies**: Generated `generated-sources.json` containing npm offline cache references for sandboxed Flathub builds.

### Changed
- **Flathub Integration**: Updated `io.github.pebois.gnome-ai-chat.json` manifest to build from remote Git repository and utilize offline npm cache.
- **AppStream & Desktop Validation**: Fixed deprecated developer tags in the AppStream metainfo and corrected validation warnings in the desktop launcher file.
- **Improved Debug Logging**: Truncated message history (content and thinking blocks) and replaced raw base64 images with placeholders in Ollama provider debug output to reduce console noise.
- **Enhanced Vision Debugging**: Added explicit debug logs when images are included or stripped from a request based on the model's vision capabilities.
- **Skill Usage Debugging**: Added debug logs for successful skill matching.

## [1.9.0] - 2026-04-14

### Added
- **Automatic Tool Attachments**: Attachments in the chat input (like screenshots or dragged files) are now automatically sent to the model during tool-call sequences and cleared from the UI, enabling seamless multimodal workflows.
- **Image Download Context Menu**: Added a right-click context menu to images in the chat history and a download button to the preview dialog, allowing users to quickly save images to their local filesystem.
- **Global Console Types**: Added native `console` type definitions to the ambient declarations, improving developer experience and resolving TypeScript errors in GJS.
- **Stable File Promisification**: Introduced the `PromisifiedFile` interface to ensure robust type safety and correct API mapping for asynchronous Gio file operations.
- **Integrated WebKitGTK PDF Export**: High-quality PDF generation with clean styling and image attachment support via right-click in the sidebar.
- **Planner Skill**: Added a new `@Planner` default skill that implements a structured 4-step Plan Mode workflow (Explore & Analyze, Consult, Draft, Review & Approval) to ensure the assistant obtains user approval before executing complex changes.
- **Generic Provider Architecture**: Refactored the core AI logic to use a standardized `Provider` interface, decoupling the application from Ollama-specific implementations.
- **Unified Messaging Types**: Introduced generic `ChatMessage`, `Tool`, and `ToolCall` types, replacing their Ollama-specific counterparts across the entire codebase.
- **Chat Service**: Introduced `ChatService` in `src/lib/agent/chat.ts` to centralize message generation logic, recursive tool calling, and conversation state management.
- **Markdown Parser**: Decoupled Markdown parsing logic from UI components into a dedicated `src/lib/parser.ts` module, supporting text, code block, and table chunking. Added support for native rendering of H1 through H5 headers using Pango markup.
- **Main Window Modularization**: Refactored the main application window by moving its core components into a dedicated `src/app/window/main/` directory.
- **Message Components**: Moved the `Message` class and its specialized sub-components into a consolidated `src/app/ui/message/` directory.
- **Preferences Modularization**: Decomposed the large `Preferences` window into a modular architecture under `src/app/window/preferences/`.
- **Skills Editor Refactoring**: Refactored the Skills Editor into a class-based architecture in `src/app/window/skills/`.
- **Photo Component**: Extracted core image rendering and scaling logic into a reusable `Photo` component.
- **Improved Skill Restoration**: The "Reset all built-ins" button in the skills sidebar is now always visible and automatically restores missing (deleted) built-in skills.

### Fixed
- **Code Block Flickering**: Optimized code block rendering during streaming by appending new text to the existing buffer instead of replacing it entirely, resulting in a smooth, blink-free UI experience.
- **File Tool Promisification**: Fixed a critical crash caused by an incorrect mapping in the promisification of `replace_contents_bytes_async`.
- **Export Formatting**: Removed leading indentation from the generated HTML source when exporting conversations for cleaner file output.
- **Skills Editor Stability**: Fixed GtkSourceView critical warnings in Skills Editor during typing by optimizing buffer updates.
- **Skill Initialization**: Fixed a `ReferenceError: DEFAULT_SKILLS is not defined` in `SkillsStore`.
- **Tool Call Wrapping**: Improved text wrapping for arguments and responses in the tool call dialog.
- **App Orchestration Bugs**: Fixed background indexing loss on application quit and default settings overwrite on early exit.
- **Generation Cancellation**: Ensured that deleting a conversation or clearing messages now correctly stops any active message generation for that conversation.

### Changed
- **Streamlined Desktop Tools**: Preserved desktop application tools (`launch_app`, etc.) and manual screenshot capabilities while removing the autonomous screenshot tool and `@automation` skill to improve user control and privacy.
- **Generalized UI Strings**: Updated user-facing labels and connection settings to be provider-agnostic.
- **Ollama Provider Debugging**: Added debug logging for the complete message history in `OllamaProvider` when debug mode is enabled.

### Removed
- **Automation Skill & Tools**: Removed the `@automation` skill and the `run_automation_command` tool.
- **Autonomous Screenshots**: The assistant can no longer trigger screenshots autonomously; screenshots are now exclusively a user-initiated attachment feature.

## [1.8.0] - 2026-04-09
### Added
- **Regenerate Response Action**: Added a new "Regenerate response" button and menu action next to the edit action on user messages, allowing users to easily re-submit their prompt and generate a new response.
- **Slash Command Argument Parsing**: Fixed a bug where executing a slash command manually with arguments (e.g., `/hn custom typescript`) would ignore the arguments and execute the base command instead.
- **Command Argument Safety**: Introduced a `requiresArgument` property to the `SubCommand` interface. Subcommands with this flag (like `/hn custom`) will now smoothly autocomplete and wait for user input instead of executing prematurely.
- **RSS Feed Tool**: Introduced a new `fetch_rss_feed` tool that natively parses RSS and Atom feeds into structured JSON for efficient model processing.
- **Hacker News Subcommands**: Updated the `/hn` command with specialized subcommands and enhanced the AI prompt to explicitly summarize all headlines with an informative tone:
  - `/hn best`: Fetches the top-rated stories.
  - `/hn newest`: Fetches the most recent stories.
  - `/hn custom [QUERY]`: Performs a keyword search across Hacker News stories using a custom query.
- **Enhanced File Attachment**: Added `/files attach [QUERY]` and `/files search [QUERY]` subcommands with real-time autocompletion.
  - `/files attach` uses advanced fuzzy matching (e.g., "diapu" matches "dialog/pull.ts") to find files by path.
  - `/files search` performs local semantic vector search to find files based on their content.
- **Dynamic Command Feedback**: The slash command popover now displays a clear "No matches found" message for dynamic searches that yield no results.
- **Improved Search UI**: Optimized search results display to show the filename as the primary title and the relative directory path as the description.

### Fixed
- **Popover Race Condition**: Resolved an issue where the command popover would briefly re-appear after a file was successfully attached.
- **Command State Management**: Ensured the command list and matches are properly cleared after execution or when searches are invalidated.

### Changed
- **Smart Summarization**: The "Generate Summary" action is now automatically disabled for conversations that do not contain any messages, preventing unnecessary API calls and clarifying the UI state.
- **Startup Race Conditions**: Fixed critical data loss bugs where triggering actions (`Ctrl+N`, `Ctrl+Q`, or the `--new-conversation` CLI flag) during the initial database load would inadvertently overwrite the conversation store with an empty list. All state-mutating commands now await a full application load.

### Changed
- **Optimized File Search**: Increased search result limit to 50 and improved SQL performance by restricting fuzzy matching to relative file paths.
- **Strict Command Metadata**: Enhanced the `SubCommand` interface with mandatory `title` and asynchronous `getDynamicMatches` support for better extensibility.

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
- **AI Assistant Behaviors**: Added post-update workflow instructions to `GEMINI.md`. The AI assistant will now automatically run `npm run lint`, `npm run lint-fix`, and `npm run build` after making source code updates, and will document these changes in the `CHANGELOG.md`.

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
- **Alphabetical Skill Sorting**: Skills now sorted alphabetically in autocomplete.
- **Embedding API Tracking**: API calls are now recorded in performance statistics.

### Changed
- **`@canvas` Skill & `render_html` Tool**: Updated descriptions and prompts to prioritize responsive design.
- **Conversation Selection**: Default to selecting the most recently updated conversation.
- **Memory Saving Optimization**: Optimized background knowledge graph memory saving.
- **Improved Agent Robustness**: Enhanced default system prompt and skill descriptions.
- **Refined Tool Metadata**: Updated all tool descriptions with clearer usage constraints.
- **Sub-command Autocompletion**: Enhanced slash commands to support nested sub-commands.
- **Cumulative System Prompts**: `@` skills now append their specialized instructions.
- **Robust Syntax Highlighting**: Improved language detection for code blocks and file attachments.
- **Intelligent Auto-scroll**: Streaming responses now respect manual scrolling.
- **Refined Memory Architecture**: Extracted knowledge graph logic into a standalone library.
- **Uniform Message Spacing**: Consistent 12px gap between all message parts.
- **Optimized Message Rendering**: Reducing layout shifts during generation.
- **Project Rebranding**: Renamed from **Ollama Chat** to **Gnome AI Chat**.
- **Preferences Reorganization**: Behavior and Reasoning moved to General tab.
- **Skill Autocomplete**: Simplified `@` menu removes descriptions.
- **Semantic Search**: Results maintain chronological order grouped by date section.
- **Sorted Statistics**: Model usage sorted by request count descending.
- **Slash Command Behavior**: `/` now triggers at the start of any line.
- **Centralized Storage Logic**: Indexing and persistence logic consolidated.
- **Clean Settings UI**: Removed verbose descriptions and subtitles from Preferences.
- **Images**: Consistently displayed at 250px width via `Gtk.Picture`.
- **`formatSize`**: Always shows exactly two decimal places.

### Fixed
- **Sidebar Dynamic Re-grouping**: Conversations move between date headers immediately.
- **Streaming Resiliency**: Fixed crash on empty final response chunks.
- **GTK Snapshot Warnings**: Eliminated snapshotting box warnings.
- **Streaming State Protection**: Interaction buttons disabled during generation.
- **Message UI Crash**: Fixed crash when updating system messages without actions.
- **Data Persistence on Quit**: Mandatory storage flush during exit.
- **Empty Sidebar Headers**: Date headers removed when last conversation is deleted.
- **GTK Compatibility**: Replaced remove_all() for GTK 4.6+ support.
- **GJS Warnings**: Resolved "Too many arguments" warnings.
- **New Conversation Focus**: Chat input buffer correctly cleared.
- **Type-Safe Debounce**: Refactored debounce to be fully type-safe.
- Fixed command popover uninitialized rectangle bounds.
- Fixed focus management in the pull dialog.
