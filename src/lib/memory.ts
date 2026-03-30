import Gio, { type File } from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { APPLICATION_ID } from '@/lib/constants.js'

Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish')
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish')

export interface Entity {
  name: string
  entityType: string
  observations: string[]
}

export interface Relation {
  from: string
  to: string
  relationType: string
}

export interface KnowledgeGraph {
  entities: Entity[]
  relations: Relation[]
}

class MemoryManager {
  private file: File
  private graph: KnowledgeGraph | null = null

  constructor() {
    const configDir = GLib.build_filenamev([GLib.get_user_data_dir(), APPLICATION_ID])
    this.file = Gio.File.new_for_path(GLib.build_filenamev([configDir, 'memory_graph.json'])) as File
  }

  private async load(): Promise<KnowledgeGraph> {
    if (this.graph) {
      return this.graph
    }

    try {
      if (!this.file.query_exists(null)) {
        this.graph = { entities: [], relations: [] }
        return this.graph
      }
      const [contents] = await this.file.load_contents_async(null)
      if (contents) {
        const decoder = new TextDecoder()
        this.graph = JSON.parse(decoder.decode(contents)) as KnowledgeGraph
        return this.graph
      }
    } catch (err) {
      console.error('Failed to load memory graph:', err)
    }

    this.graph = { entities: [], relations: [] }
    return this.graph
  }

  private async save(): Promise<void> {
    if (!this.graph) {
      return
    }
    try {
      const configDir = GLib.build_filenamev([GLib.get_user_data_dir(), APPLICATION_ID])
      const dir = Gio.File.new_for_path(configDir) as File
      if (!dir.query_exists(null)) {
        dir.make_directory_with_parents(null)
      }

      const encoder = new TextEncoder()
      const bytes = encoder.encode(JSON.stringify(this.graph, null, 2))
      await this.file.replace_contents_bytes_async(
        new GLib.Bytes(bytes),
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      )
    } catch (err) {
      console.error('Failed to save memory graph:', err)
    }
  }

  public async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.load()
    const added: Entity[] = []
    for (const e of entities) {
      if (!graph.entities.some((existing) => {
        return existing.name === e.name
      })) {
        graph.entities.push(e)
        added.push(e)
      }
    }
    if (added.length > 0) {
      await this.save()
    }
    return added
  }

  public async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.load()
    const added: Relation[] = []
    for (const r of relations) {
      const exists = graph.relations.some((existing) => {
        return existing.from === r.from && existing.to === r.to && existing.relationType === r.relationType
      }
      )
      if (!exists) {
        graph.relations.push(r)
        added.push(r)
      }
    }
    if (added.length > 0) {
      await this.save()
    }
    return added
  }

  public async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; added: string[] }[]> {
    const graph = await this.load()
    const results: { entityName: string; added: string[] }[] = []
    let changed = false

    for (const obs of observations) {
      const entity = graph.entities.find((e) => {
        return e.name === obs.entityName
      })
      if (entity) {
        const added: string[] = []
        for (const content of obs.contents) {
          if (!entity.observations.includes(content)) {
            entity.observations.push(content)
            added.push(content)
            changed = true
          }
        }
        if (added.length > 0) {
          results.push({ entityName: obs.entityName, added })
        }
      } else {
        throw new Error(`Entity not found: ${obs.entityName}`)
      }
    }

    if (changed) {
      await this.save()
    }
    return results
  }

  public async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.load()
    const initialEntitiesCount = graph.entities.length
    graph.entities = graph.entities.filter((e) => {
      return !entityNames.includes(e.name)
    })

    if (graph.entities.length !== initialEntitiesCount) {
      graph.relations = graph.relations.filter((r) => {
        return !entityNames.includes(r.from) && !entityNames.includes(r.to)
      })
      await this.save()
    }
  }

  public async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.load()
    let changed = false

    for (const del of deletions) {
      const entity = graph.entities.find((e) => {
        return e.name === del.entityName
      })
      if (entity) {
        const initialCount = entity.observations.length
        entity.observations = entity.observations.filter((obs) => {
          return !del.observations.includes(obs)
        })
        if (entity.observations.length !== initialCount) {
          changed = true
        }
      }
    }

    if (changed) {
      await this.save()
    }
  }

  public async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.load()
    const initialCount = graph.relations.length

    graph.relations = graph.relations.filter((existing) => {
      return !relations.some((r) => {
        return r.from === existing.from && r.to === existing.to && r.relationType === existing.relationType
      })
    })

    if (graph.relations.length !== initialCount) {
      await this.save()
    }
  }

  public async readGraph(): Promise<KnowledgeGraph> {
    return this.load()
  }

  public async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.load()
    const lowerQuery = query.toLowerCase()

    const matchedEntities = graph.entities.filter((e) => {
      return e.name.toLowerCase().includes(lowerQuery)
        || e.entityType.toLowerCase().includes(lowerQuery)
        || e.observations.some((obs) => {
          return obs.toLowerCase().includes(lowerQuery)
        })
    }
    )
    const matchedEntityNames = new Set(matchedEntities.map((e) => {
      return e.name
    }))

    const matchedRelations = graph.relations.filter((r) => {
      return matchedEntityNames.has(r.from) || matchedEntityNames.has(r.to)
    }
    )

    return { entities: matchedEntities, relations: matchedRelations }
  }

  public async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.load()
    const namesSet = new Set(names)

    const matchedEntities = graph.entities.filter((e) => {
      return namesSet.has(e.name)
    })
    const matchedRelations = graph.relations.filter((r) => {
      return namesSet.has(r.from) && namesSet.has(r.to)
    })

    return { entities: matchedEntities, relations: matchedRelations }
  }
}

export const memoryManager = new MemoryManager()
