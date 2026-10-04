"use client";

import { RotateCcw } from "lucide-react";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isConfig = error.name === "EnvError" || error.message.includes("окружения");
  return (
    <ErrorState
      className="bg-card"
      title={isConfig ? "Приложение не настроено" : "Не удалось загрузить страницу"}
      description={
        isConfig
          ? "Не заданы параметры подключения к Supabase. Администратору: см. .env.example и раздел «Подключение Supabase» в README."
          : `Попробуйте ещё раз. Если ошибка повторяется, сообщите администратору${error.digest ? ` (код: ${error.digest})` : ""}.`
      }
      action={
        <Button variant="outline" onClick={reset}>
          <RotateCcw /> Повторить
        </Button>
      }
    />
  );
}
