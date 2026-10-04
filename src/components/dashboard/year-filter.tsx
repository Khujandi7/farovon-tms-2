import Link from "next/link";
import { cn } from "@/lib/utils";

export function YearFilter({ years, selected, basePath = "/dashboard" }: { years: number[]; selected: number; basePath?: string }) {
  return (
    <nav aria-label="Год" className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-card p-0.5 shadow-xs" data-testid="year-filter">
      {years.map((y) => (
        <Link
          key={y}
          href={`${basePath}?year=${y}`}
          scroll={false}
          aria-current={y === selected ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            y === selected ? "bg-brand text-white shadow-xs" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {y}
        </Link>
      ))}
    </nav>
  );
}
