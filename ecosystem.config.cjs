module.exports = {
  apps: [
    {
      name: 'erobb-backend',
      script: 'bun',
      args: 'run server/index.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
