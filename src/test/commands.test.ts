import { compressMessages } from '@/lib/agent/compress.js'
import { NOT_CITED_RESULT } from '@/lib/agent/research.js'
import { commandArguments, isPromptCommand, messageDisplayText, messageInputText, parseCommandLine, resolveCommandInput } from '@/lib/commands/parse.js'
import type { ChatMessage, ToolCall } from '@/lib/providers/index.js'

const COMMANDS = [{ name: 'deepsearch' }, { name: 'hn' }, { name: 'ps' }, { name: 'search', visible: false }]

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => {
  return { id: '', function: { index: 0, name, arguments: args } }
}

describe('parseCommandLine', () => {
  it('splits the name, sub-command and arguments, ignoring repeated spaces', () => {
    expect(parseCommandLine('/HN   custom   gnome  shell ')).toEqual({ name: 'hn', args: 'custom   gnome  shell', sub: 'custom', subArgs: 'gnome  shell' })
  })

  it('handles a bare name', () => {
    expect(parseCommandLine('deepsearch')).toEqual({ name: 'deepsearch', args: '', sub: '', subArgs: '' })
  })
})

describe('commandArguments', () => {
  it('reads arguments after the command name', () => {
    expect(commandArguments('files attach /tmp/a b.txt', 'files')).toMatchObject({ sub: 'attach', subArgs: '/tmp/a b.txt' })
  })

  it('treats a menu target without the command name as the sub-command', () => {
    expect(commandArguments('manage', 'mcp').sub).toBe('manage')
    expect(commandArguments('', 'mcp').sub).toBe('')
  })
})

describe('resolveCommandInput', () => {
  it('routes known commands, including hidden ones', () => {
    expect(resolveCommandInput('/deepsearch why  is the sky blue', COMMANDS)).toEqual({ kind: 'command', line: 'deepsearch why  is the sky blue' })
    expect(resolveCommandInput('/search', COMMANDS)).toEqual({ kind: 'command', line: 'search' })
  })

  it('sends paths and plain text as messages', () => {
    expect(resolveCommandInput('/etc/hosts is missing, why?', COMMANDS)).toEqual({ kind: 'message' })
    expect(resolveCommandInput('/usr bin', COMMANDS)).toEqual({ kind: 'message' })
    expect(resolveCommandInput('hello', COMMANDS)).toEqual({ kind: 'message' })
    expect(resolveCommandInput('/', COMMANDS)).toEqual({ kind: 'message' })
  })

  it('suggests a close visible command for typos', () => {
    expect(resolveCommandInput('/deepserch x', COMMANDS)).toEqual({ kind: 'unknown', name: 'deepserch', suggestion: 'deepsearch' })
    expect(resolveCommandInput('/serch', COMMANDS)).toEqual({ kind: 'message' })
  })
})

describe('command messages', () => {
  const deep: ChatMessage = { role: 'user', content: 'Why?', command: 'deepsearch' }
  const hn: ChatMessage = { role: 'user', content: 'Use fetch_rss_feed on …', command: 'hn best' }
  const plain: ChatMessage = { role: 'user', content: 'Hello' }

  it('shows the question for deep search and the command line for prompt commands', () => {
    expect(isPromptCommand(deep)).toBe(false)
    expect(isPromptCommand(hn)).toBe(true)
    expect(messageDisplayText(deep)).toBe('Why?')
    expect(messageDisplayText(hn)).toBe('/hn best')
    expect(messageDisplayText(plain)).toBe('Hello')
  })

  it('restores the command when restarting from a message', () => {
    expect(messageInputText(deep)).toBe('/deepsearch Why?')
    expect(messageInputText(hn)).toBe('/hn best')
    expect(messageInputText(plain)).toBe('Hello')
  })
})

describe('compressMessages', () => {
  it('drops thinking and tool calls but keeps cited deep search pages', () => {
    const plan = call('deepsearch_plan', { question: 'q' })
    const search = call('web_search', { query: 'q' })
    const cited = call('fetch_web_page', { url: 'https://a.org' })
    const uncited = call('fetch_web_page', { url: 'https://b.org' })
    const research: ChatMessage = { role: 'assistant', content: '', tool_calls: [plan, search, cited, uncited] }
    const citedResult: ChatMessage = { role: 'tool', tool_name: 'fetch_web_page', content: 'A\nhttps://a.org\n\npassage' }
    const toolUse: ChatMessage = { role: 'assistant', content: '', thinking: 'hmm', tool_calls: [call('get_time')] }
    const answer: ChatMessage = { role: 'assistant', content: 'Answer [1]', thinking: 'hmm' }
    const messages: ChatMessage[] = [
      { role: 'user', content: 'q', command: 'deepsearch' },
      research,
      { role: 'tool', tool_name: 'deepsearch_plan', content: 'Queries' },
      { role: 'tool', tool_name: 'web_search', content: 'results' },
      citedResult,
      { role: 'tool', tool_name: 'fetch_web_page', content: `${NOT_CITED_RESULT}: B` },
      answer,
      { role: 'user', content: 'time?' },
      toolUse,
      { role: 'tool', tool_name: 'get_time', content: 'noon' },
      { role: 'assistant', content: 'Noon.' }
    ]
    expect(compressMessages(messages)).toEqual([
      { role: 'user', content: 'q', command: 'deepsearch' },
      { role: 'assistant', content: '', tool_calls: [cited] },
      citedResult,
      { role: 'assistant', content: 'Answer [1]' },
      { role: 'user', content: 'time?' },
      { role: 'assistant', content: 'Noon.' }
    ])
  })
})
