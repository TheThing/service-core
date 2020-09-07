import { formatLog } from './loghelper.mjs'

/*
 * Event: 'core.config'
 *
 * Get config
 */
export async function config(ctx, data, cb) {
  cb(ctx.config)
}

/*
 * Event: 'core.restart'
 *
 * Restart server
 */
export async function restart(ctx, data, cb) {
  ctx.core.restart()
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

/*
 * Event: 'core.unlistenlogs'
 *
 * Stop listening to new log lines
 */
export async function unlistenlogs(ctx) {
  ctx.socket.leave('logger')
}

/*
 * Event: 'core.update'
 *
 * Update specific software
 */
export async function update(ctx, data, cb) {
  if (data.name === 'app') {
    await ctx.core.updateProgram('app')
  } else if (data.name === 'manage') {
    await ctx.core.updateProgram('manage')
  } else {
    ctx.log.warn('Invalid update command for app ' + data.name)
    ctx.log.event.warn('Invalid update command for app ' + data.name)
  }
}

/*
 * Event: 'core.start'
 *
 * Start specific software
 */
export async function start(ctx, data, cb) {
  if (data.name === 'app') {
    await ctx.core.startProgram('app')
  } else if (data.name === 'manage') {
    await ctx.core.startProgram('manage')
  } else {
    ctx.log.warn('Invalid start command for app ' + data.name)
    ctx.log.event.warn('Invalid start command for app ' + data.name)
  }
}

/*
 * Event: 'core.listencore'
 *
 * Start listening to new log lines
 */
export async function listencore(ctx) {
  ctx.socket.join('core')
  ctx.socket.emit('core.db', ctx.db.get('core').value())
  ctx.socket.emit('core.status', ctx.core.status())
}

/*
 * Event: 'core.unlistencore'
 *
 * Stop listening to new log lines
 */
export async function unlistencore(ctx) {
  ctx.socket.leave('core')
}

/*
 * Event: 'core.listentoapp'
 *
 * Start listening to changes in core app
 */
export async function listentoapp(ctx) {
  ctx.socket.join('core.app')
  ctx.socket.emit('core.program.log', {
    name: 'app',
    logs: ctx.core.getProgramLogs('app')
  })
}

/*
 * Event: 'core.unlistentoapp'
 *
 * Stop listening to new log lines
 */
export async function unlistentoapp(ctx) {
  ctx.socket.leave('core.app')
}
