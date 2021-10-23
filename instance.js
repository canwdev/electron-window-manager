// 实例Demo
const path = require('path')
const WindowManager = require('./index')

const wm = new WindowManager({
  preloadDir: path.join(__dirname, '../../../src'),
  isDebug: true
})
module.exports = wm
