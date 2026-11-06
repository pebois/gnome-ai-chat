import type { SummaryResponse } from '@/lib/agent/summarize.js'
import { isPromptCommand } from '@/lib/commands/parse.js'
import { DEFAULT_CHAT_MODEL } from '@/lib/constants.js'
import type { ChatMessage } from '@/lib/providers/index.js'

export function selectDefaultModel(availableModels: string[]): string {
  if (!availableModels || availableModels.length === 0) {
    return DEFAULT_CHAT_MODEL
  }
  if (availableModels.some((m) => {
    return m.toLowerCase() === DEFAULT_CHAT_MODEL.toLowerCase()
  })) {
    return DEFAULT_CHAT_MODEL
  }
  const nonEmbedModel = availableModels.find((n) => {
    return !n.toLowerCase().includes('embed')
  })
  return nonEmbedModel || availableModels[0]
}

export function getDateGroup(dateString: string): string {
  if (!dateString) {
    return 'Older'
  }

  const date = new Date(dateString)
  if (isNaN(date.getTime())) {
    return 'Older'
  }

  const now = new Date()

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const diffTime = today.getTime() - targetDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays <= 7) {
    return 'This Week'
  } else if (diffDays <= 30) {
    return 'This Month'
  } else {
    return 'Older'
  }
}

export function convertMessageToTitle(message: string): string {
  const [part] = message.trim().split('\n')
  const title = part.trim()
  return title
}

export function convertSummaryToTitle(summary: SummaryResponse): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const segments = Array.from(segmenter.segment(summary.emoji))
  const firstEmoji = segments[0]?.segment || ''
  return `${firstEmoji} ${summary.title}`.trim()
}

export function formatModelName(name: string): string {
  if (!name) {
    return ''
  }
  return name.split(':')[0]
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  if (seconds > 0) {
    return `${seconds}s`
  }
  return `${ms.toFixed(1)}ms`
}

export function formatRemainingTime(seconds: number): string {
  const totalSeconds = Math.round(seconds)
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function formatSize(bytes: number): string {
  if (bytes === 0) {
    return '0.00 B'
  }
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return 0
  }
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) {
    return 0
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export interface LanguageMetadata {
  id: string
  title: string
}

export function getLanguageMetadata(lang: string): LanguageMetadata {
  if (!lang) {
    return { id: 'text', title: 'Text' }
  }

  const map: Record<string, LanguageMetadata> = {
    'ts': { id: 'typescript', title: 'TypeScript' },
    'tsx': { id: 'typescript', title: 'TypeScript (TSX)' },
    'js': { id: 'javascript', title: 'JavaScript' },
    'jsx': { id: 'javascript', title: 'JavaScript (JSX)' },
    'mjs': { id: 'javascript', title: 'JavaScript (ESM)' },
    'cjs': { id: 'javascript', title: 'JavaScript (CJS)' },
    'vue': { id: 'javascript', title: 'Vue' },
    'md': { id: 'markdown', title: 'Markdown' },
    'mdx': { id: 'markdown', title: 'MDX' },
    'py': { id: 'python', title: 'Python' },
    'rs': { id: 'rust', title: 'Rust' },
    'sh': { id: 'sh', title: 'Shell' },
    'bash': { id: 'sh', title: 'Bash' },
    'zsh': { id: 'sh', title: 'Zsh' },
    'yml': { id: 'yaml', title: 'YAML' },
    'yaml': { id: 'yaml', title: 'YAML' },
    'cxx': { id: 'cpp', title: 'C++' },
    'c++': { id: 'cpp', title: 'C++' },
    'cpp': { id: 'cpp', title: 'C++' },
    'rb': { id: 'ruby', title: 'Ruby' },
    'cs': { id: 'csharp', title: 'C#' },
    'c#': { id: 'csharp', title: 'C#' },
    'fs': { id: 'fsharp', title: 'F#' },
    'f#': { id: 'fsharp', title: 'F#' },
    'kt': { id: 'kotlin', title: 'Kotlin' },
    'html': { id: 'html', title: 'HTML' },
    'xml': { id: 'xml', title: 'XML' },
    'json': { id: 'json', title: 'JSON' },
    'jsonl': { id: 'json', title: 'JSONL' },
    'css': { id: 'css', title: 'CSS' },
    'java': { id: 'java', title: 'Java' },
    'swift': { id: 'swift', title: 'Swift' },
    'php': { id: 'php', title: 'PHP' },
    'sql': { id: 'sql', title: 'SQL' }
  }

  const l = lang.toLowerCase()
  if (map[l]) {
    return map[l]
  }

  return {
    id: l,
    title: l.charAt(0).toUpperCase() + l.slice(1)
  }
}

export interface MessageDetail {
  label: string
  value: string
}

export function messageDetails(message: ChatMessage): MessageDetail[] {
  const details: MessageDetail[] = []
  const { command, stats } = message
  if (command) {
    details.push({ label: 'Command', value: `/${command}` })
    if (isPromptCommand(message)) {
      details.push({ label: 'Prompt', value: message.content })
    }
  }
  if (stats) {
    const seconds = (ms: number) => {
      return `${(ms / 1000).toFixed(1)} s`
    }
    details.push({ label: 'Model', value: formatModelName(stats.model) })
    if (stats.outputTokens > 0 && stats.evalDurationMs > 0) {
      details.push({ label: 'Speed', value: `${(stats.outputTokens / (stats.evalDurationMs / 1000)).toFixed(1)} tok/s` })
    }
    if (stats.outputTokens > 0) {
      details.push({ label: 'Output tokens', value: String(stats.outputTokens) })
    }
    if (stats.promptTokens > 0) {
      details.push({ label: 'Prompt tokens', value: String(stats.promptTokens) })
    }
    if (stats.evalDurationMs > 0) {
      details.push({ label: 'Generation time', value: seconds(stats.evalDurationMs) })
    }
    if (stats.durationMs > 0) {
      details.push({ label: 'Total time', value: seconds(stats.durationMs) })
    }
  }
  return details
}
