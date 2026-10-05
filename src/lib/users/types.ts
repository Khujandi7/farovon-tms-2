import type { AppRole } from "@/lib/auth/roles";
import type { UserStatus } from "./policy";

/** Строка таблицы пользователей (profiles + данные Auth). Тип безопасен для клиентских компонентов. */
export type UserRow = {
  id: string;
  fullName: string;
  email: string | null;
  role: AppRole;
  isActive: boolean;
  status: UserStatus;
  invitedAt: string | null;
  confirmedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
};
