import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

export function getPathFromRoot(add) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname,'../', add)
}

export function runCommand(command, options = [], folder = null, stream = function() {}) {
  return new Promise(function(res, rej) {
    let processor = spawn(command, options, {
      shell: true,
      cwd: folder,
    })
    let timeOuter = setTimeout(function() {
      processor.stdin.write('n\n')
    }, 250)
    processor.stdout.on('data', function(data) {
      stream(data.toString())
      processor.stdin.write('n\n')
    })
    processor.stderr.on('data', function(data) {
      stream(data.toString())
      processor.stdin.write('n\n')
    })
    processor.on('error', function(err) {
      clearInterval(timeOuter)
      rej(err)
    })
    processor.on('exit', function (code) {
      clearInterval(timeOuter)
      res(code)
    })
  })
}
