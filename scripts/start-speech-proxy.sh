#!/usr/bin/env bash
# Startet den Sprach-Proxy für Monsterfreunde. Gedacht für eine tmux-Session.
# Der OpenAI-Key wird vom Proxy selbst via claude-control-op aus 1Password
# geladen (Vault Clawdbot) und verlässt den Serverprozess nie.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Vorbedingungen prüfen, damit Fehler früh und klar sichtbar sind.
command -v node >/dev/null 2>&1 || { echo "node fehlt (>= 22 nötig)"; exit 1; }
command -v claude-control-op >/dev/null 2>&1 || { echo "claude-control-op fehlt"; exit 1; }

exec node "$DIR/scripts/speech-proxy.mjs"
