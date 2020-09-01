import { formatLog } from './loghelper.mjs'

/*
 * Event: 'core.config'
 *
 * Get config
 */
export async function config(ctx) {
  ctx.socket.emit('core.config', ctx.config)
}

/*
 * Event: 'core.getlastlogs'
 *
 * Returns last few log messages from log
 */
export async function getlastlogs(ctx, data, cb) {
  cb(ctx.logroot.ringbuffer.records.map(formatLog))
}

/*
 * Event: 'core.listenlogs'
 *
 * Start listening to new log lines
 */
export async function listenlogs(ctx) {
  ctx.socket.join('logger')
}
