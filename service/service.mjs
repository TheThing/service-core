import path from 'path'
import { readFileSync } from 'fs'
import { getPathFromRoot } from '../core/util.mjs'
import nodewindows from 'node-windows'

let config = JSON.parse(readFileSync(getPathFromRoot('./config.json')))

const Service = nodewindows.Service

let serviceConfig = {
  name: config.serviceName,
  description: config.description,
  script: getPathFromRoot('./runner.mjs'),
  env: {
    name: 'NODE_ENV',
    value: 'production',
  },
  wait: 0,
  grow: .5,
  maxRestarts: 10
  //, workingDirectory: '...'
  //, allowServiceLogon: true
}

console.log('Service', serviceConfig)

// Create a new service object
let svc = new Service(serviceConfig);

export default svc
