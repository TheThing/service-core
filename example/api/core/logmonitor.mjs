import { formatLog } from './loghelper.mjs'

export default function logmonitor(io, config, db, log) {
  log.on('newlog', function(data) {
    io.to('logger').emit('newlog', formatLog(data))
  })
}