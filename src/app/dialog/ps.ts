import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import { EmptyPage } from '@/app/page/empty.js'
import type { AppInterface } from '@/lib/app.js'
import { poll } from '@/lib/timeout.js'
import { formatSize } from '@/lib/utils.js'

export function showRunningModelsDialog(app: AppInterface): void {
  const dialog = new Adw.Dialog({
    title: 'Running Models',
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
    margin_bottom: 24,
    margin_start: 12,
    margin_end: 12
  })

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 24
  })

  const runningGroup = new Adw.PreferencesGroup({
    title: 'Currently Loaded Models'
  })
  box.append(runningGroup)

  const emptyPage = new EmptyPage(app, {
    icon_name: 'view-refresh-symbolic',
    title: 'No models loaded',
    description: 'Models will appear here when they are active in memory',
    visible: false,
    vexpand: true
  })

  box.append(emptyPage.widget)

  const modelRows = new Map<string, Adw.ExpanderRow>()
  const totalSuffixLabels = new Map<string, Gtk.Label>()
  const vramLabels = new Map<string, Gtk.Label>()
  const cpuLabels = new Map<string, Gtk.Label>()
  const expiryLabels = new Map<string, Gtk.Label>()

  async function updateContent(): Promise<void> {
    try {
      const response = await app.provider.ps()
      const models = response?.models || []

      if (models.length === 0) {
        runningGroup.visible = false
        emptyPage.widget.visible = true
        return
      }

      runningGroup.visible = true
      emptyPage.widget.visible = false

      const runningNames = new Set(models.map((m) => {
        return m.name
      }))
      for (const name of modelRows.keys()) {
        if (!runningNames.has(name)) {
          const row = modelRows.get(name)
          if (row) {
            runningGroup.remove(row)
          }
          modelRows.delete(name)
          totalSuffixLabels.delete(name)
          vramLabels.delete(name)
          cpuLabels.delete(name)
          expiryLabels.delete(name)
        }
      }

      for (const model of models) {
        let row = modelRows.get(model.name)
        if (!row) {
          row = new Adw.ExpanderRow({
            title: model.name
          })

          const totalSuffixLabel = new Gtk.Label()
          totalSuffixLabel.add_css_class('dim-label')
          row.add_suffix(totalSuffixLabel)

          const vramRow = new Adw.ActionRow({ title: 'VRAM Usage' })
          const vramLabel = new Gtk.Label()
          vramLabel.add_css_class('dim-label')
          vramRow.add_suffix(vramLabel)
          row.add_row(vramRow)

          const cpuRow = new Adw.ActionRow({ title: 'CPU Usage' })
          const cpuLabel = new Gtk.Label()
          cpuLabel.add_css_class('dim-label')
          cpuRow.add_suffix(cpuLabel)
          row.add_row(cpuRow)

          const expiryRow = new Adw.ActionRow({ title: 'Expires In' })
          const expiryLabel = new Gtk.Label()
          expiryLabel.add_css_class('dim-label')
          expiryRow.add_suffix(expiryLabel)
          row.add_row(expiryRow)

          runningGroup.add(row)

          modelRows.set(model.name, row)
          totalSuffixLabels.set(model.name, totalSuffixLabel)
          vramLabels.set(model.name, vramLabel)
          cpuLabels.set(model.name, cpuLabel)
          expiryLabels.set(model.name, expiryLabel)
        }

        const vramSize = model.size_vram
        const cpuSize = model.size - model.size_vram
        const totalSize = model.size

        const vramPct = totalSize > 0 ? ((vramSize / totalSize) * 100).toFixed(1) : '0.0'
        const cpuPct = totalSize > 0 ? ((cpuSize / totalSize) * 100).toFixed(1) : '0.0'

        totalSuffixLabels.get(model.name)!.set_label(formatSize(totalSize))
        vramLabels.get(model.name)!.set_label(`${formatSize(vramSize)} (${vramPct}%)`)
        cpuLabels.get(model.name)!.set_label(`${formatSize(cpuSize)} (${cpuPct}%)`)

        const expiresAt = new Date(model.expires_at)
        const now = new Date()
        const diffMs = expiresAt.getTime() - now.getTime()
        const diffMins = Math.round(diffMs / 60000)
        expiryLabels.get(model.name)!.set_label(`${diffMins}m`)
      }
    } catch (err) {
      console.error('Failed to update running models:', err)
    }
  }

  const stopPolling = poll(() => {
    return updateContent()
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
