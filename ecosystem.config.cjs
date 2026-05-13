module.exports = {
  apps: [
    {
      name: 'towerdesk-backend',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        APP_RUNTIME: 'api',
      },
    },
    {
      name: 'towerdesk-backend-worker',
      script: 'dist/worker.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        APP_RUNTIME: 'worker',
      },
    },
  ],
};
