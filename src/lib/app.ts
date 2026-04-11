import type Gio from 'gi://Gio'
import type GLib from 'gi://GLib?version=2.0'

import type { Chat } from '@/app/ui/chat.js'
import type { ChatConversation } from '@/app/ui/history.js'
import type { Sidebar } from '@/app/ui/sidebar.js'
import type { ArtifactWindow } from '@/app/window/artifact.js'
import type { AppWindow } from '@/app/window/main.js'
import type { Conversation, Settings, Skill } from '@/lib/db/types.js'
import type { Ollama } from '@/lib/ollama.js'
import type { Tracker } from '@/lib/tracker.js'

export interface AppInterface {
  readonly chat: Chat
  readonly conversation?: ChatConversation
  readonly conversations: Conversation[]
  readonly isLoaded: boolean
  readonly isBusy: boolean
  readonly model: string
  readonly models: string[]
  readonly ollama: Ollama
  readonly settings: Settings
  readonly sidebar: Sidebar
  readonly skills: Skill[]
  readonly supportsVision: boolean
  readonly toolModels: string[]
  readonly tracker: Tracker
  readonly window: AppWindow
  readonly activeArtifacts: Map<string, ArtifactWindow>

  activateAction(action_name: string, parameter?: GLib.Variant): void
  cancelFilesIndexing(): void
  clearAllConversations(): Promise<void>
  connect(sigName: 'busy-changed', callback: (_: number, isBusy: boolean) => void): number
  connect(sigName: 'capabilities-changed', callback: (_: number) => void): number
  connect(sigName: 'files-indexing-changed', callback: (_: number, active: boolean, fraction: number) => void): number
  connect(sigName: 'syntax-changed', callback: (_: number, theme: string) => void): number
  connect(sigName: string, callback: (...args: unknown[]) => void): number
  disconnect(id: number): void
  focusInput(): void
  getShortcut(action_name: string): string | null
  handleQuit(): Promise<void>
  indexFiles(): Promise<void>
  init: () => Promise<void>
  isGeneratingMessage(id: number): boolean
  isSummarizing(id: number): boolean
  saveSettings(): void
  saveSkills(): void
  saveConversations(): void
  sendNotification(id: string, notification: Gio.Notification): void
  setConversation(id: number): Promise<void>
  setConversationTitle(conv: Conversation, title: string): void
  setGeneratingMessage(id: number, active: boolean): void
  setModel(model: string): void
  setSummarizing(id: number, active: boolean): void
  setTheme(theme: number): void
  setSyntax(theme: string): void
  showToast(message: string, error?: boolean): void
  toggleDebug(): void
  toggleSidebar(): void
  requestToolPermission(heading: string, body: string): Promise<boolean>
}
