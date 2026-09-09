import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background/85 text-text-primary">
      <section className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-20 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-xl">
          <span className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium tracking-[0.2em] text-cyan-200 uppercase">
            TwinMind
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-text-primary md:text-6xl">
            Your personal AI operating system.
          </h1>
          <p className="mt-6 text-lg text-text-secondary">
            A secure foundation for your memory, knowledge, agents, and future AI workflows.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="rounded-md bg-accent-cyan px-5 py-3 font-medium text-slate-950 transition hover:bg-accent-cyan-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="rounded-md border border-border-default bg-surface-2 px-5 py-3 font-medium text-text-primary transition hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Create account
            </Link>
          </div>
        </div>

        <div className="grid w-full max-w-xl gap-4 rounded-xl border border-border-subtle bg-surface-glass p-6 shadow-surface backdrop-blur-md">
          {[
            { label: 'Secure identity', value: 'TwinTrust™ Active' },
            { label: 'Knowledge layer', value: 'TwinSearch™ & TwinGraph™ Active' },
            { label: 'AI workflows', value: 'Streaming Core Ready' },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-1 rounded-md border border-border-subtle bg-background/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="text-text-secondary">{item.label}</span>
              <span className="font-semibold text-accent-cyan">{item.value}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
