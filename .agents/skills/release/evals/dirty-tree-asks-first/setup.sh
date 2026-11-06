#!/usr/bin/env bash
set -eu
python3 - <<'PY'
p = 'CHANGELOG.md'
s = open(p).read()
entry = """## [Unreleased]

### Fixed
- **Stats Dialog Rounding**: Average latency in the statistics dialog is rounded to whole milliseconds.

"""
s = s.replace("## [Unreleased]\n\n", entry, 1)
open(p, 'w').write(s)
PY
git commit -qam "fix: round stats latency"
sed -i "s/export const CONVERSATION_MAX_WIDTH = 1024/export const CONVERSATION_MAX_WIDTH = 960/" src/lib/constants.ts
