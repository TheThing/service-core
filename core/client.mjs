import http from 'http'
import https from 'https'
import fs from 'fs'
import { URL } from 'url'

export function request(path, filePath = null, redirects = 0) {
  let parsed = new URL(path)

  let h
  if (parsed.protocol === 'https:') {
    h = https
  } else {
    h = http
  }

  return new Promise(function(resolve, reject) {
    if (!path) {
      return reject(new Error('Request path was empty'))
    }
    let req = h.request({
      path: parsed.pathname + parsed.search,
      port: parsed.port,
      method: 'GET',
      headers: {
        'User-Agent': 'TheThing/service-core',
        Accept: 'application/vnd.github.v3+json'
      },
      hostname: parsed.hostname
    }, function(res) {
      let output = ''
      if (filePath) {
        let file = fs.createWriteStream(filePath)
        res.pipe(file)
      } else {
        res.on('data', function(chunk) {
          output += chunk
        })
      }
      res.on('end', function() {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          if (redirects > 5) {
            return reject(new Error(`Too many redirects (last one was ${res.headers.location})`))
          }
          return resolve(request(res.headers.location, filePath, redirects + 1))
        } else if (res.statusCode >= 400) {
          return reject(new Error(`HTTP Error ${statusCode}: ${output}`))
        }
        resolve({
          statusCode: res.statusCode,
          status: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: output
        })
      })
      req.on('error', reject)
    })
    req.end()
  }).then(function(res) {
    if (!filePath) {
      try {
        res.body = JSON.parse(res.body)
      } catch(e) {
        throw new Error(res.body)
      }
    }
    return res
  })
}