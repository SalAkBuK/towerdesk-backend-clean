#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

echo "Pulling latest code..."
git pull

echo "Installing dependencies..."
npm install

echo "Building project..."
npm run build

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Generating Prisma client..."
npx prisma generate

echo "Starting or restarting PM2 apps..."
pm2 startOrRestart ecosystem.config.cjs --update-env

echo "Saving PM2 process list..."
pm2 save

echo "Current PM2 status:"
pm2 list

echo "Recent API logs:"
pm2 logs towerdesk-backend --lines 30 --nostream

echo "Recent worker logs:"
pm2 logs towerdesk-backend-worker --lines 30 --nostream
