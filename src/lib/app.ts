import type Gio from 'gi://Gio'
import type GLib from 'gi://GLib?version=2.0'

import type { ChatConversation } from '@/app/ui/history.js'
import type { ArtifactWindow } from '@/app/window/artifact.js'
import type { Chat } from '@/app/window/main/chat.js'
import type { AppWindow } from '@/app/window/main/index.js'
import type { Sidebar } from '@/app/window/main/sidebar.js'
import type { Conversation, Settings, Skill } from '@/lib/db/types.js'
import type { McpManager } from '@/lib/mcp/manager.js'
import type { Provider } from '@/lib/providers/index.js'
import type { SkillsManager } from '@/lib/skills/manager.js'
import type { ToolRegistry } from '@/lib/tools/registry.js'
import type { Tracker } from '@/lib/tracker.js'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface AppInterface {
  readonly chat: Chat
  readonly conversation?: ChatConversation
  readonly conversations: Conversation[]
  readonly isLoaded: boolean
  readonly isBusy: boolean
  readonly mcp: McpManager
  readonly model: string
  readonly models: string[]
  readonly provider: Provider
  readonly settings: Settings
  readonly sidebar: Sidebar
  readonly skills: Skill[]
  readonly skillsManager: SkillsManager
  readonly supportsVision: boolean
  readonly toolModels: string[]
  readonly tools: ToolRegistry
  readonly tracker: Tracker
  readonly window: AppWindow
  readonly activeArtifacts: Map<string, ArtifactWindow>

  activateAction(action_name: string, parameter?: GLib.Variant): void
  cancelFilesIndexing(): void
  clearAllConversations(): Promise<void>
  connect(sigName: 'busy-changed', callback: (_: number, isBusy: boolean) => void): number
  connect(sigName: 'capabilities-changed', callback: (_: number) => void): number
  connect(sigName: 'files-indexing-changed', callback: (_: number, active: boolean, fraction: number) => void): number
  connect(sigName: 'mcp-changed', callback: (_: number) => void): number
  connect(sigName: 'skills-changed', callback: (_: number) => void): number
  connect(sigName: 'syntax-changed', callback: (_: number, theme: string) => void): number
  connect(sigName: string, callback: (...args: unknown[]) => void): number
  disconnect(id: number): void
  ensureWindow(): void
  focusInput(): void
  getShortcut(action_name: string): string | null
  handleQuit(): Promise<void>
  indexFiles(): Promise<void>
  init: () => Promise<void>
  reloadModels(): Promise<void>
  reportError(message: string, err: unknown): void
  setPendingConversationId(id: number): void
  isGeneratingMessage(id: number): boolean
  isSummarizing(id: number): boolean
  saveSettings(): void
  saveConversations(): void
  persistConversation(conversation: ChatConversation): Promise<boolean>
  sendNotification(id: string, notification: Gio.Notification): void
  setConversation(id: number): Promise<void>
  setConversationTitle(conv: Conversation, title: string): void
  setGeneratingMessage(id: number, active: boolean): void
  setModel(model: string): void
  setSummarizing(id: number, active: boolean): void
  setTheme(theme: number): void
  setSyntax(theme: string): void
  showToast(message: string, error?: boolean, action?: ToastAction): void
  toggleDebug(): void
  toggleSidebar(): void
  requestToolPermission(heading: string, body: string): Promise<boolean>
}
