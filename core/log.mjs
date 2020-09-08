import nodewindows from 'node-windows'
import bunyan from 'bunyan-lite'

export default function getLog(name) {
  let settings
  let ringbuffer = new bunyan.RingBuffer({ limit: 20 })
  let ringbufferwarn = new bunyan.RingBuffer({ limit: 20 })

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
    stream: ringbufferwarn,
    type: 'raw',
    level: 'warn',
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

  if (process.env.NODE_ENV === 'production') {
    logger.event = new nodewindows.EventLogger(name)
  } else {
    logger.event = {
      info: function() {},
      warn: function() {},
      error: function() {},
    }
  }
  logger.ringbuffer = ringbuffer
  logger.ringbufferwarn = ringbufferwarn

  return logger
}
