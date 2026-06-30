#!/bin/sh
set -eu

DATA_DIR="/app/server/data"
DB_PATH="${FREEAPI_DB_PATH:-$DATA_DIR/freellmapi.db}"

case "$DB_PATH" in
  "$DATA_DIR"/*) ;;
  *)
    echo "ERROR: FREEAPI_DB_PATH must be inside $DATA_DIR so Railway volume persistence is used."
    exit 1
    ;;
esac

mkdir -p "$DATA_DIR"
touch "$DB_PATH"
chown -R node:node "$DATA_DIR"
chmod 700 "$DATA_DIR"
chmod 600 "$DB_PATH"

export FREEAPI_DB_PATH="$DB_PATH"
export PORT="${PORT:-3001}"
export HOST_BIND="${HOST_BIND:-0.0.0.0}"

cd /app
exec gosu node "$@"
