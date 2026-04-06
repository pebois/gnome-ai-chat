import { DEFAULT_SKILLS } from '@/lib/constants.js'
import { db } from '@/lib/db/index.js'
import type { Skill } from '@/lib/db/types.js'

export class SkillsStore {
  public async getSkills(): Promise<Skill[]> {
    const stdout = await db.execSql(`SELECT id, name, description, prompt FROM skills ORDER BY name ASC;`, ['-json'])
    if (!stdout) {
      return JSON.parse(JSON.stringify(DEFAULT_SKILLS)) as Skill[]
    }
    try {
      const rows = JSON.parse(stdout) as Skill[]
      if (rows.length === 0) {
        return JSON.parse(JSON.stringify(DEFAULT_SKILLS)) as Skill[]
      }
      return rows
    } catch (e) {
      console.error('Failed to parse skills:', e)
      return JSON.parse(JSON.stringify(DEFAULT_SKILLS)) as Skill[]
    }
  }

  public async saveSkills(skills: Skill[]): Promise<void> {
    await db.execSql(`DELETE FROM skills;`)
    if (skills.length === 0) {
      return
    }

    const values = skills.map((s) => {
      const id = db.escape(s.id)
      const name = db.escape(s.name)
      const desc = s.description ? `'${db.escape(s.description)}'` : 'NULL'
      const prompt = db.escape(s.prompt)
      return `('${id}', '${name}', ${desc}, '${prompt}')`
    })

    const sql = `INSERT INTO skills (id, name, description, prompt) VALUES ${values.join(',')};`
    await db.execSql(sql)
  }
}

export const skillsStore = new SkillsStore()
