'use client';

import React, { useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  GitBranch,
  HelpCircle,
  Languages,
  Loader2,
  Lock,
  Quote,
  Search,
} from 'lucide-react';
import { formatCitation } from '@/lib/citations';
import { CitationStyle, PublisherBadge, ScholarPaper } from '@/types/scholar';

interface PaperCardProps {
  paper: ScholarPaper;
  index: number;
  isSaved: boolean;
  onToggleSave: (paper: ScholarPaper) => void;
  onTranslatePdf: (paper: ScholarPaper, resolvedUrl?: string) => void;
  onOpenDownloadGuide: (paper: ScholarPaper) => void;
  onOpenRelated: (paper: ScholarPaper) => void;
  onAuthorClick: (authorName: string) => void;
}

const BADGE_STYLES: Record<PublisherBadge, string> = {
  IEEE: 'bg-blue-50 text-blue-700 border-blue-200',
  Springer: 'bg-amber-50 text-amber-800 border-amber-200',
  Elsevier: 'bg-orange-50 text-orange-700 border-orange-200',
  Nature: 'bg-rose-50 text-rose-700 border-rose-200',
  ACM: 'bg-sky-50 text-sky-700 border-sky-200',
  Wiley: 'bg-purple-50 text-purple-700 border-purple-200',
  MDPI: 'bg-teal-50 text-teal-700 border-teal-200',
  arXiv: 'bg-red-50 text-red-700 border-red-200',
  PubMed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Academic: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function PaperCard({
  paper,
  index,
  isSaved,
  onToggleSave,
  onTranslatePdf,
  onOpenDownloadGuide,
  onOpenRelated,
  onAuthorClick,
}: PaperCardProps) {
  const [showCitation, setShowCitation] = useState(false);
  const [citeStyle, setCiteStyle] = useState<CitationStyle>('ieee');
  const [copiedCite, setCopiedCite] = useState(false);
  const [expandAbstract, setExpandAbstract] = useState(false);

  const [translatedAbstract, setTranslatedAbstract] = useState<string | null>(null);
  const [translatingAbs, setTranslatingAbs] = useState(false);

  const [resolvedPdfUrl, setResolvedPdfUrl] = useState<string | null>(paper.pdfUrl);
  const [scanningPdf, setScanningPdf] = useState(false);
  const [scanAttempted, setScanAttempted] = useState(false);

  const activePdfUrl = resolvedPdfUrl || paper.pdfUrl;
  const citationText = formatCitation(paper, citeStyle, index + 1);
  const scholarLookupUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(
    paper.title
  )}`;

  const handleQuickTranslateAbstract = async () => {
    if (!paper.abstract || translatingAbs) return;
    if (translatedAbstract) {
      setTranslatedAbstract(null);
      return;
    }
    setTranslatingAbs(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: [paper.abstract],
          targetLang: 'vi',
          engine: 'free-google',
        }),
      });
      const data = await res.json();
      if (res.ok && data?.translations?.[0]) {
        setTranslatedAbstract(data.translations[0]);
        setExpandAbstract(true);
      }
    } catch {
      // ignore
    } finally {
      setTranslatingAbs(false);
    }
  };

  const handleScanOpenAccess = async () => {
    setScanningPdf(true);
    try {
      const res = await fetch('/api/papers/resolve-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doi: paper.doi, title: paper.title }),
      });
      const data = await res.json();
      if (data?.candidates?.[0]?.url) {
        setResolvedPdfUrl(data.candidates[0].url);
      } else {
        setScanAttempted(true);
        onOpenDownloadGuide(paper);
      }
    } catch {
      setScanAttempted(true);
      onOpenDownloadGuide(paper);
    } finally {
      setScanningPdf(false);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition shadow-2xs space-y-3">
      {/* Top Meta Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-full font-semibold border ${
              BADGE_STYLES[paper.publisherBadge]
            }`}
          >
            {paper.publisherBadge}
          </span>
          {paper.year && (
            <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
              {paper.year}
            </span>
          )}
          {paper.venue && (
            <span className="text-slate-500 truncate max-w-[260px] sm:max-w-[380px]">
              {paper.venue}
            </span>
          )}
          {paper.citationCount > 0 && (
            <span className="text-slate-500 font-medium">
              &bull; {paper.citationCount.toLocaleString()} trích dẫn
            </span>
          )}
        </div>

        {/* Availability Pill */}
        <div>
          {activePdfUrl ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
              <FileCheck2 className="w-3.5 h-3.5" />
              Có PDF trực tiếp
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium">
              <Lock className="w-3 h-3" />
              Cần mở khóa / Tường phí
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
        <a
          href={paper.url || scholarLookupUrl}
          target="_blank"
          rel="noreferrer"
          className="hover:text-indigo-600 transition inline-flex items-baseline gap-1.5"
        >
          <span>{paper.title}</span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-400 inline" />
        </a>
      </h3>

      {/* Authors (Clickable to search by author!) */}
      {paper.authors.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-600">
          <span className="text-slate-400">Tác giả:</span>
          {paper.authors.slice(0, 6).map((author, idx) => (
            <React.Fragment key={idx}>
              <button
                type="button"
                onClick={() => onAuthorClick(author.name)}
                className="hover:text-indigo-600 hover:underline font-medium transition"
                title={`Tìm tất cả bài báo của tác giả ${author.name}`}
              >
                {author.name}
              </button>
              {idx < Math.min(paper.authors.length, 6) - 1 && <span>,</span>}
            </React.Fragment>
          ))}
          {paper.authors.length > 6 && (
            <span className="text-slate-400">+{paper.authors.length - 6} tác giả khác</span>
          )}
        </div>
      )}

      {/* Abstract + Instant Vietnamese Summary Translation */}
      {paper.abstract && (
        <div className="space-y-1.5">
          <p
            className={`text-xs sm:text-sm text-slate-600 leading-relaxed ${
              expandAbstract ? '' : 'line-clamp-2'
            }`}
          >
            {paper.abstract}
          </p>

          {translatedAbstract && (
            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs sm:text-sm text-slate-800 leading-relaxed">
              <span className="font-semibold text-indigo-700 mr-1.5">[Dịch tóm tắt]:</span>
              {translatedAbstract}
            </div>
          )}

          <div className="flex items-center gap-3 text-xs">
            {paper.abstract.length > 180 && (
              <button
                type="button"
                onClick={() => setExpandAbstract((e) => !e)}
                className="text-slate-500 hover:text-slate-800 font-medium"
              >
                {expandAbstract ? 'Thu gọn tóm tắt' : 'Xem toàn bộ tóm tắt'}
              </button>
            )}
            <button
              type="button"
              onClick={handleQuickTranslateAbstract}
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {translatingAbs ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Languages className="w-3 h-3" />
              )}
              <span>{translatedAbstract ? 'Ẩn dịch tóm tắt' : 'Dịch nhanh tóm tắt'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Links & Primary Actions Toolbar */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* PDF Direct Translate & Download OR How-to-Download */}
          {activePdfUrl ? (
            <>
              <button
                type="button"
                onClick={() => onTranslatePdf(paper, activePdfUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xs transition"
              >
                <Languages className="w-3.5 h-3.5" />
                <span>Dịch PDF trực tiếp</span>
              </button>
              <a
                href={activePdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-medium transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải PDF</span>
              </a>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenDownloadGuide(paper)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold transition"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Cách tải bài này</span>
              </button>
              {!scanAttempted && (
                <button
                  type="button"
                  onClick={handleScanOpenAccess}
                  disabled={scanningPdf}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition"
                  title="Tự động quét kho lưu trữ đại học, Unpaywall và arXiv xem có bản miễn phí không"
                >
                  {scanningPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Quét PDF mở</span>
                </button>
              )}
            </>
          )}

          {/* Citation Button */}
          <button
            type="button"
            onClick={() => setShowCitation((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
              showCitation
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <Quote className="w-3.5 h-3.5" />
            <span>Trích dẫn</span>
          </button>

          {/* Related Papers Button */}
          <button
            type="button"
            onClick={() => onOpenRelated(paper)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium transition"
          >
            <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
            <span>Bài liên quan</span>
          </button>
        </div>

        {/* Right Quick Links: Original / Google Scholar / Save Reference */}
        <div className="flex items-center gap-2 text-xs">
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-mono text-[11px] transition"
              title={`DOI: ${paper.doi}`}
            >
              DOI
            </a>
          )}
          <a
            href={scholarLookupUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 font-medium transition"
            title="Xem trên Google Scholar"
          >
            Scholar ↗
          </a>
          <button
            type="button"
            onClick={() => onToggleSave(paper)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-medium transition ${
              isSaved
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Lưu vào danh mục Tài liệu tham khảo"
          >
            {isSaved ? (
              <>
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>Đã lưu</span>
              </>
            ) : (
              <>
                <Bookmark className="w-3.5 h-3.5" />
                <span>Lưu</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expandable Citation Drawer */}
      {showCitation && (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(['ieee', 'apa', 'mla', 'harvard', 'bibtex'] as CitationStyle[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setCiteStyle(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase transition ${
                    citeStyle === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(citationText);
                setCopiedCite(true);
                setTimeout(() => setCopiedCite(false), 1800);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
            >
              {copiedCite ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Đã sao chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy trích dẫn</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
            {citationText}
          </pre>
        </div>
      )}
    </article>
  );
}
