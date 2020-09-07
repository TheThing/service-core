import fs from 'fs'
import { EventEmitter } from 'events'
import { request } from './client.mjs'
import { getPathFromRoot, runCommand } from './util.mjs'

const fsp = fs.promises

export default class Core extends EventEmitter{
  constructor(config, db, log, closeCb) {
    super()
    this._config = config
    this._db = db
    this._log = log
    this._close = closeCb
    this._appRunning = false
    this._manageRunning = false
    this._appUpdating = {
      status: false,
      logs: '',
    }
    this._manageUpdating = {
      status: false,
      logs: '',
    }
  }

  restart() {
    this._close()
  }

  status() {
    return {
      app: this._appRunning,
      manage: this._manageRunning,
      appUpdating: this._appUpdating.status,
      manageUpdating: this._manageUpdating.status,
    }
  }

  async getLatestVersion(active, name) {
    // Example: 'https://api.github.com/repos/thething/sc-helloworld/releases'
    this.logActive(name, active, `Fetching release info from: https://api.github.com/repos/${this._config[name + 'Repository']}/releases\n`)


    let result = await request(`https://api.github.com/repos/${this._config[name + 'Repository']}/releases`)

    let items = result.body.filter(function(item) {
      if (!item.assets.length) return false
      for (let i = 0; i < item.assets.length; i++) {
        if (item.assets[i].name.endsWith('-sc.zip')) return true
      }
    })

    if (items && items.length) {
      for (let x = 0; x < items.length; x++) {
        let item = items[x]
        for (let i = 0; i < item.assets.length; i++) {
          if (item.assets[i].name.endsWith('-sc.zip')) {
            this.logActive(name, active, `Found version ${item.name} with file ${item.assets[i].name}\n`)
  
            await this._db.set(`core.${name}LatestVersion`, item.name)
                    .write()
            this.emit('dbupdated', {})

            return {
              name: item.name,
              filename: item.assets[i].name,
              url: item.assets[i].browser_download_url,
              description: item.body,
            }
          }
        }
      }
    } else {
      return null
    }
  }

  logActive(name, active, logline, doNotPrint = false) {
    if (!doNotPrint) {
      this._log.info(`Log ${name}: ` + logline.replace(/\n/g, ''))
    }
    active.logs += logline
    this.emit(name + 'log', active)
  }

  getProgramLogs(name) {
    if (name === 'app' && this._appUpdating.logs) {
      return this._appUpdating.logs
    } else if (name === 'manage' && this._manageUpdating.logs) {
      return this._manageUpdating.logs
    }

    let latestInstalled = this._db.get('core.' + name + 'LatestInstalled').value()
    let latestVersion = this._db.get('core.' + name + 'LatestVersion').value()
    if (latestVersion) {
      let value = this._db.get(`core_${name}History`).getById(latestVersion).value()
      if (value) return value.logs
    }
    if (latestInstalled) {
      let value = this._db.get(`core_${name}History`).getById(latestInstalled).value()
      if (value) return value.logs
    }
    return '< no logs found >'
  }

  async installVersion(name, active, version) {
    if (fs.existsSync(getPathFromRoot('./app/' + version.name))) {
      await runCommand('rmdir', ['/S', '/Q', `"${getPathFromRoot('./app/' + version.name)}"`])
    }
    try {
      await fsp.mkdir(getPathFromRoot('./app/' + version.name))
    } catch(err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
    }
    // await fsp.mkdir(getPathFromRoot('./app/' + version.name + '/node_modules'))
    this.logActive(name, active, `Downloading ${version.name} (${version.url}) to ${version.name + '/' + version.name + '.zip'}\n`)
    let filePath = getPathFromRoot('./app/' + version.name + '/' + version.name + '.zip')
    await request(version.url, filePath)
    this.logActive(name, active, `Downloading finished, starting extraction\n`)
    await runCommand(
      '"C:\\Program Files\\7-Zip\\7z.exe"',
      ['x', `"${filePath}"`],
      getPathFromRoot('./app/' + version.name + '/'),
      this.logActive.bind(this, name, active)
    )

    if (!fs.existsSync(getPathFromRoot('./app/' + version.name + '/index.mjs'))) {
      this.logActive(name, active, `\nERROR: Missing index.mjs in the folder, exiting\n`)
      throw new Error(`Missing index.mjs in ${getPathFromRoot('./app/' + version.name + '/index.mjs')}`)
    }

    this.logActive(name, active, `\nStarting npm install\n`)
    
    await runCommand(
      'npm.cmd',
      ['install', '--production', '--no-optional', '--no-package-lock', '--no-audit'],
      getPathFromRoot('./app/' + version.name + '/'),
      this.logActive.bind(this, name, active)
    )

    this.logActive(name, active, `\nInstalled:\n`)

    await runCommand(
      'npm.cmd',
      ['list'],
      getPathFromRoot('./app/' + version.name + '/'),
      this.logActive.bind(this, name, active)
    )
    
    await this._db.set(`core.${name}LatestInstalled`, version.name)
                  .write()
    this.emit('dbupdated', {})
    
    this.logActive(name, active, `\nSuccessfully installed ${version.name}\n`)
  }
  
  async startProgram(name) {
  }

  async updateProgram(name) {
    if (!this._config[name + 'Repository']) {
      if (name === 'app') {
        this._log.error(name + 'Repository was missing from config')
        this._log.event.error(name + 'Repository was missing from config')
      } else {
        this._log.warn(name + 'Repository was missing from config')
        this._log.event.warn(name + 'Repository was missing from config')
      }
      return
    }

    let active = null
    if (name === 'app') {
      active = this._appUpdating
    } else {
      active = this._manageUpdating
    }
    active.status = true
    active.logs = ''

    this.emit('statusupdated', {})
    this.logActive(name, active, 'Checking for updates...\n')

    let version = null
    try {
      version = await this.getLatestVersion(active, name)
      let core = this._db.get('core').value()
      if (!core[name + 'Current'] || (core[name + 'Current'] !== version.name && core[name + 'CurrentVersion'] !== version)) {
        let oldVersion = core[name + 'Current'] || '<none>'
        this.logActive(name, active, `Updating from ${oldVersion} to ${version.name}\n`)
        await this.installVersion(name, active, version)
      }
    } catch(err) {
      this.logActive(name, active, '\n', true)
      this.logActive(name, active, `Exception occured while updating ${name}\n`, true)
      this.logActive(name, active, err.stack, true)
      this._log.error(err, 'Error while updating ' + name)
    }
    active.status = false
    if (version) {
      await this._db.get(`core_${name}History`).upsert({
        id: version.name,
        name: version.name,
        filename: version.filename,
        url: version.url,
        description: version.description,
        logs: active.logs,
      }).write()
    }
    this.emit('statusupdated', {})
  }

  async start(name) {
    await this.updateProgram(name)
    if (core[name + 'CurrentVersion']) {
      await this.startProgram(name)
    }
  }
}