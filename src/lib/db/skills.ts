import type Gio from 'gi://Gio'

import { DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import { DatabaseError, db } from '@/lib/db/index.js'
import type { Skill } from '@/lib/db/types.js'
import type { ItemStore } from '@/lib/items.js'
import type { Provider } from '@/lib/providers/index.js'
import { skillFromRow, type SkillRow } from '@/lib/skills/index.js'

function nullable(value: string | undefined): string {
  return value ? `'${db.escape(value)}'` : 'NULL'
}

export class SkillsStore implements ItemStore<Skill> {
  public async list(): Promise<Skill[]> {
    const stdout = await db.execSql(`SELECT id, name, description, prompt, enabled, tools, embeddings FROM skills ORDER BY name ASC;`, ['-json'])
    if (!stdout) {
      return []
    }
    try {
      return (JSON.parse(stdout) as SkillRow[]).map(skillFromRow)
    } catch (e) {
      throw new DatabaseError(`Invalid skills data: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  public async save(skill: Skill): Promise<void> {
    await this.saveMany([skill])
  }

  public async saveMany(skills: Skill[]): Promise<void> {
    if (skills.length === 0) {
      return
    }
    await db.execSql(skills.map((s) => {
      const tools = s.tools ? JSON.stringify(s.tools) : undefined
      const embeddings = s.embeddings ? JSON.stringify(s.embeddings) : undefined
      return `INSERT OR REPLACE INTO skills (id, name, description, prompt, enabled, tools, embeddings) VALUES ('${db.escape(s.id)}', '${db.escape(s.name)}', ${nullable(s.description)}, '${db.escape(s.prompt)}', ${s.enabled ? 1 : 0}, ${nullable(tools)}, ${nullable(embeddings)});`
    }))
  }

  public async remove(id: string): Promise<void> {
    await db.execSql(`DELETE FROM skills WHERE id = '${db.escape(id)}';`)
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
