'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, GitBranch, Loader2, X } from 'lucide-react';
import { ScholarPaper } from '@/types/scholar';
import { PaperCard } from '@/components/paper-card';

interface RelatedPapersDrawerProps {
  seedPaper: ScholarPaper | null;
  savedIds: Set<string>;
  onClose: () => void;
  onToggleSave: (paper: ScholarPaper) => void;
  onTranslatePdf: (paper: ScholarPaper, resolvedUrl?: string) => void;
  onOpenDownloadGuide: (paper: ScholarPaper) => void;
  onSelectAnotherRelated: (paper: ScholarPaper) => void;
  onAuthorClick: (authorName: string) => void;
}

export function RelatedPapersDrawer({
  seedPaper,
  savedIds,
  onClose,
  onToggleSave,
  onTranslatePdf,
  onOpenDownloadGuide,
  onSelectAnotherRelated,
  onAuthorClick,
}: RelatedPapersDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [related, setRelated] = useState<ScholarPaper[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seedPaper) return;
    let active = true;
    setLoading(true);
    setError(null);
    setRelated([]);

    fetch('/api/papers/related', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: seedPaper.title,
        doi: seedPaper.doi,
        openAlexId: seedPaper.openAlexId,
        semanticScholarId: seedPaper.semanticScholarId,
        arxivId: seedPaper.arxivId,
        concepts: seedPaper.concepts,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data?.papers)) {
          setRelated(data.papers);
        } else {
          setError(data?.error || 'Không tải được bài báo liên quan.');
        }
      })
      .catch(() => {
        if (active) setError('Không thể kết nối máy chủ tìm bài liên quan.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [seedPaper]);

  if (!seedPaper) return null;

  const scholarRelatedUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(
    `related:${seedPaper.title}`
  )}`;
  const scholarTitleUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(
    seedPaper.title
  )}`;
  const ieeeRelatedUrl = `https://ieeexplore.ieee.org/search/searchresult.jsp?newsearch=true&queryText=${encodeURIComponent(
    seedPaper.title.split(/\s+/).slice(0, 7).join(' ')
  )}`;
  const connectedPapersUrl = seedPaper.doi
    ? `https://www.connectedpapers.com/search?q=${encodeURIComponent(seedPaper.doi)}`
    : `https://www.connectedpapers.com/search?q=${encodeURIComponent(seedPaper.title)}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex justify-end">
      <div className="bg-slate-50 w-full max-w-3xl h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
              <GitBranch className="w-3.5 h-3.5" />
              <span>Các bài báo liên quan &amp; trích dẫn cùng chủ đề</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2">
              Gốc: {seedPaper.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* External Cross-Source Links Bar */}
        <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Mở rộng trên:</span>
          <a
            href={scholarTitleUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-indigo-600 font-medium"
          >
            <span>Google Scholar</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={ieeeRelatedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-blue-600 font-medium"
          >
            <span>IEEE Xplore</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={connectedPapersUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-emerald-700 font-medium"
          >
            <span>Connected Papers (Đồ thị)</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={scholarRelatedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-indigo-600 font-medium"
          >
            <span>Bài tương tự Scholar</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
              <p className="text-sm font-medium">
                Đang tổng hợp bài báo liên quan từ OpenAlex, Semantic Scholar, IEEE/Crossref &amp; arXiv...
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && related.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-500">
              Chưa tìm thấy bài liên quan trực tiếp trong CSDL mở. Bạn có thể bấm các nút Google Scholar / IEEE Xplore phía trên để xem thêm.
            </div>
          )}

          {!loading &&
            related.map((p, idx) => (
              <PaperCard
                key={p.id}
                paper={p}
                index={idx}
                isSaved={savedIds.has(p.id)}
                onToggleSave={onToggleSave}
                onTranslatePdf={(paperObj, url) => {
                  onClose();
                  onTranslatePdf(paperObj, url);
                }}
                onOpenDownloadGuide={onOpenDownloadGuide}
                onOpenRelated={onSelectAnotherRelated}
                onAuthorClick={(author) => {
                  onClose();
                  onAuthorClick(author);
                }}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
