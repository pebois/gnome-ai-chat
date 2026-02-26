import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/app/index.js'
import { poll } from '@/lib/timeout.js'
import { formatDuration } from '@/lib/utils.js'

export function showStatsDialog(app: AppInterface): void {
  const dialog = new Adw.Dialog({
    title: 'Performance Stats',
    content_width: 500,
    content_height: 500
  })

  const toolbarView = new Adw.ToolbarView()
  const headerBar = new Adw.HeaderBar()
  headerBar.add_css_class('flat')
  toolbarView.add_top_bar(headerBar)

  const scrolled = new Gtk.ScrolledWindow({
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER
  })

  const clamp = new Adw.Clamp({
    maximum_size: 450,
    margin_top: 24,
    margin_bottom: 0,
    margin_start: 12,
    margin_end: 12
  })

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 24,
    margin_bottom: 24
  })

  const summaryGroup = new Adw.PreferencesGroup({ title: 'Summary' })
  const usageGroup = new Adw.PreferencesGroup({
    title: 'Model Usage',
    visible: false
  })

  box.append(summaryGroup)
  box.append(usageGroup)

  const wallTimeLabel = new Gtk.Label()
  const wallTimeRow = new Adw.ActionRow({ title: 'Uptime' })
  wallTimeRow.add_suffix(wallTimeLabel)
  summaryGroup.add(wallTimeRow)

  let isAgentExpander = false
  let agentActiveRow: Adw.ActionRow | Adw.ExpanderRow | null = null
  const agentActiveLabel = new Gtk.Label()
  const apiTimeLabel = new Gtk.Label()
  const toolTimeLabel = new Gtk.Label()

  const modelRows = new Map<string, Adw.ExpanderRow>()
  const modelSuffixLabels = new Map<string, Gtk.Label>()
  const modelReqsLabels = new Map<string, Gtk.Label>()
  const modelInputsLabels = new Map<string, Gtk.Label>()
  const modelOutputsLabels = new Map<string, Gtk.Label>()

  function updateContent(): void {
    const stats = app.tracker.getStats()

    wallTimeLabel.set_label(formatDuration(stats.wallTimeMs))
    wallTimeLabel.add_css_class('dim-label')

    const agentActiveTimeMs = stats.apiTimeMs + stats.toolTimeMs
    const shouldBeExpander = agentActiveTimeMs > 0

    if (!agentActiveRow || isAgentExpander !== shouldBeExpander) {
      if (agentActiveRow) {
        summaryGroup.remove(agentActiveRow)
      }
      isAgentExpander = shouldBeExpander

      if (shouldBeExpander) {
        agentActiveRow = new Adw.ExpanderRow({ title: 'Agent Active' })
        agentActiveRow.add_suffix(agentActiveLabel)

        const apiTimeRow = new Adw.ActionRow({ title: 'API Time' })
        apiTimeRow.add_suffix(apiTimeLabel)
        agentActiveRow.add_row(apiTimeRow)

        const toolTimeRow = new Adw.ActionRow({ title: 'Tool Time' })
        toolTimeRow.add_suffix(toolTimeLabel)
        agentActiveRow.add_row(toolTimeRow)
      } else {
        agentActiveRow = new Adw.ActionRow({ title: 'Agent Active' })
        agentActiveRow.add_suffix(agentActiveLabel)
      }
      summaryGroup.add(agentActiveRow)
    }

    agentActiveLabel.set_label(formatDuration(agentActiveTimeMs))
    agentActiveLabel.add_css_class('dim-label')

    if (shouldBeExpander) {
      const apiPct = ((stats.apiTimeMs / agentActiveTimeMs) * 100).toFixed(1)
      apiTimeLabel.set_label(`${formatDuration(stats.apiTimeMs)} (${apiPct}%)`)

      const toolPct = ((stats.toolTimeMs / agentActiveTimeMs) * 100).toFixed(1)
      toolTimeLabel.set_label(`${formatDuration(stats.toolTimeMs)} (${toolPct}%)`)
    }

    usageGroup.visible = stats.modelUsage.length > 0

    if (stats.modelUsage.length > 0) {
      const sortedUsage = [...stats.modelUsage].sort((a, b) => {
        return b.requests - a.requests
      })

      let totalRequests = 0
      for (const usage of sortedUsage) {
        totalRequests += usage.requests
      }

      for (const usage of sortedUsage) {
        let expanderRow = modelRows.get(usage.model)
        if (!expanderRow) {
          expanderRow = new Adw.ExpanderRow({ title: usage.model })

          const suffixLabel = new Gtk.Label()
          suffixLabel.add_css_class('dim-label')
          expanderRow.add_suffix(suffixLabel)

          const reqsLabel = new Gtk.Label()
          const reqsRow = new Adw.ActionRow({ title: 'Requests' })
          reqsRow.add_suffix(reqsLabel)
          expanderRow.add_row(reqsRow)

          const inputsLabel = new Gtk.Label()
          const inputsRow = new Adw.ActionRow({ title: 'Input Tokens' })
          inputsRow.add_suffix(inputsLabel)
          expanderRow.add_row(inputsRow)

          const outputsLabel = new Gtk.Label()
          const outputsRow = new Adw.ActionRow({ title: 'Output Tokens' })
          outputsRow.add_suffix(outputsLabel)
          expanderRow.add_row(outputsRow)

          usageGroup.add(expanderRow)

          modelRows.set(usage.model, expanderRow)
          modelSuffixLabels.set(usage.model, suffixLabel)
          modelReqsLabels.set(usage.model, reqsLabel)
          modelInputsLabels.set(usage.model, inputsLabel)
          modelOutputsLabels.set(usage.model, outputsLabel)
        } else {
          usageGroup.remove(expanderRow)
          usageGroup.add(expanderRow)
        }

        const reqsPct = totalRequests > 0 ? ((usage.requests / totalRequests) * 100).toFixed(1) : '0.0'
        const reqsText = `${usage.requests} req. (${reqsPct}%)`
        modelSuffixLabels.get(usage.model)!.set_label(reqsText)
        modelReqsLabels.get(usage.model)!.set_label(usage.requests.toLocaleString())
        modelInputsLabels.get(usage.model)!.set_label(usage.inputTokens.toLocaleString())
        modelOutputsLabels.get(usage.model)!.set_label(usage.outputTokens.toLocaleString())
      }
    }
  }

  const stopPolling = poll(() => {
    updateContent()
  }, 1000, true)

  dialog.connect('closed', () => {
    stopPolling()
  })

  clamp.set_child(box)
  scrolled.set_child(clamp)
  toolbarView.set_content(scrolled)
  dialog.set_child(toolbarView)
  dialog.present(app.window)
}
