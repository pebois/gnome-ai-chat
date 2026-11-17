export const MIGRATIONS: string[][] = [
  ['ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;'],
  ['ALTER TABLE messages ADD COLUMN stats TEXT;'],
  ['ALTER TABLE messages ADD COLUMN command TEXT;'],
  [
    'ALTER TABLE skills ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE skills ADD COLUMN tools TEXT;',
    `UPDATE skills SET tools = '{"builtin":["add_observations","create_entities","create_relations","delete_entities","delete_observations","delete_relations","open_nodes","read_graph","search_nodes"]}' WHERE id = 'memory';`,
    `UPDATE skills SET tools = '{"builtin":["list_directory","read_file","search_files","search_vector_index"]}' WHERE id = 'files';`,
    `UPDATE skills SET tools = '{"builtin":["fetch_web_page","read_file","render_html","web_search"]}' WHERE id = 'canvas';`
  ]
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
