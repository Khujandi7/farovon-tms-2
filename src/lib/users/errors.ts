type ErrorLike = { code?: string | null; status?: number | null; message?: string | null } | null | undefined;

export const FORGOT_PASSWORD_NOTICE = "Если такой email зарегистрирован, мы отправили на него ссылку для сброса пароля. Проверьте почту.";

export const ERR = {
  forbidden: "Недостаточно прав: управлять пользователями может только администратор.",
  self: "Нельзя изменить собственную роль или статус.",
  lastAdmin: "Нельзя убрать, понизить или деактивировать последнего активного администратора.",
  exists: "Пользователь с таким email уже зарегистрирован.",
  notFound: "Пользователь не найден.",
  inactive: "Пользователь деактивирован: сначала восстановите доступ.",
  alreadyConfirmed: "Пользователь уже принял приглашение. Для входа отправьте ссылку для сброса пароля.",
  rateLimit: "Слишком много писем за короткое время. Подождите несколько минут и повторите.",
  generic: "Не удалось выполнить действие. Попробуйте ещё раз.",
  unavailable: "Сервис авторизации недоступен. Попробуйте позже.",
  notConfigured: "Приложение не настроено для управления пользователями: не задан SUPABASE_SERVICE_ROLE_KEY.",
} as const;

/** Превращает ошибки Supabase Auth / PostgREST / триггеров БД в понятные сообщения. Технические детали наружу не отдаём. */
export function userErrorMessage(error: ErrorLike): string {
  if (!error) return ERR.generic;
  const code = error.code ?? "";
  const message = error.message ?? "";
  // триггеры БД: profiles_guard (P0003), profiles_self_protect (P0011)
  if (code === "P0003" || /последнего активного ADMIN/i.test(message)) return ERR.lastAdmin;
  if (code === "P0011" || /собственн/i.test(message)) return ERR.self;
  if (code === "42501" || /row-level security|permission denied/i.test(message)) return ERR.forbidden;
  if (code === "23505") return ERR.exists;
  switch (code) {
    case "email_exists":
    case "user_already_exists":
    case "identity_already_exists":
      return ERR.exists;
    case "user_not_found":
      return ERR.notFound;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return ERR.rateLimit;
    case "email_address_invalid":
    case "validation_failed":
      return "Адрес email отклонён сервисом авторизации. Проверьте написание.";
    case "signup_disabled":
      return "Приглашения отключены в настройках Supabase Auth.";
    case "weak_password":
      return "Пароль слишком простой или найден в базе утечек. Выберите другой.";
    case "same_password":
      return "Новый пароль должен отличаться от текущего.";
    case "reauthentication_needed":
    case "session_not_found":
    case "bad_jwt":
      return "Сессия устарела. Войдите снова.";
    case "otp_expired":
    case "flow_state_expired":
      return "Ссылка устарела или уже использована. Запросите новую.";
  }
  if (error.status === 429) return ERR.rateLimit;
  if (error.status === 422 && /already.*registered|already been registered/i.test(message)) return ERR.exists;
  if (!error.status || error.status >= 500) return ERR.unavailable;
  return ERR.generic;
}
