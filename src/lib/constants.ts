import type { PerformanceStats, Settings } from '@/lib/db/types.js'
import { DBUS_BUS_NAME } from '@/lib/ipc.js'
import { DEFAULT_SKILLS } from '@/lib/skills/index.js'

export { DEFAULT_SKILLS }

export const APPLICATION_NAME = 'Gnome AI Chat'

export const APPLICATION_ID = DBUS_BUS_NAME

export const VERSION = '1.13.0'

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

export const OLLAMA_REGISTRY_URL = 'https://registry.ollama.ai'

export const DEFAULT_CHAT_MODEL = 'gpt-oss:latest'

export const DEFAULT_GENERATE_MODEL = 'qwen3:latest'

export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text:latest'

export const DEFAULT_LIMIT = 50

export const DEFAULT_TIMEOUT = 300

export const DEFAULT_SPACING = 12

export const DEFAULT_MCP_TIMEOUT_SEC = 30

export const MCP_INIT_TIMEOUT_MS = 30000

export const MCP_RECONNECT_DELAYS_MS = [2000, 5000, 15000]

export const MCP_PROTOCOL_VERSION = '2025-06-18'

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, '2025-03-26', '2024-11-05']

export const MCP_STABLE_CONNECTION_MS = 60000

export const MCP_MAX_RESULT_CHARS = 100000

export const MCP_MAX_TOOL_NAME_LENGTH = 64

export const MCP_HTTP_MAX_CONNECTIONS = 8

export const MCP_LISTEN_RETRY_MS = 5000

export const MCP_TOOL_PREFIX = 'mcp__'

export const MAX_TOOL_ROUNDS = 10

export const CONVERSATION_INDEX_DELAY_MS = 30000

export const TOOL_RESULT_MAX_CHARS = 8000

export const OLD_TOOL_RESULT_MAX_CHARS = 1500

export const CONTEXT_CHARS_PER_TOKEN = 4

export const CONTEXT_IMAGE_TOKENS = 768

export const CONTEXT_RESPONSE_RESERVE_RATIO = 0.25

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
* # H1 to ##### H5 (only when structure genuinely helps)
* - Bullet lists and 1. Numbered lists (only when structure genuinely helps)
* | Markdown | Tables | (only for structured data)

## Strictly Forbidden
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
  searchUrl: '',
  system: DEFAULT_SYSTEM_PROMPT,
  options: DEFAULT_OPTIONS,
  think: DEFAULT_THINK,
  stream: DEFAULT_STREAM,
  theme: DEFAULT_THEME,
  syntax: DEFAULT_SYNTAX_THEME,
  debug: DEFAULT_DEBUG,
  permissions: {
    terminal: 'ask',
    files: 'ask',
    reads: 'auto-accept',
    apps: 'ask',
    mcp: 'ask'
  }
} as Settings

export const DEFAULT_STATS = {
  wallTimeMs: 0,
  apiTimeMs: 0,
  toolTimeMs: 0,
  modelUsage: []
} as PerformanceStats
