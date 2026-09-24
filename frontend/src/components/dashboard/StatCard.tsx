import React from "react";
import { Card } from "../ui/Primitives";

export type StatTone = "brand" | "accent" | "info" | "success" | "danger" | "warning" | "neutral";

const toneStyles: Record<StatTone, string> = {
  brand: "bg-brand text-white shadow-sm",
  accent: "bg-accent/35 text-brand",
  info: "bg-accent/35 text-brand",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-100/80 text-amber-700",
  danger: "bg-red-100/80 text-red-600",
  neutral: "bg-slate2-100 text-slate2-600",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone?: StatTone;
  hint?: string;
}) {
  return (
    <Card className="p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate2-400">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate2-800">{value}</p>
          {hint && <p className="mt-1 text-xs font-medium text-brand">{hint}</p>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneStyles[tone]}`}>
          <Icon size={19} strokeWidth={2} />
        </div>
      </div>
    </Card>
  );
}
