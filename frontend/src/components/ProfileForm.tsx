"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "./ui";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { useAuth } from "../context/AuthContext";
import { safeStorage, STORAGE_KEYS } from "../lib/storage";

type ProfileErrors = Partial<Record<"name" | "email", string>>;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ProfileForm() {
  const { user } = useAuth();
  const [values, setValues] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync with loaded auth user
  useEffect(() => {
    if (user) {
      setValues({
        name: user.name,
        email: user.email,
      });
    }
  }, [user]);

  const hasChanges =
    user !== null && (values.name !== user.name || values.email !== user.email);

  const updateValue = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSavedSuccess(false);
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

    if (Object.keys(nextErrors).length === 0) {
      setSaving(true);
      // Save display preference locally
      safeStorage.set("twinmind_display_profile", values);
      setTimeout(() => {
        setSaving(false);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }, 400);
    }
  };

  return (
    <div className="w-full max-w-5xl">
      <WorkspacePageHeader
        eyebrow="Identity settings"
        title="Profile"
        description="Manage the user identity and account credentials associated with TwinMind OS."
        status={<Badge variant="success">Authenticated</Badge>}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card elevated className="lg:col-span-2 bg-surface-1/90">
          <CardHeader>
            <CardTitle>Profile Identity</CardTitle>
            <CardDescription>
              Your name and verified email address for authentication and AI interactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form noValidate onSubmit={handleSubmit} className="space-y-5">
              <Field
                htmlFor="profile-name"
                label="Full name"
                error={errors.name}
                hint="Your display name inside TwinMind."
              >
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

              <Field
                htmlFor="profile-email"
                label="Email address"
                error={errors.email}
                hint="Your primary login identifier."
              >
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

              {savedSuccess ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300"
                >
                  ✓ Profile preferences updated successfully.
                </div>
              ) : Object.keys(errors).length > 0 ? (
                <div
                  role="alert"
                  className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300"
                >
                  Review the highlighted profile fields before continuing.
                </div>
              ) : null}

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={saving || !hasChanges}>
                  {saving ? "Saving…" : "Save profile changes"}
                </Button>
                {hasChanges && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (user) {
                        setValues({ name: user.name, email: user.email });
                        setErrors({});
                      }
                    }}
                  >
                    Discard
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/85 h-fit">
          <CardHeader>
            <CardTitle>Account Status</CardTitle>
            <CardDescription>Security overview</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-text-muted">User ID</p>
              <p className="font-mono text-xs text-text-primary mt-0.5 truncate">
                {user?.id || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Session Status</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-emerald-400">Active & Isolated</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-text-muted">Cognitive Storage</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Encrypted PostgreSQL tenant
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
