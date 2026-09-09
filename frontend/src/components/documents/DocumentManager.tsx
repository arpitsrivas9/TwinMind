"use client";

import React, { useState, useEffect, useRef } from "react";
import { useCognitiveActivity } from "../../context/CognitiveContext";
import { TwinMindHeartbeat } from "../motion/TwinMindHeartbeat";
import {
  Document,
  SearchResultItem,
  listDocuments,
  uploadDocument,
  deleteDocument,
  reprocessDocument,
  searchKnowledge,
} from "../../lib/api";

export function DocumentManager() {
  const { startSearching, startProcessing, triggerSuccess, triggerError, setIdle } = useCognitiveActivity();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"documents" | "search">("documents");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);

  // Deletion confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const res = await listDocuments({ limit: 50 });
      setDocuments(res.documents);
    } catch {
      // Ignore initial load error if unauthenticated
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Auto-poll if any document is currently PROCESSING or UPLOADED
  useEffect(() => {
    const hasInFlight = documents.some(
      (d) => d.status === "PROCESSING" || d.status === "UPLOADED"
    );
    if (!hasInFlight) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    startProcessing();

    try {
      await uploadDocument(file);
      await fetchDocuments();
      triggerSuccess();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      triggerError();
      const error = err as { message?: string };
      setUploadError(error?.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setDeletingId(null);
      triggerSuccess();
    } catch {
      // Ignore delete error
    }
  };

  const handleReprocess = async (id: string) => {
    startProcessing();
    try {
      await reprocessDocument(id);
      await fetchDocuments();
      triggerSuccess();
    } catch {
      triggerError();
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searching) return;

    setSearching(true);
    setSearched(true);
    startSearching();
    try {
      const res = await searchKnowledge(searchQuery.trim(), 5);
      setSearchResults(res.results);
      triggerSuccess();
    } catch {
      setSearchResults([]);
      triggerError();
    } finally {
      setSearching(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string, filename: string) => {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".pdf") || mimeType.includes("pdf")) return "📕";
    if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "📘";
    if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) return "📙";
    if (mimeType.startsWith("video/") || lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) return "🎬";
    if (mimeType.startsWith("image/") || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".webp")) return "🖼️";
    return "📄";
  };

  const readyCount = documents.filter((d) => d.status === "READY").length;
  const processingCount = documents.filter((d) => d.status === "PROCESSING" || d.status === "UPLOADED").length;

  return (
    <div className="space-y-6">
      {/* Top Bar with Navigation Tabs and Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "documents"
                ? "bg-cyan-500/10 text-cyan-200 border border-cyan-500/30"
                : "text-text-muted hover:text-text-primary hover:bg-surface-2"
            }`}
          >
            Documents & Media ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("search")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "search"
                ? "bg-cyan-500/10 text-cyan-200 border border-cyan-500/30"
                : "text-text-muted hover:text-text-primary hover:bg-surface-2"
            }`}
          >
            TwinSearch™ Explorer
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400" />
            <span>{readyCount} Indexed</span>
          </span>
          {processingCount > 0 && (
            <span className="flex items-center gap-1.5 text-amber-300">
              <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
              <span>{processingCount} Processing</span>
            </span>
          )}
        </div>
      </div>

      {/* TAB 1: DOCUMENTS MANAGEMENT */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          {/* Upload Dropzone */}
          <div className="rounded-xl border border-dashed border-border-default bg-surface-1/60 p-6 text-center transition-colors hover:border-cyan-400/40">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".pdf,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov,.mkv,.mp3,.wav,.txt,.md,.csv,.json"
              className="hidden"
              id="file-upload-input"
            />
            <label
              htmlFor="file-upload-input"
              className="cursor-pointer flex flex-col items-center justify-center gap-2"
            >
              <div className="flex size-12 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-2xl text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.15)]">
                {uploading ? "⏳" : "📤"}
              </div>
              <p className="text-sm font-semibold text-text-primary">
                {uploading ? "Uploading and processing knowledge source…" : "Upload Knowledge Source"}
              </p>
              <p className="text-xs text-text-muted max-w-md">
                Supported: PDF, DOCX, PPTX, Images (OCR), Videos (MP4, WEBM), Audio, TXT, Markdown (up to 25MB).
              </p>
            </label>

            {uploadError && (
              <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                {uploadError}
              </div>
            )}
          </div>

          {/* Document List */}
          {loading ? (
            <div className="py-12 text-center text-xs text-text-muted">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mr-2" />
              Loading knowledge sources…
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface-1/40 p-8 text-center">
              <p className="text-sm font-medium text-text-secondary">No documents uploaded yet</p>
              <p className="mt-1 text-xs text-text-muted">
                Upload your project documentation, architecture notes, presentations, or walkthrough videos above.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-1/90">
              <div className="divide-y divide-border-subtle/50">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-surface-2/40"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl" aria-hidden="true">
                        {getFileIcon(doc.mimeType, doc.originalFilename)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-text-primary leading-tight">
                          {doc.originalFilename}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                          <span>{formatFileSize(doc.fileSize)}</span>
                          <span>•</span>
                          <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                          {doc.pageCount && (
                            <>
                              <span>•</span>
                              <span>{doc.pageCount} pages/slides</span>
                            </>
                          )}
                          {doc._count?.chunks !== undefined && (
                            <>
                              <span>•</span>
                              <span className="text-cyan-300">{doc._count.chunks} chunks</span>
                            </>
                          )}
                        </div>
                        {doc.processingError && (
                          <p className="mt-1 text-xs text-rose-300">
                            Error: {doc.processingError}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {/* Status Badges */}
                      {doc.status === "READY" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                          <span className="size-1.5 rounded-full bg-emerald-400" />
                          Ready
                        </span>
                      )}
                      {doc.status === "PROCESSING" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                          <TwinMindHeartbeat size="xs" />
                          Processing…
                        </span>
                      )}
                      {doc.status === "UPLOADED" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
                          Uploaded
                        </span>
                      )}
                      {doc.status === "FAILED" && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
                            Failed
                          </span>
                          <button
                            type="button"
                            onClick={() => handleReprocess(doc.id)}
                            className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {/* Delete Button */}
                      {deletingId === doc.id ? (
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            type="button"
                            onClick={() => handleDelete(doc.id)}
                            className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="rounded px-2 py-1 text-xs text-text-muted hover:bg-surface-2"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingId(doc.id)}
                          className="rounded p-1.5 text-xs text-text-muted hover:text-rose-400 hover:bg-surface-2"
                          aria-label={`Delete ${doc.originalFilename}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TWINSEARCH™ EXPLORER */}
      {activeTab === "search" && (
        <div className="space-y-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across all your indexed documents (e.g. 'authentication architecture', 'JWT rotation')..."
              className="flex-1 rounded-xl border border-border-default bg-surface-1/90 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted backdrop-blur-md transition-all duration-200 focus-visible:border-cyan-400/80 focus-visible:shadow-[0_0_20px_rgba(6,182,212,0.18)] focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-6 py-2.5 text-xs font-semibold text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.25)] transition-all hover:shadow-[0_0_22px_rgba(6,182,212,0.45)] hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {searching ? (
            <div className="relative flex flex-col items-center justify-center py-16 overflow-hidden rounded-2xl border border-cyan-500/20 bg-surface-1/40 backdrop-blur-sm">
              <div className="absolute size-48 rounded-full border border-cyan-400/20 animate-ping opacity-30" />
              <div className="absolute size-24 rounded-full border border-cyan-400/40 animate-pulse opacity-40" />
              <TwinMindHeartbeat size="md" />
              <p className="mt-4 text-xs font-mono tracking-wide text-cyan-300">
                Retrieving semantic embeddings & relevant knowledge chunks…
              </p>
            </div>
          ) : searched && searchResults.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface-1/40 p-8 text-center text-xs text-text-muted">
              No matching knowledge chunks found for &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.map((result, idx) => (
                <div
                  key={result.chunkId || idx}
                  className="rounded-xl border border-border-subtle bg-surface-1/90 p-4 transition-colors hover:border-cyan-400/30"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border-subtle/50 pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-cyan-200">
                        {result.documentTitle}
                      </span>
                      {result.pageNumber && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.2 text-[10px] font-mono text-text-secondary border border-border-subtle">
                          Page {result.pageNumber}
                        </span>
                      )}
                      {result.slideNumber && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.2 text-[10px] font-mono text-text-secondary border border-border-subtle">
                          Slide {result.slideNumber}
                        </span>
                      )}
                      {result.timestamp && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.2 text-[10px] font-mono text-cyan-300 border border-border-subtle">
                          [{result.timestamp}]
                        </span>
                      )}
                    </div>
                    <span className="rounded-full bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-mono text-accent-cyan">
                      {Math.round(result.score * 100)}% Match
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                    {result.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

