# service-core
Service-Core is a project to faciliate running a node application in (semi-)production environment on a windows machine. Using Windows Services, Service-Core will register itself and autostart on startup and make sure the application is running. In addition it will take care of maintaining the application including auto updating it seamlessly.

# The Core
The core provides methods for updating applications as well as taking care of restarting and installing and everything needed to have a pleasent experience running a node application in Windows. It auto checks github for new releases based on the repository specified in `config.json`.

The core supports running two applications by default (specified in `config.json` file):
 * The manage app: Designated UI node app to provide UI interface on top of service-core. Not needed as service-core already does everything by itself but nice to have to remotely read logs and manually trigger updates among other things 
 * The main app: The main application service-core is designated to run.
 
 Both the main app and manage app get regular update checks and will automatically be installed if a new version is detected.
 
# API

To build a service-core application I recomennd checking out [hello world](https://github.com/thething/sc-helloworld) app but in short, all service core applications require the following things:

* `index.mjs` that exposes a function called `start(config, db, log, core, http, port)`
* The application in question must use the passed on `http` parameter to call `.createServer()`. Otherwise service-core has no way of shutting it down to provide seamless updates among other things.

The `start()` function gets called with following parameters:
 * config: JSON object containing the entirety of `config.json`
 * db: A [lowdb](https://github.com/typicode/lowdb) database available for the application to use. Also used internally in service-core to manage versions.
 * log: A bunyan logger for logging.
   * log.event.info,warn,error(message): Write a log message to the windows event viewer.
 * core: The internal core. Exposes multiple methods for managing service-core
 * http: A wrapped internal node http to call `.createServer()`. Allows service-core to monitor the server in question.
 * port: The port the application should be listening to.
