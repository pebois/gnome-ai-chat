import { buildSearxngUrl, parseSearxngResults } from '@/lib/tools/searxng.js'

describe('buildSearxngUrl', () => {
  it('builds a JSON search URL', () => {
    expect(buildSearxngUrl('https://search.example.org/', 'gtk 4 & adw')).toBe('https://search.example.org/search?q=gtk%204%20%26%20adw&format=json')
  })

  it('accepts a base URL that already ends with /search', () => {
    expect(buildSearxngUrl('http://localhost:8888/search', 'x')).toBe('http://localhost:8888/search?q=x&format=json')
  })
})

describe('parseSearxngResults', () => {
  it('maps results and skips entries without a URL', () => {
    const json = JSON.stringify({
      results: [
        { title: ' GTK ', url: 'https://gtk.org', content: ' Toolkit ' },
        { title: 'No URL' },
        { url: 'https://gnome.org' }
      ]
    })
    expect(parseSearxngResults(json)).toEqual([
      { title: 'GTK', url: 'https://gtk.org', snippet: 'Toolkit' },
      { title: '', url: 'https://gnome.org', snippet: '' }
    ])
  })

  it('limits the number of results', () => {
    const json = JSON.stringify({ results: Array.from({ length: 20 }, (_, i) => {
      return { url: `https://e.org/${i}` }
    }) })
    expect(parseSearxngResults(json, 3)).toHaveLength(3)
  })

  it('handles a response without results', () => {
    expect(parseSearxngResults('{}')).toEqual([])
  })
})
