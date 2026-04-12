import Adw from 'gi://Adw?version=1'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

import { css } from '@/app/global.css.js'
import type { ChatConversation } from '@/app/ui/history.js'
import { ArtifactWindow } from '@/app/window/artifact.js'
import { Chat } from '@/app/window/main/chat.js'
import { AppWindow } from '@/app/window/main/index.js'
import { Sidebar } from '@/app/window/main/sidebar.js'
import type { AppInterface } from '@/lib/app.js'
import { COMMANDS } from '@/lib/commands/index.js'
import { APPLICATION_ID, DEFAULT_CHAT_MODEL } from '@/lib/constants.js'
import { conversationsStore } from '@/lib/db/conversations.js'
import { filesStore } from '@/lib/db/files.js'
import { db } from '@/lib/db/index.js'
import { settingsStore } from '@/lib/db/settings.js'
import { skillsStore } from '@/lib/db/skills.js'
import type { Conversation, Settings, Skill } from '@/lib/db/types.js'
import { pangoEscape } from '@/lib/parser.js'
import { OllamaProvider } from '@/lib/providers/ollama.js'
import { Tracker } from '@/lib/tracker.js'
import { createSimpleAction } from '@/lib/ui.js'
import { convertMessageToTitle } from '@/lib/utils.js'

export class App extends Adw.Application implements AppInterface {
  private _active: boolean
  private _isExiting: boolean = false
  private _settingsLoaded: boolean = false
  public isLoaded: boolean = false
  private _pendingNewConversation: boolean = false
  private _filesIndexingCancellable: Gio.Cancellable | null = null
  private _generatingConversations: Set<number> = new Set()
  private _summarizingConversations: Set<number> = new Set()

  public conversation?: ChatConversation
  public conversations: Conversation[]
  public model: string
  public models: string[]
  public provider!: OllamaProvider
  public skills: Skill[] = []
  public supportsVision = true
  public toolModels: string[] = []
  public tracker: Tracker
  public window!: AppWindow
  public activeArtifacts: Map<string, ArtifactWindow> = new Map()

  constructor(application_id: string) {
    super({
      application_id: application_id,
      flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE
    })
    this._active = false
    this.models = []
    this.model = DEFAULT_CHAT_MODEL
    this.conversations = []
    this.tracker = new Tracker()
    this.provider = new OllamaProvider(this.settings, this.tracker)
  }

  public get chat(): Chat {
    return this.window.chat
  }

  public get sidebar(): Sidebar {
    return this.window.sidebar
  }

  public get settings(): Settings {
    return settingsStore.settings
  }

  public get isBusy(): boolean {
    if (!this.conversation) {
      return false
    }
    return this.isGeneratingMessage(this.conversation.id) || this.isSummarizing(this.conversation.id)
  }

  public isGeneratingMessage(id: number): boolean {
    return this._generatingConversations.has(id)
  }

  public isSummarizing(id: number): boolean {
    return this._summarizingConversations.has(id)
  }

  public vfunc_command_line(command_line: Gio.ApplicationCommandLine): number {
    const args = command_line.get_arguments()

    this.activate()

    if (args.includes('--new-conversation')) {
      if (this.isLoaded && this.sidebar) {
        void this.sidebar.createNewConversation()
      } else {
        this._pendingNewConversation = true
      }
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
      await db.initDb()
      await this._loadSettings()

      Adw.StyleManager.get_default().set_color_scheme(this.settings.theme)

      if (this.settings.debug) {
        this.window.add_css_class('devel')
      }

      const version = await this.provider.version()
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

    if (this.isLoaded) {
      await conversationsStore.saveConversations(this.conversations)
      await conversationsStore.indexConversations(this.provider, this.conversations, false)
    }

    if (this._settingsLoaded) {
      await settingsStore.saveSettings(this.settings)
      await skillsStore.saveSkills(this.skills)
      await skillsStore.indexSkills(this.provider, this.skills, false)
    }

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
    this.provider.url = this.settings.url
    this.window.updateCssClass()
    void settingsStore.saveSettings(this.settings)
  }

  public saveSkills(): void {
    void skillsStore.saveSkills(this.skills).then(() => {
      return skillsStore.indexSkills(this.provider, this.skills, false)
    }).catch((err) => {
      console.error('Failed to save/index skills:', err)
    })
  }

  public saveConversations(): void {
    if (!this.isLoaded) {
      return
    }
    void conversationsStore.saveConversations(this.conversations).then(() => {
      return conversationsStore.indexConversations(this.provider, this.conversations, false)
    }).catch((err) => {
      console.error('Failed to save/index conversations:', err)
    })
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
    const details = await this.provider.model(model)
    const capabilities = details?.capabilities || []
    this.supportsVision = capabilities.includes('vision')
    this.emit('capabilities-changed')
  }

  public setTheme(theme: number): void {
    this.settings.theme = theme
    Adw.StyleManager.get_default().set_color_scheme(theme)
    void settingsStore.saveSettings(this.settings)
    const action = this.lookup_action('theme') as Gio.SimpleAction | null
    if (action) {
      action.set_state(GLib.Variant.new_int32(theme))
    }
  }

  public setSyntax(theme: string): void {
    this.settings.syntax = theme
    void settingsStore.saveSettings(this.settings)
    this.emit('syntax-changed', theme)
  }

  public toggleDebug(): void {
    this.settings.debug = !this.settings.debug
    if (this.settings.debug) {
      this.window.add_css_class('devel')
    } else {
      this.window.remove_css_class('devel')
    }
    void settingsStore.saveSettings(this.settings)
  }

  public setConversationTitle(conversation: Conversation, title: string): void {
    const converted = convertMessageToTitle(title)
    conversation.title = converted
    conversation.embeddings = undefined
    const conv = this.conversations.find((c) => {
      return c.id === conversation.id
    })
    if (conv) {
      conv.title = converted
      conv.embeddings = undefined
      this.sidebar.setConversationTitle(conv, converted)
    }
  }

  public setGeneratingMessage(id: number, active: boolean): void {
    if (active) {
      this._generatingConversations.add(id)
    } else {
      this._generatingConversations.delete(id)
    }
    if (this.conversation?.id === id) {
      this.emit('busy-changed', this.isBusy)
    }
  }

  public setSummarizing(id: number, active: boolean): void {
    if (active) {
      this._summarizingConversations.add(id)
    } else {
      this._summarizingConversations.delete(id)
    }
    if (this.conversation?.id === id) {
      this.emit('busy-changed', this.isBusy)
    }
  }

  public async setConversation(id: number): Promise<void> {
    const conv = this.conversations.find((c) => {
      return c.id === id
    })
    if (!conv) {
      return
    }
    const messages = await conversationsStore.getMessages(conv.id)
    const conversation = { ...conv, messages }
    this.conversation = conversation
    this.model = conversation.model
    this.chat.loadMessages(conversation)
  }

  public async clearAllConversations(): Promise<void> {
    this.chat.stopAllGenerations()
    await conversationsStore.saveConversations([])
    this.conversations = []
    this.sidebar.clearList()
    await this.sidebar.createNewConversation()
  }

  public cancelFilesIndexing(): void {
    if (this._filesIndexingCancellable) {
      this._filesIndexingCancellable.cancel()
    }
  }

  public async indexFiles(): Promise<void> {
    if (this._filesIndexingCancellable) {
      return
    }

    this._filesIndexingCancellable = new Gio.Cancellable()
    this.emit('files-indexing-changed', true, 0)

    try {
      const paths = await filesStore.getPaths()
      await filesStore.indexPaths(this.provider, paths, this._filesIndexingCancellable, (fraction) => {
        this.emit('files-indexing-changed', true, fraction)
      })
    } catch (err) {
      if (!(err instanceof GLib.Error && err.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))) {
        console.error('Failed to index files:', err)
        this.showToast('Files indexing failed', true)
      }
    } finally {
      this._filesIndexingCancellable = null
      this.emit('files-indexing-changed', false, 0)
    }
  }

  public sendNotification(id: string | null, notification: Gio.Notification): void {
    this.send_notification(id, notification)
  }

  public activateAction(action_name: string, parameter?: GLib.Variant): void {
    this.activate_action(action_name, parameter || null)
  }

  private _setupStyles(): void {
    const styleProvider = new Gtk.CssProvider()
    styleProvider.load_from_data(css, -1)
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default()!, styleProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
  }

  private _setupIcon(): void {
    try {
      const [filename] = GLib.filename_from_uri(import.meta.url as string)
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
        iconTheme.add_resource_path('/io/github/pebois/gnome-ai-chat/icons')

        const iconsDir = GLib.build_filenamev([GLib.path_get_dirname(rootDir), 'icons'])
        if (GLib.file_test(iconsDir, GLib.FileTest.IS_DIR)) {
          iconTheme.add_search_path(iconsDir)
        }
      }
    } catch (e) {
      console.error('Failed to load application icon resources:', e)
    }
  }

  public requestToolPermission(heading: string, body: string): Promise<boolean> {
    return new Promise((resolve) => {
      const activeWindow = this.active_window
      if (!activeWindow) {
        resolve(false)
        return
      }

      const alertDialog = new Adw.AlertDialog({
        heading,
        body
      })

      alertDialog.add_response('cancel', 'Deny')
      alertDialog.add_response('confirm', 'Allow')
      alertDialog.set_response_appearance('confirm', Adw.ResponseAppearance.DESTRUCTIVE)

      alertDialog.connect('response', (_, response) => {
        resolve(response === 'confirm')
      })

      alertDialog.present(activeWindow)
    })
  }

  private _setupActions(): void {
    COMMANDS.forEach((cmd) => {
      const state = cmd.getInitialState?.(this)
      const action = createSimpleAction(
        cmd.name,
        (_action, parameter) => {
          return cmd.activate(this, parameter ?? undefined)
        },
        cmd.parameterType,
        state
      )
      this.add_action(action)

      if (cmd.accels) {
        let actionName = `app.${cmd.name}`
        if (cmd.parameterType) {
          const target = cmd.name === 'files' ? 'manage' : ''
          actionName += `('${target}')`
        }
        this.set_accels_for_action(actionName, cmd.accels)
      }
    })
  }

  private async _loadSettings(): Promise<void> {
    await settingsStore.loadSettings()
    this.skills = await skillsStore.getSkills()
    this.provider.url = this.settings.url
    this._settingsLoaded = true
  }

  private async _loadModels(): Promise<void> {
    this.models = await this.provider.models()

    const toolModels: string[] = []
    for (const m of this.models) {
      const details = await this.provider.model(m)
      if (details?.capabilities?.includes('tools')) {
        toolModels.push(m)
      }
    }
    this.toolModels = toolModels

    this.chat.loadModels()
  }

  private async _loadConversations(): Promise<void> {
    this.conversations = await conversationsStore.getConversations()
    this.isLoaded = true
    this.sidebar.populateList()
    if (this._pendingNewConversation || this.conversations.length === 0) {
      this._pendingNewConversation = false
      await this.sidebar.createNewConversation()
    } else {
      await this.sidebar.selectFirst()
    }
  }
}

GObject.registerClass({
  GTypeName: 'GnomeAIChat',
  Signals: {
    'busy-changed': {
      param_types: [GObject.TYPE_BOOLEAN]
    },
    'files-indexing-changed': {
      param_types: [GObject.TYPE_BOOLEAN, GObject.TYPE_DOUBLE]
    },
    'capabilities-changed': {
      param_types: []
    },
    'syntax-changed': {
      param_types: [GObject.TYPE_STRING]
    }
  }
}, App)
