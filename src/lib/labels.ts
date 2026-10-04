import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];

export const TRAINING_STATUS_LABELS: Record<Enums["training_status"], string> = {
  PLANNED: "Запланировано",
  IN_PROGRESS: "Идёт",
  COMPLETED: "Проведено",
  CANCELLED: "Отменено",
  POSTPONED: "Перенесено",
  NOT_HELD: "Не проведено",
};

export const TRAINING_STATUS_VARIANT: Record<Enums["training_status"], "success" | "brand" | "secondary" | "warning" | "outline"> = {
  PLANNED: "secondary",
  IN_PROGRESS: "brand",
  COMPLETED: "success",
  CANCELLED: "outline",
  POSTPONED: "warning",
  NOT_HELD: "outline",
};

export const SOURCE_TYPE_LABELS: Record<Enums["source_type"], string> = {
  PLANNED: "Плановое",
  UNPLANNED: "Внеплановое",
};

export const TRAINING_FORMAT_LABELS: Record<Enums["training_format"], string> = {
  ONLINE: "Онлайн",
  OFFLINE: "Очно",
  BLENDED: "Смешанный",
};
