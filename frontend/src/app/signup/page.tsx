import { AuthForm } from "../../components/AuthForm";

export default function SignupPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background/90 px-4 py-12 text-text-primary">
      {/* Ambient Breathing Ring Behind Auth Card */}
      <div className="pointer-events-none absolute size-[500px] rounded-full bg-cyan-500/10 blur-[100px] animate-pulse" />
      <div className="relative z-10 w-full max-w-md">
        <AuthForm mode="signup" />
      </div>
    </main>
  );
}
