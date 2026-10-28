import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import type { JsonRpcMessage } from '@/lib/mcp/jsonrpc.js'

export interface McpTransport {
  onMessage: (message: JsonRpcMessage) => void
  onClose: (reason: string) => void
  start(cancellable: Gio.Cancellable): Promise<void>
  send(message: JsonRpcMessage, cancellable?: Gio.Cancellable): Promise<void>
  setProtocolVersion(version: string): void
  listen(): void
  close(): Promise<void>
}

export type McpLogger = (message: string) => void

export function isCancelledError(err: unknown): boolean {
  return err instanceof GLib.Error && err.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  return String(err)
}
