import { buildContext, estimateMessageTokens, estimateTokens, slimTurn, truncateMiddle } from '@/lib/agent/context.js'
import { OLD_TOOL_RESULT_MAX_CHARS, TOOL_RESULT_MAX_CHARS } from '@/lib/constants.js'
import type { ChatMessage, Tool } from '@/lib/providers/index.js'

const text = (tokens: number): string => {
  return 'x'.repeat(tokens * 4)
}

const user = (content: string): ChatMessage => {
  return { role: 'user', content }
}

const assistant = (content: string): ChatMessage => {
  return { role: 'assistant', content }
}

const tool = (content: string): ChatMessage => {
  return { role: 'tool', tool_name: 'fetch_web_page', content }
}

describe('estimateTokens', () => {
  it('uses four characters per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('abc')).toBe(1)
  })

  it('counts thinking, files and images', () => {
    const message: ChatMessage = {
      role: 'user',
      content: text(10),
      thinking: text(5),
      files: [{ name: '', content: text(20) }],
      images: ['a']
    }
    expect(estimateMessageTokens(message)).toBe(35 + 768)
  })
})

describe('truncateMiddle', () => {
  it('leaves short text untouched', () => {
    expect(truncateMiddle('hello', 10)).toBe('hello')
  })

  it('keeps head and tail with a marker', () => {
    const result = truncateMiddle('a'.repeat(70) + 'b'.repeat(30) + 'c'.repeat(100), 100)
    expect(result.startsWith('a'.repeat(70))).toBe(true)
    expect(result.endsWith('c'.repeat(30))).toBe(true)
    expect(result).toContain('[...truncated 100 chars...]')
  })
})

describe('buildContext', () => {
  it('returns everything when it fits', () => {
    const messages = [user('hi'), assistant('hello'), user('how are you')]
    const result = buildContext({ system: 'sys', messages, tools: [], numCtx: 4096 })
    expect(result.messages).toEqual(messages)
    expect(result.droppedMessages).toBe(0)
    expect(result.truncatedResults).toBe(0)
  })

  it('drops the oldest whole turns first', () => {
    const messages = [
      user(text(400)), assistant(text(400)),
      user(text(400)), assistant(text(400)),
      user('latest')
    ]
    const result = buildContext({ system: '', messages, tools: [], numCtx: 2000 })
    expect(result.droppedMessages).toBe(2)
    expect(result.messages[0]).toBe(messages[2])
    expect(result.messages.at(-1)).toBe(messages[4])
  })

  it('always keeps the current turn even when over budget', () => {
    const messages = [user(text(100)), assistant(text(100)), user(text(5000))]
    const result = buildContext({ system: '', messages, tools: [], numCtx: 1000 })
    expect(result.messages).toEqual([messages[2]])
    expect(result.droppedMessages).toBe(2)
  })

  it('counts system prompt and tool schemas against the budget', () => {
    const messages = [user(text(300)), assistant(text(300)), user('now')]
    const tools: Tool[] = [{ type: 'function', function: { name: 'big', description: text(1500), parameters: {} } }]
    const withoutTools = buildContext({ system: '', messages, tools: [], numCtx: 2048 })
    const withTools = buildContext({ system: '', messages, tools, numCtx: 2048 })
    expect(withoutTools.droppedMessages).toBe(0)
    expect(withTools.droppedMessages).toBe(2)
  })

  it('truncates old tool results harder than current ones', () => {
    const big = 'y'.repeat(TOOL_RESULT_MAX_CHARS * 2)
    const messages = [
      user('q1'), tool(big), assistant('a1'),
      user('q2'), tool(big)
    ]
    const result = buildContext({ system: '', messages, tools: [], numCtx: 100000 })
    expect(result.truncatedResults).toBe(2)
    expect(result.messages[1].content.length).toBeLessThan(OLD_TOOL_RESULT_MAX_CHARS + 100)
    expect(result.messages[4].content.length).toBeLessThan(TOOL_RESULT_MAX_CHARS + 100)
    expect(result.messages[4].content.length).toBeGreaterThan(OLD_TOOL_RESULT_MAX_CHARS + 100)
    expect(messages[1].content).toBe(big)
  })

  it('never starts with an orphaned tool message', () => {
    const messages = [
      user(text(500)), { ...assistant(''), tool_calls: [] }, tool(text(500)), assistant(text(500)),
      user('next')
    ]
    const result = buildContext({ system: '', messages, tools: [], numCtx: 1000 })
    expect(result.messages[0].role).toBe('user')
  })
})

const research = (urls: string[]): ChatMessage => {
  return {
    role: 'assistant',
    content: '',
    tool_calls: urls.map((url, index) => {
      return { id: '', function: { index, name: 'fetch_web_page', arguments: { url } } }
    })
  }
}

describe('slimTurn', () => {
  it('keeps the question and the report with a numbered source list', () => {
    const turn = [
      user('deep neural networks'),
      research(['https://en.wikipedia.org/wiki/Deep_learning', 'https://example.org/']),
      tool(text(1000)),
      tool(text(1000)),
      { ...assistant('Deep learning stacks layers [1].'), thinking: 'hmm' }
    ]
    expect(slimTurn(turn)).toEqual([
      turn[0],
      {
        role: 'assistant',
        content: 'Deep learning stacks layers [1].\n\nSources:\n[1] Deep learning · en.wikipedia.org — https://en.wikipedia.org/wiki/Deep_learning\n[2] example.org — https://example.org/'
      }
    ])
  })

  it('keeps text messages without adding sources when no tool ran', () => {
    const turn = [user('hi'), assistant('hello')]
    expect(slimTurn(turn)).toEqual(turn)
  })
})

describe('buildContext with large earlier turns', () => {
  const deepSearchTurn = (): ChatMessage[] => {
    return [
      user('deep neural networks'),
      research(['https://en.wikipedia.org/wiki/Deep_learning']),
      tool(text(OLD_TOOL_RESULT_MAX_CHARS)),
      tool(text(OLD_TOOL_RESULT_MAX_CHARS)),
      assistant('Deep learning stacks layers [1].')
    ]
  }

  it('keeps a slim version of a turn that does not fit', () => {
    const messages = [...deepSearchTurn(), user('tell me more')]
    const result = buildContext({ system: '', messages, tools: [], numCtx: 1000 })
    expect(result.droppedMessages).toBe(0)
    expect(result.slimmedTurns).toBe(1)
    expect(result.messages.map((m) => {
      return m.role
    })).toEqual(['user', 'assistant', 'user'])
    expect(result.messages[1].content).toContain('Sources:\n[1] Deep learning')
    expect(result.messages[1].tool_calls).toBeUndefined()
  })

  it('drops a turn whose slim version does not fit either', () => {
    const turn = deepSearchTurn()
    turn[4] = assistant(text(2000))
    const messages = [...turn, user('tell me more')]
    const result = buildContext({ system: '', messages, tools: [], numCtx: 1000 })
    expect(result.slimmedTurns).toBe(0)
    expect(result.droppedMessages).toBe(5)
    expect(result.messages).toEqual([messages[5]])
  })

  it('keeps a turn in full when it fits', () => {
    const messages = [...deepSearchTurn(), user('tell me more')]
    const result = buildContext({ system: '', messages, tools: [], numCtx: 100000 })
    expect(result.slimmedTurns).toBe(0)
    expect(result.droppedMessages).toBe(0)
    expect(result.messages.map((m) => {
      return m.role
    })).toEqual(messages.map((m) => {
      return m.role
    }))
  })
})
