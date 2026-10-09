#!/bin/sh
# Starts the local harness, runs the browser suite, stops the harness.
cd "$(dirname "$0")/../.."
PORT=4321 node tests/e2e/server.mjs >/tmp/e2e.log 2>&1 &
SRV=$!; sleep 1.5
python3 tests/e2e/run.py; CODE=$?
kill $SRV 2>/dev/null; exit $CODE
