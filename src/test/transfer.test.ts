import type { Conversation } from '@/lib/db/types.js'
import type { ChatMessage } from '@/lib/providers/index.js'
import { buildExport, describeImport, parseImport, planImport, toTransferConversation, type TransferConversation } from '@/lib/transfer.js'

const T1 = '2026-11-01T10:00:00.000Z'
const T2 = '2026-11-02T10:00:00.000Z'
const T3 = '2026-11-03T10:00:00.000Z'

function conversation(id: number, partial: Partial<Conversation> = {}): Conversation {
  return { id, title: `chat ${id}`, model: 'llama', created_at: T1, updated_at: T1, ...partial }
}

function messages(...contents: string[]): ChatMessage[] {
  return contents.map((content, i) => {
    return { role: i % 2 === 0 ? 'user' : 'assistant', content }
  })
}

function entry(id: number, partial: Partial<TransferConversation> = {}): TransferConversation {
  return { id, title: `chat ${id}`, model: 'llama', created_at: T1, updated_at: T1, pinned: false, messages: messages('hi', 'hello'), ...partial }
}

function applyPlan(local: Conversation[], imported: TransferConversation[]): Conversation[] {
  const plan = planImport(local, imported)
  const result = local.map((c) => {
    return plan.replaced.find((r) => {
      return r.conversation.id === c.id
    })?.conversation ?? c
  })
  return [...result, ...plan.added.map((a) => {
    return a.conversation
  })]
}

describe('buildExport and parseImport', () => {
  it('round-trips conversations without their embeddings', () => {
    const local = conversation(1, { pinned: true, embeddings: [0.1, 0.2] })
    const file = buildExport([toTransferConversation(local, messages('hi', 'hello'))], T3)
    expect(file.format).toBe('gnome-ai-chat-conversations')
    expect(JSON.stringify(file)).not.toContain('embeddings')
    expect(parseImport(JSON.stringify(file))).toEqual([entry(1, { pinned: true })])
  })

  it('keeps the optional message fields', () => {
    const message: ChatMessage = { role: 'assistant', content: 'x', thinking: 'hm', images: ['abc'], files: [{ name: 'a.txt', content: 'a' }], tool_name: 't', command: 'deepsearch' }
    const file = buildExport([entry(1, { messages: [message] })], T3)
    expect(parseImport(JSON.stringify(file))[0].messages).toEqual([message])
  })

  it('reads the old single-conversation export', () => {
    const old = { conversation: { id: 7, title: 'old', model: 'm', created_at: T1 }, messages: [{ role: 'user', content: 'hi' }] }
    expect(parseImport(JSON.stringify(old))).toEqual([{ id: 7, title: 'old', model: 'm', created_at: T1, updated_at: undefined, pinned: false, messages: [{ role: 'user', content: 'hi' }] }])
  })

  it('drops invalid conversations and messages', () => {
    const file = {
      format: 'gnome-ai-chat-conversations',
      version: 1,
      conversations: [
        { id: 1, created_at: T1, messages: [{ role: 'user', content: 'ok' }, { role: 'robot', content: 'no' }, { role: 'user' }, 'text'] },
        { id: 'x', created_at: T1, messages: [] },
        { id: 2, messages: [] },
        { id: 3, created_at: T1 },
        null
      ]
    }
    const parsed = parseImport(JSON.stringify(file))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].title).toBe('Imported chat')
    expect(parsed[0].messages).toEqual([{ role: 'user', content: 'ok' }])
  })

  it('rejects files that are not an export', () => {
    expect(() => {
      return parseImport('not json')
    }).toThrow('not valid JSON')
    expect(() => {
      return parseImport('[1, 2]')
    }).toThrow('not a conversation export')
    expect(() => {
      return parseImport('{"name": "something else"}')
    }).toThrow('not a conversation export')
    expect(() => {
      return parseImport(JSON.stringify({ format: 'gnome-ai-chat-conversations', version: 2, conversations: [] }))
    }).toThrow('newer version')
  })
})

describe('planImport', () => {
  it('adds conversations that are missing', () => {
    const plan = planImport([conversation(1)], [entry(2, { created_at: T2, pinned: true })])
    expect(plan.unchanged).toBe(0)
    expect(plan.replaced).toEqual([])
    expect(plan.added).toEqual([{ conversation: { id: 2, title: 'chat 2', model: 'llama', created_at: T2, updated_at: T1, pinned: true }, messages: messages('hi', 'hello') }])
  })

  it('adds nothing when the same file is imported twice', () => {
    const file = [entry(1), entry(2, { created_at: T2, updated_at: T2 })]
    const first = applyPlan([], file)
    expect(first).toHaveLength(2)
    const second = planImport(first, file)
    expect(second.added).toEqual([])
    expect(second.replaced).toEqual([])
    expect(second.unchanged).toBe(2)
  })

  it('lets the newest version win', () => {
    const local = [conversation(1, { updated_at: T2, title: 'local' })]
    const newer = planImport(local, [entry(1, { updated_at: T3, title: 'file', model: 'other', messages: messages('a', 'b', 'c') })])
    expect(newer.replaced).toEqual([{ conversation: { id: 1, title: 'file', model: 'other', created_at: T1, updated_at: T3, pinned: false }, messages: messages('a', 'b', 'c') }])
    expect(newer.added).toEqual([])
    const older = planImport(local, [entry(1, { updated_at: T1, title: 'file' })])
    expect(older.replaced).toEqual([])
    expect(older.unchanged).toBe(1)
    expect(planImport(local, [entry(1, { updated_at: T2 })]).unchanged).toBe(1)
  })

  it('falls back to the creation date when a side has no update date', () => {
    const local = [conversation(1, { updated_at: undefined })]
    expect(planImport(local, [entry(1, { updated_at: T2 })]).replaced).toHaveLength(1)
    expect(planImport([conversation(1, { updated_at: T2 })], [entry(1, { updated_at: undefined })]).unchanged).toBe(1)
  })

  it('keeps a conversation pinned when either side is pinned', () => {
    const pinnedLocal = planImport([conversation(1, { pinned: true })], [entry(1, { updated_at: T2 })])
    expect(pinnedLocal.replaced[0].conversation.pinned).toBe(true)
    const pinnedFile = planImport([conversation(1)], [entry(1, { updated_at: T2, pinned: true })])
    expect(pinnedFile.replaced[0].conversation.pinned).toBe(true)
  })

  it('gives a free id to a conversation whose id is taken, and finds it again later', () => {
    const local = [conversation(5, { created_at: T1 })]
    const file = [entry(5, { created_at: T2, updated_at: T2, title: 'other chat' })]
    const merged = applyPlan(local, file)
    expect(merged.map((c) => {
      return c.id
    })).toEqual([5, 6])
    expect(merged[0].title).toBe('chat 5')
    const again = planImport(merged, file)
    expect(again.added).toEqual([])
    expect(again.replaced).toEqual([])
    expect(again.unchanged).toBe(1)
  })

  it('keeps only the newest of two entries for the same conversation', () => {
    const plan = planImport([], [entry(1, { updated_at: T1, title: 'old' }), entry(1, { updated_at: T2, title: 'new' })])
    expect(plan.added).toHaveLength(1)
    expect(plan.added[0].conversation.title).toBe('new')
  })

  it('never replaces a locked conversation', () => {
    const plan = planImport([conversation(1)], [entry(1, { updated_at: T3 })], (id) => {
      return id === 1
    })
    expect(plan.replaced).toEqual([])
    expect(plan.unchanged).toBe(1)
  })
})

describe('describeImport', () => {
  it('summarizes the result', () => {
    expect(describeImport({ added: [], replaced: [], unchanged: 0 })).toBe('Nothing to import')
    expect(describeImport({ added: [], replaced: [], unchanged: 2 })).toBe('Nothing new to import, 2 chats already up to date')
    const item = { conversation: conversation(1), messages: [] }
    expect(describeImport({ added: [item], replaced: [], unchanged: 0 })).toBe('Imported 1 chat')
    expect(describeImport({ added: [item, item, item], replaced: [item], unchanged: 12 })).toBe('Imported 3 chats, updated 1, 12 unchanged')
  })
})
