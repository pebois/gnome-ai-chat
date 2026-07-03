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

interface InlineStyle {
  bold: [string, string]
  italic: [string, string]
  codeSpan: (code: string) => string
  codeBlock?: (code: string) => string
  lineBreaks: boolean
}

function renderInline(text: string, style: InlineStyle): string {
  let escaped = pangoEscape(text)

  const escapedChars: string[] = []
  const charPh = (i: number) => {
    return `\x01${i}\x01`
  }
  escaped = escaped.replace(/\\([*~_`\\])/g, (_match, char: string) => {
    escapedChars.push(char)
    return charPh(escapedChars.length - 1)
  })

  escaped = escaped.replace(/\n?^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$\n?/gm, '')

  const codeSpans: string[] = []
  const ph = (i: number) => {
    return `\x02${i}\x02`
  }

  if (style.codeBlock) {
    escaped = escaped.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
      codeSpans.push(style.codeBlock!(code))
      return ph(codeSpans.length - 1)
    })
  }
  escaped = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(style.codeSpan(code))
    return ph(codeSpans.length - 1)
  })

  const [bold, boldEnd] = style.bold
  const [italic, italicEnd] = style.italic

  escaped = escaped.replace(/^#{1,7} (.*)$/gm, `${bold}$1${boldEnd}`)

  escaped = escaped.replace(/^\s*&gt;\s?(.*)$/gm, `${italic}$1${italicEnd}`)

  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  escaped = escaped.replace(/~~([^~]+)~~/g, '<s>$1</s>')

  escaped = escaped.replace(/\*\*\*(.+?)\*\*\*/g, `${bold}${italic}$1${italicEnd}${boldEnd}`)

  escaped = escaped.replace(/\*\*(.+?)\*\*/g, `${bold}$1${boldEnd}`)

  escaped = escaped.replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/gm, `$1${italic}$2${italicEnd}`)

  escaped = escaped.replace(/\x02(\d+)\x02/g, (_match: string, i: string) => {
    return codeSpans[parseInt(i)]
  })

  escaped = escaped.replace(/\x01(\d+)\x01/g, (_match: string, i: string) => {
    return escapedChars[parseInt(i)]
  })

  if (style.lineBreaks) {
    escaped = escaped.replace(/\n/g, '<br/>')
  }

  return escaped
}

const PANGO_STYLE: InlineStyle = {
  bold: ['<b>', '</b>'],
  italic: ['<i>', '</i>'],
  codeSpan: (code) => {
    return `<span font_family="monospace">${code}</span>`
  },
  codeBlock: (code) => {
    return `<span font_family="monospace" size="small">${code}</span>`
  },
  lineBreaks: false
}

const HTML_STYLE: InlineStyle = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  codeSpan: (code) => {
    return `<code>${code}</code>`
  },
  lineBreaks: true
}

export function markdownToPango(text: string): string {
  if (!text) {
    return ''
  }
  return renderInline(text, PANGO_STYLE)
}

export function markdownToHtml(text: string): string {
  if (!text) {
    return ''
  }

  const chunks = parseMarkdownChunks(text)
  let html = ''

  for (const chunk of chunks) {
    if (chunk.type === 'code') {
      const { code, language } = parseCodeBlock(chunk.content)
      const langClass = language ? ` class="language-${language}"` : ''
      html += `<pre><code${langClass}>${pangoEscape(code)}</code></pre>`
    } else if (chunk.type === 'table') {
      const { headers, rows } = parseTable(chunk.content)
      html += '<table>'
      html += '<thead><tr>'
      for (const h of headers) {
        html += `<th>${pangoEscape(h)}</th>`
      }
      html += '</tr></thead>'
      html += '<tbody>'
      for (const row of rows) {
        html += '<tr>'
        for (const cell of row) {
          html += `<td>${pangoEscape(cell)}</td>`
        }
        html += '</tr>'
      }
      html += '</tbody></table>'
    } else {
      html += `<p>${renderInline(chunk.content, HTML_STYLE)}</p>`
    }
  }

  return html
}
