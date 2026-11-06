import { CONTEXT_CHARS_PER_TOKEN, CONTEXT_IMAGE_TOKENS, CONTEXT_RESPONSE_RESERVE_RATIO, OLD_TOOL_RESULT_MAX_CHARS, TOOL_RESULT_MAX_CHARS } from '@/lib/constants.js'
import type { ChatMessage, Tool } from '@/lib/providers/index.js'
import { collectSources } from '@/lib/sources.js'

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
  slimmedTurns: number
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

function messagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => {
    return sum + estimateMessageTokens(m)
  }, 0)
}

export function slimTurn(turn: ChatMessage[]): ChatMessage[] {
  let replyIndex = -1
  for (let i = turn.length - 1; i >= 0; i--) {
    if (turn[i].role === 'assistant' && turn[i].content?.trim()) {
      replyIndex = i
      break
    }
  }
  const sources = replyIndex === -1 ? [] : collectSources(turn, replyIndex)
  const slim: ChatMessage[] = []
  turn.forEach((message, index) => {
    if (message.role === 'tool') {
      return
    }
    if (message.role !== 'assistant') {
      slim.push(message)
      return
    }
    if (!message.content?.trim()) {
      return
    }
    const { thinking: _thinking, tool_calls: _toolCalls, ...rest } = message
    if (index === replyIndex && sources.length > 0) {
      const list = sources.map((s, i) => {
        return s.kind === 'web' && s.label !== s.target ? `[${i + 1}] ${s.label} — ${s.target}` : `[${i + 1}] ${s.target}`
      }).join('\n')
      slim.push({ ...rest, content: `${rest.content.trimEnd()}\n\nSources:\n${list}` })
    } else {
      slim.push(rest)
    }
  })
  return slim
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
  let used = messagesTokens(current)

  const starts = turnStarts(compacted, currentStart)
  const kept: ChatMessage[][] = []
  let keepFrom = currentStart
  let slimmedTurns = 0
  for (let t = starts.length - 1; t >= 0; t--) {
    const turn = compacted.slice(starts[t], keepFrom)
    const cost = messagesTokens(turn)
    if (used + cost <= budget) {
      kept.unshift(turn)
      used += cost
    } else {
      const slim = slimTurn(turn)
      const slimCost = messagesTokens(slim)
      if (used + slimCost > budget) {
        break
      }
      kept.unshift(slim)
      used += slimCost
      slimmedTurns++
    }
    keepFrom = starts[t]
  }

  const prefix = starts.length === 0 || keepFrom === starts[0] ? compacted.slice(0, keepFrom) : []

  return {
    messages: [...prefix, ...kept.flat(), ...current],
    droppedMessages: keepFrom - prefix.length,
    truncatedResults,
    slimmedTurns,
    estimatedTokens: used + messagesTokens(prefix) + fixed
  }
}
