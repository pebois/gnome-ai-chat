import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

import { showRunningModelsDialog } from '@/app/dialog/ps.js'
import { showPullDialog } from '@/app/dialog/pull.js'
import { showShortcutsDialog } from '@/app/dialog/shortcuts.js'
import { showStatsDialog } from '@/app/dialog/stats.js'
import { css } from '@/app/global.css.js'
import type { Chat } from '@/app/ui/chat.js'
import type { ChatConversation } from '@/app/ui/history.js'
import type { Sidebar } from '@/app/ui/sidebar.js'
import { showAboutWindow } from '@/app/window/about.js'
import { AppWindow } from '@/app/window/main.js'
import { showPreferencesWindow } from '@/app/window/preferences.js'
import { showSkillsWindow } from '@/app/window/skills.js'
import { APPLICATION_ID, DEFAULT_CHAT_MODEL, DEFAULT_SETTINGS } from '@/lib/constants.js'
import { Ollama } from '@/lib/ollama.js'
import type { StorageConversation, StorageSettings, StorageSkill } from '@/lib/storage.js'
import { Storage } from '@/lib/storage.js'
import { Tracker } from '@/lib/tracker.js'
import { createSimpleAction } from '@/lib/ui.js'
import { convertMessageToTitle, pangoEscape } from '@/lib/utils.js'

export interface AppInterface {
  readonly chat: Chat
  readonly conversation?: ChatConversation
  readonly conversations: StorageConversation[]
  readonly isBusy: boolean
  readonly isGeneratingMessage: boolean
  readonly isSummarizing: boolean
  readonly model: string
  readonly models: string[]
  readonly ollama: Ollama
  readonly settings: StorageSettings
  readonly sidebar: Sidebar
  readonly skills: StorageSkill[]
  readonly storage: Storage
  readonly supportsVision: boolean
  readonly toolModels: string[]
  readonly tracker: Tracker
  readonly window: AppWindow

  activateAction(action_name: string, parameter: GLib.Variant | null): void
  clearAllConversations(): Promise<void>
  connect(sigName: 'busy-changed', callback: (_: number, isBusy: boolean) => void): number
  connect(sigName: 'capabilities-changed', callback: (_: number) => void): number
  connect(sigName: 'syntax-changed', callback: (_: number, theme: string) => void): number
  connect(sigName: string, callback: (...args: unknown[]) => void): number
  disconnect(id: number): void
  focusInput(): void
  getShortcut(action_name: string): string | null
  init: () => Promise<void>
  saveSettings(): void
  saveSkills(): void
  sendNotification(id: string, notification: Gio.Notification): void
  setConversation(id: number): Promise<void>
  setConversationTitle(conv: StorageConversation, title: string): void
  setGeneratingMessage(active: boolean): void
  setModel(model: string): void
  setSummarizing(active: boolean): void
  setTheme(theme: number): void
  setSyntax(theme: string): void
  showToast(message: string, error?: boolean): void
  toggleDebug(): void
  toggleSidebar(): void
}

export class App extends Adw.Application implements AppInterface {
  private _active: boolean
  private _settings: StorageSettings
  private _isExiting: boolean = false

  public conversation?: ChatConversation
  public conversations: StorageConversation[]
  public isGeneratingMessage = false
  public isSummarizing = false
  public model: string
  public models: string[]
  public ollama: Ollama
  public skills: StorageSkill[] = []
  public storage: Storage
  public supportsVision = true
  public toolModels: string[] = []
  public tracker: Tracker
  public window!: AppWindow

  constructor(application_id: string) {
    super({
      application_id: application_id,
      flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE
    })
    this._active = false
    this._settings = DEFAULT_SETTINGS
    this.models = []
    this.model = DEFAULT_CHAT_MODEL
    this.conversations = []
    this.storage = new Storage(this._settings)
    this.tracker = new Tracker(this.storage)
    this.ollama = new Ollama(this._settings, this.tracker)
  }

  public get chat(): Chat {
    return this.window.chat
  }

  public get sidebar(): Sidebar {
    return this.window.sidebar
  }

  public get settings(): StorageSettings {
    return this._settings
  }

  public get isBusy(): boolean {
    return this.isGeneratingMessage || this.isSummarizing
  }

  public vfunc_command_line(command_line: Gio.ApplicationCommandLine): number {
    const args = command_line.get_arguments()

    this.activate()

    if (args.includes('--new-conversation') && this.sidebar) {
      void this.sidebar.createNewConversation()
    }

    return 0
  }

  public vfunc_activate(): void {
    if (this.window) {
      this.window.present()
      return
    }

    this._setupStyles()
    this._setupIcon()

    this.window = new AppWindow(this, {
      application: this,
      title: 'Gnome AI Chat',
      default_width: 800,
      default_height: 600,
      icon_name: APPLICATION_ID
    })

    this.window.connect('close-request', () => {
      if (this._active && !this._isExiting) {
        void this.handleQuit()
        return true
      }
      return false
    })

    this._setupActions()

    const dropTarget = new Gtk.DropTarget({
      formats: Gdk.ContentFormats.new_for_gtype(Gdk.FileList.$gtype),
      actions: Gdk.DragAction.COPY
    })
    dropTarget.connect('drop', (_target, value) => {
      if (value instanceof Gdk.FileList) {
        const files = value.get_files()
        files.forEach((file) => {
          return this.chat.input.attachments.addFile(file)
        })
        return true
      }
      return false
    })
    this.window.add_controller(dropTarget)

    this.window.present()

    void this.init()
  }

  public getShortcut(action: string): string | null {
    const accels = this.get_accels_for_action(`app.${action}`)
    if (accels && accels.length > 0) {
      const [, keyval, mods] = Gtk.accelerator_parse(accels[0])
      return Gtk.accelerator_get_label(keyval, mods)
    }
    return null
  }

  public async init(): Promise<void> {
    this.window.setState('loading')
    try {
      await this._loadSettings()

      Adw.StyleManager.get_default().set_color_scheme(this._settings.theme)

      if (this.settings.debug) {
        this.window.add_css_class('devel')
      }

      const version = await this.ollama.version()
      if (!version) {
        throw new Error('Could not connect to Ollama')
      }

      await this._loadModels()

      if (this.models.length === 0) {
        this.window.setState('empty')
        return
      }

      await this._loadConversations()

      this._active = true
      this.window.setState('app')
    } catch (err: unknown) {
      console.error(err)
      this.window.showError(err instanceof Error ? err.message : String(err))
    }
  }

  public async handleQuit(): Promise<void> {
    if (this._isExiting) {
      return
    }
    this._isExiting = true

    this.window.hide()
    this.hold()

    try {
      await this.storage.index(this.ollama, this.conversations, false)
    } catch (err) {
      console.error('Failed to index on quit:', err)
    }

    this.storage.saveConversations(this.conversations)
    this.storage.saveSettings(this._settings)

    await this.storage.flush()

    this.sidebar.clearList()

    this.release()
    this.quit()
  }

  public showToast(message: string, error?: boolean): void {
    const toast = new Adw.Toast({ title: pangoEscape(message) })
    if (error) {
      toast.button_label = 'Copy'
      toast.connect('button-clicked', () => {
        const clipboard = Gdk.Display.get_default()!.get_clipboard()
        const errorText = message
        clipboard.set(errorText)
      })
    }
    this.window.toaster.add_toast(toast)
  }

  public focusInput(): void {
    this.chat.input.grabFocus()
  }

  public toggleSidebar(): void {
    this.window.toggleSidebar()
  }

  public saveSettings(): void {
    this.ollama.url = this._settings.url
    this.window.updateCssClass()
    this.storage.saveSettings(this._settings)
  }

  public saveSkills(): void {
    this.storage.saveSkills(this.skills)
  }

  public setModel(model: string): void {
    this.model = model
    const conv = this.conversations.find((c) => {
      return c.id === this.conversation?.id
    })
    if (conv) {
      conv.model = model
    }
    void this._updateCapabilities(model)
  }

  private async _updateCapabilities(model: string): Promise<void> {
    const details = await this.ollama.model(model)
    const capabilities = details?.capabilities || []
    this.supportsVision = capabilities.includes('vision')
    this.emit('capabilities-changed')
  }

  public setTheme(theme: number): void {
    this._settings.theme = theme
    Adw.StyleManager.get_default().set_color_scheme(theme)
    this.storage.saveSettings(this._settings)
    const action = this.lookup_action('theme') as Gio.SimpleAction | null
    if (action) {
      action.set_state(GLib.Variant.new_int32(theme))
    }
  }

  public setSyntax(theme: string): void {
    this._settings.syntax = theme
    this.storage.saveSettings(this._settings)
    this.emit('syntax-changed', theme)
  }

  public toggleDebug(): void {
    this._settings.debug = !this._settings.debug
    if (this._settings.debug) {
      this.window.add_css_class('devel')
    } else {
      this.window.remove_css_class('devel')
    }
    this.storage.saveSettings(this._settings)
    this.showToast(`Debug mode ${this._settings.debug ? 'enabled' : 'disabled'}`)
  }

  public setConversationTitle(conversation: StorageConversation, title: string): void {
    const converted = convertMessageToTitle(title)
    conversation.title = converted
    const conv = this.conversations.find((c) => {
      return c.id === conversation.id
    })
    if (conv) {
      conv.title = converted
      this.sidebar.setConversationTitle(conv, converted)
    }
  }

  public setGeneratingMessage(active: boolean): void {
    this.isGeneratingMessage = active
    this.sidebar.setBusy(this.isBusy)
    this.emit('busy-changed', this.isBusy)
  }

  public setSummarizing(active: boolean): void {
    this.isSummarizing = active
    this.sidebar.setBusy(this.isBusy)
    this.emit('busy-changed', this.isBusy)
  }

  public async setConversation(id: number): Promise<void> {
    const conv = this.conversations.find((c) => {
      return c.id === id
    })
    if (!conv) {
      return
    }
    const messages = await this.storage.getMessages(conv.id)
    const conversation = { ...conv, messages }
    this.conversation = conversation
    this.model = conversation.model
    this.chat.loadMessages(conversation)
  }

  public async clearAllConversations(): Promise<void> {
    this.storage.saveConversations([])
    this.conversations = []
    this.sidebar.clearList()
    await this.sidebar.createNewConversation()
  }

  public sendNotification(id: string | null, notification: Gio.Notification): void {
    this.send_notification(id, notification)
  }

  public activateAction(action_name: string, parameter: GLib.Variant | null): void {
    this.activate_action(action_name, parameter)
  }

  private _setupStyles(): void {
    const styleProvider = new Gtk.CssProvider()
    styleProvider.load_from_data(css, -1)
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default()!, styleProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
  }

  private _setupIcon(): void {
    try {
      const [filename] = GLib.filename_from_uri(import.meta.url)
      const distDir = GLib.path_get_dirname(filename)
      const rootDir = GLib.path_get_dirname(distDir)

      const resourcePath = GLib.build_filenamev([rootDir, 'resources.gresource'])
      if (GLib.file_test(resourcePath, GLib.FileTest.EXISTS)) {
        const resource = Gio.Resource.load(resourcePath)
        Gio.resources_register(resource)
      }

      const display = Gdk.Display.get_default()
      if (display) {
        const iconTheme = Gtk.IconTheme.get_for_display(display)
        iconTheme.add_resource_path('resource:///io/github/pebois/gnome-ai-chat/icons')

        const iconsDir = GLib.build_filenamev([rootDir, 'icons'])
        if (GLib.file_test(iconsDir, GLib.FileTest.IS_DIR)) {
          iconTheme.add_search_path(iconsDir)
        }
      }
    } catch (e) {
      console.error('Failed to load application icon resources:', e)
    }
  }

  private _setupActions(): void {
    const clearAction = createSimpleAction('clear', () => {
      this.chat.clearAllMessages()
    })
    this.add_action(clearAction)

    const toggleSidebarAction = createSimpleAction('toggle-sidebar', () => {
      this.window.toggleSidebar()
    })
    this.add_action(toggleSidebarAction)
    this.set_accels_for_action('app.toggle-sidebar', ['<Primary>b'])

    const newChatAction = createSimpleAction('new-conversation', () => {
      return this.sidebar.createNewConversation()
    })
    this.add_action(newChatAction)
    this.set_accels_for_action('app.new-conversation', ['<Primary>n'])

    const searchAction = createSimpleAction('search', () => {
      this.window.showSidebar()
      this.sidebar.searchButton.active = true
      this.sidebar.searchEntry.grab_focus()
    })
    this.add_action(searchAction)
    this.set_accels_for_action('app.search', ['<Primary>f'])

    const settingsAction = createSimpleAction('settings', () => {
      return showPreferencesWindow(this)
    })
    this.add_action(settingsAction)
    this.set_accels_for_action('app.settings', ['<Primary>comma'])

    const shortcutsAction = createSimpleAction('shortcuts', () => {
      return showShortcutsDialog(this)
    })
    this.add_action(shortcutsAction)
    this.set_accels_for_action('app.shortcuts', ['<Primary>question'])

    const debugAction = createSimpleAction('debug', () => {
      return this.toggleDebug()
    })
    this.add_action(debugAction)

    const psAction = createSimpleAction('ps', () => {
      return showRunningModelsDialog(this)
    })
    this.add_action(psAction)
    this.set_accels_for_action('app.ps', ['<Primary>p'])

    const pullAction = createSimpleAction('pull', () => {
      return showPullDialog(this)
    })
    this.add_action(pullAction)
    this.set_accels_for_action('app.pull', ['<Primary>j'])

    const statsAction = createSimpleAction('stats', () => {
      return showStatsDialog(this)
    })
    this.add_action(statsAction)
    this.set_accels_for_action('app.stats', ['<Primary>i'])

    const skillsAction = createSimpleAction('skills', () => {
      return showSkillsWindow(this)
    })
    this.add_action(skillsAction)
    this.set_accels_for_action('app.skills', ['<Primary>e'])

    const themeAction = new Gio.SimpleAction({
      name: 'theme',
      parameter_type: GLib.VariantType.new('i'),
      state: GLib.Variant.new_int32(this._settings.theme)
    })
    themeAction.connect('activate', (_action, parameter) => {
      if (parameter) {
        const theme = parameter.get_int32()
        this.setTheme(theme)
        themeAction.set_state(parameter)
      }
    })
    this.add_action(themeAction)

    const aboutAction = createSimpleAction('about', () => {
      return showAboutWindow(this)
    })
    this.add_action(aboutAction)

    const quitAction = createSimpleAction('quit', () => {
      return this.handleQuit()
    })
    this.add_action(quitAction)
    this.set_accels_for_action('app.quit', ['<Primary>q'])

    const focusInputAction = createSimpleAction('focus-input', () => {
      return this.chat.input.grabFocus()
    })
    this.add_action(focusInputAction)
    this.set_accels_for_action('app.focus-input', ['<Primary>l'])

    const hnAction = createSimpleAction('hn', () => {
      this.chat.input.getBuffer().set_text('http get https://hnrss.org/best list headlines', -1)
      void this.chat.sendMessage()
    })
    this.add_action(hnAction)

    const memoryAction = new Gio.SimpleAction({
      name: 'memory',
      parameter_type: GLib.VariantType.new('s')
    })
    memoryAction.connect('activate', (_action, parameter) => {
      const variant = parameter as GLib.Variant
      const text = variant.get_string()[0]
      const parts = text.split(' ')

      if (parts.length < 2) {
        this.showToast('Usage: /memory [summarize|clean|optimize]')
        return
      }

      const subCommand = parts[1].toLowerCase()
      let prompt: string
      switch (subCommand) {
        case 'summarize':
          prompt = 'Use your memory tools to read the knowledge graph and provide a concise summary of what you know about me and our past interactions.'
          break
        case 'clean':
          prompt = 'Use your memory tools to review the knowledge graph and identify any duplicate, contradictory, or outdated information. Suggest what should be deleted or corrected.'
          break
        case 'optimize':
          prompt = 'Use your memory tools to optimize the knowledge graph. Look for opportunities to merge similar entities, refine relationship types to be more descriptive, and ensure observations are atomic and well-structured.'
          break
        default:
          this.showToast(`Unknown memory command: ${subCommand}`)
          return
      }

      const buffer = this.chat.input.getBuffer()
      buffer.set_text(prompt, -1)
      void this.chat.sendMessage()
    })
    this.add_action(memoryAction)

    const compressAction = createSimpleAction('compress', () => {
      if (!this.conversation) {
        return
      }

      const compressedMessages = this.conversation.messages
        .filter((msg) => {
          return msg.role !== 'tool'
        })
        .map((msg) => {
          if (msg.role === 'assistant') {
            const { thinking: _, tool_calls: __, ...rest } = msg
            return rest
          }
          return msg
        })

      this.conversation.messages = compressedMessages
      this.storage.saveMessages(this.conversation.id, compressedMessages)
      this.conversation.updated_at = new Date().toISOString()
      const conv = this.conversations.find((c) => {
        return c.id === this.conversation?.id
      })
      if (conv) {
        conv.updated_at = this.conversation.updated_at
        this.sidebar.updateConversation(conv)
      }
      this.storage.saveConversations(this.conversations)
      this.chat.loadMessages(this.conversation)
      this.showToast('Conversation compressed')
    })
    this.add_action(compressAction)
  }

  private async _loadSettings(): Promise<void> {
    await this.storage.loadSettings()
    this.skills = await this.storage.getSkills()
    this.ollama.url = this._settings.url
  }

  private async _loadModels(): Promise<void> {
    this.models = await this.ollama.models()

    const toolModels: string[] = []
    for (const m of this.models) {
      const details = await this.ollama.model(m)
      if (details?.capabilities?.includes('tools')) {
        toolModels.push(m)
      }
    }
    this.toolModels = toolModels

    this.chat.loadModels()
  }

  private async _loadConversations(): Promise<void> {
    this.conversations = await this.storage.getConversations()
    this.sidebar.populateList()
    if (this.conversations.length > 0) {
      await this.sidebar.selectFirst()
    } else {
      await this.sidebar.createNewConversation()
    }
  }
}

GObject.registerClass({
  GTypeName: 'GnomeAIChat',
  Signals: {
    'busy-changed': {
      param_types: [GObject.TYPE_BOOLEAN]
    },
    'capabilities-changed': {
      param_types: []
    },
    'syntax-changed': {
      param_types: [GObject.TYPE_STRING]
    }
  }
}, App)
