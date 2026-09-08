import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { forwardRef } from "react";

type ClassValue = string | false | null | undefined;

function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-50";

const buttonVariants = {
  primary:
    "bg-accent-cyan text-slate-950 hover:bg-accent-cyan-strong focus-visible:outline-focus-ring",
  secondary:
    "border border-border-default bg-surface-2 text-text-primary hover:border-border-strong hover:bg-surface-3 focus-visible:outline-focus-ring",
  ghost:
    "text-text-secondary hover:bg-white/5 hover:text-text-primary focus-visible:outline-focus-ring",
  danger:
    "border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20 focus-visible:outline-danger",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(
  function Button({ className, variant = "primary", type = "button", ...props }, ref) {
    return <button ref={ref} type={type} className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
  },
);

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { elevated?: boolean }>(
  function Card({ className, elevated = false, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border border-border-subtle bg-surface-glass backdrop-blur-md",
          elevated && "shadow-surface",
          className,
        )}
        {...props}
      />
    );
  },
);

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold tracking-tight text-text-primary", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-6 text-text-secondary", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}

const badgeVariants = {
  neutral: "border-border-default bg-white/4 text-text-secondary",
  cyan: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  violet: "border-violet-300/30 bg-violet-300/10 text-violet-200",
  success: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  warning: "border-amber-300/30 bg-amber-300/10 text-amber-200",
} as const;

export function Badge({
  children,
  className,
  variant = "neutral",
}: {
  children: ReactNode;
  className?: string;
  variant?: keyof typeof badgeVariants;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide",
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "min-h-11 w-full rounded-md border border-border-default bg-surface-1 px-3.5 py-2.5 text-sm text-text-primary transition-colors placeholder:text-text-muted hover:border-border-strong focus:border-accent-cyan focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
