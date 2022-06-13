const { Clutter, Gio, Meta, St } = imports.gi

const Main = imports.ui.main
const PanelMenu = imports.ui.panelMenu
const Display = global.display

const DBusPath = '/com/github/nwounkn/notworkspaces'
const DBusInterface = `
<node>
  <interface name="com.github.nwounkn.notworkspaces">
    <method name="switchTo">
      <arg name="name" type="s" direction="in"/>
    </method>
    <method name="nextWindow">
      <arg name="step" type="i" direction="in"/>
    </method>
    <method name="nextState">
      <arg name="step" type="i" direction="in"/>
    </method>
    <method name="apply">
      <arg name="name" type="s" direction="in"/>
    </method>
    <method name="save">
      <arg name="name" type="s" direction="in"/>
    </method>
    <method name="toggleActiveWindow"/>
  </interface>
</node>`

function normalOrDialogWindow(meta_window) {
  return meta_window?.window_type == Meta.WindowType.NORMAL ||
    meta_window?.window_type == Meta.WindowType.DIALOG
}

function wrapIndex(index, length) {
  return ((index % length) + length) % length
}

class Window {
  constructor(meta_window) {
    this._metaWindow = meta_window
    this.save()
  }

  get metaWindow() {
    return this._metaWindow
  }

  save() {
    this.above = this.metaWindow.above
    this.fullscreen = this.metaWindow.fullscreen
    this.maximized = this.metaWindow.get_maximized()
    this.minimized = this.metaWindow.minimized
    const rect = this.metaWindow.get_frame_rect()
    this.x = rect.x
    this.y = rect.y
    this.width = rect.width
    this.height = rect.height
  }

  apply() {
    if(this.minimized) {
      this.metaWindow.minimize()
    } else {
      this.metaWindow.unminimize()
      if(this.above) {
        this.metaWindow.make_above()
      } else {
        this.metaWindow.unmake_above()
      }
      const rect = this.metaWindow.get_frame_rect()
      if(this.x !== rect.x || this.y !== rect.y
        || this.width !== rect.width || this.height !== rect.height) {
        this.metaWindow.unmake_fullscreen()
        this.metaWindow.unmaximize(Meta.MaximizeFlags.BOTH)
        this.metaWindow.move_resize_frame(
          true, this.x, this.y, this.width, this.height
        )
      }
      if(this.fullscreen) {
        this.metaWindow.make_fullscreen()
      } else {
        this.metaWindow.unmake_fullscreen()
        const unmaximize = this.maximized ^ Meta.MaximizeFlags.BOTH
        if(this.maximized) {
          this.metaWindow.maximize(this.maximized)
        }
        if(unmaximize) {
          this.metaWindow.unmaximize(unmaximize)
        }
      }
    }
  }
}

class State {
  constructor(meta_windows) {
    this._windows = new Map()
    this.addWindows(meta_windows ?? [])
  }

  metaWindows() {
    return Array.from(this._windows.keys())
  }

  hasWindow(meta_window) {
    return this._windows.has(meta_window)
  }

  getNext(meta_window, step) {
    const meta_windows = this.metaWindows()
    const index = meta_windows.indexOf(meta_window)
    if(index !== -1) {
      return meta_windows[wrapIndex(index + step, meta_windows.length)]
    }
    return null
  }

  getTopmost() {
    return this.metaWindows().at(-1)
  }

  addWindows(meta_windows) {
    for(let meta_window of meta_windows) {
      if(!this.hasWindow(meta_window)) {
        this._windows.set(meta_window, new Window(meta_window))
      }
    }
  }

  removeWindows(meta_windows) {
    for(let meta_window of meta_windows) {
      this._windows.delete(meta_window)
    }
  }

  apply() {
    this._windows.forEach((window) => window.apply())
  }
}

class Extension {
  enable() {
    this._states = new Map()
    this._currentStateName = null
    this._windowCreatedSignal = Display.connect(
      'window-created', this.windowCreated.bind(this)
    )
    this._windowActivatedSignal = Display.connect(
      'notify::focus-window', this.updateStatusText.bind(this)
    )
    this._windowSignals = new Map()
    const meta_windows = Display.list_all_windows().filter(normalOrDialogWindow)
    for(let meta_window of meta_windows) {
      this.windowCreated(Display, meta_window)
    }
    this._dbus = Gio.DBusExportedObject.wrapJSObject(DBusInterface, this)
    this._dbus.export(Gio.DBus.session, DBusPath)
    this._status = new St.Label({ y_align: Clutter.ActorAlign.CENTER })
    this._indicator = new PanelMenu.Button(0, 'not workspaces', true)
    this._indicator.add_child(this._status)
    Main.panel.addToStatusArea(
      'com.github.nwounkn.notworkspaces', this._indicator
    )
    this.apply('1')
  }

  disable() {
    this._indicator.destroy()
    this._dbus.unexport()
    for(let meta_window of Array.from(this._windowSignals.keys())) {
      this.disconnectWindowSignals(meta_window)
    }
    Display.disconnect(this._windowActivatedSignal)
    Display.disconnect(this._windowCreatedSignal)
    Object.keys(this).forEach((key) => delete this[key])
  }

  nextWindow(step) {
    const current_state = this._states.get(this._currentStateName)
    const next_window = current_state.getNext(Display.focus_window, step)
    next_window?.activate(Display.get_current_time())
  }

  nextState(step) {
    const state_names = Array.from(this._states.keys()).filter(
      (name) => this._states.get(name).hasWindow(Display.focus_window)
    )
    const index = state_names.indexOf(this._currentStateName)
    if(state_names.length > 0) {
      this.apply(state_names[wrapIndex(index + step, state_names.length)])
    }
  }

  windowCreated(_, meta_window) {
    if(normalOrDialogWindow(meta_window)) {
      const window_signals = {
        unmanaged:
          meta_window.connect('unmanaged', this.windowUnmanaged.bind(this)),
      }
      this._windowSignals.set(meta_window, window_signals)
    }
  }

  windowUnmanaged(meta_window) {
    this._states.forEach((state) => state.removeWindows([meta_window]))
    this.disconnectWindowSignals(meta_window)
  }

  disconnectWindowSignals(meta_window) {
    const signals = this._windowSignals.get(meta_window)
    for(let signal of Object.values(signals)) {
      meta_window.disconnect(signal)
    }
    this._windowSignals.delete(meta_window)
  }

  updateStatusText() {
    let status = this._currentStateName
    const current_state = this._states.get(this._currentStateName)
    if(current_state.hasWindow(Display.focus_window)) {
      status += ' ○'
    }
    this._status.text = status
  }

  save(name) {
    const meta_windows = Display.sort_windows_by_stacking(
      this._states.get(name)?.metaWindows() ?? []
    )
    this._states.set(name, new State(meta_windows))
  }

  apply(name) {
    const state = this._states.get(name)
    if(state) {
      state.apply()
      if(!state.hasWindow(Display.focus_window)) {
        state.getTopmost()?.activate(Display.get_current_time())
      }
    } else {
      this._states.set(name, new State())
    }
    this._currentStateName = name
    this.updateStatusText()
  }

  switchTo(name) {
    if(name !== this._currentStateName) {
      this.save(this._currentStateName)
    }
    this.apply(name)
  }

  toggleActiveWindow() {
    const current_state = this._states.get(this._currentStateName)
    if(current_state.hasWindow(Display.focus_window)) {
      current_state.removeWindows([Display.focus_window])
    } else if(normalOrDialogWindow(Display.focus_window)) {
      current_state.addWindows([Display.focus_window])
    }
    this.updateStatusText()
  }
}

function init() {
  return new Extension()
}
