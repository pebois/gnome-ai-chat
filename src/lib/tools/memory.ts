import { memoryStore } from '@/lib/db/memory.js'
import type { Entity, Relation } from '@/lib/db/types.js'
import type { OllamaTool } from '@/lib/ollama.js'

export const create_entities: OllamaTool = {
  type: 'function',
  function: {
    name: 'create_entities',
    description: 'Create multiple new entities in the knowledge graph. Ignores entities with existing names.',
    parameters: {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Entity identifier' },
              entityType: { type: 'string', description: 'Type classification (e.g., person, organization)' },
              observations: { type: 'array', items: { type: 'string' }, description: 'Associated observations' }
            },
            required: ['name', 'entityType', 'observations']
          }
        }
      },
      required: ['entities']
    }
  }
}

export const create_relations: OllamaTool = {
  type: 'function',
  function: {
    name: 'create_relations',
    description: 'Create multiple new relations between entities. Skips duplicate relations.',
    parameters: {
      type: 'object',
      properties: {
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Source entity name' },
              to: { type: 'string', description: 'Target entity name' },
              relationType: { type: 'string', description: 'Relationship type in active voice' }
            },
            required: ['from', 'to', 'relationType']
          }
        }
      },
      required: ['relations']
    }
  }
}

export const add_observations: OllamaTool = {
  type: 'function',
  function: {
    name: 'add_observations',
    description: 'Add new observations to existing entities. Fails if entity does not exist.',
    parameters: {
      type: 'object',
      properties: {
        observations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entityName: { type: 'string', description: 'Target entity' },
              contents: { type: 'array', items: { type: 'string' }, description: 'New observations to add' }
            },
            required: ['entityName', 'contents']
          }
        }
      },
      required: ['observations']
    }
  }
}

export const delete_entities: OllamaTool = {
  type: 'function',
  function: {
    name: 'delete_entities',
    description: 'Remove entities and their relations. Silent operation if entity does not exist.',
    parameters: {
      type: 'object',
      properties: {
        entityNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of entities to delete'
        }
      },
      required: ['entityNames']
    }
  }
}

export const delete_observations: OllamaTool = {
  type: 'function',
  function: {
    name: 'delete_observations',
    description: 'Remove specific observations from entities. Silent operation if observation does not exist.',
    parameters: {
      type: 'object',
      properties: {
        deletions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entityName: { type: 'string', description: 'Target entity' },
              observations: { type: 'array', items: { type: 'string' }, description: 'Observations to remove' }
            },
            required: ['entityName', 'observations']
          }
        }
      },
      required: ['deletions']
    }
  }
}

export const delete_relations: OllamaTool = {
  type: 'function',
  function: {
    name: 'delete_relations',
    description: 'Remove specific relations from the graph. Silent operation if relation does not exist.',
    parameters: {
      type: 'object',
      properties: {
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              relationType: { type: 'string' }
            },
            required: ['from', 'to', 'relationType']
          }
        }
      },
      required: ['relations']
    }
  }
}

export const read_graph: OllamaTool = {
  type: 'function',
  function: {
    name: 'read_graph',
    description: 'Read the entire knowledge graph. Returns complete graph structure with all entities and relations.',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
}

export const search_nodes: OllamaTool = {
  type: 'function',
  function: {
    name: 'search_nodes',
    description: 'Search for nodes based on query across entity names, types, and observation content.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  }
}

export const open_nodes: OllamaTool = {
  type: 'function',
  function: {
    name: 'open_nodes',
    description: 'Retrieve specific nodes by name. Silently skips non-existent nodes.',
    parameters: {
      type: 'object',
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of entities to retrieve'
        }
      },
      required: ['names']
    }
  }
}

export async function handle_create_entities(args: Record<string, unknown>): Promise<string> {
  try {
    const entities = (args.entities as Entity[]) || []
    const added = await memoryStore.createEntities(entities)
    return added.length > 0 ? `Successfully created entities: ${JSON.stringify(added)}` : 'No new entities were created (they may already exist).'
  } catch (err) {
    return `Error creating entities: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_create_relations(args: Record<string, unknown>): Promise<string> {
  try {
    const relations = (args.relations as Relation[]) || []
    const added = await memoryStore.createRelations(relations)
    return added.length > 0 ? `Successfully created relations: ${JSON.stringify(added)}` : 'No new relations were created (they may already exist).'
  } catch (err) {
    return `Error creating relations: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_add_observations(args: Record<string, unknown>): Promise<string> {
  try {
    const observations = (args.observations as { entityName: string; contents: string[] }[]) || []
    const results = await memoryStore.addObservations(observations)
    return results.length > 0 ? `Successfully added observations: ${JSON.stringify(results)}` : 'No new observations were added.'
  } catch (err) {
    return `Error adding observations: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_delete_entities(args: Record<string, unknown>): Promise<string> {
  try {
    const entityNames = (args.entityNames as string[]) || []
    await memoryStore.deleteEntities(entityNames)
    return 'Entities deleted successfully.'
  } catch (err) {
    return `Error deleting entities: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_delete_observations(args: Record<string, unknown>): Promise<string> {
  try {
    const deletions = (args.deletions as { entityName: string; observations: string[] }[]) || []
    await memoryStore.deleteObservations(deletions)
    return 'Observations deleted successfully.'
  } catch (err) {
    return `Error deleting observations: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_delete_relations(args: Record<string, unknown>): Promise<string> {
  try {
    const relations = (args.relations as Relation[]) || []
    await memoryStore.deleteRelations(relations)
    return 'Relations deleted successfully.'
  } catch (err) {
    return `Error deleting relations: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_read_graph(): Promise<string> {
  try {
    const graph = await memoryStore.readGraph()
    return JSON.stringify(graph)
  } catch (err) {
    return `Error reading graph: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_search_nodes(args: Record<string, unknown>): Promise<string> {
  try {
    const query = (args.query as string) || ''
    const result = await memoryStore.searchNodes(query)
    return JSON.stringify(result)
  } catch (err) {
    return `Error searching nodes: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function handle_open_nodes(args: Record<string, unknown>): Promise<string> {
  try {
    const names = (args.names as string[]) || []
    const result = await memoryStore.openNodes(names)
    return JSON.stringify(result)
  } catch (err) {
    return `Error opening nodes: ${err instanceof Error ? err.message : String(err)}`
  }
}
