#!/usr/bin/env bash
set -eu
python3 - <<'PY'
p = 'CHANGELOG.md'
s = open(p).read()
entry = """## [Unreleased]

### Fixed
- **Deep Search Cancel**: Pressing Stop during the page-reading step of `/deepsearch` no longer leaves a spinner on the tool row.
- **Sidebar Pin Order**: Pinned conversations keep their order after a restart instead of being sorted by date.

"""
s = s.replace("## [Unreleased]\n\n", entry, 1)
open(p, 'w').write(s)
PY
sed -i "s/ORDER BY id DESC/ORDER BY pinned DESC, id DESC/" src/lib/db/conversations.ts
git commit -qam "fix: deep search cancel and pin order"
