import fs from 'fs'
import { EventEmitter } from 'events'
import { request } from './client.mjs'
import HttpServer from './http.mjs'

const fsp = fs.promises

export default class Core extends EventEmitter{
  constructor(util, config, db, log, closeCb) {
    super()
    this.http = new HttpServer()
    this.util = util
    this.config = config
    this.db = db
    this.log = log
    this._close = closeCb
    this.appRunning = false
    this.manageRunning = false
    this._appUpdating = {
      updating: false,
      starting: false,
      logs: '',
    }
    this._manageUpdating = {
      updating: false,
      starting: false,
      logs: '',
    }
  }

  restart() {
    this._close()
  }

  status() {
    return {
      app: this.appRunning,
      manage: this.manageRunning,
      appUpdating: this._appUpdating.updating,
      manageUpdating: this._manageUpdating.updating,
      appStarting: this._appUpdating.starting,
      manageStarting: this._manageUpdating.starting,
    }
  }

  async getLatestVersion(active, name) {
    // Example: 'https://api.github.com/repos/thething/sc-helloworld/releases'
    this.logActive(name, active, `[Core] Fetching release info from: https://api.github.com/repos/${this.config[name + 'Repository']}/releases\n`)


    let result = await request(`https://api.github.com/repos/${this.config[name + 'Repository']}/releases`)

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
  
            await this.db.set(`core.${name}LatestVersion`, item.name)
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
      this.log.info(`Log ${name}: ` + logline.replace(/\n/g, ''))
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

    let latestInstalled = this.db.get('core.' + name + 'LatestInstalled').value()
    let latestVersion = this.db.get('core.' + name + 'LatestVersion').value()
    if (latestVersion) {
      let value = this.db.get(`core_${name}History`).getById(latestVersion).value()
      if (value) return value.logs
    }
    if (latestInstalled) {
      let value = this.db.get(`core_${name}History`).getById(latestInstalled).value()
      if (value) return value.logs
    }
    return '< no logs found >'
  }

  async installVersion(name, active, version) {
    if (fs.existsSync(this.util.getPathFromRoot(`./${name}/` + version.name))) {
      await this.util.runCommand('rmdir', ['/S', '/Q', `"${this.util.getPathFromRoot(`./${name}/` + version.name)}"`])
    }
    try {
      await fsp.mkdir(this.util.getPathFromRoot(`./${name}/` + version.name))
    } catch(err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
    }
    // await fsp.mkdir(this.util.getPathFromRoot(`./${name}/` + version.name + '/node_modules'))
    this.logActive(name, active, `[Core] Downloading ${version.name} (${version.url}) to ${version.name + '/' + version.name + '.zip'}\n`)
    let filePath = this.util.getPathFromRoot(`./${name}/` + version.name + '/' + version.name + '.zip')
    await request(version.url, filePath)
    this.logActive(name, active, `[Core] Downloading finished, starting extraction\n`)
    await this.util.runCommand(
      '"C:\\Program Files\\7-Zip\\7z.exe"',
      ['x', `"${filePath}"`],
      this.util.getPathFromRoot(`./${name}/` + version.name + '/'),
      this.logActive.bind(this, name, active)
    )

    if (!fs.existsSync(this.util.getPathFromRoot(`./${name}/` + version.name + '/index.mjs'))) {
      this.logActive(name, active, `\n[Core] ERROR: Missing index.mjs in the folder, exiting\n`)
      throw new Error(`Missing index.mjs in ${this.util.getPathFromRoot(`./${name}/` + version.name + '/index.mjs')}`)
    }

    this.logActive(name, active, `\n[Core] Starting npm install\n`)
    
    await this.util.runCommand(
      'npm.cmd',
      ['install', '--production', '--no-optional', '--no-package-lock', '--no-audit'],
      this.util.getPathFromRoot(`./${name}/` + version.name + '/'),
      this.logActive.bind(this, name, active)
    )
    
    await this.db.set(`core.${name}LatestInstalled`, version.name)
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

  async startModule(module, port) {
    let out = await module.start(this.config, this.db, this.log, this, this.http, port)
    if (out && out.then) {
      await out
    }
    if (!this.http.getCurrentServer()) {
      this.log.warn('Module did not call http.createServer')
    }
  }
  
  async tryStartProgram(name) {
    let active = this.getActive(name)

    if ((name === 'app' && this.appRunning)
        || (name === 'manage' && this.manageRunning)
        || active.starting) {
      this.log.event.warn('Attempting to start ' + name + ' which is already running')
      this.log.warn('Attempting to start ' + name + ' which is already running')
      this.logActive(name, active, `[${name}] Attempting to start it but it is already running\n`, true)
      return
    }
    active.starting = true

    let history = this.db.get(`core_${name}History`)
        .filter('installed')
        .orderBy('installed', 'desc')
        .value()

    this.logActive(name, active, `[${name}] Finding available version of ${name}\n`)

    for (let i = 0; i < history.length; i++) {
      if (history[i].stable < 0) {
        this.logActive(name, active, `[${name}] Skipping version ${history[i].name} due to marked as unstable\n`)
        continue
      }

      await this.db.set(`core.${name}Active`, history[i].name)
                    .write()
      this.emit('dbupdated', {})

      let running = await this.tryStartProgramVersion(name, active, history[i].name)
      if (running) {
        history[i].stable = 1
      } else {
        history[i].stable = -1
        await this.db.set(`core.${name}Active`, null)
                    .write()
        this.emit('dbupdated', {})
      }

      await this.db.get(`core_${name}History`).updateById(history[i].id, history[i].stable).write()
      if (history[i].stable > 0) break
    }

    if (!this.db.get(`core.${name}Active`).value()) {
      this.logActive(name, active, `[${name}] Could not find any available stable version of ${name}\n`)
      this.log.error('Unable to start ' + name)
      this.log.event.error('Unable to start ' + name)
    }

    active.starting = false
  }

  async tryStartProgramVersion(name, active, version) {
    if (!version) return false
    this.logActive(name, active, `[${name}] Attempting to start ${version}\n`)
    let indexPath = this.util.getUrlFromRoot(`./${name}/` + version + '/index.mjs')
    let module

    try {
      this.logActive(name, active, `[${name}] Loading ${indexPath}\n`)
      module = await import(indexPath)
    } catch (err) {
      this.logActive(name, active, `[${name}] Error importing module\n`, true)
      this.logActive(name, active, `[${name}] ${err.stack}\n`, true)
      this.log.error(err, `Failed to load ${indexPath}`)
      return false
    }
    let checkTimeout = null
    try {
      await new Promise((res, rej) => {
        let checkTimeout = setTimeout(function() {
          rej(new Error('Program took longer than 60 seconds to resolve promise'))
        }, 60 * 1000)

        this.logActive(name, active, `[${name}] Starting module\n`)

        try {
          this.http.setContext(name)
          this.startModule(module, name === 'app' ? this.config.port : this.config.managePort)
              .then(res, rej)
        } catch (err) {
          rej(err)
        }
      })
    } catch (err) {
      clearTimeout(checkTimeout)
      await this.http.closeServer(name)

      this.logActive(name, active, `[${name}] Error starting\n`, true)
      this.logActive(name, active, `[${name}] ${err.stack}\n`, true)
      this.log.error(err, `Failed to start ${name}`)
      return false
    }
    clearTimeout(checkTimeout)
    
    this.logActive(name, active, `[${name}] Successfully started version ${version}\n`)
    await this.db.set(`core.${name}Active`, version)
                  .write()

    let port = name === 'app' ? this.config.port : this.config.managePort
    this.logActive(name, active, `[${name}] Checking if listening to port ${port}\n`)

    if (name === 'app') {
      this.appRunning = true
    } else {
      this.manageRunning = true
    }
    this.emit('statusupdated', {})

    this.logActive(name, active, `[${name}] Module is running successfully\n`)
    
    return true
  }

  async updateProgram(name) {
    if (!this.config[name + 'Repository']) {
      if (name === 'app') {
        this.log.error(name + 'Repository was missing from config')
        this.log.event.error(name + 'Repository was missing from config')
      } else {
        this.log.warn(name + 'Repository was missing from config')
        this.log.event.warn(name + 'Repository was missing from config')
      }
      return
    }

    let active = this.getActive(name)
    active.updating = true

    this.emit('statusupdated', {})
    this.logActive(name, active, `[Core] Time: ${new Date().toISOString().replace('T', ' ').split('.')[0]}\n`)
    this.logActive(name, active, '[Core] Checking for updates...\n')

    let version = null
    let installed = false
    let found = false
    try {
      version = await this.getLatestVersion(active, name)
      let core = this.db.get('core').value()
      let fromDb = this.db.get(`core_${name}History`).getById(version.name).value()
      if (!fromDb || !fromDb.installed) {
        let oldVersion = core[name + 'Current'] || '<none>'
        this.logActive(name, active, `[Core] Updating from ${oldVersion} to ${version.name}\n`)
        await this.installVersion(name, active, version)
        this.logActive(name, active, `[Core] Finished: ${new Date().toISOString().replace('T', ' ').split('.')[0]}\n`)
        installed = new Date()
      } else {
        found = true
        this.logActive(name, active, `[Core] Version ${version.name} already installed\n`)
      }
    } catch(err) {
      this.logActive(name, active, '\n', true)
      this.logActive(name, active, `[Error] Exception occured while updating ${name}\n`, true)
      this.logActive(name, active, err.stack, true)
      this.log.error(err, 'Error while updating ' + name)
    }
    active.updating = false
    if (version && !found) {
      await this.db.get(`core_${name}History`).upsert({
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
    var version = this.db.get('core.' + name + 'LatestVersion').value()
    if (version) {
      await this.tryStartProgram(name)
    }
  }
}