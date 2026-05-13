# Production Deploy Guide

This guide is for the current production setup:

- EC2 host
- PM2 process manager
- manual deploys over SSH
- local Redis on the same box
- PostgreSQL managed separately
- two backend processes:
  - `towerdesk-backend` for the API
  - `towerdesk-backend-worker` for async delivery jobs

## Important

This backend is no longer a single-process app.

Do not deploy by restarting only the API process.

If the API is up but the worker is down, users may still see:

- password reset emails failing silently
- invite emails failing silently
- broadcasts created but not fanned out
- push notifications not delivered

## Required Environment

Production `.env` must include:

```env
QUEUE_ENABLED=true
QUEUE_HOST=127.0.0.1
QUEUE_PORT=6379
QUEUE_PASSWORD=
```

If Redis has no password configured, leave `QUEUE_PASSWORD` empty.

Do not set the shared production `.env` to:

```env
APP_RUNTIME=worker
```

That would break the API process.

## Pre-Deploy Checks

Run these before every deploy:

```bash
cd /home/ubuntu/towerdesk-backend
redis-cli ping
pm2 list
```

Expected:

- Redis returns `PONG`
- PM2 shows `towerdesk-backend`
- PM2 shows `towerdesk-backend-worker`

## Standard Deploy Flow

Run these commands in order:

```bash
cd /home/ubuntu/towerdesk-backend
git pull
npm install
npm run build
npx prisma migrate deploy
npx prisma generate
pm2 restart towerdesk-backend --update-env
pm2 restart towerdesk-backend-worker --update-env
pm2 save
pm2 list
```

If you want one command instead of manually typing each step, use:

```bash
cd /home/ubuntu/towerdesk-backend
bash deploy.sh
```

This script uses the PM2 ecosystem file in the repo and manages both the API and worker together.

## First-Time Worker Setup

If the worker process does not exist yet, create it once with:

```bash
cd /home/ubuntu/towerdesk-backend
env APP_RUNTIME=worker pm2 start dist/worker.js --name towerdesk-backend-worker --update-env
pm2 save
pm2 list
```

After that, use `pm2 restart towerdesk-backend-worker --update-env` in normal deploys.

The preferred long-term path is to let PM2 manage both apps from the ecosystem file:

```bash
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
```

## Post-Deploy Log Checks

Check API logs:

```bash
pm2 logs towerdesk-backend --lines 80 --nostream
```

Healthy signs:

- `Queue runtime guard passed (runtime=api, queueEnabled=true)`
- `Nest application successfully started`

Check worker logs:

```bash
pm2 logs towerdesk-backend-worker --lines 80 --nostream
```

Healthy signs:

- `Queue runtime guard passed (runtime=worker, queueEnabled=true)`
- `Delivery worker context started`

## Functional Smoke Test

After every deploy, verify at least:

1. web app loads and login works
2. password reset request works
3. invite flow works
4. broadcast creation works
5. one push-producing action works if mobile push is live

## Troubleshooting

### API restarts repeatedly

Check:

```bash
pm2 logs towerdesk-backend --lines 100 --nostream
```

Common causes:

- Nest dependency injection error
- missing or wrong env vars
- queue runtime guard failure
- broken build output

### Worker restarts repeatedly

Check:

```bash
pm2 logs towerdesk-backend-worker --lines 100 --nostream
```

Common causes:

- wrong `APP_RUNTIME`
- Redis connection failure
- provider wiring bug
- missing `dist/worker.js`

### Redis issues

Check:

```bash
redis-cli ping
redis-cli CONFIG GET requirepass
```

If Redis has no password:

```env
QUEUE_PASSWORD=
```

### Migrations fail

Stop and inspect the error. Do not keep restarting PM2.

Run:

```bash
npx prisma migrate deploy
```

### Worker missing after reboot

Run:

```bash
pm2 resurrect
pm2 list
```

If the worker is gone and was never saved properly, recreate it with the first-time worker setup command.

## Red Flags

Stop and investigate if you see any of these:

- `Nest can't resolve dependencies`
- `Worker bootstrap requires APP_RUNTIME=worker`
- `Production runtime requires QUEUE_ENABLED=true`
- repeated PM2 restart loops
- Redis connection refused
- build failure

## Fast Recovery

If the deploy breaks:

1. inspect API and worker logs
2. if only the worker is broken, keep API up while fixing worker
3. if the API is broken by bad code, roll back to the previous known-good commit and rebuild

Example rollback flow:

```bash
cd /home/ubuntu/towerdesk-backend
git log --oneline -5
git checkout <previous-good-commit>
npm install
npm run build
pm2 restart towerdesk-backend --update-env
pm2 restart towerdesk-backend-worker --update-env
```

Only do this if you know the target commit is safe.

## Golden Rules

- never restart only the API for this backend
- never skip `npm run build`
- never skip migration checks
- never assume `pm2 list` means the system is healthy
- always check both API and worker logs
- always run at least a minimal functional smoke test
