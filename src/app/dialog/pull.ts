import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { formatRemainingTime, formatSize } from '@/lib/utils.js'

export function showPullDialog(app: AppInterface, defaultModel?: string): void {
  let isPulling = false
  let cancellable: Gio.Cancellable | null = null
  let startTime = 0

  const window = new Adw.Window({
    title: 'Pull Model',
    modal: true,
    transient_for: app.window,
    width_request: 400,
    resizable: false
  })

  window.connect('close-request', () => {
    if (isPulling && cancellable) {
      cancellable.cancel()
    }
    return false
  })

  const toolbarView = new Adw.ToolbarView()
  window.set_content(toolbarView)

  const headerBar = new Adw.HeaderBar()
  toolbarView.add_top_bar(headerBar)

  const footer = new Gtk.ActionBar()
  toolbarView.add_bottom_bar(footer)

  const footerBox = new Gtk.Box({
    spacing: 12,
    homogeneous: true,
    hexpand: true,
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12
  })
  footer.set_center_widget(footerBox)

  const cancelButton = new Gtk.Button({
    label: 'Cancel',
    hexpand: true,
    css_classes: ['pill', 'flat']
  })
  cancelButton.connect('clicked', () => {
    if (isPulling && cancellable) {
      cancellable.cancel()
      resetState()
    } else {
      window.close()
    }
  })
  footerBox.append(cancelButton)

  const pullButton = new Gtk.Button({
    label: 'Pull',
    hexpand: true,
    css_classes: ['suggested-action', 'pill']
  })
  footerBox.append(pullButton)

  const clamp = new Adw.Clamp({
    maximum_size: 360,
    margin_top: 24,
    margin_bottom: 24,
    margin_start: 24,
    margin_end: 24
  })
  toolbarView.set_content(clamp)

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 16
  })
  clamp.set_child(box)

  const inputGroup = new Adw.PreferencesGroup()
  const modelEntry = new Adw.EntryRow({
    title: 'Model Name',
    text: defaultModel ?? '',
    activates_default: true
  })
  inputGroup.add(modelEntry)
  box.append(inputGroup)

  modelEntry.connect('entry-activated', () => {
    pullButton.activate()
  })

  modelEntry.connect('changed', () => {
    modelEntry.remove_css_class('error')
  })

  const progressBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    visible: false,
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12
  })

  const titleBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12
  })

  const statusLabel = new Gtk.Label({
    halign: Gtk.Align.START,
    hexpand: true,
    css_classes: ['caption-heading']
  })
  titleBox.append(statusLabel)

  const percentageLabel = new Gtk.Label({
    halign: Gtk.Align.END,
    css_classes: ['dim-label', 'caption', 'monospace', 'pull-caption']
  })
  titleBox.append(percentageLabel)

  progressBox.append(titleBox)

  const progressBar = new Gtk.ProgressBar({
    hexpand: true,
    valign: Gtk.Align.CENTER
  })
  progressBar.add_css_class('flat')
  progressBox.append(progressBar)

  const detailsBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12
  })

  const sizeLabel = new Gtk.Label({
    halign: Gtk.Align.START,
    hexpand: true,
    css_classes: ['dim-label', 'caption', 'monospace', 'pull-caption']
  })
  detailsBox.append(sizeLabel)

  const remainingTimeLabel = new Gtk.Label({
    halign: Gtk.Align.END,
    css_classes: ['dim-label', 'caption', 'monospace', 'pull-caption']
  })
  detailsBox.append(remainingTimeLabel)

  progressBox.append(detailsBox)

  box.append(progressBox)

  const resetState = () => {
    isPulling = false
    cancellable = null
    startTime = 0
    modelEntry.sensitive = true
    pullButton.sensitive = true
    progressBox.visible = false
    progressBar.fraction = 0.0
    statusLabel.label = ''
    sizeLabel.label = ''
    percentageLabel.label = ''
    remainingTimeLabel.label = ''
    cancelButton.label = 'Cancel'
    cancelButton.add_css_class('flat')
  }

  const startPull = () => {
    const modelName = modelEntry.text.trim()
    if (!modelName || isPulling) {
      return
    }

    isPulling = true
    modelEntry.sensitive = false
    pullButton.sensitive = false
    progressBox.visible = true
    cancelButton.label = 'Stop'
    cancelButton.remove_css_class('flat')
    startTime = GLib.get_monotonic_time()

    cancellable = new Gio.Cancellable()

    app.ollama.pull({
      model: modelName,
      stream: true,
      onProgress: (progress) => {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          try {
            if (typeof progress.total === 'number' && progress.total > 0) {
              const completed = progress.completed || 0
              const fraction = completed / progress.total
              progressBar.fraction = Math.max(0.0, Math.min(1.0, fraction))

              statusLabel.label = progress.status ? (progress.status.charAt(0).toUpperCase() + progress.status.slice(1)) : 'Downloading'
              percentageLabel.label = `${Math.round(fraction * 100)}%`
              sizeLabel.label = `${formatSize(completed)} / ${formatSize(progress.total)}`

              const elapsedSec = (GLib.get_monotonic_time() - startTime) / 1000000
              if (elapsedSec > 1 && completed > 0) {
                const speed = completed / elapsedSec
                const remainingBytes = progress.total - completed
                const remainingTime = remainingBytes / speed
                remainingTimeLabel.label = `${formatRemainingTime(remainingTime)} remaining`
              } else {
                remainingTimeLabel.label = ''
              }
            } else if (progress.status) {
              statusLabel.label = progress.status.charAt(0).toUpperCase() + progress.status.slice(1)
              sizeLabel.label = ''
              percentageLabel.label = ''
              remainingTimeLabel.label = ''
              if (progress.status === 'success') {
                progressBar.fraction = 1.0
              }
            }
          } catch (e) {
            console.error('Error updating progress UI:', e)
          }
          return GLib.SOURCE_REMOVE
        })
      },
      cancellable
    }).then(() => {
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        try {
          void app.init()
          window.close()
        } catch (e) {
          console.error('Error on pull success UI update:', e)
        }
        return GLib.SOURCE_REMOVE
      })
    }).catch((err) => {
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        try {
          if (err instanceof GLib.Error && err.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)) {
            app.showToast(`Pull cancelled for ${modelName}`, true)
          } else {
            app.showToast(`Failed to pull ${modelName}: ${err instanceof Error ? err.message : String(err)}`, true)
            modelEntry.add_css_class('error')
          }
          resetState()
        } catch (e) {
          console.error('Error on pull catch UI update:', e)
        }
        return GLib.SOURCE_REMOVE
      })
    })
  }

  pullButton.connect('clicked', () => {
    startPull()
  })

  window.present()
}
