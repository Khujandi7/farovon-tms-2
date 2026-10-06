# FAROVON TMS 2.0

Система управления обучением ГК «Фаровон». Единственный источник истины — база данных PostgreSQL (Supabase). Excel и Google-таблицы только импортируются.

## Состояние
- **Фаза 1** (архитектура и база данных) — выполнена.
- **Фаза 1.5** (закрытие архитектурных вопросов перед интерфейсом) — выполнена, M8 применена в Production.
- **Фаза 2.1** (фундамент веб-приложения: Next.js, авторизация, оболочка, Dashboard) — выполнена, в `main`.
- **Фаза 2.2** (пользователи и роли: приглашение, роли, деактивация, сброс пароля) — в ветке `phase-2-2`; M9 применяет владелец.
- Phase 3A (обучения, заявки, редактирование, Data Quality) — в ветке `phase-3-training-import`; Phase 3B — импорт Google Sheets. См. PROJECT_CONTEXT.md.

## Веб-приложение (Phase 2.1)
Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · shadcn/ui (Radix) · Supabase SSR · Zod · TanStack Table · Lucide · Vitest · Playwright.

```bash
npm ci
cp .env.example .env.local   # URL и publishable-ключ Supabase
npm run dev                  # http://localhost:3000
```
Полная инструкция: запуск, подключение Supabase, GitHub и Vercel — **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Принципы интерфейса: роль берётся из БД (`app_role()`), данные защищает RLS; интерфейс ничего не считает — суммы и KPI
приходят из PostgreSQL (`kpi_year()`), `NULL` показывается как «нет данных» или «Нет доступа», а не 0.

## Структура
```
src/app/            маршруты: (auth)/login, forgot-password, auth/confirm, auth/set-password, (app)/dashboard … settings/users
src/components/     ui (shadcn), layout (боковая панель, верхняя панель), dashboard, data-table, common
src/lib/            supabase (browser/server/proxy/realtime), auth (роли, сессия, схемы), форматирование
e2e/                Playwright и mock Supabase для тестов
supabase/
  migrations/   миграции; имя файла = версия в истории Supabase (без migration repair)
  tests/        phase1_tests.sql, phase1_5_tests.sql, phase1_5_local_only_tests.sql, fingerprint.sql, run_local.sh
  rollback/     обратные скрипты Phase 1.5 (не применяются автоматически) и verify_rollback.sh
src/types/database.ts   типы БД, сгенерированы из Supabase
docs/DECISIONS.md       принятые архитектурные решения
```

## Миграции
| Версия | Что делает |
|---|---|
| 20261004091732 … 092052 | Phase 1: таблицы и типы, расчёты и триггеры, RLS, усиление безопасности |
| 20261004115116 `phase1_5_01` | Auth: `profiles.is_active`, аудит ролей/курсов/настроек, защита последнего ADMIN, `bootstrap_first_admin()` |
| 20261004115129 `phase1_5_02` | Сторно расходов (`voided_at`, `void_reason`, `void_expense()`), запрет физического DELETE |
| 20261004115146 `phase1_5_03` | Архив тренингов (`archive_training()`), RESTRICT вместо CASCADE, исправление guard PLANNED/UNPLANNED |
| 20261004115151 `phase1_5_04` | Финансовая видимость: `NULL` + `FINANCIAL_DATA_RESTRICTED` вместо 0, `v_training_financials` |
| 20261004115210 `phase1_5_05` | Неизменяемость утверждённого бюджета: `create_budget_revision()` → `approve_budget_version()` |
| 20261004115216 `phase1_5_06` | Единые KPI: `kpi_year()` (A–E) |
| 20261004130810 `phase1_5_07` | Приватность обратной связи: `feedback_respondents`, `feedback_summary()`, `reveal_respondent()` |
| 20261005100008 `phase1_5_08` | Удаление устаревших столбцов личности из `feedback_responses` (применена в Production). |
| 20261005120000 `phase2_2_01` | **M9, не применена в Production.** Триггер `profiles_self_protect`: нельзя менять себе роль/статус и удалять свой профиль (service_role, SQL Editor и bootstrap не блокируются). |

## Главные правила
1. Деньги, курсы, KPI и агрегаты считает только база. `amount_tjs` и курс пишет триггер.
2. Нет курса — ошибка, а не курс 1. Нет утверждённого плана — `NO_APPROVED_VERSION`, а не 0.
3. План года — единственная APPROVED-версия бюджета. Она неизменяема; изменения только через ревизию.
4. Расходы не удаляются физически — только сторно. Тренинги с фактами не удаляются — только архив.
5. Роли без доступа к деньгам получают `NULL` и состояние `FINANCIAL_DATA_RESTRICTED`, никогда не 0.
6. Личность респондента — только через `reveal_respondent()` с причиной и записью в аудит.
7. ИИ не изменяет финансы, бюджет, не удаляет и не объединяет записи (см. `docs/DECISIONS.md`).

## Проверки (для разработчика)
```
npm run check                             # typecheck + lint + unit-тесты + сборка
npm run test:e2e:build && npm run test:e2e
bash supabase/tests/run_local.sh          # миграции + Phase 1 (44) + Phase 1.5 (118) + локальные (12) + Phase 2.2 (35) + Phase 3 (111) + отпечаток
SUPABASE_SERVICE_ROLE_KEY=x npm run build && npm run check:bundle   # ключа нет в клиентском бандле
bash supabase/rollback/verify_rollback.sh # вперёд -> откат -> отпечаток равен Phase 1
```
Нужен PostgreSQL 16+ на машине (скрипт находит его в /usr/lib/postgresql/*).
