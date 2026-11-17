import { MIGRATIONS, migrationStatements, parseUserVersion } from '@/lib/db/migrations.js'
import { DEFAULT_SKILLS } from '@/lib/skills/index.js'
import { TOOL_GROUPS } from '@/lib/tools/groups.js'

const BUILTIN_TOOL_NAMES = TOOL_GROUPS.flatMap((group) => {
  return group.tools
})

describe('migrationStatements', () => {
  const migrations = [['A;'], ['B;', 'C;']]

  it('runs every migration on a fresh database', () => {
    expect(migrationStatements(0, migrations)).toEqual(['A;', 'B;', 'C;', 'PRAGMA user_version = 2;'])
  })

  it('runs only the pending migrations', () => {
    expect(migrationStatements(1, migrations)).toEqual(['B;', 'C;', 'PRAGMA user_version = 2;'])
  })

  it('does nothing when up to date', () => {
    expect(migrationStatements(2, migrations)).toEqual([])
  })

  it('does nothing for a newer schema', () => {
    expect(migrationStatements(5, migrations)).toEqual([])
  })

  it('targets the latest version by default', () => {
    const sqls = migrationStatements(0)
    expect(sqls[sqls.length - 1]).toBe(`PRAGMA user_version = ${MIGRATIONS.length};`)
  })

  it('adds the message command column', () => {
    expect(migrationStatements(2)[0]).toBe('ALTER TABLE messages ADD COLUMN command TEXT;')
  })

  it('adds the skill enabled and tools columns and backfills built-in tools', () => {
    const sqls = migrationStatements(3)
    expect(sqls.slice(0, 2)).toEqual([
      'ALTER TABLE skills ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;',
      'ALTER TABLE skills ADD COLUMN tools TEXT;'
    ])
    const names = new Set(BUILTIN_TOOL_NAMES)
    for (const skill of DEFAULT_SKILLS.filter((s) => {
      return s.tools
    })) {
      const sql = sqls.find((s) => {
        return s.endsWith(`WHERE id = '${skill.id}';`)
      })
      const json = sql?.match(/SET tools = '(.*)' WHERE/)?.[1] ?? ''
      expect(JSON.parse(json)).toEqual(skill.tools)
      for (const name of skill.tools?.builtin ?? []) {
        expect(names.has(name)).toBe(true)
      }
    }
  })
})

describe('parseUserVersion', () => {
  it('reads the version from sqlite3 json output', () => {
    expect(parseUserVersion('[{"user_version":3}]\n')).toBe(3)
  })

  it('treats empty output as version 0', () => {
    expect(parseUserVersion('')).toBe(0)
  })
})
