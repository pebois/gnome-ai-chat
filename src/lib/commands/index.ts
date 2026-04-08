import type GLib from 'gi://GLib?version=2.0'

import type { AppInterface } from '@/lib/app.js'
import * as chat from '@/lib/commands/chat.js'
import * as dialogs from '@/lib/commands/dialogs.js'
import * as files from '@/lib/commands/files.js'
import * as memory from '@/lib/commands/memory.js'
import * as system from '@/lib/commands/system.js'
import * as ui from '@/lib/commands/ui.js'

export interface SubCommand {
  name: string
  description: string
  icon: string
  requiresArgument?: boolean
  getDynamicMatches?: (app: AppInterface, query: string) => Promise<{ name: string; title: string; description: string; icon: string }[]>
}

export interface Command {
  name: string
  description: string
  icon: string
  visible?: boolean
  subCommands?: SubCommand[]
  parameterType?: GLib.VariantType
  getInitialState?: (app: AppInterface) => GLib.Variant | undefined
  accels?: string[]
  activate: (app: AppInterface, parameter: GLib.Variant | undefined) => void | Promise<void>
}

export const COMMANDS: Command[] = [
  chat.clear,
  chat.newConversation,
  chat.openConversation,
  chat.compress,
  chat.hn,
  ui.toggleSidebar,
  ui.search,
  ui.focusInput,
  dialogs.settings,
  dialogs.shortcuts,
  dialogs.ps,
  dialogs.pull,
  dialogs.stats,
  dialogs.skills,
  dialogs.about,
  system.debug,
  system.theme,
  system.quit,
  memory.memory,
  files.files
]
