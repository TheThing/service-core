import { readFileSync } from 'fs'
import getLog from './log.mjs'
import lowdb from './db.mjs'

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

lowdb(log).then(function(db) {
  return import('./example/index.mjs').then(function(module) {
    return module.start(config, db, log, function(err) {
      if (err) {
        log.fatal(err, 'App recorded a fatal error')
        log.event.error('App recorded a fatal error: ' + err.message)
        process.exit(4)
      }
      log.warn('App asked to be shut down')
      log.event.warn('App requested to be closed')
      process.exit(0)
    })
  })
}, function(err) {
  log.fatal(err, 'Critical error opening database')
  log.event.error('Critical error opening database: ' + err.message)
  process.exit(2)
}).catch(function(err) {
  log.fatal(err, 'Unknown error occured opening app')
  log.event.error('Unknown error occured opening app: ' + err.message)
  process.exit(3)
})
