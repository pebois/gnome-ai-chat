import Gio from 'gi://Gio'

import { DEFAULT_EMBEDDING_MODEL } from '@/lib/constants.js'
import { db } from '@/lib/db/index.js'
import type { Conversation } from '@/lib/db/types.js'
import type { Ollama, OllamaMessage, OllamaToolCall } from '@/lib/ollama.js'

export class ConversationsStore {
  public async getConversations(): Promise<Conversation[]> {
    const stdout = await db.execSql(`SELECT id, title, model, created_at, updated_at, embeddings FROM conversations ORDER BY id DESC;`, ['-json'])
    if (!stdout) {
      return []
    }
    try {
      const rows = JSON.parse(stdout) as { id: number; title: string; model: string; created_at: string; updated_at?: string; embeddings?: string }[]
      return rows.map((r) => {
        return {
          id: r.id,
          title: r.title,
          model: r.model,
          created_at: r.created_at,
          updated_at: r.updated_at,
          embeddings: r.embeddings ? JSON.parse(r.embeddings) as number[] : undefined
        }
      })
    } catch (e) {
      console.error('Failed to parse conversations:', e)
      return []
    }
  }

  public async saveConversations(conversations: Conversation[]): Promise<void> {
    if (conversations.length === 0) {
      await db.execSql(`DELETE FROM conversations;`)
      return
    }

    const ids = conversations.map((c) => {
      return c.id
    }).join(',')

    const sqls: string[] = []
    sqls.push(`DELETE FROM conversations WHERE id NOT IN (${ids});`)

    const values = conversations.map((c) => {
      const title = db.escape(c.title)
      const model = db.escape(c.model)
      const createdAt = db.escape(c.created_at)
      const updatedAt = c.updated_at ? `'${db.escape(c.updated_at)}'` : 'NULL'
      const embeddings = c.embeddings ? `'${db.escape(JSON.stringify(c.embeddings))}'` : 'NULL'
      return `(${c.id}, '${title}', '${model}', '${createdAt}', ${updatedAt}, ${embeddings})`
    })

    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500)
      sqls.push(`INSERT OR REPLACE INTO conversations (id, title, model, created_at, updated_at, embeddings) VALUES ${chunk.join(',')};`)
    }

    await db.execSql(sqls)
  }

  public async deleteConversation(id: number): Promise<void> {
    await db.execSql(`DELETE FROM conversations WHERE id = ${id};`)
  }

  public async getMessages(conversation_id: number): Promise<OllamaMessage[]> {
    const stdout = await db.execSql(`SELECT role, content, images, files, thinking, tool_calls, tool_name FROM messages WHERE conversation_id = ${conversation_id} ORDER BY id ASC;`, ['-json'])
    if (!stdout) {
      return []
    }
    try {
      const rows = JSON.parse(stdout) as { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; images?: string; files?: string; thinking?: string; tool_calls?: string; tool_name?: string }[]
      return rows.map((r) => {
        return {
          role: r.role,
          content: r.content,
          images: r.images ? JSON.parse(r.images) as string[] : undefined,
          files: r.files ? JSON.parse(r.files) as { name: string; content: string }[] : undefined,
          thinking: r.thinking,
          tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) as OllamaToolCall[] : undefined,
          tool_name: r.tool_name
        }
      })
    } catch (e) {
      console.error('Failed to parse messages:', e)
      return []
    }
  }

  public async saveMessages(conversation_id: number, messages: OllamaMessage[]): Promise<void> {
    const sqls: string[] = []
    sqls.push(`DELETE FROM messages WHERE conversation_id = ${conversation_id};`)

    if (messages.length === 0) {
      await db.execSql(sqls)
      return
    }

    const values = messages.map((m) => {
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

    await db.execSql(sqls)
  }

  public async deleteMessages(conversation_id: number): Promise<void> {
    await db.execSql(`DELETE FROM messages WHERE conversation_id = ${conversation_id};`)
  }

  public async indexConversations(ollama: Ollama, conversations: Conversation[], force: boolean = false, cancellable?: Gio.Cancellable, onProgress?: (fraction: number) => void): Promise<void> {
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
          const response = await ollama.embed({
            model: DEFAULT_EMBEDDING_MODEL,
            input: textContent.slice(0, 8000)
          })
          if (response && response.embeddings && response.embeddings.length > 0) {
            conv.embeddings = response.embeddings[0]
          }
        } catch (err) {
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
