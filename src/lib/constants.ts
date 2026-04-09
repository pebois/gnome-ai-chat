import type { PerformanceStats, Settings } from '@/lib/db/types.js'
import { DEFAULT_SKILLS } from '@/lib/skills/index.js'

export { DEFAULT_SKILLS }

export const APPLICATION_NAME = 'Gnome AI Chat'

export const APPLICATION_ID = 'io.github.pebois.gnome-ai-chat'

export const VERSION = '1.8.0'

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

export const DEFAULT_CHAT_MODEL = 'gpt-oss:latest'

export const DEFAULT_GENRATE_MODEL = 'qwen3:latest'

export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text:latest'

export const DEFAULT_LIMIT = 50

export const DEFAULT_SPACING = 12

export const DEFAULT_SYSTEM_PROMPT = /* md */`
You are Domino, a helpful and friendly AI assistant.

## Interaction Style
* Respond like a person in a chat.
* DO NOT use titles, headings, or subject lines at the beginning of your messages.
* Start your response directly with your answer or a greeting.
* Keep paragraphs short and conversational.
* Use emojis very sparingly.

## Allowed Markdown Syntax
ONLY use these specific features:
* **Bold** (for emphasis)
* *Italic* (for subtle stress)
* > Blockquotes (for quoting)
* \`\`\` Code blocks \`\`\` and \`Inline code\`
* ~~Strikethrough~~
* [Link text](https://example.com) (only when genuinely useful)
* - Bullet lists and 1. Numbered lists (only when structure genuinely helps)
* | Markdown | Tables | (only for structured data)

## Strictly Forbidden
* No Headings (#, ##, ###, etc.)
* No Images
* No Underscores (_), HTML, or Latex.
* No Tiles or Boxes.
`.trim()

export const DEFAULT_STREAM = true

export const DEFAULT_THINK = 'medium'

export const DEFAULT_THEME = 0

export const DEFAULT_SYNTAX_THEME = 'Adwaita-dark'

export const DEFAULT_DEBUG = false

export const DEFAULT_OPTIONS = {
  temperature: 0.7,
  num_ctx: 4096,
  top_k: 40,
  top_p: 0.9
} as Record<string, number>

export const DEFAULT_SETTINGS = {
  url: DEFAULT_OLLAMA_URL,
  system: DEFAULT_SYSTEM_PROMPT,
  options: DEFAULT_OPTIONS,
  think: DEFAULT_THINK,
  stream: DEFAULT_STREAM,
  theme: DEFAULT_THEME,
  syntax: DEFAULT_SYNTAX_THEME,
  debug: DEFAULT_DEBUG,
  permissions: {
    terminal: 'ask',
    files: 'ask'
  }
} as Settings

export const DEFAULT_STATS = {
  wallTimeMs: 0,
  apiTimeMs: 0,
  toolTimeMs: 0,
  modelUsage: []
} as PerformanceStats
