import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Soup from 'gi://Soup?version=3.0'

import { DEFAULT_TIMEOUT } from '@/lib/constants.js'
import type { Settings } from '@/lib/db/types.js'
import { debug } from '@/lib/debug.js'
import type {
  ChatMessage,
  ChatProps,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  GenerateRequest,
  GenerateResponse,
  MessageStats,
  ModelDetails,
  Provider,
  PsResponse,
  PullProgress,
  PullProps,
  ToolCall
} from '@/lib/providers/index.js'
import { isModelOutdated, registryManifestUrl } from '@/lib/registry.js'
import type { Tracker } from '@/lib/tracker.js'

Gio._promisify(Soup.Session.prototype, 'send_async', 'send_finish')
Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish')
Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish_utf8')

const DEBUG_TRUNCATE_LIMIT = 100

function responseStats(model: string, response: ChatResponse): MessageStats {
  return {
    model,
    promptTokens: response.prompt_eval_count || 0,
    outputTokens: response.eval_count || 0,
    durationMs: (response.total_duration || 0) / 1000000,
    evalDurationMs: (response.eval_duration || 0) / 1000000
  }
}

export class OllamaProvider implements Provider {
  private _tracker: Tracker
  private _session: Soup.Session
  private _settings: Settings
  private _modelCache: Map<string, ModelDetails> = new Map()
  private _url!: string

  public get url(): string {
    return this._url
  }

  public set url(value: string) {
    if (value !== this._url) {
      this._modelCache.clear()
    }
    this._url = value
  }

  constructor(settings: Settings, tracker: Tracker) {
    this.url = settings.url
    this._settings = settings
    this._tracker = tracker
    this._session = new Soup.Session({
      timeout: DEFAULT_TIMEOUT
    })
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

  public async model(model: string): Promise<ModelDetails | null> {
    const cached = this._modelCache.get(model)
    if (cached) {
      return cached
    }

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
        const details = JSON.parse(decoder.decode(data)) as ModelDetails
        this._modelCache.set(model, details)
        return details
      }
    }
    return null
  }

  public clearModelCache(): void {
    this._modelCache.clear()
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
      const localDigest = await this._localDigest(model)
      if (!localDigest) {
        return false
      }
      const remoteDigest = await this._remoteDigest(model)
      return isModelOutdated(localDigest, remoteDigest)
    } catch (err) {
      console.error('Error checking update:', err)
    }
    return false
  }

  private async _localDigest(model: string): Promise<string | null> {
    const url = `${this.url}/api/tags`
    this._debug(`GET ${url}`)
    const msg = Soup.Message.new('GET', url)
    const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() !== Soup.Status.OK || !bytes) {
      return null
    }
    const data = bytes.toArray()
    if (!data) {
      return null
    }
    const decoder = new TextDecoder()
    const response = JSON.parse(decoder.decode(data)) as { models?: { name: string; digest: string }[] }
    const localModel = response.models?.find((m) => {
      return m.name === model
    })
    return localModel?.digest ?? null
  }

  private async _remoteDigest(model: string): Promise<string | null> {
    const url = registryManifestUrl(model)
    this._debug(`HEAD ${url}`)
    const msg = Soup.Message.new('HEAD', url)
    msg.request_headers.append('Accept', 'application/vnd.docker.distribution.manifest.v2+json')
    await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() !== Soup.Status.OK) {
      return null
    }
    return msg.response_headers.get_one('ollama-content-digest') ?? msg.response_headers.get_one('Docker-Content-Digest')
  }

  public async chat(props: ChatProps): Promise<ChatMessage | undefined> {
    const messages = props.messages || []
    return this._doChatRequest(props, messages)
  }

  private async _doChatRequest(props: ChatProps, messages: ChatMessage[]): Promise<ChatMessage | undefined> {
    try {
      const url = `${this.url}/api/chat`
      this._debug(`POST ${url}`)
      const req = await this._buildChatRequest(props, messages)
      const debugMessages = req.messages?.map((m) => {
        const copy = { ...m }
        if (copy.content && copy.content.length > DEBUG_TRUNCATE_LIMIT) {
          copy.content = copy.content.substring(0, DEBUG_TRUNCATE_LIMIT) + `... [truncated ${copy.content.length - DEBUG_TRUNCATE_LIMIT} chars]`
        }
        if (copy.thinking && copy.thinking.length > DEBUG_TRUNCATE_LIMIT) {
          copy.thinking = copy.thinking.substring(0, DEBUG_TRUNCATE_LIMIT) + `... [truncated ${copy.thinking.length - DEBUG_TRUNCATE_LIMIT} chars]`
        }
        if (copy.images && copy.images.length > 0) {
          copy.images = copy.images.map((_, i) => {
            return `[base64 image ${i + 1}]`
          })
        }
        return copy
      })
      this._debug('History', debugMessages)
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
        let role: ChatMessage['role'] = 'assistant'
        let content = ''
        let thinking = ''
        let tool_calls: ToolCall[] = []
        while (true) {
          const [line] = await dataStream.read_line_async(GLib.PRIORITY_DEFAULT, props.cancellable)
          if (line === null) {
            break
          }
          const response = JSON.parse(line.toString()) as ChatResponse
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
              return { role, content, thinking, tool_calls, stats: responseStats(props.model, response) }
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
            const response = JSON.parse(decoder.decode(data)) as ChatResponse
            if (response.message) {
              props.onMessageChunk?.(response)
              if (response.done) {
                this._tracker.recordApiCall(
                  props.model,
                  response.prompt_eval_count || 0,
                  response.eval_count || 0,
                  (response.total_duration || 0) / 1000000
                )
                return { ...response.message, stats: responseStats(props.model, response) }
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

  private async _buildChatRequest(props: ChatProps, messages: ChatMessage[]): Promise<ChatRequest> {
    const details = await this.model(props.model)
    const capabilities = details?.capabilities || []

    const supportsVision = capabilities.includes('vision')
    const supportsTools = capabilities.includes('tools')
    const supportsThink = capabilities.includes('think')

    const processedMessages = messages.map(({ command: _command, stats: _stats, ...msg }) => {
      let processed: ChatMessage = { ...msg }
      if (!supportsVision && processed.images) {
        this._debug(`Model ${props.model} does not support vision, stripping ${processed.images.length} images`)
        const { images: _, ...rest } = processed
        processed = rest
      } else if (supportsVision && processed.images?.length) {
        this._debug(`Model ${props.model} supports vision, sending ${processed.images.length} images`)
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

    const finalMessages = processedMessages.filter((m) => {
      return m.role !== 'system'
    })

    if (props.system) {
      finalMessages.unshift({ role: 'system', content: props.system })
    }

    const req: ChatRequest = {
      model: props.model,
      messages: finalMessages,
      stream: props.stream !== false
    }

    if (props.options) {
      req.options = props.options
    }
    if (supportsThink && props.think !== undefined) {
      const baseModel = req.model.split(':')[0].split('/').pop()
      if (baseModel === 'gpt-oss') {
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

  public async generate(req: GenerateRequest): Promise<GenerateResponse | null> {
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
        const response = JSON.parse(decoder.decode(data)) as GenerateResponse
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

  public async pull(props: PullProps): Promise<boolean> {
    try {
      const url = `${this.url}/api/pull`
      this._debug(`POST ${url}`)

      const req = {
        model: props.model,
        stream: props.stream
      }

      const body = JSON.stringify(req)
      const msg = Soup.Message.new('POST', url)
      const encoder = new TextEncoder()
      msg.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(body)))

      if (!props.stream) {
        await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, props.cancellable || null)
        if (msg.get_status() === Soup.Status.OK) {
          this._modelCache.delete(props.model)
          return true
        }
        return false
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
          const progress = JSON.parse(line) as PullProgress
          if (progress.error) {
            throw new Error(progress.error)
          }
          if (progress && props.onProgress) {
            props.onProgress(progress)
          }
        } catch (e: unknown) {
          if (e instanceof Error && !e.message.includes('JSON')) {
            throw e
          }
          console.error('Failed to parse pull progress line', e)
        }
      }
      this._modelCache.delete(props.model)
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
    this._modelCache.delete(model)
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
    this._modelCache.delete(destination)
    return msg.get_status() === Soup.Status.OK
  }

  public async embed(req: EmbedRequest): Promise<EmbedResponse | null> {
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
        const response = JSON.parse(decoder.decode(data)) as EmbedResponse
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

  public async ps(): Promise<PsResponse | null> {
    const url = `${this.url}/api/ps`
    this._debug(`GET ${url}`)
    const msg = Soup.Message.new('GET', url)
    const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    if (msg.get_status() === Soup.Status.OK && bytes) {
      const decoder = new TextDecoder()
      const data = bytes.toArray()
      if (data) {
        return JSON.parse(decoder.decode(data)) as PsResponse
      }
    }
    return null
  }
}
