import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "./ui";

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border-subtle pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-medium text-text-muted transition-colors hover:text-accent-cyan focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden="true">←</span>
          Back to workspace
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold tracking-[0.2em] text-text-muted uppercase">{eyebrow}</p>
          {status ?? <Badge variant="cyan">Workspace</Badge>}
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{description}</p>
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
    </header>
  );
}
