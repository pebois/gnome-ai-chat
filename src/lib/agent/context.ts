import { CONTEXT_CHARS_PER_TOKEN, CONTEXT_IMAGE_TOKENS, CONTEXT_RESPONSE_RESERVE_RATIO, OLD_TOOL_RESULT_MAX_CHARS, TOOL_RESULT_MAX_CHARS } from '@/lib/constants.js'
import type { ChatMessage, Tool } from '@/lib/providers/index.js'

export interface ContextInput {
  system: string
  messages: ChatMessage[]
  tools: Tool[]
  numCtx: number
}

export interface ContextResult {
  messages: ChatMessage[]
  droppedMessages: number
  truncatedResults: number
  estimatedTokens: number
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CONTEXT_CHARS_PER_TOKEN)
}

export function estimateMessageTokens(message: ChatMessage): number {
  let chars = message.content.length
  if (message.thinking) {
    chars += message.thinking.length
  }
  if (message.tool_calls?.length) {
    chars += JSON.stringify(message.tool_calls).length
  }
  if (message.files?.length) {
    for (const file of message.files) {
      chars += file.name.length + file.content.length
    }
  }
  const images = (message.images?.length ?? 0) * CONTEXT_IMAGE_TOKENS
  return Math.ceil(chars / CONTEXT_CHARS_PER_TOKEN) + images
}

export function estimateToolsTokens(tools: Tool[]): number {
  return tools.length > 0 ? estimateTokens(JSON.stringify(tools)) : 0
}

export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }
  const marker = `\n[...truncated ${text.length - maxChars} chars...]\n`
  const head = Math.ceil(maxChars * 0.7)
  const tail = maxChars - head
  return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '')
}

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i
    }
  }
  return 0
}

function turnStarts(messages: ChatMessage[], end: number): number[] {
  const starts: number[] = []
  for (let i = 0; i < end; i++) {
    if (messages[i].role === 'user') {
      starts.push(i)
    }
  }
  return starts
}

export function buildContext({ messages, numCtx, system, tools }: ContextInput): ContextResult {
  const currentStart = lastUserIndex(messages)
  let truncatedResults = 0

  const compacted = messages.map((message, index) => {
    if (message.role !== 'tool') {
      return message
    }
    const limit = index >= currentStart ? TOOL_RESULT_MAX_CHARS : OLD_TOOL_RESULT_MAX_CHARS
    if (message.content.length <= limit) {
      return message
    }
    truncatedResults++
    return { ...message, content: truncateMiddle(message.content, limit) }
  })

  const fixed = estimateTokens(system) + estimateToolsTokens(tools)
  const budget = Math.floor(numCtx * (1 - CONTEXT_RESPONSE_RESERVE_RATIO)) - fixed

  const current = compacted.slice(currentStart)
  let used = current.reduce((sum, m) => {
    return sum + estimateMessageTokens(m)
  }, 0)

  const starts = turnStarts(compacted, currentStart)
  let keepFrom = currentStart
  for (let t = starts.length - 1; t >= 0; t--) {
    const turn = compacted.slice(starts[t], keepFrom)
    const cost = turn.reduce((sum, m) => {
      return sum + estimateMessageTokens(m)
    }, 0)
    if (used + cost > budget) {
      break
    }
    used += cost
    keepFrom = starts[t]
  }

  if (starts.length === 0 || keepFrom === starts[0]) {
    keepFrom = 0
    used = compacted.reduce((sum, m) => {
      return sum + estimateMessageTokens(m)
    }, 0)
  }

  return {
    messages: compacted.slice(keepFrom),
    droppedMessages: keepFrom,
    truncatedResults,
    estimatedTokens: used + fixed
  }
}
