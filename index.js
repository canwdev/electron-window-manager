const {BrowserWindow, ipcMain} = require('electron')
const path = require('path')
const Channels = require('./channels')
const WindowStateManager = require('electron-window-state-manager')
const deepmerge = require('deepmerge')
const onChange = require('on-change');
const {MessageItem} = require('./enum')

/**
 * 窗口管理器
 * 在主进程创建实例，渲染进程需要配合 preload 方法使用
 * 支持功能：
 * - 管理创建的窗口
 * - 向单独窗口发送消息
 * - 窗口状态管理
 * - 广播消息
 * - 共享状态
 */
class WindowManager {
  constructor(config = {}) {
    this.preloadDir = config.preloadDir || __dirname
    this.iconPath = config.iconPath || path.join(this.preloadDir, '../build/256x256.png')
    this.isDebug = config.isDebug || false

    // 当前窗口列表
    this.windows = new Map()
    // 用来判断 IPC 事件是否初始化的值
    this.initialized = false

    this.handleStateChange = (path, value, previousValue, name) => {
      const data = {
        path,
        value,
        previousValue,
        name,
      }
      this.debugLog('[wm] state changed', data)
      this.sendBroadcastMassage(new MessageItem({
        channel: Channels.STATE_UPDATED,
        data
      }))
    }

    // 窗口间共享数据
    this.state = onChange({}, this.handleStateChange)

    this.handleGetState = () => {
      const obj = onChange.target(this.state)
      this.debugLog('[wm] handleGetState', obj)
      return obj
    }
    this.handleSetState = (ev, state) => {
      this.debugLog('[wm] handleSetState', state)
      onChange.unsubscribe(this.state)
      this.state = onChange(state, this.handleStateChange)
      this.handleStateChange()
    }
    this.handleUpdateState = (ev, path, value) => {
      this.debugLog('[wm] handleUpdateState', path, value)
      this.state[path] = value
    }

    // 监听事件
    this.onCreateWindow = (ev, config, url) => {
      return this.createWindow(config, url).id
    }
    this.onSendMessage = (ev, windowId, messageItem) => {
      ev.sender.send(Channels.SEND_MESSAGE, this.sendMessage(windowId, messageItem))
    }
    this.onSendBroadcastMessage = (ev, message) => {
      return this.sendBroadcastMassage(message)
    }
    this.onGetWindowIds = () => {
      return this.getWindowIds()
    }

    /**
     * 调用 window 函数
     * @param ev
     * @param windowId
     * @param action 可以是函数或属性
     * @param params 传输函数的参数（数组）
     * @returns {void|*}
     */
    this.handleWindowAction = (ev, windowId, action, params = []) => {
      if (!action) {
        throw new Error('action can not be empty')
      }
      const window = this.getWindowById(windowId)
      if (!window) {
        return
      }

      switch (action) {
        case 'hideWindow':
          window.hide()
          return window.setSkipTaskbar(true)
        case 'showWindow':
          window.show()
          return window.setSkipTaskbar(false)
        case 'getOSProcessId':
          return window.webContents.getOSProcessId()
        case 'getProcessId':
          return window.webContents.getProcessId()
        default:
          if (!window[action]) {
            return
          }
          return (typeof window[action] === 'function')
            ? window[action](...params) : window[action]
      }
    }

    this.initializeIpcEvents()
  }

  debugLog(...params) {
    if (this.isDebug) {
      console.log(...params)
    }
  }

  // 初始化 IPC 事件
  initializeIpcEvents() {
    if (this.initialized) {
      return
    }

    ipcMain.handle(Channels.CREATE_WINDOW, this.onCreateWindow)
    ipcMain.handle(Channels.SEND_MESSAGE, this.onSendMessage)
    ipcMain.handle(Channels.SEND_BROADCAST_MESSAGE, this.onSendBroadcastMessage)
    ipcMain.handle(Channels.GET_WINDOW_IDS, this.onGetWindowIds)
    ipcMain.handle(Channels.WINDOW_ACTION, this.handleWindowAction)
    ipcMain.handle(Channels.GET_STATE, this.handleGetState)
    ipcMain.handle(Channels.SET_STATE, this.handleSetState)
    ipcMain.handle(Channels.UPDATE_STATE, this.handleUpdateState)

    this.initialized = true
  }

  // 释放 IPC 事件
  releaseIpcEvents() {
    if (this.initialized) {
      ipcMain.removeAllListeners(Channels.CREATE_WINDOW)
      ipcMain.removeAllListeners(Channels.SEND_MESSAGE)
      ipcMain.removeAllListeners(Channels.SEND_BROADCAST_MESSAGE)
      ipcMain.removeAllListeners(Channels.GET_WINDOW_IDS)
      ipcMain.removeAllListeners(Channels.WINDOW_ACTION)
      ipcMain.removeAllListeners(Channels.GET_STATE)
      ipcMain.removeAllListeners(Channels.SET_STATE)
      ipcMain.removeAllListeners(Channels.UPDATE_STATE)
    }
    this.initialized = false
  }

  /**
   * 创建窗口
   * @param windowConfig 窗口配置
   * @param url 窗口内容 loadUrl
   * @returns {Electron.BrowserWindow}
   */
  createWindow(windowConfig = {}, url = 'http://localhost:3000') {
    // 融合默认配置
    const config = deepmerge({
      width: 800,
      height: 600,
      show: true,
      frame: false,
      transparent: false,
      resizable: true,
      icon: this.iconPath,
      webPreferences: {
        spellcheck: false,
        devTools: true,
        nodeIntegration: true,
        enableRemoteModule: true,
        contextIsolation: false,
        nodeIntegrationInWorker: false,
      },
      // 传入自定义设置
      customConfig: {
        isOpenDevTools: false, // 是否自动开启调试工具
        saveWindowStateName: undefined, // 如果要保存窗口状态，传入区分窗口的字符串
        isCloseHide: false, // 点击关闭最小化到任务栏而不是关闭窗口
      }
    }, windowConfig)

    // 自定义配置
    const customConfig = config.customConfig
    delete config.customConfig

    // 重写 webPreferences 默认配置
    const webPreferences = config.webPreferences

    // 指定 preload 文件
    if (!webPreferences.preload) {
      const {nodeIntegration, contextIsolation} = webPreferences
      // 自动判断 preload 类型
      const preloadName = (!nodeIntegration && contextIsolation) ? 'preload.js' : 'preload-node.js'
      webPreferences.preload = path.join(this.preloadDir, preloadName)
    }

    let windowPos

    if (customConfig.saveWindowStateName) {
      // 保存窗口位置和大小
      windowPos = new WindowStateManager(customConfig.saveWindowStateName, {
        defaultWidth: config.width,
        defaultHeight: config.height
      })
    } else {
      windowPos = {
        width: config.width,
        height: config.height,
        x: config.x,
        y: config.y,
      }
    }

    // this.debugLog('[wm] mainWindowState', mainWindowState)
    const window = new BrowserWindow(deepmerge(config, {
      width: windowPos.width,
      height: windowPos.height,
      x: windowPos.x,
      y: windowPos.y,
    }))
    window.loadURL(url)

    const windowId = window.id
    this.debugLog(`[wm] window id=${windowId} create`)

    window.on('close', (event) => {
      this.debugLog(`[wm] window id=${windowId} on close`)
      if (customConfig.saveWindowStateName) {
        windowPos.saveState(window)
      }

      if (customConfig.isCloseHide) {
        window.hide()
        window.setSkipTaskbar(true)
        event.preventDefault()
        this.debugLog(`[wm] window id=${windowId} hide`)
      }
    })

    window.on('closed', (event) => {
      this.debugLog(`[wm] window id=${windowId} was closed`)

      this.windows.delete(windowId)
      this.notifyUpdateWindowIDs(windowId)

    })

    if (customConfig.isOpenDevTools) {
      window.webContents.openDevTools()
    }

    if (windowPos.maximized) {
      window.maximize()
    }

    this.windows.set(windowId, window)
    this.notifyUpdateWindowIDs(windowId)
    return window
  }

  /**
   * 通知窗口 ids 更新
   * @param windowId
   */
  notifyUpdateWindowIDs(windowId) {
    const windowIds = this.getWindowIds()
    this.windows.forEach(window => {
      if (window.id === windowId) {
        return
      }

      window.webContents.send(Channels.UPDATE_WINDOW_IDS, windowIds)
    })
  }

  send(window, message) {
    let channel, data

    if (typeof message === 'string') {
      channel = Channels.UPDATE_MESSAGE
      data = message
    } else {
      channel = message.channel
      data = message.data
    }

    return window.webContents.send(channel, data)
  }

  /**
   * 向窗口发送消息
   * @param windowId
   * @param message
   * @returns {boolean} 是否发送成功
   */
  sendMessage(windowId, message) {
    // this.debugLog('sendMessage', windowId, message)
    const window = this.getWindowById(windowId)
    // this.debugLog('window', this.windows, window)
    if (window) {
      this.send(window, message)
      return true
    }
    return false
  }

  /**
   * 向所有窗口发送广播消息
   * @param message
   */
  sendBroadcastMassage(message) {
    // 遍历 Map
    this.windows.forEach(window => {
      this.send(window, message)
    })
  }

  /**
   * 获取当前所有窗口 id 数组
   * @returns []
   */
  getWindowIds() {
    return Array.from(this.windows.keys())
  }

  getWindowById(windowId) {
    return this.windows.get(Number(windowId))
  }
}

module.exports = WindowManager
