import { buildDuckDuckGoUrl, buildWikipediaUrl, mergeResults, parseDuckDuckGoResults, parseWikipediaResults, stripHtml, wikipediaLanguage } from '@/lib/tools/websearch.js'

describe('stripHtml', () => {
  it('removes tags and decodes entities', () => {
    expect(stripHtml('A <span class="x">b</span> &amp; c&#039;s &#x263A; &quot;d&quot;')).toBe('A b & c\'s ☺ "d"')
  })
})

describe('wikipediaLanguage', () => {
  it('uses the first real locale', () => {
    expect(wikipediaLanguage(['fr_FR.UTF-8', 'fr_FR', 'fr', 'C'])).toBe('fr')
  })

  it('falls back to English', () => {
    expect(wikipediaLanguage(['C', 'POSIX'])).toBe('en')
    expect(wikipediaLanguage([])).toBe('en')
  })
})

describe('Wikipedia results', () => {
  it('builds the API URL', () => {
    expect(buildWikipediaUrl('fr', 'gnome shell', 3)).toBe('https://fr.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=3&srsearch=gnome%20shell')
  })

  it('maps search hits to article URLs', () => {
    const json = JSON.stringify({ query: { search: [{ title: 'Adwaita (design language)', snippet: 'migrated to <span class="searchmatch">libadwaita</span>' }, { snippet: 'no title' }] } })
    expect(parseWikipediaResults(json, 'en')).toEqual([
      { title: 'Adwaita (design language)', url: 'https://en.wikipedia.org/wiki/Adwaita_(design_language)', snippet: 'migrated to libadwaita' }
    ])
  })
})

describe('DuckDuckGo instant answers', () => {
  it('builds the API URL', () => {
    expect(buildDuckDuckGoUrl('gnome desktop')).toBe('https://api.duckduckgo.com/?q=gnome%20desktop&format=json&no_html=1&skip_disambig=1&no_redirect=1')
  })

  it('keeps the abstract, official results and external topics', () => {
    const json = JSON.stringify({
      Heading: 'GNOME',
      AbstractText: 'GNOME is a desktop environment.',
      AbstractURL: 'https://en.wikipedia.org/wiki/GNOME',
      Results: [{ FirstURL: 'https://www.gnome.org/', Text: 'Official site' }],
      RelatedTopics: [
        { FirstURL: 'https://duckduckgo.com/GNOME_Foundation', Text: 'GNOME Foundation - a non-profit' },
        { Topics: [{ FirstURL: 'https://gtk.org/', Text: 'GTK - toolkit' }] }
      ]
    })
    expect(parseDuckDuckGoResults(json)).toEqual([
      { title: 'GNOME', url: 'https://en.wikipedia.org/wiki/GNOME', snippet: 'GNOME is a desktop environment.' },
      { title: 'Official site', url: 'https://www.gnome.org/', snippet: 'Official site' },
      { title: 'GTK', url: 'https://gtk.org/', snippet: 'GTK - toolkit' }
    ])
  })

  it('returns nothing for an empty answer', () => {
    expect(parseDuckDuckGoResults(JSON.stringify({ Heading: '', RelatedTopics: [] }))).toEqual([])
  })
})

describe('mergeResults', () => {
  it('drops duplicates across lists and limits the total', () => {
    const a = [{ title: 'A', url: 'https://x.org/a', snippet: '' }]
    const b = [{ title: 'A again', url: 'http://x.org/a/', snippet: '' }, { title: 'B', url: 'https://x.org/b', snippet: '' }]
    expect(mergeResults([a, b])).toEqual([a[0], b[1]])
    expect(mergeResults([a, b], 1)).toEqual([a[0]])
  })
})
