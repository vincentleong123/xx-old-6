module.exports = {
  apps: [{
    name: 'lucahthaix',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '1G',
    kill_timeout: 5000,
    autorestart: true,
    watch: false
  }]
};
