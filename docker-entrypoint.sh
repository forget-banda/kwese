#!/bin/sh
set -eu
mkdir -p /data/backups
chown -R node:node /data
cd /app
exec su -s /bin/sh node -c 'exec node ./node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 4000'
