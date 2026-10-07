# Phase 3A.2 — решения (REUSE / EXTEND / NEW)

Принцип: ни одной параллельной системы. Одна миграция M21 (`20261008100000_phase3a2_01_lifecycle.sql`), только аддитивные изменения:
новые колонки, одна новая таблица, новые функции. **Ни одна существующая функция, представление или политика не переопределена**
(в том числе `global_search`, `dq_scan`, `kpi_year`, `upsert_session`, `update_request`). Откат — `supabase/rollback/rollback_21_lifecycle.sql`,
`verify_rollback.sh` подтверждает отпечаток Phase 1.

## Карта

| Требование | Решение | Обоснование |
|---|---|---|
| Training как центр | **EXTEND** карточку: 11 вкладок; **NEW** `training_summary()` | Все данные уже связаны через `training_id`; не хватало представления |
| Тренеры | **EXTEND** `trainers` (+`organization`), `training_trainers` (+`id`, `role`, `created_at`, частичный unique «один основной»); **NEW** RPC `upsert_trainer`, `set_training_trainer`, `remove_training_trainer` | Таблицы существовали с Phase 1 — новые не создавались. Дубликаты запрещены уникальным индексом по `norm_name(full_name)` (та же нормализация, что у сотрудников) |
| Тренер захода | **EXTEND** `training_sessions.trainer_id`; RPC проверяет, что тренер назначен на обучение | Без отдельной таблицы расписания |
| Время/аудитория/статус захода | **EXTEND** `training_sessions` + **NEW** `set_session_details` | `upsert_session` не переопределялся: часы/даты и правило «часы обучения = сумма заходов» остались в Phase 2/3A |
| Заявка → обучение | **NEW** `create_training_from_request` — обёртка над **REUSE** `create_training` | Валидация, коды, lifecycle, тип PLANNED и связь `request_id` — из существующей функции; обёртка только переносит поля заявки |
| Приоритет, ожидаемый результат | **EXTEND** `training_requests` + **NEW** `set_request_details` | `update_request` не переопределялся (откат проще, Phase 3A не меняется) |
| Обратная связь | **REUSE** `feedback_trainings` (уже имел `training_id`), `feedback_responses`, `feedback_answers`, `feedback_respondents`; **NEW** `feedback_invitations`, `send_feedback_invitations`, `record_feedback_response`, `training_feedback_summary` | Сырые ответы и личность раздельно (Phase 1.5) сохранены; приглашение связывает участника; итоги считает БД |
| Веса 40/40/20 | **NEW** настройки `feedback_weight_materials/trainer/org` в `app_settings` (40/40/20); блок без ответов исключается, веса оставшихся нормируются | В коде проекта весов не нашлось (аудит: ни миграций, ни TS). Правило из ТЗ реализовано один раз в БД и настраивается без кода. Блок `APPLICATION` в итог не входит |
| Анонимность | **REUSE** порог `feedback_min_group` (Phase 1.5) для `training_feedback_summary` и `trainer_performance` | HR/FINANCE/VIEWER видят счётчики, оценки — только при ответов ≥ порога; ADMIN/MANAGER — всегда |
| Кого приглашать | Только участников с отметкой «присутствовал» и только после начала обучения (IN_PROGRESS/COMPLETED); повтор не дублирует | ТЗ §11 |
| Уведомления | **REUSE** `notifications` с существующим типом `TRAINING_REQUIRES_ACTION` | Расширение CHECK-ограничения типов было бы изменением Phase 3A.1 |
| Результаты | **REUSE** `training_participants.result` + **NEW** `training_results()` (статус ENROLLED/PARTIAL/ABSENT/COMPLETED/NOT_COMPLETED/FAILED/CERTIFIED из участия, посещаемости, сертификатов, экзаменов) | Экзамены не дублируются: последняя попытка по `exams.training_id` |
| Сертификаты в обучении | **REUSE** `certificates.training_id` + `v_certificates` | Вкладка обучения — чтение; выдача — одна точка (досье) |
| Документы обучения | **REUSE** `DocumentsPanel` со scope `trainingId` | Те же правила `can_doc`, Storage, signed URL |
| Расходы | **REUSE** `actual_total`, `cost_per_participant`, `man_hours`; в `training_summary` добавлены стоимость часа и остаток бюджета заявки | Остаток считается только если бюджет заявки в TJS — USD не пересчитывается (правило валют не меняется) |
| KPI отчётов и дашборда | **NEW** `lifecycle_kpis` с определениями `kpi_year` (проведено = COMPLETED групповые, человеко-часы = `man_hours`, уникальные = `attended`) | SQL-тест сверяет с `kpi_year` (L46–L47). Отчёты и дашборд вызывают одну функцию |
| Участие подразделений | **NEW** `department_participation` по `department_snapshot` | История не переписывается переводом (L51) |
| Эффективность тренеров | **NEW** `trainer_performance` | Оценка — блок TRAINER |
| Поиск | **NEW** `global_search_ext` (тренеры, документы), серверное действие объединяет с **REUSE** `global_search` | Не переопределять функцию Phase 3A.1 |
| DQ | **NEW** `dq_scan_lifecycle` пишет в **REUSE** `dq_issues` тем же fingerprint-механизмом; страница и действие вызывают обе проверки | `dq_scan` не переопределялся; `SECURITY DEFINER`, т.к. читает закрытую `feedback_respondents`; роль проверяется первой строкой |
| Справочник тренеров в UI | **NEW** `/trainers`, `/trainers/[id]` в разделе «Обучения» | Без нового раздела навигации и новых ролей |

## Отклонённые варианты

- Отдельная таблица «feedback_v2» / новая модель анкет — дублировала бы Phase 1/1.5.
- Колонки тренеров в `trainings` (`primary_trainer_id`) — нарушали бы связь многие-ко-многим, которая уже есть.
- Переопределение `v_training_list` для колонки тренера — изменение объекта Phase 3A; тренеры в списке читаются отдельным запросом по видимым строкам.
- Расчёт итоговой оценки или стоимости в TypeScript — запрещено (БД — источник истины). Клиент только форматирует.
