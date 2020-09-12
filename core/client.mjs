import http from 'http'
import https from 'https'
import fs from 'fs'
import url from 'url'

export function request(path, filePath = null, redirects, returnText = false) {
  let newRedirects = redirects + 1
  if (!path || !path.startsWith('http')) {
    return Promise.reject(new Error('URL was empty or missing http in front'))
  }
  let parsed = new url.URL(path)

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
      timeout: returnText ? 5000 : 60000,
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
          if (newRedirects > 5) {
            return reject(new Error(`Too many redirects (last one was ${res.headers.location})`))
          }
          if (!res.headers.location) {
            return reject(new Error('Redirect returned no path in location header'))
          }
          if (res.headers.location.startsWith('http')) {
            return resolve(request(res.headers.location, filePath, newRedirects, returnText))
          } else {
            return resolve(request(url.resolve(path, res.headers.location), filePath, newRedirects, returnText))
          }
        } else if (res.statusCode >= 400) {
          return reject(new Error(`HTTP Error ${res.statusCode}: ${output}`))
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
      req.on('timeout', function(err) {
        reject(err)
      })
    })
    req.end()
  }).then(function(res) {
    if (!filePath && !returnText) {
      try {
        res.body = JSON.parse(res.body)
      } catch(e) {
        throw new Error(res.body)
      }
    }
    return res
  })
}