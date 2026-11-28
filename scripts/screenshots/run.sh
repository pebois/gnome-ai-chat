#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/screenshots}"

WORK_DIR="$(mktemp -d /tmp/gnome-ai-chat-screenshots.XXXXXX)"
RAW_DIR="$WORK_DIR/raw"
XDG_DIR="$WORK_DIR/xdg"
mkdir -p "$RAW_DIR/light" "$XDG_DIR/data" "$XDG_DIR/config" "$XDG_DIR/cache"

MOCK_PID=""
cleanup() {
  if [[ -n "$MOCK_PID" ]]; then
    kill "$MOCK_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/dist/app/index.mjs" ]]; then
  npm run build
fi

# Start local mock Ollama server on an ephemeral port
URL_FILE="$WORK_DIR/ollama-url"
node "$ROOT_DIR/scripts/screenshots/mock-ollama.mjs" > "$URL_FILE" &
MOCK_PID=$!

for _ in $(seq 1 50); do
  if [[ -s "$URL_FILE" ]]; then
    break
  fi
  sleep 0.1
done
OLLAMA_URL="$(tr -d '\r\n' < "$URL_FILE")"
if [[ -z "$OLLAMA_URL" ]]; then
  echo "Failed to start mock Ollama server" >&2
  exit 1
fi

echo "Mock Ollama listening on $OLLAMA_URL"

xvfb-run -a -s "-screen 0 2048x1536x24" \
  env \
    HOME="/home/alex" \
    XDG_DATA_HOME="$XDG_DIR/data" \
    XDG_CONFIG_HOME="$XDG_DIR/config" \
    XDG_CACHE_HOME="$XDG_DIR/cache" \
    GDK_BACKEND=x11 \
    GDK_SCALE=2 \
    GSK_RENDERER=cairo \
    WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    SCREENSHOT_ROOT="$ROOT_DIR" \
    SCREENSHOT_RAW_DIR="$RAW_DIR" \
    SCREENSHOT_OLLAMA_URL="$OLLAMA_URL" \
    gjs -m "$ROOT_DIR/scripts/screenshots/capture.mjs"

python3 "$ROOT_DIR/scripts/screenshots/frame.py" "$RAW_DIR" "$OUT_DIR"
echo "Screenshots saved to $OUT_DIR"
