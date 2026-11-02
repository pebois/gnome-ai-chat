import type Gio from 'gi://Gio'

import { DEFAULT_EMBEDDING_MODEL, DEFAULT_SKILLS } from '@/lib/constants.js'
import { DatabaseError, db } from '@/lib/db/index.js'
import type { Skill } from '@/lib/db/types.js'
import type { Provider } from '@/lib/providers/index.js'

export class SkillsStore {
  public async getSkills(): Promise<Skill[]> {
    const stdout = await db.execSql(`SELECT id, name, description, prompt, embeddings FROM skills ORDER BY name ASC;`, ['-json'])
    if (!stdout) {
      return JSON.parse(JSON.stringify(DEFAULT_SKILLS)) as Skill[]
    }
    try {
      const rows = JSON.parse(stdout) as { id: string; name: string; description?: string; prompt: string; embeddings?: string }[]
      if (rows.length === 0) {
        return JSON.parse(JSON.stringify(DEFAULT_SKILLS)) as Skill[]
      }
      return rows.map((r) => {
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          prompt: r.prompt,
          embeddings: r.embeddings ? JSON.parse(r.embeddings) as number[] : undefined
        }
      })
    } catch (e) {
      throw new DatabaseError(`Invalid skills data: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  public async saveSkills(skills: Skill[]): Promise<void> {
    const sqls: string[] = []
    sqls.push(`DELETE FROM skills;`)

    if (skills.length === 0) {
      await db.execSql(sqls)
      return
    }

    const values = skills.map((s) => {
      const id = db.escape(s.id)
      const name = db.escape(s.name)
      const desc = s.description ? `'${db.escape(s.description)}'` : 'NULL'
      const prompt = db.escape(s.prompt)
      const embeddings = s.embeddings ? `'${db.escape(JSON.stringify(s.embeddings))}'` : 'NULL'
      return `('${id}', '${name}', ${desc}, '${prompt}', ${embeddings})`
    })

    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500)
      sqls.push(`INSERT INTO skills (id, name, description, prompt, embeddings) VALUES ${chunk.join(',')};`)
    }

    await db.execSql(sqls)
  }

  public async indexSkills(provider: Provider, skills: Skill[], force: boolean = false, cancellable?: Gio.Cancellable, onProgress?: (fraction: number) => void): Promise<void> {
    const total = skills.length
    if (total === 0) {
      return
    }

    let processed = 0
    for (const skill of skills) {
      if (cancellable?.is_cancelled()) {
        break
      }

      if (!force && skill.embeddings) {
        processed++
        if (onProgress) {
          onProgress(processed / total)
        }
        continue
      }

      const textContent = `${skill.name}\n${skill.description || ''}\n${skill.prompt}`
      try {
        const response = await provider.embed({
          model: DEFAULT_EMBEDDING_MODEL,
          input: textContent.slice(0, 8000)
        })
        if (response && response.embeddings && response.embeddings.length > 0) {
          skill.embeddings = response.embeddings[0]
          const embeddingsStr = JSON.stringify(skill.embeddings)
          await db.execSql(`UPDATE skills SET embeddings = '${db.escape(embeddingsStr)}' WHERE id = '${db.escape(skill.id)}';`)
        }
      } catch (err: unknown) {
        console.error(`Failed to index skill ${skill.id}:`, err)
      }

      processed++
      if (onProgress) {
        onProgress(processed / total)
      }
    }
  }
}

export const skillsStore = new SkillsStore()
