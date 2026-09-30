import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Eye, Download, X, ExternalLink } from "lucide-react";
import { api, getToken, buildUrl } from "../api/client";
import type { DocumentItem } from "../types";
import { Card, CardHeader, EmptyState, CodeChip } from "../components/ui/Primitives";

function formatSize(bytes: number) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Only these types can actually render in a browser iframe
const INLINE_VIEWABLE = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "txt", "csv"];

function getExt(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function buildViewUrl(meetingId: string, docId: string) {
  const token = getToken();
  const baseViewUrl = buildUrl(`/meetings/${meetingId}/documents/${docId}/view`);
  return token
    ? `${baseViewUrl}?token=${encodeURIComponent(token)}`
    : baseViewUrl;
}

async function triggerDownload(
  meetingId: string,
  docId: string,
  fileName: string,
  onError: (msg: string) => void,
) {
  try {
    const token = getToken();
    const downloadUrl = buildUrl(`/meetings/${meetingId}/documents/${docId}/download`);
    const res = await fetch(
      downloadUrl,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || "Download failed");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    onError(err.message || "Failed to download file.");
  }
}

// ─── Inline Viewer Modal (PDF / images only) ──────────────────────────────────
function InlineViewer({
  doc,
  onClose,
  onDownload,
}: {
  doc: DocumentItem;
  onClose: () => void;
  onDownload: () => void;
}) {
  const viewUrl = buildViewUrl(doc.meeting.id, doc.id);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, overflow: "hidden",
        display: "flex", flexDirection: "column",
        width: "92vw", maxWidth: 1100, height: "90vh",
        boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <FileText size={16} color="#0B7A6B" style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: 14, fontWeight: 600, color: "#1e293b",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{doc.fileName}</span>
            <span style={{ fontSize: 12, color: "#94a3b8", flexShrink: 0 }}>
              {formatSize(doc.fileSize)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <a href={viewUrl} target="_blank" rel="noopener noreferrer" title="Open in new tab"
              style={{
                width: 32, height: 32, display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                borderRadius: 6, border: "1px solid #cbd5e1",
                background: "#fff", cursor: "pointer", textDecoration: "none",
              }}
            >
              <ExternalLink size={14} color="#475569" />
            </a>
            <button type="button" onClick={onDownload} title="Download"
              style={{
                width: 32, height: 32, display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                borderRadius: 6, border: "1.5px solid #0B7A6B",
                background: "#0B7A6B", cursor: "pointer",
              }}
            >
              <Download size={14} color="#fff" />
            </button>
            <button type="button" onClick={onClose} title="Close (Esc)"
              style={{
                width: 32, height: 32, display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                borderRadius: 6, border: "1px solid #fca5a5",
                background: "#fff", cursor: "pointer",
              }}
            >
              <X size={14} color="#ef4444" />
            </button>
          </div>
        </div>
        {/* iframe */}
        <div style={{ flex: 1, overflow: "hidden", background: "#f1f5f9" }}>
          <iframe
            src={viewUrl}
            title={doc.fileName}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<DocumentItem | null>(null);

  useEffect(() => {
    api
      .get<DocumentItem[]>("/meetings/documents-overview/all")
      .then(setDocuments)
      .catch(() => setError("Failed to load documents."))
      .finally(() => setLoading(false));
  }, []);

  // Smart open: PDFs/images show inline modal; Office files download directly
  const handleView = (d: DocumentItem) => {
    const ext = getExt(d.fileName);
    if (INLINE_VIEWABLE.includes(ext)) {
      setViewing(d);
    } else {
      // Office files: download immediately so OS opens them natively
      triggerDownload(d.meeting.id, d.id, d.fileName, setError);
    }
  };

  const handleDownload = (d: DocumentItem) => {
    triggerDownload(d.meeting.id, d.id, d.fileName, setError);
  };

  return (
    <>
      {viewing && (
        <InlineViewer
          doc={viewing}
          onClose={() => setViewing(null)}
          onDownload={() => { triggerDownload(viewing.meeting.id, viewing.id, viewing.fileName, setError); }}
        />
      )}

      <Card>
        <CardHeader
          title="Documents"
          subtitle="Files attached to meetings across Ahununu Logistics — attach from a meeting's page"
        />

        {error && (
          <p className="px-5 py-2 text-xs font-medium text-red-600">{error}</p>
        )}

        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate2-100" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            title="No documents attached yet"
            description="Attach presentation decks, reports or reference files from any meeting's page."
          />
        ) : (
          <div className="divide-y divide-slate2-100">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate2-100 text-slate2-500">
                  <FileText size={15} />
                </div>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleView(d)}
                    title={`View ${d.fileName}`}
                    className="block max-w-full truncate text-left text-sm font-medium transition-colors hover:underline"
                    style={{ color: "#0B7A6B" }}
                  >
                    {d.fileName}
                  </button>
                  <Link
                    to={`/meetings/${d.meeting.id}`}
                    className="flex flex-wrap items-center gap-1.5 text-xs text-slate2-400 hover:text-brand"
                  >
                    {d.meeting.title} <CodeChip>{d.meeting.code}</CodeChip>
                  </Link>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Eye — view inline (or download for Office files) */}
                  <button
                    type="button"
                    onClick={() => handleView(d)}
                    title={INLINE_VIEWABLE.includes(getExt(d.fileName)) ? "Preview inline" : "Open file"}
                    style={{
                      width: 36, height: 36,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 8, border: "1.5px solid #cbd5e1",
                      background: "#ffffff", cursor: "pointer", flexShrink: 0,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#0B7A6B";
                      (e.currentTarget as HTMLElement).style.background = "#f0faf8";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#cbd5e1";
                      (e.currentTarget as HTMLElement).style.background = "#ffffff";
                    }}
                  >
                    <Eye size={16} color="#475569" />
                  </button>

                  {/* Download — always export/save */}
                  <button
                    type="button"
                    onClick={() => handleDownload(d)}
                    title="Export / Download"
                    style={{
                      width: 36, height: 36,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 8, border: "1.5px solid #0B7A6B",
                      background: "#0B7A6B", cursor: "pointer", flexShrink: 0,
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#095f55";
                      (e.currentTarget as HTMLElement).style.borderColor = "#095f55";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#0B7A6B";
                      (e.currentTarget as HTMLElement).style.borderColor = "#0B7A6B";
                    }}
                  >
                    <Download size={16} color="#ffffff" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
