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
}

type LineRenderer = (line: string, inline: (text: string) => string) => string | null

interface Delimiter {
  char: string
  index: number
}

const SLOT = /\x02(\d+)\x02/g
const RULE_LINE = /^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/
const HEADING_LINE = /^[ \t]*(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const QUOTE_LINE = /^[ \t]*((?:&gt;[ \t]?)+)(.*)$/
const BULLET_LINE = /^([ \t]*)[-*+][ \t]+(.*)$/
const HEADING_SIZES = ['x-large', 'large']

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char)
}

function isWord(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char)
}

function renderEmphasis(line: string, style: InlineStyle): string {
  const [bold, boldEnd] = style.bold
  const [italic, italicEnd] = style.italic
  const out: string[] = []
  const runs = new Map<number, { char: string; count: number; openTags: string[]; closeTags: string[] }>()
  const stack: Delimiter[] = []

  let i = 0
  while (i < line.length) {
    const char = line[i]
    if (char !== '*' && char !== '~') {
      const next = line.slice(i + 1).search(/[*~]/)
      const endIndex = next === -1 ? line.length : i + 1 + next
      out.push(line.slice(i, endIndex))
      i = endIndex
      continue
    }

    let length = 1
    while (line[i + length] === char) {
      length++
    }
    const before = line[i - 1]
    const after = line[i + length]
    i += length

    const run = { char, count: length, openTags: [] as string[], closeTags: [] as string[] }
    const index = out.length
    out.push('')
    runs.set(index, run)

    if (char === '~' && length !== 2) {
      continue
    }
    const intraword = char === '*' && length === 1
    const canOpen = !isSpace(after) && !(intraword && isWord(before))
    const canClose = !isSpace(before) && !(intraword && isWord(after))

    if (canClose) {
      let s = stack.length - 1
      while (s >= 0 && run.count > 0) {
        const opener = stack[s]
        if (opener.char !== char) {
          s--
          continue
        }
        const openerRun = runs.get(opener.index)!
        let use: number
        let open: string
        let close: string
        if (char === '~') {
          use = 2
          open = '<s>'
          close = '</s>'
        } else {
          use = openerRun.count >= 2 && run.count >= 2 && !(openerRun.count >= 3 && run.count >= 3) ? 2 : 1
          open = use === 2 ? bold : italic
          close = use === 2 ? boldEnd : italicEnd
        }
        openerRun.count -= use
        run.count -= use
        openerRun.openTags.unshift(open)
        run.closeTags.push(close)
        if (openerRun.count > 0) {
          stack.splice(s + 1)
        } else {
          stack.splice(s)
          s--
        }
      }
    }
    if (run.count > 0 && canOpen) {
      stack.push({ char, index })
    }
  }

  for (const [index, run] of runs) {
    out[index] = run.closeTags.join('') + run.char.repeat(run.count) + run.openTags.join('')
  }
  return out.join('')
}

function renderSegment(text: string, style: InlineStyle, renderLine: LineRenderer): string[] {
  const slots: string[] = []
  const slot = (value: string) => {
    slots.push(value)
    return `\x02${slots.length - 1}\x02`
  }

  let escaped = pangoEscape(text)
  escaped = escaped.replace(/\\([*~_`\\[\]#>-])/g, (_match, char: string) => {
    return slot(char)
  })
  if (style.codeBlock) {
    escaped = escaped.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
      return slot(style.codeBlock!(code))
    })
  }
  escaped = escaped.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    return slot(style.codeSpan(code))
  })

  const inline = (value: string) => {
    return renderEmphasis(value, style)
  }
  escaped = escaped.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    return slot(`<a href="${href.replace(SLOT, (_m, n: string) => {
      return slots[parseInt(n)].replace(/<[^>]*>/g, '')
    })}">${inline(label)}</a>`)
  })

  const restore = (value: string): string => {
    return value.replace(SLOT, (_match, n: string) => {
      return restore(slots[parseInt(n)])
    })
  }

  return escaped
    .split('\n')
    .map((line) => {
      return renderLine(line, inline)
    })
    .filter((line): line is string => {
      return line !== null
    })
    .map(restore)
}

const PANGO_STYLE: InlineStyle = {
  bold: ['<b>', '</b>'],
  italic: ['<i>', '</i>'],
  codeSpan: (code) => {
    return `<span font_family="monospace">${code}</span>`
  },
  codeBlock: (code) => {
    return `<span font_family="monospace" size="small">${code}</span>`
  }
}

const HTML_STYLE: InlineStyle = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  codeSpan: (code) => {
    return `<code>${code}</code>`
  }
}

const renderPangoLine: LineRenderer = (line, inline) => {
  if (RULE_LINE.test(line)) {
    return '<span alpha="35%">──────────</span>'
  }
  const heading = line.match(HEADING_LINE)
  if (heading) {
    const size = HEADING_SIZES[heading[1].length - 1]
    return `<span weight="bold"${size ? ` size="${size}"` : ''}>${inline(heading[2])}</span>`
  }
  const quote = line.match(QUOTE_LINE)
  if (quote) {
    const depth = (quote[1].match(/&gt;/g) ?? []).length
    return `<span alpha="70%"><i>${'▎ '.repeat(depth)}${inline(quote[2])}</i></span>`
  }
  const bullet = line.match(BULLET_LINE)
  if (bullet) {
    return `${bullet[1].replace(/\t/g, '  ')}• ${inline(bullet[2])}`
  }
  return inline(line)
}

const renderHtmlLine: LineRenderer = (line, inline) => {
  if (RULE_LINE.test(line)) {
    return null
  }
  const heading = line.match(HEADING_LINE)
  if (heading) {
    return `<strong>${inline(heading[2])}</strong>`
  }
  const quote = line.match(QUOTE_LINE)
  if (quote) {
    return `<em>${inline(quote[2])}</em>`
  }
  return inline(line)
}

function groupFencedLines(text: string): string[] {
  const groups: string[] = []
  let current: string[] = []
  let open = false
  for (const line of text.split('\n')) {
    current.push(line)
    if ((line.match(/```/g) ?? []).length % 2 === 1) {
      open = !open
    }
    if (!open) {
      groups.push(current.join('\n'))
      current = []
    }
  }
  if (current.length > 0) {
    groups.push(...current)
  }
  return groups
}

export interface MarkupLine {
  markup: string
  source: string
}

export function markdownLinesToPango(text: string): MarkupLine[] {
  if (!text) {
    return []
  }
  return groupFencedLines(text).map((source) => {
    return { source, markup: renderSegment(source, PANGO_STYLE, renderPangoLine).join('\n') }
  })
}

export function markdownToPango(text: string): string {
  return markdownLinesToPango(text).map((line) => {
    return line.markup
  }).join('\n')
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
      html += `<p>${renderSegment(chunk.content, HTML_STYLE, renderHtmlLine).join('<br/>')}</p>`
    }
  }

  return html
}
