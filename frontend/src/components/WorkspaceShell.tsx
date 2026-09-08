"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const primaryNavigation = [
  { href: "/dashboard", label: "Workspace", icon: "◈" },
  { href: null, label: "Memory", icon: "◌", status: "Soon" },
  { href: null, label: "Search", icon: "⌕", status: "Soon" },
  { href: null, label: "Tasks", icon: "✓", status: "Soon" },
];

const accountNavigation = [
  { href: "/profile", label: "Profile", icon: "◎" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        aria-label="TwinMind workspace"
        className="flex items-center gap-3 rounded-md px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-lg text-cyan-200 shadow-[0_0_24px_rgb(34_211_238/12%)]">
          ◈
        </div>
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-text-primary uppercase">TwinMind</p>
          <p className="mt-0.5 text-[11px] text-text-muted">Cognitive system</p>
        </div>
      </Link>

      <nav aria-label="Primary navigation" className="mt-10 space-y-1">
        <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.2em] text-text-muted uppercase">Core</p>
        {primaryNavigation.map((item) => {
          const active = item.href ? isActivePath(pathname, item.href) : false;

          if (!item.href) {
            return (
              <div
                key={item.label}
                aria-disabled="true"
                className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-text-muted/70"
                title={`${item.label} will be available in a later phase`}
              >
                <span aria-hidden="true" className="flex size-5 items-center justify-center text-base">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] tracking-wide text-text-muted uppercase">{item.status}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                active
                  ? "border border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              <span aria-hidden="true" className="flex size-5 items-center justify-center text-base">
                {item.icon}
              </span>
              <span>{item.label}</span>
              {active ? <span className="ml-auto size-1.5 rounded-full bg-accent-cyan" /> : null}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Account navigation" className="mt-8 space-y-1">
        <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.2em] text-text-muted uppercase">Account</p>
        {accountNavigation.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                active
                  ? "border border-white/10 bg-white/6 text-text-primary"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              <span aria-hidden="true" className="flex size-5 items-center justify-center text-base">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-border-subtle bg-surface-1/70 p-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgb(52_211_153/70%)]" />
          <span className="text-xs font-medium text-text-secondary">Foundation mode</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-text-muted">Your cognitive workspace is being prepared for the next phase.</p>
      </div>
    </>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen lg:pl-64">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border-subtle bg-background/80 px-4 backdrop-blur-xl lg:hidden">
        <Link
          href="/dashboard"
          aria-label="TwinMind workspace"
          className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <div className="flex size-8 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-sm text-cyan-200">◈</div>
          <span className="text-sm font-semibold tracking-[0.16em] text-text-primary uppercase">TwinMind</span>
        </Link>
        <button
          type="button"
          aria-controls="mobile-workspace-navigation"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close workspace navigation" : "Open workspace navigation"}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex size-10 items-center justify-center rounded-md border border-border-default text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {mobileOpen ? "×" : "☰"}
          </span>
        </button>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border-subtle bg-background/75 px-4 py-6 backdrop-blur-2xl lg:flex">
        <NavigationContent />
      </aside>

      {mobileOpen ? (
        <>
          <button
            type="button"
            aria-label="Close workspace navigation"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-20 bg-background/70 backdrop-blur-sm lg:hidden"
          />
          <aside
            id="mobile-workspace-navigation"
            className="fixed inset-y-0 left-0 z-30 flex w-[min(19rem,88vw)] flex-col border-r border-border-subtle bg-background px-4 py-6 shadow-2xl shadow-black/40 lg:hidden"
          >
            <NavigationContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </>
      ) : null}

      <main className="min-h-screen">{children}</main>
    </div>
  );
}
