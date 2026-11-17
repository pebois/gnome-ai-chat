import ctypes
import os
import sys
import time

USAGE = '''usage: DISPLAY=:N python3 xinput.py <command> [...]
  move X Y             move the pointer (reveals hover-only buttons)
  click X Y            left click at screen coordinates
  rclick X Y           right click (context menus)
  key NAME [NAME...]   press keys in order; join modifiers with +, e.g. ctrl+comma Escape Tab Return
  scroll X Y STEPS     scroll the wheel at screen coordinates, down for positive steps
  type TEXT            type ASCII text'''

x11 = ctypes.cdll.LoadLibrary('libX11.so.6')
xtst = ctypes.cdll.LoadLibrary('libXtst.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
ALIASES = {'ctrl': 'Control_L', 'shift': 'Shift_L', 'alt': 'Alt_L', 'super': 'Super_L', 'enter': 'Return', 'esc': 'Escape'}


def open_display():
    name = os.environ.get('DISPLAY', '').encode()
    display = x11.XOpenDisplay(name)
    if not display:
        sys.exit(f'cannot open display {name.decode()!r}')
    return ctypes.c_void_p(display)


def keycode(display, name):
    sym = x11.XStringToKeysym(ALIASES.get(name.lower(), name).encode())
    code = x11.XKeysymToKeycode(display, sym) if sym else 0
    if not code:
        sys.exit(f'unknown key {name!r}')
    return code


def press(display, combo):
    codes = [keycode(display, part) for part in combo.split('+')]
    for code in codes:
        xtst.XTestFakeKeyEvent(display, code, 1, 0)
    for code in reversed(codes):
        xtst.XTestFakeKeyEvent(display, code, 0, 0)
    x11.XFlush(display)
    time.sleep(0.15)


def main(argv):
    if len(argv) < 2:
        sys.exit(USAGE)
    display = open_display()
    command, args = argv[1], argv[2:]
    if command in ('move', 'click', 'rclick') and len(args) == 2:
        xtst.XTestFakeMotionEvent(display, -1, int(args[0]), int(args[1]), 0)
        x11.XFlush(display)
        time.sleep(0.2)
        if command != 'move':
            button = 1 if command == 'click' else 3
            xtst.XTestFakeButtonEvent(display, button, 1, 0)
            xtst.XTestFakeButtonEvent(display, button, 0, 0)
            x11.XFlush(display)
    elif command == 'scroll' and len(args) == 3:
        xtst.XTestFakeMotionEvent(display, -1, int(args[0]), int(args[1]), 0)
        x11.XFlush(display)
        time.sleep(0.2)
        steps = int(args[2])
        for _ in range(abs(steps)):
            button = 5 if steps > 0 else 4
            xtst.XTestFakeButtonEvent(display, button, 1, 0)
            xtst.XTestFakeButtonEvent(display, button, 0, 0)
            x11.XFlush(display)
            time.sleep(0.05)
    elif command == 'key' and args:
        for combo in args:
            press(display, combo)
    elif command == 'type' and len(args) == 1:
        for char in args[0]:
            name = {' ': 'space', '/': 'slash', '.': 'period', ',': 'comma', '-': 'minus', ':': 'colon'}.get(char, char)
            press(display, f'shift+{name}' if char.isupper() or char == ':' else name)
    else:
        sys.exit(USAGE)
    time.sleep(0.5)
    x11.XCloseDisplay(display)


main(sys.argv)
