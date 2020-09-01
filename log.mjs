import nodewindows from 'node-windows'
import bunyan from 'bunyan-lite'
import lowdb from './db.mjs'

export default function getLog(name) {
  let settings
  let ringbuffer = new bunyan.RingBuffer({ limit: 10 })

  if (process.env.NODE_ENV === 'production') {
    settings = {
      "name": "service-core",
      "streams": [{
          path: 'log.log',
          level: 'info',
        }
      ]
    }
  } else {
    settings = {
      "name": "service-core",
      "streams": [{
          "stream": process.stdout,
          "level": "debug"
        }
      ]
    }
  }

  let logger

  settings.streams.push({
    stream: ringbuffer,
    type: 'raw',
    level: 'info',
  })

  settings.streams.push({
    stream: {
      write: function(record) {
        logger.emit('newlog', record)
      },
      end: function() {},
      destroy: function() {},
      destroySoon: function() {},
    },
    type: 'raw',
    level: 'info',
  })

  // Create our logger.
  logger = bunyan.createLogger(settings)

  logger.event = new nodewindows.EventLogger(name)
  logger.ringbuffer = ringbuffer

  return logger
}
