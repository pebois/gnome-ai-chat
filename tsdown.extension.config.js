import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['extension/extension.ts'],
  outDir: 'extension',
  clean: false,
  format: 'esm',
  target: 'es2022',
  deps: {
    neverBundle: [
      'gi://Gio',
      'gi://Meta',
      'gi://Shell',
      'gi://St',
      'resource:///org/gnome/shell/extensions/extension.js',
      'resource:///org/gnome/shell/ui/main.js',
      'resource:///org/gnome/shell/ui/panelMenu.js',
      'resource:///org/gnome/shell/ui/popupMenu.js'
    ]
  }
})
