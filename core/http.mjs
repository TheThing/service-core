import http from 'http'

export default class HttpServer {
  constructor(config) {
    this.active = {
      app: false,
      manage: false,
      dev: false,
    }
    this.sockets = {
      app: new Set(),
      manage: new Set(),
      dev: new Set(),
    }
    this._context = 'dev'
  }

  setContext(name) {
    if (name !== 'app' && name !== 'manage' && name !== 'dev') {
      throw new Error('Cannot call setContext with values other than app or manage')
    }
    this._context = name
  }

  createServer(opts, listener) {
    return this._createServer(this._context, opts, listener)
  }

  _createServer(name, opts, listener) {
    let server = http.createServer(opts, listener)

    server.on('connection', (socket) => {
      this.sockets[name].add(socket)

      socket.once('close', () => {
        this.sockets[name].delete(socket)
      })
    })

    this.active[name] = server
    return server
  }

  getServer(name) {
    return this.active[name]
  }

  async closeServer(name) {
    if (!this.active[name]) return false

    try {
      await new Promise((res, rej) => {
        this.sockets[name].forEach(function(socket) {
          socket.destroy()
        })
        this.sockets[name].clear()
  
        this.active[name].close(function(err) {
          if (err) return rej(err)
  
          // Waiting 1 second for it to close down
          setTimeout(function() { res(true) }, 1000)
        })
      })
    } catch (err) {
      throw new Error(`Error closing ${name}: ${err.message}`)
    }
  }

  getCurrentServer() {
    return this.active[this._context]
  }
}
