import Gio, { type File } from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'

import { APPLICATION_ID } from '@/lib/constants.js'
import { debounce, type DebouncedFunction } from '@/lib/timeout.js'

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

interface MemoryState {
  saving: boolean
  pending: boolean
  debouncedSave?: DebouncedFunction<() => void>
}

class MemoryManager {
  private file: File
  private graph: KnowledgeGraph | null = null
  private _state: MemoryState = { saving: false, pending: false }

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

  private _save(): void {
    if (!this._state.debouncedSave) {
      this._state.debouncedSave = debounce(() => {
        void this._executeSave()
      }, 500)
    }
    this._state.debouncedSave?.()
  }

  private async _executeSave(): Promise<void> {
    if (!this.graph) {
      return
    }

    if (this._state.saving) {
      this._state.pending = true
      return
    }

    this._state.saving = true
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
    } finally {
      this._state.saving = false
      if (this._state.pending) {
        this._state.pending = false
        void this._executeSave()
      }
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
      this._save()
    }
    return added
  }

  public async createRelations(relations: Relation[]): Promise<Relation[]> {
    if (!Array.isArray(relations)) {
      throw new Error('relations must be an array')
    }
    const graph = await this.load()
    const added: Relation[] = []
    for (const r of relations) {
      if (!r.from || !r.to || !r.relationType) {
        throw new Error('Each relation must have from, to, and relationType strings')
      }
      const exists = graph.relations.some((existing) => {
        return existing.from === r.from && existing.to === r.to && existing.relationType === r.relationType
      }
      )
      if (!exists) {
        graph.relations.push({
          from: r.from,
          to: r.to,
          relationType: r.relationType
        })
        added.push(r)
      }
    }
    if (added.length > 0) {
      this._save()
    }
    return added
  }

  public async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; added: string[] }[]> {
    if (!Array.isArray(observations)) {
      throw new Error('observations must be an array')
    }
    const graph = await this.load()
    const results: { entityName: string; added: string[] }[] = []
    let changed = false
    const notFound: string[] = []

    for (const obs of observations) {
      if (!obs.entityName) {
        throw new Error('Each observation must have an entityName')
      }
      const entity = graph.entities.find((e) => {
        return e.name === obs.entityName
      })
      if (entity) {
        const added: string[] = []
        const contents = Array.isArray(obs.contents) ? obs.contents : []
        for (const content of contents) {
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
        notFound.push(obs.entityName)
      }
    }

    if (changed) {
      this._save()
    }
    if (notFound.length > 0) {
      throw new Error(`Failed to add observations. The following entities were not found: ${notFound.join(', ')}. Create them first using create_entities.`)
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
      this._save()
    }
  }

  public async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    if (!Array.isArray(deletions)) {
      throw new Error('deletions must be an array')
    }
    const graph = await this.load()
    let changed = false
    let notFoundCount = 0

    for (const del of deletions) {
      if (!del.entityName) {
        continue
      }
      const entity = graph.entities.find((e) => {
        return e.name === del.entityName
      })
      if (entity) {
        const initialCount = entity.observations.length
        const toDelete = Array.isArray(del.observations) ? del.observations : []
        entity.observations = entity.observations.filter((obs) => {
          return !toDelete.includes(obs)
        })
        if (entity.observations.length !== initialCount) {
          changed = true
        } else {
          notFoundCount++
        }
      } else {
        notFoundCount++
      }
    }

    if (changed) {
      this._save()
    } else if (notFoundCount > 0) {
      throw new Error('No matching observations found to delete.')
    }
  }

  public async deleteRelations(relations: Relation[]): Promise<void> {
    if (!Array.isArray(relations)) {
      throw new Error('relations must be an array')
    }
    const graph = await this.load()
    const initialCount = graph.relations.length

    graph.relations = graph.relations.filter((existing) => {
      return !relations.some((r) => {
        return r.from === existing.from && r.to === existing.to && r.relationType === existing.relationType
      })
    })

    if (graph.relations.length !== initialCount) {
      this._save()
    } else {
      throw new Error('No matching relations found to delete.')
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
    })
    const matchedEntityNames = new Set(matchedEntities.map((e) => {
      return e.name
    }))

    const matchedRelations = graph.relations.filter((r) => {
      return matchedEntityNames.has(r.from) || matchedEntityNames.has(r.to)
    })

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
