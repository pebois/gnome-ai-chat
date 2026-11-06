---
name: adwaita-ui
description: GNOME HIG and Libadwaita 1.9 guidance for building or changing UI in gnome-ai-chat (GJS + TypeScript, GTK4, GNOME 50 runtime) - which Adw widget fits which pattern, deprecated widgets and their replacements, adaptive layouts with breakpoints, dialogs, toasts vs banners, boxed lists, accent colours and CSS, plus this codebase's own UI idioms. Use it whenever you add or change a window, dialog, page, sidebar, header bar, preferences row, list, popover, toast, banner, status page, breakpoint or CSS in src/app/, review UI code, or the user asks how something should look or behave "the GNOME way", even if they don't mention Adwaita.
---

# Adwaita UI for gnome-ai-chat

The app targets the GNOME 50 runtime, which ships Libadwaita 1.9 and GTK 4.20. Anything below is available. Native-looking UI is the product's main selling point, so:
- prefer a ready-made Adw widget over a hand-built `Gtk.Box` with custom CSS;
- prefer the current widget over a deprecated one, even when the old one still works.

## Pick the widget

| Need | Use | Notes |
|---|---|---|
| Window or page with header bar/toolbars | `Adw.ToolbarView` + `Adw.HeaderBar` | Never a vertical `Gtk.Box` holding a header bar: ToolbarView gets backdrop styling and spacing right. Header bars beside a sidebar get the `flat` class. |
| Sidebar + content (main window) | `Adw.OverlaySplitView` (what `window/main/index.ts` uses) or `Adw.NavigationSplitView` | NavigationSplitView when the narrow layout should navigate sidebar → content like pages. Neither collapses by itself: add a breakpoint that sets `collapsed`. |
| Drill-down pages | `Adw.NavigationView` + `Adw.NavigationPage` | Gives back button, swipe and Escape for free. |
| Tabs/views in one window | `Adw.ViewStack` + `Adw.ViewSwitcher` (policy `wide`) in the header; `Adw.InlineViewSwitcher` (1.7) inside content; `Adw.ToggleGroup` (1.7) for a small segmented choice | The MCP editor switches tabs from the header. |
| Settings window | `Adw.PreferencesDialog` + `Adw.PreferencesPage` + `Adw.PreferencesGroup` | Set `search_enabled: true` if search is wanted (default false). |
| Secondary dialog (details, stats, pickers) | `Adw.Dialog` with `content_width`/`content_height`, opened with `dialog.present(app.window)` | See `src/app/dialog/stats.ts`. Always modal, adaptive (bottom sheet on narrow windows). |
| Yes/no, destructive confirm | `Adw.AlertDialog` | Reuse `showDestructiveConfirmation()` in `src/lib/ui.ts`. Destructive response gets `Adw.ResponseAppearance.DESTRUCTIVE`. |
| About | `Adw.AboutDialog` | |
| Keyboard shortcuts | `Adw.ShortcutsDialog` (1.8) | |
| Transient feedback ("Copied", "Saved", undo) | `Adw.Toast` via `app.showToast(message, error?, action?)` | Never build toasts by hand; errors go through `app.reportError`. One short sentence, no trailing period. |
| Persistent state the user should act on (offline, update available, model missing) | `Adw.Banner` at the top of the content | Stays until the state changes, unlike a toast. |
| Empty, error, loading pages | `Adw.StatusPage` (wrap with `createStatusPageWrapper()`) | Icon + title + one-line description + at most one pill button (`createPillButton()`). |
| Short list of settings or items | `Gtk.ListBox` with class `boxed-list`, or `Adw.PreferencesGroup` | Rows: `Adw.ActionRow`, `SwitchRow`, `ComboRow`, `EntryRow`, `PasswordEntryRow`, `SpinRow`, `ExpanderRow`, `ButtonRow` (1.6). Use rows' `add_suffix`/`add_prefix`, not hand-made boxes. |
| Long or dynamic lists (conversations, messages, models) | `Gtk.ListView` / `Gtk.ListBox` with `navigation-sidebar` class in sidebars | `boxed-list` is for a handful of rows, not hundreds. |
| Spinner | `Adw.Spinner` | `Gtk.Spinner` is legacy; `Adw.SpinnerPaintable` for spinners inside images or status pages. |
| Narrow-width rearrangement of the same widgets | `Adw.MultiLayoutView` (1.6) with `Adw.Layout`/`Adw.LayoutSlot` | Only when hiding/collapsing isn't enough. |
| Bottom drawer on mobile | `Adw.BottomSheet` (1.6) | |
| Wrapping chips/tags | `Adw.WrapBox` (1.7) | |
| Readable column width | `Adw.Clamp` (`CONVERSATION_MAX_WIDTH` for the chat column) | |
| Search in a list | `Gtk.SearchBar` + `Gtk.SearchEntry`, toggled by a header `Gtk.ToggleButton` bound to `search-mode-enabled`, with Ctrl+F | Sidebar and find bar follow this pattern; give the bar the `searchbar` class used in `global.css.ts`. |

## Deprecated → replacement

Don't add new uses of the deprecated widgets, and when you touch code that uses one, migrate it if the change is small, or mention it.

| Deprecated | Since | Replacement |
|---|---|---|
| `Adw.PreferencesWindow` | 1.6 | `Adw.PreferencesDialog` (`present(parent)`, `search_enabled` defaults to false, `add_toast` on the dialog) |
| `Adw.MessageDialog` | 1.6 | `Adw.AlertDialog` |
| `Adw.AboutWindow` | 1.6 | `Adw.AboutDialog` |
| Modal `Adw.Window` / `Gtk.Window` used as a dialog with `transient_for` | 1.5 | `Adw.Dialog` + `present(parent)` |
| `Adw.Leaflet` | 1.4 | `Adw.NavigationView` or `Adw.NavigationSplitView` |
| `Adw.Flap` | 1.4 | `Adw.OverlaySplitView` (`flap`→`sidebar`, `reveal-flap`→`show-sidebar`, `locked`→`pin-sidebar`), or `Adw.BottomSheet` |
| `Adw.Squeezer`, `Adw.ViewSwitcherTitle` | 1.4 | Breakpoints; `Adw.ViewSwitcher` with policy `wide` |
| `Gtk.ShortcutsWindow` | GTK 4.18 | `Adw.ShortcutsDialog` |
| `Gtk.Dialog`, `Gtk.MessageDialog`, `Gtk.FileChooserDialog` | GTK 4.10 | `Adw.Dialog` / `Adw.AlertDialog` / `Gtk.FileDialog` |

`Adw.Dialog` needs an `Adw.Window` or `Adw.ApplicationWindow` ancestor to show as a sheet; otherwise it falls back to a separate window. The parent argument to `present()` can be any widget inside that window.

Real windows (not dialogs) are still right for independent tools the user keeps open next to the chat, such as the Skills editor and MCP Servers windows: use `Adw.Window` or `Adw.ApplicationWindow` with an `Adw.ToolbarView` content.

## Adaptive layouts

- Use `Adw.Breakpoint` on the window (or `Adw.Dialog`, or `Adw.BreakpointBin` for one region). Conditions accept `px`, `pt` and `sp`. Prefer `sp`, which follows the user's text scaling, e.g. `Adw.BreakpointCondition.parse('max-width: 400sp')`.
- Setters change properties while the breakpoint applies and restore them after. Use `apply`/`unapply` signals only for logic that setters can't express.
  - In GJS, setter values are `GObject.Value`s: see `_setupBreakpoints()` in `src/app/window/main/index.ts` and `addResponsiveBreakpoints()` in `src/app/ui/input.ts`.
- A widget with breakpoints loses its minimum size. Always set `width_request` and `height_request` on the window to the smallest supported size (GNOME's target is 360×294). Otherwise content overflows and GTK warns.
- Check every new layout at 360 px wide: nothing should be cut off or need horizontal scrolling.

## Styling

Styles live in `src/app/global.css.ts`. Use style classes before writing CSS:
- **Buttons:** `suggested-action`, `destructive-action`, `flat`, `circular`, `pill`, `osd`, `raised`.
- **Text:** `title-1`…`title-4`, `heading`, `caption`, `caption-heading`, `dim-label`, `numeric`, `monospace`.
- **Containers:** `card`, `boxed-list`, `navigation-sidebar`, `toolbar`, `linked`.
- **Status colours:** `accent`, `success`, `warning`, `error`.

When custom CSS is needed:
- Use the named colours and variables (`@accent_bg_color`, `@accent_fg_color`, `@accent_color`, `@window_bg_color`, `@view_bg_color`, `@sidebar_bg_color`, `@headerbar_bg_color`, `@shade_color`, `alpha(@window_fg_color, 0.1)`…).
- Never hard-code colours: the app follows the system accent colour and dark/light/high-contrast styles.
- In code, read `Adw.StyleManager.get_default()`:
  - `get_accent_color_rgba()`, `get_dark()`, `get_high_contrast()`;
  - listen to `notify::accent-color-rgba` and `notify::dark` to repaint. The find highlight in `src/app/ui/message/index.ts` does this.
- Don't override the accent colour or Adwaita's widget styles globally: scope custom rules to your own class.
- Use 6/12/18/24 px spacing and margins, as the rest of the app does. Corner radii come from Adwaita classes (`card`, `boxed-list`), not custom values.

## Behaviour and accessibility

- **Labels and tooltips:**
  - Every icon-only button needs a `tooltip_text`, which also gives it an accessible name. Use the shortcut hint in it when one exists, e.g. `'Send (Enter)'`.
  - Labels use title case for buttons, headings and menu items ("Pull Model", "Indexed Folders"), and sentence case for descriptions, subtitles and toasts.
- **Keyboard:**
  - Every action reachable by mouse must also be reachable by keyboard.
  - Register shortcuts through the command definitions (`accels` on a command in `src/lib/commands/`), which `App._setupActions` turns into app actions, so the shortcuts dialog lists them.
  - The user's keyboard is AZERTY: avoid shortcuts that need Shift on digits or symbols that move on AZERTY.
- **Custom widgets:** set an accessible role or label (`accessible_role`, `update_property([Gtk.AccessibleProperty.LABEL], [...])`) when the widget isn't a standard control, and keep focus visible.
- **Destructive actions:** confirm them with an `Adw.AlertDialog` or offer undo in a toast. Never act on a single unconfirmed click.
- **Busy states:** show progress in place (spinner in the row or button, or a banner) instead of blocking the window, and keep Stop/Cancel available.

## Codebase idioms

- UI classes receive `AppInterface` and own their widgets; dialogs are plain `show…Dialog(app)` functions in `src/app/dialog/`.
- Imports use the `@/` alias, with `gi://Adw?version=1` and `gi://Gtk?version=4.0`.
- No code comments. Explicit `GObject.registerClass` only for subclasses.
- After UI changes, run `npm run lint-fix`, `npm run lint` and `npm run build`, and add a `CHANGELOG.md` `[Unreleased]` entry.

## Sources

- **Libadwaita docs:** https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/. See especially:
  - "Migrating to Adaptive Dialogs";
  - "Migrating to Breakpoints";
  - "Adaptive Layouts";
  - "Styles & Appearance";
  - "Style Classes".
- **GNOME HIG:** https://developer.gnome.org/hig/
- **Libadwaita 1.4 release notes**, by the maintainer: https://blogs.gnome.org/alicem/?p=7181

When unsure whether a widget or property exists in 1.9, check the API reference rather than guessing.
