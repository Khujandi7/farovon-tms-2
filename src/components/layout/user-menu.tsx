"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || "?").toUpperCase();
}

export function UserMenu({ fullName, email, roleLabel }: { fullName: string; email: string | null; roleLabel: string | null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="Профиль пользователя" data-testid="user-menu">
          <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{initials(fullName)}</span>
          <span className="hidden max-w-[10rem] flex-col items-start leading-tight md:flex">
            <span className="truncate text-sm font-medium">{fullName}</span>
            {roleLabel && <span className="truncate text-[11px] text-muted-foreground">{roleLabel}</span>}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{fullName}</span>
          {email && <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>}
          {roleLabel && <span className="mt-1 text-xs font-normal text-brand">{roleLabel}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <UserRound /> Профиль
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Настройки
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full" data-testid="sign-out">
              <LogOut /> Выйти
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
