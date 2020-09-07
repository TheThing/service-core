import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

export function getPathFromRoot(add) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname,'../', add)
}

export function runCommand(command, options = [], stream = function() {}) {
  return new Promise(function(res, rej) {
    let processor = spawn(command, options, {shell: true})
    processor.stdout.on('data', function(data) {
      stream(data.toString())
      processor.stdin.write('n')
    })
    processor.stderr.on('data', function(data) {
      stream(data.toString())
      processor.stdin.write('n')
    })
    processor.on('error', function(err) {
      rej(err)
    })
    processor.on('exit', function (code) {
      res(code)
    })
  })
}
