# Phase 3A.1 — аудит Phase 3A и карта REUSE / EXTEND / NEW

Основа: `main` = 5478c3c (Phase 3A merged). Ветка: `phase-3a-1-learning-dossier`.

## 0. Причина ошибки «Не удалось загрузить обучения / заявки» в Production

В Production применены миграции только до `phase2_2_01` (13 штук, проверено `list_migrations`, read-only).
M10–M13 (`20261006100000…100300`) **не применены**. Страницы Phase 3A читают `v_training_list`, колонки
`trainings.description/participants_planned/created_by/…`, `training_requests.archived_at/…` и вызывают RPC `dq_scan`, `entity_audit` —
в Production их нет, PostgREST отвечает 4xx/5xx, и страницы показывают «Не удалось загрузить».
Это не баг кода: нужно применить M10–M13 (и M14+ этой фазы) — см. `docs/DEPLOYMENT.md`, раздел «Production migration steps». Я ничего не применял.

## 1. Главные архитектурные решения

| Вопрос | Решение | Почему |
|---|---|---|
| Learning Event | **EXTEND `trainings`**: `event_type_id` → справочник `learning_event_types` | `trainings` уже имеет заходы, участников, посещаемость, расходы, заявки, аудит, откат, DQ. Отдельные таблицы seminars/forums/conferences дублировали бы всё это |
| Типы мероприятий | Справочник (`code`, `name`, `is_system`, `is_group`, `is_active`), управляется ADMIN в UI | Требование «без изменения кода» |
| Lifecycle | **EXTEND enum `training_status`** значениями DRAFT, APPROVED, REGISTERED; ARCHIVED остаётся `archived_at` (уже работает, с аудитом) | Не заводить второй статус; переходы валидирует триггер БД |
| Экзамены | **NEW** `exams` (одна строка = одна попытка) | Другая сущность: сотрудник + квалификация + результат; не групповое событие |
| Стоимость экзамена/индивидуального обучения | **EXTEND `expense_operations`** (`exam_id`), FX/сторно/аудит те же. `kpi_year` не меняет определений | «Не создавать вторую финансовую систему» |
| Индивидуальное обучение | Learning Event типа `INDIVIDUAL_EDUCATION` (`is_group=false`) с одним участником | Часы, посещаемость, расходы, документы — всё уже есть |
| Финансирование | **NEW** `funding_policies` (+`funding_policy_outcomes`), `learning_agreements`, `agreement_repayments` | Нет аналога; не payroll — только расчёт обязательства по подтверждённой политике |
| Документы | **NEW** `documents` (метаданные) + приватный Storage-бакет `tms-documents` | Бинарники не в PostgreSQL; доступ RLS + Storage policies + signed URL |
| Сертификаты | **NEW** `certificates` (+view со вычисляемым статусом) | |
| Навыки | **NEW** `skills` (справочник) + `employee_skills` (append-only история) | |
| План развития | **NEW** `development_goals` (группировка по сотруднику и году) | Одна таблица вместо plan+goals |
| Подразделения | **REUSE `org_units`** + новые RPC `move_org_unit`, `set_org_unit_active` | ID вместо названий уже есть |
| Импорт | **NEW** `import_jobs` / `import_job_rows` (общий конвейер); lineage — **REUSE `source_files/source_records`** | Основа для Phase 3B (Google Sheets) |
| Публичные заявки | **NEW** `request_links`, `public_request_attempts`; заявки — **REUSE `training_requests`** (+`submitted_via`, `request_link_id`, `contact`) | anon не получает доступ к таблицам: только серверное действие → RPC только для service_role |
| Уведомления | **NEW** `notifications` + `notification_reads`; генерация `notify_scan()` | |
| Провайдеры | **NEW** `learning_providers` (организатор/провайдер) | Нужен событиям, экзаменам, сертификатам |

## 2. Таблицы

| Существующая | Назначение | Изменение | Миграция |
|---|---|---|---|
| trainings | обучение | +event_type_id, provider_id, organizer, result_summary; статусы | M14 |
| training_participants | участники | +result, result_note | M14 |
| training_sessions / session_attendance | заходы / посещаемость | как есть (REUSE) | — |
| training_requests | заявки | +submitted_via, request_link_id, contact | M19 |
| employees / employee_contacts | сотрудники | +employee_code, hire_date, termination_date; email в contacts | M15 |
| org_units / org_unit_aliases | структура | REUSE + RPC | M15 |
| expense_operations | расходы | +exam_id, training_id nullable (check) | M17 |
| dq_issues | замечания | REUSE; новые правила в `dq_scan` | M20 |
| audit_log | аудит | REUSE; триггер на всех новых таблицах; `entity_audit` расширен | M14–M20 |
| source_files / source_records | lineage | REUSE при commit импорта | M19 |
| trainers | тренеры | REUSE | — |

## 3. RPC

| Существующая | Решение |
|---|---|
| create/update_training, link_request, upsert_session, add_participants(_by_unit), set_attendance, add_expense, void_expense, revert_change | REUSE; `update_training`/`create_training` понимают event_type_id/provider_id/status-переходы; `revert_change` расширен новыми таблицами |
| create_employee/update_employee | EXTEND (код, даты) |
| dq_scan / dq_resolve | EXTEND (+16 правил) |
| entity_audit | EXTEND (exams, certificates, agreements, documents…) |
| kpi_year | EXTEND без смены определений (только group-события и training_id is not null) |
| employee_dossier | REUSE как «история тренингов»; новые `employee_learning_summary`, `employee_timeline`, `employee_costs` |
| **NEW** | exams (create/update/result), certificates, skills, goals, funding (policy/agreement/evaluate/repay), documents (register/archive), org (move/active), import (stage/commit/cancel), match_names, mass ops, request links, `submit_public_request`, notify_scan, attention_summary, global_search |

## 4. RLS

Все новые таблицы — через `grant_table(read, write)`. Финансовые (policies, agreements, repayments, exam fee, finance documents) — только
ADMIN/ACADEMY_MANAGER/FINANCE (+ VIEWER read-агрегаты через функции). HR видит сертификаты, навыки, результаты, но не суммы. Подробно — в M-файлах и `docs/DECISIONS.md` (D14).

## 5. Routes / компоненты

| Route | Решение |
|---|---|
| /employees/[id] | EXTEND: вкладки Overview, Learning, Events, Exams, Certificates, Individual, Contracts, Documents, Skills, Plan, Costs, Timeline, Audit |
| /employees, /trainings, /trainings/[id], /data-quality, /settings/references, /dashboard | EXTEND |
| /exams, /exams/[id], /imports, /employees/import, /certificates, /notifications, /request, /request/[token], /settings/request-links, /export/* | NEW |
| EditableField, ReasonDialog, DqIssueCard, AuditTimeline, ParticipantsPanel, OrgUnitsManager, PageHeader | REUSE / EXTEND |
