import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

/**
 * Заголовок страницы. `breadcrumbs` — «хлебные крошки»; `backHref` — кнопка «← Назад» на страницу-родитель
 * (не history.back: после обновления страницы или перехода по ссылке путь назад остаётся предсказуемым).
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  backHref,
  backLabel = "Назад",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="space-y-3">
      {(backHref || (breadcrumbs && breadcrumbs.length > 0)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {backHref && (
            <Link href={backHref} className="inline-flex items-center gap-1 rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40" data-testid="back-link">
              <ArrowLeft className="size-4" aria-hidden /> {backLabel}
            </Link>
          )}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav aria-label="Навигационная цепочка" className="flex min-w-0 flex-wrap items-center gap-1 text-muted-foreground" data-testid="breadcrumbs">
              {breadcrumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="inline-flex min-w-0 items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                  {c.href && i < breadcrumbs.length - 1 ? (
                    <Link href={c.href} className="truncate hover:text-foreground">{c.label}</Link>
                  ) : (
                    <span className="truncate text-foreground/80" aria-current={i === breadcrumbs.length - 1 ? "page" : undefined}>{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
