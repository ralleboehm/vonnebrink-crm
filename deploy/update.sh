#!/bin/bash
# CRM auf der VPS aktualisieren:  sudo crm-update
#
# Holt den neuesten Stand von GitHub (main), installiert Pakete, lässt die
# Tests laufen und startet den Dienst nur neu, wenn alles grün ist.
# Mit --smoke zusätzlich der Smoke-Test (eigene Datenbank *_test).

set -euo pipefail

APP_DIR=/opt/vonnebrink-crm
SERVICE=vonnebrink-crm

cd "$APP_DIR"

echo "▶ git pull"
sudo -u crm git pull --ff-only

cd backend

echo "▶ npm ci"
sudo -u crm npm ci --no-audit --no-fund

echo "▶ npm test"
sudo -u crm npm test

if [ "${1:-}" = "--smoke" ]; then
    echo "▶ npm run test:smoke"
    sudo -u crm npm run test:smoke
fi

echo "▶ Neustart"
systemctl restart "$SERVICE"
sleep 3
systemctl --no-pager --lines=0 status "$SERVICE" | head -5

if curl -fsS http://127.0.0.1:3000/health >/dev/null; then
    echo "✅ CRM läuft ($(git -C "$APP_DIR" log -1 --format='%h %s'))"
else
    echo "❌ CRM antwortet nicht – Log: journalctl -u $SERVICE -n 50"
    exit 1
fi
