"use client";

import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

type TableName = keyof Database["public"]["Tables"];
type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];

/**
 * Подписка на изменения таблицы (Supabase Realtime, postgres_changes). Подготовлено для Phase 2.x.
 * Realtime соблюдает RLS. Чтобы события приходили, таблицу нужно добавить в публикацию supabase_realtime
 * (отдельная миграция; в Phase 2.1 схема не меняется). Используйте событие как сигнал «обновить данные»
 * (router.refresh()), а не как источник цифр: все суммы и KPI пересчитывает база.
 */
export function useRealtimeTable<T extends TableName>(
  table: T,
  onChange: (payload: RealtimePostgresChangesPayload<Row<T>>) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`tms:${table}`)
      .on<Row<T>>("postgres_changes", { event: "*", schema: "public", table }, onChange)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, onChange, enabled]);
}
