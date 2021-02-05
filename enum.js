// electronAPI.wmSendMessage 传输数据规范
class MessageItem {
  constructor(config = {}) {
    const {channel, data} = config
    this.channel = channel // MessageChannel
    this.data = data
  }
}

module.exports = {
  MessageItem
}
