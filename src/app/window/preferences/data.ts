import Adw from 'gi://Adw?version=1'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib?version=2.0'
import Gtk from 'gi://Gtk?version=4.0'

import type { AppInterface } from '@/lib/app.js'
import { conversationsStore } from '@/lib/db/conversations.js'
import { showDestructiveConfirmation } from '@/lib/ui.js'

export class DataPage {
  private _app: AppInterface
  private _window: Adw.PreferencesDialog
  private _page: Adw.PreferencesPage
  private _convIndexingCancellable: Gio.Cancellable | null = null
  private _skillsIndexingCancellable: Gio.Cancellable | null = null
  private _indexingSignalId?: number

  public get page(): Adw.PreferencesPage {
    return this._page
  }

  constructor(app: AppInterface, window: Adw.PreferencesDialog) {
    this._app = app
    this._window = window
    this._page = new Adw.PreferencesPage({
      title: 'Data',
      icon_name: 'folder-remote-symbolic'
    })

    this._setup()
  }

  private _setup(): void {
    const searchGroup = new Adw.PreferencesGroup({
      title: 'Search Indexing'
    })
    this._page.add(searchGroup)

    const indexRow = new Adw.ActionRow({
      title: 'Conversations'
    })
    const indexBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 12,
      valign: Gtk.Align.CENTER
    })
    const indexBtn = new Gtk.Button({
      label: 'Full Re-index'
    })
    const progressBar = new Gtk.ProgressBar({
      visible: false,
      hexpand: true,
      valign: Gtk.Align.CENTER
    })
    indexBtn.connect('clicked', () => {
      if (this._convIndexingCancellable) {
        this._convIndexingCancellable.cancel()
        return
      }
      return this._indexConversations(indexBtn, progressBar)
    })
    indexBox.append(progressBar)
    indexBox.append(indexBtn)
    indexRow.add_suffix(indexBox)
    searchGroup.add(indexRow)

    const skillsIndexRow = new Adw.ActionRow({
      title: 'Skills'
    })
    const skillsIndexBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 12,
      valign: Gtk.Align.CENTER
    })
    const skillsIndexBtn = new Gtk.Button({
      label: 'Full Re-index'
    })
    const skillsProgressBar = new Gtk.ProgressBar({
      visible: false,
      hexpand: true,
      valign: Gtk.Align.CENTER
    })
    skillsIndexBtn.connect('clicked', () => {
      if (this._skillsIndexingCancellable) {
        this._skillsIndexingCancellable.cancel()
        return
      }
      return this._indexSkills(skillsIndexBtn, skillsProgressBar)
    })
    skillsIndexBox.append(skillsProgressBar)
    skillsIndexBox.append(skillsIndexBtn)
    skillsIndexRow.add_suffix(skillsIndexBox)
    searchGroup.add(skillsIndexRow)

    const filesIndexRow = new Adw.ActionRow({
      title: 'Local RAG Files'
    })
    const filesIndexBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 12,
      valign: Gtk.Align.CENTER
    })
    const filesIndexBtn = new Gtk.Button({
      label: 'Full Re-index'
    })
    const filesProgressBar = new Gtk.ProgressBar({
      visible: false,
      hexpand: true,
      valign: Gtk.Align.CENTER
    })

    this._indexingSignalId = this._app.connect('files-indexing-changed', (_, active, fraction) => {
      filesIndexBtn.set_label(active ? 'Stop' : 'Full Re-index')
      filesProgressBar.set_visible(active)
      filesProgressBar.set_fraction(fraction)
    })

    this._window.connect('closed', () => {
      if (this._indexingSignalId) {
        this._app.disconnect(this._indexingSignalId)
      }
    })

    filesIndexBtn.connect('clicked', () => {
      if (filesProgressBar.visible) {
        this._app.cancelFilesIndexing()
      } else {
        void this._app.indexFiles()
      }
    })
    filesIndexBox.append(filesProgressBar)
    filesIndexBox.append(filesIndexBtn)
    filesIndexRow.add_suffix(filesIndexBox)
    searchGroup.add(filesIndexRow)

    const group = new Adw.PreferencesGroup({
      title: 'Chat History'
    })
    this._page.add(group)

    const clearRow = new Adw.ActionRow({
      title: 'Clear All Chats'
    })
    const clearBtn = new Gtk.Button({
      label: 'Clear chats',
      valign: Gtk.Align.CENTER
    })
    clearBtn.add_css_class('row-button')
    clearBtn.add_css_class('destructive-action')
    clearBtn.connect('clicked', () => {
      showDestructiveConfirmation(
        this._window,
        'Clear All Chats',
        'Are you sure you want to permanently delete all conversation history?\nThis action cannot be undone.',
        async () => {
          await this._app.clearAllConversations()
        }
      )
    })
    clearRow.add_suffix(clearBtn)
    group.add(clearRow)

    const clearStatsRow = new Adw.ActionRow({
      title: 'Clear Usage Statistics'
    })
    const clearStatsBtn = new Gtk.Button({
      label: 'Clear stats',
      valign: Gtk.Align.CENTER
    })
    clearStatsBtn.add_css_class('row-button')
    clearStatsBtn.add_css_class('destructive-action')
    clearStatsBtn.connect('clicked', () => {
      showDestructiveConfirmation(
        this._window,
        'Clear Performance Stats',
        'Are you sure you want to permanently delete all performance statistics?\nThis action cannot be undone.',
        () => {
          return this._app.tracker.clearStats()
        }
      )
    })
    clearStatsRow.add_suffix(clearStatsBtn)
    group.add(clearStatsRow)
  }

  private async _indexConversations(btn: Gtk.Button, progressBar: Gtk.ProgressBar): Promise<void> {
    const oldLabel = btn.get_label()
    btn.set_label('Stop')
    progressBar.set_fraction(0)
    progressBar.set_visible(true)
    this._convIndexingCancellable = new Gio.Cancellable()

    try {
      await conversationsStore.indexConversations(this._app.provider, this._app.conversations, true, this._convIndexingCancellable, (fraction) => {
        progressBar.set_fraction(fraction)
      })
    } catch (err) {
      if (!(err instanceof GLib.Error && err.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))) {
        console.error('Failed to index conversations:', err)
        this._window.add_toast(new Adw.Toast({ title: 'Conversations indexing failed' }))
      }
    } finally {
      btn.set_label(oldLabel ?? '')
      progressBar.set_visible(false)
      this._convIndexingCancellable = null
    }
  }

  private async _indexSkills(btn: Gtk.Button, progressBar: Gtk.ProgressBar): Promise<void> {
    const oldLabel = btn.get_label()
    btn.set_label('Stop')
    progressBar.set_fraction(0)
    progressBar.set_visible(true)
    this._skillsIndexingCancellable = new Gio.Cancellable()

    try {
      await this._app.skillsManager.index(true, this._skillsIndexingCancellable, (fraction) => {
        progressBar.set_fraction(fraction)
      })
    } catch (err) {
      if (!(err instanceof GLib.Error && err.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))) {
        console.error('Failed to index skills:', err)
        this._window.add_toast(new Adw.Toast({ title: 'Skills indexing failed' }))
      }
    } finally {
      btn.set_label(oldLabel ?? '')
      progressBar.set_visible(false)
      this._skillsIndexingCancellable = null
    }
  }
}
