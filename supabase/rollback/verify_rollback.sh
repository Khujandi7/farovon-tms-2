#!/usr/bin/env bash
# Локальная проверка: Phase 1 -> отпечаток; + Phase 1.5 -> откат 07..01 -> отпечаток должен совпасть.
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGPORT=54329 PGHOST=/tmp
bash "$DIR/tests/run_local.sh" >/dev/null 2>&1 || true   # поднимает базу и ставит заглушку Supabase
P="psql -U postgres -v ON_ERROR_STOP=1 -q -d tms_test"
fp() { psql -U postgres -d tms_test -At -F ' | ' -f "$DIR/tests/fingerprint.sql" | grep -v '^routine_grants\|^function'; }
psql -U postgres -d postgres -q -c "drop database if exists tms_rb" -c "create database tms_rb template template0"
stub=$(sed -n "/^create schema auth;/,/^SQL\$/p" "$DIR/tests/run_local.sh" | sed '$d')
PR="psql -U postgres -v ON_ERROR_STOP=1 -q -d tms_rb"
echo "$stub" | $PR
for f in "$DIR"/migrations/2026100409*.sql; do $PR -f "$f"; done
before=$(psql -U postgres -d tms_rb -At -F ' | ' -f "$DIR/tests/fingerprint.sql")
for f in "$DIR"/migrations/*.sql; do case "$(basename $f)" in 2026100409*) continue;; esac; $PR -f "$f"; done
for f in $(ls "$DIR"/rollback/rollback_[01]*.sql | sort -r); do echo "rollback: $(basename $f)"; $PR -f "$f"; done
after=$(psql -U postgres -d tms_rb -At -F ' | ' -f "$DIR/tests/fingerprint.sql")
if [ "$before" == "$after" ]; then echo "ОТКАТ OK: отпечаток после отката равен отпечатку Phase 1"; else
  echo "РАСХОЖДЕНИЕ:"; diff <(echo "$before") <(echo "$after"); exit 1; fi
