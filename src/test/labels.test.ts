import { isToolError, toolActivityDetail, toolActivityLabel } from '@/lib/tools/labels.js'

describe('tool activity labels', () => {
  it('uses a friendly label for built-in tools', () => {
    expect(toolActivityLabel('fetch_web_page')).toBe('Reading web page')
  })

  it('labels a delegation with its task', () => {
    expect(toolActivityLabel('run_skill')).toBe('Delegating to a skill')
    expect(toolActivityDetail({ skill: 'Files', task: 'Find the config file' })).toBe('Find the config file')
  })

  it('uses the MCP label for MCP tools', () => {
    expect(toolActivityLabel('mcp__github__search', 'GitHub: search')).toBe('Calling GitHub: search')
  })

  it('falls back to the tool name', () => {
    expect(toolActivityLabel('unknown_tool')).toBe('Running unknown_tool')
  })

  it('picks the most useful argument as detail', () => {
    expect(toolActivityDetail({ limit: 3, query: '  gnome   apps ' })).toBe('gnome apps')
    expect(toolActivityDetail({ url: 'https://example.com' })).toBe('https://example.com')
    expect(toolActivityDetail({ count: 2 })).toBe('')
    expect(toolActivityDetail(undefined)).toBe('')
  })

  it('truncates long details', () => {
    const detail = toolActivityDetail({ command: 'x'.repeat(100) })
    expect(detail.length).toBe(60)
    expect(detail.endsWith('…')).toBe(true)
  })

  it('detects tool errors', () => {
    expect(isToolError('Error: nope')).toBe(true)
    expect(isToolError('Request failed: 404')).toBe(true)
    expect(isToolError('All good')).toBe(false)
  })
})
