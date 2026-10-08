// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createTraining } from "./actions";

const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";
const R = "33333333-3333-4333-8333-333333333333";
const base = { title: "Охрана труда", start_date: "2026-06-01", hours: "8" };

describe("создание обучения с участниками (Phase 3B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ status: "ok", role: "ACADEMY_MANAGER", userId: "u1" });
    rpc.mockResolvedValue({ data: "t1", error: null });
  });

  it("с выбранными сотрудниками — одна транзакция в БД, повторы убраны", async () => {
    const r = await createTraining({ ...base, employee_ids: [E1, E2, E1] });
    expect(r).toMatchObject({ ok: true, message: "Тренинг создан, участников: 2." });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_training_with_participants", { p: expect.objectContaining({ title: "Охрана труда" }), p_employees: [E1, E2] });
    expect(rpc.mock.calls[0]![1].p).not.toHaveProperty("employee_ids");
  });

  it("без участников — прежний create_training", async () => {
    await createTraining({ ...base });
    expect(rpc).toHaveBeenCalledWith("create_training", { p: expect.objectContaining({ title: "Охрана труда" }) });
  });

  it("из заявки: связь передаётся, участники — выбранные", async () => {
    await createTraining({ ...base, request_id: R, participants_planned: "30", employee_ids: [E1] });
    expect(rpc).toHaveBeenCalledWith("create_training_with_participants", { p: expect.objectContaining({ request_id: R, participants_planned: 30 }), p_employees: [E1] });
  });

  it("мусор вместо id сотрудника и HR — отказ до базы", async () => {
    expect((await createTraining({ ...base, employee_ids: ["x"] })).ok).toBe(false);
    getSession.mockResolvedValue({ status: "ok", role: "HR", userId: "u1" });
    expect((await createTraining({ ...base, employee_ids: [E1] })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ошибка базы (неактивный сотрудник) показывается как есть", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0015", message: "Участниками могут быть только активные сотрудники справочника (не найдено или неактивно: 1)" } });
    expect(await createTraining({ ...base, employee_ids: [E1] })).toMatchObject({ ok: false, error: expect.stringContaining("активные сотрудники") });
  });
});
