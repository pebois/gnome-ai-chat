import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { encodeMessage, type JsonRpcMessage, parseMessage } from '@/lib/mcp/jsonrpc.js'
import { errorMessage, isCancelledError, type McpLogger, type McpTransport } from '@/lib/mcp/transport.js'
import { sleep } from '@/lib/timeout.js'

Gio._promisify(Gio.OutputStream.prototype, 'write_all_async', 'write_all_finish')
Gio._promisify(Gio.Subprocess.prototype, 'wait_async', 'wait_finish')

const EXIT_GRACE_MS = 2000

export interface StdioTransportOptions {
  command: string
  args: string[]
  env: Record<string, string>
  log: McpLogger
}

export class StdioTransport implements McpTransport {
  public onMessage: (message: JsonRpcMessage) => void = () => {}
  public onClose: (reason: string) => void = () => {}

  private _options: StdioTransportOptions
  private _process: Gio.Subprocess | null = null
  private _stdin: Gio.OutputStream | null = null
  private _cancellable: Gio.Cancellable | null = null
  private _writeQueue: Promise<void> = Promise.resolve()
  private _exited: Promise<void> = Promise.resolve()
  private _closed = false

  constructor(options: StdioTransportOptions) {
    this._options = options
  }

  public async start(cancellable: Gio.Cancellable): Promise<void> {
    this._cancellable = cancellable
    const launcher = new Gio.SubprocessLauncher({
      flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    })
    const argv = this._buildArgv(launcher)
    try {
      this._process = launcher.spawnv(argv)
    } catch (err) {
      throw new Error(`Cannot start "${this._options.command}": ${errorMessage(err)}`, { cause: err })
    }

    const process = this._process
    this._stdin = process.get_stdin_pipe()
    const stdout = new Gio.DataInputStream({ base_stream: process.get_stdout_pipe()! })
    const stderr = new Gio.DataInputStream({ base_stream: process.get_stderr_pipe()! })

    void this._readLines(stdout, (line) => {
      const message = parseMessage(line)
      if (message) {
        this.onMessage(message)
      } else if (line.trim()) {
        this._options.log(`unparsable stdout: ${line.slice(0, 200)}`)
      }
    })
    void this._readLines(stderr, (line) => {
      this._options.log(`stderr: ${line}`)
    })

    this._exited = process.wait_async(null).then(() => {
      const reason = process.get_if_exited()
        ? `process exited with status ${process.get_exit_status()}`
        : 'process was terminated'
      this._options.log(reason)
      this.onClose(reason)
    }).catch((err: unknown) => {
      this.onClose(`process wait failed: ${errorMessage(err)}`)
    })
    await Promise.resolve()
  }

  public setProtocolVersion(_version: string): void {}

  public listen(): void {}

  public send(message: JsonRpcMessage): Promise<void> {
    const stdin = this._stdin
    if (!stdin || this._closed) {
      return Promise.reject(new Error('MCP server is not running'))
    }
    const bytes = new TextEncoder().encode(encodeMessage(message))
    const write = this._writeQueue.then(async () => {
      await stdin.write_all_async(bytes, GLib.PRIORITY_DEFAULT, this._cancellable)
    })
    this._writeQueue = write.catch(() => {})
    return write
  }

  public async close(): Promise<void> {
    if (this._closed) {
      return
    }
    this._closed = true
    this._cancellable?.cancel()
    const process = this._process
    if (!process) {
      return
    }
    try {
      process.send_signal(15)
    } catch (err) {
      this._options.log(`failed to signal process: ${errorMessage(err)}`)
    }
    const exited = await Promise.race([
      this._exited.then(() => {
        return true
      }),
      sleep(EXIT_GRACE_MS).then(() => {
        return false
      })
    ])
    if (!exited) {
      process.force_exit()
    }
  }

  private _buildArgv(launcher: Gio.SubprocessLauncher): string[] {
    const { args, command, env } = this._options
    if (GLib.getenv('FLATPAK_ID')) {
      const envArgs = Object.entries(env).map(([key, value]) => {
        return `--env=${key}=${value}`
      })
      return ['flatpak-spawn', '--host', ...envArgs, command, ...args]
    }
    for (const [key, value] of Object.entries(env)) {
      launcher.setenv(key, value, true)
    }
    return [command, ...args]
  }

  private _readLine(stream: Gio.DataInputStream): Promise<Uint8Array | null> {
    return new Promise((resolve, reject: (reason: Error) => void) => {
      stream.read_line_async(GLib.PRIORITY_DEFAULT, this._cancellable, (_source, result) => {
        try {
          const [line] = stream.read_line_finish(result)
          resolve(line)
        } catch (err) {
          reject(err as Error)
        }
      })
    })
  }

  private async _readLines(stream: Gio.DataInputStream, onLine: (line: string) => void): Promise<void> {
    const decoder = new TextDecoder()
    try {
      while (true) {
        const line = await this._readLine(stream)
        if (line === null) {
          break
        }
        onLine(decoder.decode(line))
      }
    } catch (err) {
      if (!isCancelledError(err)) {
        this._options.log(`read failed: ${errorMessage(err)}`)
      }
    }
  }
}
