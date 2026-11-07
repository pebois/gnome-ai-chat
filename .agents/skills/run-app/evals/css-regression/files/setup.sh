#!/bin/sh
set -e
python3 - src/app/global.css.ts <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = ".message-sources button.small {\n  min-height: 24px;\n  padding: 2px 10px;"
assert old in s
open(p, 'w').write(s.replace(old, old + "\n  colour: @accent_color;\n  border-radius: 6pxx;", 1))
PY
npm run build
