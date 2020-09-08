import fs from 'fs'
import { EventEmitter } from 'events'
import { request } from './client.mjs'

const fsp = fs.promises

export default class Core extends EventEmitter{
  constructor(util, config, db, log, closeCb) {
    super()
    this._util = util
    this._config = config
    this._db = db
    this._log = log
    this._close = closeCb
    this._appRunning = false
    this._manageRunning = false
    this._appUpdating = {
      status: false,
      starting: false,
      logs: '',
    }
    this._manageUpdating = {
      status: false,
      starting: false,
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
    this.logActive(name, active, `[Core] Fetching release info from: https://api.github.com/repos/${this._config[name + 'Repository']}/releases\n`)


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
            this.logActive(name, active, `[Core] Found version ${item.name} with file ${item.assets[i].name}\n`)
  
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
    if (fs.existsSync(this._util.getPathFromRoot(`./${name}/` + version.name))) {
      await this._util.runCommand('rmdir', ['/S', '/Q', `"${this._util.getPathFromRoot(`./${name}/` + version.name)}"`])
    }
    try {
      await fsp.mkdir(this._util.getPathFromRoot(`./${name}/` + version.name))
    } catch(err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
    }
    // await fsp.mkdir(this._util.getPathFromRoot(`./${name}/` + version.name + '/node_modules'))
    this.logActive(name, active, `[Core] Downloading ${version.name} (${version.url}) to ${version.name + '/' + version.name + '.zip'}\n`)
    let filePath = this._util.getPathFromRoot(`./${name}/` + version.name + '/' + version.name + '.zip')
    await request(version.url, filePath)
    this.logActive(name, active, `[Core] Downloading finished, starting extraction\n`)
    await this._util.runCommand(
      '"C:\\Program Files\\7-Zip\\7z.exe"',
      ['x', `"${filePath}"`],
      this._util.getPathFromRoot(`./${name}/` + version.name + '/'),
      this.logActive.bind(this, name, active)
    )

    if (!fs.existsSync(this._util.getPathFromRoot(`./${name}/` + version.name + '/index.mjs'))) {
      this.logActive(name, active, `\n[Core] ERROR: Missing index.mjs in the folder, exiting\n`)
      throw new Error(`Missing index.mjs in ${this._util.getPathFromRoot(`./${name}/` + version.name + '/index.mjs')}`)
    }

    this.logActive(name, active, `\n[Core] Starting npm install\n`)
    
    await this._util.runCommand(
      'npm.cmd',
      ['install', '--production', '--no-optional', '--no-package-lock', '--no-audit'],
      this._util.getPathFromRoot(`./${name}/` + version.name + '/'),
      this.logActive.bind(this, name, active)
    )
    
    await this._db.set(`core.${name}LatestInstalled`, version.name)
                  .write()
    this.emit('dbupdated', {})
    
    this.logActive(name, active, `\n[Core] Successfully installed ${version.name}\n`)
  }

  getActive(name) {
    if (name === 'app') {
      return this._appUpdating
    } else if (name === 'manage') {
      return this._manageUpdating
    } else {
      throw new Error('Invalid name: ' + name)
    }
  }
  
  async startProgram(name) {
    let active = this.getActive(name)

    if ((name === 'app' && this._appRunning)
        || (name === 'manage' && this._manageRunning)
        || active.starting) {
      this._log.event.warn('Attempting to start ' + name + ' which is already running')
      this._log.warn('Attempting to start ' + name + ' which is already running')
      this.logActive(name, active, `[${name}] Attempting to start it but it is already running\n`, true)
      return
    }
    active.starting = true

    let core = this._db.get('core').value()
    let version = core[name + 'LatestInstalled']
    if (await this.tryStartProgram(name, active, version)) return
    version = core[name + 'LastActive']
    if (await this.tryStartProgram(name, active,version)) return

    this._log.error('Unable to start ' + name)
    this._log.event.error('Unable to start ' + name)

    active.starting = false
  }

  async tryStartProgram(name, active, version) {
    if (!version) return false
    this.logActive(name, active, `[${name}] Attempting to start ${version}\n`)
    let indexPath = this._util.getUrlFromRoot(`./${name}/` + version + '/index.mjs')
    let module

    try {
      this.logActive(name, active, `[${name}] Loading ${indexPath}\n`)
      module = await import(indexPath)
    } catch (err) {
      this.logActive(name, active, `[${name}] Error importing module\n`, true)
      this.logActive(name, active, `[${name}] ${err.stack}\n`, true)
      this._log.error(err, `Failed to load ${indexPath}`)
      return false
    }
    let checkTimeout = null
    try {
      await new Promise((res, rej) => {
        try {
          let checkTimeout = setTimeout(function() {
            rej(new Error('Program took longer than 60 seconds to resolve promise'))
          }, 60 * 1000)

          this.logActive(name, active, `[${name}] Starting module\n`)
          let out = module.start(this._config, this._db, this._log, this)
          if (out.then) {
            return out.then(res, rej)
          } else {
            res()
          }
        } catch (err) {
          rej(err)
        }
      })
    } catch (err) {
      clearTimeout(checkTimeout)
      this.logActive(name, active, `[${name}] Error starting\n`, true)
      this.logActive(name, active, `[${name}] ${err.stack}\n`, true)
      this._log.error(err, `Failed to start ${name}`)
      return false
    }
    clearTimeout(checkTimeout)
    
    this.logActive(name, active, `[${name}] Successfully started version ${version}\n`)
    await this._db.set(`core.${name}Active`, version)
                  .write()

    let port = name === 'app' ? this._config.port : this._config.managePort
    this.logActive(name, active, `[${name}] Checking if listening to port ${port}\n`)

    if (name === 'app') {
      this._appRunning = true
    } else {
      this._manageRunning = true
    }

    this.logActive(name, active, `[${name}] Module is running successfully\n`)
    
    return true
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

    let active = this.getActive(name)
    active.status = true
    active.logs = ''

    this.emit('statusupdated', {})
    this.logActive(name, active, `[Core] Time: ${new Date().toISOString().replace('T', ' ').split('.')[0]}\n`)
    this.logActive(name, active, '[Core] Checking for updates...\n')

    let version = null
    let installed = false
    let found = false
    try {
      version = await this.getLatestVersion(active, name)
      let core = this._db.get('core').value()
      let fromDb = this._db.get(`core_${name}History`).getById(version.name).value()
      console.log(fromDb)
      if (!fromDb || !fromDb.installed) {
        let oldVersion = core[name + 'Current'] || '<none>'
        this.logActive(name, active, `[Core] Updating from ${oldVersion} to ${version.name}\n`)
        await this.installVersion(name, active, version)
        this.logActive(name, active, `[Core] Finished: ${new Date().toISOString().replace('T', ' ').split('.')[0]}\n`)
        installed = new Date()
      } else {
        found = true
        this.logActive(name, active, `[Core] Version ${version.name} already installed\n\n[Core] Logs from previous install:\n----------------------------------\n\n${fromDb.logs}\n----------------------------------\n[Core] Old logs finished`)
      }
    } catch(err) {
      this.logActive(name, active, '\n', true)
      this.logActive(name, active, `[Error] Exception occured while updating ${name}\n`, true)
      this.logActive(name, active, err.stack, true)
      this._log.error(err, 'Error while updating ' + name)
    }
    active.status = false
    if (version && !found) {
      await this._db.get(`core_${name}History`).upsert({
        id: version.name,
        name: version.name,
        filename: version.filename,
        url: version.url,
        description: version.description,
        logs: active.logs,
        stable: 0,
        installed: installed,
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