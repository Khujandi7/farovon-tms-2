# Phase 3A.2 — аудит интеграции модулей FAROVON TMS 2.0

Основа: `main` = `63521c9` (Phase 3A.1 merged). Ветка: `phase-3a-2-learning-lifecycle`.
Метод: перед кодом проверены схема (локальная БД со всеми миграциями M1–M20), миграции, UI, server actions, SQL/Vitest/Playwright-тесты.
Production не трогался; миграции не применялись.

Статусы: **OK** — уже работало связно (REUSE); **EXT** — расширено в 3A.2; **NEW** — создано в 3A.2; **GAP** — осталось ограничением (см. §4).

## 1. Сводная таблица

| Business Object | DB | Server | UI | Relations | Permissions | Audit | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| Requests | `training_requests` (+`priority`, `expected_result` в M21) | `create_request`, `update_request`, `link_request`; NEW `set_request_details`, `create_training_from_request` | `/trainings/requests`, карточка заявки + панель «Приоритет и обучение», кнопка «Создать обучение» | `trainings.request_id` (заявка ↔ обучения, в обе стороны) | read: все; write: ADMIN/MANAGER (RLS + `req_role`) | `trg_audit`, причина для статуса/бюджета | SQL L1–L6, e2e «заявка → обучение» | EXT |
| Trainings | `trainings` + `learning_event_types`, `learning_providers`, lifecycle-триггер | `create/update_training`, `archive_training`; NEW `training_summary` | Карточка — центральное рабочее место: 11 вкладок | центр всех связей ниже | read: все; write: ADMIN/MANAGER | `trg_audit`, `entity_audit` (включает заходы, участников, тренеров) | phase3/3a1 + L5, L17, e2e карточки | EXT |
| Training Sessions | `training_sessions` (+`start_time`, `end_time`, `room`, `trainer_id`, `status` в M21) | `upsert_session`, `delete_session`; NEW `set_session_details` | Вкладка «Сессии», диалог «Детали захода» | обучение; тренер захода ∈ тренеры обучения | write: ADMIN/MANAGER | `trg_audit`; отмена захода требует причину | L14, L16, L17 | EXT |
| Trainers | `trainers` (+`organization`), `training_trainers` (+`id`, `role` PRIMARY/CO, один основной — частичный unique) | NEW `upsert_trainer` (дубликат по `norm_name` запрещён уникальным индексом), `set_training_trainer`, `remove_training_trainer` | Вкладка «Тренеры», список обучений, `/trainers`, `/trainers/[id]`, отчёт «Эффективность тренеров», поиск | обучение, заходы, обратная связь (через обучение), отчёты | read: все; write: ADMIN/MANAGER | `audit_training_trainers` (теперь адресуемо по `id`), `audit_trainers`; снятие — с причиной | L7–L13, L52–L55, e2e тренеров | EXT (раньше таблицы были, но без UI/RPC) |
| Employees | `employees`, `employee_contacts`, `employee_aliases` | `create/update_employee`, `bulk_update_employees`, импорт `import_stage/commit` | Справочник, досье, `/employees/import` | участники, экзамены, сертификаты, документы | write: ADMIN/MANAGER/HR | `trg_audit` | phase3a1 E-тесты | OK (GAP: руководитель, статус занятости — §4) |
| Organizational Units | `org_units` (DEPARTMENT/UNIT), `org_unit_aliases` | `create/rename/move_org_unit`, `set_org_unit_active` | Справочник подразделений | сотрудники, заявки, снимки участников | write: ADMIN/MANAGER/HR | `trg_audit` | phase3a1 | OK (GAP: уровни Company/Team — §4) |
| Participants | `training_participants` (снимки `department/unit/position_snapshot` — триггер `trg_participant_prepare`) | `add_participants(_by_unit)`, `remove_participant`, `set_participant_result` | Вкладка «Участники» (поиск, фильтр, массовый выбор, вставка списка, импорт), воронка «Запланировано/Добавлено/Присутствовало/Завершили» | сотрудник (FK), обучение, посещаемость, приглашения | write: ADMIN/MANAGER/HR | `trg_audit` | L18, L20, L50–L51 | OK + EXT (воронка из `training_summary`) |
| Attendance | `session_attendance` (PRESENT/ABSENT/EXCUSED) | `set_attendance`; `man_hours`, `participants_count` | Матрица посещаемости | участник × заход | write: ADMIN/MANAGER/HR | `trg_audit`, причина обязательна | L19 (3×4 ч, P/A/P = 8 ч) | OK (REUSE правила Phase 2: без посещаемости — часы обучения/захода у отмеченных участников) |
| Expenses | `expense_operations`, `expense_categories`, `fx_rates` | `add/update/void_expense`, `actual_total`, `cost_per_participant`; NEW в `training_summary`: стоимость часа, остаток бюджета заявки | Вкладка «Расходы» + строка метрик из БД | обучение (FK), экзамен | write: ADMIN/MANAGER/FINANCE; сторно: ADMIN/FINANCE; HR — без сумм (`has_financial_access`) | `trg_audit`, причина | L22–L25 | OK + EXT |
| Feedback | `feedback_trainings` (`training_id`), `feedback_responses`, `feedback_answers` (сырые ответы), `feedback_respondents` (личность отдельно); NEW `feedback_invitations` | NEW `send_feedback_invitations`, `record_feedback_response`, `training_feedback_summary` (веса 40/40/20 с пропорциональным перераспределением, порог анонимности) | Вкладка «Обратная связь» (приглашено/ответило/доля/оценки/итог, ввод анкеты), страница `/feedback` | обучение → приглашение → участник → ответ → ответы; тренеры — через обучение | ответы: только ADMIN/MANAGER; приглашения: ADMIN/MANAGER/HR; FINANCE/VIEWER — ничего личного; оценки ниже порога скрыты | `audit_feedback_invitations`; раскрытие личности — `reveal_respondent` (Phase 1.5) | L26–L39, e2e обратной связи | NEW/EXT (раньше модуль был изолирован и пуст в UI) |
| Exams | `exams` (попытка = строка), `exam_costs` | `create/update_exam`, `set_exam_result` | `/exams`, досье, результат участника | сотрудник, обучение (`training_id`), сертификат | write: ADMIN/MANAGER/HR | `trg_audit` | phase3a1 + L41 (результат в `training_results`) | OK (REUSE, без дублирования) |
| Certificates | `certificates` (+`v_certificates` со статусом) | `create/update/revoke_certificate`; NEW `training_results` | Досье → Сертификаты; NEW Обучение → Сертификаты; Результаты | сотрудник + обучение/экзамен + документ | write: ADMIN/MANAGER/HR | `trg_audit` | L40–L42, L62–L63 | EXT (вкладка в обучении) |
| Funding | `funding_policies`, `learning_agreements`, `agreement_repayments` | Phase 3A.1 RPC | `/funding` | сотрудник, экзамен/обучение | ADMIN/MANAGER/FINANCE | `trg_audit` | phase3a1 | OK |
| Documents | `documents` + приватный Storage | `register/confirm/archive_document`, signed URL 60 с | Досье; NEW вкладка «Документы» обучения (REUSE `DocumentsPanel` со scope `trainingId`) | сотрудник/обучение/экзамен/заявка/сертификат | `can_doc` (финансовые типы — ADMIN/MANAGER/FINANCE) | `trg_audit` | phase3a1 | EXT (UI) |
| Employee Dossier | `employee_dossier`, `employee_learning_summary`, `employee_timeline` — вычисляются из связанных данных | — | 13 вкладок `/employees/[id]` | все записи ведут на источник | HR без денег | `entity_audit('employees')` | L43–L44 (обучение из жизненного цикла видно в досье) | OK (REUSE: досье — результат, а не отдельная база) |
| Data Quality | `dq_issues` (fingerprint, CRITICAL/ERROR/WARNING/INFO) | `dq_scan` (Phase 3A/3A.1) + NEW `dq_scan_lifecycle` (11 сквозных правил) | `/data-quality`, каталог действий | все модули | запуск: ADMIN/MANAGER; чтение: + HR, FINANCE | статусы с автором и причиной | L57–L66, catalog.test | EXT |
| Audit | `audit_log`, `trg_audit`, `entity_audit`, `revert_change` | — | Вкладка «История» | — | `audit_log` напрямую — только ADMIN; через `entity_audit` с фильтром ролей | — | phase1_5/3/3a1 + L12 | OK |
| Reports | NEW `lifecycle_kpis`, `department_participation` (по снимку), `trainer_performance` | — | `/reports` (раньше заглушка) | те же определения, что `kpi_year` | деньги — только при `has_financial_access`; оценки — порог анонимности | — | L45–L54, e2e отчётов | NEW |
| Dashboard | `kpi_year` (D4) + NEW плитки `lifecycle_kpis` | — | `/dashboard`: прежние KPI + «Жизненный цикл» с переходами к источникам | один источник с отчётами | как выше | — | L46–L47, e2e | EXT |
| Import | `import_jobs`, `import_job_rows`, `source_files/records` | `import_stage/analyze/commit`, сопоставление: табельный № → нормализованное ФИО → алиасы → ручная проверка | `/imports`, `/employees/import` | сотрудники, участники | `can_import` | `trg_audit` | phase3a1 | OK (GAP: Google Sheets/HR-источник — Phase 3B) |
| Notifications | `notifications`, `notification_reads`, `notify_scan` | NEW: `send_feedback_invitations` создаёт уведомление `TRAINING_REQUIRES_ACTION` со ссылкой на вкладку обратной связи | Колокольчик, «Требует внимания» | процесс обучения | по `roles` | — | L27 (косвенно) | EXT |

## 2. Ключевые разрывы, найденные аудитом, и что сделано

| Разрыв (до 3A.2) | Решение |
|---|---|
| Таблицы `trainers`/`training_trainers` были с Phase 1, но ни одного RPC, UI или отчёта — тренер фактически не существовал в процессе | RPC, роли PRIMARY/CO, вкладка, справочник, отчёт, поиск, тренер захода, DQ `TRAINING_NO_TRAINER` |
| Обратная связь — пустая страница «в разработке», ответы не связаны с участниками, нет приглашений, нет итоговой оценки | `feedback_invitations`, ввод анкеты только приглашённого участника, `training_feedback_summary` (40/40/20), вкладка, страница, уведомление |
| Заявка → обучение: только ручная привязка уже созданного обучения | `create_training_from_request` + кнопка «Создать обучение»; связь видна с обеих сторон |
| Отчёты — заглушка; дашборд без участия подразделений, тренеров, обратной связи | `lifecycle_kpis`, `department_participation`, `trainer_performance`; одни функции для отчётов и дашборда |
| Карточка обучения: 6 вкладок, нет тренеров, результатов, сертификатов, документов, обратной связи | 11 вкладок, воронка участников, метрики расходов из БД |
| Заходы без времени, аудитории, тренера, статуса | Аддитивные колонки + `set_session_details` |
| Поиск без тренеров и документов мероприятий | `global_search_ext` (без переопределения `global_search`) |
| Нет сквозных DQ-правил | 11 правил `dq_scan_lifecycle` |
| Дефект: оценка 4,4 отображалась бы как «4» (форматтер целых) | `formatDecimal` (найдено e2e) |

## 3. Проверка «одна система» (изменение источника → зависимые представления)

SQL-тест `phase3a2_tests.sql` проходит весь путь на одной записи и проверяет, что зависимые представления меняются сами:
посещаемость P/A/P → `training_summary.actual_man_hours` (L19); расход → факт, остаток бюджета заявки, стоимость часа (L22–L25);
результат и сертификат → `training_results` (L40–L42); участие → досье (`employee_timeline`, `employee_learning_summary`, L43–L44);
всё вместе → `lifecycle_kpis` = `kpi_year` (L45–L47); перевод сотрудника в другое подразделение **не** меняет прошлую аналитику (L51);
удаление участника → DQ `CERT_NOT_PARTICIPANT` (L63).

## 4. Ограничения (не сделано в 3A.2, осознанно)

- **Структура Company → Division → Unit → Team.** `org_level` = DEPARTMENT/UNIT. Добавление уровня требует `ALTER TYPE … ADD VALUE`, который не откатывается (ломает проверку отката до Phase 1). Перенесено в фазу HR-интеграции с отдельным решением по откату.
- **Руководитель и статус занятости в импорте сотрудников.** В `employees` нет `manager_id`/`employment_status` (есть `is_active`, `hire_date`, `termination_date`). Требует расширения `import_analyze_row` — Phase 3B вместе с Google Sheets/HR-источником.
- **Участники «из заявки».** Заявка хранит только число участников (`participants_planned`), не список сотрудников; добавлять нечего. Решение — список сотрудников в заявке (Phase 3B).
- **Анкету заполняет менеджер** (бумага/форма, перенесённая вручную). Публичная анкета по ссылке для участника — следующий шаг; модель (`feedback_invitations`) к нему готова.
- Несколько вопросов на блок поддерживаются в БД (`question_no`), но форма UI вводит одну оценку на блок.
- Вкладка «Сертификаты» обучения — просмотр; выдача — из досье сотрудника с привязкой к обучению (одна точка создания, без дублирования формы).
- DQ-правила «участник без сотрудника», «расход без обучения», «сертификат без сотрудника», «посещаемость не-участника» не нужны как проверки: их исключают внешние ключи (`not null references`).
