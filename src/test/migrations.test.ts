import { MIGRATIONS, migrationStatements, parseUserVersion } from '@/lib/db/migrations.js'

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
    expect(migrationStatements(2)).toEqual(['ALTER TABLE messages ADD COLUMN command TEXT;', `PRAGMA user_version = ${MIGRATIONS.length};`])
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
