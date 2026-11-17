import type Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

import { EditorShell } from '@/app/window/manage/editor.js'
import { ItemSidebar, type RowBinding, type SidebarGroup } from '@/app/window/manage/sidebar.js'
import type { AppInterface } from '@/lib/app.js'
import type { ItemSource } from '@/lib/items.js'
import { type NamedItem, type NameRules, validateItemName } from '@/lib/naming.js'
import { debounce } from '@/lib/timeout.js'
import { showDestructiveConfirmation } from '@/lib/ui.js'

const SAVE_DELAY_MS = 500

export interface ItemPanel<T extends NamedItem> {
  readonly widget: Gtk.Widget
  readonly name: string
  load(item: T | null): void
  applyTo(item: T): void
  grabFocus(): void
  setNameError?(hasError: boolean): void
  sync?(item: T): void
  destroy?(): void
}

export interface SectionLabels {
  title: string
  windowTitle: string
  addTooltip: string
  searchTooltip: string
  deleteTooltip: string
  deleteMenuLabel: string
  deleteHeading: string
  deleteBody: (name: string) => string
  saveError: string
}

export interface SectionConfig<T extends NamedItem> {
  id: string
  labels: SectionLabels
  source: ItemSource<T>
  signal: string
  nameRules: NameRules
  panel: ItemPanel<T>
  emptyPage: Gtk.Widget
  createItem: (names: string[]) => T
  canDelete: (item: T) => boolean
  matches: (item: T, text: string) => boolean
  bindRow: (item: T) => RowBinding<T>
  groups?: (items: T[], searching: boolean) => SidebarGroup<T>[]
  addButton?: Gtk.Widget
  titleWidget?: Gtk.Widget
  endWidgets?: Gtk.Widget[]
  onSearchChanged?: (text: string) => void
  onItemShown?: (item: T | null) => void
  onCreated?: (item: T) => void
}

export interface SectionHost {
  readonly window: Adw.Window
  onSearchModeChanged(sectionId: string, enabled: boolean): void
}

export interface ManagedSection {
  readonly id: string
  readonly labels: SectionLabels
  readonly sidebarWidget: Gtk.Widget
  readonly editorWidget: Gtk.Widget
  readonly addButton: Gtk.Widget
  readonly toggleSidebarButton: Gtk.ToggleButton
  searchMode: boolean
  create(): void
  select(id: string): void
  close(): void
}

export class ManageSection<T extends NamedItem> implements ManagedSection {
  private _app: AppInterface
  private _host: SectionHost
  private _config: SectionConfig<T>
  private _sidebar: ItemSidebar<T>
  private _shell: EditorShell
  private _addButton: Gtk.Widget
  private _selectedId: string | null = null
  private _dirtyIds = new Set<string>()
  private _lastNameError: string | null = null
  private _loading = false
  private _signalId: number
  private _save = debounce(() => {
    this._flush()
  }, SAVE_DELAY_MS)

  public get id(): string {
    return this._config.id
  }

  public get labels(): SectionLabels {
    return this._config.labels
  }

  public get sidebarWidget(): Gtk.Widget {
    return this._sidebar.widget
  }

  public get editorWidget(): Gtk.Widget {
    return this._shell.widget
  }

  public get addButton(): Gtk.Widget {
    return this._addButton
  }

  public get toggleSidebarButton(): Gtk.ToggleButton {
    return this._shell.toggleSidebarButton
  }

  public get searchMode(): boolean {
    return this._sidebar.searchMode
  }

  public set searchMode(enabled: boolean) {
    this._sidebar.searchMode = enabled
  }

  public get selected(): T | null {
    return this._item(this._selectedId)
  }

  constructor(app: AppInterface, host: SectionHost, config: SectionConfig<T>) {
    this._app = app
    this._host = host
    this._config = config

    this._sidebar = new ItemSidebar<T>({
      getItems: () => {
        return config.source.items
      },
      groups: config.groups ?? ((items) => {
        return [{ items }]
      }),
      matches: config.matches,
      bindRow: config.bindRow,
      canDelete: config.canDelete,
      deleteLabel: config.labels.deleteMenuLabel,
      onSelected: (id) => {
        this._onSelected(id)
      },
      onDelete: (id) => {
        this.delete(id)
      },
      onSearchChanged: config.onSearchChanged,
      onSearchModeChanged: (enabled) => {
        this._host.onSearchModeChanged(config.id, enabled)
      }
    })

    this._shell = new EditorShell({
      content: config.panel.widget,
      emptyPage: config.emptyPage,
      deleteTooltip: config.labels.deleteTooltip,
      titleWidget: config.titleWidget,
      endWidgets: config.endWidgets,
      onDelete: () => {
        if (this._selectedId) {
          this.delete(this._selectedId)
        }
      }
    })

    this._addButton = config.addButton ?? this._createAddButton()

    this._signalId = this._app.connect(config.signal, () => {
      this._onSourceChanged()
    })
    this._sidebar.refresh(this._selectedId)
  }

  private _createAddButton(): Gtk.Button {
    const button = new Gtk.Button({
      icon_name: 'list-add-symbolic',
      tooltip_text: this._config.labels.addTooltip,
      valign: Gtk.Align.CENTER
    })
    button.add_css_class('flat')
    button.connect('clicked', () => {
      this.create()
    })
    return button
  }

  private _item(id: string | null): T | null {
    return this._config.source.items.find((item) => {
      return item.id === id
    }) ?? null
  }

  private _names(): string[] {
    return this._config.source.items.map((item) => {
      return item.name
    })
  }

  private _show(item: T | null): void {
    this._loading = true
    this._config.panel.load(item)
    this._loading = false
    this._shell.setState(item !== null, item !== null && this._config.canDelete(item))
    this._config.onItemShown?.(item)
  }

  private _onSelected(id: string | null): void {
    this._selectedId = id
    this._lastNameError = null
    this._config.panel.setNameError?.(false)
    this._show(this._item(id))
  }

  private _onSourceChanged(): void {
    this._sidebar.updateRows()
    const item = this.selected
    if (item) {
      this._config.panel.sync?.(item)
    }
  }

  public onPanelChanged(): void {
    const item = this.selected
    if (this._loading || !item) {
      return
    }
    const name = this._config.panel.name
    const nameError = validateItemName(name, item.id, this._config.source.items, this._config.nameRules)
    this._config.panel.setNameError?.(nameError !== null)
    if (nameError) {
      if (nameError !== this._lastNameError) {
        this._lastNameError = nameError
        this._app.showToast(nameError, true)
      }
    } else {
      this._lastNameError = null
      item.name = name
    }
    this._config.panel.applyTo(item)
    this._sidebar.updateRow(item)
    this._config.panel.sync?.(item)
    this._config.onItemShown?.(item)
    this._dirtyIds.add(item.id)
    this._save()
  }

  private _flush(): void {
    const ids = [...this._dirtyIds]
    this._dirtyIds.clear()
    for (const id of ids) {
      const item = this._item(id)
      if (item) {
        this._persist(item)
      }
    }
  }

  private _persist(item: T): void {
    this._config.source.save(item).catch((err: unknown) => {
      this._app.reportError(this._config.labels.saveError, err)
    })
  }

  public refresh(selectedId: string | null = this._selectedId): void {
    this._sidebar.refresh(selectedId)
  }

  public reloadSelected(): void {
    this._show(this.selected)
    this._sidebar.updateRows()
  }

  public create(): void {
    const item = this._config.createItem(this._names())
    this.add(item)
    this._config.onCreated?.(item)
    this._config.panel.grabFocus()
  }

  public add(item: T): void {
    this._config.source.items.push(item)
    this._persist(item)
    this._sidebar.refresh(item.id)
  }

  public delete(id: string): void {
    const item = this._item(id)
    if (!item || !this._config.canDelete(item)) {
      return
    }
    showDestructiveConfirmation(
      this._host.window,
      this._config.labels.deleteHeading,
      this._config.labels.deleteBody(item.name),
      () => {
        const items = this._config.source.items
        const index = items.findIndex((i) => {
          return i.id === id
        })
        if (index === -1) {
          return
        }
        this._dirtyIds.delete(id)
        const remaining = items.filter((i) => {
          return i.id !== id
        })
        const nextId = this._selectedId === id
          ? remaining[Math.max(0, index - 1)]?.id ?? null
          : this._selectedId
        this._config.source.remove(id).then(() => {
          this._sidebar.refresh(nextId)
        }).catch((err: unknown) => {
          this._app.reportError(this._config.labels.saveError, err)
        })
      }
    )
  }

  public select(id: string): void {
    this._sidebar.refresh(id)
  }

  public close(): void {
    this._app.disconnect(this._signalId)
    this._save.cancel()
    this._flush()
    this._config.panel.destroy?.()
  }
}
