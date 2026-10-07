import type { ParticipantResult } from "@/lib/workflows/schemas";

export const PARTICIPANT_RESULT_LABELS: Record<ParticipantResult, string> = {
  COMPLETED: "Прошёл обучение",
  NOT_COMPLETED: "Не завершил",
  PASSED: "Сдал",
  FAILED: "Не сдал",
};

export const PARTICIPANT_RESULT_VARIANT: Record<ParticipantResult, "success" | "warning" | "outline"> = {
  COMPLETED: "success",
  NOT_COMPLETED: "warning",
  PASSED: "success",
  FAILED: "warning",
};

export const PARTICIPANT_RESULT_OPTIONS = (Object.keys(PARTICIPANT_RESULT_LABELS) as ParticipantResult[]).map((v) => ({ value: v, label: PARTICIPANT_RESULT_LABELS[v] }));

export const PROVIDER_KIND_LABELS: Record<string, string> = {
  INTERNAL: "Внутренний",
  EXTERNAL: "Внешний",
  ORGANIZATION: "Организация",
};
