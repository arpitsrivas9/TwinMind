import type { ReactNode } from "react";

import { Button } from "./ui";

type StateKind = "empty" | "loading" | "processing" | "error" | "success" | "offline";

type StatePanelProps = {
  kind: StateKind;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
};

const stateStyles: Record<StateKind, { icon: string; iconClass: string; role: "status" | "alert" }> = {
  empty: { icon: "＋", iconClass: "border-border-default bg-white/5 text-text-muted", role: "status" },
  loading: { icon: "◌", iconClass: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200", role: "status" },
  processing: { icon: "✦", iconClass: "border-violet-300/30 bg-violet-300/10 text-violet-200", role: "status" },
  error: { icon: "!", iconClass: "border-rose-300/30 bg-rose-300/10 text-rose-200", role: "alert" },
  success: { icon: "✓", iconClass: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200", role: "status" },
  offline: { icon: "⌁", iconClass: "border-amber-300/30 bg-amber-300/10 text-amber-200", role: "alert" },
};

export function StatePanel({ kind, title, description, action, className, compact = false }: StatePanelProps) {
  const style = stateStyles[kind];
  const isAnimated = kind === "loading" || kind === "processing";

  return (
    <div
      role={style.role}
      aria-live={style.role === "alert" ? "assertive" : "polite"}
      aria-busy={kind === "loading" || kind === "processing"}
      className={`flex flex-col items-center justify-center rounded-lg border border-border-subtle bg-background/40 text-center ${compact ? "p-4" : "min-h-52 p-6"} ${className ?? ""}`}
    >
      <div
        aria-hidden="true"
        className={`flex size-10 items-center justify-center rounded-full border text-sm font-semibold ${style.iconClass} ${isAnimated ? "animate-pulse" : ""}`}
      >
        {style.icon}
      </div>
      <h3 className={`font-semibold text-text-primary ${compact ? "mt-3 text-sm" : "mt-4 text-base"}`}>{title}</h3>
      <p className={`max-w-sm leading-5 text-text-secondary ${compact ? "mt-1 text-xs" : "mt-2 text-sm"}`}>{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="empty" {...props} />;
}

export function LoadingState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="loading" {...props} />;
}

export function ProcessingState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="processing" {...props} />;
}

export function ErrorState({ action, ...props }: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="error" action={action ?? <Button variant="secondary">Try again</Button>} {...props} />;
}

export function SuccessState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="success" {...props} />;
}

export function OfflineState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="offline" {...props} />;
}
