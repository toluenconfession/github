'use client';

import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSearch,
  GraduationCap,
  HelpCircle,
  Languages,
  Loader2,
  Mail,
  Unlock,
  X,
} from 'lucide-react';
import { ScholarPaper } from '@/types/scholar';

interface DownloadGuideModalProps {
  paper: ScholarPaper | null;
  isOpen: boolean;
  onClose: () => void;
  onTranslatePdfUrl: (url: string, title: string, paperUrl?: string) => void;
  onSwitchToTranslatorUpload: () => void;
}

export function DownloadGuideModal({
  paper,
  isOpen,
  onClose,
  onTranslatePdfUrl,
  onSwitchToTranslatorUpload,
}: DownloadGuideModalProps) {
  const [resolving, setResolving] = useState(false);
  const [candidates, setCandidates] = useState<{ url: string; source: string }[]>([]);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    if (!isOpen || !paper) {
      setCandidates([]);
      return;
    }

    let active = true;
    setResolving(true);
    fetch('/api/papers/resolve-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doi: paper.doi, title: paper.title }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data?.candidates)) {
          setCandidates(data.candidates);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setResolving(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, paper]);

  if (!isOpen) return null;

  const title = paper?.title || 'Ten bai bao khoa hoc';
  const doi = paper?.doi || '';
  const firstAuthor = paper?.authors?.[0]?.name || 'Professor / Author';
  const venue = paper?.venue || 'your journal/conference';
  const year = paper?.year ? ` (${paper.year})` : '';

  const scholarPdfUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(
    `"${title}"`
  )}`;
  const scholarDirectFiletypeUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `"${title}" filetype:pdf`
  )}`;
  const researchGateUrl = `https://www.researchgate.net/search/publication?q=${encodeURIComponent(
    title
  )}`;
  const coreSearchUrl = `https://core.ac.uk/search?q=${encodeURIComponent(title)}`;
  const openAccessButtonUrl = doi
    ? `https://openaccessbutton.org/?q=${encodeURIComponent(doi)}`
    : `https://openaccessbutton.org/?q=${encodeURIComponent(title)}`;

  const emailTemplate = `Subject: Request for PDF copy of your paper: "${title}"

Dear ${firstAuthor},

I am currently conducting academic research related to your work and was very interested in reading your paper titled "${title}" published in ${venue}${year}.

Unfortunately, my institution does not currently have subscription access to the full text. Would you be willing to kindly share an author's copy / preprint PDF for personal research and study purposes?

Thank you very much for your time and contribution to the field.

Best regards,
[Tên của bạn / Trường Đại học của bạn]`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 uppercase tracking-wider">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Hướng dẫn mở khóa &amp; tải bài báo khoa học</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold leading-snug line-clamp-2">
              {paper ? paper.title : 'Cách tải các bài báo bị khóa (IEEE, ScienceDirect, Springer...)'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Steps */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm text-slate-700">
          {/* Auto-scan legal Open Access result */}
          {paper && (
            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/60 space-y-2.5">
              <div className="flex items-center gap-2 font-semibold text-indigo-950">
                {resolving ? (
                  <>
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                    <span>Đang tự động quét bản Preprint / Kho lưu trữ mở hợp pháp...</span>
                  </>
                ) : candidates.length > 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-900">
                      Tuyệt vời! Tìm thấy {candidates.length} nguồn PDF mở hợp pháp cho bài này:
                    </span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4 text-indigo-600" />
                    <span>
                      Bài báo này hiện đang nằm sau tường phí nhà xuất bản ({paper.publisherBadge}). Hãy làm theo 5 cách dưới đây để tải về:
                    </span>
                  </>
                )}
              </div>

              {!resolving && candidates.length > 0 && (
                <div className="space-y-2 pt-1">
                  {candidates.map((c, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-emerald-200"
                    >
                      <span className="text-xs font-medium text-slate-700">
                        {c.source}
                      </span>
                      <div className="flex items-center gap-2">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Tải PDF
                        </a>
                        <button
                          onClick={() => {
                            onTranslatePdfUrl(c.url, paper.title, paper.url);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                        >
                          <Languages className="w-3 h-3" />
                          Dịch trực tiếp ngay
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Method 1: Google Scholar [PDF] & filetype:pdf */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0">
                1
              </span>
              <span>Tìm bản thảo tác giả (Preprint / Author Copy) trên Google Scholar &amp; CORE</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pl-8">
              Rất nhiều bài báo trên <strong>IEEE, ACM, Springer, Elsevier</strong> được chính tác giả đăng bản nháp hoàn chỉnh (nội dung giống 99%) lên kho trường đại học hoặc arXiv. Khi mở Google Scholar, hãy nhìn sang <strong>cột bên phải</strong> tìm chữ <code className="px-1 py-0.5 bg-slate-100 rounded">[PDF]</code> hoặc bấm <strong>&ldquo;All versions / Tất cả các phiên bản&rdquo;</strong> dưới bài báo.
            </p>
            <div className="pl-8 flex flex-wrap gap-2 pt-1">
              <a
                href={scholarPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              >
                <FileSearch className="w-3.5 h-3.5" />
                Mở trên Google Scholar (Xem cột [PDF])
              </a>
              <a
                href={scholarDirectFiletypeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Quét Google filetype:pdf
              </a>
              <a
                href={coreSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Tìm trên CORE.ac.uk
              </a>
            </div>
          </div>

          {/* Method 2: ResearchGate Full-Text / Request */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0">
                2
              </span>
              <span>Tải hoặc xin bản Full-Text trên ResearchGate</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pl-8">
              Trên ResearchGate, các tác giả thường tải sẵn bản PDF công khai (nút <strong>Download full-text PDF</strong>) hoặc cho phép bấm nút <strong>Request full-text</strong> để nhận bản cá nhân hợp pháp trực tiếp từ tác giả.
            </p>
            <div className="pl-8 flex flex-wrap gap-2 pt-1">
              <a
                href={researchGateUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Tìm bài này trên ResearchGate
              </a>
              <a
                href={openAccessButtonUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Kiểm tra qua Open Access Button
              </a>
            </div>
          </div>

          {/* Method 3: University Institutional Access / Library */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0">
                3
              </span>
              <span>Đăng nhập qua Thư viện Trường Đại học (.edu.vn) hoặc CSDL Quốc gia</span>
            </div>
            <div className="text-xs text-slate-600 leading-relaxed pl-8 space-y-1">
              <p>
                &bull; Tại trang IEEE Xplore / ScienceDirect / SpringerLink, bấm nút <strong>&ldquo;Institutional Sign In / Access through your institution&rdquo;</strong> rồi gõ tên trường ĐH của bạn (ĐHQG, ĐH Bách Khoa, ĐH CNTT...) hoặc kết nối mạng Wi-Fi tại thư viện trường để tải miễn phí.
              </p>
              <p>
                &bull; Ngoài ra bạn có thể đăng ký thẻ bạn đọc trực tuyến tại <strong>Cục Thông tin KH&amp;CN Quốc gia (VISTA / lirc.vista.gov.vn)</strong> hoặc Thư viện Quốc gia để truy cập ScienceDirect, Springer, IEEE hợp pháp.
              </p>
            </div>
          </div>

          {/* Method 4: Unpaywall Browser Extension */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0">
                4
              </span>
              <span>Cài tiện ích mở rộng Unpaywall cho Chrome / Edge</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pl-8">
              Cài tiện ích miễn phí <strong>Unpaywall</strong> trên Chrome Web Store: mỗi khi bạn đang xem một bài báo IEEE / Elsevier bị khóa, biểu tượng ổ khóa màu xanh lá ở cạnh phải màn hình sẽ hiện lên nếu có kho lưu trữ đại học nào lưu bản PDF miễn phí của bài đó.
            </p>
          </div>

          {/* Method 5: Ready-to-send Author Request Email */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0">
                  5
                </span>
                <span>Gửi Email xin trực tiếp Tác giả (Tỷ lệ được gửi tặng PDF &gt;80%)</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(emailTemplate);
                  setCopiedEmail(true);
                  setTimeout(() => setCopiedEmail(false), 2000);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 shrink-0"
              >
                {copiedEmail ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Đã chép mẫu</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép Email mẫu</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 pl-8">
              Các nhà khoa học không nhận tiền bán bài từ nhà xuất bản nên rất sẵn lòng gửi file PDF cho sinh viên/nghiên cứu sinh khi nhận được email lịch sự. Mẫu đã điền sẵn tên bài báo cho bạn:
            </p>
            <pre className="ml-8 p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
              {emailTemplate}
            </pre>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <GraduationCap className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Đã tải được file PDF về máy tính?</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onSwitchToTranslatorUpload();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
            >
              <Languages className="w-3.5 h-3.5" />
              Mở Công Cụ Dịch PDF Song Song →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
