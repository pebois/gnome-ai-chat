export interface CodeBlock {
  language: string
  code: string
}

export interface TableContent {
  headers: string[]
  rows: string[][]
}

export interface MarkdownChunk {
  type: 'text' | 'code' | 'table'
  content: string
}

export function parseCodeBlock(block: string): CodeBlock {
  const lines = block.split('\n')
  const firstLine = lines.shift() || ''
  const match = firstLine.match(/^\s*(```+)(.*)/)
  const openingBackticks = match ? match[1] : '```'
  const language = match ? match[2].trim() : ''

  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1].trim()
    if (lastLine.startsWith(openingBackticks)) {
      lines.pop()
    }
  }
  return { language, code: lines.join('\n') }
}

export function parseTable(tableContent: string): TableContent {
  const lines = tableContent.split('\n').map((l) => {
    return l.trim()
  })
  const parseRow = (line: string) => {
    let l = line.trim()
    if (l.startsWith('|')) {
      l = l.substring(1)
    }
    if (l.endsWith('|')) {
      l = l.substring(0, l.length - 1)
    }
    return l.split('|').map((cell) => {
      return cell.trim()
    })
  }

  const headers = parseRow(lines[0])
  const rows: string[][] = []

  for (let i = 2; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      continue
    }
    rows.push(parseRow(lines[i]))
  }

  const normalizedRows = rows.map((row) => {
    const newRow = [...row]
    while (newRow.length < headers.length) {
      newRow.push('')
    }
    return newRow.slice(0, headers.length)
  })

  return { headers, rows: normalizedRows }
}

export function parseMarkdownChunks(content: string): MarkdownChunk[] {
  if (!content) {
    return []
  }

  const rawChunks: { type: 'text' | 'code'; content: string }[] = []
  const rawLines = content.split('\n')
  let currentChunk: string[] = []
  let inCodeBlock = false
  let openingBackticks = ''
  let nestingLevel = 0

  for (const line of rawLines) {
    if (!inCodeBlock) {
      const match = line.match(/^\s*(```+)(.*)/)
      if (match) {
        if (currentChunk.length > 0) {
          rawChunks.push({ type: 'text', content: currentChunk.join('\n') })
        }
        currentChunk = [line]
        inCodeBlock = true
        openingBackticks = match[1]
        nestingLevel = 1
      } else {
        currentChunk.push(line)
      }
    } else {
      currentChunk.push(line)
      const match = line.match(/^\s*(```+)(.*)/)
      if (match && match[1].length >= openingBackticks.length) {
        const lineContent = match[2].trim()
        if (lineContent.length > 0) {
          nestingLevel++
        } else {
          nestingLevel--
          if (nestingLevel === 0) {
            rawChunks.push({ type: 'code', content: currentChunk.join('\n') })
            currentChunk = []
            inCodeBlock = false
            openingBackticks = ''
          }
        }
      }
    }
  }
  if (currentChunk.length > 0) {
    rawChunks.push({ type: inCodeBlock ? 'code' : 'text', content: currentChunk.join('\n') })
  }

  const finalChunks: MarkdownChunk[] = []

  for (const chunk of rawChunks) {
    if (chunk.type === 'code') {
      finalChunks.push(chunk)
      continue
    }

    const lines = chunk.content.split('\n')
    let textBuffer: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (i < lines.length - 1) {
        const nextLine = lines[i + 1]
        const isTableSep = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(nextLine)
        const hasPipes = line.includes('|')

        if (isTableSep && hasPipes) {
          if (textBuffer.length > 0) {
            const textContent = textBuffer.join('\n').trim()
            if (textContent) {
              finalChunks.push({ type: 'text', content: textContent })
            }
            textBuffer = []
          }

          const tableBuffer = [line, nextLine]
          i += 2

          while (i < lines.length) {
            const rowLine = lines[i]
            if (!rowLine.includes('|') && rowLine.trim() !== '') {
              break
            }
            if (rowLine.trim() === '') {
              break
            }
            tableBuffer.push(rowLine)
            i++
          }
          i--

          finalChunks.push({ type: 'table', content: tableBuffer.join('\n') })
          continue
        }
      }
      textBuffer.push(line)
    }

    if (textBuffer.length > 0) {
      const textContent = textBuffer.join('\n').trim()
      if (textContent) {
        finalChunks.push({ type: 'text', content: textContent })
      }
    }
  }

  return finalChunks
}

export function pangoEscape(text: string): string {
  if (!text) {
    return ''
  }
  return text
    .replace(/\x00/g, '') // Strip null characters to prevent truncation in C-based Pango functions
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function markdownToPango(text: string): string {
  if (!text) {
    return ''
  }

  // Escape special characters for Pango markup
  let escaped = pangoEscape(text)

  // Handle escaped markdown characters
  const escapedChars: string[] = []
  const charPh = (i: number) => {
    return `\x01${i}\x01`
  }
  escaped = escaped.replace(/\\([*~_`\\])/g, (_match, char: string) => {
    escapedChars.push(char)
    return charPh(escapedChars.length - 1)
  })

  // Strip horizontal rules
  escaped = escaped.replace(/\n?^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$\n?/gm, '')

  // Extract code spans as placeholders so inline formatting can't match inside them
  const codeSpans: string[] = []
  const ph = (i: number) => {
    return `\x02${i}\x02`
  }

  escaped = escaped.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    codeSpans.push(`<span font_family="monospace" size="small">${code}</span>`)
    return ph(codeSpans.length - 1)
  })
  escaped = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<span font_family="monospace">${code}</span>`)
    return ph(codeSpans.length - 1)
  })

  // Handle headings
  escaped = escaped.replace(/^####### (.*)$/gm, '<b>$1</b>')
  escaped = escaped.replace(/^###### (.*)$/gm, '<b>$1</b>')
  escaped = escaped.replace(/^##### (.*)$/gm, '<b>$1</b>')
  escaped = escaped.replace(/^#### (.*)$/gm, '<b>$1</b>')
  escaped = escaped.replace(/^### (.*)$/gm, '<b>$1</b>')
  escaped = escaped.replace(/^## (.*)$/gm, '<b>$1</b>')
  escaped = escaped.replace(/^# (.*)$/gm, '<b>$1</b>')

  // Handle blockquotes
  escaped = escaped.replace(/^\s*&gt;\s?(.*)$/gm, '<i>$1</i>')

  // Handle links
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Handle strikethrough text
  escaped = escaped.replace(/~~([^~]+)~~/g, '<s>$1</s>')

  // Handle bold and italic together (triple asterisks)
  escaped = escaped.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')

  // Handle bold text
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

  // Handle italic text
  escaped = escaped.replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/gm, '$1<i>$2</i>')

  // Restore code spans
  escaped = escaped.replace(/\x02(\d+)\x02/g, (_match: string, i: string) => {
    return codeSpans[parseInt(i)]
  })

  // Restore escaped characters
  escaped = escaped.replace(/\x01(\d+)\x01/g, (_match: string, i: string) => {
    return escapedChars[parseInt(i)]
  })

  return escaped
}
