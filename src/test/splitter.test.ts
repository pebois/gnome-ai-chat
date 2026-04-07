import { RecursiveCharacterTextSplitter } from '@/lib/splitter.js'

describe('RecursiveCharacterTextSplitter', () => {
  it('splits text correctly with default settings', () => {
    const text = 'a'.repeat(2500)
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })
    const chunks = splitter.splitText(text)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].length).toBeLessThanOrEqual(1000)
  })

  it('respects the chunk overlap', () => {
    const text = '1234567890'.repeat(100) // 1000 chars
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 600, chunkOverlap: 100 })
    const chunks = splitter.splitText(text)

    expect(chunks.length).toBeGreaterThan(1)

    const chunk1 = chunks[0]
    const chunk2 = chunks[1]

    const overlapText = chunk1.slice(chunk1.length - 100)
    expect(chunk2.startsWith(overlapText)).toBe(true)
  })

  it('splits text with newlines appropriately', () => {
    const text = 'Line1\n\nLine2\n\nLine3\n\nLine4\n\nLine5'
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 10, chunkOverlap: 0 })
    const chunks = splitter.splitText(text)
    expect(chunks).toContain('Line1\n\n')
    expect(chunks).toContain('Line2\n\n')
    expect(chunks).toContain('Line3\n\n')
  })

  it('handles empty string', () => {
    const splitter = new RecursiveCharacterTextSplitter()
    const chunks = splitter.splitText('')
    expect(chunks).toEqual([])
  })

  it('does not split if text is shorter than chunk size', () => {
    const text = 'Short text'
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })
    const chunks = splitter.splitText(text)
    expect(chunks).toEqual(['Short text'])
  })
})
