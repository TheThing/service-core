export function start(config, db, log, next) {
  return import('./api/server.mjs').then(function(module) {
    return module.run(config, db, log, next)
  })
}