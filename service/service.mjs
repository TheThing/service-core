import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import nodewindows from 'node-windows'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let config = JSON.parse(readFileSync(path.join(__dirname,'../config.json')))

const Service = nodewindows.Service

// Create a new service object
var svc = new Service({
  name: config.serviceName,
  description: config.description,
  script: path.join(__dirname,'../runner.mjs'),
  env: {
    name: 'NODE_ENV',
    value: 'production',
  },
  //, workingDirectory: '...'
  //, allowServiceLogon: true
});

export default svc
