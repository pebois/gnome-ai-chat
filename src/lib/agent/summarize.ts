import { DEFAULT_GENRATE_MODEL } from '@/lib/constants.js'
import type { ChatMessage, Provider } from '@/lib/providers/index.js'

export interface SummaryResponse {
  title: string
  emoji: string
}

interface SummaryRequest {
  provider: Provider
  model?: string
  messages: ChatMessage[]
}

export async function summarizeConversation({ messages, model, provider }: SummaryRequest): Promise<SummaryResponse | null> {
  if (messages.length === 0) {
    return null
  }

  const conversationText = messages
    .filter((m) => {
      return ['assistant', 'user'].includes(m.role)
    })
    .map((m) => {
      return `${m.role.toUpperCase()}: ${m.content}`
    })
    .join('\n')

  const prompt = `Summarize this conversation in exactly 3 to 5 words and provide one relevant emoji.\n\nConversation:\n${conversationText}`

  const response = await provider.generate({
    model: model ?? DEFAULT_GENRATE_MODEL,
    prompt,
    system: 'You are a summarization agent. You must output valid JSON containing a "title" (3-5 words) and an "emoji".',
    stream: false,
    format: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'A 3-5 word summary of the conversation'
        },
        emoji: {
          type: 'string',
          description: 'A single relevant emoji'
        }
      },
      required: ['title', 'emoji']
    }
  })

  if (!response?.response) {
    return null
  }

  try {
    return JSON.parse(response.response) as SummaryResponse
  } catch (err) {
    console.error('Failed to parse summary JSON:', err)
    return null
  }
}
