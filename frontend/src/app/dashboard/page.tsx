import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "../../components/ui";
import { EmptyState } from "../../components/states";

const workspaceSignals = [
  { label: "Memories", value: "0", detail: "Waiting for your first signal", tone: "cyan" as const },
  { label: "Context", value: "Clear", detail: "No active context selected", tone: "violet" as const },
  { label: "Tasks", value: "0", detail: "Nothing needs your attention", tone: "neutral" as const },
];

const activityItems = [
  { label: "Identity layer initialized", detail: "Just now", icon: "◎" },
  { label: "Workspace prepared", detail: "Just now", icon: "◈" },
  { label: "Security baseline configured", detail: "Foundation", icon: "✓" },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background/35 px-4 py-6 text-text-primary sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-360">
        <header className="flex flex-col gap-5 border-b border-border-subtle pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold tracking-[0.2em] text-text-muted uppercase">Personal workspace</p>
              <Badge variant="success">Foundation online</Badge>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">Your cognitive space</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
              A quiet place for thoughts, context, and connected information to take shape.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/profile"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border-default bg-surface-2 px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Profile
            </Link>
            <Link
              href="/settings"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border-default bg-surface-2 px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Settings
            </Link>
          </div>
        </header>

        <section aria-label="Workspace signals" className="mt-6 grid gap-3 md:grid-cols-3">
          {workspaceSignals.map((signal) => (
            <Card key={signal.label} className="bg-surface-1/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-wide text-text-muted uppercase">{signal.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{signal.value}</p>
                </div>
                <Badge variant={signal.tone}>{signal.label === "Context" ? "Idle" : "Ready"}</Badge>
              </div>
              <p className="mt-3 text-xs text-text-muted">{signal.detail}</p>
            </Card>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.85fr)]">
          <Card elevated className="overflow-hidden bg-surface-1/85">
            <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border-subtle">
              <div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-accent-cyan shadow-[0_0_14px_rgb(34_211_238/70%)]" />
                  <CardTitle>Conversation</CardTitle>
                </div>
                <CardDescription className="mt-1">Think with TwinMind when you are ready.</CardDescription>
              </div>
              <Badge>Awaiting input</Badge>
            </CardHeader>
            <CardContent className="flex min-h-120 flex-col justify-between gap-8 pt-8">
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="tm-core-breathe relative flex size-24 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/5 shadow-[0_0_70px_rgb(34_211_238/14%)]">
                  <div className="tm-core-pulse size-12 rounded-full border border-cyan-200/40 bg-cyan-200/10" />
                  <span className="absolute size-2 rounded-full bg-cyan-100 shadow-[0_0_16px_rgb(165_243_252/90%)]" />
                </div>
                <h2 className="mt-6 text-xl font-semibold tracking-tight text-text-primary">Your thought space is clear</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                  Start with a question, a loose idea, or a piece of context. TwinMind will eventually connect the signal to what matters.
                </p>
              </div>

              <div className="rounded-lg border border-border-subtle bg-background/60 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <span aria-hidden="true" className="text-lg text-text-muted">⌕</span>
                  <Input aria-label="Search or start a thought" disabled placeholder="Search or start a thought" className="min-w-0" />
                  <Button disabled variant="secondary" className="w-full shrink-0 sm:w-auto">Capture thought</Button>
                </div>
                <p className="mt-2 px-1 text-xs text-text-muted">Conversation and capture will be connected in a later phase.</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card className="bg-surface-1/85">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Active context</CardTitle>
                  <Badge variant="violet">None selected</Badge>
                </div>
                <CardDescription>Your current focus will appear here as TwinMind learns what matters now.</CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  compact
                  title="No active context"
                  description="Connect a thought, document, person, or task in a future phase."
                />
              </CardContent>
            </Card>

            <Card className="bg-surface-1/85">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Knowledge field</CardTitle>
                  <span aria-hidden="true" className="text-lg text-accent-violet">◌</span>
                </div>
                <CardDescription>Connected information will collect around your active context.</CardDescription>
              </CardHeader>
              <CardContent>
                <div aria-label="Empty knowledge field visualization" className="relative flex min-h-44 items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-background/50">
                  <div className="tm-orbit absolute size-32 rounded-full border border-violet-300/15">
                    <span className="tm-node-drift absolute -right-1 top-1/2 size-2 rounded-full bg-violet-300/80" />
                  </div>
                  <div className="tm-orbit-reverse absolute size-20 rounded-full border border-cyan-300/20">
                    <span className="tm-node-drift absolute -left-1 top-1/2 size-1.5 rounded-full bg-cyan-200/80" />
                  </div>
                  <div className="relative flex size-10 items-center justify-center rounded-full border border-cyan-200/40 bg-cyan-200/10 text-sm text-cyan-100">◈</div>
                  <span className="tm-node-drift absolute left-[18%] top-[28%] size-2 rounded-full bg-violet-300/70" />
                  <span className="tm-node-drift absolute right-[20%] top-[34%] size-1.5 rounded-full bg-cyan-200/70 [animation-delay:900ms]" />
                  <span className="tm-node-drift absolute bottom-[22%] left-[34%] size-1.5 rounded-full bg-violet-200/60 [animation-delay:1500ms]" />
                  <p className="absolute bottom-3 text-[11px] tracking-wide text-text-muted">No connections yet</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card className="bg-surface-1/75">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Memory layer</CardTitle>
                  <CardDescription className="mt-1">A future home for durable knowledge and personal context.</CardDescription>
                </div>
                <Badge>Empty</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {["Personal knowledge", "People and places", "Documents and voice"].map((label) => (
                  <div key={label} className="rounded-lg border border-border-subtle bg-background/45 p-3">
                    <div className="flex size-8 items-center justify-center rounded-md bg-white/5 text-sm text-text-muted">＋</div>
                    <p className="mt-3 text-xs font-medium leading-5 text-text-secondary">{label}</p>
                    <p className="mt-1 text-[11px] text-text-muted">Not connected</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-surface-1/75">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>System activity</CardTitle>
                <Badge variant="success">Stable</Badge>
              </div>
              <CardDescription>Recent changes in your TwinMind foundation.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {activityItems.map((item) => (
                  <li key={item.label} className="flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-background/60 text-xs text-accent-cyan">{item.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm text-text-secondary">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-text-muted">{item.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
