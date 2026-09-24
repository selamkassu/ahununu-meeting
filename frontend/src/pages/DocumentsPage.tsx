import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { api } from "../api/client";
import type { DocumentItem } from "../types";
import { Card, CardHeader, EmptyState, CodeChip } from "../components/ui/Primitives";

function formatSize(bytes: number) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<DocumentItem[]>("/meetings/documents-overview/all")
      .then(setDocuments)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader
        title="Documents"
        subtitle="Files attached to meetings across Ahununu Logistics — attach from a meeting's page"
      />
      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents attached yet"
          description="Attach presentation decks, reports or reference files from any meeting's page. Full file storage will connect to Ahununu Logistics' Document Management System (DMS)."
        />
      ) : (
        <div className="divide-y divide-slate2-100">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate2-100 text-slate2-500">
                  <FileText size={15} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate2-800">{d.fileName}</p>
                  <Link to={`/meetings/${d.meeting.id}`} className="flex flex-wrap items-center gap-1.5 text-xs text-slate2-400 hover:text-brand">
                    {d.meeting.title} <CodeChip>{d.meeting.code}</CodeChip>
                  </Link>
                </div>
              </div>
              <div className="text-right text-xs text-slate2-400">
                <p>{formatSize(d.fileSize)}</p>
                <p>{d.uploadedBy.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
