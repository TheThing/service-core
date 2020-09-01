import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import socket from 'socket.io-serveronly'
import nStatic from 'node-static'
import logmonitor from './core/logmonitor.mjs'

import onConnection from './routerio.mjs'

export function run(config, db, log, next) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const staticRoot = path.join(__dirname,'../public')

  const fileServer = new nStatic.Server(staticRoot)
  const server = http.createServer(function (req, res) {
    const child = log.child({})

    const d1 = new Date().getTime()

    let finishedRequest = false
    var done = function () {
      if (finishedRequest) return
      finishedRequest = true
      if (req.url === '/main.css.map') return
      var requestTime = new Date().getTime() - d1

      let level = 'debug'
      if (res.statusCode >= 400) {
        level = 'warn'
      }
      if (res.statusCode >= 500) {
        level = 'error'
      }

      let status = ''
      if (res.statusCode >= 400) {
        status = res.statusCode + ' '
      }

      child[level]({
        duration: requestTime,
        status: res.statusCode,
      }, `<-- ${status}${req.method} ${req.url}`)
    }
    
    res.addListener('finish', done);
    res.addListener('close', done);

    req.addListener('end', function () {
      if (req.url === '/') {
        res.writeHead(302, { Location: '/index.html' })
        return res.end()
      }

      fileServer.serve(req, res, function (err) {
        if (err) {
          if (err.status !== 404) {
            log.error(err, req.url);
          }

          res.writeHead(err.status, err.headers);
          res.end(err.message);
        }
      });
    }).resume()
  })

  const io = new socket(server)
  io.on('connection', onConnection.bind(this, io, config, db, log))

  logmonitor(io, config, db, log)

  server.listen(config.port, '0.0.0.0', function(err) {
    if (err) {
      log.fatal(err)
      return process.exit(2)
    }
    log.info(`Server is listening on ${config.port} serving files on ${staticRoot}`)
  })
}