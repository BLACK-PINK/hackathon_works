module.exports = {
  apps: [
    {
      name: 'chapter-works',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        NODE_OPTIONS: '--max-old-space-size=400',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}
