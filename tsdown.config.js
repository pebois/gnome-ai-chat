import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: false,
  entry: [
    'src/lib/ambient.d.ts',
    'src/**/*.ts'
  ],
  deps: {
    neverBundle: [
      'gi://Adw?version=1',
      'gi://Gdk',
      'gi://GdkPixbuf',
      'gi://Gio',
      'gi://GioUnix?version=2.0',
      'gi://GLib?version=2.0',
      'gi://GObject',
      'gi://Graphene',
      'gi://Gtk?version=4.0',
      'gi://GtkSource?version=5',
      'gi://Pango',
      'gi://Soup?version=3.0',
      'gi://WebKit?version=6.0'
    ]
  },
  sourcemap: false,
  target: 'node22',
  onSuccess: 'npm run compile-resources'
})
