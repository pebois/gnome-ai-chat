import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import { createResetButton } from '@/app/window/preferences/utils.js'
import type { AppInterface } from '@/lib/app.js'
import { DEFAULT_OLLAMA_URL, DEFAULT_STREAM, DEFAULT_THINK } from '@/lib/constants.js'
import { think_types } from '@/lib/db/types.js'

export function createGeneralPage(app: AppInterface): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'General',
    icon_name: 'preferences-system-symbolic'
  })

  const group = new Adw.PreferencesGroup({
    title: 'Connection'
  })
  page.add(group)

  const urlRow = new Adw.EntryRow({
    title: 'API URL',
    text: app.settings.url
  })
  const urlReset = createResetButton(() => {
    urlRow.set_text(DEFAULT_OLLAMA_URL)
  })
  urlReset.sensitive = app.settings.url !== DEFAULT_OLLAMA_URL
  urlRow.connect('notify::text', () => {
    const val = urlRow.get_text()
    app.settings.url = val
    app.saveSettings()
    urlReset.sensitive = val !== DEFAULT_OLLAMA_URL
  })
  urlRow.add_suffix(urlReset)
  group.add(urlRow)

  const searchGroup = new Adw.PreferencesGroup({
    title: 'Web Search',
    description: 'Lets models search the web with the web_search tool, through a SearXNG instance with the JSON format enabled. Leave empty to disable.'
  })
  page.add(searchGroup)

  const searchRow = new Adw.EntryRow({
    title: 'SearXNG URL',
    text: app.settings.searchUrl ?? ''
  })
  searchRow.connect('notify::text', () => {
    app.settings.searchUrl = searchRow.get_text().trim()
    app.saveSettings()
  })
  searchGroup.add(searchRow)

  const behaviorGroup = new Adw.PreferencesGroup({
    title: 'Behavior'
  })
  page.add(behaviorGroup)

  const streamRow = new Adw.SwitchRow({
    title: 'Real-time Streaming',
    active: app.settings.stream
  })
  const streamReset = createResetButton(() => {
    streamRow.active = DEFAULT_STREAM
  })
  streamReset.sensitive = app.settings.stream !== DEFAULT_STREAM
  streamRow.connect('notify::active', () => {
    app.settings.stream = streamRow.active
    app.saveSettings()
    streamReset.sensitive = streamRow.active !== DEFAULT_STREAM
  })
  streamRow.add_suffix(streamReset)
  behaviorGroup.add(streamRow)

  const thinkGroup = new Adw.PreferencesGroup({
    title: 'Reasoning'
  })
  page.add(thinkGroup)

  const thinkRow = new Adw.ComboRow({
    title: 'Reasoning Effort',
    model: Gtk.StringList.new([...think_types]),
    selected: think_types.indexOf(app.settings.think ?? DEFAULT_THINK)
  })
  const thinkReset = createResetButton(() => {
    thinkRow.selected = think_types.indexOf(DEFAULT_THINK)
  })
  thinkReset.sensitive = think_types[thinkRow.selected] !== DEFAULT_THINK
  thinkRow.connect('notify::selected', () => {
    const val = think_types[thinkRow.selected]
    app.settings.think = val
    app.saveSettings()
    thinkReset.sensitive = val !== DEFAULT_THINK
  })
  thinkRow.add_suffix(thinkReset)
  thinkGroup.add(thinkRow)

  return page
}
