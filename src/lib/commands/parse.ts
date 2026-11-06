import type { ChatMessage } from '@/lib/providers/index.js'

export interface CommandLine {
  name: string
  args: string
  sub: string
  subArgs: string
}

export type CommandInput
  = | { kind: 'command'; line: string }
    | { kind: 'message' }
    | { kind: 'unknown'; name: string; suggestion: string }

export const DEEPSEARCH_COMMAND = 'deepsearch'

function splitFirst(text: string): [string, string] {
  const match = text.trim().match(/^(\S*)\s*([\s\S]*)$/)
  return [match?.[1] ?? '', match?.[2] ?? '']
}

export function parseCommandLine(text: string): CommandLine {
  const [name, args] = splitFirst(text.trim().replace(/^\//, ''))
  const [sub, subArgs] = splitFirst(args)
  return { name: name.toLowerCase(), args: args.trim(), sub: sub.toLowerCase(), subArgs: subArgs.trim() }
}

export function commandArguments(text: string, command: string): CommandLine {
  const line = parseCommandLine(text)
  if (line.name === command) {
    return line
  }
  const [sub, subArgs] = splitFirst(text)
  return { name: command, args: text.trim(), sub: sub.toLowerCase(), subArgs: subArgs.trim() }
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => {
    return j
  })
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]
}

export function resolveCommandInput(text: string, commands: { name: string; visible?: boolean }[]): CommandInput {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) {
    return { kind: 'message' }
  }
  const line = trimmed.slice(1)
  const { name } = parseCommandLine(line)
  if (!name || /[^a-z0-9-]/.test(name)) {
    return { kind: 'message' }
  }
  if (commands.some((c) => {
    return c.name === name
  })) {
    return { kind: 'command', line }
  }
  const limit = name.length <= 4 ? 1 : 2
  const suggestion = commands
    .filter((c) => {
      return c.visible !== false
    })
    .map((c) => {
      return { name: c.name, distance: editDistance(name, c.name) }
    })
    .filter((c) => {
      return c.distance <= limit
    })
    .sort((a, b) => {
      return a.distance - b.distance
    })[0]?.name
  return suggestion ? { kind: 'unknown', name, suggestion } : { kind: 'message' }
}

export function isPromptCommand(message: ChatMessage): boolean {
  return !!message.command && parseCommandLine(message.command).name !== DEEPSEARCH_COMMAND
}

export function messageDisplayText(message: ChatMessage): string {
  return isPromptCommand(message) ? `/${message.command}` : message.content
}

export function messageInputText(message: ChatMessage): string {
  if (!message.command) {
    return message.content
  }
  return isPromptCommand(message) ? `/${message.command}` : `/${message.command} ${message.content}`
}
