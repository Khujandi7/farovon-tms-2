import { Ban, CloudOff } from "lucide-react";

export function ClosedState({ unavailable = false }: { unavailable?: boolean }) {
  const Icon = unavailable ? CloudOff : Ban;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center" data-testid="request-closed">
      <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold">{unavailable ? "Сервис временно недоступен" : "Ссылка недействительна"}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {unavailable
          ? "Не удалось загрузить форму. Попробуйте открыть страницу позже."
          : "Эта ссылка отключена или заменена, либо приём заявок закрыт. Запросите актуальную ссылку в Академии Фаровон."}
      </p>
    </div>
  );
}
