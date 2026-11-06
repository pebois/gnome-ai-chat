import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'

export function findToolResult(messages: ChatMessage[], call: ToolCall): ChatMessage | undefined {
  const ownerIndex = messages.findIndex((m) => {
    return m.tool_calls?.includes(call)
  })
  if (ownerIndex === -1) {
    return undefined
  }
  const position = messages[ownerIndex].tool_calls!.indexOf(call)
  const candidate = messages[ownerIndex + 1 + position]
  if (candidate?.role === 'tool' && (!candidate.tool_name || candidate.tool_name === call.function.name)) {
    return candidate
  }
  return undefined
}
