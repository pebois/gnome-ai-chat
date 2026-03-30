import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Soup from 'gi://Soup?version=3.0'

import { debug } from '@/lib/debug.js'
import type { StorageSettings, StorageThink } from '@/lib/storage.js'
import type { Tracker } from '@/lib/tracker.js'

Gio._promisify(Soup.Session.prototype, 'send_async', 'send_finish')
Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish')
Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish_utf8')

export interface OllamaChatProps extends OllamaChatRequest {
  onNewResponse?: () => void
  onMessageChunk?: (response: OllamaChatResponse) => void
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<string>
  cancellable: Gio.Cancellable
}

export interface OllamaChatRequest {
  model: string
  system?: string
  stream?: boolean
  think?: StorageThink | true
  options?: Record<string, number>
  messages?: OllamaMessage[]
  tools?: OllamaTool[]
  format?: string | object
  keep_alive?: string | number
  logprobs?: boolean
  top_logprobs?: number
}

export interface OllamaChatResponse {
  model: string
  created_at: string
  message: OllamaMessage
  done: boolean
  done_reason?: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  images?: string[]
  files?: { name: string; content: string }[]
  thinking?: string
  tool_calls?: OllamaToolCall[]
  tool_name?: string
}

export interface OllamaToolCall {
  id: string
  function: {
    index: number
    name: string
    arguments: Record<string, unknown>
  }
}

export interface OllamaTool {
  type: string
  function: {
    name: string
    parameters: object
    description?: string
  }
}

export interface OllamaGenerateRequest {
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

export interface OllamaGenerateResponse {
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

export interface OllamaEmbedRequest {
  model: string
  input: string | string[]
  truncate?: boolean
  options?: Record<string, number>
  keep_alive?: string | number
}

export interface OllamaEmbedResponse {
  model: string
  embeddings: number[][]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
}

export interface OllamaPullRequest {
  model: string
  stream?: boolean
}

export interface OllamaPullProps extends OllamaPullRequest {
  onProgress?: (progress: OllamaPullProgress) => void
  cancellable?: Gio.Cancellable
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
  error?: string
}

export interface OllamaPsResponse {
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

export interface OllamaModelDetails {
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

export class Ollama {
  private _tracker: Tracker
  private _session: Soup.Session
  private _settings: StorageSettings
  public url: string

  constructor(settings: StorageSettings, tracker: Tracker) {
    this.url = settings.url
    this._settings = settings
    this._tracker = tracker
    this._session = new Soup.Session()
  }

  private _debug(msg: string, ...args: unknown[]): void {
    if (this._settings.debug) {
      debug('Ollama', msg, ...args)
    }
  }

  public async version(): Promise<string> {
    const url = `${this.url}/api/version`
    this._debug(`GET ${url}`)
    const msg = Soup.Message.new('GET', url)
    const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const data = bytes.toArray()
      if (data) {
        const response = JSON.parse(decoder.decode(data)) as { version?: string }
        return response.version || ''
      }
    }
    return ''
  }

  public async model(model: string): Promise<OllamaModelDetails | null> {
    const url = `${this.url}/api/show`
    this._debug(`POST ${url}`)
    const body = JSON.stringify({ model })
    const msg = Soup.Message.new('POST', url)
    const encoder = new TextEncoder()
    msg.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(body)))

    const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const data = bytes.toArray()
      if (data) {
        return JSON.parse(decoder.decode(data)) as OllamaModelDetails
      }
    }
    return null
  }

  public async models(): Promise<string[]> {
    const url = `${this.url}/api/tags`
    this._debug(`GET ${url}`)
    const msg = Soup.Message.new('GET', url)
    const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const data = bytes.toArray()
      if (data) {
        const response = JSON.parse(decoder.decode(data)) as { models?: { name: string }[] }
        if (response.models && Array.isArray(response.models)) {
          return response.models.map((m) => {
            return m.name
          })
        }
      }
    }
    return []
  }

  public async checkUpdate(model: string): Promise<boolean> {
    try {
      const url = `${this.url}/api/tags`
      const msg = Soup.Message.new('GET', url)
      const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
      if (msg.get_status() !== Soup.Status.OK || !bytes) {
        return false
      }

      const decoder = new TextDecoder()
      const data = bytes.toArray()
      if (!data) {
        return false
      }

      const response = JSON.parse(decoder.decode(data)) as { models?: { name: string; digest: string }[] }
      const localModel = response.models?.find((m) => {
        return m.name === model
      })
      if (!localModel || !localModel.digest) {
        return false
      }

      let name = model
      let tag = 'latest'
      if (name.includes(':')) {
        const parts = name.split(':')
        name = parts[0]
        tag = parts[1]
      }

      let registryUrl = `https://registry.ollama.ai/v2/library/${name}/manifests/${tag}`
      if (name.includes('/')) {
        registryUrl = `https://registry.ollama.ai/v2/${name}/manifests/${tag}`
      }

      const remoteMsg = Soup.Message.new('HEAD', registryUrl)
      remoteMsg.request_headers.append('Accept', 'application/vnd.docker.distribution.manifest.v2+json')
      await this._session.send_and_read_async(remoteMsg, GLib.PRIORITY_DEFAULT, null)

      if (remoteMsg.get_status() === Soup.Status.OK) {
        const remoteDigest = remoteMsg.response_headers.get_one('Docker-Content-Digest')
        if (remoteDigest && remoteDigest !== localModel.digest) {
          return true
        }
      }
    } catch (err) {
      console.error('Error checking update:', err)
    }
    return false
  }

  public async chat(props: OllamaChatProps): Promise<OllamaMessage[]> {
    const requestMessages: OllamaMessage[] = []
    if (props.system) {
      requestMessages.push({ role: 'system', content: props.system })
    }
    requestMessages.push(...(props.messages || []))
    return this._doChat(props, requestMessages)
  }

  private async _doChat(props: OllamaChatProps, messages: OllamaMessage[]): Promise<OllamaMessage[]> {
    props.onNewResponse?.()
    const message = await this._doChatRequest(props, messages)
    if (!message) {
      return []
    }

    if (!message.tool_calls?.length || !props.onToolCall) {
      return [message]
    }

    const startToolTime = GLib.get_monotonic_time()

    const toolMessages: OllamaMessage[] = await Promise.all(message.tool_calls.map(async (tc) => {
      return {
        role: 'tool',
        tool_name: tc.function.name,
        content: await props.onToolCall?.(tc.function.name, tc.function.arguments) || ''
      }
    }))

    const endToolTime = GLib.get_monotonic_time()
    const toolDurationMs = (endToolTime - startToolTime) / 1000
    this._tracker.recordToolCall(toolDurationMs)

    const next = await this._doChat(props, [...messages, message, ...toolMessages])
    return [message, ...toolMessages, ...next]
  }

  private async _doChatRequest(props: OllamaChatProps, messages: OllamaMessage[]): Promise<OllamaMessage | undefined> {
    try {
      const url = `${this.url}/api/chat`
      this._debug(`POST ${url}`)
      const req = await this._buildChatRequest(props, messages)
      const body = JSON.stringify(req)
      const msg = Soup.Message.new('POST', url)
      const encoder = new TextEncoder()
      msg.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(body)))
      if (props.stream) {
        const inputStream = await this._session.send_async(msg, GLib.PRIORITY_DEFAULT, props.cancellable)
        if (msg.get_status() !== Soup.Status.OK) {
          throw new Error(`Ollama error: ${msg.get_reason_phrase() || msg.get_status()}`)
        }
        const dataStream = new Gio.DataInputStream({ base_stream: inputStream })
        let role: OllamaMessage['role'] = 'assistant'
        let content = ''
        let thinking = ''
        let tool_calls: OllamaToolCall[] = []
        while (true) {
          const [line] = await dataStream.read_line_async(GLib.PRIORITY_DEFAULT, props.cancellable)
          if (line === null) {
            break
          }
          const response = JSON.parse(line.toString()) as OllamaChatResponse
          if (response) {
            if (response.message) {
              role = response.message.role
              if (response.message.content) {
                content += response.message.content
              }
              if (response.message.thinking) {
                thinking += response.message.thinking
              }
              if (response.message.tool_calls) {
                tool_calls = [...tool_calls, ...response.message.tool_calls]
              }
            }
            props.onMessageChunk?.(response)
            if (response.done) {
              this._tracker.recordApiCall(
                props.model,
                response.prompt_eval_count || 0,
                response.eval_count || 0,
                (response.total_duration || 0) / 1000000
              )
              return { role, content, thinking, tool_calls }
            }
          }
        }
      } else {
        const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, props.cancellable)
        if (msg.get_status() !== Soup.Status.OK) {
          throw new Error(`Ollama error: ${msg.get_reason_phrase() || msg.get_status()}`)
        }
        if (bytes) {
          const decoder = new TextDecoder()
          const data = bytes.toArray()
          if (data) {
            const response = JSON.parse(decoder.decode(data)) as OllamaChatResponse
            if (response.message) {
              props.onMessageChunk?.(response)
              if (response.done) {
                this._tracker.recordApiCall(
                  props.model,
                  response.prompt_eval_count || 0,
                  response.eval_count || 0,
                  (response.total_duration || 0) / 1000000
                )
                return response.message
              }
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof GLib.Error && err.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)) {
        return undefined
      }
      throw err
    }
  }

  private async _buildChatRequest(props: OllamaChatProps, messages: OllamaMessage[]): Promise<OllamaChatRequest> {
    const details = await this.model(props.model)
    const capabilities = details?.capabilities || []

    const supportsVision = capabilities.includes('vision')
    const supportsTools = capabilities.includes('tools')
    const supportsThink = capabilities.includes('think')

    const processedMessages = messages.map((msg) => {
      let processed = { ...msg }
      if (!supportsVision && processed.images) {
        const { images: _, ...rest } = processed
        processed = rest
      }
      if (processed.files?.length) {
        const blocks = processed.files.map((f) => {
          return `\`\`\`${f.name}\n${f.content}\n\`\`\``
        })
        const { files: _, ...rest } = processed
        processed = { ...rest, content: blocks.join('\n\n') + '\n\n' + (processed.content || '') }
      }
      return processed
    })

    const req: OllamaChatRequest = {
      model: props.model,
      messages: processedMessages,
      stream: props.stream !== false
    }

    if (props.options) {
      req.options = props.options
    }
    if (supportsThink && props.think !== undefined) {
      if (req.model === 'gpt-oss') {
        req.think = props.think === 'none' ? undefined : props.think
      } else {
        req.think = props.think === 'none' ? undefined : true
      }
    }
    if (supportsTools) {
      if (props.tools) {
        req.tools = props.tools
      }
    }
    if (props.format !== undefined) {
      req.format = props.format
    }
    if (props.keep_alive !== undefined) {
      req.keep_alive = props.keep_alive
    }

    return req
  }

  public async generate(req: OllamaGenerateRequest): Promise<OllamaGenerateResponse | null> {
    const url = `${this.url}/api/generate`
    this._debug(`POST ${url}`)
    const body = JSON.stringify(req)
    const msg = Soup.Message.new('POST', url)
    const encoder = new TextEncoder()
    msg.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(body)))

    const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const data = bytes.toArray()
      if (data) {
        const response = JSON.parse(decoder.decode(data)) as OllamaGenerateResponse
        if (response.done) {
          this._tracker.recordApiCall(
            response.model,
            response.prompt_eval_count || 0,
            response.eval_count || 0,
            (response.total_duration || 0) / 1000000
          )
        }
        return response
      }
    }
    return null
  }

  public async pull(props: OllamaPullProps): Promise<boolean> {
    try {
      const url = `${this.url}/api/pull`
      this._debug(`POST ${url}`)

      const req: OllamaPullRequest = {
        model: props.model,
        stream: props.stream
      }

      const body = JSON.stringify(req)
      const msg = Soup.Message.new('POST', url)
      const encoder = new TextEncoder()
      msg.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(body)))

      if (!props.stream) {
        await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, props.cancellable || null)
        return msg.get_status() === Soup.Status.OK
      }

      const inputStream = await this._session.send_async(msg, GLib.PRIORITY_DEFAULT, props.cancellable || null)
      if (msg.get_status() !== Soup.Status.OK) {
        let errorMsg = msg.get_reason_phrase() || msg.get_status().toString()
        try {
          const errorBytes = await inputStream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, props.cancellable || null)
          if (errorBytes && errorBytes.get_size() > 0) {
            const decoder = new TextDecoder()
            const errorJson = JSON.parse(decoder.decode(errorBytes.toArray() || new Uint8Array())) as { error?: string }
            if (errorJson?.error) {
              errorMsg = errorJson.error
            }
          }
        } catch (_) {
          // ignore error
        }
        throw new Error(`Ollama error: ${errorMsg}`)
      }

      const dataStream = new Gio.DataInputStream({ base_stream: inputStream })

      while (true) {
        const [line] = await dataStream.read_line_async(GLib.PRIORITY_DEFAULT, props.cancellable || null)
        if (line === null) {
          break
        }

        try {
          const progress = JSON.parse(line.toString()) as OllamaPullProgress
          if (progress.error) {
            throw new Error(progress.error)
          }
          if (progress && props.onProgress) {
            props.onProgress(progress)
          }
        } catch (e) {
          if (e instanceof Error && !e.message.includes('JSON')) {
            throw e
          }
          console.error('Failed to parse pull progress line', e)
        }
      }
      return true
    } catch (err) {
      if (err instanceof GLib.Error && err.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)) {
        return false
      }
      throw err
    }
  }

  public async delete(model: string): Promise<boolean> {
    const url = `${this.url}/api/delete`
    this._debug(`DELETE ${url}`)
    const body = JSON.stringify({ model })
    const msg = Soup.Message.new('DELETE', url)
    const encoder = new TextEncoder()
    msg.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(body)))

    await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    return msg.get_status() === Soup.Status.OK
  }

  public async copy(source: string, destination: string): Promise<boolean> {
    const url = `${this.url}/api/copy`
    this._debug(`POST ${url}`)
    const body = JSON.stringify({ source, destination })
    const msg = Soup.Message.new('POST', url)
    const encoder = new TextEncoder()
    msg.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(body)))

    await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    return msg.get_status() === Soup.Status.OK
  }

  public async embed(req: OllamaEmbedRequest): Promise<OllamaEmbedResponse | null> {
    const url = `${this.url}/api/embed`
    this._debug(`POST ${url}`)
    const body = JSON.stringify(req)
    const msg = Soup.Message.new('POST', url)
    const encoder = new TextEncoder()
    msg.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(body)))

    const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const data = bytes.toArray()
      if (data) {
        const response = JSON.parse(decoder.decode(data)) as OllamaEmbedResponse
        this._tracker.recordApiCall(
          response.model,
          response.prompt_eval_count || 0,
          0,
          (response.total_duration || 0) / 1000000
        )
        return response
      }
    }
    return null
  }

  public async ps(): Promise<OllamaPsResponse | null> {
    const url = `${this.url}/api/ps`
    this._debug(`GET ${url}`)
    const msg = Soup.Message.new('GET', url)
    const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const data = bytes.toArray()
      if (data) {
        return JSON.parse(decoder.decode(data)) as OllamaPsResponse
      }
    }
    return null
  }
}
