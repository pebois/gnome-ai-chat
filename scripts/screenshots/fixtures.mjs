export const CALCULATOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Calculator</title>
<style>
  :root {
    --bg: #1e1e1e;
    --panel: #2b2b2b;
    --display: #181818;
    --text: #ffffff;
    --key: #3a3a3a;
    --key-op: #f59e0b;
    --key-clear: #ef4444;
    --key-eq: #22c55e;
    --border: rgba(255,255,255,0.08);
  }
  :root[style*="color-scheme: light"] {
    --bg: #f6f5f4;
    --panel: #ffffff;
    --display: #ebebeb;
    --text: #1c1c1c;
    --key: #e5e5e5;
    --border: rgba(0,0,0,0.08);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Adwaita Sans", Cantarell, system-ui, sans-serif; }
  html, body { height: 100%; background: var(--bg); color: var(--text); display: grid; place-items: center; }
  .calc {
    width: 312px; padding: 18px; border-radius: 18px;
    background: var(--panel); border: 1px solid var(--border);
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
  }
  .display {
    background: var(--display); border-radius: 12px; padding: 20px 16px;
    text-align: right; font-size: 38px; font-weight: 500; margin-bottom: 16px;
    font-variant-numeric: tabular-nums;
  }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  button {
    height: 54px; border: none; border-radius: 10px; font-size: 20px; font-weight: 500;
    background: var(--key); color: var(--text); cursor: pointer;
  }
  .op { background: var(--key-op); color: #fff; }
  .clear { background: var(--key-clear); color: #fff; }
  .eq { background: var(--key-eq); color: #fff; grid-row: span 2; height: auto; }
  .zero { grid-column: span 2; }
</style>
</head>
<body>
  <div class="calc">
    <div class="display">42.5</div>
    <div class="grid">
      <button class="clear">C</button><button>%</button><button class="op">÷</button><button class="op">×</button>
      <button>7</button><button>8</button><button>9</button><button class="op">−</button>
      <button>4</button><button>5</button><button>6</button><button class="op">+</button>
      <button>1</button><button>2</button><button>3</button><button class="eq">=</button>
      <button class="zero">0</button><button>.</button>
    </div>
  </div>
</body>
</html>`

export const DEMO_STATS = {
  wallTimeMs: 934000,
  apiTimeMs: 94200,
  toolTimeMs: 7800,
  modelUsage: [
    { model: 'nomic-embed-text:latest', requests: 412, inputTokens: 82400, outputTokens: 0 },
    { model: 'gpt-oss:latest', requests: 18, inputTokens: 24600, outputTokens: 9840 },
    { model: 'qwen3:latest', requests: 6, inputTokens: 7120, outputTokens: 2950 }
  ]
}

export const DEMO_MCP_SERVERS = [
  {
    id: 'deepwiki',
    name: 'deepwiki',
    enabled: true,
    transport: 'http',
    command: '',
    args: [],
    env: {},
    url: 'https://mcp.deepwiki.com/mcp',
    headers: {},
    permission: 'inherit',
    timeoutSec: 30,
    disabledTools: ['read_wiki_structure']
  },
  {
    id: 'context7',
    name: 'context7',
    enabled: true,
    transport: 'http',
    command: '',
    args: [],
    env: {},
    url: 'https://mcp.context7.com/mcp',
    headers: {},
    permission: 'inherit',
    timeoutSec: 30,
    disabledTools: []
  },
  {
    id: 'filesystem',
    name: 'filesystem',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/alex/Projects'],
    env: {},
    url: '',
    headers: {},
    permission: 'ask',
    timeoutSec: 30,
    disabledTools: []
  },
  {
    id: 'mslearn',
    name: 'mslearn',
    enabled: false,
    transport: 'http',
    command: '',
    args: [],
    env: {},
    url: 'https://learn.microsoft.com/api/mcp',
    headers: {},
    permission: 'inherit',
    timeoutSec: 30,
    disabledTools: []
  }
]

export const DEMO_MCP_TOOLS = {
  deepwiki: [
    {
      name: 'ask_wiki_question',
      description: "Ask any question about a GitHub repository's codebase and get an AI-powered answer grounded in its DeepWiki.",
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'read_wiki_contents',
      description: 'View documentation pages about a GitHub repository.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'read_wiki_structure',
      description: 'Get a list of documentation topics for a GitHub repository.',
      inputSchema: { type: 'object', properties: {} }
    }
  ],
  context7: [
    {
      name: 'resolve-library-id',
      description: 'Resolve a library or framework name into a Context7 documentation ID.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'get-library-docs',
      description: 'Fetch up-to-date documentation snippets for a resolved library.',
      inputSchema: { type: 'object', properties: {} }
    }
  ],
  filesystem: [
    {
      name: 'read_file',
      description: 'Read the complete contents of a file within allowed directories.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'list_directory',
      description: 'List files and subdirectories in a given path.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'search_files',
      description: 'Recursively search for files matching a glob pattern.',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}

export function buildDemoConversations(now = new Date()) {
  const iso = (offsetMs) => new Date(now.getTime() + offsetMs).toISOString()
  const day = 24 * 60 * 60 * 1000

  return [
    {
      id: 101,
      title: '📌 Architecture Notes',
      model: 'gpt-oss:latest',
      created_at: iso(-3 * day),
      updated_at: iso(-2 * day),
      pinned: true,
      embeddings: [0.05, 0.05, 0.05, 0.99],
      messages: [
        { role: 'user', content: 'Summarize the key architectural layers of Gnome AI Chat.' },
        {
          role: 'assistant',
          content: 'The app is split into three layers: **UI components** in `src/app/`, **provider-agnostic agent and tool logic** in `src/lib/`, and **SQLite persistence** in `src/lib/db/`.',
          stats: { model: 'gpt-oss:latest', promptTokens: 184, outputTokens: 92, durationMs: 2150, evalDurationMs: 1840 }
        }
      ]
    },
    {
      id: 102,
      title: 'New chat',
      model: 'gpt-oss:latest',
      created_at: iso(-5 * 60 * 1000),
      updated_at: iso(-5 * 60 * 1000),
      pinned: false,
      embeddings: [0.05, 0.05, 0.05, 0.99],
      messages: []
    },
    {
      id: 103,
      title: '💻 TypeScript Calculator',
      model: 'gpt-oss:latest',
      created_at: iso(-40 * 60 * 1000),
      updated_at: iso(-38 * 60 * 1000),
      pinned: false,
      embeddings: [0.05, 0.05, 0.99, 0.05],
      messages: [
        { role: 'user', content: 'Write a small TypeScript Calculator class with division-by-zero checks and a usage example.' },
        {
          role: 'assistant',
          content: `Here is a concise \`Calculator\` class with basic arithmetic and a guard for division by zero:

\`\`\`typescript
export class Calculator {
  add(a: number, b: number): number {
    return a + b
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new RangeError('Division by zero')
    }
    return a / b
  }
}
\`\`\`

You can import and use it like this:

\`\`\`typescript
import { Calculator } from './calculator.js'

const calc = new Calculator()
console.log(calc.add(5, 3))      // 8
console.log(calc.divide(10, 2))  // 5
\`\`\`

All methods are stateless, so a single instance can be reused safely.`,
          stats: { model: 'gpt-oss:latest', promptTokens: 318, outputTokens: 246, durationMs: 4280, evalDurationMs: 3910 }
        }
      ]
    },
    {
      id: 104,
      title: '🔍 Wayland Portals Guide',
      model: 'gpt-oss:latest',
      created_at: iso(-90 * 60 * 1000),
      updated_at: iso(-88 * 60 * 1000),
      pinned: false,
      embeddings: [0.05, 0.99, 0.05, 0.05],
      messages: [
        { role: 'user', content: 'How does GTK 4 interact with XDG Desktop Portals inside Flatpak?' },
        {
          role: 'assistant',
          content: `When a GTK 4 app runs inside Flatpak, system dialogs automatically route through **XDG Desktop Portals** over D-Bus instead of accessing host resources directly.

### Why portals matter

- A **portal** runs outside the sandbox and renders a trusted native dialog for files, screenshots, or URI opening.
- The app only receives the exact file descriptor or token approved by the user, so the portal never exposes the entire home directory.

### Using GTK 4 file dialogs

\`Gtk.FileDialog\` talks to the file chooser **portal** transparently when sandboxed:

\`\`\`typescript
const dialog = new Gtk.FileDialog({
  title: 'Select Folder to Index',
  accept_label: 'Select'
})
// Routes through org.freedesktop.portal.FileChooser under Flatpak
dialog.select_folder(window, null, onFolderSelected)
\`\`\`

Because GTK handles **portal** detection automatically, the same code works on native GNOME installs and inside Flatpak.`,
          stats: { model: 'gpt-oss:latest', promptTokens: 245, outputTokens: 198, durationMs: 3640, evalDurationMs: 3300 }
        }
      ]
    },
    {
      id: 105,
      title: '🤖 Sub-agent Code Review',
      model: 'gpt-oss:latest',
      created_at: iso(-2 * 60 * 60 * 1000),
      updated_at: iso(-2 * 60 * 60 * 1000),
      pinned: false,
      embeddings: [0.05, 0.05, 0.99, 0.05],
      messages: [
        { role: 'user', content: 'Review src/lib/transfer.ts for edge cases during JSON import merge, and summarize what matters.' },
        {
          role: 'assistant',
          thinking: 'This is a focused code review task. Delegating it to the Reviewer skill keeps the raw file reads out of the main conversation context.',
          content: '',
          tool_calls: [
            {
              id: 'call_sub_1',
              function: {
                index: 0,
                name: 'run_skill',
                arguments: {
                  skill: 'Reviewer',
                  task: 'Inspect src/lib/transfer.ts for merge edge cases: duplicates, pinned state, and active generations.'
                }
              }
            }
          ]
        },
        {
          role: 'tool',
          tool_name: 'run_skill',
          content: 'Reviewed src/lib/transfer.ts:\n1. Duplicate prevention: conversations are matched by (id, created_at) so re-importing the same archive is idempotent.\n2. Pinned state: merges with logical OR so a pin on either side is preserved.\n3. Active generations: conversations currently streaming are skipped cleanly.\n4. Legacy exports: single-chat JSON exports from older versions are normalized before merging.'
        },
        {
          role: 'assistant',
          content: `The **Reviewer** sub-agent checked \`src/lib/transfer.ts\` and found no data-loss paths:

- **Duplicate safety** — chats match on \`id\` and \`created_at\`.
- **Pinned & in-flight safety** — pins merge with OR, and active generations are skipped.`,
          stats: { model: 'gpt-oss:latest', promptTokens: 412, outputTokens: 124, durationMs: 3120, evalDurationMs: 2680 }
        }
      ]
    },
    {
      id: 106,
      title: '🌐 Wayland Research',
      model: 'gpt-oss:latest',
      created_at: iso(-3 * 60 * 60 * 1000),
      updated_at: iso(-3 * 60 * 60 * 1000),
      pinned: false,
      embeddings: [0.05, 0.99, 0.05, 0.05],
      messages: [
        {
          role: 'user',
          content: '/deepsearch How do XDG Desktop Portals work on Wayland?',
          command: '/deepsearch How do XDG Desktop Portals work on Wayland?'
        },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'ds_1',
              function: {
                index: 0,
                name: 'fetch_web_page',
                arguments: { url: 'https://flatpak.github.io/xdg-desktop-portal/docs/architecture.html' }
              }
            },
            {
              id: 'ds_2',
              function: {
                index: 1,
                name: 'fetch_web_page',
                arguments: { url: 'https://docs.gtk.org/gtk4/class.FileDialog.html' }
              }
            },
            {
              id: 'ds_3',
              function: {
                index: 2,
                name: 'fetch_web_page',
                arguments: { url: 'https://wayland.freedesktop.org/docs/html/ch04.html' }
              }
            },
            {
              id: 'ds_4',
              function: {
                index: 3,
                name: 'fetch_web_page',
                arguments: { url: 'https://en.wikipedia.org/wiki/Flatpak' }
              }
            }
          ]
        },
        {
          role: 'tool',
          tool_name: 'fetch_web_page',
          content: 'XDG Desktop Portal architecture: frontend D-Bus service delegating UI to desktop backends such as xdg-desktop-portal-gnome.'
        },
        {
          role: 'tool',
          tool_name: 'fetch_web_page',
          content: 'Gtk.FileDialog automatically uses the XDG FileChooser portal inside sandboxed applications.'
        },
        {
          role: 'tool',
          tool_name: 'fetch_web_page',
          content: 'Wayland isolates clients by design so no client can inspect other windows or synthesize input without compositor cooperation.'
        },
        {
          role: 'tool',
          tool_name: 'fetch_web_page',
          content: 'Flatpak uses portals to grant fine-grained, user-approved access to files, screenshots, and system services.'
        },
        {
          role: 'assistant',
          content: `**XDG Desktop Portals** provide a controlled bridge between sandboxed apps and the Wayland desktop without loosening compositor isolation [1][3].

### How the request flow works
- **Frontend service**: Apps call stable D-Bus interfaces on \`org.freedesktop.portal.Desktop\` instead of poking the filesystem or display server directly [1].
- **Desktop backend**: On GNOME, \`xdg-desktop-portal-gnome\` renders native dialogs for files, screenshots, and screencasts and asks the user for consent [1][4].
- **Toolkit integration**: GTK 4 widgets such as \`Gtk.FileDialog\` invoke the corresponding portal automatically when running under Flatpak [2].

This keeps Wayland's client isolation intact while still giving desktop apps clean, native system dialogs [3][4].`,
          stats: { model: 'gpt-oss:latest', promptTokens: 1620, outputTokens: 215, durationMs: 5840, evalDurationMs: 4120 }
        }
      ]
    },
    {
      id: 107,
      title: '🧮 Interactive Calculator',
      model: 'gpt-oss:latest',
      created_at: iso(-4 * 60 * 60 * 1000),
      updated_at: iso(-4 * 60 * 60 * 1000),
      pinned: false,
      embeddings: [0.05, 0.05, 0.99, 0.05],
      messages: [
        { role: 'user', content: '@Canvas Build a clean GNOME-styled calculator.' },
        {
          role: 'assistant',
          thinking: 'Build a responsive single-file HTML/CSS calculator that adapts to GNOME dark and light schemes and render it with render_html.',
          content: '',
          tool_calls: [
            {
              id: 'canvas_call_1',
              function: {
                index: 0,
                name: 'render_html',
                arguments: {
                  window_title: 'Calculator',
                  html: CALCULATOR_HTML
                }
              }
            }
          ]
        },
        {
          role: 'tool',
          tool_name: 'render_html',
          content: 'Rendered HTML preview in window "Calculator".'
        },
        {
          role: 'assistant',
          content: 'I built an interactive calculator in a native preview window with dark/light theme support. Click **Open preview** in the tool call above to reopen it anytime.',
          stats: { model: 'gpt-oss:latest', promptTokens: 540, outputTokens: 48, durationMs: 2890, evalDurationMs: 1410 }
        }
      ]
    },
    {
      id: 108,
      title: '🌤️ Why the Sky Is Blue',
      model: 'gpt-oss:latest',
      created_at: iso(-1 * day - 2 * 60 * 60 * 1000),
      updated_at: iso(-1 * day - 2 * 60 * 60 * 1000),
      pinned: false,
      embeddings: [0.99, 0.05, 0.05, 0.05],
      messages: [
        { role: 'user', content: 'Why does the sky look blue during the day?' },
        {
          role: 'assistant',
          thinking: 'Explain Rayleigh scattering clearly in two short paragraphs.',
          content: `Sunlight contains every color of the visible spectrum, each with a different wavelength. When it enters Earth's atmosphere, nitrogen and oxygen molecules scatter shorter wavelengths (blue and violet) far more strongly than longer wavelengths (red and orange).

Because our eyes are much more sensitive to blue than violet, that scattered short-wave light dominates the sky during the day — an effect known as **Rayleigh scattering**.`,
          stats: { model: 'gpt-oss:latest', promptTokens: 162, outputTokens: 118, durationMs: 2340, evalDurationMs: 1980 }
        }
      ]
    }
  ]
}
