"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { Badge } from "../../components/ui";
import { ChatLayout } from "../../components/chat/ChatLayout";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-text-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent" />
          <p className="text-xs font-medium text-text-muted">Loading workspace…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-background/35 px-3 py-4 text-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Workspace Header */}
        <header className="mb-4 flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-semibold tracking-[0.2em] text-text-muted uppercase">
                Cognitive Workspace
              </span>
              <Badge variant="cyan">Phase 2 — Twin Core</Badge>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Welcome back, {user.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/profile"
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              Profile
            </Link>
            <Link
              href="/settings"
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              Log out
            </button>
          </div>
        </header>

        {/* Phase 2 Interactive Chat Workspace */}
        <ChatLayout />
      </div>
    </main>
  );
}
