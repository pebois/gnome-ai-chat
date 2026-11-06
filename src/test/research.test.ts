import type { Passage } from '@/lib/agent/research.js'
import { buildReportPrompt, htmlToText, mapWithConcurrency, parseFollowUps, parsePlan, queryTerms, recentContext, RESEARCH_MAX_QUERIES, RESEARCH_PASSAGES_PER_PAGE, researchBudget, scorePassage, selectPassages } from '@/lib/agent/research.js'

describe('htmlToText', () => {
  it('extracts the title and readable text', () => {
    const html = `<html><head><title>GNOME &amp; GTK</title><style>p{}</style></head>
      <body><nav>Menu</nav><header>Top</header><h1>Hello</h1><p>First <b>para</b>.</p><script>alert(1)</script>
      <ul><li>One</li><li>Two</li></ul><footer>Bottom</footer><!-- hidden --></body></html>`
    expect(htmlToText(html)).toEqual({ title: 'GNOME & GTK', text: 'Hello\nFirst para.\nOne\nTwo' })
  })
})

describe('plan parsing', () => {
  it('keeps distinct, non-empty queries up to the limit', () => {
    const json = JSON.stringify({ queries: ['a', ' a ', '', 'b', 'c', 'd', 'e', 42] })
    expect(parsePlan(json, 'q')).toEqual(['a', 'b', 'c', 'd'].slice(0, RESEARCH_MAX_QUERIES))
  })

  it('falls back to the question', () => {
    expect(parsePlan('not json', 'my question')).toEqual(['my question'])
    expect(parsePlan('{"queries": []}', 'my question')).toEqual(['my question'])
  })

  it('parses follow-ups', () => {
    expect(parseFollowUps('{"followUps": ["x", "y", "z"]}')).toEqual(['x', 'y'])
    expect(parseFollowUps('{}')).toEqual([])
  })
})

describe('passage scoring and selection', () => {
  it('drops stop words from query terms', () => {
    expect(queryTerms('What is the GNOME release schedule?')).toEqual(['gnome', 'release', 'schedule'])
  })

  it('scores by term overlap', () => {
    expect(scorePassage('GNOME release notes', ['gnome', 'release', 'schedule'])).toBeCloseTo(2 / 3)
    expect(scorePassage('anything', [])).toBe(0)
  })

  it('takes the best passages per page within the budget, in page order', () => {
    const passages: Passage[] = [
      { url: 'u1', title: 'One', text: 'a'.repeat(10) },
      { url: 'u1', title: 'One', text: 'b'.repeat(10) },
      { url: 'u2', title: 'Two', text: 'c'.repeat(10) },
      { url: 'u1', title: 'One', text: 'd'.repeat(10) },
      { url: 'u1', title: 'One', text: 'e'.repeat(10) },
      { url: 'u3', title: 'Three', text: 'f'.repeat(50) }
    ]
    const scores = [0.9, 0.1, 0.8, 0.7, 0.6, 0.95]
    const sources = selectPassages(passages, scores, 45)
    expect(sources.map((s) => {
      return s.url
    })).toEqual(['u1', 'u2'])
    expect(sources[0].passages).toEqual(['a'.repeat(10), 'd'.repeat(10), 'e'.repeat(10)])
    expect(sources[0].passages.length).toBeLessThanOrEqual(RESEARCH_PASSAGES_PER_PAGE)
  })

  it('derives the budget from the context size', () => {
    expect(researchBudget(4096)).toBeGreaterThan(0)
    expect(researchBudget(8192)).toBe(researchBudget(4096) * 2)
  })
})

describe('buildReportPrompt', () => {
  const sources = [
    { url: 'https://a.org', title: 'A [draft]', passages: ['p1', 'p2'] },
    { url: 'https://b.org', title: '', passages: ['p3'] }
  ]

  it('numbers sources and asks for no Sources section when pages were read', () => {
    const prompt = buildReportPrompt('Why?', sources)
    expect(prompt).toContain('[1] A [draft] (https://a.org)\np1\n…\np2')
    expect(prompt).toContain('[2] https://b.org (https://b.org)\np3')
    expect(prompt).toContain('Do not add a sources or references list')
    expect(prompt).not.toContain('## Sources')
  })

  it('asks for a Sources section when only snippets are available', () => {
    const prompt = buildReportPrompt('Why?', sources, true)
    expect(prompt).toContain('1. [A draft](https://a.org)\n2. [https://b.org](https://b.org)')
    expect(prompt).toContain('## Sources')
  })

  it('mentions when only snippets are available', () => {
    expect(buildReportPrompt('Why?', [], true)).toContain('only search result snippets')
  })
})

describe('mapWithConcurrency', () => {
  it('keeps order and limits parallelism', async () => {
    let running = 0
    let peak = 0
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => {
        setTimeout(resolve, 5)
      })
      running--
      return n * 10
    })
    expect(results).toEqual([10, 20, 30, 40, 50])
    expect(peak).toBe(2)
  })
})

describe('recentContext', () => {
  it('summarizes the turns before the question', () => {
    const messages = [
      { role: 'user', content: 'Hi' },
      { role: 'tool', content: 'ignored' },
      { role: 'assistant', content: 'Hello   there' },
      { role: 'user', content: 'the question' }
    ]
    expect(recentContext(messages)).toBe('USER: Hi\nASSISTANT: Hello there')
  })
})
