import Gio from 'gi://Gio'

import { DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import { DatabaseError, db } from '@/lib/db/index.js'
import type { Conversation } from '@/lib/db/types.js'
import type { ChatMessage, Provider, ToolCall } from '@/lib/providers/index.js'

interface PersistedRow {
  key: string
  embeddings?: number[]
}

function rowKey(conversation: Conversation): string {
  return JSON.stringify([conversation.title, conversation.model, conversation.created_at, conversation.updated_at ?? null, !!conversation.pinned])
}

export class ConversationsStore {
  private _rows: Map<number, PersistedRow> = new Map()
  private _messages: Map<number, ChatMessage[]> = new Map()
  private _messageWrites: Map<number, Promise<void>> = new Map()

  public async getConversations(): Promise<Conversation[]> {
    const stdout = await db.execSql(`SELECT id, title, model, created_at, updated_at, embeddings, pinned FROM conversations ORDER BY id DESC;`, ['-json'])
    this._rows.clear()
    if (!stdout) {
      return []
    }
    try {
      const rows = JSON.parse(stdout) as { id: number; title: string; model: string; created_at: string; updated_at?: string; embeddings?: string; pinned?: number }[]
      return rows.map((r) => {
        const conversation: Conversation = {
          id: r.id,
          title: r.title,
          model: r.model,
          created_at: r.created_at,
          updated_at: r.updated_at,
          embeddings: r.embeddings ? JSON.parse(r.embeddings) as number[] : undefined,
          pinned: r.pinned === 1
        }
        this._rows.set(conversation.id, { key: rowKey(conversation), embeddings: conversation.embeddings })
        return conversation
      })
    } catch (e) {
      throw new DatabaseError(`Invalid conversations data: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  public async saveConversations(conversations: Conversation[]): Promise<void> {
    const ids = new Set(conversations.map((c) => {
      return c.id
    }))
    const removed = [...this._rows.keys()].filter((id) => {
      return !ids.has(id)
    })
    const changed = conversations.map((c) => {
      return { conversation: c, row: { key: rowKey(c), embeddings: c.embeddings } }
    }).filter(({ conversation, row }) => {
      const previous = this._rows.get(conversation.id)
      return !previous || previous.key !== row.key || previous.embeddings !== row.embeddings
    })

    if (removed.length === 0 && changed.length === 0) {
      return
    }

    const sqls: string[] = []
    if (removed.length > 0) {
      const list = removed.join(',')
      sqls.push(`DELETE FROM messages WHERE conversation_id IN (${list});`)
      sqls.push(`DELETE FROM conversations WHERE id IN (${list});`)
    }

    const values = changed.map(({ conversation: c }) => {
      const title = db.escape(c.title)
      const model = db.escape(c.model)
      const createdAt = db.escape(c.created_at)
      const updatedAt = c.updated_at ? `'${db.escape(c.updated_at)}'` : 'NULL'
      const embeddings = c.embeddings ? `'${db.escape(JSON.stringify(c.embeddings))}'` : 'NULL'
      return `(${c.id}, '${title}', '${model}', '${createdAt}', ${updatedAt}, ${embeddings}, ${c.pinned ? 1 : 0})`
    })

    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500)
      sqls.push(`INSERT OR REPLACE INTO conversations (id, title, model, created_at, updated_at, embeddings, pinned) VALUES ${chunk.join(',')};`)
    }

    await db.execSql(sqls)

    for (const id of removed) {
      this._rows.delete(id)
      this._messages.set(id, [])
    }
    for (const { conversation, row } of changed) {
      this._rows.set(conversation.id, row)
    }
  }

  public async deleteConversation(id: number): Promise<void> {
    await db.execSql([`DELETE FROM messages WHERE conversation_id = ${id};`, `DELETE FROM conversations WHERE id = ${id};`])
    this._rows.delete(id)
    this._messages.set(id, [])
  }

  public async getMessages(conversation_id: number): Promise<ChatMessage[]> {
    const stdout = await db.execSql(`SELECT role, content, images, files, thinking, tool_calls, tool_name FROM messages WHERE conversation_id = ${conversation_id} ORDER BY id ASC;`, ['-json'])
    if (!stdout) {
      return []
    }
    try {
      const rows = JSON.parse(stdout) as { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; images?: string; files?: string; thinking?: string; tool_calls?: string; tool_name?: string }[]
      const messages: ChatMessage[] = rows.map((r) => {
        return {
          role: r.role,
          content: r.content,
          images: r.images ? JSON.parse(r.images) as string[] : undefined,
          files: r.files ? JSON.parse(r.files) as { name: string; content: string }[] : undefined,
          thinking: r.thinking,
          tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) as ToolCall[] : undefined,
          tool_name: r.tool_name
        }
      })
      this._messages.set(conversation_id, [...messages])
      return messages
    } catch (e) {
      throw new DatabaseError(`Invalid messages data for conversation ${conversation_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  public saveMessages(conversation_id: number, messages: ChatMessage[]): Promise<void> {
    const snapshot = [...messages]
    const previous = this._messageWrites.get(conversation_id) ?? Promise.resolve()
    const write = previous.catch(() => {}).then(() => {
      return this._writeMessages(conversation_id, snapshot)
    })
    this._messageWrites.set(conversation_id, write)
    const cleanup = (): void => {
      if (this._messageWrites.get(conversation_id) === write) {
        this._messageWrites.delete(conversation_id)
      }
    }
    write.then(cleanup, cleanup)
    return write
  }

  public async deleteMessages(conversation_id: number): Promise<void> {
    await this.saveMessages(conversation_id, [])
  }

  private async _writeMessages(conversation_id: number, messages: ChatMessage[]): Promise<void> {
    const persisted = this._messages.get(conversation_id)
    let kept = 0
    if (persisted) {
      while (kept < persisted.length && kept < messages.length && persisted[kept] === messages[kept]) {
        kept++
      }
    }

    const sqls: string[] = []
    if (!persisted) {
      sqls.push(`DELETE FROM messages WHERE conversation_id = ${conversation_id};`)
    } else if (kept < persisted.length) {
      sqls.push(`DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE conversation_id = ${conversation_id} ORDER BY id LIMIT -1 OFFSET ${kept});`)
    }

    const values = messages.slice(kept).map((m) => {
      const role = db.escape(m.role)
      const content = db.escape(m.content)
      const images = m.images ? `'${db.escape(JSON.stringify(m.images))}'` : 'NULL'
      const files = m.files ? `'${db.escape(JSON.stringify(m.files))}'` : 'NULL'
      const thinking = m.thinking ? `'${db.escape(m.thinking)}'` : 'NULL'
      const tool_calls = m.tool_calls ? `'${db.escape(JSON.stringify(m.tool_calls))}'` : 'NULL'
      const tool_name = m.tool_name ? `'${db.escape(m.tool_name)}'` : 'NULL'
      return `(${conversation_id}, '${role}', '${content}', ${images}, ${files}, ${thinking}, ${tool_calls}, ${tool_name})`
    })

    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500)
      sqls.push(`INSERT INTO messages (conversation_id, role, content, images, files, thinking, tool_calls, tool_name) VALUES ${chunk.join(',')};`)
    }

    if (sqls.length === 0) {
      return
    }

    this._messages.delete(conversation_id)
    await db.execSql(sqls)
    this._messages.set(conversation_id, messages)
  }

  public async indexConversations(provider: Provider, conversations: Conversation[], force: boolean = false, cancellable?: Gio.Cancellable, onProgress?: (fraction: number) => void): Promise<void> {
    const total = conversations.length
    if (total === 0) {
      return
    }

    let processed = 0
    for (const conv of conversations) {
      if (cancellable?.is_cancelled()) {
        break
      }

      if (!force && conv.embeddings) {
        processed++
        if (onProgress) {
          onProgress(processed / total)
        }
        continue
      }

      const messages = await this.getMessages(conv.id)
      if (messages.length > 0) {
        const textContent = messages.map((m) => {
          return m.content
        }).join('\n')
        try {
          const response = await provider.embed({
            model: DEFAULT_EMBEDDING_MODEL,
            input: textContent.slice(0, 8000)
          })
          if (response && response.embeddings && response.embeddings.length > 0) {
            conv.embeddings = response.embeddings[0]
          }
        } catch (err: unknown) {
          console.error(`Failed to index conversation ${conv.id}:`, err)
        }
      }
      processed++
      if (onProgress) {
        onProgress(processed / total)
      }
    }
    await this.saveConversations(conversations)
  }
}

export const conversationsStore = new ConversationsStore()
