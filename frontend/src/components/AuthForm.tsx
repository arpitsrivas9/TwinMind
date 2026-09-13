"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import { useAuth } from "../context/AuthContext";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "./ui";
import { TwinMindHeartbeat } from "./motion/TwinMindHeartbeat";
import { scaleInVariants, reducedMotionVariants, fadeInVariants } from "../lib/motion";

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
  const { user, loading: authLoading, login, signup, devLogin } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const content = copy[mode];
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  const updateValue = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError(null);
  };

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (mode === "signup") {
      if (values.name.trim().length < 2) {
        nextErrors.name = "Enter your name so TwinMind can identify this workspace.";
      }
      if (!isEmail(values.email)) {
        nextErrors.email = "Enter a valid email address.";
      }
    } else {
      if (values.email.trim().length < 2) {
        nextErrors.email = "Enter your username or email address.";
      }
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

  const cardVariants = shouldReduceMotion ? reducedMotionVariants : scaleInVariants;

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      animate="animate"
      className="w-full max-w-md"
    >
      <Card elevated className="w-full rounded-2xl border border-cyan-500/20 bg-surface-1/90 shadow-2xl backdrop-blur-xl">
      <CardHeader className="border-b border-border-subtle/60 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-950/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <TwinMindHeartbeat size="sm" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-text-primary">{content.title}</CardTitle>
              <CardDescription className="mt-1 text-xs text-text-muted">{content.description}</CardDescription>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/60 px-2.5 py-0.5 text-[10px] font-mono text-cyan-300">
            <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
            TwinTrust™
          </span>
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

          <Field
            htmlFor="auth-email"
            label={mode === "signup" ? "Email" : "Username or Email"}
            error={errors.email}
          >
            <Input
              id="auth-email"
              name="email"
              type={mode === "signup" ? "email" : "text"}
              autoComplete={mode === "login" ? "username" : "email"}
              placeholder={mode === "signup" ? "you@example.com" : "Username or you@example.com"}
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

          <AnimatePresence mode="wait">
            {submitting ? (
              <motion.div
                key="submitting"
                variants={fadeInVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                role="status"
                aria-live="polite"
                aria-busy="true"
                className="flex items-center gap-2.5 rounded-xl border border-cyan-400/30 bg-cyan-950/50 p-3 text-xs font-mono text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
              >
                <TwinMindHeartbeat size="xs" />
                <span>Authenticating neural session…</span>
              </motion.div>
            ) : serverError ? (
              <motion.div
                key="serverError"
                variants={fadeInVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                role="alert"
                className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300"
              >
                {serverError}
              </motion.div>
            ) : Object.keys(errors).length > 0 ? (
              <motion.div
                key="errors"
                variants={fadeInVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                role="alert"
                className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2.5 text-xs text-amber-200"
              >
                Please check the highlighted fields above.
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
            <Button type="submit" disabled={submitting} className="w-full shadow-[0_0_20px_rgba(6,182,212,0.2)]">
              {submitting ? "Connecting…" : content.submit}
            </Button>
          </motion.div>

          {process.env.NODE_ENV === "development" && mode === "login" && (
            <div className="pt-1">
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true);
                  setServerError(null);
                  try {
                    await devLogin();
                    router.push("/dashboard");
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Development login failed";
                    setServerError(message);
                    setSubmitting(false);
                  }
                }}
                className="w-full text-xs font-mono border border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/40"
              >
                ⚡ Quick Dev Sign In
              </Button>
            </div>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          {content.footer}{" "}
          <Link href={content.footerHref} className="font-medium text-accent-cyan hover:text-accent-cyan-strong">
            {content.footerLink}
          </Link>
        </p>
      </CardContent>
    </Card>
    </motion.div>
  );
}
