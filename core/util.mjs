import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'

export function getPathFromRoot(add) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname,'../', add)
}

export function getUrlFromRoot(add) {
  return path.join(import.meta.url,'../../', add)
}

export function runCommand(command, options = [], folder = null, stream = function() {}) {
  return new Promise(function(res, rej) {
    stream(`[Command] ${folder ? folder : ''}${command} ${options.join(' ')}\n`)
    let processor = spawn(command, options, {
      shell: true,
      cwd: folder,
    })
    let timeOuter = setTimeout(function() {
      processor.stdin.write('n\n')
    }, 250)
    processor.stdout.on('data', function(data) {
      stream(data.toString())
    })
    processor.stderr.on('data', function(data) {
      stream(data.toString())
    })
    processor.on('error', function(err) {
      clearInterval(timeOuter)
      rej(err)
    })
    processor.on('exit', function (code) {
      clearInterval(timeOuter)
      if (code !== 0) {
        return rej(new Error('Program returned error code: ' + code))
      }
      res(code)
    })
  })
}
