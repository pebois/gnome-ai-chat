import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Soup from 'gi://Soup?version=3.0'

import { MCP_HTTP_MAX_CONNECTIONS, MCP_LISTEN_RETRY_MS, MCP_PROTOCOL_VERSION } from '@/lib/constants.js'
import { type JsonRpcMessage, parseMessage, parseMessages, SseParser } from '@/lib/mcp/jsonrpc.js'
import { errorMessage, isCancelledError, type McpLogger, type McpTransport } from '@/lib/mcp/transport.js'
import { sleep } from '@/lib/timeout.js'

Gio._promisify(Soup.Session.prototype, 'send_async', 'send_finish')
Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish')
Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish_utf8')
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish')
Gio._promisify(Gio.InputStream.prototype, 'close_async', 'close_finish')

const READ_CHUNK_SIZE = 65536
const SESSION_HEADER = 'Mcp-Session-Id'

export interface HttpTransportOptions {
  url: string
  headers: Record<string, string>
  log: McpLogger
}

export class HttpTransport implements McpTransport {
  public onMessage: (message: JsonRpcMessage) => void = () => {}
  public onClose: (reason: string) => void = () => {}

  private _options: HttpTransportOptions
  private _session: Soup.Session
  private _sessionId: string | null = null
  private _protocolVersion = MCP_PROTOCOL_VERSION
  private _cancellable: Gio.Cancellable | null = null
  private _closed = false
  private _lost = false

  constructor(options: HttpTransportOptions) {
    this._options = options
    this._session = new Soup.Session({ timeout: 0, max_conns_per_host: MCP_HTTP_MAX_CONNECTIONS })
  }

  public start(cancellable: Gio.Cancellable): Promise<void> {
    this._cancellable = cancellable
    return Promise.resolve()
  }

  public setProtocolVersion(version: string): void {
    this._protocolVersion = version
  }

  public listen(): void {
    void this._listen()
  }

  public async send(message: JsonRpcMessage, cancellable?: Gio.Cancellable): Promise<void> {
    if (this._closed || this._lost) {
      throw new Error('MCP connection is closed')
    }
    const requestCancellable = cancellable ?? this._cancellable
    const msg = this._createMessage('POST')
    msg.request_headers.replace('Accept', 'application/json, text/event-stream')
    msg.set_request_body_from_bytes('application/json', new GLib.Bytes(new TextEncoder().encode(JSON.stringify(message))))

    const stream = await this._open(msg, requestCancellable)
    const status = msg.get_status()
    const sessionId = msg.response_headers.get_one(SESSION_HEADER)
    if (sessionId) {
      this._sessionId = sessionId
    }

    if (status === Soup.Status.ACCEPTED || status === Soup.Status.NO_CONTENT) {
      await this._closeStream(stream)
      return
    }
    if (status === Soup.Status.NOT_FOUND && this._sessionId) {
      await this._closeStream(stream)
      this._sessionId = null
      this._connectionLost('session expired')
      throw new Error('MCP session expired')
    }
    if (status < 200 || status >= 300) {
      await this._closeStream(stream)
      throw new Error(`HTTP ${status} ${msg.get_reason_phrase() ?? ''}`.trim())
    }

    const [contentType] = msg.response_headers.get_content_type()
    if (contentType === 'text/event-stream') {
      void this._readEvents(stream, requestCancellable)
      return
    }
    const body = await this._readAll(stream, requestCancellable)
    for (const parsed of parseMessages(body)) {
      this.onMessage(parsed)
    }
  }

  public async close(): Promise<void> {
    if (this._closed) {
      return
    }
    this._closed = true
    this._cancellable?.cancel()
    if (!this._sessionId) {
      return
    }
    try {
      const msg = this._createMessage('DELETE')
      await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null)
    } catch (err) {
      this._options.log(`session delete failed: ${errorMessage(err)}`)
    }
  }

  private async _open(msg: Soup.Message, cancellable: Gio.Cancellable | null): Promise<Gio.InputStream> {
    try {
      return await this._session.send_async(msg, GLib.PRIORITY_DEFAULT, cancellable)
    } catch (err) {
      if (!isCancelledError(err)) {
        this._connectionLost(errorMessage(err))
      }
      throw err
    }
  }

  private _connectionLost(reason: string): void {
    if (this._closed || this._lost) {
      return
    }
    this._lost = true
    this._options.log(`connection lost: ${reason}`)
    this.onClose(reason)
  }

  private async _listen(): Promise<void> {
    while (!this._closed && !this._lost) {
      const msg = this._createMessage('GET')
      msg.request_headers.replace('Accept', 'text/event-stream')
      let stream: Gio.InputStream
      try {
        stream = await this._open(msg, this._cancellable)
      } catch {
        return
      }
      const status = msg.get_status()
      const [contentType] = msg.response_headers.get_content_type()
      if (status === Soup.Status.NOT_FOUND && this._sessionId) {
        await this._closeStream(stream)
        this._connectionLost('session expired')
        return
      }
      if (status !== Soup.Status.OK || contentType !== 'text/event-stream') {
        await this._closeStream(stream)
        this._options.log(`server event stream unavailable (HTTP ${status})`)
        return
      }
      await this._readEvents(stream, this._cancellable)
      if (!this._closed && !this._lost) {
        await sleep(MCP_LISTEN_RETRY_MS)
      }
    }
  }

  private _createMessage(method: string): Soup.Message {
    const msg = Soup.Message.new(method, this._options.url)
    msg.request_headers.replace('MCP-Protocol-Version', this._protocolVersion)
    for (const [name, value] of Object.entries(this._options.headers)) {
      msg.request_headers.replace(name, value)
    }
    if (this._sessionId) {
      msg.request_headers.replace(SESSION_HEADER, this._sessionId)
    }
    return msg
  }

  private async _closeStream(stream: Gio.InputStream): Promise<void> {
    try {
      await stream.close_async(GLib.PRIORITY_DEFAULT, null)
    } catch (err) {
      this._options.log(`stream close failed: ${errorMessage(err)}`)
    }
  }

  private async _readAll(stream: Gio.InputStream, cancellable: Gio.Cancellable | null): Promise<string> {
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const bytes = await stream.read_bytes_async(READ_CHUNK_SIZE, GLib.PRIORITY_DEFAULT, cancellable)
        const data = bytes.toArray()
        if (data.length === 0) {
          break
        }
        chunks.push(data)
        total += data.length
      }
    } finally {
      await this._closeStream(stream)
    }
    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    return new TextDecoder().decode(merged)
  }

  private async _readEvents(stream: Gio.InputStream, cancellable: Gio.Cancellable | null): Promise<void> {
    const dataStream = new Gio.DataInputStream({ base_stream: stream })
    const parser = new SseParser()
    const dispatch = (payloads: string[]): void => {
      for (const payload of payloads) {
        const message = parseMessage(payload)
        if (message) {
          this.onMessage(message)
        }
      }
    }
    try {
      while (true) {
        const [line] = await dataStream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable)
        if (line === null) {
          break
        }
        dispatch(parser.push(`${line.toString()}\n`))
      }
      dispatch(parser.flush())
    } catch (err) {
      if (!isCancelledError(err)) {
        this._options.log(`event stream failed: ${errorMessage(err)}`)
      }
    } finally {
      await this._closeStream(dataStream)
    }
  }
}
