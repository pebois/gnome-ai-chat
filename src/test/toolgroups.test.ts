import { areToolsEnabled, formatToolTitle, isCommandAvailable, isGroupEnabled, isToolEnabled, setGroupEnabled, setToolEnabled, TOOL_GROUPS } from '@/lib/tools/groups.js'

const BUILT_IN_TOOLS = [
  'add_observations', 'calculate', 'create_entities', 'create_relations', 'delete_entities', 'delete_observations',
  'delete_relations', 'fetch_rss_feed', 'fetch_web_page', 'get_app_details', 'get_current_datetime', 'get_system_info',
  'get_user_timezone', 'launch_app', 'launch_app_action', 'list_directory', 'list_installed_apps', 'open_nodes',
  'read_file', 'read_graph', 'render_html', 'roll_die', 'run_shell_command', 'search_files', 'search_nodes',
  'search_vector_index', 'web_search', 'write_file'
]

function group(id: string) {
  return TOOL_GROUPS.find((g) => {
    return g.id === id
  })!
}

describe('tool groups', () => {
  it('covers every built-in tool but run_skill exactly once', () => {
    const names = TOOL_GROUPS.flatMap((g) => {
      return g.tools
    })
    expect(new Set(names).size).toBe(names.length)
    expect([...names].sort()).toEqual(BUILT_IN_TOOLS)
  })

  it('treats tools as enabled by default', () => {
    expect(isToolEnabled({ disabledTools: [] }, 'calculate')).toBe(true)
  })

  it('turns a tool off and on without duplicates', () => {
    const settings = { disabledTools: [] as string[] }
    setToolEnabled(settings, 'calculate', false)
    setToolEnabled(settings, 'calculate', false)
    expect(settings.disabledTools).toEqual(['calculate'])
    expect(isToolEnabled(settings, 'calculate')).toBe(false)
    setToolEnabled(settings, 'calculate', true)
    expect(settings.disabledTools).toEqual([])
  })

  it('turns a whole group off and on', () => {
    const settings = { disabledTools: ['web_search'] }
    const memory = group('memory')
    setGroupEnabled(settings, memory, false)
    expect(isGroupEnabled(settings, memory)).toBe(false)
    expect(settings.disabledTools).toHaveLength(memory.tools.length + 1)
    setGroupEnabled(settings, memory, true)
    expect(settings.disabledTools).toEqual(['web_search'])
  })

  it('keeps a group enabled while any of its tools is on', () => {
    const settings = { disabledTools: ['web_search', 'fetch_web_page'] }
    expect(isGroupEnabled(settings, group('web'))).toBe(true)
    setToolEnabled(settings, 'fetch_rss_feed', false)
    expect(isGroupEnabled(settings, group('web'))).toBe(false)
  })

  it('formats tool names as titles', () => {
    expect(formatToolTitle('read_file')).toBe('Read File')
    expect(formatToolTitle('get_current_datetime')).toBe('Get Current Datetime')
  })

  it('checks that every required tool is enabled', () => {
    const settings = { disabledTools: ['fetch_rss_feed'] }
    expect(areToolsEnabled(settings, [])).toBe(true)
    expect(areToolsEnabled(settings, ['read_graph'])).toBe(true)
    expect(areToolsEnabled(settings, ['read_graph', 'fetch_rss_feed'])).toBe(false)
  })

  it('hides commands whose required tools are turned off', () => {
    const settings = { disabledTools: ['read_graph'] }
    expect(isCommandAvailable({}, settings)).toBe(true)
    expect(isCommandAvailable({ requiredTools: ['fetch_rss_feed'] }, settings)).toBe(true)
    expect(isCommandAvailable({ requiredTools: ['read_graph', 'search_nodes'] }, settings)).toBe(false)
    expect(isCommandAvailable({ visible: false }, settings)).toBe(false)
  })
})
