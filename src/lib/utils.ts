import type { SummaryResponse } from '@/lib/agent/summarize.js'
import { DEFAULT_CHAT_MODEL } from '@/lib/constants.js'

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

export function pangoEscape(text: string): string {
  if (!text) {
    return ''
  }
  return text
    .replace(/\x00/g, '') // Strip null characters to prevent truncation in C-based Pango functions
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function markdownToPango(text: string): string {
  if (!text) {
    return ''
  }

  // Escape special characters for Pango markup
  let escaped = pangoEscape(text)

  // Handle escaped markdown characters
  const escapedChars: string[] = []
  const charPh = (i: number) => {
    return `\x01${i}\x01`
  }
  escaped = escaped.replace(/\\([*~_`\\])/g, (_match, char: string) => {
    escapedChars.push(char)
    return charPh(escapedChars.length - 1)
  })

  // Strip horizontal rules
  escaped = escaped.replace(/\n?^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$\n?/gm, '')

  // Extract code spans as placeholders so inline formatting can't match inside them
  const codeSpans: string[] = []
  const ph = (i: number) => {
    return `\x02${i}\x02`
  }

  escaped = escaped.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    codeSpans.push(`<span font_family="monospace" size="small">${code}</span>`)
    return ph(codeSpans.length - 1)
  })
  escaped = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<span font_family="monospace">${code}</span>`)
    return ph(codeSpans.length - 1)
  })

  // Handle headings
  escaped = escaped.replace(/^### (.*)$/gm, '<b><big>$1</big></b>')
  escaped = escaped.replace(/^## (.*)$/gm, '<b><big><big>$1</big></big></b>')
  escaped = escaped.replace(/^# (.*)$/gm, '<b><big><big><big>$1</big></big></big></b>')

  // Handle blockquotes
  escaped = escaped.replace(/^\s*&gt;\s?(.*)$/gm, '<i>$1</i>')

  // Handle links
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Handle strikethrough text
  escaped = escaped.replace(/~~([^~]+)~~/g, '<s>$1</s>')

  // Handle bold and italic together (triple asterisks)
  escaped = escaped.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')

  // Handle bold text
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

  // Handle italic text
  escaped = escaped.replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/gm, '$1<i>$2</i>')

  // Restore code spans
  escaped = escaped.replace(/\x02(\d+)\x02/g, (_match: string, i: string) => {
    return codeSpans[parseInt(i)]
  })

  // Restore escaped characters
  escaped = escaped.replace(/\x01(\d+)\x01/g, (_match: string, i: string) => {
    return escapedChars[parseInt(i)]
  })

  return escaped
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

export function getLanguageId(lang: string): string {
  if (!lang) {
    return 'text'
  }

  const map: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'vue': 'javascript',
    'md': 'markdown',
    'mdx': 'markdown',
    'py': 'python',
    'rs': 'rust',
    'sh': 'sh',
    'bash': 'sh',
    'zsh': 'sh',
    'yml': 'yaml',
    'yaml': 'yaml',
    'cxx': 'cpp',
    'c++': 'cpp',
    'rb': 'ruby',
    'cs': 'csharp',
    'c#': 'csharp',
    'fs': 'fsharp',
    'f#': 'fsharp',
    'kt': 'kotlin',
    'html': 'html',
    'xml': 'xml',
    'json': 'json',
    'jsonl': 'json',
    'css': 'css',
    'java': 'java',
    'swift': 'swift',
    'php': 'php',
    'sql': 'sql'
  }

  const l = lang.toLowerCase()
  return map[l] || l
}
