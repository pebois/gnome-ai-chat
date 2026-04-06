import type Gio from 'gi://Gio'

import { DEFAULT_SKILLS } from '@/lib/constants.js'
import { db } from '@/lib/db/index.js'
import type { Skill } from '@/lib/db/types.js'
import type { Ollama } from '@/lib/ollama.js'

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
      const embeddings = s.embeddings ? `'${db.escape(JSON.stringify(s.embeddings))}'` : 'NULL'
      return `('${id}', '${name}', ${desc}, '${prompt}', ${embeddings})`
    })

    const sql = `INSERT INTO skills (id, name, description, prompt, embeddings) VALUES ${values.join(',')};`
    await db.execSql(sql)
  }

  public async indexSkills(ollama: Ollama, skills: Skill[], force: boolean = false, cancellable?: Gio.Cancellable, onProgress?: (fraction: number) => void): Promise<void> {
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
        const response = await ollama.embed({
          model: 'nomic-embed-text',
          input: textContent.slice(0, 8000)
        })
        if (response && response.embeddings && response.embeddings.length > 0) {
          skill.embeddings = response.embeddings[0]
          const embeddingsStr = JSON.stringify(skill.embeddings)
          await db.execSql(`UPDATE skills SET embeddings = '${db.escape(embeddingsStr)}' WHERE id = '${db.escape(skill.id)}';`)
        }
      } catch (err) {
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
