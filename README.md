# Electron Window Manager

Manage multiple electron windows, message transfer and sync state.

Tested in `"electron": "^10.3.0"`

## Features

- Create customized windows
- Use `preload.js`, you can maximize, minimize, switch, or call any window methods in render process with `nodeIntegration: false`
- Message transfer between windows
- State sync between windows

## Usage

Demos and examples are in this project: [electron-multiple-window-demo](https://github.com/canwdev/electron-multiple-window-demo)

![screenshot](https://github.com/canwdev/electron-multiple-window-demo/raw/master/screenshot.png)

### 1. Install

```sh
npm i @canwdev/electron-window-manager
# Or yarn add @canwdev/electron-window-manager
```

### 2. Setup `preload.js`

Import our `preload.js` to `electron-api.js`

```js
// src/utils/electron-api.js
const wmPreload = require('@canwdev/electron-window-manager/preload')

module.exports = {
  ...wmPreload,
  // Write your APIs here
}
```

Create your preload files and import `electron-api.js`: 

- `preload.js`: for `nodeIntegration: false` and `contextIsolation: true`
- `preload-node.js`: for `nodeIntegration: true`

```js
// src/preload.js
const {contextBridge} = require('electron')
const electronAPI = require('./utils/electron-api')
contextBridge.exposeInMainWorld(
  "electronAPI", electronAPI
);
```

```js
// src/preload-node.js
const electronAPI = require('./utils/electron-api')
window.electronAPI = electronAPI
console.log('electronAPI loaded', electronAPI)
```

### 3. Setup main process

Create a global window manager instance run in main process

```js
// src/utils/wm.js
const WindowManager = require('@canwdev/electron-window-manager')
const path = require('path')

const wm = new WindowManager({
  // setup preload path
  preloadDir: path.join(__dirname, '../')
})

module.exports = wm
```

Import in main process

```js
// src/main.js
const wm = require('./utils/wm')

// Create a window
wm.createWindow({
      width: 800,
      height: 600,
      minWidth: 800,
      minHeight: 600,
      frame: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      customConfig: {
        isOpenDevTools: isDev,
        saveWindowStateName: 'mainWindow',
      }
    },
    `http://localhost:3000`
  )
```
