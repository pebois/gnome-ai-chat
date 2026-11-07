import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import type { AppInterface } from '@/lib/app.js'
import { parseModelReference } from '@/lib/registry.js'
import { formatRemainingTime, formatSize } from '@/lib/utils.js'

export function showPullDialog(app: AppInterface, defaultModel?: string): void {
  let isPulling = false
  let cancellable: Gio.Cancellable | null = null
  let startTime = 0

  const dialog = new Adw.Dialog({
    title: 'Pull Model',
    content_width: 450
  })

  dialog.connect('closed', () => {
    if (isPulling && cancellable) {
      cancellable.cancel()
    }
  })

  const toolbarView = new Adw.ToolbarView()
  dialog.set_child(toolbarView)

  const headerBar = new Adw.HeaderBar()
  headerBar.add_css_class('flat')
  toolbarView.add_top_bar(headerBar)

  const clamp = new Adw.Clamp({
    maximum_size: 400,
    margin_top: 12,
    margin_bottom: 24,
    margin_start: 12,
    margin_end: 12
  })
  toolbarView.set_content(clamp)

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 24
  })
  clamp.set_child(box)

  const pullButton = new Gtk.Button({
    label: 'Pull',
    halign: Gtk.Align.CENTER,
    sensitive: !!defaultModel,
    css_classes: ['suggested-action', 'pill']
  })

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
    pullButton.sensitive = isPulling || modelEntry.text.trim() !== ''
  })

  const progressBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    visible: false
  })

  const titleBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12
  })

  const statusLabel = new Gtk.Label({
    halign: Gtk.Align.START,
    hexpand: true,
    ellipsize: Pango.EllipsizeMode.END,
    css_classes: ['caption-heading']
  })
  titleBox.append(statusLabel)

  const percentageLabel = new Gtk.Label({
    halign: Gtk.Align.END,
    css_classes: ['dim-label', 'caption', 'numeric']
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
    css_classes: ['dim-label', 'caption', 'numeric']
  })
  detailsBox.append(sizeLabel)

  const remainingTimeLabel = new Gtk.Label({
    halign: Gtk.Align.END,
    css_classes: ['dim-label', 'caption', 'numeric']
  })
  detailsBox.append(remainingTimeLabel)

  progressBox.append(detailsBox)

  box.append(progressBox)
  box.append(pullButton)

  const resetState = () => {
    isPulling = false
    cancellable = null
    startTime = 0
    modelEntry.sensitive = true
    pullButton.sensitive = modelEntry.text.trim() !== ''
    pullButton.label = 'Pull'
    pullButton.remove_css_class('destructive-action')
    pullButton.add_css_class('suggested-action')
    progressBox.visible = false
    progressBar.fraction = 0.0
    statusLabel.label = ''
    sizeLabel.label = ''
    percentageLabel.label = ''
    remainingTimeLabel.label = ''
  }

  const refreshModels = async (modelName: string, knownModels: string[]) => {
    if (!app.isLoaded) {
      void app.init()
      return
    }
    await app.reloadModels()
    const { name, tag } = parseModelReference(modelName)
    const pulledModel = `${name}:${tag}`
    if (!knownModels.includes(pulledModel) && app.toolModels.includes(pulledModel)) {
      app.chat.input.selectModel(pulledModel)
    }
    app.showToast(`Pulled ${pulledModel}`)
  }

  const startPull = () => {
    const modelName = modelEntry.text.trim()
    if (!modelName || isPulling) {
      return
    }

    isPulling = true
    modelEntry.sensitive = false
    pullButton.label = 'Stop'
    pullButton.remove_css_class('suggested-action')
    pullButton.add_css_class('destructive-action')
    progressBox.visible = true
    startTime = GLib.get_monotonic_time()

    cancellable = new Gio.Cancellable()
    const knownModels = [...app.models]

    app.provider.pull({
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
          void refreshModels(modelName, knownModels)
          dialog.close()
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
    if (isPulling && cancellable) {
      cancellable.cancel()
      return
    }
    startPull()
  })

  dialog.present(app.window)
  modelEntry.grab_focus()
}
