import svc from './service.mjs'

svc.on('install',function(){
  svc.start();
});

svc.on('alreadyinstalled',function(){
  svc.start();
});

svc.install();