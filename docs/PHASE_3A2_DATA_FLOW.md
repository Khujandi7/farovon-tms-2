# Phase 3A.2 — поток данных сквозного жизненного цикла

```
REQUEST  training_requests (REQ-ГГГГ-NNN, приоритет, ожидаемый результат)
   │  create_training_from_request()  ── связь trainings.request_id (видна с обеих сторон)
   ▼
TRAINING  trainings (TR-ГГГГ-NNN, тип мероприятия, lifecycle DRAFT…COMPLETED)
   │
   ├── TRAINERS      training_trainers(role PRIMARY|CO) → trainers (один на человека, norm_name уникален)
   ├── SESSIONS      training_sessions (даты, часы, время, аудитория, trainer_id ∈ тренеры обучения, статус)
   └── PARTICIPANTS  training_participants → employees (снимок подразделения/должности на момент обучения)
          │
          ├── ATTENDANCE  session_attendance (участник × заход) ──► man_hours(), participants_count()
          ├── EXPENSES    expense_operations (TJS/USD + fx) ──► actual_total(), cost_per_participant()
          └── FEEDBACK    feedback_invitations (участник) → feedback_responses → feedback_answers
                          (личность: feedback_respondents отдельно) ──► training_feedback_summary() 40/40/20
          ▼
RESULTS / CERTIFICATES
   training_participants.result + exams(training_id) + certificates(training_id, employee_id) ──► training_results()
          ▼
EMPLOYEE DOSSIER  employee_learning_summary(), employee_timeline(), employee_dossier() — вычисляются, не вводятся
          ▼
REPORTS / DASHBOARD  lifecycle_kpis(), department_participation(), trainer_performance(), kpi_year()
                     (одни определения; плитки и строки ведут к исходным записям)

Поперечно:
  AUDIT          trg_audit на всех таблицах цикла → entity_audit('trainings') показывает обучение, заходы, участников, тренеров
  DATA QUALITY   dq_scan() + dq_scan_lifecycle() → dq_issues (CRITICAL/ERROR/WARNING/INFO, автозакрытие)
  SEARCH         global_search() + global_search_ext() (тренеры, документы)
  NOTIFICATIONS  send_feedback_invitations() → notifications (ссылка на вкладку «Обратная связь»)
  PERMISSIONS    RLS + req_role(); суммы — has_financial_access(); оценки — порог feedback_min_group
```

## Единые определения (одна формула — одно место)

| Показатель | Функция БД | Где используется |
|---|---|---|
| Участников (факт) | `participants_count(training)` — по посещаемости, иначе по отметке `attended` | карточка, список, `training_summary`, `lifecycle_kpis` |
| Человеко-часы | `man_hours(training)` — сумма часов заходов с PRESENT; без посещаемости — часы захода/обучения у отмеченных (правило Phase 2) | карточка, список, отчёты, `kpi_year` |
| Факт расходов | `actual_total(training)` (NULL без доступа к финансам) | карточка, отчёты |
| Стоимость участника / часа | `cost_per_participant`, `training_summary.cost_per_learning_hour` | вкладка «Расходы», отчёты |
| Проведено обучений | групповые типы, статус COMPLETED, год по `start_date` | `kpi_year`, `lifecycle_kpis` |
| Уникальные обученные | `count(distinct employee_id)` при `attended` в проведённых | `kpi_year`, `lifecycle_kpis` |
| Итоговая оценка | `training_feedback_summary` — веса 40/40/20, перераспределение при отсутствии блока | карточка, `/feedback` |
| Доля ответов | ответили / приглашено | карточка, `/feedback`, KPI |
| Участие подразделения | снимок `department_snapshot` | отчёт |

## Пример (проверяется SQL-тестом)

Заявка REQ-2026-001 (бюджет 5000 TJS, 4 участника, APPROVED) → «Создать обучение» (1–3 июня, 12 ч) → тренеры: основной + со-тренер →
3 захода × 4 ч → 4 участника (снимок «Финансовый департамент») → участник 1: PRESENT/ABSENT/PRESENT = 8 ч → расход 1200 TJS
(остаток 3800) → COMPLETED → 4 приглашения, 1 анкета (5,4 / 5 / 3) → итог (4,5·40 + 5·40 + 3·20)/100 = **4,40**, доля 25 % →
результат COMPLETED + сертификат IFRS-1 → в досье и хронологии сотрудника → `lifecycle_kpis(2026)`: 1 обучение, 4 сотрудника,
1 сертификат; перевод сотрудника из департамента не меняет отчёт по подразделениям.
