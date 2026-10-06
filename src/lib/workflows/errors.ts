type ErrorLike = { code?: string | null; message?: string | null; status?: number | null } | null | undefined;

export const WF_ERR = {
  forbidden: "Недостаточно прав для этого действия.",
  reason: "Укажите причину изменения.",
  generic: "Не удалось выполнить действие. Попробуйте ещё раз.",
  unavailable: "Сервис временно недоступен. Попробуйте позже.",
  notFound: "Запись не найдена или уже изменена.",
  duplicate: "Такая запись уже существует.",
  inUse: "Запись используется в других данных и не может быть изменена так.",
  invalid: "Некорректное значение. Проверьте поля.",
} as const;

/**
 * Превращает ошибки PostgREST / триггеров / RPC в понятные сообщения.
 * Коды P00xx — наши собственные исключения с русским текстом (миграции Phase 1.5–3): их текст безопасен для показа.
 * Технические подробности (SQL, имена ограничений) наружу не отдаём.
 */
export function workflowErrorMessage(error: ErrorLike): string {
  if (!error) return WF_ERR.generic;
  const code = error.code ?? "";
  const message = (error.message ?? "").trim();
  if (code === "P0012") return WF_ERR.reason;
  if (/^P00\d\d$/.test(code) && message) return message;
  if (code === "42501" || /row-level security|permission denied/i.test(message)) return WF_ERR.forbidden;
  if (code === "23505") return WF_ERR.duplicate;
  if (code === "23503") return WF_ERR.inUse;
  if (code === "23514") return message.startsWith("Заход") || message.startsWith("Участник") ? message : WF_ERR.invalid;
  if (code === "22P02" || code === "22007" || code === "22003" || code === "22008") return WF_ERR.invalid;
  if (error.status === 401 || code === "PGRST301") return "Сессия устарела. Войдите снова.";
  if (!error.status || error.status >= 500) return WF_ERR.unavailable;
  return WF_ERR.generic;
}
