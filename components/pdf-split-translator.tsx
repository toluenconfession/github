'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileUp,
  KeyRound,
  Languages,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { extractAcademicBlocksFromItems } from '@/lib/pdf-layout-parser';
import {
  PdfTextBlock,
  TranslatedPageData,
  TranslationEngine,
} from '@/types/scholar';

interface PdfSplitTranslatorProps {
  externalPdfRequest?: {
    url: string;
    alternateUrls?: string[];
    title?: string;
    paperUrl?: string;
    timestamp: number;
  } | null;
  onOpenDownloadGuide?: () => void;
}

export function PdfSplitTranslator({
  externalPdfRequest,
  onOpenDownloadGuide,
}: PdfSplitTranslatorProps) {
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [docTitle, setDocTitle] = useState<string>('');
  const [sourcePaperUrl, setSourcePaperUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.15);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [splitPercent, setSplitPercent] = useState<number>(50);

  const [loadingPdf, setLoadingPdf] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>('');

  const [targetLang, setTargetLang] = useState<string>('vi');
  const [engine, setEngine] = useState<TranslationEngine>('free-google');
  const [bilingual, setBilingual] = useState<boolean>(false);
  const [autoTranslatePage, setAutoTranslatePage] = useState<boolean>(true);
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);

  const [pagesCache, setPagesCache] = useState<Record<number, TranslatedPageData>>({});
  const [translatingAll, setTranslatingAll] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeYRatio, setActiveYRatio] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any | null>(null);
  const cancelBatchRef = useRef<boolean>(false);
  const draggingSplitRef = useRef<boolean>(false);

  // Restore saved Gemini key if present
  useEffect(() => {
    try {
      const saved = localStorage.getItem('scholarhub_gemini_key');
      if (saved) setGeminiKey(saved);
    } catch {
      // ignore
    }
  }, []);

  const loadPdfFromArrayBuffer = useCallback(
    async (buffer: ArrayBuffer, title: string, originUrl?: string | null) => {
      setLoadingPdf(true);
      setPdfError(null);
      cancelBatchRef.current = true;
      setTranslatingAll(false);
      setBatchProgress(null);

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(buffer),
          cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
        });
        const loadedDoc = await loadingTask.promise;

        setPdfDoc(loadedDoc);
        setDocTitle(title);
        setSourcePaperUrl(originUrl || null);
        setNumPages(loadedDoc.numPages);
        setCurrentPage(1);
        setPagesCache({});
        setActiveYRatio(null);
      } catch (err: any) {
        setPdfError(
          err?.message ||
            'Không thể đọc cấu trúc file PDF này. Vui lòng kiểm tra lại tệp tin.'
        );
      } finally {
        setLoadingPdf(false);
      }
    },
    []
  );

  const loadPdfFromRemoteUrls = useCallback(
    async (urls: string[], title?: string, paperUrl?: string) => {
      const validUrls = urls.filter(Boolean);
      if (validUrls.length === 0) return;

      setLoadingPdf(true);
      setPdfError(null);
      setSourcePaperUrl(paperUrl || validUrls[0]);

      let lastErr = 'Không thể tải trực tiếp PDF từ đường dẫn này.';
      for (const candidate of validUrls) {
        try {
          const res = await fetch(`/api/pdf-proxy?url=${encodeURIComponent(candidate)}`);
          if (!res.ok) {
            const errJson = await res.json().catch(() => null);
            lastErr = errJson?.error || `Máy chủ trả về lỗi ${res.status}.`;
            continue;
          }
          const buf = await res.arrayBuffer();
          await loadPdfFromArrayBuffer(
            buf,
            title || candidate.split('/').pop() || 'Bài báo khoa học.pdf',
            paperUrl || candidate
          );
          return;
        } catch (e: any) {
          lastErr = e?.message || lastErr;
        }
      }

      setLoadingPdf(false);
      setPdfError(lastErr);
    },
    [loadPdfFromArrayBuffer]
  );

  // Listen for incoming "Dịch PDF" clicks from the Search / Related tab
  useEffect(() => {
    if (!externalPdfRequest?.url) return;
    const allUrls = [
      externalPdfRequest.url,
      ...(externalPdfRequest.alternateUrls || []),
    ];
    loadPdfFromRemoteUrls(
      allUrls,
      externalPdfRequest.title,
      externalPdfRequest.paperUrl
    );
  }, [externalPdfRequest, loadPdfFromRemoteUrls]);

  // Render current PDF page onto Left Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled || !canvasRef.current) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = page.render({
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF Render error:', err);
        }
      }
    };

    renderPage();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, zoom]);

  // Extract & Translate a single page
  const translatePageNumber = useCallback(
    async (pageNum: number, forceRetranslate = false) => {
      if (!pdfDoc) return;
      const cached = pagesCache[pageNum];
      if (!forceRetranslate && cached && (cached.status === 'done' || cached.status === 'translating')) {
        return;
      }

      setPagesCache((prev) => ({
        ...prev,
        [pageNum]: {
          pageNumber: pageNum,
          blocks: prev[pageNum]?.blocks || [],
          status: 'extracting',
        },
      }));

      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();
        const extractedBlocks: PdfTextBlock[] = extractAcademicBlocksFromItems(
          textContent.items || [],
          viewport.width,
          viewport.height,
          pageNum
        );

        if (extractedBlocks.length === 0) {
          setPagesCache((prev) => ({
            ...prev,
            [pageNum]: {
              pageNumber: pageNum,
              blocks: [],
              status: 'done',
            },
          }));
          return;
        }

        setPagesCache((prev) => ({
          ...prev,
          [pageNum]: {
            pageNumber: pageNum,
            blocks: extractedBlocks,
            status: 'translating',
          },
        }));

        // Equations and Reference items can optionally skip translation or translate cleanly
        const indicesToTranslate: number[] = [];
        const textsToSend: string[] = [];

        extractedBlocks.forEach((b, idx) => {
          if (b.type === 'equation') return;
          indicesToTranslate.push(idx);
          textsToSend.push(b.original);
        });

        if (textsToSend.length === 0) {
          setPagesCache((prev) => ({
            ...prev,
            [pageNum]: {
              pageNumber: pageNum,
              blocks: extractedBlocks.map((b) => ({ ...b, translated: b.original })),
              status: 'done',
            },
          }));
          return;
        }

        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: textsToSend,
            targetLang,
            engine,
            geminiApiKey: engine === 'gemini' ? geminiKey : undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Lỗi máy chủ dịch thuật.');
        }

        const translatedList: string[] = data.translations || [];
        const finalBlocks = extractedBlocks.map((b) => ({ ...b, translated: b.original }));
        indicesToTranslate.forEach((blockIdx, i) => {
          finalBlocks[blockIdx] = {
            ...finalBlocks[blockIdx],
            translated: translatedList[i] || finalBlocks[blockIdx].original,
          };
        });

        setPagesCache((prev) => ({
          ...prev,
          [pageNum]: {
            pageNumber: pageNum,
            blocks: finalBlocks,
            status: 'done',
          },
        }));
      } catch (err: any) {
        setPagesCache((prev) => ({
          ...prev,
          [pageNum]: {
            pageNumber: pageNum,
            blocks: prev[pageNum]?.blocks || [],
            status: 'error',
            error: err?.message || 'Không thể dịch trang này.',
          },
        }));
      }
    },
    [pdfDoc, pagesCache, targetLang, engine, geminiKey]
  );

  // Auto-translate active page when navigating
  useEffect(() => {
    if (pdfDoc && autoTranslatePage) {
      translatePageNumber(currentPage, false);
    }
  }, [pdfDoc, currentPage, autoTranslatePage, translatePageNumber]);

  const handleTranslateAllPages = async () => {
    if (!pdfDoc || translatingAll) return;
    setTranslatingAll(true);
    cancelBatchRef.current = false;
    setBatchProgress({ done: 0, total: numPages });

    for (let p = 1; p <= numPages; p++) {
      if (cancelBatchRef.current) break;
      await translatePageNumber(p, false);
      setBatchProgress({ done: p, total: numPages });
    }

    setTranslatingAll(false);
  };

  // Drag split divider
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingSplitRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(70, Math.max(30, pct)));
    };
    const onUp = () => {
      draggingSplitRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await loadPdfFromArrayBuffer(buf, file.name, null);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      const buf = await file.arrayBuffer();
      await loadPdfFromArrayBuffer(buf, file.name, null);
    }
  };

  const handleJumpToPdfSpot = (yRatio: number) => {
    setActiveYRatio(yRatio);
    if (leftScrollRef.current && canvasRef.current) {
      const targetScroll = Math.max(
        0,
        canvasRef.current.clientHeight * yRatio - leftScrollRef.current.clientHeight * 0.25
      );
      leftScrollRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  };

  const handleExportMarkdown = () => {
    const translatedPages = Object.values(pagesCache)
      .filter((p) => p.blocks.length > 0)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    if (translatedPages.length === 0) return;

    const lines: string[] = [`# ${docTitle || 'Bản dịch bài báo khoa học'}\n`];
    for (const p of translatedPages) {
      lines.push(`\n---\n## Trang ${p.pageNumber}\n`);
      for (const b of p.blocks) {
        if (bilingual && b.type !== 'equation') {
          lines.push(`> **Gốc:** ${b.original}\n`);
        }
        if (b.type === 'title') {
          lines.push(`### ${b.translated || b.original}\n`);
        } else if (b.type === 'heading') {
          lines.push(`#### ${b.translated || b.original}\n`);
        } else if (b.type === 'equation') {
          lines.push(`\`\`\`math\n${b.original}\n\`\`\`\n`);
        } else {
          lines.push(`${b.translated || b.original}\n`);
        }
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(docTitle || 'paper').replace(/\.pdf$/i, '')}-translated.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const currentPageData = pagesCache[currentPage];

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-50 flex flex-col'
          : 'w-full flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden'
      }
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Top Translator Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-semibold shrink-0">
            <Columns2 className="w-3.5 h-3.5" />
            <span>Split PDF Translator</span>
          </div>
          {docTitle ? (
            <span className="text-xs sm:text-sm font-medium text-slate-200 truncate max-w-[200px] md:max-w-[320px]">
              {docTitle}
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              Trái: PDF gốc &bull; Phải: Bản dịch học thuật
            </span>
          )}
        </div>

        {/* Center Page & Zoom Controls when PDF is loaded */}
        {pdfDoc && (
          <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-lg text-xs">
            <button
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                setActiveYRatio(null);
              }}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-slate-700 disabled:opacity-30"
              title="Trang trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 px-1">
              <span>Trang</span>
              <input
                type="number"
                min={1}
                max={numPages}
                value={currentPage}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 1 && v <= numPages) {
                    setCurrentPage(v);
                    setActiveYRatio(null);
                  }
                }}
                className="w-11 text-center bg-slate-900 border border-slate-700 rounded py-0.5 text-white font-semibold"
              />
              <span className="text-slate-400">/ {numPages}</span>
            </div>
            <button
              onClick={() => {
                setCurrentPage((p) => Math.min(numPages, p + 1));
                setActiveYRatio(null);
              }}
              disabled={currentPage >= numPages}
              className="p-1 rounded hover:bg-slate-700 disabled:opacity-30"
              title="Trang sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1" />

            <button
              onClick={() => setZoom((z) => Math.max(0.65, +(z - 0.15).toFixed(2)))}
              className="p-1 rounded hover:bg-slate-700"
              title="Thu nhỏ PDF"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="w-11 text-center text-[11px] text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.15).toFixed(2)))}
              className="p-1 rounded hover:bg-slate-700"
              title="Phóng to PDF"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right Engine, Mode & Upload Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Engine Picker */}
          <select
            value={engine}
            onChange={(e) => {
              const val = e.target.value as TranslationEngine;
              setEngine(val);
              if (val === 'gemini' && !geminiKey) {
                setShowKeyModal(true);
              }
            }}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400"
            title="Nguồn công cụ dịch"
          >
            <option value="free-google">Nguồn: GTX Open-Source (0đ)</option>
            <option value="free-mymemory">Nguồn: Lingva / MyMemory (0đ)</option>
            <option value="gemini">Nguồn: Gemini 2.5 Academic</option>
          </select>

          {engine === 'gemini' && (
            <button
              onClick={() => setShowKeyModal(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs"
              title="Cấu hình Gemini API Key"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{geminiKey ? 'Đã có Key' : 'Nhập Key'}</span>
            </button>
          )}

          {/* Language Target */}
          <select
            value={targetLang}
            onChange={(e) => {
              setTargetLang(e.target.value);
              setPagesCache({});
            }}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
          >
            <option value="vi">Sang: Tiếng Việt</option>
            <option value="en">Sang: English</option>
            <option value="zh-CN">Sang: 中文</option>
            <option value="ja">Sang: 日本語</option>
            <option value="fr">Sang: Français</option>
          </select>

          {/* Bilingual Toggle */}
          <button
            onClick={() => setBilingual((b) => !b)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              bilingual
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="Hiển thị song ngữ gốc + dịch (kiểu PDFMathTranslate / Immersive Translate)"
          >
            Song ngữ
          </button>

          {/* Upload local PDF */}
          <label className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition">
            <FileUp className="w-3.5 h-3.5" />
            <span>Tải file PDF</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {pdfDoc && (
            <>
              <button
                onClick={
                  translatingAll
                    ? () => {
                        cancelBatchRef.current = true;
                        setTranslatingAll(false);
                      }
                    : handleTranslateAllPages
                }
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition"
              >
                {translatingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Dừng ({batchProgress?.done}/{batchProgress?.total})
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Dịch toàn bộ</span>
                  </>
                )}
              </button>

              <button
                onClick={handleExportMarkdown}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                title="Xuất bản dịch ra file Markdown (.md)"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            title={isFullscreen ? 'Thu nhỏ' : 'Mở rộng toàn màn hình'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Optional Gemini API Key Modal */}
      {showKeyModal && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-amber-900">
            <strong>Gemini 2.5 Academic (Tùy chọn):</strong> Dán API Key miễn phí từ Google AI Studio (chỉ lưu trên trình duyệt của bạn). Nếu không có, hãy chọn <em>GTX Open-Source (0đ)</em>.
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="flex-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-slate-900"
            />
            <button
              onClick={() => {
                try {
                  localStorage.setItem('scholarhub_gemini_key', geminiKey.trim());
                } catch {
                  // ignore
                }
                setShowKeyModal(false);
                if (pdfDoc) translatePageNumber(currentPage, true);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium"
            >
              Lưu
            </button>
          </div>
        </div>
      )}

      {/* Empty / Landing State when no PDF is open yet */}
      {!pdfDoc && !loadingPdf && (
        <div className="p-6 sm:p-10 bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center min-h-[480px]">
          {pdfError && (
            <div className="mb-6 max-w-2xl w-full p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm space-y-2">
              <p className="font-semibold">Không thể tải trực tiếp luồng PDF từ máy chủ gốc:</p>
              <p className="text-xs leading-relaxed">{pdfError}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {sourcePaperUrl && (
                  <a
                    href={sourcePaperUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-medium hover:bg-amber-800"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Mở trang bài báo để tải PDF về máy
                  </a>
                )}
                {onOpenDownloadGuide && (
                  <button
                    onClick={onOpenDownloadGuide}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-medium hover:bg-amber-100"
                  >
                    Xem 5 cách tải bài báo bị khóa
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-w-xl w-full text-center space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Languages className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900">
                Dịch Bài Báo PDF Song Song (Trái: PDF Gốc &bull; Phải: Bản Dịch)
              </h2>
              <p className="text-sm text-slate-600">
                Tự động nhận diện bố cục bài báo 2 cột chuẩn IEEE / ACM / arXiv, giữ nguyên ký hiệu toán học &amp; trích dẫn <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">[1]</code>, hoàn toàn miễn phí.
              </p>
            </div>

            {/* Drag & Drop Box */}
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-white p-8 transition group">
              <FileUp className="w-8 h-8 mx-auto text-slate-400 group-hover:text-indigo-600 transition mb-2" />
              <div className="text-sm font-semibold text-slate-800">
                Kéo thả file PDF bài báo vào đây hoặc <span className="text-indigo-600 underline">chọn từ máy tính</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Xử lý trực tiếp trên trình duyệt &bull; Không giới hạn số trang
              </div>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {/* Direct PDF Link Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (urlInput.trim()) {
                  loadPdfFromRemoteUrls([urlInput.trim()]);
                }
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Hoặc dán link PDF trực tiếp (VD: https://arxiv.org/pdf/1706.03762.pdf)"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium shrink-0 transition"
              >
                Mở &amp; Dịch
              </button>
            </form>

            {/* Sample Paper Quick Try */}
            <div className="pt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
              <span>Thử nhanh bài mẫu:</span>
              <button
                type="button"
                onClick={() =>
                  loadPdfFromRemoteUrls(
                    ['https://arxiv.org/pdf/1706.03762.pdf'],
                    'Attention Is All You Need (Vaswani et al., 2017)'
                  )
                }
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition"
              >
                Attention Is All You Need (Transformer)
              </button>
              <button
                type="button"
                onClick={() =>
                  loadPdfFromRemoteUrls(
                    ['https://arxiv.org/pdf/1512.03385.pdf'],
                    'Deep Residual Learning for Image Recognition (ResNet)'
                  )
                }
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition"
              >
                Deep Residual Learning (ResNet - CVPR/IEEE)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Spinner */}
      {loadingPdf && (
        <div className="flex flex-col items-center justify-center py-28 bg-slate-50 gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-medium text-slate-700">
            Đang tải và phân tích cấu trúc PDF khoa học...
          </p>
        </div>
      )}

      {/* ACTIVE SPLIT VIEW: LEFT = ORIGINAL PDF | RIGHT = TRANSLATED VIEW */}
      {pdfDoc && !loadingPdf && (
        <div
          ref={containerRef}
          className={`flex flex-col lg:flex-row w-full ${
            isFullscreen ? 'flex-1 overflow-hidden' : 'h-[78vh] min-h-[620px]'
          }`}
        >
          {/* LEFT PANEL: ORIGINAL PDF */}
          <div
            style={{ width: undefined }}
            className="w-full lg:h-full h-1/2 flex flex-col bg-slate-200/70 border-b lg:border-b-0 border-slate-200 overflow-hidden"
            data-split-left
          >
            <style>{`
              @media (min-width: 1024px) {
                [data-split-left] { width: ${splitPercent}% !important; }
                [data-split-right] { width: ${100 - splitPercent}% !important; }
              }
            `}</style>

            {/* Subheader Left */}
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600 shrink-0">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>PDF GỐC (TRANG {currentPage}/{numPages})</span>
              </div>
              {sourcePaperUrl && (
                <a
                  href={sourcePaperUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium"
                >
                  <span>Link gốc</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Canvas Scroll Area */}
            <div
              ref={leftScrollRef}
              className="flex-1 overflow-auto p-3 sm:p-5 flex justify-center items-start"
            >
              <div className="relative shadow-lg bg-white border border-slate-300">
                <canvas ref={canvasRef} className="block" />
                {activeYRatio !== null && (
                  <div
                    style={{ top: `${activeYRatio * 100}%` }}
                    className="pointer-events-none absolute left-0 right-0 h-8 -translate-y-2 bg-indigo-500/15 border-l-4 border-indigo-600 transition-all duration-300"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DRAGGABLE RESIZER HANDLE (Desktop) */}
          <div
            onMouseDown={() => {
              draggingSplitRef.current = true;
            }}
            className="hidden lg:flex w-2 cursor-col-resize bg-slate-200 hover:bg-indigo-400 items-center justify-center transition-colors shrink-0 select-none"
            title="Kéo để thay đổi độ rộng 2 khung Trái / Phải"
          >
            <div className="w-0.5 h-10 bg-slate-400 rounded-full" />
          </div>

          {/* RIGHT PANEL: TRANSLATED CONTENT */}
          <div
            className="w-full lg:h-full h-1/2 flex flex-col bg-white overflow-hidden"
            data-split-right
          >
            {/* Subheader Right */}
            <div className="px-4 py-2 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-900">
                <BookOpenCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>BẢN DỊCH ({targetLang.toUpperCase()}) — TRANG {currentPage}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoTranslatePage}
                    onChange={(e) => setAutoTranslatePage(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>Tự dịch khi lật trang</span>
                </label>
                <button
                  onClick={() => translatePageNumber(currentPage, true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium transition"
                  title="Dịch lại trang hiện tại"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Dịch lại</span>
                </button>
              </div>
            </div>

            {/* Translation Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-4">
              {(!currentPageData || currentPageData.status === 'idle') && (
                <div className="py-16 text-center space-y-3">
                  <p className="text-sm text-slate-500">
                    Trang {currentPage} chưa được dịch.
                  </p>
                  <button
                    onClick={() => translatePageNumber(currentPage, true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
                  >
                    Dịch Trang {currentPage} Ngay
                  </button>
                </div>
              )}

              {(currentPageData?.status === 'extracting' ||
                currentPageData?.status === 'translating') && (
                <div className="space-y-4 py-6">
                  <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {currentPageData.status === 'extracting'
                        ? 'Đang tách cột và nhận diện công thức trang ' + currentPage + '...'
                        : 'Đang dịch học thuật trang ' + currentPage + '...'}
                    </span>
                  </div>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-100"
                    >
                      <div className="h-3 bg-slate-200 rounded w-3/4" />
                      <div className="h-3 bg-slate-200 rounded w-full" />
                      <div className="h-3 bg-slate-200 rounded w-5/6" />
                    </div>
                  ))}
                </div>
              )}

              {currentPageData?.status === 'error' && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm space-y-2">
                  <p className="font-semibold">Lỗi khi dịch trang {currentPage}:</p>
                  <p className="text-xs">{currentPageData.error}</p>
                  <button
                    onClick={() => translatePageNumber(currentPage, true)}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium"
                  >
                    Thử dịch lại
                  </button>
                </div>
              )}

              {currentPageData?.status === 'done' &&
                currentPageData.blocks.length === 0 && (
                  <div className="py-12 text-center text-sm text-slate-500 space-y-1">
                    <p className="font-medium text-slate-700">
                      Không tìm thấy lớp văn bản điện tử trên trang {currentPage}.
                    </p>
                    <p className="text-xs text-slate-400">
                      Trang này có thể chỉ chứa hình vẽ minh họa hoặc là bản scan ảnh.
                    </p>
                  </div>
                )}

              {currentPageData?.status === 'done' &&
                currentPageData.blocks.map((block) => (
                  <div
                    key={block.id}
                    onClick={() => handleJumpToPdfSpot(block.yRatio)}
                    className="group relative rounded-xl p-2.5 -mx-2.5 hover:bg-slate-50 border border-transparent hover:border-slate-200/80 transition cursor-pointer"
                    title="Bấm để gióng vị trí tương ứng bên PDF gốc"
                  >
                    {/* Copy button on hover */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(block.translated || block.original);
                        setCopiedId(block.id);
                        setTimeout(() => setCopiedId(null), 1500);
                      }}
                      className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 shadow-xs transition"
                      title="Sao chép đoạn này"
                    >
                      {copiedId === block.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Optional Bilingual Source Line */}
                    {bilingual && block.type !== 'equation' && (
                      <p className="text-xs text-slate-500 leading-relaxed mb-1.5 pb-1.5 border-b border-dashed border-slate-200 font-serif">
                        {block.original}
                      </p>
                    )}

                    {block.type === 'title' ? (
                      <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug pr-6">
                        {block.translated || block.original}
                      </h2>
                    ) : block.type === 'heading' ? (
                      <h3 className="text-sm sm:text-base font-bold text-indigo-900 uppercase tracking-wide pt-2 pr-6">
                        {block.translated || block.original}
                      </h3>
                    ) : block.type === 'equation' ? (
                      <div className="my-1 px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs sm:text-sm text-slate-800 overflow-x-auto">
                        {block.original}
                      </div>
                    ) : block.type === 'caption' ? (
                      <div className="px-3 py-2 rounded-lg bg-amber-50/60 border-l-2 border-amber-400 text-xs sm:text-sm text-slate-700 italic leading-relaxed">
                        {block.translated || block.original}
                      </div>
                    ) : block.type === 'reference' ? (
                      <p className="text-xs text-slate-600 leading-relaxed pl-4 -indent-4">
                        {block.translated || block.original}
                      </p>
                    ) : (
                      <p className="text-sm sm:text-[15px] text-slate-800 leading-7 text-justify pr-4">
                        {block.translated || block.original}
                      </p>
                    )}
                  </div>
                ))}

              {/* Bottom Next/Prev Quick Bar inside Translation Scroll */}
              {pdfDoc && numPages > 1 && (
                <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => {
                      setCurrentPage((p) => Math.max(1, p - 1));
                      setActiveYRatio(null);
                    }}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    ← Trang trước
                  </button>
                  <span className="text-xs text-slate-400">
                    Trang {currentPage} / {numPages}
                  </span>
                  <button
                    disabled={currentPage >= numPages}
                    onClick={() => {
                      setCurrentPage((p) => Math.min(numPages, p + 1));
                      setActiveYRatio(null);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-40"
                  >
                    Trang tiếp theo →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
