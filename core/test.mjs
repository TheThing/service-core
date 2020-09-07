import * as client from './client.mjs'

client.request('https://api.github.com/repos/thething/sc-helloworld/releases')
  .then(
    a => console.log('res:', a),
    err => console.error('err', err)
  ).then(() => process.exit(0))
