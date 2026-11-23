'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BookmarkCheck,
  BookOpen,
  Check,
  Columns2,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  Loader2,
  Search,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { exportBibliography, getExternalSearchLinks } from '@/lib/citations';
import {
  CitationStyle,
  ScholarPaper,
  SearchMode,
  SearchResponse,
  SortOption,
} from '@/types/scholar';
import { PaperCard } from '@/components/paper-card';
import { DownloadGuideModal } from '@/components/download-guide-modal';
import { RelatedPapersDrawer } from '@/components/related-papers-drawer';

const PdfSplitTranslator = dynamic(
  () =>
    import('@/components/pdf-split-translator').then((m) => m.PdfSplitTranslator),
  {
    ssr: false,
    loading: () => (
      <div className="py-24 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200">
        <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
        <span className="text-sm text-slate-600">Đang khởi tạo bộ đọc PDF.js...</span>
      </div>
    ),
  }
);

type ActiveTab = 'search' | 'translator' | 'library';

const SAMPLE_QUERIES: { label: string; q: string; mode: SearchMode }[] = [
  { label: 'Transformer Self-Attention', q: 'Attention Is All You Need transformer', mode: 'keyword' },
  { label: 'IEEE Smart Grid / Microgrid', q: 'microgrid voltage control', mode: 'keyword' },
  { label: 'Tác giả: Yann LeCun', q: 'Yann LeCun', mode: 'author' },
  { label: 'Tác giả: Kaiming He', q: 'Kaiming He', mode: 'author' },
  { label: 'Federated Learning IoT', q: 'federated learning edge IoT security', mode: 'keyword' },
];

export default function ScholarHubPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');

  // Search states
  const [query, setQuery] = useState<string>('');
  const [mode, setMode] = useState<SearchMode>('all');
  const [publisherFilter, setPublisherFilter] = useState<string>('all');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [onlyPdf, setOnlyPdf] = useState<boolean>(false);
  const [sort, setSort] = useState<SortOption>('relevance');

  const [searching, setSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

  // Saved References Library
  const [savedPapers, setSavedPapers] = useState<ScholarPaper[]>([]);
  const [bibStyle, setBibStyle] = useState<CitationStyle>('ieee');
  const [copiedBib, setCopiedBib] = useState<boolean>(false);

  // Modals & Translator Handoff
  const [guidePaper, setGuidePaper] = useState<ScholarPaper | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [relatedSeed, setRelatedSeed] = useState<ScholarPaper | null>(null);

  const [externalPdfRequest, setExternalPdfRequest] = useState<{
    url: string;
    alternateUrls?: string[];
    title?: string;
    paperUrl?: string;
    timestamp: number;
  } | null>(null);

  // Load saved library from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('scholarhub_saved_papers');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedPapers(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const persistLibrary = (next: ScholarPaper[]) => {
    setSavedPapers(next);
    try {
      localStorage.setItem('scholarhub_saved_papers', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const savedIds = useMemo(
    () => new Set(savedPapers.map((p) => p.id)),
    [savedPapers]
  );

  const handleToggleSave = useCallback(
    (paper: ScholarPaper) => {
      setSavedPapers((prev) => {
        const exists = prev.some((p) => p.id === paper.id);
        const next = exists
          ? prev.filter((p) => p.id !== paper.id)
          : [...prev, paper];
        try {
          localStorage.setItem('scholarhub_saved_papers', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    []
  );

  const executeSearch = useCallback(
    async (
      overrideQuery?: string,
      overrideMode?: SearchMode,
      overridePublisher?: string,
      overrideYear?: string,
      overrideOnlyPdf?: boolean,
      overrideSort?: SortOption
    ) => {
      const q = (overrideQuery !== undefined ? overrideQuery : query).trim();
      if (!q) return;

      const m = overrideMode ?? mode;
      const pub = overridePublisher ?? publisherFilter;
      const yr = overrideYear !== undefined ? overrideYear : yearFrom;
      const pdfOnly = overrideOnlyPdf !== undefined ? overrideOnlyPdf : onlyPdf;
      const srt = overrideSort ?? sort;

      setSearching(true);
      setSearchError(null);
      setActiveTab('search');

      try {
        const params = new URLSearchParams({
          q,
          mode: m,
          publisher: pub,
          onlyPdf: String(pdfOnly),
          sort: srt,
        });
        if (yr) params.set('yearFrom', yr);

        const res = await fetch(`/api/papers/search?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Lỗi khi tìm kiếm bài báo.');
        }
        setSearchResult(data);
      } catch (err: any) {
        setSearchError(err?.message || 'Không thể kết nối máy chủ tìm kiếm.');
      } finally {
        setSearching(false);
      }
    },
    [query, mode, publisherFilter, yearFrom, onlyPdf, sort]
  );

  const handleAuthorClick = useCallback(
    (authorName: string) => {
      setQuery(authorName);
      setMode('author');
      executeSearch(authorName, 'author');
    },
    [executeSearch]
  );

  const handleTranslatePaperPdf = useCallback(
    (paper: ScholarPaper, resolvedUrl?: string) => {
      const targetUrl = resolvedUrl || paper.pdfUrl;
      if (!targetUrl) {
        setGuidePaper(paper);
        setIsGuideOpen(true);
        return;
      }
      setGuidePaper(paper);
      setExternalPdfRequest({
        url: targetUrl,
        alternateUrls: paper.alternatePdfUrls,
        title: paper.title,
        paperUrl: paper.url,
        timestamp: Date.now(),
      });
      setActiveTab('translator');
    },
    []
  );

  const externalLinks = useMemo(
    () =>
      searchResult?.query
        ? getExternalSearchLinks(searchResult.query, searchResult.mode)
        : query.trim()
          ? getExternalSearchLinks(query.trim(), mode)
          : [],
    [searchResult, query, mode]
  );

  const fullBibliographyText = useMemo(
    () => exportBibliography(savedPapers, bibStyle),
    [savedPapers, bibStyle]
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimalist Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Logo */}
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className="flex items-center gap-2.5 text-left group"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs group-hover:bg-indigo-600 transition">
              <BookOpen className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm sm:text-base tracking-tight leading-none">
                ScholarFlow
              </div>
              <div className="text-[11px] text-slate-500 hidden sm:block mt-0.5">
                Tra cứu đa nguồn &bull; Trích dẫn &bull; Dịch PDF song song
              </div>
            </div>
          </button>

          {/* Main Workspace Tabs */}
          <nav className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                activeTab === 'search'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Tra cứu bài báo</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('translator')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                activeTab === 'translator'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>Dịch PDF Trái–Phải</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                activeTab === 'library'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Tài liệu tham khảo</span>
              <span className="md:hidden">Đã lưu</span>
              {savedPapers.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[11px]">
                  {savedPapers.length}
                </span>
              )}
            </button>
          </nav>

          {/* Right Help Button */}
          <button
            type="button"
            onClick={() => {
              setGuidePaper(null);
              setIsGuideOpen(true);
            }}
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 transition"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Mẹo tải bài bị khóa</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* ================================================================ */}
        {/* TAB 1: MULTI-SOURCE SCIENTIFIC SEARCH & CITATION                 */}
        {/* ================================================================ */}
        <div className={activeTab === 'search' ? 'space-y-6' : 'hidden'}>
          {/* Search Box Card */}
          <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                  Tìm kiếm Bài Báo &amp; Công Trình Nghiên Cứu Khoa Học
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Tổng hợp trực tiếp từ <strong>OpenAlex, IEEE / Crossref, Semantic Scholar, arXiv, Europe PMC</strong> và liên kết nhanh <strong>Google Scholar</strong>.
                </p>
              </div>

              {/* Search Mode Selector */}
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-medium">
                {(
                  [
                    { id: 'all', label: 'Tất cả' },
                    { id: 'keyword', label: 'Theo từ khóa' },
                    { id: 'author', label: 'Theo tên tác giả' },
                  ] as { id: SearchMode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      mode === m.id
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeSearch();
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="w-4.5 h-4.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    mode === 'author'
                      ? 'Nhập tên tác giả (VD: Geoffrey Hinton, Yann LeCun, Andrew Ng...)'
                      : 'Nhập chủ đề, từ khóa bài báo, DOI hoặc tên tác giả...'
                  }
                  className="w-full pl-11 pr-9 py-3 rounded-xl border border-slate-300 bg-white text-sm sm:text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={searching || !query.trim()}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shrink-0 transition shadow-xs"
              >
                {searching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tìm...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Tìm bài báo</span>
                  </>
                )}
              </button>
            </form>

            {/* Compact Filter Bar */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-medium text-slate-500">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Lọc:
                </span>

                <select
                  value={publisherFilter}
                  onChange={(e) => {
                    setPublisherFilter(e.target.value);
                    if (query.trim()) executeSearch(undefined, undefined, e.target.value);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none"
                >
                  <option value="all">Mọi nguồn xuất bản</option>
                  <option value="ieee">IEEE Xplore / Hội nghị IEEE</option>
                  <option value="springer_elsevier">Springer / Elsevier / Nature / ACM</option>
                  <option value="arxiv">arXiv Preprint (100% có PDF)</option>
                  <option value="pubmed">PubMed / Europe PMC</option>
                </select>

                <select
                  value={yearFrom}
                  onChange={(e) => {
                    setYearFrom(e.target.value);
                    if (query.trim()) executeSearch(undefined, undefined, undefined, e.target.value);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none"
                >
                  <option value="">Mọi năm xuất bản</option>
                  <option value="2025">Từ 2025 trở lại đây</option>
                  <option value="2023">Từ 2023 trở lại đây</option>
                  <option value="2020">Từ 2020 trở lại đây</option>
                  <option value="2015">Từ 2015 trở lại đây</option>
                </select>

                <select
                  value={sort}
                  onChange={(e) => {
                    const nextSort = e.target.value as SortOption;
                    setSort(nextSort);
                    if (query.trim())
                      executeSearch(undefined, undefined, undefined, undefined, undefined, nextSort);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none"
                >
                  <option value="relevance">Sắp xếp: Độ liên quan</option>
                  <option value="citations">Sắp xếp: Trích dẫn cao nhất</option>
                  <option value="newest">Sắp xếp: Mới nhất</option>
                </select>

                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyPdf}
                    onChange={(e) => {
                      setOnlyPdf(e.target.checked);
                      if (query.trim())
                        executeSearch(
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          e.target.checked
                        );
                    }}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>Chỉ bài có PDF tải ngay</span>
                </label>
              </div>

              {/* Sample Quick Queries when no search yet */}
              {!searchResult && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-400">Gợi ý:</span>
                  {SAMPLE_QUERIES.map((sq, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setQuery(sq.q);
                        setMode(sq.mode);
                        executeSearch(sq.q, sq.mode);
                      }}
                      className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition"
                    >
                      {sq.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* External Direct Search Portals Strip (Google Scholar, IEEE Xplore, ScienceDirect...) */}
          {externalLinks.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-600">
                  Mở trực tiếp từ khóa này trên cổng ngoài:
                </span>
                {externalLinks.map((ext) => (
                  <a
                    key={ext.name}
                    href={ext.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 font-medium transition"
                  >
                    <span>{ext.name}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
              {searchResult && (
                <div className="text-slate-400">
                  Đã gộp &amp; khử trùng lặp còn{' '}
                  <strong className="text-slate-700">{searchResult.papers.length}</strong> bài báo
                </div>
              )}
            </div>
          )}

          {/* Matched Author Banner (when searching by Author) */}
          {searchResult?.matchedAuthor && (
            <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-bold text-slate-900">
                    Hồ sơ tác giả: {searchResult.matchedAuthor.name}
                  </div>
                  <div className="text-xs text-slate-600">
                    {searchResult.matchedAuthor.affiliation || 'Cơ sở nghiên cứu học thuật'}
                    {typeof searchResult.matchedAuthor.worksCount === 'number' &&
                      ` • ${searchResult.matchedAuthor.worksCount.toLocaleString()} công trình`}
                    {typeof searchResult.matchedAuthor.citedByCount === 'number' &&
                      ` • ${searchResult.matchedAuthor.citedByCount.toLocaleString()} lượt trích dẫn`}
                  </div>
                </div>
              </div>
              {searchResult.matchedAuthor.orcid && (
                <a
                  href={searchResult.matchedAuthor.orcid}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100"
                >
                  <span>Hồ sơ ORCID</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {/* Error state */}
          {searchError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              {searchError}
            </div>
          )}

          {/* Loading Skeletons */}
          {searching && (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="p-5 rounded-2xl bg-white border border-slate-200 animate-pulse space-y-3"
                >
                  <div className="h-4 bg-slate-200 rounded w-1/4" />
                  <div className="h-5 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-12 bg-slate-100 rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {/* Initial Empty State Overview */}
          {!searching && !searchResult && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                  1. Đa nguồn &amp; Trích dẫn chuẩn
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Tìm theo Từ khóa hoặc Tác giả
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tự động quét song song IEEE / Crossref, OpenAlex, Semantic Scholar, arXiv và Europe PMC. Xuất trích dẫn chuẩn IEEE <code className="bg-slate-100 px-1 rounded">[1]</code>, APA 7th, MLA, BibTeX chỉ với 1 cú nhấp.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  2. Mở khóa &amp; Bài liên quan
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Hỗ trợ tải bài bị khóa tường phí
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tự động quét bản Preprint hợp pháp (Unpaywall, kho ĐH, arXiv) và hướng dẫn chi tiết 5 cách lấy PDF toàn văn kèm mẫu email xin bài từ tác giả, cộng danh sách các bài báo liên quan.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  3. Dịch PDF Trái – Phải (0đ)
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Trái: PDF Gốc &bull; Phải: Bản Dịch
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bấm <strong>&ldquo;Dịch PDF trực tiếp&rdquo;</strong> ngay trên kết quả tìm kiếm hoặc tải file từ máy. Hỗ trợ bài báo 2 cột chuẩn IEEE, giữ công thức toán học và đối chiếu vị trí từng đoạn.
                </p>
              </div>
            </div>
          )}

          {/* Results List */}
          {!searching && searchResult && (
            <div className="space-y-4">
              {searchResult.papers.length === 0 ? (
                <div className="p-12 rounded-2xl bg-white border border-slate-200 text-center space-y-2">
                  <p className="font-semibold text-slate-800">
                    Không tìm thấy bài báo khớp bộ lọc hiện tại.
                  </p>
                  <p className="text-xs text-slate-500">
                    Hãy thử bỏ chọn &ldquo;Chỉ bài có PDF tải ngay&rdquo;, mở rộng năm xuất bản hoặc bấm vào liên kết Google Scholar / IEEE Xplore ở thanh phía trên.
                  </p>
                </div>
              ) : (
                searchResult.papers.map((paper, idx) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    index={idx}
                    isSaved={savedIds.has(paper.id)}
                    onToggleSave={handleToggleSave}
                    onTranslatePdf={handleTranslatePaperPdf}
                    onOpenDownloadGuide={(p) => {
                      setGuidePaper(p);
                      setIsGuideOpen(true);
                    }}
                    onOpenRelated={(p) => setRelatedSeed(p)}
                    onAuthorClick={handleAuthorClick}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* TAB 2: SPLIT-SCREEN PDF TRANSLATOR (Kept Mounted!)               */}
        {/* ================================================================ */}
        <div className={activeTab === 'translator' ? 'block' : 'hidden'}>
          <PdfSplitTranslator
            externalPdfRequest={externalPdfRequest}
            onOpenDownloadGuide={() => setIsGuideOpen(true)}
          />
        </div>

        {/* ================================================================ */}
        {/* TAB 3: SAVED REFERENCES / BIBLIOGRAPHY BUILDER                   */}
        {/* ================================================================ */}
        <div className={activeTab === 'library' ? 'space-y-5' : 'hidden'}>
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Danh Mục Tài Liệu Tham Khảo Đã Lưu ({savedPapers.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Tự động đánh số và định dạng mục References cho bài báo khoa học, khóa luận hoặc file LaTeX (.bib).
                </p>
              </div>

              {savedPapers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {(['ieee', 'apa', 'mla', 'harvard', 'bibtex'] as CitationStyle[]).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setBibStyle(st)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition ${
                          bibStyle === st
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {st}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {savedPapers.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 space-y-2">
                <p>Chưa có bài báo nào trong danh mục tham khảo.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                >
                  Quay lại Tra cứu để lưu bài báo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase">
                    Bản xuất danh mục ({bibStyle.toUpperCase()}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(fullBibliographyText);
                        setCopiedBib(true);
                        setTimeout(() => setCopiedBib(false), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                    >
                      {copiedBib ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Đã copy toàn bộ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy toàn bộ References</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const ext = bibStyle === 'bibtex' ? 'bib' : 'txt';
                        const blob = new Blob([fullBibliographyText], {
                          type: 'text/plain;charset=utf-8',
                        });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `references-${bibStyle}.${ext}`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải file .{bibStyle === 'bibtex' ? 'bib' : 'txt'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => persistLibrary([])}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-red-600 hover:bg-red-50 text-xs font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa hết</span>
                    </button>
                  </div>
                </div>

                <pre className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
                  {fullBibliographyText}
                </pre>
              </div>
            )}
          </div>

          {/* Individual Saved Cards */}
          {savedPapers.map((p, idx) => (
            <PaperCard
              key={p.id}
              paper={p}
              index={idx}
              isSaved={true}
              onToggleSave={handleToggleSave}
              onTranslatePdf={handleTranslatePaperPdf}
              onOpenDownloadGuide={(paperItem) => {
                setGuidePaper(paperItem);
                setIsGuideOpen(true);
              }}
              onOpenRelated={(paperItem) => setRelatedSeed(paperItem)}
              onAuthorClick={handleAuthorClick}
            />
          ))}
        </div>
      </main>

      {/* Minimalist Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            <strong>ScholarFlow</strong> — Thiết kế tối ưu cho triển khai miễn phí trên Vercel (<code className="text-slate-700">.vercel.app</code>)
          </span>
          <span>
            Nguồn dữ liệu mở: OpenAlex &bull; Crossref (IEEE/Springer/Elsevier) &bull; Semantic Scholar &bull; arXiv &bull; Europe PMC &bull; Unpaywall
          </span>
        </div>
      </footer>

      {/* Download Guide Modal */}
      <DownloadGuideModal
        paper={guidePaper}
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onTranslatePdfUrl={(url, title, paperUrl) => {
          setExternalPdfRequest({
            url,
            title,
            paperUrl,
            timestamp: Date.now(),
          });
          setActiveTab('translator');
        }}
        onSwitchToTranslatorUpload={() => setActiveTab('translator')}
      />

      {/* Related Papers Slide-Over Drawer */}
      <RelatedPapersDrawer
        seedPaper={relatedSeed}
        savedIds={savedIds}
        onClose={() => setRelatedSeed(null)}
        onToggleSave={handleToggleSave}
        onTranslatePdf={handleTranslatePaperPdf}
        onOpenDownloadGuide={(p) => {
          setGuidePaper(p);
          setIsGuideOpen(true);
        }}
        onSelectAnotherRelated={(p) => setRelatedSeed(p)}
        onAuthorClick={handleAuthorClick}
      />
    </div>
  );
}
