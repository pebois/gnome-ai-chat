import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import { summarizeConversation } from '@/lib/agent/summarize.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import { conversationsStore } from '@/lib/db/conversations.js'
import type { Conversation } from '@/lib/db/types.js'
import { debounce } from '@/lib/timeout.js'
import { createMenuItem, createSimpleAction, setupContextMenu } from '@/lib/ui.js'
import { convertSummaryToTitle, cosineSimilarity, getDateGroup } from '@/lib/utils.js'

type ConversationRow = Gtk.ListBoxRow & {
  conversation?: Conversation
  isHeader?: boolean
  group?: string
  label: Gtk.Label
  popover?: Gtk.PopoverMenu
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']

export class Sidebar {
  private _app: AppInterface
  private _box!: Gtk.Box
  private _searchButton!: Gtk.ToggleButton
  private _searchEntry!: Gtk.SearchEntry
  private _conversationList!: Gtk.ListBox
  private _searchEmbedding: number[] | null = null
  private _searchSimilarities: Map<number, number> = new Map()
  private _visibleGroups: Set<string> = new Set()

  private _performSearch = debounce(async () => {
    const searchTerm = this._searchEntry.get_text().toLowerCase().trim()
    if (!searchTerm) {
      this._searchEmbedding = null
      this._searchSimilarities.clear()
      this._visibleGroups.clear()
      this._conversationList.invalidate_filter()
      return
    }
    try {
      const response = await this._app.ollama.embed({
        model: DEFAULT_EMBEDDING_MODEL,
        input: searchTerm
      })
      if (response && response.embeddings && response.embeddings.length > 0) {
        this._searchEmbedding = response.embeddings[0]
        this._searchSimilarities.clear()
        const conversations = this._app.conversations
        for (const conv of conversations) {
          if (conv.embeddings) {
            const similarity = cosineSimilarity(this._searchEmbedding, conv.embeddings)
            this._searchSimilarities.set(conv.id, similarity)
          } else {
            this._searchSimilarities.set(conv.id, 0)
          }
        }
        this._updateVisibleGroups()
        this._conversationList.invalidate_filter()
      }
    } catch (err) {
      console.error('Failed to perform semantic search:', err)
      this._searchEmbedding = null
      this._searchSimilarities.clear()
      this._updateVisibleGroups()
      this._conversationList.invalidate_filter()
    }
  }, 100)

  public get searchButton(): Gtk.ToggleButton {
    return this._searchButton
  }

  public get searchEntry(): Gtk.SearchEntry {
    return this._searchEntry
  }

  constructor(app: AppInterface) {
    this._app = app
  }

  public setup(box: Gtk.Box, window: Gtk.Window): void {
    this._box = box
    const navigationHeader = new Adw.HeaderBar()
    navigationHeader.add_css_class('flat')
    box.append(navigationHeader)

    const newChatButton = new Gtk.Button({
      icon_name: 'list-add-symbolic',
      tooltip_text: 'New Chat (ctrl+n)'
    })
    newChatButton.connect('clicked', () => {
      this.createNewConversation()
        .catch((err) => {
          console.error('Failed to create new conversation:', err)
        })
    })
    navigationHeader.pack_start(newChatButton)

    this._searchButton = new Gtk.ToggleButton({
      icon_name: 'system-search-symbolic',
      tooltip_text: 'Search Chats (ctrl+f)'
    })
    this._searchButton.connect('toggled', () => {
      searchBar.search_mode_enabled = this._searchButton.active
    })
    navigationHeader.pack_end(this._searchButton)

    this._searchEntry = new Gtk.SearchEntry({
      hexpand: true
    })

    this._searchEntry.connect('search-changed', () => {
      this._updateVisibleGroups()
      this._conversationList.invalidate_filter()
      this._performSearch()
    })

    const searchBar = new Gtk.SearchBar({
      child: this._searchEntry,
      key_capture_widget: window
    })
    searchBar.add_css_class('searchbar')
    searchBar.connect_entry(this._searchEntry)
    searchBar.connect('notify::search-mode-enabled', () => {
      this._searchButton.active = searchBar.search_mode_enabled
      if (!searchBar.search_mode_enabled) {
        this._searchEntry.set_text('')
      }
    })
    box.append(searchBar)

    this._conversationList = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.SINGLE,
      vexpand: true
    })
    this._conversationList.add_css_class('navigation-sidebar')
    this._conversationList.set_filter_func((r) => {
      const row = r as ConversationRow
      const searchTerm = this._searchEntry.get_text().toLowerCase().trim()
      if (!searchTerm) {
        return true
      }
      if (row.isHeader) {
        return this._visibleGroups.has(row.group || '')
      }
      if (row.conversation) {
        const matchesText = row.conversation.title.toLowerCase().includes(searchTerm)
        const similarity = this._searchSimilarities.get(row.conversation.id) || 0
        const matchesSemantic = similarity >= 0.5
        return matchesText || matchesSemantic
      }
      return false
    })

    this._conversationList.set_sort_func((row1, row2) => {
      const r1 = row1 as ConversationRow
      const r2 = row2 as ConversationRow

      const g1 = GROUP_ORDER.indexOf(r1.group || 'Older')
      const g2 = GROUP_ORDER.indexOf(r2.group || 'Older')
      if (g1 !== g2) {
        return g1 - g2
      }

      if (r1.isHeader && !r2.isHeader) {
        return -1
      }
      if (!r1.isHeader && r2.isHeader) {
        return 1
      }

      if (r1.conversation && r2.conversation) {
        const date1 = new Date(r1.conversation.updated_at || r1.conversation.created_at).getTime()
        const date2 = new Date(r2.conversation.updated_at || r2.conversation.created_at).getTime()
        if (date1 !== date2) {
          return date2 - date1
        }
        return r1.conversation.id > r2.conversation.id ? -1 : (r1.conversation.id < r2.conversation.id ? 1 : 0)
      }
      return 0
    })

    this._conversationList.connect('row-selected', (_list: Gtk.ListBox, row?: ConversationRow) => {
      if (row && row.conversation) {
        this._selectConversation(row.conversation).catch((err) => {
          console.error('Failed to select conversation:', err)
        })
      }
    })

    const scrolledSidebar = new Gtk.ScrolledWindow({
      child: this._conversationList
    })
    box.append(scrolledSidebar)
  }

  private _updateVisibleGroups(): void {
    const searchTerm = this._searchEntry.get_text().toLowerCase().trim()
    this._visibleGroups.clear()
    if (!searchTerm) {
      return
    }

    for (const conv of this._app.conversations) {
      const matchesText = conv.title.toLowerCase().includes(searchTerm)
      const similarity = this._searchSimilarities.get(conv.id) || 0
      const matchesSemantic = similarity >= 0.5

      if (matchesText || matchesSemantic) {
        this._visibleGroups.add(getDateGroup(conv.updated_at || conv.created_at))
      }
    }
  }

  public populateList(): void {
    this.clearList()

    if (this._app.conversations.length === 0) {
      return
    }

    const sortedConvs = [...this._app.conversations].sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime()
      const dateB = new Date(b.updated_at || b.created_at).getTime()
      return dateB - dateA
    })

    const grouped = new Map<string, Conversation[]>()
    for (const conv of sortedConvs) {
      const group = getDateGroup(conv.updated_at || conv.created_at)
      if (!grouped.has(group)) {
        grouped.set(group, [])
      }
      grouped.get(group)?.push(conv)
    }

    for (const groupName of GROUP_ORDER) {
      const groupConvs = grouped.get(groupName)
      if (groupConvs && groupConvs.length > 0) {
        this._conversationList.append(this._createHeaderRow(groupName))

        for (const conv of groupConvs) {
          const row = this._createRow(conv)
          this._conversationList.append(row)
        }
      }
    }
  }

  public async selectFirst(): Promise<void> {
    if (this._app.conversations.length > 0) {
      const sortedConvs = [...this._app.conversations].sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime()
        const dateB = new Date(b.updated_at || b.created_at).getTime()
        return dateB - dateA
      })
      const conv = sortedConvs[0]
      await this._selectConversation(conv)
      const row = this._getRow(conv)
      if (row) {
        this._conversationList.select_row(row)
      }
    }
  }

  public async selectConversationById(id: number): Promise<void> {
    const conv = this._app.conversations.find((c) => {
      return c.id === id
    })
    if (conv) {
      await this._selectConversation(conv)
      const row = this._getRow(conv)
      if (row) {
        this._conversationList.select_row(row)
      }
    }
  }

  public async createNewConversation(): Promise<void> {
    const now = new Date().toISOString()
    const conversation: Conversation = {
      id: Date.now(),
      title: 'New chat',
      model: this._app.model,
      created_at: now,
      updated_at: now
    }
    this._app.conversations.unshift(conversation)
    this._app.saveConversations()
    this.populateList()
    await this._selectConversation(conversation)
    const row = this._getRow(conversation)
    if (row) {
      this._conversationList.select_row(row)
    }
  }

  public setConversationTitle(conversation: Conversation, title: string): void {
    const row = this._getRow(conversation)
    if (row) {
      row.label.set_label(title)
      row.set_tooltip_text(title)
    }
  }

  public updateConversation(conversation: Conversation): void {
    const row = this._getRow(conversation)
    if (row) {
      const newGroup = getDateGroup(conversation.updated_at || conversation.created_at)
      if (row.group !== newGroup) {
        this.populateList()
        if (this._app.conversation) {
          const activeRow = this._getRow(this._app.conversation)
          if (activeRow) {
            this._conversationList.select_row(activeRow)
          }
        }
      } else {
        this._conversationList.invalidate_sort()
      }
    }
  }

  private async _selectConversation(conversation: Conversation): Promise<void> {
    if (this._app.conversation?.id === conversation.id) {
      this._app.chat.scrollToBottom()
      return
    }
    await this._app.setConversation(conversation.id)
  }

  private async _deleteConversation(conversation: Conversation): Promise<void> {
    const index = this._app.conversations.indexOf(conversation)
    if (index > -1) {
      this._app.conversations.splice(index, 1)
      await conversationsStore.deleteMessages(conversation.id)
      await conversationsStore.deleteConversation(conversation.id)
    }

    if (this._app.conversations.length === 0) {
      await this.createNewConversation()
      return
    }

    this.populateList()

    if (this._app.conversation?.id === conversation.id) {
      const sortedConvs = [...this._app.conversations].sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime()
        const dateB = new Date(b.updated_at || b.created_at).getTime()
        return dateB - dateA
      })
      const selected = sortedConvs[0]
      await this._selectConversation(selected)
      const row = this._getRow(selected)
      if (row) {
        this._conversationList.select_row(row)
      }
    }

    this._app.saveConversations()
  }

  private _createHeaderRow(label: string): ConversationRow {
    const row = new Gtk.ListBoxRow({
      activatable: false,
      selectable: false
    }) as ConversationRow
    const headerLabel = new Gtk.Label({
      label,
      xalign: 0
    })
    headerLabel.add_css_class('dim-label')
    headerLabel.add_css_class('caption-heading')
    row.set_child(headerLabel)
    row.isHeader = true
    row.group = label
    row.label = headerLabel
    return row
  }

  private _createRow(conversation: Conversation): Gtk.ListBoxRow {
    const row = new Gtk.ListBoxRow({
      tooltip_text: conversation.title
    }) as ConversationRow
    const label = new Gtk.Label({
      label: conversation.title,
      xalign: 0,
      ellipsize: Pango.EllipsizeMode.END
    })
    row.set_child(label)
    row.label = label

    const actionGroup = new Gio.SimpleActionGroup()

    const summarizeAction = createSimpleAction('summarize', async () => {
      try {
        this._app.setSummarizing(conversation.id, true)
        const messages = await conversationsStore.getMessages(conversation.id)
        if (messages.length > 0) {
          const summary = await summarizeConversation({ ollama: this._app.ollama, messages })
          if (summary) {
            const title = convertSummaryToTitle(summary)
            this._app.setConversationTitle(conversation, title)
            this._app.saveConversations()
          }
        }
      } catch (err) {
        console.error('Failed to summarize conversation:', err)
        this._app.showToast('Failed to generate summary', true)
      } finally {
        this._app.setSummarizing(conversation.id, false)
      }
    })
    actionGroup.add_action(summarizeAction)

    const deleteAction = createSimpleAction('delete', async () => {
      await this._deleteConversation(conversation)
    })
    actionGroup.add_action(deleteAction)

    row.insert_action_group('conversation', actionGroup)

    const menu = new Gio.Menu()
    menu.append_item(createMenuItem('Generate Summary', 'conversation.summarize', 'text-x-generic-symbolic'))
    menu.append_item(createMenuItem('Delete Chat', 'conversation.delete', 'user-trash-symbolic'))

    const popover = Gtk.PopoverMenu.new_from_model(menu)
    popover.set_parent(row)
    popover.set_has_arrow(false)
    popover.set_position(Gtk.PositionType.BOTTOM)

    setupContextMenu(row, popover)

    row.conversation = conversation
    row.group = getDateGroup(conversation.updated_at || conversation.created_at)
    row.popover = popover

    return row
  }

  public clearList(): void {
    let r: Gtk.Widget | null
    while ((r = this._conversationList.get_first_child())) {
      const row = r as ConversationRow
      if (row.popover) {
        row.popover.unparent()
        row.popover = undefined
      }
      this._conversationList.remove(r)
    }
  }

  private _getRow(conversation: Conversation): ConversationRow | undefined {
    for (let w = this._conversationList.get_first_child(); w; w = w.get_next_sibling()) {
      const row = w as ConversationRow
      if (row.conversation && row.conversation.id === conversation.id) {
        return row
      }
    }
    return undefined
  }
}
