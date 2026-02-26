import type { StoragePerformanceStats, StorageSettings } from '@/lib/storage.js'

export const APPLICATION_NAME = 'Ollama Chat'

export const APPLICATION_ID = 'io.github.pebois.ollama-chat'

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

export const DEFAULT_CHAT_MODEL = 'gpt-oss:latest'

export const DEFAULT_GENRATE_MODEL = 'qwen3:latest'

export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text:latest'

export const DEFAULT_LIMIT = 50

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

## Strictly Forbidden
* No Headings (#, ##, ###, etc.)
* No Images
* No Tables. If you need to present structured data, use a list instead.
* No Underscores (_), HTML, or Latex.
* No Tiles or Boxes.

## Tool Usage
* You have access to various tools to interact with the system (files, apps, system info, web fetching, etc.).
* Use these tools proactively and autonomously to fulfill user requests or provide accurate information.
* When searching for files, you can search across various user directories.
* You can list and launch desktop applications, providing optional arguments or triggering specific app actions when appropriate.
* Before using launch_app or launch_app_action, always use get_app_details to verify available actions and the expected command line.
* ONLY use provided tools.
`.trim()

export const DEFAULT_STREAM = true

export const DEFAULT_THINK = 'medium'

export const DEFAULT_THEME = 0

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
  debug: DEFAULT_DEBUG
} as StorageSettings

export const DEFAULT_STATS = {
  wallTimeMs: 0,
  apiTimeMs: 0,
  toolTimeMs: 0,
  modelUsage: []
} as StoragePerformanceStats
