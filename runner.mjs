import { readFileSync } from 'fs'
import getLog from './core/log.mjs'
import lowdb from './core/db.mjs'
import Core from './core/core.mjs'
import Util from './core/util.mjs'

let config

try {
  config = JSON.parse(readFileSync('./config.json'))
} catch (err) {
  let logger = getLog('critical-error')
  logger.fatal('Error opening config file')
  logger.fatal('Make sure it is valid JSON')
  logger.fatal(err)
  logger.event.error('Unable to start, error in config.json: ' + err.message)
  process.exit(10)
}

const log = getLog(config.name)

const close = function(err) {
  if (err) {
    log.fatal(err, 'App recorded a fatal error')
    log.event.error('App recorded a fatal error: ' + err.message, null, function() {
      process.exit(4)
    })
    return
  }
  log.warn('App asked to be restarted')
  log.event.warn('App requested to be restarted', null, function() {
    process.exit(0)
  })
}

const util = new Util(import.meta.url)

lowdb(util, log).then(function(db) {
  let core = new Core(util, config, db, log, close)

  if (config.useDev) {
    return import('./dev/index.mjs').then(function(module) {
      return module.start(config, db, log, core)
    })
  }
}, function(err) {
  log.fatal(err, 'Critical error opening database')
  log.event.error('Critical error opening database: ' + err.message, null, function() {
    process.exit(2)
  })
}).catch(function(err) {
  log.fatal(err, 'Unknown error occured opening app')
  log.event.error('Unknown error occured opening app: ' + err.message, null, function() {
    process.exit(3)
  })
})
