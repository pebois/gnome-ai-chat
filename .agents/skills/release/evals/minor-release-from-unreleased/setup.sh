#!/usr/bin/env bash
set -eu
python3 - <<'PY'
p = 'CHANGELOG.md'
s = open(p).read()
entry = """## [Unreleased]

### Added
- **Export to Markdown**: A new "Export" item in the conversation menu saves the conversation as a Markdown file, with code blocks, tool calls collapsed into `<details>` blocks and images saved next to it.

### Fixed
- **Find Bar Focus**: Closing the find bar with Escape now returns focus to the message input.

"""
s = s.replace("## [Unreleased]\n\n", entry, 1)
open(p, 'w').write(s)
PY
git commit -qam "feat: export conversations to markdown"
