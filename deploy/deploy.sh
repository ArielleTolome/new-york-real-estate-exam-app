#!/usr/bin/env bash
# Ship the static app to pigeonfi and (re)start the container. Usage: deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npm run -s build
ssh pigeonfi 'mkdir -p /data/nyrealestate/site'
rsync -az --delete index.html app.css app.js sw.js manifest.json questions.json favicon.ico icons pigeonfi:/data/nyrealestate/site/
# --inplace keeps the inode so the single-file bind mount sees the new nginx.conf.
rsync -az --inplace deploy/docker-compose.yml deploy/nginx.conf pigeonfi:/data/nyrealestate/
rsync -az deploy/traefik-nyrealestate.yaml pigeonfi:/data/coolify/proxy/dynamic/nyrealestate.yaml
ssh pigeonfi 'cd /data/nyrealestate && docker compose up -d && docker exec nyrealestate nginx -s reload'
# Purge Cloudflare for both hostnames (zone ids: pfsend.com, pigeonfi.com).
for zh in d5728e93ab57217d3a718097cf57dc94:nyrealestate.pfsend.com d292666f353225c01769b1fa9ee26be3:nyrealestate.pigeonfi.com; do
  curl -sf -X POST "https://api.cloudflare.com/client/v4/zones/${zh%%:*}/purge_cache" \
    -H "X-Auth-Email: $CLOUDFLARE_AUTH_EMAIL" -H "X-Auth-Key: $CLOUDFLARE_API_KEY" -H "Content-Type: application/json" \
    --data "{\"hosts\":[\"${zh#*:}\"]}" >/dev/null || echo "CDN purge failed for ${zh#*:}"
done
curl -sfI https://nyrealestate.pfsend.com | head -1
