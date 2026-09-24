import React from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate2-200 bg-white shadow-card ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate2-100 px-5 py-4">
      <div>
        <h3 className="font-display text-[15px] font-semibold text-slate2-800">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate2-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand text-white hover:bg-brand-light disabled:bg-slate2-300",
    secondary: "bg-white text-slate2-700 border border-slate2-200 hover:bg-slate2-50",
    ghost: "bg-transparent text-slate2-600 hover:bg-slate2-100",
    danger: "bg-danger text-white hover:bg-red-700",
  };
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate2-600">
        {label} {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate2-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate2-200 bg-white px-3 py-2 text-sm text-slate2-800 placeholder:text-slate2-400 focus-ring focus:border-brand";

export function ProgressBar({ percent, tone = "brand" }: { percent: number; tone?: "brand" | "success" | "danger" }) {
  const colors = { brand: "bg-brand", success: "bg-success", danger: "bg-danger" };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate2-100">
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

export function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const isLight =
    color?.toLowerCase() === "#aed580" ||
    color?.toLowerCase() === "#c5e8a0" ||
    color?.toLowerCase() === "#ffffff";
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        isLight ? "text-brand-dark" : "text-white"
      }`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-display text-sm font-semibold text-slate2-700">{title}</p>
      <p className="max-w-sm text-sm text-slate2-500">{description}</p>
      {action}
    </div>
  );
}

export function CodeChip({ children }: { children: React.ReactNode }) {
  return <span className="code-chip">{children}</span>;
}
