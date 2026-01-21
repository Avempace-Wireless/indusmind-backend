#!/bin/sh
# Railway startup script - logs environment and starts app

echo "=== Environment Variables Check ==="
echo "NODE_ENV: ${NODE_ENV:-not set}"
echo "PORT: ${PORT:-not set}"
echo "THINGSBOARD_BASE_URL: ${THINGSBOARD_BASE_URL:-not set}"
echo "THINGSBOARD_USERNAME: ${THINGSBOARD_USERNAME:+set}"
echo "THINGSBOARD_PASSWORD: ${THINGSBOARD_PASSWORD:+set}"
echo "===================================="

# Start the application
exec node dist/index.js
