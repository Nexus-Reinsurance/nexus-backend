#!/usr/bin/env bash
# Starts, stops or checks the local Nexus PostgreSQL instance (a user-owned cluster, separate from
# any system PostgreSQL). Data lives in ../.nexus-db/data unless NEXUS_PGDATA is set.
# Usage: npm run db:start | db:stop | db:status
set -euo pipefail
cd "$(dirname "$0")/.."
DATA="${NEXUS_PGDATA:-../.nexus-db/data}"
LOG="$(dirname "$DATA")/postgres.log"

PG_CTL="$(command -v pg_ctl || true)"
[ -z "$PG_CTL" ] && command -v pg_config >/dev/null && PG_CTL="$(pg_config --bindir)/pg_ctl"
[ -x "${PG_CTL:-}" ] || PG_CTL="$(ls /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | sort -V | tail -1)"
[ -x "${PG_CTL:-}" ] || { echo "pg_ctl not found; install PostgreSQL server binaries" >&2; exit 1; }
[ -d "$DATA" ] || { echo "No database cluster at $DATA (set NEXUS_PGDATA)" >&2; exit 1; }

case "${1:-status}" in
  start)
    if "$PG_CTL" -D "$DATA" status >/dev/null 2>&1; then echo "Nexus database already running"; exit 0; fi
    "$PG_CTL" -D "$DATA" -l "$LOG" -w start >/dev/null && echo "Nexus database started (log: $LOG)" ;;
  stop) "$PG_CTL" -D "$DATA" -m fast -w stop >/dev/null && echo "Nexus database stopped" ;;
  status) "$PG_CTL" -D "$DATA" status >/dev/null 2>&1 && echo "Nexus database running" || { echo "Nexus database not running"; exit 3; } ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 2 ;;
esac
