import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { AgendaOverviewItem } from "../types";
import { Card, CardHeader, EmptyState, CodeChip } from "../components/ui/Primitives";

export default function AgendaOverviewPage() {
  const [items, setItems] = useState<AgendaOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AgendaOverviewItem[]>("/meetings/agenda-overview/upcoming")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const grouped = items.reduce<Record<string, AgendaOverviewItem[]>>((acc, item) => {
    const key = item.meeting.id;
    (acc[key] ||= []).push(item);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader title="Agenda" subtitle="Upcoming discussion topics across every scheduled meeting" />
      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No upcoming agenda items" description="Agenda items you add to a meeting will appear here until that meeting's date." />
      ) : (
        <div className="divide-y divide-slate2-100">
          {Object.values(grouped).map((group) => (
            <div key={group[0].meeting.id} className="px-5 py-4">
              <Link to={`/meetings/${group[0].meeting.id}`} className="flex flex-wrap items-center gap-2 hover:text-brand">
                <p className="text-sm font-semibold text-slate2-800">{group[0].meeting.title}</p>
                <CodeChip>{group[0].meeting.code}</CodeChip>
                <span className="text-xs text-slate2-400">
                  {new Date(group[0].meeting.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {group[0].meeting.department.name}
                </span>
              </Link>
              <ol className="mt-2 space-y-1.5">
                {group
                  .sort((a, b) => a.order - b.order)
                  .map((a, idx) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm text-slate2-600">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate2-100 text-[10px] font-semibold text-slate2-500">
                        {idx + 1}
                      </span>
                      {a.title}
                      {a.presenter && <span className="text-xs text-slate2-400">· {a.presenter}</span>}
                      <span className="text-xs text-slate2-400">· {a.durationMin} min</span>
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
