import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../api/client";
import type { MeetingListItem } from "../types";
import { Card, CardHeader, Button } from "../components/ui/Primitives";
import { priorityTone } from "../components/ui/Badge";

const toneToDot: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-accent-dark",
  info: "bg-brand",
  neutral: "bg-slate2-400",
};

export default function CalendarPage() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  useEffect(() => {
    api.get<MeetingListItem[]>("/meetings").then(setMeetings);
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, MeetingListItem[]>();
    for (const m of meetings) {
      const key = new Date(m.date).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [meetings]);

  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    const rows: Date[][] = [];
    for (let i = 0; i < 6; i++) rows.push(days.slice(i * 7, i * 7 + 7));
    return rows;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const today = new Date().toDateString();

  return (
    <Card>
      <CardHeader
        title={monthLabel}
        subtitle="All scheduled, in-progress, completed and cancelled meetings"
        action={
          <div className="flex items-center gap-1">
            <Button variant="secondary" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
              <ChevronLeft size={15} />
            </Button>
            <Button variant="secondary" onClick={() => setCursor(() => { const d = new Date(); d.setDate(1); return d; })}>
              Today
            </Button>
            <Button variant="secondary" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
              <ChevronRight size={15} />
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-7 border-b border-slate2-100 text-center text-[11px] font-semibold uppercase tracking-wide text-slate2-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day, idx) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const items = byDay.get(day.toDateString()) || [];
          return (
            <div
              key={idx}
              className={`min-h-[92px] border-b border-r border-slate2-100 p-1.5 ${inMonth ? "bg-white" : "bg-slate2-50/50"}`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  day.toDateString() === today ? "bg-brand font-semibold text-white" : inMonth ? "text-slate2-600" : "text-slate2-300"
                }`}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {items.slice(0, 3).map((m) => (
                  <Link
                    key={m.id}
                    to={`/meetings/${m.id}`}
                    className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium text-slate2-600 hover:bg-slate2-100"
                    title={m.title}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneToDot[priorityTone(m.priority)]}`} />
                    <span className="truncate">{m.title}</span>
                  </Link>
                ))}
                {items.length > 3 && <p className="px-1 text-[10px] text-slate2-400">+{items.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
