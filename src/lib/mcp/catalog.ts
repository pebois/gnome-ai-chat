import type { McpServer } from '@/lib/db/types.js'
import { normalizeServer } from '@/lib/mcp/config.js'
import { generateId, uniqueName } from '@/lib/naming.js'

export type McpCatalogCategory = 'replacement' | 'addition'

export interface McpCatalogEntry {
  name: string
  title: string
  description: string
  category: McpCatalogCategory
  transport: 'stdio' | 'http'
  command?: string
  args?: (home: string) => string[]
  url?: string
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    name: 'memory',
    title: 'Memory',
    description: 'Knowledge graph memory, same tools as the built-in memory (official)',
    category: 'replacement',
    transport: 'stdio',
    command: 'npx',
    args: () => {
      return ['-y', '@modelcontextprotocol/server-memory']
    }
  },
  {
    name: 'filesystem',
    title: 'Filesystem',
    description: 'Read, write, edit and search files in your home folder (official)',
    category: 'replacement',
    transport: 'stdio',
    command: 'npx',
    args: (home) => {
      return ['-y', '@modelcontextprotocol/server-filesystem', home]
    }
  },
  {
    name: 'fetch',
    title: 'Fetch',
    description: 'Fetch web pages as Markdown or plain text (community)',
    category: 'replacement',
    transport: 'stdio',
    command: 'npx',
    args: () => {
      return ['-y', 'mcp-fetch-server']
    }
  },
  {
    name: 'exa',
    title: 'Exa Search',
    description: 'Web search through a real search index, free tier without key',
    category: 'replacement',
    transport: 'http',
    url: 'https://mcp.exa.ai/mcp'
  },
  {
    name: 'desktop-commander',
    title: 'Desktop Commander',
    description: 'Terminal commands, long-running processes and file editing (community)',
    category: 'replacement',
    transport: 'stdio',
    command: 'npx',
    args: () => {
      return ['-y', '@wonderwhy-er/desktop-commander']
    }
  },
  {
    name: 'deepwiki',
    title: 'DeepWiki',
    description: 'Ask questions about public GitHub repositories',
    category: 'addition',
    transport: 'http',
    url: 'https://mcp.deepwiki.com/mcp'
  },
  {
    name: 'context7',
    title: 'Context7',
    description: 'Up-to-date documentation and code examples for libraries',
    category: 'addition',
    transport: 'http',
    url: 'https://mcp.context7.com/mcp'
  },
  {
    name: 'mslearn',
    title: 'Microsoft Learn',
    description: 'Search and read the official Microsoft documentation',
    category: 'addition',
    transport: 'http',
    url: 'https://learn.microsoft.com/api/mcp'
  },
  {
    name: 'sequential-thinking',
    title: 'Sequential Thinking',
    description: 'Step-by-step reasoning scratchpad for complex problems (official)',
    category: 'addition',
    transport: 'stdio',
    command: 'npx',
    args: () => {
      return ['-y', '@modelcontextprotocol/server-sequential-thinking']
    }
  },
  {
    name: 'git',
    title: 'Git',
    description: 'Status, log, diff and commits in local repositories (community)',
    category: 'addition',
    transport: 'stdio',
    command: 'npx',
    args: () => {
      return ['-y', '@cyanheads/git-mcp-server']
    }
  },
  {
    name: 'everything',
    title: 'Everything',
    description: 'Reference server exercising every MCP feature, for testing (official)',
    category: 'addition',
    transport: 'stdio',
    command: 'npx',
    args: () => {
      return ['-y', '@modelcontextprotocol/server-everything']
    }
  }
]

export function catalogEntrySubtitle(entry: McpCatalogEntry, home: string): string {
  if (entry.transport === 'http') {
    return entry.url ?? ''
  }
  return [entry.command ?? '', ...(entry.args?.(home) ?? [])].join(' ')
}

export function createServerFromCatalog(entry: McpCatalogEntry, existingNames: string[], home: string): McpServer {
  return normalizeServer({
    id: generateId(),
    name: uniqueName(entry.name, existingNames),
    enabled: false,
    transport: entry.transport,
    command: entry.command ?? '',
    args: entry.args?.(home) ?? [],
    url: entry.url ?? ''
  })
}
