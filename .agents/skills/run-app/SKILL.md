---
name: run-app
description: Run, drive and screenshot gnome-ai-chat to prove a change works - render any dialog, window or widget to PNG at phone or desktop width in light or dark, launch an isolated instance on a virtual display, trigger app actions over D-Bus (open Settings, Pull, MCP, Skills...), click and type into it, screenshot the whole window, seed its database, and check the log for GTK/JS errors. Use it after every UI or feature change in src/app or src/lib before saying it works, when asked to run, start, launch, test or screenshot the app, check a layout at 360 px, or reproduce a runtime error, even if the user only says "try it" or "does it look right".
---

# Run and check gnome-ai-chat

Lint, the build and Jest don't load GTK. A change can pass all three and still throw at startup, warn about sizes or overflow at 360 px. Check it at runtime before you report it as done, and say plainly what you didn't check.

Run everything from the repo root after `npm run build`: both methods load `dist/`, not `src/`. `$SCRATCH` stands for your scratchpad directory, or `$(mktemp -d)` if you have none. Never write output into the repo.

Pick the method:
- **Look:** render the widget offscreen (section 1). It's fast, it doesn't touch the user's session, and you can read the PNG.
- **Behaviour, startup errors or the full window:** launch a headless instance (section 2). It runs the real app with its real database and actions, on a virtual display, and you can click, type and screenshot it.

## 1. Render to PNG

```bash
mkdir -p "$SCRATCH/shots"
gjs -m .agents/skills/run-app/scripts/render.js app/dialog/pull.mjs showPullDialog --args '["llama3.2"]' --width 360 --out "$SCRATCH/shots/pull-360.png"
```

**What the script does:**
1. It creates an `Adw.ApplicationWindow` of the given size and loads `global.css`.
2. It builds a stub `app` with `DEFAULT_SETTINGS` and two fake models; every other method is a no-op.
3. It calls `<export>(app, ...args)`.
4. It saves the result to a PNG, then reads it back:
   - a dialog presented on `app.window` is captured together with the window;
   - a window opened by the function, such as Skills or MCP, is captured on its own;
   - a widget the function returns becomes the window content.

**Options:**
- `--width` (default 360) and `--height` (default 640);
- `--dark` or `--light`; without either, the render follows the system;
- `--wait ms`: raise it for content that loads asynchronously;
- `--args` takes JSON for the extra arguments.

**Coverage:** render every layout you touched at 360 and at 1200 wide, and in dark and light when the change involves colour. Look at the PNGs with the Read tool, and check for:
- clipped text;
- horizontal overflow;
- buttons pushed off-screen;
- misaligned rows.

**Warnings:** read the script's stderr too. It loads the real `global.css`, so CSS mistakes show up as `Gtk-WARNING ... Theme parser error`, along with `JS ERROR`, `Gtk-CRITICAL`, sizing warnings and `toast:`/`reportError:` lines from the stub. Lint, the build and tsc can't catch any of these.

**Limits:** the stub has no database, no conversation and no provider. Code that awaits real data renders empty. If a function needs more from `app`, pass it through `--args`, or write a small one-off script in the scratchpad based on `render.js`.

**Common targets** (check the export names with `grep -n "^export function" <file>`):

| What | Module | Export |
|---|---|---|
| Pull Model | `app/dialog/pull.mjs` | `showPullDialog` (args `["model"]`) |
| Statistics | `app/dialog/stats.mjs` | `showStatsDialog` |
| About | `app/window/about.mjs` | `showAboutWindow` |
| Settings | `app/window/preferences/index.mjs` | `showPreferencesWindow` |
| Skills / MCP | `app/window/manage/index.mjs` | `showManageWindow` (args `[{"section":"skills"}]` or `"mcp"`) |

## 2. Headless instance

This runs the real app (database, migrations, provider, actions) on a virtual X display and a private D-Bus. Nothing appears on the user's screen, and the user's running instance and data stay untouched.

The private bus can't auto-start services. This matters: a normal `dbus-run-session` starts its own document portal, which takes over `/run/user/1000/doc` and removes it on exit, and every `flatpak run` then fails until the portal is restarted.

### Start

```bash
S="$SCRATCH/run"; rm -rf "$S"; mkdir -p "$S/xdg"
cat > "$S/bus.conf" <<CONF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig><type>session</type><listen>unix:abstract=gnome-ai-chat-test-$$</listen><auth>EXTERNAL</auth>
<policy context="default"><allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/></policy></busconfig>
CONF
Xvfb :91 -screen 0 1280x800x24 -nolisten tcp > "$S/xvfb.log" 2>&1 & echo $! > "$S/xvfb.pid"
dbus-daemon --config-file="$S/bus.conf" --fork --print-address=1 --print-pid=2 > "$S/bus.addr" 2> "$S/bus.pid"
export DBUS_SESSION_BUS_ADDRESS="$(head -1 "$S/bus.addr")" DISPLAY=:91
(XDG_DATA_HOME="$S/xdg" GDK_BACKEND=x11 GTK_A11Y=none setsid gjs -m dist/main.mjs > "$S/app.log" 2>&1 & echo $! > "$S/app.pid")
gdbus wait --session --timeout 15 io.github.pebois.gnome-ai-chat
```

- Each Bash call starts a fresh shell. Start every later call with `S=...; export DBUS_SESSION_BUS_ADDRESS="$(head -1 "$S/bus.addr")" DISPLAY=:91`.
- If display `:91` is taken (`Xvfb` exits, see `xvfb.log`), pick another number.
- The socket is abstract because a socket path under the scratchpad is too long for D-Bus.
- The instance talks to the real Ollama at `localhost:11434` when it is running, so models and replies are real. Don't send prompts that cost the user anything without asking.
- Xvfb has no window manager or GPU: the main window sits at the top left without a shadow, the accent colour is the default, and `libEGL ... DRI3` lines in the log are normal.

### Drive it

```bash
A="gdbus call --session --dest io.github.pebois.gnome-ai-chat --object-path /io/github/pebois/gnome_ai_chat --method org.gtk.Actions"
$A.DescribeAll
$A.Activate settings "[]" "{}"
$A.Activate mcp "[<'manage'>]" "{}"
```

`DescribeAll` lists every action and its parameter type:
- `''` takes `"[]"`;
- `'s'` takes `"[<'value'>]"`;
- `'i'` takes `"[<1>]"`.

The actions come from `COMMANDS` in `src/lib/commands/` and are registered by `App._setupActions`. A new command appears here, which is a quick check that it is wired up.

For what actions can't reach, such as typing, shortcuts, popovers and tabs inside a dialog, use real input:

```bash
X=.agents/skills/run-app/scripts/xinput.py
python3 $X click 400 400
python3 $X move 300 250
python3 $X rclick 300 250
python3 $X scroll 400 400 12
python3 $X type "/se"
python3 $X key Escape ctrl+comma Tab Return
import -window root "$S/step1.png"
```

- `import -window root` (ImageMagick) captures the whole virtual screen. Read the PNG to see the state and to find the coordinates of the next click.
- Message actions (Copy, Regenerate, ⓘ) only appear on hover: `move` over the message before you click them. `rclick` opens context menus.
- `xinput.py` sends US keysyms. The user types on AZERTY, so for shortcuts on digits or symbols, check the keysym the app binds rather than the key position.
- To wait between steps, use `python3 -c 'import time; time.sleep(2)'`. A plain `sleep` may be blocked by the agent harness, and `timeout 2 tail -f /dev/null` returns at once when inotify watches run out.

### Seed data

Start the app once so that the migrations create the tables, stop it, then edit the database and launch again:

```bash
sqlite3 "$S/xdg/io.github.pebois.gnome-ai-chat/database.sqlite" '.tables'
```

Read the schema with `.schema <table>` before you insert rows. Never point a test run at the user's real data directory.

### Check the log, then stop

```bash
grep -E "JS ERROR|JS WARNING|Gtk-WARNING|Gtk-CRITICAL|Adwaita-WARNING|reportError" "$S/app.log"
kill "$(cat "$S/app.pid")" "$(cat "$S/xvfb.pid")" "$(cat "$S/bus.pid")"
mount | grep -q /run/user/1000/doc || systemctl --user restart xdg-document-portal.service
```

- **Log:** a clean run prints nothing for the grep. Report every match with its stack line.
- **Stop everything you started:** app, Xvfb and the bus. Leave no `gjs` behind.
- **Portal check:** this setup shouldn't touch the document portal, but the last line costs nothing and repairs it if anything did.

## Report

Say which method you used and what you checked: which screens, which widths, the log result. Mention what this can't cover, such as a real model pull, a provider reply, file pickers or keyboard input, so the user knows what to try by hand.
