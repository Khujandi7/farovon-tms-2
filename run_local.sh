#!/usr/bin/env bash
# Поднимает локальный PostgreSQL, имитирует Supabase (схема auth), применяет миграции и тесты.
set -euo pipefail
PGBIN=/usr/lib/postgresql/16/bin
DATA=${PGDATA_DIR:-/tmp/tms_pg}
DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PGPORT=54329 PGHOST=/tmp

if ! $PGBIN/pg_isready -q 2>/dev/null; then
  rm -rf "$DATA"; mkdir -p "$DATA"; chown postgres "$DATA"
  su postgres -c "$PGBIN/initdb -D $DATA -A trust >/dev/null"
  su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PGPORT -k /tmp' -l /tmp/tms_pg.log -w start >/dev/null"
fi
P="psql -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists tms_test" -c "create database tms_test"
# Заглушка Supabase: схема auth, функция uid(), роль authenticated
$P -d tms_test <<'SQL'
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated, anon, service_role;
alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
alter default privileges in schema public grant execute on routines to authenticated, anon, service_role;
SQL
for f in "$DIR"/migrations/*.sql; do echo "-> $(basename "$f")"; $P -d tms_test -f "$f"; done
echo "== ТЕСТЫ =="
# Тест заканчивается намеренной ошибкой RESULT (так всё откатывается)
psql -U postgres -d tms_test -1 -f "$DIR/tests/phase1_tests.sql" 2>&1 | grep -A40 "RESULT" || { echo "НЕТ СТРОКИ RESULT: тест упал раньше"; exit 1; }
echo "== ОТПЕЧАТОК СТРУКТУРЫ =="
psql -U postgres -d tms_test -At -F ' | ' -f "$DIR/tests/fingerprint.sql"
