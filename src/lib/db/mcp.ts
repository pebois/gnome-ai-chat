import { db } from '@/lib/db/index.js'
import type { McpServer } from '@/lib/db/types.js'
import { normalizeServer } from '@/lib/mcp/config.js'

export class McpStore {
  public async getServers(): Promise<McpServer[]> {
    const stdout = await db.execSql('SELECT id, config FROM mcp_servers ORDER BY rowid ASC;', ['-json'])
    if (!stdout) {
      return []
    }
    try {
      const rows = JSON.parse(stdout) as { id: string; config: string }[]
      return rows.map((r) => {
        return normalizeServer({ ...(JSON.parse(r.config) as Partial<McpServer>), id: r.id })
      })
    } catch (e) {
      console.error('Failed to parse MCP servers:', e)
      return []
    }
  }

  public async saveServer(server: McpServer): Promise<void> {
    const { id, ...config } = server
    await db.execSql(`INSERT OR REPLACE INTO mcp_servers (id, config) VALUES ('${db.escape(id)}', '${db.escape(JSON.stringify(config))}');`)
  }

  public async removeServer(id: string): Promise<void> {
    await db.execSql(`DELETE FROM mcp_servers WHERE id = '${db.escape(id)}';`)
  }
}

export const mcpStore = new McpStore()
