const m = require('mithril')
const socket = require('./socket')

const Header = {
  oninit: function() {
    this.connected = socket.connected

    socket.on('connect', () => {
      this.connected = true
      m.redraw()
    })
    socket.on('disconnect', () => {
      this.connected = false
      m.redraw()
    })
  },
  view: function() {
    let path = m.route.get()

    return [
      m('div.seperator'),
      m(m.route.Link, {
        href: '/',
        class: path === '/' ? 'active' : '',
      }, 'Frontpage'),
      m('div.seperator'),
      m(m.route.Link, {
        href: '/log',
        class: path === '/log' ? 'active' : '',
      }, 'Log'),
      m('div.seperator'),
      !this.connected && m('div.disconnected', `
        Lost connection with server, Attempting to reconnect
      `) || null,
    ]
  }
}

module.exports = Header
