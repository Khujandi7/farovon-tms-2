#!/usr/bin/env bash
# Поднимает локальный PostgreSQL, имитирует Supabase (схема auth), применяет миграции и тесты.
# Запуск: bash supabase/tests/run_local.sh        (после этого: PHASE15=1 для тестов Phase 1.5)
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}
DATA=${PGDATA_DIR:-/tmp/tms_pg}
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # каталог supabase/
export PGPORT=54329 PGHOST=/tmp

if ! $PGBIN/pg_isready -q 2>/dev/null; then
  rm -rf "$DATA"; mkdir -p "$DATA"; chown postgres "$DATA"
  su postgres -c "$PGBIN/initdb -D $DATA -A trust >/dev/null"
  su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PGPORT -k /tmp' -l /tmp/tms_pg.log -w start >/dev/null"
fi
P="psql -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists tms_test" -c "create database tms_test"
# Заглушка Supabase: схема auth, функция uid(), роли
$P -d tms_test <<'SQL'
create schema auth;
create table auth.users (id uuid primary key, email text);
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public, auth, storage to authenticated, anon, service_role;
grant select, insert on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
alter default privileges in schema public grant execute on routines to authenticated, anon, service_role;
SQL
for f in "$DIR"/migrations/*.sql; do echo "-> $(basename "$f")"; $P -d tms_test -f "$f"; done
run_test() { # $1 файл; тест заканчивается намеренной ошибкой RESULT (откат)
  psql -U postgres -d tms_test -1 -f "$1" 2>&1 | grep -A60 "RESULT" || { echo "НЕТ СТРОКИ RESULT в $1: тест упал раньше"; psql -U postgres -d tms_test -1 -f "$1" 2>&1 | tail -15; exit 1; }
}
echo "== ТЕСТЫ Phase 1 =="; run_test "$DIR/tests/phase1_tests.sql"
if [ -f "$DIR/tests/phase1_5_tests.sql" ]; then
  echo "== ТЕСТЫ Phase 1.5 =="; run_test "$DIR/tests/phase1_5_tests.sql"
  echo "== ТЕСТЫ Phase 1.5 (только локально: DELETE) =="; run_test "$DIR/tests/phase1_5_local_only_tests.sql"
fi
if [ -f "$DIR/tests/phase2_2_tests.sql" ]; then
  echo "== ТЕСТЫ Phase 2.2 (M9, только локально) =="; run_test "$DIR/tests/phase2_2_tests.sql"
fi
if [ -f "$DIR/tests/phase3_tests.sql" ]; then
  echo "== ТЕСТЫ Phase 3A (M10–M13, только локально) =="; run_test "$DIR/tests/phase3_tests.sql"
fi
if [ -f "$DIR/tests/phase3a1_tests.sql" ]; then
  echo "== ТЕСТЫ Phase 3A.1 (M14–M20, только локально) =="; run_test "$DIR/tests/phase3a1_tests.sql"
fi
if [ -f "$DIR/tests/phase3a2_tests.sql" ]; then
  echo "== ТЕСТЫ Phase 3A.2 (M21, только локально) =="; run_test "$DIR/tests/phase3a2_tests.sql"
fi
if [ -f "$DIR/tests/phase3b_tests.sql" ]; then
  echo "== ТЕСТЫ Phase 3B (M22, только локально) =="; run_test "$DIR/tests/phase3b_tests.sql"
fi
if [ -f "$DIR/tests/hotfix_import_tests.sql" ]; then
  echo "== ТЕСТЫ HOTFIX (M23, пакетная загрузка импорта, только локально) =="; run_test "$DIR/tests/hotfix_import_tests.sql"
fi
if [ -f "$DIR/tests/phase3c_tests.sql" ]; then
  echo "== ТЕСТЫ Phase 3C (M24, оргструктура и разрешение замечаний импорта, только локально) =="; run_test "$DIR/tests/phase3c_tests.sql"
fi
echo "== ОТПЕЧАТОК СТРУКТУРЫ =="
psql -U postgres -d tms_test -At -F ' | ' -f "$DIR/tests/fingerprint.sql"
