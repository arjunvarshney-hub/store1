#!/bin/sh
# Starts the local harness with demo products, runs the v4 browser suite (Android-size screen), stops the harness.
# Needs: python3 + playwright (pip install playwright && playwright install chromium)
cd "$(dirname "$0")/../.."
SEED=1 PORT=4333 node tests/e2e/server.mjs >/tmp/e2e.log 2>&1 &
SRV=$!; sleep 1.5
python3 tests/e2e/v4.py; CODE=$?
kill $SRV 2>/dev/null; exit $CODE
