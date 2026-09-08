import { AuthForm } from "../../components/AuthForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background/35 px-4 py-12 text-text-primary">
      <AuthForm mode="login" />
    </main>
  );
}
