import { convertMessageToTitle, convertSummaryToTitle, cosineSimilarity, formatDuration, formatMessageStats, formatModelName, formatRemainingTime, formatSize, getLanguageMetadata, selectDefaultModel } from '@/lib/utils.js'

describe('utils', () => {
  describe('getLanguageMetadata', () => {
    it('maps common extensions correctly', () => {
      expect(getLanguageMetadata('ts')).toEqual({ id: 'typescript', title: 'TypeScript' })
      expect(getLanguageMetadata('py')).toEqual({ id: 'python', title: 'Python' })
      expect(getLanguageMetadata('rs')).toEqual({ id: 'rust', title: 'Rust' })
    })

    it('handles special titles', () => {
      expect(getLanguageMetadata('c++')).toEqual({ id: 'cpp', title: 'C++' })
      expect(getLanguageMetadata('c#')).toEqual({ id: 'csharp', title: 'C#' })
    })

    it('handles fallbacks by capitalizing', () => {
      expect(getLanguageMetadata('customlang')).toEqual({ id: 'customlang', title: 'Customlang' })
    })

    it('handles empty or null input', () => {
      expect(getLanguageMetadata('')).toEqual({ id: 'text', title: 'Text' })
      expect(getLanguageMetadata(null as unknown as string)).toEqual({ id: 'text', title: 'Text' })
    })
  })

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

  describe('formatMessageStats', () => {
    it('shows model, speed, tokens and duration', () => {
      expect(formatMessageStats({ model: 'qwen3:8b', promptTokens: 100, outputTokens: 200, durationMs: 4200, evalDurationMs: 4000 }))
        .toBe('qwen3 · 50.0 tok/s · 200 tokens · 4.2 s')
    })

    it('omits values that are missing', () => {
      expect(formatMessageStats({ model: 'llama3', promptTokens: 0, outputTokens: 0, durationMs: 0, evalDurationMs: 0 })).toBe('llama3')
    })
  })
})
