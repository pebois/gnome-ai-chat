export const think_types = ['none', 'low', 'medium', 'high'] as const
export type Think = typeof think_types[number]

export const permission_tiers = ['ask', 'auto-accept', 'deny'] as const
export type PermissionTier = typeof permission_tiers[number]

export const permission_categories = ['terminal', 'files', 'reads', 'apps'] as const
export type PermissionCategory = typeof permission_categories[number]

export interface Skill {
  id: string
  name: string
  description?: string
  prompt: string
  embeddings?: number[]
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
}

export interface Conversation {
  id: number
  title: string
  model: string
  created_at: string
  updated_at?: string
  embeddings?: number[]
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
