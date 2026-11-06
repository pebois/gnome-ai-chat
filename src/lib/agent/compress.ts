import { CANCELLED_RESULT, NOT_CITED_RESULT } from '@/lib/agent/research.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'
import { isToolError } from '@/lib/tools/labels.js'
import { findToolResult } from '@/lib/tools/results.js'

function isResearch(message: ChatMessage): boolean {
  return message.role === 'assistant' && !!message.tool_calls?.some((call) => {
    return call.function.name === 'deepsearch_plan'
  })
}

function isCitedPage(messages: ChatMessage[], call: ToolCall): ChatMessage | undefined {
  if (call.function.name !== 'fetch_web_page') {
    return undefined
  }
  const result = findToolResult(messages, call)
  if (!result || isToolError(result.content) || result.content.startsWith(CANCELLED_RESULT) || result.content.startsWith(NOT_CITED_RESULT)) {
    return undefined
  }
  return result
}

export function compressMessages(messages: ChatMessage[]): ChatMessage[] {
  const compressed: ChatMessage[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      continue
    }
    if (message.role !== 'assistant') {
      compressed.push(message)
      continue
    }
    const { thinking: _thinking, tool_calls: _toolCalls, ...rest } = message
    if (isResearch(message)) {
      const pages = (message.tool_calls ?? []).flatMap((call) => {
        const result = isCitedPage(messages, call)
        return result ? [{ call, result }] : []
      })
      if (pages.length > 0) {
        compressed.push({ ...rest, tool_calls: pages.map((p) => {
          return p.call
        }) })
        compressed.push(...pages.map((p) => {
          return p.result
        }))
      }
      continue
    }
    if (rest.content?.trim() || rest.images?.length || rest.files?.length) {
      compressed.push(rest)
    }
  }
  return compressed
}
