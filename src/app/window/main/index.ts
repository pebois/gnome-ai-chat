import Adw from 'gi://Adw?version=1'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk?version=4.0'

import { EmptyPage } from '@/app/page/empty.js'
import { ErrorPage } from '@/app/page/error.js'
import { LoadingPage } from '@/app/page/loading.js'
import { Chat } from '@/app/window/main/chat.js'
import { Sidebar } from '@/app/window/main/sidebar.js'
import type { AppInterface } from '@/lib/app.js'
import { createStatusPageWrapper } from '@/lib/ui.js'

export class AppWindow extends Adw.ApplicationWindow {
  private _app: AppInterface
  private _mainStack!: Adw.ViewStack
  private _splitView!: Adw.OverlaySplitView
  private _toaster!: Adw.ToastOverlay
  private _sidebar!: Sidebar
  private _chat!: Chat

  public get mainStack(): Adw.ViewStack {
    return this._mainStack
  }

  public get splitView(): Adw.OverlaySplitView {
    return this._splitView
  }

  public get toaster(): Adw.ToastOverlay {
    return this._toaster
  }

  public get sidebar(): Sidebar {
    return this._sidebar
  }

  public get chat(): Chat {
    return this._chat
  }

  constructor(app: AppInterface, constructProperties: Partial<Adw.ApplicationWindow.ConstructorProps> = {}) {
    super(constructProperties)
    this._app = app

    this._setup()
  }

  private _setup(): void {
    this._splitView = new Adw.OverlaySplitView({
      min_sidebar_width: 200,
      sidebar_width_fraction: 0.25
    })

    this._toaster = new Adw.ToastOverlay()
    this._toaster.set_child(this._splitView)

    this._mainStack = new Adw.ViewStack()
    this._mainStack.enable_transitions = true
    this._mainStack.transition_duration = 300

    const loadingPage = new LoadingPage()
    const loadingPageBox = createStatusPageWrapper(loadingPage.widget)
    this._mainStack.add_named(loadingPageBox, 'loading')

    const emptyPage = new EmptyPage(this._app, {
      icon_name: 'dialog-warning-symbolic',
      title: 'No Models Found',
      vexpand: true
    }, () => {
      this._app.window.setState('loading')
      void this._app.init()
    })
    const emptyPageBox = createStatusPageWrapper(emptyPage.widget)
    this._mainStack.add_named(emptyPageBox, 'empty')

    this._mainStack.add_named(this._toaster, 'app')

    this.set_content(this._mainStack)

    this._setupSplitView()
    this._setupBreakpoints()
  }

  private _setupSplitView(): void {
    const navigationBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL
    })
    navigationBox.add_css_class('navigation-panel')

    const contentBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL
    })
    contentBox.add_css_class('content-panel')

    const navigationPage = new Adw.NavigationPage({
      child: navigationBox,
      title: 'History'
    })

    const contentPage = new Adw.NavigationPage({
      child: contentBox,
      title: 'Chat'
    })

    this._splitView.set_sidebar(navigationPage)
    this._splitView.set_content(contentPage)

    this._chat = new Chat(this._app, contentBox, this._splitView)
    this._sidebar = new Sidebar(this._app)
    this._sidebar.setup(navigationBox, this)
  }

  private _setupBreakpoints(): void {
    const breakpoint = new Adw.Breakpoint({
      condition: Adw.BreakpointCondition.parse('max-width: 640px')
    })

    const trueValue = new GObject.Value()
    trueValue.init(GObject.TYPE_BOOLEAN)
    trueValue.set_boolean(true)
    breakpoint.add_setter(this._splitView, 'collapsed', trueValue)

    this._chat.addResponsiveBreakpoints(breakpoint)

    this.add_breakpoint(breakpoint)
  }

  public setState(state: 'loading' | 'app' | 'empty'): void {
    this._mainStack.set_visible_child_name(state)
  }

  public toggleSidebar(): void {
    this._splitView.show_sidebar = !this._splitView.show_sidebar
  }

  public showSidebar(): void {
    this._splitView.show_sidebar = true
  }

  public updateCssClass(): void {
    if (this._app.settings.debug) {
      this.add_css_class('devel')
    } else {
      this.remove_css_class('devel')
    }
  }

  public showError(_message: string): void {
    const errorChild = this._mainStack.get_child_by_name('error')
    if (errorChild) {
      this._mainStack.remove(errorChild)
    }

    const errorPage = new ErrorPage(this._app)
    const errorPageBox = createStatusPageWrapper(errorPage.widget)
    this._mainStack.add_named(errorPageBox, 'error')
    this._mainStack.set_visible_child_name('error')
  }
}

GObject.registerClass({ GTypeName: 'AppWindow' }, AppWindow)
