import fs from 'fs'
import { EventEmitter } from 'events'
import { request } from './client.mjs'
import HttpServer from './http.mjs'

const fsp = fs.promises

export default class Core extends EventEmitter{
  constructor(util, config, db, log, closeCb) {
    super()
    process.stdin.resume()
    this.http = new HttpServer()
    this.util = util
    this.config = config
    this.db = db
    this.log = log
    this._close = closeCb
    this._activeCrashHandler = null
    this.appRunning = false
    this.manageRunning = false
    this.monitoring = false
    this._appUpdating = {
      fresh: true,
      updating: false,
      starting: false,
      logs: '',
    }
    this._manageUpdating = {
      fresh: true,
      updating: false,
      starting: false,
      logs: '',
    }

    this.db.set('core.manageActive', null)
           .set('core.appActive', null)
           .write().then()
  }

  startMonitor() {
    if (this.monitoring) return
    this.log.info('[Scheduler] Automatic updater has been turned on. Will check for updates every 3 hours')
    let updating = false

    this.monitoring = setInterval(async () => {
      if (updating) return
      updating = true
      this.log.info('[Scheduler] Starting automatic check for latest version of app and manage')

      try {
        await this.installLatestVersion('app')
        await this.installLatestVersion('manage')
      } catch(err) {
        this.log.error(err, 'Error checking for latest versions')
        this.log.event.error('Error checking for latest versions: ' + err.message)
        updating = false
        return
      }

      try {
        if (this.hasNewVersionAvailable('app') || !this.appRunning) {
          await this.tryStartProgram('app')
        }
      } catch(err) {
        this.log.error(err, 'Unknown error occured attempting to app')
        this.log.event.error('Unknown error starting app: ' + err.message)
      }
      try {
        if (this.hasNewVersionAvailable('manage') || !this.manageRunning) {
          await this.tryStartProgram('manage')
        }
      } catch(err) {
        this.log.error(err, 'Unknown error occured attempting to start manage')
        this.log.event.error('Unknown error starting manage: ' + err.message)
      }
      updating = false
    }, 1000 * 60 * 60 * 3) // every 3 hours
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
    this.logActive(name, active, `Updater: Fetching release info from: https://api.github.com/repos/${this.config[name + 'Repository']}/releases\n`)

    let result = await request(this.config, `https://api.github.com/repos/${this.config[name + 'Repository']}/releases`)

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
            if (this.db.get('core.' + name + 'LatestInstalled').value() === item.name) {
              this.logActive(name, active, `Updater: Latest version already installed, exiting early\n`)
              return null
            }
            this.logActive(name, active, `Updater: Found version ${item.name} with file ${item.assets[i].name}\n`)
  
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
      this.log.info(`[${name}] ` + logline.replace(/\n/g, ''))
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
    if (!fs.existsSync(this.util.getPathFromRoot(`./${name}/`))) {
      await fsp.mkdir(this.util.getPathFromRoot(`./${name}/`))
    }
    try {
      await fsp.mkdir(this.util.getPathFromRoot(`./${name}/` + version.name))
    } catch(err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
    }
    // await fsp.mkdir(this.util.getPathFromRoot(`./${name}/` + version.name + '/node_modules'))
    this.logActive(name, active, `Installer: Downloading ${version.name} (${version.url}) to ${version.name + '/' + version.name + '.zip'}\n`)
    let filePath = this.util.getPathFromRoot(`./${name}/` + version.name + '/' + version.name + '.zip')
    await request(this.config, version.url, filePath)
    this.logActive(name, active, `Installer: Downloading finished, starting extraction\n`)
    await this.util.runCommand(
      '"C:\\Program Files\\7-Zip\\7z.exe"',
      ['x', `"${filePath}"`],
      this.util.getPathFromRoot(`./${name}/` + version.name + '/'),
      this.logActive.bind(this, name, active)
    )

    if (!fs.existsSync(this.util.getPathFromRoot(`./${name}/` + version.name + '/index.mjs'))) {
      this.logActive(name, active, `\nInstaller: ERROR: Missing index.mjs in the folder, exiting\n`)
      throw new Error(`Missing index.mjs in ${this.util.getPathFromRoot(`./${name}/` + version.name + '/index.mjs')}`)
    }

    this.logActive(name, active, `\nInstaller: Starting npm install\n`)
    
    await this.util.runCommand(
      'npm.cmd',
      ['install', '--production', '--no-optional', '--no-package-lock', '--no-audit'],
      this.util.getPathFromRoot(`./${name}/` + version.name + '/'),
      this.logActive.bind(this, name, active)
    )
    
    await this.db.set(`core.${name}LatestInstalled`, version.name)
                  .write()
    this.emit('dbupdated', {})
    
    this.logActive(name, active, `\nInstaller: Successfully installed ${version.name}\n`)
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

  hasNewVersionAvailable(name) {
    let newestVersion = this.db.get(`core.${name}LatestInstalled`).value()
    if (!newestVersion) return false

    let history = this.db.get(`core_${name}History`).getById(newestVersion).value()
    if (history.installed && history.stable === 0) {
      return true
    }
    return false
  }
  
  async tryStartProgram(name) {
    let active = this.getActive(name)

    if (this[name + 'Running'] && !this.hasNewVersionAvailable(name)) {
      this.log.event.warn('Attempting to start ' + name + ' which is already running')
      this.log.warn('Attempting to start ' + name + ' which is already running')
      this.logActive(name, active, `Runner: Attempting to start it but it is already running\n`, true)
      return
    }
    active.starting = true

    if (this[name + 'Running']) {
      let success = await this.http.closeServer(name)
      if (!success) {
        if (process.env.NODE_ENV === 'production') {
          this.logActive(name, active, `Runner: Found new version but server could not be shut down, restarting service core\n`)
          await new Promise(() => {
            this.log.event.warn('Found new version of ' + name + ' but server could not be shut down gracefully, restarting...', null, () => {
              process.exit(100)
            })
          })
        } else {
          this.logActive(name, active, `Runner: Found new version but server could not be shut down\n`)
          return
        }
      }
      this[name + 'Running'] = false
      this.emit('statusupdated', {})
    }

    let history = this.db.get(`core_${name}History`)
        .filter('installed')
        .orderBy('installed', 'desc')
        .value()
    this.logActive(name, active, `Runner: Finding available version\n`)

    for (let i = 0; i < history.length; i++) {
      if ((history[i].stable === -1 && !active.fresh)
          || (history[i].stable < -1)) {
        this.logActive(name, active, `Runner: Skipping version ${history[i].name} due to marked as unstable\n`)
        continue
      }

      await this.db.set(`core.${name}Active`, history[i].name)
                    .write()
      this.emit('dbupdated', {})

      let running = await this.tryStartProgramVersion(name, active, history[i].name)
      if (running) {
        history[i].stable = 1
      } else {
        if (active.fresh || history[i].stable === -1) {
          history[i].stable = -2
        } else {
          history[i].stable = -1
        }
        await this.db.set(`core.${name}Active`, null)
                    .write()
        this.emit('dbupdated', {})
      }
      active.fresh = false

      await this.db.get(`core_${name}History`).updateById(history[i].id, history[i].stable).write()
      if (history[i].stable > 0) break
    }

    if (!this.db.get(`core.${name}Active`).value()) {
      this.logActive(name, active, `Runner: Could not find any available stable version of ${name}\n`)
      this.log.error('Unable to start ' + name)
      this.log.event.error('Unable to start ' + name)
    }

    active.starting = false
  }

  programCrashed(name, version, active, oldStable) {
    let newStable = -2
    console.log('EXITING:', oldStable, active)
    if (oldStable === 0 && !active.fresh) {
      newStable = -1
    }
    let temp = this.db.get(`core_${name}History`).getById(version).set('stable', newStable )
    temp.value() // Trigger update on __wrapped__
    fs.writeFileSync(this.db.adapterFilePath, JSON.stringify(temp.__wrapped__, null, 2))
  }

  async tryStartProgramVersion(name, active, version) {
    if (!version) return false
    this.logActive(name, active, `Runner: Attempting to start ${version}\n`)
    let indexPath = this.util.getUrlFromRoot(`./${name}/` + version + '/index.mjs')
    let module

    try {
      this.logActive(name, active, `Runner: Loading ${indexPath}\n`)
      module = await import(indexPath)
    } catch (err) {
      this.logActive(name, active, `Runner: Error importing module\n`, true)
      this.logActive(name, active, `${err.stack}\n`, true)
      this.log.error(err, `Failed to load ${indexPath}`)
      return false
    }

    let checkTimeout = null
    let oldStable = this.db.get(`core_${name}History`).getById(version).value().stable
    this._activeCrashHandler = this.programCrashed.bind(this, name, version, active, oldStable)
    process.once('exit', this._activeCrashHandler)
    try {
      let port = name === 'app' ? this.config.port : this.config.managePort
      await new Promise((res, rej) => {
        checkTimeout = setTimeout(function() {
          rej(new Error('Program took longer than 60 seconds to resolve promise'))
        }, 60 * 1000)

        this.logActive(name, active, `Runner: Starting module\n`)

        try {
          this.http.setContext(name)
          this.startModule(module, port)
              .then(res, rej)
        } catch (err) {
          rej(err)
        }
      })
      clearTimeout(checkTimeout)

      await this.checkProgramRunning(name, active, port)
      process.off('exit', this._activeCrashHandler)
    } catch (err) {
      clearTimeout(checkTimeout)
      process.off('exit', this._activeCrashHandler)
      await this.http.closeServer(name)

      this.logActive(name, active, `Runner: Error starting\n`, true)
      this.logActive(name, active, `${err.stack}\n`, true)
      this.log.error(err, `Failed to start ${name}`)
      return false
    }
    this._activeCrashHandler = null
    
    this.logActive(name, active, `Runner: Successfully started version ${version}\n`)
    await this.db.set(`core.${name}Active`, version)
                  .write()

    if (name === 'app') {
      this.appRunning = true
    } else {
      this.manageRunning = true
    }
    this.emit('statusupdated', {})

    this.logActive(name, active, `Runner: Module is running successfully\n`)
    
    return true
  }

  async checkProgramRunning(name, active, port) {
    this.logActive(name, active, `Checker: Testing out module port ${port}\n`)
    let start = new Date()
    let error = null
    let success = false

    while (new Date() - start < 10 * 1000) {
      try {
        let check = await request(this.config, `http://localhost:${port}`, null, 0, true)
        success = true
        break
      } catch(err) {
        this.logActive(name, active, `Checker: ${err.message}, retrying in 3 seconds\n`)
        error = err
        await new Promise(function(res) { setTimeout(res, 3000)})
      }
    }
    if (success) return true
    throw error || new Error('Checking server failed')
  }

  async installLatestVersion(name) {
    if (!this.config[name + 'Repository']) {
      if (name === 'app') {
        this.log.error(name + ' Repository was missing from config')
        this.log.event.error(name + ' Repository was missing from config')
      } else {
        this.log.warn(name + ' Repository was missing from config')
        this.log.event.warn(name + ' Repository was missing from config')
      }
      return
    }

    let active = this.getActive(name)
    let oldLogs = active.logs || ''
    if (oldLogs) {
      oldLogs += '\n'
    }
    active.logs = ''
    active.updating = true

    this.emit('statusupdated', {})
    this.logActive(name, active, `Installer: Checking for updates at time: ${new Date().toISOString().replace('T', ' ').split('.')[0]}\n`)

    let version = null
    let installed = false
    let found = false
    try {
      version = await this.getLatestVersion(active, name)
      if (version) {
        let core = this.db.get('core').value()
        let fromDb = this.db.get(`core_${name}History`).getById(version.name).value()
        if (!fromDb || !fromDb.installed) {
          let oldVersion = core[name + 'Current'] || '<none>'
          this.logActive(name, active, `Installer: Updating from ${oldVersion} to ${version.name}\n`)
          await this.installVersion(name, active, version)
          this.logActive(name, active, `Installer: Finished: ${new Date().toISOString().replace('T', ' ').split('.')[0]}\n`)
          installed = new Date()
        } else {
          found = true
          this.logActive(name, active, `Installer: Version ${version.name} already installed\n`)
        }
      }
    } catch(err) {
      this.logActive(name, active, '\n', true)
      this.logActive(name, active, `Installer: Exception occured while updating ${name}\n`, true)
      this.logActive(name, active, err.stack, true)
      this.log.error('Error while updating ' + name, err)
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
        installed: installed && installed.toISOString(),
      }).write()
    }
    active.logs = oldLogs + active.logs
    this.emit(name + 'log', active)
    this.emit('statusupdated', {})
  }

  async start(name) {
    var version = this.db.get('core.' + name + 'LatestInstalled').value()
    if (version) {
      await this.tryStartProgram(name)
    }

    await this.installLatestVersion(name)

    if (version !== this.db.get('core.' + name + 'LatestInstalled').value()) {
      if (!this[name + 'Running'] || this.hasNewVersionAvailable(name)) {
        await this.tryStartProgram(name)
      }
    }
  }
}
