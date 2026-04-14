import { markdownToPango, pangoEscape, parseCodeBlock, parseMarkdownChunks, parseTable } from '@/lib/parser.js'

describe('parser', () => {
  describe('pangoEscape', () => {
    it('escapes special XML characters', () => {
      expect(pangoEscape('<b>')).toBe('&lt;b&gt;')
      expect(pangoEscape('"quote"')).toBe('&quot;quote&quot;')
      expect(pangoEscape('\'single\'')).toBe('&#39;single&#39;')
      expect(pangoEscape('A & B')).toBe('A &amp; B')
    })

    it('removes null characters', () => {
      expect(pangoEscape('text\x00with\x00null')).toBe('textwithnull')
    })
  })

  describe('markdownToPango', () => {
    it('Normal text unchanged', () => {
      expect(markdownToPango('Normal text')).toBe('Normal text')
    })

    it('Parses bold', () => {
      expect(markdownToPango('**Bold Text**')).toBe('<b>Bold Text</b>')
    })

    it('Parses Header 3', () => {
      expect(markdownToPango('### Header 3')).toBe('<b><big>Header 3</big></b>')
    })

    it('Parses Header 4', () => {
      expect(markdownToPango('#### Header 4')).toBe('<b>Header 4</b>')
    })

    it('Parses Header 5', () => {
      expect(markdownToPango('##### Header 5')).toBe('<b><i>Header 5</i></b>')
    })

    it('Parses Header 2', () => {
      expect(markdownToPango('## Header 2')).toBe('<b><big><big>Header 2</big></big></b>')
    })

    it('Parses Header 1', () => {
      expect(markdownToPango('# Header 1')).toBe('<b><big><big><big>Header 1</big></big></big></b>')
    })

    it('Parses inline code', () => {
      expect(markdownToPango('`Code`')).toBe('<span font_family="monospace">Code</span>')
    })

    it('Parses code block', () => {
      expect(markdownToPango('```\nBlock\n```')).toBe('<span font_family="monospace" size="small">\nBlock\n</span>')
    })

    it('Escapes XML characters properly', () => {
      expect(markdownToPango('Text with < and >')).toBe('Text with &lt; and &gt;')
    })

    it('Parses blockquotes', () => {
      expect(markdownToPango('> This is a quote')).toBe('<i>This is a quote</i>')
    })

    it('Parses strikethrough', () => {
      expect(markdownToPango('~~strikethrough~~')).toBe('<s>strikethrough</s>')
    })

    it('Parses italics', () => {
      expect(markdownToPango('*italic text*')).toBe('<i>italic text</i>')
    })

    it('Parses complex nested formatting', () => {
      const input = '**Bold** and *italic* with `code` and ~~strike~~'
      const expected = '<b>Bold</b> and <i>italic</i> with <span font_family="monospace">code</span> and <s>strike</s>'
      expect(markdownToPango(input)).toBe(expected)
    })

    it('Handles multiple blockquotes', () => {
      const input = '> Quote 1\n> Quote 2'
      const expected = '<i>Quote 1</i>\n<i>Quote 2</i>'
      expect(markdownToPango(input)).toBe(expected)
    })

    it('Parses bold and italic together (triple asterisks)', () => {
      expect(markdownToPango('***Bold and Italic***')).toBe('<b><i>Bold and Italic</i></b>')
    })

    it('Parses links', () => {
      expect(markdownToPango('[text](https://example.com)')).toBe('<a href="https://example.com">text</a>')
    })

    it('Adjacent italic spans both match', () => {
      expect(markdownToPango('*foo* *bar*')).toBe('<i>foo</i> <i>bar</i>')
    })

    it('No italic when asterisk is adjacent to a word character', () => {
      expect(markdownToPango('word*text*')).toBe('word*text*')
    })

    it('Italic does not cross newlines', () => {
      expect(markdownToPango('*foo\nbar*')).toBe('*foo\nbar*')
    })

    it('Protects asterisks inside inline code from italic processing', () => {
      const input = '*italic* and `*not italic*`'
      const expected = '<i>italic</i> and <span font_family="monospace">*not italic*</span>'
      expect(markdownToPango(input)).toBe(expected)
    })

    it('Protects asterisks inside code blocks from italic processing', () => {
      const input = '```\n*not italic*\n```'
      const expected = '<span font_family="monospace" size="small">\n*not italic*\n</span>'
      expect(markdownToPango(input)).toBe(expected)
    })

    it('Handles empty string', () => {
      expect(markdownToPango('')).toBe('')
    })

    it('Ignores unclosed bold tags', () => {
      expect(markdownToPango('**Unclosed bold text')).toBe('**Unclosed bold text')
    })

    it('Handles escaped markdown syntax (literal asterisks)', () => {
      expect(markdownToPango('\\*\\*literal asterisks\\*\\*')).toBe('**literal asterisks**')
    })

    it('Handles nested bold and italic', () => {
      expect(markdownToPango('**bold *italic* bold**')).toBe('<b>bold <i>italic</i> bold</b>')
    })

    it('Strips horizontal rules', () => {
      expect(markdownToPango('---\n***\n___\n- - -\n* * *\n_ _ _')).toBe('')
    })

    it('Preserves newlines', () => {
      expect(markdownToPango('Line 1\nLine 2')).toBe('Line 1\nLine 2')
    })
  })

  describe('parseCodeBlock', () => {
    it('parses a simple code block', () => {
      const input = '```typescript\nconst a = 1;\n```'
      const result = parseCodeBlock(input)
      expect(result.language).toBe('typescript')
      expect(result.code).toBe('const a = 1;')
    })

    it('handles code blocks without language', () => {
      const input = '```\nplain text\n```'
      const result = parseCodeBlock(input)
      expect(result.language).toBe('')
      expect(result.code).toBe('plain text')
    })

    it('handles unclosed code blocks', () => {
      const input = '```js\nconsole.log("hi");'
      const result = parseCodeBlock(input)
      expect(result.language).toBe('js')
      expect(result.code).toBe('console.log("hi");')
    })
  })

  describe('parseTable', () => {
    it('parses a basic markdown table', () => {
      const input = '| Header 1 | Header 2 |\n| --- | --- |\n| Row 1 Col 1 | Row 1 Col 2 |\n| Row 2 Col 1 | Row 2 Col 2 |'
      const result = parseTable(input)
      expect(result.headers).toEqual(['Header 1', 'Header 2'])
      expect(result.rows).toEqual([
        ['Row 1 Col 1', 'Row 1 Col 2'],
        ['Row 2 Col 1', 'Row 2 Col 2']
      ])
    })

    it('normalizes row lengths to match headers', () => {
      const input = '| H1 | H2 |\n| --- | --- |\n| R1 |\n| R2 | C2 | C3 |'
      const result = parseTable(input)
      expect(result.headers).toEqual(['H1', 'H2'])
      expect(result.rows).toEqual([
        ['R1', ''],
        ['R2', 'C2']
      ])
    })
  })

  describe('parseMarkdownChunks', () => {
    it('splits text and code blocks', () => {
      const input = 'Intro text\n```js\ncode\n```\nOutro text'
      const chunks = parseMarkdownChunks(input)
      expect(chunks).toHaveLength(3)
      expect(chunks[0]).toEqual({ type: 'text', content: 'Intro text' })
      expect(chunks[1]).toEqual({ type: 'code', content: '```js\ncode\n```' })
      expect(chunks[2]).toEqual({ type: 'text', content: 'Outro text' })
    })

    it('identifies tables', () => {
      const input = 'Text before\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nText after'
      const chunks = parseMarkdownChunks(input)
      expect(chunks).toHaveLength(3)
      expect(chunks[1].type).toBe('table')
      expect(chunks[1].content).toContain('| A | B |')
    })

    it('handles nested code blocks correctly', () => {
      const input = '````markdown\n```js\nconst x = 1;\n```\n````'
      const chunks = parseMarkdownChunks(input)
      expect(chunks).toHaveLength(1)
      expect(chunks[0].type).toBe('code')
      expect(chunks[0].content).toBe(input)
    })
  })
})
