// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { assignTrainer, createTrainer, createTrainingFromRequest, recordFeedback, removeTrainer, saveSessionDetails, sendFeedbackInvitations } from "./lifecycle-actions";

const T = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const as = (role: string) => getSession.mockResolvedValue({ status: "ok", role, userId: "u1" });

describe("действия жизненного цикла (Phase 3A.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: null, error: null });
    as("ACADEMY_MANAGER");
  });

  it("HR и VIEWER не назначают тренеров и не создают обучение из заявки: RPC не вызывается", async () => {
    for (const role of ["HR", "FINANCE", "VIEWER"]) {
      as(role);
      expect((await assignTrainer({ trainingId: T, trainerId: R, role: "CO" })).ok).toBe(false);
      expect((await createTrainingFromRequest({ requestId: R, start_date: "2026-06-01", hours: 4 })).ok).toBe(false);
      expect((await sendFeedbackInvitations({ trainingId: T })).ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("назначение тренера: роль PRIMARY/CO проверяется до базы", async () => {
    expect((await assignTrainer({ trainingId: T, trainerId: R, role: "BOSS" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect((await assignTrainer({ trainingId: T, trainerId: R, role: "PRIMARY" })).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_training_trainer", expect.objectContaining({ p_training: T, p_trainer: R, p_role: "PRIMARY" }));
  });

  it("новый тренер: сначала справочник, затем назначение; без ФИО — отказ", async () => {
    expect((await createTrainer({ full_name: " ", kind: "EXTERNAL" })).ok).toBe(false);
    rpc.mockResolvedValueOnce({ data: R, error: null }).mockResolvedValueOnce({ data: null, error: null });
    const r = await createTrainer({ trainingId: T, full_name: "Ахмедов Рустам", kind: "EXTERNAL", organization: "ACCA", role: "PRIMARY" });
    expect(r).toMatchObject({ ok: true, data: { id: R } });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["upsert_trainer", "set_training_trainer"]);
  });

  it("дубликат тренера: сообщение базы показывается пользователю", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0015", message: "Тренер «Ахмедов Рустам» уже есть в справочнике" } });
    const r = await createTrainer({ full_name: "Ахмедов Рустам", kind: "EXTERNAL" });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("уже есть") });
  });

  it("снятие тренера требует причину", async () => {
    expect((await removeTrainer({ trainingId: T, trainerId: R, reason: "" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect((await removeTrainer({ trainingId: T, trainerId: R, reason: "замена тренера" })).ok).toBe(true);
  });

  it("детали захода: время ЧЧ:ММ и статус проверяются", async () => {
    expect((await saveSessionDetails({ trainingId: T, sessionId: R, start_time: "9am", status: "PLANNED" })).ok).toBe(false);
    expect((await saveSessionDetails({ trainingId: T, sessionId: R, status: "DONE" })).ok).toBe(false);
    expect((await saveSessionDetails({ trainingId: T, sessionId: R, start_time: "09:00", end_time: "13:00", room: "Зал 2", trainer_id: "", status: "HELD" })).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_session_details", expect.objectContaining({ p_session: R, p: expect.objectContaining({ trainer_id: null, room: "Зал 2" }) }));
  });

  it("приглашения: сообщение о числе отправленных, повтор — «новых нет»", async () => {
    rpc.mockResolvedValueOnce({ data: 4, error: null });
    expect(await sendFeedbackInvitations({ trainingId: T })).toMatchObject({ ok: true, data: { invited: 4 }, message: expect.stringContaining("4") });
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    expect(await sendFeedbackInvitations({ trainingId: T })).toMatchObject({ ok: true, data: { invited: 0 }, message: expect.stringContaining("Новых приглашений нет") });
  });

  it("анкета: оценки только 1–5, итог считает база (клиент оценок не усредняет)", async () => {
    expect((await recordFeedback({ trainingId: T, participantId: P, materials: 6, trainer: 5, org: 5 })).ok).toBe(false);
    expect((await recordFeedback({ trainingId: T, participantId: P, materials: 0, trainer: 5, org: 5 })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect((await recordFeedback({ trainingId: T, participantId: P, materials: "5", trainer: 4, org: 3, comment: "ok" })).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_feedback_response", { p_participant: P, p_scores: { MATERIALS: { "1": 5 }, TRAINER: { "1": 4 }, ORG: { "1": 3 } }, p_comment: "ok" });
  });

  it("обучение из заявки: даты и часы обязательны, остальное берёт база из заявки", async () => {
    expect((await createTrainingFromRequest({ requestId: R, start_date: "", hours: 4 })).ok).toBe(false);
    expect((await createTrainingFromRequest({ requestId: R, start_date: "2026-06-01", hours: 0 })).ok).toBe(false);
    rpc.mockResolvedValueOnce({ data: T, error: null });
    const r = await createTrainingFromRequest({ requestId: R, start_date: "2026-06-01", end_date: "", hours: 12 });
    expect(r).toMatchObject({ ok: true, data: { id: T } });
    expect(rpc).toHaveBeenCalledWith("create_training_from_request", { p_request: R, p: { start_date: "2026-06-01", hours: 12 } });
  });
});
