/** Понятные сообщения для ошибок Supabase Auth. Не раскрываем, существует ли email. */
export function authErrorMessage(error: { code?: string | null; status?: number | null; message?: string } | null): string {
  if (!error) return "Не удалось войти. Попробуйте ещё раз.";
  switch (error.code) {
    case "invalid_credentials":
    case "user_not_found":
      return "Неверный email или пароль.";
    case "email_not_confirmed":
      return "Email не подтверждён. Обратитесь к администратору.";
    case "user_banned":
      return "Учётная запись заблокирована. Обратитесь к администратору.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Слишком много попыток. Подождите несколько минут.";
    case "signup_disabled":
      return "Регистрация закрыта. Учётные записи создаёт администратор.";
  }
  if (error.status === 400) return "Неверный email или пароль.";
  if (error.status === 429) return "Слишком много попыток. Подождите несколько минут.";
  if (!error.status || error.status >= 500) return "Сервис авторизации недоступен. Попробуйте позже.";
  return "Не удалось войти. Попробуйте ещё раз.";
}

export const NO_ROLE_MESSAGE =
  "Учётная запись не активирована или ей не назначена роль. Обратитесь к администратору FAROVON TMS.";
