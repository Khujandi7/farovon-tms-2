import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        className="w-full max-w-md bg-card"
        icon={FileQuestion}
        title="Страница не найдена"
        description="Такого адреса нет в FAROVON TMS."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">На главную</Link>
          </Button>
        }
      />
    </main>
  );
}
