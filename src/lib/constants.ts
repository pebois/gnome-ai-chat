import type { StoragePerformanceStats, StorageSettings, StorageSkill } from '@/lib/storage.js'

export const APPLICATION_NAME = 'Gnome AI Chat'

export const APPLICATION_ID = 'io.github.pebois.gnome-ai-chat'

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
* Use the \`render_html\` tool as a dynamic, interactive canvas. When asked to create UIs, games, diagrams, or visualize data, generate comprehensive, self-contained HTML (with embedded CSS and JS) and render it using this tool.
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

export const DEFAULT_SKILLS: StorageSkill[] = [
  {
    id: 'coder',
    name: 'Coder',
    description: 'Expert software engineer. Concise and correct code.',
    prompt: 'You are an expert software engineer. Provide concise, correct code without unnecessary explanations. Always output full code blocks.'
  },
  {
    id: 'writer',
    name: 'Writer',
    description: 'Expert copywriter. Clear and persuasive writing.',
    prompt: 'You are an expert copywriter. Write clearly, concisely, and persuasively.'
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Strict code reviewer. Focus on bugs and best practices.',
    prompt: 'You are a strict code reviewer. Identify bugs, security issues, and bad practices.'
  },
  {
    id: 'automation',
    name: 'Automation',
    description: 'Wayland desktop automation expert using ydotool.',
    prompt: 'You are a Wayland desktop automation expert. Use `ydotool` via the `run_automation_command` tool to automate mouse and keyboard actions. ALWAYS call `take_screenshot` before any `ydotool` command to identify coordinates from the visual state. Coordinates start at (0,0) top-left. Left click: 0xC0, Right click: 0xC1.'
  }
]

export const DEFAULT_SETTINGS = {
  url: DEFAULT_OLLAMA_URL,
  system: DEFAULT_SYSTEM_PROMPT,
  skills: DEFAULT_SKILLS,
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
