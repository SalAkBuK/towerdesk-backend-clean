$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies..."
npm ci

Write-Host "Building project..."
npm run build

Write-Host "Restarting PM2 process..."
pm2 restart towerdesk-api
