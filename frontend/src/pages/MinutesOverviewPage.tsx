import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MinutesOverviewItem } from "../types";
import { Card, CardHeader, EmptyState, CodeChip } from "../components/ui/Primitives";
import { RichTextRenderer } from "../components/editor/RichTextRenderer";

export default function MinutesOverviewPage() {
  const [items, setItems] = useState<MinutesOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<MinutesOverviewItem[]>("/meetings/minutes-overview/recent")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader title="Meeting Minutes" subtitle="The most recently recorded minutes across Ahununu Logistics" />
      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No minutes recorded yet" description="Minutes recorded from any meeting will show up here, most recent first." />
      ) : (
        <div className="divide-y divide-slate2-100">
          {items.map((m) => (
            <div key={m.id} className="px-5 py-4">
              <Link to={`/meetings/${m.meeting.id}`} className="flex flex-wrap items-center gap-2 hover:text-brand">
                <p className="text-sm font-semibold text-slate2-800">{m.meeting.title}</p>
                <CodeChip>{m.meeting.code}</CodeChip>
              </Link>
              <RichTextRenderer content={m.content} className="mt-1.5 text-sm text-slate2-600" />
              <p className="mt-1.5 text-[11px] text-slate2-400">
                Recorded by {m.recordedBy.name} · {new Date(m.createdAt).toLocaleString()} · {m.meeting.department.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
