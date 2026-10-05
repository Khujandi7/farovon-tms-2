import type { AppRole } from "@/lib/auth/roles";
import { ERR } from "./errors";

/** Чистые правила управления пользователями. БД (RLS, profiles_guard, profiles_self_protect) дублирует их на своём уровне. */
export type PolicyResult = { ok: true } | { ok: false; error: string };

export type ProfileLite = { id: string; role: AppRole; is_active: boolean };

const ok: PolicyResult = { ok: true };
const fail = (error: string): PolicyResult => ({ ok: false, error });

export function canManageUsers(role: AppRole | null | undefined): boolean {
  return role === "ADMIN";
}

function wouldRemoveLastAdmin(target: ProfileLite, others: readonly ProfileLite[], becomesAdminActive: boolean): boolean {
  if (!(target.role === "ADMIN" && target.is_active) || becomesAdminActive) return false;
  return !others.some((p) => p.id !== target.id && p.role === "ADMIN" && p.is_active);
}

export function checkChangeRole(args: { actorId: string; target: ProfileLite; newRole: AppRole; all: readonly ProfileLite[] }): PolicyResult {
  if (args.actorId === args.target.id) return fail(ERR.self);
  if (wouldRemoveLastAdmin(args.target, args.all, args.newRole === "ADMIN")) return fail(ERR.lastAdmin);
  return ok;
}

export function checkSetActive(args: { actorId: string; target: ProfileLite; active: boolean; all: readonly ProfileLite[] }): PolicyResult {
  if (args.actorId === args.target.id) return fail(ERR.self);
  if (!args.active && wouldRemoveLastAdmin(args.target, args.all, false)) return fail(ERR.lastAdmin);
  return ok;
}

export type UserStatus = "active" | "invited" | "inactive";

export function userStatus(args: { isActive: boolean; confirmedAt: string | null }): UserStatus {
  if (!args.isActive) return "inactive";
  return args.confirmedAt ? "active" : "invited";
}
