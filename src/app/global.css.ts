export const css = /* css */`
.mcp-status-dot {
  min-width: 14px;
  min-height: 14px;
  border-radius: 50%;
  background-color: alpha(@window_fg_color, 0.25);
}

.mcp-status-dot.success {
  background-color: @success_color;
}

.mcp-status-dot.error {
  background-color: @error_color;
}

.searchbar {
  background-color: transparent;
}

.searchbar > revealer > box {
  background-color: transparent;
}

.searchbar * {
  border: none;
}

.content-panel {
  background-color: @view_bg_color;
}

.content-panel headerbar {
  background-color: @view_bg_color;
}

.chat-history {
  padding: 6px;
  background-color: transparent;
}

.chat-history > row {
  background-color: transparent;
  padding: 6px 0;
}

.chat-history > row:hover {
  background-color: transparent;
}

.chat-history > row:selected {
  background-color: transparent;
}

.scroll-button:hover {
  background: black;
}

.thinking-label {
  margin: 12px;
}

.pull-caption {
  font-size: 12px;
}

.message-sources button.small {
  min-height: 24px;
  padding: 2px 10px;
  font-size: smaller;
}

.search-match {
  border-radius: 12px;
  outline: 2px solid alpha(@accent_color, 0.6);
  outline-offset: 4px;
}

.user-message {
  padding: 12px;
  border-radius: 12px;
  border-bottom-right-radius: 0px;
  background-color: @accent_bg_color;
  color: @accent_fg_color;
}

.message-canvas {
  border-radius: 12px;
  background: @shade_color;
}

.message-image {
  border-radius: 12px;
  border: 1px solid @shade_color;
}

.status-page {
  margin-bottom: 125px;
}

.message-input-toolbar {
  background-color: @sidebar_bg_color;
  border: 1px solid @shade_color;
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 12px;
}

.message-input {
  border-radius: 8px;
  background-color: @sidebar_bg_color;
}

.message-input textview {
  background-color: transparent;
  padding: 6px;
}

.message-input textview text {
  background-color: transparent;
}

.message-input-placeholder {
  margin-left: 6px;
  margin-top: 6px;
}

.message-input-hint {
  margin-top: 6px;
}

.skill-chip {
  background-color: alpha(@accent_bg_color, 0.15);
  color: @accent_color;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 0.85em;
}

.settings-text-view {
  padding: 12px;
}

.row-button {
  margin-top: 6px;
  margin-bottom: 6px;
}

.command-list row:selected {
  background-color: @accent_bg_color;
  color: @accent_fg_color;
}

.code-view {
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

.markdown-table row:hover {
  background-color: @shade_color;
}

.markdown-table header {
  background: none;
}
.markdown-table header button {
  background: none;
  box-shadow: none;
  font-weight: normal;
  color: @secondary_fg_color;
  padding: 8px;
  min-height: 0;
  min-width: 0;
}

.message-text {
  line-height: 1.4;
}
`
