const ACTIVITY_LABELS: Record<string, string> = {
  add_observations: 'Saving to memory',
  calculate: 'Calculating',
  create_entities: 'Saving to memory',
  create_relations: 'Saving to memory',
  deepsearch_followup: 'Checking for gaps',
  deepsearch_plan: 'Planning research',
  deepsearch_select: 'Selecting relevant passages',
  delete_entities: 'Updating memory',
  delete_observations: 'Updating memory',
  delete_relations: 'Updating memory',
  fetch_rss_feed: 'Reading feed',
  fetch_web_page: 'Reading web page',
  get_app_details: 'Reading app details',
  get_current_datetime: 'Checking the time',
  get_system_info: 'Reading system information',
  get_user_timezone: 'Checking the time zone',
  launch_app: 'Launching app',
  launch_app_action: 'Launching app action',
  list_directory: 'Listing folder',
  list_installed_apps: 'Listing apps',
  open_nodes: 'Reading memory',
  read_file: 'Reading file',
  read_graph: 'Reading memory',
  render_html: 'Rendering preview',
  roll_die: 'Rolling dice',
  run_shell_command: 'Running command',
  run_skill: 'Delegating to a skill',
  search_files: 'Searching files',
  search_nodes: 'Searching memory',
  search_vector_index: 'Searching indexed files',
  web_search: 'Searching the web'
}

const DETAIL_KEYS = ['question', 'query', 'url', 'path', 'command', 'expression', 'name', 'app_id', 'task']
const DETAIL_MAX_CHARS = 60

export function toolActivityDetail(args?: Record<string, unknown>): string {
  if (!args) {
    return ''
  }
  for (const key of DETAIL_KEYS) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      const text = value.trim().replace(/\s+/g, ' ')
      return text.length > DETAIL_MAX_CHARS ? `${text.slice(0, DETAIL_MAX_CHARS - 1)}…` : text
    }
  }
  return ''
}

export function toolActivityLabel(name: string, mcpLabel?: string): string {
  return ACTIVITY_LABELS[name] ?? (mcpLabel ? `Calling ${mcpLabel}` : `Running ${name}`)
}

export function isToolError(content: string): boolean {
  return content.startsWith('Error') || content.startsWith('Failed') || content.includes('failed:')
}
