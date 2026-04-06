import { db } from '@/lib/db/index.js'
import type { Entity, KnowledgeGraph, Relation } from '@/lib/db/types.js'

class MemoryStore {
  public async createEntities(entities: Entity[]): Promise<Entity[]> {
    const added: Entity[] = []
    for (const e of entities) {
      const exists = await db.execSql(`SELECT 1 FROM memory_entities WHERE name = '${db.escape(e.name)}' LIMIT 1;`)
      if (!exists) {
        await db.execSql(`INSERT INTO memory_entities (name, entityType) VALUES ('${db.escape(e.name)}', '${db.escape(e.entityType)}');`)
        added.push(e)
      }
    }
    return added
  }

  public async createRelations(relations: Relation[]): Promise<Relation[]> {
    if (!Array.isArray(relations)) {
      throw new Error('relations must be an array')
    }
    const added: Relation[] = []
    for (const r of relations) {
      if (!r.from || !r.to || !r.relationType) {
        throw new Error('Each relation must have from, to, and relationType strings')
      }
      const source = db.escape(r.from)
      const target = db.escape(r.to)
      const type = db.escape(r.relationType)
      const exists = await db.execSql(`SELECT 1 FROM memory_relations WHERE source = '${source}' AND target = '${target}' AND relationType = '${type}' LIMIT 1;`)
      if (!exists) {
        await db.execSql(`INSERT INTO memory_relations (source, target, relationType) VALUES ('${source}', '${target}', '${type}');`)
        added.push(r)
      }
    }
    return added
  }

  public async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; added: string[] }[]> {
    if (!Array.isArray(observations)) {
      throw new Error('observations must be an array')
    }
    const results: { entityName: string; added: string[] }[] = []
    const notFound: string[] = []

    for (const obs of observations) {
      if (!obs.entityName) {
        throw new Error('Each observation must have an entityName')
      }
      const name = db.escape(obs.entityName)
      const exists = await db.execSql(`SELECT 1 FROM memory_entities WHERE name = '${name}' LIMIT 1;`)
      if (exists) {
        const added: string[] = []
        const contents = Array.isArray(obs.contents) ? obs.contents : []
        for (const content of contents) {
          const contentEscaped = db.escape(content)
          const obsExists = await db.execSql(`SELECT 1 FROM memory_observations WHERE entityName = '${name}' AND content = '${contentEscaped}' LIMIT 1;`)
          if (!obsExists) {
            await db.execSql(`INSERT INTO memory_observations (entityName, content) VALUES ('${name}', '${contentEscaped}');`)
            added.push(content)
          }
        }
        if (added.length > 0) {
          results.push({ entityName: obs.entityName, added })
        }
      } else {
        notFound.push(obs.entityName)
      }
    }

    if (notFound.length > 0) {
      throw new Error(`Failed to add observations. The following entities were not found: ${notFound.join(', ')}. Create them first.`)
    }
    return results
  }

  public async deleteEntities(entityNames: string[]): Promise<void> {
    if (entityNames.length === 0) {
      return
    }
    const names = entityNames.map((n) => {
      return `'${db.escape(n)}'`
    }).join(',')
    await db.execSql(`DELETE FROM memory_entities WHERE name IN (${names});`)
    // ON DELETE CASCADE handles observations.
    await db.execSql(`DELETE FROM memory_relations WHERE source IN (${names}) OR target IN (${names});`)
  }

  public async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    if (!Array.isArray(deletions)) {
      throw new Error('deletions must be an array')
    }
    let deletedCount = 0
    for (const del of deletions) {
      if (!del.entityName || !Array.isArray(del.observations)) {
        continue
      }
      const name = db.escape(del.entityName)
      const contents = del.observations.map((c) => {
        return `'${db.escape(c)}'`
      }).join(',')
      if (contents.length > 0) {
        const stdout = await db.execSql(`DELETE FROM memory_observations WHERE entityName = '${name}' AND content IN (${contents}) RETURNING id;`)
        if (stdout) {
          deletedCount++
        }
      }
    }
    if (deletedCount === 0) {
      throw new Error('No matching observations found to delete.')
    }
  }

  public async deleteRelations(relations: Relation[]): Promise<void> {
    if (!Array.isArray(relations)) {
      throw new Error('relations must be an array')
    }
    let deletedCount = 0
    for (const r of relations) {
      const source = db.escape(r.from)
      const target = db.escape(r.to)
      const type = db.escape(r.relationType)
      const stdout = await db.execSql(`DELETE FROM memory_relations WHERE source = '${source}' AND target = '${target}' AND relationType = '${type}' RETURNING id;`)
      if (stdout) {
        deletedCount++
      }
    }
    if (deletedCount === 0) {
      throw new Error('No matching relations found to delete.')
    }
  }

  public async readGraph(): Promise<KnowledgeGraph> {
    const [entitiesStdout, relationsStdout, obsStdout] = await Promise.all([
      db.execSql(`SELECT name, entityType FROM memory_entities;`, ['-json']),
      db.execSql(`SELECT source as 'from', target as 'to', relationType FROM memory_relations;`, ['-json']),
      db.execSql(`SELECT entityName, content FROM memory_observations;`, ['-json'])
    ])

    const entities: Record<string, Entity> = {}
    if (entitiesStdout) {
      const rows = JSON.parse(entitiesStdout) as { name: string; entityType: string }[]
      for (const r of rows) {
        entities[r.name] = { name: r.name, entityType: r.entityType, observations: [] }
      }
    }

    if (obsStdout) {
      const rows = JSON.parse(obsStdout) as { entityName: string; content: string }[]
      for (const r of rows) {
        if (entities[r.entityName]) {
          entities[r.entityName].observations.push(r.content)
        }
      }
    }

    const relations: Relation[] = relationsStdout ? JSON.parse(relationsStdout) as Relation[] : []

    return { entities: Object.values(entities), relations }
  }

  public async searchNodes(query: string): Promise<KnowledgeGraph> {
    const lowerQuery = query.toLowerCase()

    // Standard text match on entities
    const queryEscaped = db.escape(lowerQuery)
    const entitiesStdout = await db.execSql(`SELECT name, entityType FROM memory_entities WHERE LOWER(name) LIKE '%${queryEscaped}%' OR LOWER(entityType) LIKE '%${queryEscaped}%';`, ['-json'])

    const matchedNames = new Set<string>()
    if (entitiesStdout) {
      const rows = JSON.parse(entitiesStdout) as { name: string }[]
      for (const r of rows) {
        matchedNames.add(r.name)
      }
    }

    const obsStdout = await db.execSql(`SELECT entityName, content FROM memory_observations;`, ['-json'])

    if (obsStdout) {
      const rows = JSON.parse(obsStdout) as { entityName: string; content: string }[]
      for (const r of rows) {
        if (r.content.toLowerCase().includes(lowerQuery)) {
          matchedNames.add(r.entityName)
        }
      }
    }

    return this.openNodes(Array.from(matchedNames))
  }

  public async openNodes(names: string[]): Promise<KnowledgeGraph> {
    if (names.length === 0) {
      return { entities: [], relations: [] }
    }

    const namesList = names.map((n) => {
      return `'${db.escape(n)}'`
    }).join(',')
    const [entitiesStdout, relationsStdout, obsStdout] = await Promise.all([
      db.execSql(`SELECT name, entityType FROM memory_entities WHERE name IN (${namesList});`, ['-json']),
      db.execSql(`SELECT source as 'from', target as 'to', relationType FROM memory_relations WHERE source IN (${namesList}) AND target IN (${namesList});`, ['-json']),
      db.execSql(`SELECT entityName, content FROM memory_observations WHERE entityName IN (${namesList});`, ['-json'])
    ])

    const entities: Record<string, Entity> = {}
    if (entitiesStdout) {
      const rows = JSON.parse(entitiesStdout) as { name: string; entityType: string }[]
      for (const r of rows) {
        entities[r.name] = { name: r.name, entityType: r.entityType, observations: [] }
      }
    }

    if (obsStdout) {
      const rows = JSON.parse(obsStdout) as { entityName: string; content: string }[]
      for (const r of rows) {
        if (entities[r.entityName]) {
          entities[r.entityName].observations.push(r.content)
        }
      }
    }

    const relations: Relation[] = relationsStdout ? JSON.parse(relationsStdout) as Relation[] : []

    return { entities: Object.values(entities), relations }
  }
}

export const memoryStore = new MemoryStore()
