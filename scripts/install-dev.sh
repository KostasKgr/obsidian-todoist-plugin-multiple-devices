#!/usr/bin/env bash
# Install the freshly built plugin into the local Obsidian vault as a
# separate "dev" plugin (id: todoist-sync-plugin-dev) so it can run
# side-by-side with the released todoist-sync-plugin.
#
# Usage:
#   scripts/install-dev.sh          # uses default vault path
#   VAULT=/path/to/vault scripts/install-dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="${VAULT:-/projects/obsidian/main}"
PLUGIN_DIR="$VAULT/.obsidian/plugins/todoist-sync-plugin-dev"
DIST="$ROOT/plugin/dist"

# Build first if dist is missing
if [[ ! -f "$DIST/main.js" ]]; then
  echo "→ plugin/dist not found, building..."
  (cd "$ROOT/plugin" && pnpm run build)
fi

for f in main.js styles.css manifest.json; do
  if [[ ! -f "$DIST/$f" ]]; then
    echo "✗ missing $DIST/$f — run a build first" >&2
    exit 1
  fi
done

mkdir -p "$PLUGIN_DIR"
cp -f "$DIST/main.js" "$DIST/styles.css" "$DIST/manifest.json" "$PLUGIN_DIR/"

# data.json is intentionally not touched: the dev plugin keeps its own copy.
echo "✓ installed into $PLUGIN_DIR"
ls -la "$PLUGIN_DIR"
