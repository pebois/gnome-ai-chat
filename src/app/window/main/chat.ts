import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

import { showPullDialog } from '@/app/dialog/pull.js'
import { EmptyPage } from '@/app/page/empty.js'
import type { ChatConversation } from '@/app/ui/history.js'
import { History } from '@/app/ui/history.js'
import { Input } from '@/app/ui/input.js'
import { Message } from '@/app/ui/message/index.js'
import { ChatService } from '@/lib/agent/chat.js'
import type { AppInterface } from '@/lib/app.js'
import { conversationsStore } from '@/lib/db/conversations.js'
import type { ChatMessage } from '@/lib/providers/index.js'
import { debounce } from '@/lib/timeout.js'
import { createMenuItem, ResizeTracker } from '@/lib/ui.js'

export class Chat {
  private _app: AppInterface
  private _box: Gtk.Box
  private _splitView: Adw.OverlaySplitView
  private _contentHeader!: Adw.HeaderBar
  private _contentStack!: Adw.ViewStack
  private _statusPage!: EmptyPage
  private _history!: History
  private _input!: Input
  private _inputClamp!: Adw.Clamp
  private _scrollButton!: Gtk.Button
  private _shouldShowScrollButton = false
  private _chatService: ChatService
  private _isInputCentered: boolean = false
  private _centerAnim?: Adw.TimedAnimation
  private _updateBanner!: Adw.Banner

  private _showScrollButton = debounce(() => {
    if (this._shouldShowScrollButton) {
      this._scrollButton.visible = true
    }
  }, 100)

  public get input(): Input {
    return this._input
  }

  public get history(): History {
    return this._history
  }

  public get header(): Adw.HeaderBar {
    return this._contentHeader
  }

  constructor(app: AppInterface, box: Gtk.Box, splitView: Adw.OverlaySplitView) {
    this._app = app
    this._box = box
    this._splitView = splitView
    this._chatService = new ChatService(this._app)

    this._setup()
  }

  private _setup(): void {
    this._contentHeader = new Adw.HeaderBar()
    this._contentHeader.add_css_class('flat')

    const toggleSidebarBtn = new Gtk.ToggleButton({
      icon_name: 'sidebar-show-symbolic',
      tooltip_text: 'Toggle Sidebar (ctrl+b)',
      active: true
    })
    toggleSidebarBtn.connect('toggled', () => {
      this._splitView.show_sidebar = toggleSidebarBtn.active
    })
    this._splitView.connect('notify::show-sidebar', () => {
      toggleSidebarBtn.active = this._splitView.show_sidebar
    })
    this._contentHeader.pack_start(toggleSidebarBtn)

    const menu = new Gio.Menu()

    const themeMenu = new Gio.Menu()
    themeMenu.append_item(createMenuItem('System', 'app.theme', 'preferences-desktop-theme-symbolic', GLib.Variant.new_int32(0)))
    themeMenu.append_item(createMenuItem('Light', 'app.theme', 'weather-clear-symbolic', GLib.Variant.new_int32(1)))
    themeMenu.append_item(createMenuItem('Dark', 'app.theme', 'weather-clear-night-symbolic', GLib.Variant.new_int32(2)))

    menu.append_submenu('Style', themeMenu)

    menu.append_item(createMenuItem('Settings', 'app.settings', 'preferences-system-symbolic'))
    menu.append_item(createMenuItem('Skills', 'app.skills', 'avatar-default-symbolic'))
    menu.append_item(createMenuItem('Indexed Folders', 'app.files', 'folder-symbolic', GLib.Variant.new_string('manage')))
    menu.append_item(createMenuItem('Keyboard Shortcuts', 'app.shortcuts', 'preferences-desktop-keyboard-shortcuts-symbolic'))
    menu.append_item(createMenuItem('Running Models', 'app.ps', 'processor-symbolic'))
    menu.append_item(createMenuItem('Pull Model', 'app.pull', 'folder-download-symbolic'))
    menu.append_item(createMenuItem('Performance Stats', 'app.stats', 'resources-symbolic'))
    menu.append_item(createMenuItem('About', 'app.about', 'help-about-symbolic'))
    menu.append_item(createMenuItem('Quit', 'app.quit', 'application-exit-symbolic'))

    const menuBtn = new Gtk.MenuButton({
      icon_name: 'open-menu-symbolic',
      menu_model: menu,
      tooltip_text: 'Main Menu'
    })
    this._contentHeader.pack_end(menuBtn)
    this._box.append(this._contentHeader)

    const chatBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL
    })

    this._updateBanner = new Adw.Banner({
      title: 'Model update available',
      button_label: 'Update',
      revealed: false
    })
    this._updateBanner.connect('button-clicked', () => {
      showPullDialog(this._app, this._app.model)
    })
    chatBox.append(this._updateBanner)

    this._app.connect('capabilities-changed', () => {
      void this._checkUpdate()
    })

    this._history = new History(this._app, {
      onScroll: () => {
        this._contentHeader.remove_css_class('flat')
        this.toggleScrollButton(true)
      },
      onReachTop: () => {
        this._contentHeader.add_css_class('flat')
      },
      onReachBottom: () => {
        this.toggleScrollButton(false)
      }
    })

    this._statusPage = new EmptyPage(this._app, {
      icon_name: 'chat-message-new-symbolic',
      css_classes: ['status-page', 'dim-label'],
      vexpand: true
    })

    this._contentStack = new Adw.ViewStack()
    this._contentStack.enable_transitions = true
    this._contentStack.add_named(this._statusPage.widget, 'status')
    this._contentStack.add_named(this._history.widget, 'chat')

    const contentStackOverlay = new Gtk.Overlay()
    contentStackOverlay.set_child(this._contentStack)

    const tracker = new ResizeTracker()
    tracker.can_target = false
    tracker.onSizeAllocate = () => {
      if (this._isInputCentered && !this._centerAnim) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._centerInput(true, false)
          return GLib.SOURCE_REMOVE
        })
      }
    }
    contentStackOverlay.add_overlay(tracker)

    chatBox.append(contentStackOverlay)

    this._input = new Input(this._app)

    this._inputClamp = new Adw.Clamp({
      maximum_size: 1024,
      child: this._input.widget,
      margin_start: 12,
      margin_end: 12,
      hexpand: true,
      valign: Gtk.Align.END
    })

    const sizeGroup = new Gtk.SizeGroup({
      mode: Gtk.SizeGroupMode.VERTICAL
    })
    sizeGroup.add_widget(this._input.widget)
    sizeGroup.add_widget(this._history.spacer)

    const scrollBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.END
    })
    const scrollSpacer = new Gtk.Box({
      can_target: false,
      width_request: 1
    })
    this._scrollButton = new Gtk.Button({
      icon_name: 'go-down-symbolic',
      css_classes: ['circular', 'osd', 'scroll-button'],
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER,
      margin_bottom: 6,
      visible: false
    })
    this._scrollButton.connect('clicked', () => {
      this._history.scrollToBottom(true)
    })
    scrollBox.append(this._scrollButton)
    scrollBox.append(scrollSpacer)
    sizeGroup.add_widget(scrollSpacer)

    contentStackOverlay.add_overlay(this._inputClamp)
    contentStackOverlay.add_overlay(scrollBox)
    this._box.append(chatBox)
  }

  private async _checkUpdate(): Promise<void> {
    const currentModel = this._app.model
    if (!currentModel) {
      return
    }
    try {
      const hasUpdate = await this._app.provider.checkUpdate(currentModel)
      if (this._app.model === currentModel) {
        this._updateBanner.revealed = hasUpdate
      }
    } catch (err) {
      console.error('Failed to check for update:', err)
    }
  }

  public loadModels(): void {
    this._input.loadModels()
  }

  public addResponsiveBreakpoints(breakpoint: Adw.Breakpoint): void {
    this._input.addResponsiveBreakpoints(breakpoint)

    const unclampSize = new GObject.Value()
    unclampSize.init(GObject.TYPE_INT)
    unclampSize.set_int(10000)

    breakpoint.add_setter(this._inputClamp, 'maximum-size', unclampSize)
  }

  public toggleScrollButton(visible: boolean): void {
    this._shouldShowScrollButton = visible

    if (visible) {
      if (this._scrollButton.visible) {
        return
      }
      this._showScrollButton()
    } else {
      this._scrollButton.visible = false
    }
  }

  public scrollToBottom(smooth = true): void {
    this._history.scrollToBottom(smooth)
  }

  public loadMessages(conversation: ChatConversation): void {
    if (conversation.model) {
      this._input.selectModel(conversation.model)
    }

    if (conversation.messages.length === 0) {
      this._contentStack.set_visible_child_name('status')
      this._history.clear()
      this._centerInput(true)
      this._input.getBuffer().set_text('', -1)
    } else {
      this._contentStack.set_visible_child_name('chat')
      this._history.loadMessages(conversation)
      this._centerInput(false)
    }

    const isGenerating = this._app.isGeneratingMessage(conversation.id)
    this._input.setSensitive(!isGenerating)
    this._input.setSendMode(isGenerating ? 'stop' : 'send')
    this._input.grabFocus()
  }

  public async regenerateFromMessage(message: ChatMessage): Promise<void> {
    const conversation = this._app.conversation
    if (!conversation || this._chatService.isGenerating(conversation.id)) {
      return
    }

    const index = conversation.messages.indexOf(message)
    if (index === -1) {
      return
    }

    conversation.messages = conversation.messages.slice(0, index + 1)
    await conversationsStore.saveMessages(conversation.id, conversation.messages)
    conversation.updated_at = new Date().toISOString()
    conversation.embeddings = undefined
    const conv = this._app.conversations.find((c) => {
      return c.id === conversation.id
    })
    if (conv) {
      conv.updated_at = conversation.updated_at
      conv.embeddings = undefined
      this._app.sidebar.updateConversation(conv)
    }
    this._app.saveConversations()
    this.loadMessages(conversation)

    this._input.setSensitive(false)
    this._input.setSendMode('stop')

    let currentMessageComponent: Message | undefined
    await this._chatService.generateResponse(conversation.id, conversation.messages.length === 1, {
      onNewResponse: () => {
        if (this._app.conversation?.id !== conversation.id) {
          return
        }
        currentMessageComponent = this._renderMessage({ role: 'assistant', content: '•••' })
        this._history.scrollToBottom()
      },
      onMessageChunk: (chunk) => {
        if (this._app.conversation?.id === conversation.id) {
          const shouldScroll = this._history.stickToBottom
          currentMessageComponent?.update(chunk)
          if (shouldScroll) {
            this._history.scrollToBottom()
          }
        }
      },
      onError: (error) => {
        this._app.showToast(error, true)
      },
      onFinish: () => {
        if (this._app.conversation?.id === conversation.id) {
          this._input.setSensitive(true)
          this._input.grabFocus()
          this._input.setSendMode('send')
          this._history.scrollToBottom()
        }
      }
    })
  }

  public stopGeneration(id: number): void {
    this._chatService.stopGeneration(id)
  }

  public stopAllGenerations(): void {
    this._chatService.stopAllGenerations()
  }

  public async sendMessage(): Promise<void> {
    const buffer = this._input.getBuffer()
    const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false).trim()
    const conversation = this._app.conversation

    if (!conversation) {
      return
    }

    if (this._chatService.isGenerating(conversation.id)) {
      this.stopGeneration(conversation.id)
      return
    }

    if (!text) {
      this._input.grabFocus()
      return
    }

    const isFirstMessage = conversation.messages.length === 0

    if (isFirstMessage) {
      conversation.model = this._app.model
      conversation.created_at = new Date().toISOString()
      this._app.setConversationTitle(conversation, text)
      this._centerInput(false)
    }

    buffer.set_text('', -1)
    this._input.setSensitive(false)
    this._input.setSendMode('stop')

    const userMessage: ChatMessage = { role: 'user', content: text }
    if (this._input.attachments.hasAttachments) {
      const textFiles = this._input.attachments.textFiles
      if (textFiles.length > 0) {
        userMessage.files = textFiles
      }
      const imgs = this._input.attachments.images
      if (imgs.length > 0) {
        userMessage.images = imgs
      }
      this._input.attachments.clear()
    }
    this._renderMessage(userMessage)

    conversation.messages.push(userMessage)

    await conversationsStore.saveMessages(conversation.id, conversation.messages)
    conversation.updated_at = new Date().toISOString()
    conversation.embeddings = undefined
    const conv = this._app.conversations.find((c) => {
      return c.id === conversation.id
    })
    if (conv) {
      conv.updated_at = conversation.updated_at
      conv.embeddings = undefined
      this._app.sidebar.updateConversation(conv)
    }
    this._app.saveConversations()

    this._history.scrollToBottom()

    let currentMessageComponent: Message | undefined
    await this._chatService.generateResponse(conversation.id, isFirstMessage, {
      onNewResponse: () => {
        if (this._app.conversation?.id !== conversation.id) {
          return
        }
        currentMessageComponent = this._renderMessage({ role: 'assistant', content: '•••' })
        this._history.scrollToBottom()
      },
      onMessageChunk: (chunk) => {
        if (this._app.conversation?.id === conversation.id) {
          const shouldScroll = this._history.stickToBottom
          currentMessageComponent?.update(chunk)
          if (shouldScroll) {
            this._history.scrollToBottom()
          }
        }
      },
      onError: (error) => {
        this._app.showToast(error, true)
      },
      onFinish: () => {
        if (this._app.conversation?.id === conversation.id) {
          this._input.setSensitive(true)
          this._input.grabFocus()
          this._input.setSendMode('send')
          this._history.scrollToBottom()
        }
      }
    })
  }

  public clearAllMessages(): void {
    if (this._app.conversation) {
      this.stopGeneration(this._app.conversation.id)
      this._app.conversation.messages = []
      void conversationsStore.saveMessages(this._app.conversation.id, []).catch((err) => {
        console.error('Failed to clear messages:', err)
      })
      this.loadMessages(this._app.conversation)
    }
  }

  public async startFromMessage(message: ChatMessage): Promise<void> {
    const conversation = this._app.conversation
    if (!conversation || this._chatService.isGenerating(conversation.id)) {
      return
    }
    const index = conversation.messages.indexOf(message)
    if (index === -1) {
      return
    }
    const text = message.content
    conversation.messages = conversation.messages.slice(0, index)
    await conversationsStore.saveMessages(conversation.id, conversation.messages)
    conversation.updated_at = new Date().toISOString()
    conversation.embeddings = undefined
    const conv = this._app.conversations.find((c) => {
      return c.id === conversation.id
    })
    if (conv) {
      conv.updated_at = conversation.updated_at
      conv.embeddings = undefined
      this._app.sidebar.updateConversation(conv)
    }
    this._app.saveConversations()
    this.loadMessages(conversation)
    this._input.getBuffer().set_text(text, -1)
  }

  private _renderMessage(message: ChatMessage): Message | undefined {
    if (message.role === 'tool') {
      return undefined
    }

    this._contentStack.set_visible_child_name('chat')
    return this._history.renderMessage(message)
  }

  private _centerInput(centered: boolean, animated = true): void {
    this._isInputCentered = centered

    if (this._centerAnim) {
      this._centerAnim.skip()
      this._centerAnim = undefined
    }

    const H = this._splitView.get_allocated_height() || 600
    const h = this._inputClamp.get_allocated_height() || 136

    const centerMargin = Math.max(0, H / 2 - h - 48)

    const targetMargin = centered ? centerMargin : 0
    const startMargin = this._inputClamp.margin_bottom
    const targetWidth = centered ? 800 : 1024
    const startWidth = this._inputClamp.maximum_size

    if (animated && (startMargin !== targetMargin || startWidth !== targetWidth)) {
      const target = Adw.CallbackAnimationTarget.new((value) => {
        this._inputClamp.margin_bottom = startMargin + (targetMargin - startMargin) * value
        this._inputClamp.maximum_size = startWidth + (targetWidth - startWidth) * value
      })

      const anim = Adw.TimedAnimation.new(this._inputClamp, 0, 1, 500, target)
      anim.easing = Adw.Easing.EASE_IN_OUT_CUBIC
      anim.connect('done', () => {
        this._centerAnim = undefined
        if (this._isInputCentered) {
          this._centerInput(true, false)
        }
      })
      anim.play()

      this._centerAnim = anim
    } else {
      this._inputClamp.margin_bottom = targetMargin
      this._inputClamp.maximum_size = targetWidth
    }
  }
}
