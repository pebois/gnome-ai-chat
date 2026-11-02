import Gio from 'gi://Gio'

import type { Think } from '@/lib/db/types.js'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  images?: string[]
  files?: { name: string; content: string }[]
  thinking?: string
  tool_calls?: ToolCall[]
  tool_name?: string
  stats?: MessageStats
}

export interface MessageStats {
  model: string
  promptTokens: number
  outputTokens: number
  durationMs: number
  evalDurationMs: number
}

export interface ToolCall {
  id: string
  function: {
    index: number
    name: string
    arguments: Record<string, unknown>
  }
}

export interface Tool {
  type: string
  function: {
    name: string
    parameters: object
    description?: string
  }
}

export interface ChatRequest {
  model: string
  system?: string
  stream?: boolean
  think?: Think | true
  options?: Record<string, number>
  messages?: ChatMessage[]
  tools?: Tool[]
  format?: string | object
  keep_alive?: string | number
  logprobs?: boolean
  top_logprobs?: number
}

export interface ChatResponse {
  model: string
  created_at: string
  message: ChatMessage
  done: boolean
  done_reason?: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface GenerateRequest {
  model: string
  prompt: string
  system?: string
  template?: string
  context?: number[]
  stream?: boolean
  raw?: boolean
  format?: string | object
  options?: Record<string, number>
  keep_alive?: string | number
}

export interface GenerateResponse {
  model: string
  created_at: string
  response: string
  done: boolean
  context?: number[]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface EmbedRequest {
  model: string
  input: string | string[]
  truncate?: boolean
  options?: Record<string, number>
  keep_alive?: string | number
}

export interface EmbedResponse {
  model: string
  embeddings: number[][]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
}

export interface ModelDetails {
  parameters: string
  license: string
  capabilities: string[]
  modified_at: string
  details: {
    parent_model: string
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
  model_info: Record<string, unknown>
}

export interface PullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
  error?: string
}

export interface PsResponse {
  models: {
    name: string
    model: string
    size: number
    digest: string
    details: Record<string, unknown>
    expires_at: string
    size_vram: number
  }[]
}

export interface ChatProps extends ChatRequest {
  onMessageChunk?: (response: ChatResponse) => void
  cancellable: Gio.Cancellable
  skill?: { name: string; description?: string; prompt: string }
}

export interface PullProps {
  model: string
  stream?: boolean
  onProgress?: (progress: PullProgress) => void
  cancellable?: Gio.Cancellable
}

export interface Provider {
  url: string
  version(): Promise<string>
  models(): Promise<string[]>
  model(name: string): Promise<ModelDetails | null>
  clearModelCache(): void
  chat(props: ChatProps): Promise<ChatMessage | undefined>
  generate(req: GenerateRequest): Promise<GenerateResponse | null>
  embed(req: EmbedRequest): Promise<EmbedResponse | null>
  checkUpdate(model: string): Promise<boolean>
  pull(props: PullProps): Promise<boolean>
  delete(model: string): Promise<boolean>
  copy(source: string, destination: string): Promise<boolean>
  ps(): Promise<PsResponse | null>
}
