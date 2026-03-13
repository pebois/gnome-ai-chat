# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Interactive HTML Canvas**: Added the `render_html` tool powered by WebKitGTK 6.0. The AI can now autonomously generate and display interactive UIs, games, or data visualizations containing embedded CSS and JavaScript in a native preview window.
- **Inline Preview Controls**: Added a full-size, primary "Open preview" pill button underneath `render_html` tool calls in the chat history for immediate on-demand rendering.
- New model pull dialog with real-time progress tracking, including download speed and estimated time remaining.
- Progress bar and cancellation support for the manual Vector Indexing tool in Settings.
- Explicit `Stop` functionality for both model pulling and vector indexing operations.
- Keyboard support for the pull dialog (pressing Enter in the input field initiates the pull).
- Tracking of embedding API calls in performance statistics.
- **Screenshot Attachment**: Added "Take Screenshot" directly to the attachment menu, allowing users to quickly capture and attach their screen to conversations.
- **Global Reset Buttons**: Added "Reset to default" functionality for all model parameters, reasoning effort, and system prompt in Settings.
- **Intelligent Reset State**: Reset buttons now automatically disable themselves when a setting matches its factory default value.
- **Behavior Settings**: Dedicated settings group in Preferences for non-model related UI behaviors.
- **Enhanced Slash Command Menu**:
  - Dynamic filtering with visual bolding of matching prefixes.
  - Comprehensive keyboard navigation support (`Up/Down`, `PageUp/Down`, `Home/End`, `Tab`, `Return`, `Escape`).
  - **Wrap-around navigation**: Cycling through the list now wraps from bottom to top and vice-versa.
  - Tab completion for command names.
  - Intelligent focus management and redirection to preserve typing flow during menu interaction.
  - **Keyboard Shortcuts in Menu**: Command entries now display their corresponding keyboard shortcuts (e.g., `/settings` shows `Ctrl+,`).
  - **Enhanced Selection Feedback**: The menu now features hover-to-select behavior and utilizes system accent colors for the active command row.
  - **Background Search Indexing**: The application now hides the window immediately on close and performs conversation indexing in the background during the shutdown process, ensuring search results are up to date while providing a more responsive exit experience.
  - **Appearance Settings**: Dedicated "Appearance" page in Preferences allowing users to switch between System, Light, and Dark color schemes.
- **Debug Toggle**: Added `/debug` slash command to quickly toggle debug mode and visual development cues.
- **Hacker News Integration**: Added `/hn` slash command to quickly fetch and summarize the latest headlines from news.ycombinator.com using the web fetching tool.
- **Conversation Compression**: Added `/compress` slash command to strip reasoning blocks (`<think>`) and tool usage history from the current conversation, helping to stay within model context limits.
- **Persistent Web Caching**: Implemented an RFC-compliant HTTP caching system for the web fetching tool using `Soup.Cache`, persisting data across sessions in the user's cache directory.

### Changed
- **Synchronized UI Animations**: Refactored the chat input centering logic to use a single unified animation, ensuring perfectly synchronized movement and resizing.
- **Improved Tool Architecture**: Refactored web fetching to use a singleton `Soup.Session` for better performance through connection pooling and shared state.
- **Unified Command Execution**: Refactored the `/hn` command to utilize the formal application action system.
- **Preferences Dialog Reorganization**:
  - Moved **Behavior** and **Reasoning** settings to the General tab for better accessibility.
  - Moved **Maintenance** settings to the Data tab.
  - Reordered the tabs to place the **Data** tab at the end of the list.
- **Scroll Button Optimization**: Added a 500ms delay to the "Go to bottom" button appearance in the chat view to prevent flickering during rapid scrolling.
- **Compact Slash Commands**: Optimized the slash command menu layout with reduced vertical spacing and capped width for a better visual balance.
- **Improved Image Rendering**: Images now consistently display at 250px width using efficient GPU-based scaling via `Gtk.Picture`.
- **Clean Settings UI**: Removed verbose descriptions and subtitles from the Preferences dialog for a more direct "product" aesthetic.
- **Centralized Storage Logic**: Refactored indexing and data persistence logic into the `Storage` class to improve architectural separation.
- **Indexing Layout**: Realigned the progress bar to appear to the left of the indexing button for better visual flow.
- Semantic search results now maintain their natural chronological order and remain grouped within their date-based sections ("Today", "Yesterday", etc.).
- The Vector Indexing tool now always performs a full re-index of all conversations.
- Updated `formatSize` utility to always display exactly two decimal places for consistency.
- Refined semantic search threshold to 0.5 for better recall.
- Improved pull dialog UI with rounded "pill" buttons and optimized layout spacing.
- **Sorted Statistics**: Model usage in Performance Stats is now automatically sorted by the number of requests in descending order.
- **Improved Slash Command Behavior**:
- Triggering `/` at the start of any line in a multiline message now correctly opens the menu.
- Selection via `Return` or click now completes the command name in the buffer before execution.
- Automatically focus the first match when the menu appears or a filter is applied.
- Refactored command execution to utilize unified application actions.

### Fixed
- **Streaming Resiliency**: Fixed an application crash triggered by empty final response chunks from the Ollama API by adding robust optional chaining.
- **GTK Snapshot Warnings**: Eliminated GTK4 `Trying to snapshot GtkBox without a current allocation` warnings by assigning a minimal valid width request to invisible layout spacers.
- **Streaming State Protection**: Automatically disable message interaction buttons (copy, reload) while a response is being generated to prevent race conditions.
- **Message UI Crash**: Resolved a crash when attempting to update button sensitivity for messages without actions (e.g., system messages).
- **GJS Console Warnings**: Resolved "Too many arguments" warnings for `Gtk.Window.present()` across the application.
- **New Conversation Focus**: Creating a new conversation or switching to an empty one now correctly clears the chat input buffer.
- Error handling in the model pull stream to prevent the dialog from closing on API errors.
- Corrected JSON parsing for the Ollama pull progress stream.
- Fixed sidebar filtering logic to correctly show/hide date headers during active searches.
- Resolved a test failure in `formatModelName` and added comprehensive tests for `formatRemainingTime`.
- Fixed focus management in the pull dialog to ensure the input field remains active.
- **GTK Compatibility**: Replaced `Gtk.ListBox.remove_all()` with manual child removal loops to ensure support for GTK 4.6+ (Ubuntu 22.04).
- Fixed a regression where the command popover failed to appear on certain GTK versions due to unitialized rectangle bounds.
- **Empty Sidebar Headers**: Fixed an issue where date-based headers would remain visible in the sidebar after all conversations in that section were deleted.
- **Data Persistence on Quit**: Fixed a race condition where debounced saves might not complete before the application shut down; added a mandatory storage flush during the exit sequence.
