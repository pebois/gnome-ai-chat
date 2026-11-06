export const MIGRATIONS: string[][] = [
  ['ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;'],
  ['ALTER TABLE messages ADD COLUMN stats TEXT;'],
  ['ALTER TABLE messages ADD COLUMN command TEXT;']
]

export function migrationStatements(version: number, migrations: string[][] = MIGRATIONS): string[] {
  if (version >= migrations.length) {
    return []
  }
  const sqls = migrations.slice(Math.max(0, version)).flat()
  sqls.push(`PRAGMA user_version = ${migrations.length};`)
  return sqls
}

export function parseUserVersion(stdout: string): number {
  if (!stdout.trim()) {
    return 0
  }
  const rows = JSON.parse(stdout) as { user_version?: number }[]
  return rows[0]?.user_version ?? 0
}
