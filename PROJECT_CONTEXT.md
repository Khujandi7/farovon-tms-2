# PROJECT_CONTEXT.md — FAROVON TMS 2.0

## Supabase Environment Status
- Дата проверки: 04.10.2026
- Project ID: `ylfrblprjlzfcdutswax` («Khujandi7's Project», регион ap-southeast-1, PostgreSQL 17.6)
- Статус: ACTIVE_HEALTHY
- Auth-пользователей: 0. Настройки Auth: UNKNOWN (проверяются вручную в панели Supabase)
- GitHub: не подключён
- Ключи, пароли и токены в этот файл не записываются

## Phase 1 → Supabase (результат от 04.10.2026)
- Статус: ВЫПОЛНЕНО. Применены 4 миграции: `phase1_0001_types_and_core`, `phase1_0002_functions_and_triggers`, `phase1_0003_rls`, `phase1_0004_security_hardening` (закрытие замечаний Security Advisor: security_invoker у представления, фиксированный search_path у функций, закрыт доступ anon, ограничен вызов функций)
- Таблиц: 27, RLS включён на всех 27, политик RLS: 53, внешних ключей: 35, UNIQUE: 14, CHECK: 17, индексов: 47, триггеров: 10, функций: 20, представлений: 1, типов enum: 14
- Тесты Фазы 1: 44/44 пройдено (локально и в Supabase; в Supabase выполнялись в транзакции с откатом, данные не сохранялись)
- Структура Supabase и локальной проверенной базы совпадает по 18 категориям отпечатка. Единственная разница: PostgreSQL 17 в Supabase добавляет право MAINTAIN (28 записей), в локальной PG16 его нет. Это особенность версии, не отличие схемы
- Security Advisor: остались только 2 вида предупреждений WARN, принятые осознанно: (1) таблицы видны в GraphQL для вошедших пользователей: доступ к строкам ограничен RLS; (2) функция `app_role()` вызываема вошедшими: она нужна политикам RLS. Критичных замечаний нет
- Данные не загружались: сотрудники, тренинги, бюджет, обратная связь, курсы валют, профили = 0. `budget_fx_usd_tjs` пока пустой (нужно внести курс)
- Известная особенность: инструмент Supabase зависает на командах DELETE; в удалённых тестах DELETE не используется
- Закрытые вопросы (04.10.2026): тренинги 7 и 8 — один тренинг с двумя сессиями и одним расходом 121085 TJS (подтверждено владельцем, см. docs/DECISIONS.md D9)

## Phase 1.5 → Supabase (результат от 04.10.2026)
- Статус: ВЫПОЛНЕНО, кроме M8 (см. ниже). Решения: docs/DECISIONS.md
- Локальные файлы 0001–0004 переименованы по версиям Supabase (содержимое не менялось, migration repair не использовался)
- Применены 7 миграций: `20261004115116_phase1_5_01_auth_audit_guards`, `…115129_phase1_5_02_expense_void`, `…115146_phase1_5_03_training_archive`, `…115151_phase1_5_04_financial_visibility`, `…115210_phase1_5_05_budget_immutability`, `…115216_phase1_5_06_kpi_definitions`, `…130810_phase1_5_07_feedback_privacy`
- Код каждой применённой миграции совпадает с локальным файлом (хеш без комментариев и пробелов)
- Структура Supabase = локальная (без M8) по всем 18 категориям отпечатка: таблиц 28, RLS на 28, политик 53, FK 40, UNIQUE 15, CHECK 18, индексов 54, триггеров 25, функций 38, представлений 2, enum 15
- Тесты в Supabase (в транзакции с откатом): Phase 1 44/44, Phase 1.5 118/118. Локально ещё 12/12 тестов с DELETE. Откат 08→01 локально возвращает отпечаток Phase 1
- Данные после тестов: 0 строк во всех рабочих таблицах; 1 запись audit_log (вставка настройки feedback_min_group при M7)
- Security Advisor: ошибок нет. INFO: `feedback_respondents` RLS без политик (намеренно, доступ только через reveal_respondent). WARN: таблицы видны в GraphQL вошедшим (принято в Phase 1); SECURITY DEFINER функции доступны authenticated: `app_role`, `budget_version_locked`, `feedback_summary`, `reveal_respondent`, `void_expense` (намеренно, проверка роли внутри)
- Типы TypeScript сгенерированы после M7: `src/types/database.ts`

## Ограничения инструмента и отклонения
- Supabase MCP (`apply_migration`, `execute_sql`) зависает на `DROP …` (включая `DROP POLICY` и `ALTER TABLE … DROP COLUMN`; `DROP CONSTRAINT` внутри ALTER проходит). Проверено на временной таблице
- Поэтому в M7 политики чтения сырых отзывов сужены через `ALTER POLICY` до ADMIN/ACADEMY_MANAGER вместо `DROP POLICY` (результат доступа тот же)
- Удаление 5 устаревших пустых столбцов `feedback_responses` вынесено в M8 `20261005100008_phase1_5_08_feedback_drop_legacy_columns.sql`. **Не применена**. Применить вручную в SQL Editor (содержимое файла) или через `supabase db push`; затем переименовать файл по выданной версии и перегенерировать типы. Миграция сама остановится, если в таблице появятся данные

## Что осталось перед Фазой 2.1
- Применить M8 (вручную)
- Auth в панели Supabase (вручную): регистрация OFF, anonymous OFF, длина пароля ≥ 12, собственный SMTP
- Внести бюджетный курс `budget_fx_usd_tjs` и курсы `fx_rates` (FINANCE/ADMIN)
- Bootstrap первого ADMIN (D11)
- Фаза 2.1 выполнена (см. ниже)

## Phase 2.1 — Foundation (результат от 04.10.2026)
- Ветка: `phase-2-1` (от `main` c7909b8, после слияния Phase 1.5). `main` не менялся
- Стек: Next.js 16.3 (App Router, Turbopack) · React 19.3 · TypeScript 5.9 strict · Tailwind CSS 4.3 · shadcn/ui (Radix) · @supabase/ssr 0.12 · supabase-js 2.117 · Zod 4 · TanStack Table 8 · Lucide · next-themes · Vitest 3 · Playwright 1.63
- Supabase: browser/server клиенты через `@supabase/ssr`; `src/proxy.ts` (бывший middleware) продлевает сессию и закрывает маршруты; JWT проверяется `getClaims()`. Роль — только `app_role()` из БД (RLS-источник), `user_metadata` не используется. Секретный ключ в клиентском коде отсутствует; публичная переменная с `sb_secret_` отклоняется
- Авторизация: вход email + пароль (Server Action), выход, `?next=` с защитой от открытого редиректа, пользователь без роли/неактивный — сессия закрывается, экран «Учётная запись не активирована». Регистрации нет
- Интерфейс: боковая панель (desktop) + выезжающее меню (телефон/планшет), верхняя панель с профилем, светлая/тёмная/системная тема, акцент #E8342A; состояния загрузки, ошибок, пустые, «нет доступа»
- Разделы: Дашборд, Обучения, Сотрудники, Бюджет, Обратная связь, Отчёты, Качество данных, Настройки. Видимость по ролям повторяет RLS (HR без «Бюджета», VIEWER без «Качества данных»); прямой адрес закрытого раздела — экран «Нет доступа»
- Dashboard: KPI из `kpi_year(год)` (A–E без пересчёта в UI; HR видит «Нет доступа», а не 0; «План не утверждён», «Нет курса»), фильтр по годам, последние обучения из `trainings`; диаграммы — честное пустое состояние до появления помесячных данных в БД
- Обучения: таблица TanStack (поиск, сортировка, страницы) по `trainings` без архивных. Остальные разделы — каркас с пустыми состояниями
- Realtime: хук `useRealtimeTable` подготовлен; публикация таблиц не включалась (схема не менялась)
- Схема БД, миграции, формулы и правила доступа не менялись
- Проверки: typecheck OK, ESLint OK, Vitest 55/55, Playwright 52/52 (desktop + mobile + планшет, через mock Supabase), production build OK
- Документация: docs/DEPLOYMENT.md (локальный запуск, Supabase, GitHub, Vercel), `.env.example`, CI `.github/workflows/ci.yml`

### Действия владельца после Phase 2.1
- Создать проект в Vercel из репозитория и задать переменные `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`
- Supabase Auth: регистрация OFF, anonymous OFF, пароль ≥ 12, SMTP, Site URL / Redirect URLs (адрес Vercel и localhost)
- Применить M8 вручную; bootstrap первого ADMIN; внести курсы
- Следующий этап: Phase 2.2 (см. ниже)

## Phase 2.2 — Users & Roles (ветка `phase-2-2`, 05.10.2026)
- Исходное состояние: Phase 1, 1.5 (включая M8) и 2.1 в `main`; в Production 12 миграций, первый ADMIN создан
- Settings → Users (только ADMIN; для остальных ролей и по прямому URL — «Нет доступа», данные не загружаются): таблица ФИО · Email · Роль · Статус · Приглашён/подтверждён · Последний вход · Действия
- Действия ADMIN: приглашение (email, ФИО, роль), смена роли, деактивация/восстановление, повторное приглашение, ссылка сброса пароля. Над собой действий нет
- Пользователь: `/auth/confirm` (`verifyOtp`) → `/auth/set-password` (пароль ≥ 12), «Забыли пароль?» на странице входа, смена своего пароля в Настройках
- Приглашение: Auth Admin API → `profiles` сессией ADMIN (аудит с актором) → при сбое профиля пользователь Auth удаляется
- **M9** `20261005120000_phase2_2_01_profiles_self_protection.sql` — триггер `profiles_self_protect` (P0011): нельзя менять себе `role`/`is_active`, удалять свой профиль. Rollback: `supabase/rollback/rollback_09_profiles_self_protection.sql`. **В Production НЕ применена** (применяет владелец после ревью)
- Новые таблицы и колонки не добавлялись; RLS, `app_role()`, `profiles_guard`, аудит, KPI/бюджет/расходы/feedback не менялись
- Типы `src/types/database.ts` перегенерированы из Production после M8
- Проверки: typecheck, ESLint, Vitest, Playwright (desktop + mobile), SQL-тесты (Phase 1 / 1.5 / 2.2), откат M9, сборка, проверка клиентского бандла на ключ service_role
- Решение D12 в `docs/DECISIONS.md`

### Действия владельца после Phase 2.2
- Применить M9 (после ревью), затем `supabase migration list`
- Supabase Auth: шаблоны Invite/Reset password с `/auth/confirm?token_hash=…` (docs/DEPLOYMENT.md, п. 8), Redirect URLs, SMTP, пароль ≥ 12, регистрация и anonymous OFF
- Vercel: `SUPABASE_SERVICE_ROLE_KEY` (серверная переменная), `NEXT_PUBLIC_SITE_URL`
- Известное ограничение: почтовые сканеры могут «открыть» ссылку и израсходовать одноразовый токен — тогда ADMIN отправляет приглашение/сброс повторно

## Phase 3A — Trainings, Requests, Editing, Data Quality (ветка `phase-3-training-import`, 06.10.2026)
Готово в коде и локальной БД: M10 модель обучения (заходы, участники, посещаемость), M11 роли и аудит с `reason`, M12 Data Quality,
M13 RPC-процессы; страницы `/trainings`, `/trainings/[id]` (вкладки), `/trainings/new`, `/trainings/requests`, `/data-quality`,
`/employees`, `/settings/references`. Миграции M10–M13 в Production **не применены**. Решения — D13.
Осталось (Phase 3B): Google Sheets (service account, server-only), source_mappings/import_rows, dry-run/commit, сравнение Source/TMS
(оставить TMS / применить из Sheets / сравнить), lineage, тесты импорта.
