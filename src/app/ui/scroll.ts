import Adw from 'gi://Adw?version=1'
import Gtk from 'gi://Gtk?version=4.0'

export interface ScrollCallbacks {
  onScroll?: (value: number) => void
  onReachTop?: () => void
  onReachBottom?: () => void
}

export class ScrollManager {
  private _scrolledWindow: Gtk.ScrolledWindow
  private _callbacks?: ScrollCallbacks
  private _adj: Gtk.Adjustment
  private _animation?: Adw.TimedAnimation
  private _stickToBottom = false

  constructor(scrolledWindow: Gtk.ScrolledWindow, callbacks?: ScrollCallbacks) {
    this._scrolledWindow = scrolledWindow
    this._callbacks = callbacks
    this._adj = scrolledWindow.get_vadjustment()

    this._setup()
  }

  private _setup(): void {
    this._adj.connect('notify::value', () => {
      this._checkBounds(true)
    })

    this._adj.connect('changed', () => {
      this._checkBounds(false)
    })
  }

  private _checkBounds(fromScroll: boolean): void {
    const value = this._adj.get_value()
    const max = this._adj.get_upper() - this._adj.get_page_size()

    if (this._callbacks?.onScroll) {
      this._callbacks.onScroll(value)
    }

    if (fromScroll && value < max - 5) {
      this._stickToBottom = false
    }

    if (max <= 0 || value >= max - 1) {
      this._callbacks?.onReachBottom?.()
      if (fromScroll) {
        this._stickToBottom = true
      }
    } else if (value <= 1) {
      this._callbacks?.onReachTop?.()
    }
  }

  public scrollToTop(): void {
    this._adj.set_value(0)
  }

  public scrollToBottom(smooth = true): void {
    const max = this._adj.get_upper() - this._adj.get_page_size()

    if (this._animation) {
      this._animation.skip()
      this._animation = undefined
    }

    if (!smooth) {
      this._adj.set_value(max)
      return
    }

    const start = this._adj.get_value()
    if (Math.abs(start - max) < 1) {
      return
    }

    const target = Adw.PropertyAnimationTarget.new(this._adj, 'value')

    this._animation = Adw.TimedAnimation.new(
      this._scrolledWindow,
      start,
      max,
      300,
      target
    )
    this._animation.easing = Adw.Easing.EASE_IN_OUT_CUBIC

    this._animation.connect('done', () => {
      const max = this._adj.get_upper() - this._adj.get_page_size()
      this._adj.set_value(max)
      this._animation = undefined
    })

    if (this._scrolledWindow.get_mapped()) {
      this._animation.play()
    } else {
      this._adj.set_value(max)
    }
  }
}
