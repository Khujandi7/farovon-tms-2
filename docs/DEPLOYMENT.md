# FAROVON TMS 2.0 — запуск, Supabase, GitHub и Vercel

## 1. Локальный запуск

Требуется Node.js 22 (см. `.nvmrc`, минимум 20.9) и npm.

```bash
npm ci
cp .env.example .env.local      # заполнить значения из Supabase (раздел 2)
npm run dev                     # http://localhost:3000
```

Проверки:

| Команда | Что делает |
|---|---|
| `npm run typecheck` | TypeScript (strict) |
| `npm run lint` | ESLint (next/core-web-vitals + typescript) |
| `npm run test` | Vitest: логика авторизации, маршрутов, ролей, KPI, компоненты |
| `npm run test:e2e:build && npm run test:e2e` | Playwright: сборка под локальный mock Supabase (`e2e/mock-supabase.mjs`), десктоп и телефон |
| `npm run build` | Production-сборка |
| `npm run test:db` | SQL-тесты Phase 1 / 1.5 на локальном PostgreSQL 16+ |
| `npm run check` | typecheck + lint + test + build |

Если Playwright не может скачать браузер, укажите установленный Chromium: `PW_CHROMIUM_PATH=/путь/к/chrome npm run test:e2e`.

## 2. Подключение Supabase

1. Supabase → проект `ylfrblprjlzfcdutswax` → **Project Settings → API Keys** (или кнопка **Connect**).
2. В `.env.local` (локально) или в переменные Vercel (раздел 4):
   - `NEXT_PUBLIC_SUPABASE_URL` — `https://ylfrblprjlzfcdutswax.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — publishable-ключ (`sb_publishable_…`) или legacy anon key.
   - `NEXT_PUBLIC_SITE_URL` — адрес приложения.
3. **Никогда** не кладите `service_role` / `sb_secret_…` в переменные с префиксом `NEXT_PUBLIC_` — приложение откажется стартовать с секретным ключом в публичной переменной. `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API Keys → secret / service_role) нужен только серверу и только разделу Users (Phase 2.2); см. п. 8.
4. **Authentication → Sign In / Providers** (вручную, решение D11):
   - «Allow new users to sign up» — **выключить**;
   - «Allow anonymous sign-ins» — **выключить**;
   - Email provider — включён; минимальная длина пароля — 12;
   - **SMTP** — подключить свой (встроенный сильно ограничен), понадобится для приглашений в Phase 2.2.
5. **Authentication → URL Configuration**: Site URL = адрес на Vercel; в Redirect URLs добавить `http://localhost:3000/**` и `https://<домен>/**`.
6. **Первый ADMIN** (один раз): Authentication → Users → Add user (email + пароль, Auto Confirm), затем в SQL Editor:
   ```sql
   select bootstrap_first_admin('email@farovon.tj', 'Фамилия Имя');
   ```
7. **M8** применена в Production (05.10.2026). **M9** (`20261005120000_phase2_2_01_profiles_self_protection.sql`, Phase 2.2) применяется вручную после ревью: `supabase db push` или SQL Editor; затем `supabase migration list` — Local и Remote должны совпасть.
8. **Письма Phase 2.2** (Authentication → Email Templates), иначе ссылки из писем не сработают:
   - *Invite user*: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Принять приглашение</a>`
   - *Reset password*: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Задать новый пароль</a>`
   - Site URL = адрес приложения; в Redirect URLs добавить `https://<домен>/auth/confirm` (и `http://localhost:3000/auth/confirm`).
   - Пароль ≥ 12 символов; желательно включить Leaked Password Protection (если доступно на тарифе).
   - Прежние значения шаблонов и Site URL сохраните перед изменением (для отката).

Пользователей создаёт ADMIN в приложении: **Настройки → Пользователи → Пригласить**. Ручное создание в Authentication → Users больше не нужно (кроме первого ADMIN). Пользователь без профиля или с `is_active = false` войти не сможет.

### Realtime
Клиент подготовлен (`src/lib/supabase/realtime.ts`, хук `useRealtimeTable`). Чтобы события приходили, таблицу нужно
добавить в публикацию `supabase_realtime` отдельной миграцией (в Phase 2.1 схема не менялась). События используются только
как сигнал «обновить данные»: цифры всегда пересчитывает база.

## 3. GitHub

Рабочая ветка фазы (`phase-2-2` …) → Pull Request в `main`. CI (`.github/workflows/ci.yml`) запускает typecheck, lint,
Vitest, сборку, Playwright и SQL-тесты; секреты для CI не нужны.

## 4. Vercel

1. vercel.com → **Add New → Project** → импорт `Khujandi7/farovon-tms-2`. Framework определится как Next.js, настройки сборки по умолчанию.
2. **Settings → Environment Variables** (Production и Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
   `SUPABASE_SERVICE_ROLE_KEY` — серверная переменная для раздела Users (**без** `NEXT_PUBLIC_`). Проверка после сборки: `SUPABASE_SERVICE_ROLE_KEY=x npm run build && npm run check:bundle` — ключа в `.next/static` быть не должно.
3. Node.js version: 22.x. Регион функций — ближе к Supabase (проект в ap-southeast-1, Сингапур): `sin1`.
4. Deploy. После первого деплоя внести домен в Supabase → URL Configuration (раздел 2, п. 5).
5. Предпросмотры (Preview) создаются для каждого PR автоматически.

Не храните ключи в репозитории: `.env*` в `.gitignore`, кроме `.env.example`.

## 5. Phase 3A: миграции M10–M13 (в Production НЕ применены)
Файлы: `20261006100000_phase3_01_training_model.sql`, `…100100_phase3_02_roles_and_audit.sql`, `…100200_phase3_03_data_quality.sql`,
`…100300_phase3_04_workflows.sql`. Применять только после явного подтверждения владельца и после мержа PR:
1. Сделать резервную копию Production (Dashboard → Database → Backups).
2. Применить миграции по порядку (`supabase db push` или SQL Editor); затем `select count(*) from dq_issues;` и `select dq_scan();` под ADMIN.
3. Проверить: `/trainings`, карточка, `/data-quality`, `/employees`, `/settings/references`.
Откат: `supabase/rollback/rollback_13_…` → `rollback_10_…` в обратном порядке (проверено `verify_rollback.sh`: отпечаток равен Phase 1).
Права `ACADEMY_MANAGER`/`HR`/`FINANCE` выдаёт ADMIN в `/settings/users`.

## 6. Phase 3A.1: миграции M14–M20 (НЕ применены; применять только после мержа и подтверждения владельца)

Причина ошибки «Не удалось загрузить обучения / заявки» в Production: применены миграции только до Phase 2.2 — M10–M13 отсутствуют,
а код Phase 3A уже читает `v_training_list`, новые колонки и RPC `dq_scan`/`entity_audit`. Это не баг кода (подробно — `docs/PHASE_3A1_AUDIT.md`).

Порядок (каждый шаг — отдельной транзакцией, после резервной копии):
1. Backup: Dashboard → Database → Backups (или `pg_dump`).
2. M10–M13 (раздел 5), затем проверка `/trainings` и `/trainings/requests` под ADMIN — ошибка «Не удалось загрузить» должна исчезнуть.
3. M14 `20261007100000_phase3a1_01_learning_events.sql` (новые значения статусов добавляются `alter type … add value`; проверено,
   что каждый файл M14–M20 применяется одной транзакцией, как это делает `supabase db push`).
4. M15 `…100100_phase3a1_02_employees_org.sql`, M16 `…100200_phase3a1_03_dossier_core.sql` (создаёт приватный бакет Storage `tms-documents`
   (20 МБ, pdf/png/jpg/docx/xlsx/csv) и политики `storage.objects`; проверьте в Dashboard → Storage, что бакет приватный),
   M17 `…100300_phase3a1_04_funding.sql`, M18 `…100400_phase3a1_05_dossier_dq.sql`, M19 `…100500_phase3a1_06_public_requests.sql`,
   M20 `…100600_phase3a1_07_imports.sql`.
5. Под ADMIN: `select dq_scan();`, `select notify_scan();`; открыть `/employees/<id>`, `/exams`, `/certificates`, `/funding`, `/imports`,
   `/notifications`, `/settings/request-links`, `/settings/references`.
6. Переменные Vercel: `SUPABASE_SERVICE_ROLE_KEY` (уже нужен для Users; публичный портал вызывает через него ТОЛЬКО
   `public_request_options` и `submit_public_request`), `PUBLIC_REQUEST_HASH_SECRET` (≥ 16 символов, рекомендуется; иначе секрет выводится из
   service_role), `NEXT_PUBLIC_SITE_URL` (для полных ссылок заявок). `PUBLIC_REQUEST_CAPTCHA` не задавать (CAPTCHA пока не подключена).
7. ADMIN создаёт ссылки заявок в `/settings/request-links` и открывает приём (`Приём публичных заявок открыт`).
8. Типы Supabase: `supabase gen types typescript` должен совпасть с `src/types/database.ts`.

Откат: `supabase/rollback/rollback_20_…` → `rollback_14_…` в обратном порядке (проверено `verify_rollback.sh`). Данные новых таблиц
удаляются, статусы DRAFT/APPROVED/REGISTERED становятся PLANNED, файлы в Storage остаются (удалить бакет вручную при необходимости).
