import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'
import Pango from 'gi://Pango'

import { EmptyPage } from '@/app/page/empty.js'
import type { AppInterface } from '@/lib/app.js'
import { filesStore } from '@/lib/db/files.js'
import { poll } from '@/lib/timeout.js'
import { showDestructiveConfirmation } from '@/lib/ui.js'

export function showFilesDialog(app: AppInterface): void {
  const dialog = new Adw.Dialog({
    title: 'Indexed Folders',
    content_width: 500,
    content_height: 500
  })

  const toolbarView = new Adw.ToolbarView()
  const headerBar = new Adw.HeaderBar()
  headerBar.add_css_class('flat')
  toolbarView.add_top_bar(headerBar)

  const addBtn = new Gtk.Button({
    icon_name: 'folder-new-symbolic',
    tooltip_text: 'Add Folder',
    valign: Gtk.Align.CENTER
  })
  addBtn.connect('clicked', () => {
    const fileDialog = new Gtk.FileDialog({
      title: 'Select Folder to Index',
      accept_label: 'Select'
    })
    fileDialog.select_multiple_folders(app.window, null, async (_obj, res) => {
      try {
        const fileList = fileDialog.select_multiple_folders_finish(res)
        const nFiles = fileList.get_n_items()
        for (let i = 0; i < nFiles; i++) {
          const file = fileList.get_item(i) as Gio.File
          const path = file.get_path()
          if (path) {
            await filesStore.addPath(path)
            void filesStore.indexPath(app.ollama, path)
          }
        }
      } catch {
        return
      }
    })
  })
  headerBar.pack_start(addBtn)

  let indexingActive = false
  let indexingFraction = 0

  const indexingId = app.connect('files-indexing-changed', (_, active, fraction) => {
    indexingActive = active
    indexingFraction = fraction

    void updateContent()
  })

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

  const pathsGroup = new Adw.PreferencesGroup({})
  box.append(pathsGroup)

  const emptyPage = new EmptyPage(app, {
    icon_name: 'edit-find-symbolic',
    title: 'No Folders Indexed',
    description: 'Add folders to enable Local RAG',
    visible: false,
    vexpand: true
  })
  box.append(emptyPage.widget)

  const pathRows = new Map<string, Adw.ExpanderRow>()
  const progressBars = new Map<string, Gtk.ProgressBar>()
  const fileLabels = new Map<string, Gtk.Label>()
  const chunkLabels = new Map<string, Gtk.Label>()
  const indexBtns = new Map<string, Gtk.Button>()

  function setEllipsizeStart(row: Adw.ExpanderRow): void {
    const findTitleLabel = (widget: Gtk.Widget): Gtk.Label | null => {
      if (widget instanceof Gtk.Label && widget.get_style_context().has_class('title')) {
        return widget
      }

      let child = widget.get_first_child()
      while (child) {
        const found = findTitleLabel(child)
        if (found) {
          return found
        }
        child = child.get_next_sibling()
      }
      return null
    }

    const label = findTitleLabel(row)
    if (label) {
      label.ellipsize = Pango.EllipsizeMode.START
      label.halign = Gtk.Align.START
      label.margin_end = 12
    }
  }

  async function updateContent(): Promise<void> {
    const paths = await filesStore.getPaths()

    if (paths.length === 0) {
      pathsGroup.visible = false
      emptyPage.widget.visible = true
      for (const row of pathRows.values()) {
        pathsGroup.remove(row)
      }
      pathRows.clear()
      progressBars.clear()
      fileLabels.clear()
      chunkLabels.clear()
      indexBtns.clear()
      return
    }

    pathsGroup.visible = true
    emptyPage.widget.visible = false

    const pathSet = new Set(paths.map((p) => {
      return p.path
    }))
    for (const path of pathRows.keys()) {
      if (!pathSet.has(path)) {
        const row = pathRows.get(path)
        if (row) {
          pathsGroup.remove(row)
        }
        pathRows.delete(path)
        progressBars.delete(path)
        fileLabels.delete(path)
        chunkLabels.delete(path)
        indexBtns.delete(path)
      }
    }

    for (const p of paths) {
      let row = pathRows.get(p.path)
      if (!row) {
        row = new Adw.ExpanderRow({
          title: p.path,
          title_lines: 1,
          title_selectable: true
        })
        setEllipsizeStart(row)

        const isDir = GLib.file_test(p.path, GLib.FileTest.IS_DIR)
        const iconName = isDir ? 'folder-symbolic' : 'text-x-generic-symbolic'
        row.add_prefix(new Gtk.Image({ icon_name: iconName }))

        const fileRow = new Adw.ActionRow({ title: 'Files' })
        const fileLabel = new Gtk.Label()
        fileLabel.add_css_class('dim-label')
        fileRow.add_suffix(fileLabel)
        row.add_row(fileRow)

        const chunkRow = new Adw.ActionRow({ title: 'Chunks' })
        const chunkLabel = new Gtk.Label()
        chunkLabel.add_css_class('dim-label')
        chunkRow.add_suffix(chunkLabel)
        row.add_row(chunkRow)

        const actionsBox = new Gtk.Box({
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 12,
          valign: Gtk.Align.CENTER
        })

        const progressBar = new Gtk.ProgressBar({
          valign: Gtk.Align.CENTER,
          visible: false
        })
        progressBar.set_size_request(60, -1)
        actionsBox.append(progressBar)

        const indexBtn = new Gtk.Button({
          icon_name: 'view-refresh-symbolic',
          tooltip_text: 'Re-index folder',
          valign: Gtk.Align.CENTER
        })
        indexBtn.add_css_class('flat')
        indexBtn.connect('clicked', () => {
          void filesStore.indexPath(app.ollama, p.path)
        })
        actionsBox.append(indexBtn)
        row.add_suffix(actionsBox)

        const removeBtn = new Gtk.Button({
          label: 'Remove Folder',
          css_classes: ['pill', 'destructive-action'],
          margin_top: 12,
          margin_bottom: 12,
          margin_start: 12,
          margin_end: 12,
          hexpand: true
        })
        removeBtn.connect('clicked', () => {
          showDestructiveConfirmation(
            app.window,
            'Remove Folder',
            `Are you sure you want to stop indexing ${p.path}?`,
            async () => {
              await filesStore.removePath(p.path)
            }
          )
        })
        row.add_row(removeBtn)

        pathsGroup.add(row)

        pathRows.set(p.path, row)
        progressBars.set(p.path, progressBar)
        fileLabels.set(p.path, fileLabel)
        chunkLabels.set(p.path, chunkLabel)
        indexBtns.set(p.path, indexBtn)
      }

      const isIndexing = p.status === 'indexing'
      const progressBar = progressBars.get(p.path)!
      const indexBtn = indexBtns.get(p.path)!

      progressBar.visible = isIndexing
      indexBtn.visible = !isIndexing
      if (isIndexing) {
        if (indexingActive) {
          progressBar.set_fraction(indexingFraction)
        } else if (p.progress !== undefined) {
          progressBar.set_fraction(p.progress)
        } else {
          progressBar.pulse()
        }
      }

      fileLabels.get(p.path)!.set_label(p.fileCount.toLocaleString())
      chunkLabels.get(p.path)!.set_label(p.chunkCount.toLocaleString())
    }
  }

  const stopPolling = poll(() => {
    void updateContent()
  }, 1000, true)

  dialog.connect('closed', () => {
    stopPolling()
    app.disconnect(indexingId)
  })

  clamp.set_child(box)
  scrolled.set_child(clamp)
  toolbarView.set_content(scrolled)
  dialog.set_child(toolbarView)
  dialog.present(app.window)
}
