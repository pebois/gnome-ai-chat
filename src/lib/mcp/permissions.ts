import type { AppInterface } from '@/lib/app.js'
import type { McpServer } from '@/lib/db/types.js'
import { formatMcpPermissionBody, formatMcpToolLabel, resolveMcpTier } from '@/lib/mcp/config.js'

export async function checkMcpPermission(
  app: AppInterface,
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
  description?: string
): Promise<string | null> {
  const tier = resolveMcpTier(app.settings, server)
  if (tier === 'deny') {
    return 'Error: denied by user settings.'
  }
  if (tier === 'ask') {
    const summary = description?.trim()
    const body = summary
      ? `${formatMcpPermissionBody(args)}\n\nDescription provided by the server:\n${summary}`
      : formatMcpPermissionBody(args)
    const allowed = await app.requestToolPermission(formatMcpToolLabel(server.name, toolName), body)
    if (!allowed) {
      return 'Error: User denied permission.'
    }
  }
  return null
}
