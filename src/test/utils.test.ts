import { convertMessageToTitle, convertSummaryToTitle, cosineSimilarity, formatDuration, formatModelName, formatRemainingTime, formatSize, markdownToPango, selectDefaultModel } from '@/lib/utils.js'

describe('utils', () => {
  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(500.5)).toBe('500.5ms')
    })

    it('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5s')
    })

    it('formats minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1m 5s')
    })

    it('formats exactly one minute', () => {
      expect(formatDuration(60000)).toBe('1m 0s')
    })

    it('handles zero', () => {
      expect(formatDuration(0)).toBe('0.0ms')
    })
  })

  describe('formatRemainingTime', () => {
    it('formats seconds', () => {
      expect(formatRemainingTime(45)).toBe('45s')
      expect(formatRemainingTime(59.4)).toBe('59s')
    })

    it('rounds seconds up to next minute if applicable', () => {
      expect(formatRemainingTime(59.6)).toBe('1m 0s')
    })

    it('formats minutes and seconds', () => {
      expect(formatRemainingTime(65)).toBe('1m 5s')
      expect(formatRemainingTime(120)).toBe('2m 0s')
    })

    it('handles zero', () => {
      expect(formatRemainingTime(0)).toBe('0s')
    })
  })

  describe('formatSize', () => {
    it('formats bytes', () => {
      expect(formatSize(500)).toBe('500.00 B')
    })

    it('formats kilobytes', () => {
      expect(formatSize(1024)).toBe('1.00 KB')
      expect(formatSize(1536)).toBe('1.50 KB')
    })

    it('formats megabytes', () => {
      expect(formatSize(1024 * 1024)).toBe('1.00 MB')
      expect(formatSize(1024 * 1024 * 2.5)).toBe('2.50 MB')
    })

    it('formats gigabytes', () => {
      expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB')
      expect(formatSize(1024 * 1024 * 1024 * 8.75)).toBe('8.75 GB')
    })

    it('formats terabytes', () => {
      expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB')
    })

    it('handles zero', () => {
      expect(formatSize(0)).toBe('0.00 B')
    })
  })

  describe('selectDefaultModel', () => {
    it('Empty array or missing array', () => {
      expect(selectDefaultModel([])).toBe('gpt-oss:latest')
    })

    it('Handles undefined or null array', () => {
      expect(selectDefaultModel(undefined as unknown as string[])).toBe('gpt-oss:latest')
      expect(selectDefaultModel(null as unknown as string[])).toBe('gpt-oss:latest')
    })

    it('Default model is present', () => {
      expect(selectDefaultModel(['some-model', 'gpt-oss:latest'])).toBe('gpt-oss:latest')
    })

    it('Prefers non-embed model', () => {
      expect(selectDefaultModel(['mxbai-embed-large', 'llama3'])).toBe('llama3')
    })

    it('Picks the first non-embed model when default is absent', () => {
      expect(selectDefaultModel(['mistral-embed', 'llama3', 'mistral'])).toBe('llama3')
    })

    it('Falls back to first if all embed', () => {
      expect(selectDefaultModel(['nomic-embed-text'])).toBe('nomic-embed-text')
    })

    it('Default model match is case-insensitive', () => {
      expect(selectDefaultModel(['GPT-OSS:LATEST'])).toBe('gpt-oss:latest')
    })
  })

  describe('formatModelName', () => {
    it('Strips :latest from model name', () => {
      expect(formatModelName('llama3:latest')).toBe('llama3')
    })

    it('Strips specific tag from model name', () => {
      expect(formatModelName('llama3:8b')).toBe('llama3')
    })

    it('Handles strings with multiple colons', () => {
      expect(formatModelName('my-registry:5000/model:latest')).toBe('my-registry')
    })

    it('Handles empty string', () => {
      expect(formatModelName('')).toBe('')
    })

    it('Handles model name without colon', () => {
      expect(formatModelName('llama3')).toBe('llama3')
    })
  })

  describe('convertMessageToTitle', () => {
    it('returns the first line of a multiline message', () => {
      expect(convertMessageToTitle('First line\nSecond line')).toBe('First line')
    })

    it('trims leading and trailing whitespace from the first line', () => {
      expect(convertMessageToTitle('  Hello World  \nHow are you?')).toBe('Hello World')
    })

    it('handles a single line message', () => {
      expect(convertMessageToTitle('Just a simple title')).toBe('Just a simple title')
    })

    it('handles an empty string', () => {
      expect(convertMessageToTitle('')).toBe('')
    })

    it('handles lines with only whitespace', () => {
      expect(convertMessageToTitle('   \nSecond line')).toBe('Second line')
    })

    it('handles emojis and unicode safely', () => {
      expect(convertMessageToTitle('👋 Hello World\nLine 2')).toBe('👋 Hello World')
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
      expect(markdownToPango('```\\nBlock\\n```')).toBe('<span font_family="monospace" size="small">\\nBlock\\n</span>')
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

  describe('convertSummaryToTitle', () => {
    it('Combines emoji and title', () => {
      expect(convertSummaryToTitle({ title: 'Hello World', emoji: '👋' })).toBe('👋 Hello World')
    })

    it('Uses only the first emoji if multiple are provided', () => {
      expect(convertSummaryToTitle({ title: 'Multiple Emojis', emoji: '👋🤖' })).toBe('👋 Multiple Emojis')
    })

    it('Handles multi-byte emojis (surrogate pairs) correctly', () => {
      expect(convertSummaryToTitle({ title: 'Robot', emoji: '🤖' })).toBe('🤖 Robot')
    })

    it('Handles missing emoji gracefully', () => {
      expect(convertSummaryToTitle({ title: 'No Emoji', emoji: '' })).toBe('No Emoji')
    })
  })

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0)
    })

    it('returns 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0)
    })

    it('returns -1 for opposite vectors', () => {
      expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1.0)
    })

    it('returns 0 for arrays of different lengths', () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
    })

    it('returns 0 for empty arrays', () => {
      expect(cosineSimilarity([], [])).toBe(0)
    })

    it('returns 0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
      expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0)
    })

    it('calculates correct similarity for generic vectors', () => {
      // Vector A: [1, 0, -1], Vector B: [2, 8, 1]
      // dot product = (1*2) + (0*8) + (-1*1) = 2 - 1 = 1
      // normA = sqrt(1^2 + 0^2 + (-1)^2) = sqrt(2)
      // normB = sqrt(2^2 + 8^2 + 1^2) = sqrt(4 + 64 + 1) = sqrt(69)
      // sim = 1 / sqrt(138) ≈ 0.085125...
      expect(cosineSimilarity([1, 0, -1], [2, 8, 1])).toBeCloseTo(0.085125)
    })
  })
})
