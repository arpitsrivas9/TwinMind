"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "./ui";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

type ProfileErrors = Partial<Record<"name" | "email", string>>;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ProfileForm() {
  const [values, setValues] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState(false);
  const preparationTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (preparationTimer.current !== null) window.clearTimeout(preparationTimer.current);
    };
  }, []);

  const updateValue = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setPreparing(false);
    setReady(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: ProfileErrors = {};

    if (values.name.trim().length < 2) {
      nextErrors.name = "Enter at least two characters for your name.";
    }

    if (!isEmail(values.email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    setErrors(nextErrors);
    setReady(false);

    if (Object.keys(nextErrors).length === 0) {
      setPreparing(true);
      preparationTimer.current = window.setTimeout(() => {
        setPreparing(false);
        setReady(true);
      }, 350);
    } else {
      setPreparing(false);
    }
  };

  return (
    <div className="w-full max-w-5xl">
      <WorkspacePageHeader
        eyebrow="Identity settings"
        title="Profile"
        description="Shape the identity TwinMind will use for your future cognitive workspace."
        status={<Badge variant="cyan">Phase 1</Badge>}
      />
      <Card elevated className="mt-6 w-full max-w-2xl bg-surface-1/90">
        <CardHeader>
          <CardTitle>Profile identity</CardTitle>
          <CardDescription>These details are prepared locally until profile persistence is connected.</CardDescription>
        </CardHeader>
        <CardContent>
        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          <Field htmlFor="profile-name" label="Full name" error={errors.name} hint="Use the name you want TwinMind to recognize.">
            <Input
              id="profile-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={values.name}
              onChange={(event) => updateValue("name", event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "profile-name-error" : undefined}
            />
          </Field>

          <Field htmlFor="profile-email" label="Email" error={errors.email} hint="Email persistence will be connected with account functionality later.">
            <Input
              id="profile-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={values.email}
              onChange={(event) => updateValue("email", event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "profile-email-error" : undefined}
            />
          </Field>

          {preparing ? (
            <div role="status" aria-live="polite" aria-busy="true" className="flex items-center gap-2 rounded-md border border-violet-300/25 bg-violet-300/10 px-3 py-2.5 text-sm text-violet-200">
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-violet-200" />
              Preparing your profile for the TwinMind connection preview…
            </div>
          ) : ready ? (
            <div role="status" aria-live="polite" className="rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2.5 text-sm text-emerald-200">
              Profile details look ready. Persistence will be enabled in a later phase.
            </div>
          ) : Object.keys(errors).length > 0 ? (
            <div role="alert" className="rounded-md border border-rose-300/25 bg-rose-300/10 px-3 py-2.5 text-sm text-rose-200">
              Review the highlighted profile fields before continuing.
            </div>
          ) : null}

          <Button type="submit" disabled={preparing}>{preparing ? "Preparing…" : "Prepare profile changes"}</Button>
        </form>
        </CardContent>
      </Card>
    </div>
  );
}
