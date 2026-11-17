export const think_types = ['none', 'low', 'medium', 'high'] as const
export type Think = typeof think_types[number]

export const permission_tiers = ['ask', 'auto-accept', 'deny'] as const
export type PermissionTier = typeof permission_tiers[number]

export const permission_categories = ['terminal', 'files', 'reads', 'apps', 'mcp'] as const
export type PermissionCategory = typeof permission_categories[number]

export const mcp_transports = ['stdio', 'http'] as const
export type McpTransportKind = typeof mcp_transports[number]

export const mcp_permissions = ['inherit', ...permission_tiers] as const
export type McpPermission = typeof mcp_permissions[number]

export interface McpServer {
  id: string
  name: string
  enabled: boolean
  transport: McpTransportKind
  command: string
  args: string[]
  env: Record<string, string>
  url: string
  headers: Record<string, string>
  permission: McpPermission
  timeoutSec: number
  disabledTools: string[]
}

export type McpServerState = 'connecting' | 'connected' | 'error'

export interface McpServerStatus {
  state: McpServerState
  error?: string
  toolCount: number
}

export interface SkillTools {
  builtin?: string[]
  mcp?: string[]
}

export interface Skill {
  id: string
  name: string
  description?: string
  prompt: string
  enabled: boolean
  tools?: SkillTools
  embeddings?: number[]
}

export type AgentKind = 'main' | 'sub'

export interface AgentProfile {
  disabledTools: string[]
  disabledServers: string[]
  disabledSkills: string[]
}

export interface Settings {
  url: string
  system: string
  stream: boolean
  think: Think
  theme: number
  syntax: string
  debug: boolean
  options: Record<string, number>
  permissions: Record<PermissionCategory, PermissionTier>
  agents: Record<AgentKind, AgentProfile>
}

export interface Conversation {
  id: number
  title: string
  model: string
  created_at: string
  updated_at?: string
  embeddings?: number[]
  pinned?: boolean
}

export interface PerformanceStats {
  wallTimeMs: number
  apiTimeMs: number
  toolTimeMs: number
  modelUsage: Array<{
    model: string
    requests: number
    inputTokens: number
    outputTokens: number
  }>
}

export interface Entity {
  name: string
  entityType: string
  observations: string[]
}

export interface Relation {
  from: string
  to: string
  relationType: string
}

export interface KnowledgeGraph {
  entities: Entity[]
  relations: Relation[]
}

export interface IndexedPath {
  path: string
  status: 'indexed' | 'indexing' | 'pending'
  chunkCount: number
  fileCount: number
  progress?: number
}

export interface FileChunk {
  file_path: string
  root_path?: string
  content: string
  embedding: number[]
}

export interface SearchResult {
  file_path: string
  root_path: string
  content: string
  score: number
}
