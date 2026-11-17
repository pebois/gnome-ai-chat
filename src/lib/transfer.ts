import type { Conversation } from '@/lib/db/types.js'
import type { ChatMessage, MessageStats, ToolCall } from '@/lib/providers/index.js'

export const TRANSFER_FORMAT = 'gnome-ai-chat-conversations'
export const TRANSFER_VERSION = 1

const ROLES = ['user', 'assistant', 'system', 'tool']

export interface TransferConversation {
  id: number
  title: string
  model: string
  created_at: string
  updated_at?: string
  pinned: boolean
  messages: ChatMessage[]
}

export interface TransferFile {
  format: string
  version: number
  exported_at: string
  conversations: TransferConversation[]
}

export interface ImportItem {
  conversation: Conversation
  messages: ChatMessage[]
}

export interface ImportPlan {
  added: ImportItem[]
  replaced: ImportItem[]
  unchanged: number
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function parseImages(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter((v): v is string => {
    return typeof v === 'string'
  })
}

function parseFiles(value: unknown): { name: string; content: string }[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter(isObject).filter((file) => {
    return typeof file.name === 'string' && typeof file.content === 'string'
  }).map((file) => {
    return { name: file.name as string, content: file.content as string }
  })
}

function parseMessage(value: unknown): ChatMessage | undefined {
  if (!isObject(value) || typeof value.role !== 'string' || !ROLES.includes(value.role) || typeof value.content !== 'string') {
    return undefined
  }
  const message: ChatMessage = { role: value.role as ChatMessage['role'], content: value.content }
  const images = parseImages(value.images)
  if (images) {
    message.images = images
  }
  const files = parseFiles(value.files)
  if (files) {
    message.files = files
  }
  const thinking = optionalString(value.thinking)
  if (thinking) {
    message.thinking = thinking
  }
  if (Array.isArray(value.tool_calls)) {
    message.tool_calls = value.tool_calls as ToolCall[]
  }
  const toolName = optionalString(value.tool_name)
  if (toolName) {
    message.tool_name = toolName
  }
  if (isObject(value.stats)) {
    message.stats = value.stats as unknown as MessageStats
  }
  const command = optionalString(value.command)
  if (command) {
    message.command = command
  }
  return message
}

function parseConversation(value: unknown, messages: unknown): TransferConversation | undefined {
  if (!isObject(value) || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || typeof value.created_at !== 'string' || !Array.isArray(messages)) {
    return undefined
  }
  return {
    id: value.id,
    title: optionalString(value.title) ?? 'Imported chat',
    model: typeof value.model === 'string' ? value.model : '',
    created_at: value.created_at,
    updated_at: optionalString(value.updated_at),
    pinned: value.pinned === true,
    messages: messages.map(parseMessage).filter((m): m is ChatMessage => {
      return m !== undefined
    })
  }
}

export function toTransferConversation(conversation: Conversation, messages: ChatMessage[]): TransferConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    pinned: conversation.pinned === true,
    messages
  }
}

export function buildExport(conversations: TransferConversation[], exportedAt: string): TransferFile {
  return {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exported_at: exportedAt,
    conversations
  }
}

export function parseImport(text: string): TransferConversation[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON')
  }
  if (!isObject(data)) {
    throw new Error('The file is not a conversation export')
  }
  if (data.format === TRANSFER_FORMAT && Array.isArray(data.conversations)) {
    if (typeof data.version === 'number' && data.version > TRANSFER_VERSION) {
      throw new Error('The file was exported by a newer version of the app')
    }
    return data.conversations.map((entry) => {
      return parseConversation(entry, isObject(entry) ? entry.messages : undefined)
    }).filter((c): c is TransferConversation => {
      return c !== undefined
    })
  }
  if (isObject(data.conversation) && Array.isArray(data.messages)) {
    const conversation = parseConversation(data.conversation, data.messages)
    if (conversation) {
      return [conversation]
    }
  }
  throw new Error('The file is not a conversation export')
}

function timestamp(conversation: { created_at: string; updated_at?: string }): number {
  const time = Date.parse(conversation.updated_at ?? conversation.created_at)
  return Number.isNaN(time) ? 0 : time
}

function findLocal(local: Conversation[], entry: TransferConversation): Conversation | undefined {
  return local.find((c) => {
    return c.id === entry.id && c.created_at === entry.created_at
  }) ?? local.find((c) => {
    return c.created_at === entry.created_at
  })
}

function freeId(wanted: number, taken: Set<number>): number {
  let id = wanted
  while (taken.has(id)) {
    id++
  }
  return id
}

function newestPerConversation(imported: TransferConversation[]): TransferConversation[] {
  const newest = new Map<string, TransferConversation>()
  for (const entry of imported) {
    const key = entry.created_at
    const previous = newest.get(key)
    if (!previous || timestamp(entry) > timestamp(previous)) {
      newest.set(key, entry)
    }
  }
  return [...newest.values()]
}

export function planImport(local: Conversation[], imported: TransferConversation[], isLocked: (id: number) => boolean = () => {
  return false
}): ImportPlan {
  const plan: ImportPlan = { added: [], replaced: [], unchanged: 0 }
  const taken = new Set(local.map((c) => {
    return c.id
  }))
  for (const entry of newestPerConversation(imported)) {
    const match = findLocal(local, entry)
    if (!match) {
      const id = freeId(entry.id, taken)
      taken.add(id)
      plan.added.push({
        conversation: { id, title: entry.title, model: entry.model, created_at: entry.created_at, updated_at: entry.updated_at, pinned: entry.pinned },
        messages: entry.messages
      })
      continue
    }
    if (isLocked(match.id) || timestamp(entry) <= timestamp(match)) {
      plan.unchanged++
      continue
    }
    plan.replaced.push({
      conversation: { id: match.id, title: entry.title, model: entry.model, created_at: match.created_at, updated_at: entry.updated_at, pinned: match.pinned === true || entry.pinned },
      messages: entry.messages
    })
  }
  return plan
}

export function describeImport(plan: ImportPlan): string {
  const count = (n: number): string => {
    return `${n} chat${n === 1 ? '' : 's'}`
  }
  if (plan.added.length === 0 && plan.replaced.length === 0) {
    return plan.unchanged === 0 ? 'Nothing to import' : `Nothing new to import, ${count(plan.unchanged)} already up to date`
  }
  return [
    `Imported ${count(plan.added.length)}`,
    plan.replaced.length > 0 ? `updated ${plan.replaced.length}` : '',
    plan.unchanged > 0 ? `${plan.unchanged} unchanged` : ''
  ].filter(Boolean).join(', ')
}
