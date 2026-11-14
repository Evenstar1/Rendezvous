#!/usr/bin/env bash
# Rebuild the bundled SPHEREx snapshot from IRSA, then rebuild the site.
#   ./scripts/ingest.sh            all mission targets
#   ./scripts/ingest.sh w0855      a single target
# Delete .cache/ingest/tap_*.csv first to pick up frames from a new data release.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache
npx esbuild scripts/ingest.ts --bundle --platform=node --format=esm --outfile=.cache/ingest.mjs --log-level=warning
node .cache/ingest.mjs "$@"
