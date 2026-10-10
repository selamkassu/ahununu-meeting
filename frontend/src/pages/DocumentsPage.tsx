import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Eye, Download, X, ExternalLink, Search, Trash2, AlertTriangle } from "lucide-react";
import { api, getToken, buildUrl } from "../api/client";
import type { DocumentItem } from "../types";
import { Card, CardHeader, EmptyState, CodeChip, Button } from "../components/ui/Primitives";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../context/AuthContext";

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
  const { user, hasPermission } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<DocumentItem | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "PDF" | "IMAGE" | "OFFICE" | "OTHER">("ALL");

  useEffect(() => {
    api
      .get<DocumentItem[]>("/meetings/documents-overview/all")
      .then(setDocuments)
      .catch(() => setError("Failed to load documents."))
      .finally(() => setLoading(false));
  }, []);

  const getDocCategory = (fileName: string): "PDF" | "IMAGE" | "OFFICE" | "OTHER" => {
    const ext = getExt(fileName);
    if (ext === "pdf") return "PDF";
    if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "IMAGE";
    if (["docx", "doc", "xlsx", "xls", "pptx", "ppt", "csv"].includes(ext)) return "OFFICE";
    return "OTHER";
  };

  const filteredDocuments = useMemo(() => {
    return documents.filter((d) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        d.fileName.toLowerCase().includes(q) ||
        d.meeting.title.toLowerCase().includes(q) ||
        d.meeting.code.toLowerCase().includes(q);
      const cat = getDocCategory(d.fileName);
      const matchesCategory = categoryFilter === "ALL" || cat === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [documents, search, categoryFilter]);

  const pdfCount = useMemo(() => documents.filter((d) => getDocCategory(d.fileName) === "PDF").length, [documents]);
  const imgCount = useMemo(() => documents.filter((d) => getDocCategory(d.fileName) === "IMAGE").length, [documents]);
  const officeCount = useMemo(() => documents.filter((d) => getDocCategory(d.fileName) === "OFFICE").length, [documents]);

  const canDeleteDoc = (d: DocumentItem) => {
    if (hasPermission("ADMIN_OVERRIDE")) return true;
    if (hasPermission("documents:delete")) return true;
    if (hasPermission("meetings:edit:all")) return true;
    if (user?.id === d.uploadedBy?.id || (d.meeting.organizerId && user?.id === d.meeting.organizerId)) return true;
    return false;
  };

  const handleDelete = async (doc: DocumentItem) => {
    setDeleting(true);
    try {
      await api.delete(`/meetings/${doc.meeting.id}/documents/${doc.id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setDocumentToDelete(null);
    } catch (err: any) {
      setError(err.message || "Failed to delete document.");
    } finally {
      setDeleting(false);
    }
  };

  // Smart open: PDFs/images show inline modal; Office files download directly
  const handleView = (d: DocumentItem) => {
    const ext = getExt(d.fileName);
    if (INLINE_VIEWABLE.includes(ext)) {
      setViewing(d);
    } else {
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

      {/* Delete Confirmation Modal */}
      {documentToDelete && (
        <Modal
          open
          onClose={() => { if (!deleting) setDocumentToDelete(null); }}
          title="Delete Attached Document"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-rose-50/80 border border-rose-200/70 p-3.5">
              <AlertTriangle className="shrink-0 text-rose-600 mt-0.5" size={20} />
              <div className="text-xs">
                <p className="font-semibold text-rose-900">
                  Delete &lsquo;{documentToDelete.fileName}&rsquo;?
                </p>
                <p className="mt-1 text-rose-700">
                  Meeting: <span className="font-medium">{documentToDelete.meeting.title}</span> ({documentToDelete.meeting.code})
                </p>
                <p className="mt-2 text-rose-800/90 leading-relaxed">
                  This action removes the document attachment from the meeting. The file record will be unlinked.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate2-100 pt-3">
              <Button
                variant="secondary"
                onClick={() => setDocumentToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(documentToDelete)}
                disabled={deleting}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deleting ? "Deleting..." : "Delete Document"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <Card>
        <CardHeader
          title="Documents"
          subtitle="Files attached to meetings across Ahununu Logistics — attach from a meeting's page"
        />

        {/* Search & Category Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate2-100 bg-slate2-50/50 px-5 py-3 text-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by file name or meeting..."
              className="w-full rounded-xl border border-slate2-200 bg-white py-2 pl-9 pr-8 text-xs text-slate2-800 placeholder:text-slate2-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-2xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate2-400 hover:text-slate2-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setCategoryFilter("ALL")}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                categoryFilter === "ALL"
                  ? "bg-[#0B7A6B] text-white shadow-2xs font-semibold"
                  : "bg-white text-slate2-600 border border-slate2-200 hover:bg-slate2-50"
              }`}
            >
              All ({documents.length})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("PDF")}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                categoryFilter === "PDF"
                  ? "bg-rose-700 text-white shadow-2xs font-semibold"
                  : "bg-white text-rose-800 border border-rose-200 hover:bg-rose-50"
              }`}
            >
              PDFs ({pdfCount})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("IMAGE")}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                categoryFilter === "IMAGE"
                  ? "bg-sky-700 text-white shadow-2xs font-semibold"
                  : "bg-white text-sky-800 border border-sky-200 hover:bg-sky-50"
              }`}
            >
              Images ({imgCount})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("OFFICE")}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                categoryFilter === "OFFICE"
                  ? "bg-amber-700 text-white shadow-2xs font-semibold"
                  : "bg-white text-amber-800 border border-amber-200 hover:bg-amber-50"
              }`}
            >
              Docs & Sheets ({officeCount})
            </button>
          </div>
        </div>

        {error && (
          <p className="px-5 py-2 text-xs font-medium text-red-600">{error}</p>
        )}

        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate2-100" />
            ))}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <EmptyState
            title={documents.length === 0 ? "No documents attached yet" : "No documents match your filter"}
            description={
              documents.length === 0
                ? "Attach presentation decks, reports or reference files from any meeting's page."
                : "Try clearing your search query or choosing another category."
            }
            action={
              documents.length > 0 ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setCategoryFilter("ALL");
                  }}
                  className="mt-2 text-xs"
                >
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-slate2-100">
            {filteredDocuments.map((d) => (
              <div key={d.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate2-50/50 transition-colors">
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
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <Link
                      to={`/meetings/${d.meeting.id}`}
                      className="flex items-center gap-1.5 text-xs text-slate2-500 hover:text-brand"
                    >
                      {d.meeting.title} <CodeChip>{d.meeting.code}</CodeChip>
                    </Link>
                    <span className="text-[11px] text-slate2-400">
                      · {formatSize(d.fileSize)} · {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Eye — view inline (or download for Office files) */}
                  <button
                    type="button"
                    onClick={() => handleView(d)}
                    title={INLINE_VIEWABLE.includes(getExt(d.fileName)) ? "Preview inline" : "Open file"}
                    style={{
                      width: 34, height: 34,
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
                    <Eye size={15} color="#475569" />
                  </button>

                  {/* Download — always export/save */}
                  <button
                    type="button"
                    onClick={() => handleDownload(d)}
                    title="Export / Download"
                    style={{
                      width: 34, height: 34,
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
                    <Download size={15} color="#ffffff" />
                  </button>

                  {/* Delete Document */}
                  {canDeleteDoc(d) && (
                    <button
                      type="button"
                      onClick={() => setDocumentToDelete(d)}
                      title="Delete document attachment"
                      style={{
                        width: 34, height: 34,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 8, border: "1.5px solid #fecdd3",
                        background: "#fff1f2", cursor: "pointer", flexShrink: 0,
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "#ffe4e6";
                        (e.currentTarget as HTMLElement).style.borderColor = "#fda4af";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "#fff1f2";
                        (e.currentTarget as HTMLElement).style.borderColor = "#fecdd3";
                      }}
                    >
                      <Trash2 size={15} color="#e11d48" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
