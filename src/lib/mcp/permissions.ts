import type { AppInterface } from '@/lib/app.js'
import { formatMcpPermissionBody, formatMcpToolLabel } from '@/lib/mcp/config.js'
import { checkToolPermission } from '@/lib/tools/permissions.js'

export function checkMcpPermission(
  app: AppInterface,
  name: string,
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  description?: string
): Promise<string | null> {
  const summary = description?.trim()
  const body = summary
    ? `${formatMcpPermissionBody(args)}\n\nDescription provided by the server:\n${summary}`
    : formatMcpPermissionBody(args)
  return checkToolPermission(app, name, formatMcpToolLabel(serverName, toolName), body)
}
