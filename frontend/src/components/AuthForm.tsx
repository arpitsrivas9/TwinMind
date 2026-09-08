"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "./ui";

type AuthMode = "login" | "signup";
type FormErrors = Partial<Record<"name" | "email" | "password", string>>;

type AuthFormProps = {
  mode: AuthMode;
};

const copy = {
  login: {
    title: "Welcome back",
    description: "Return to your personal cognitive system.",
    submit: "Continue to TwinMind",
    footer: "Need an account?",
    footerLink: "Create one",
    footerHref: "/signup",
  },
  signup: {
    title: "Create your TwinMind",
    description: "Begin with a secure identity for your cognitive workspace.",
    submit: "Prepare my workspace",
    footer: "Already have an account?",
    footerLink: "Sign in",
    footerHref: "/login",
  },
} as const;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { login, signup } = useAuth();
  const content = copy[mode];
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateValue = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError(null);
  };

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (mode === "signup" && values.name.trim().length < 2) {
      nextErrors.name = "Enter your name so TwinMind can identify this workspace.";
    }

    if (!isEmail(values.email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (values.password.length < 8) {
      nextErrors.password = "Use at least 8 characters for your password.";
    }

    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setServerError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signup(values.name, values.email, values.password);
      } else {
        await login(values.email, values.password);
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed. Please check your credentials.";
      setServerError(message);
      setSubmitting(false);
    }
  };

  return (
    <Card elevated className="w-full max-w-md bg-surface-1/90">
      <CardHeader className="border-b border-border-subtle">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">{content.title}</CardTitle>
            <CardDescription className="mt-2">{content.description}</CardDescription>
          </div>
          <Badge variant="cyan">Phase 1</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form className="space-y-5" noValidate onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <Field htmlFor="auth-name" label="Full name" error={errors.name} hint="This stays private to your TwinMind identity.">
              <Input
                id="auth-name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={values.name}
                onChange={(event) => updateValue("name", event.target.value)}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "auth-name-error" : undefined}
              />
            </Field>
          ) : null}

          <Field htmlFor="auth-email" label="Email" error={errors.email}>
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete={mode === "login" ? "email" : "username"}
              placeholder="you@example.com"
              value={values.email}
              onChange={(event) => updateValue("email", event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "auth-email-error" : undefined}
            />
          </Field>

          <Field
            htmlFor="auth-password"
            label="Password"
            hint={mode === "signup" ? "At least 8 characters. You can change this later." : undefined}
            error={errors.password}
          >
            <Input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Enter your password"
              value={values.password}
              onChange={(event) => updateValue("password", event.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "auth-password-error" : undefined}
            />
          </Field>

          {submitting ? (
            <div role="status" aria-live="polite" aria-busy="true" className="flex items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2.5 text-sm text-cyan-200">
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-cyan-200" />
              Connecting to TwinMind…
            </div>
          ) : serverError ? (
            <div role="alert" className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
              {serverError}
            </div>
          ) : Object.keys(errors).length > 0 ? (
            <div role="alert" className="rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2.5 text-sm text-amber-200">
              Please check the highlighted fields above.
            </div>
          ) : null}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : content.submit}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          {content.footer}{" "}
          <Link href={content.footerHref} className="font-medium text-accent-cyan hover:text-accent-cyan-strong">
            {content.footerLink}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
