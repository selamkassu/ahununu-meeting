import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { DecisionOverviewItem } from "../types";
import { Card, CardHeader, EmptyState, CodeChip, inputClass } from "../components/ui/Primitives";
import { StatusBadge } from "../components/ui/Badge";

export default function DecisionsPage() {
  const [items, setItems] = useState<DecisionOverviewItem[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = status ? `?status=${status}` : "";
    api
      .get<DecisionOverviewItem[]>(`/meetings/decisions-overview/all${params}`)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <Card>
      <CardHeader
        title="Decisions"
        subtitle="Formal outcomes from every meeting, and the action items tracking them through to completion"
        action={
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IMPLEMENTED">Implemented</option>
            <option value="REVERSED">Reversed</option>
          </select>
        }
      />
      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No decisions logged" description="Decisions recorded in any meeting will appear here." />
      ) : (
        <div className="divide-y divide-slate2-100">
          {items.map((d) => {
            const completed = d.actionItems.filter((a) => a.status === "COMPLETED").length;
            return (
              <div key={d.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate2-800">{d.title}</p>
                    <CodeChip>{d.code}</CodeChip>
                  </div>
                  {d.description && <p className="mt-1 text-sm text-slate2-500">{d.description}</p>}
                  <Link to={`/meetings/${d.meeting.id}`} className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate2-400 hover:text-brand">
                    {d.meeting.title} · {d.meeting.department.name} · {new Date(d.decisionDate).toLocaleDateString()}
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  {d.actionItems.length > 0 && (
                    <span className="text-xs text-slate2-500">
                      {completed}/{d.actionItems.length} action items done
                    </span>
                  )}
                  <StatusBadge status={d.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
