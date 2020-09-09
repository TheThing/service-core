import Util from './core/util.mjs'
import { readFileSync } from 'fs'
import getLog from './core/log.mjs'
import lowdb from './core/db.mjs'
import Core from './core/core.mjs'

export default class ServiceCore {
  constructor(name, root_import_meta_url) {
    if (!root_import_meta_url) {
      throw new Error('ServiceCore must be called with the full string from "import.meta.url" from a file residing in the root directory')
    }
    this._root_import_meta_url = root_import_meta_url
    this.util = new Util(this._root_import_meta_url)
    this.log = getLog(name)
    this.db = null
    this.config = null
    this.core = null
  }

  close(err) {
    if (err) {
      this.log.fatal(err, 'App recorded a fatal error')
      process.exit(4)
    }
    this.log.warn('App asked to be restarted')
    process.exit(0)
  }

  async init(module = null) {
    try {
      this.config = JSON.parse(readFileSync(this.util.getPathFromRoot('./config.json')))
    } catch (err) {
      throw new Error('Unable to read config.json from root directory: ' + err)
    }

    try {
      this.db = await lowdb(this.util, this.log)
    } catch (err) {
      throw new Error('Unable to read initialise lowdb: ' + err)
    }

    this.core = new Core(this.util, this.config, this.db, this.log, (err) => this.close(err))

    if (module) {
      return this.startModule(module)
    }
  }

  startModule(module) {
    return this.core.startModule(module, this.config.devPort)
  }
}
