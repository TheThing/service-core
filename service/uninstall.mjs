import svc from './service.mjs'

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('uninstall',function(){
  console.log('Uninstall complete.');
  console.log('The service exists: ',svc.exists);
});

svc.uninstall();
