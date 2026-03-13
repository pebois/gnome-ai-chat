declare module 'gi://GObject' {
  import GObject from '@girs/gobject-2.0'
  export default GObject
}

declare module 'gi://Gtk?version=4.0' {
  import Gtk from '@girs/gtk-4.0'
  export default Gtk
}

declare module 'gi://Gdk' {
  import Gdk from '@girs/gdk-4.0'
  export default Gdk
}

declare module 'gi://Gio' {
  import Gio from '@girs/gio-2.0'
  export default Gio
}

declare module 'gi://GioUnix?version=2.0' {
  import GioUnix from '@girs/giounix-2.0'
  export default GioUnix
}

declare module 'gi://Adw?version=1' {
  import Adw from '@girs/adw-1'
  export default Adw
}

declare module 'gi://GLib?version=2.0' {
  import GLib from '@girs/glib-2.0'
  export default GLib
}

declare module 'gi://Pango' {
  import Pango from '@girs/pango-1.0'
  export default Pango
}

declare module 'gi://Soup?version=3.0' {
  import Soup from '@girs/soup-3.0'
  export default Soup
}

declare module 'gi://WebKit?version=6.0' {
  import WebKit from '@girs/webkit-6.0'
  export default WebKit
}

declare module 'gi://GdkPixbuf' {
  import GdkPixbuf from '@girs/gdkpixbuf-2.0'
  export default GdkPixbuf
}

declare module 'gi://Graphene' {
  import Graphene from '@girs/graphene-1.0'
  export default Graphene
}

declare class TextEncoder {
  encode(input?: string): Uint8Array
}

declare class TextDecoder {
  decode(input?: Uint8Array): string
}

declare const imports: { system: { programInvocationName: string } }

declare const ARGV: string[]
