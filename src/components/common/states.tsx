import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox, Lock, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

type StateProps = {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
};

function StateBlock({ title, description, icon: Icon = Inbox, action, className, compact, tone }: StateProps & { tone: "neutral" | "danger" | "locked" }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      <div
        className={cn(
          "grid place-items-center rounded-full",
          compact ? "size-9" : "size-11",
          tone === "danger" && "bg-destructive/10 text-destructive",
          tone === "locked" && "bg-muted text-muted-foreground",
          tone === "neutral" && "bg-brand-soft text-brand",
        )}
      >
        <Icon className={compact ? "size-4" : "size-5"} aria-hidden="true" />
      </div>
      <div className="max-w-md space-y-1">
        <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>{title}</p>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StateBlock tone="neutral" {...props} />;
}

export function ErrorState({ icon = AlertTriangle, ...props }: StateProps) {
  return <StateBlock tone="danger" icon={icon} {...props} />;
}

/** Нет права на раздел (роль не входит в список). */
export function ForbiddenState({ icon = Lock, title = "Нет доступа к разделу", ...props }: Partial<StateProps>) {
  return (
    <StateBlock
      tone="locked"
      icon={icon}
      title={title}
      description={props.description ?? "Ваша роль не предусматривает доступ к этому разделу. Если это ошибка, обратитесь к администратору."}
      {...props}
    />
  );
}

/** Вход выполнен, но профиля/роли нет или учётная запись деактивирована. */
export function NoRoleState(props: Partial<StateProps>) {
  return (
    <StateBlock
      tone="locked"
      icon={ShieldOff}
      title={props.title ?? "Учётная запись не активирована"}
      description={
        props.description ??
        "Вы вошли в систему, но вашей учётной записи не назначена роль или она отключена. Обратитесь к администратору FAROVON TMS."
      }
      {...props}
    />
  );
}
