import { NextRequest, NextResponse } from 'next/server';
import { searchArxiv, searchEuropePmc } from '@/lib/scholar-providers';

const USER_AGENT =
  'ScholarHub/1.0 (Academic Research Assistant; mailto:scholarhub-research@outlook.com)';

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const { doi, title } = await req.json();
    const foundUrls: { url: string; source: string }[] = [];
    const seen = new Set<string>();

    const addCandidate = (url?: string | null, source = 'Open Access') => {
      if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
      let clean = url.trim();
      const arxivMatch = clean.match(/^https?:\/\/arxiv\.org\/abs\/([^\s/?#]+)/i);
      if (arxivMatch) clean = `https://arxiv.org/pdf/${arxivMatch[1]}.pdf`;
      if (!seen.has(clean)) {
        seen.add(clean);
        foundUrls.push({ url: clean, source });
      }
    };

    const tasks: Promise<void>[] = [];

    // 1. Unpaywall legal OA lookup
    if (doi) {
      tasks.push(
        (async () => {
          try {
            const res = await fetch(
              `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=scholarhub@outlook.com`,
              { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6000) }
            );
            if (res.ok) {
              const data = await res.json();
              if (data?.best_oa_location?.url_for_pdf) {
                addCandidate(data.best_oa_location.url_for_pdf, 'Unpaywall (Bản mở chính thức)');
              }
              if (Array.isArray(data?.oa_locations)) {
                for (const loc of data.oa_locations) {
                  if (loc?.url_for_pdf) {
                    addCandidate(
                      loc.url_for_pdf,
                      loc.host_type === 'repository'
                        ? 'Kho lưu trữ trường ĐH / Preprint (Unpaywall)'
                        : 'Unpaywall Open Access'
                    );
                  }
                }
              }
            }
          } catch {
            // ignore
          }
        })()
      );

      // 2. OpenAlex alternate repository locations
      tasks.push(
        (async () => {
          try {
            const res = await fetch(
              `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`,
              { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6000) }
            );
            if (res.ok) {
              const w = await res.json();
              if (w?.best_oa_location?.pdf_url) {
                addCandidate(w.best_oa_location.pdf_url, 'OpenAlex Open Access');
              }
              if (Array.isArray(w?.locations)) {
                for (const loc of w.locations) {
                  if (loc?.pdf_url) {
                    addCandidate(
                      loc.pdf_url,
                      loc?.source?.display_name || 'Kho lưu trữ học thuật mở'
                    );
                  }
                }
              }
            }
          } catch {
            // ignore
          }
        })()
      );
    }

    // 3. Exact title preprint check on arXiv & Europe PMC
    if (title && title.length > 10) {
      const targetNorm = normalizeTitle(title);
      tasks.push(
        (async () => {
          try {
            const axPapers = await searchArxiv(title, 'keyword');
            for (const p of axPapers) {
              const pNorm = normalizeTitle(p.title);
              if (
                p.pdfUrl &&
                (pNorm === targetNorm ||
                  (targetNorm.length > 25 && pNorm.includes(targetNorm.slice(0, 30))))
              ) {
                addCandidate(p.pdfUrl, 'Bản Preprint của tác giả trên arXiv');
              }
            }
          } catch {
            // ignore
          }
        })()
      );

      tasks.push(
        (async () => {
          try {
            const pmcPapers = await searchEuropePmc(`"${title}"`, 'keyword');
            for (const p of pmcPapers) {
              if (p.pdfUrl && normalizeTitle(p.title) === targetNorm) {
                addCandidate(p.pdfUrl, 'Europe PMC Open Access');
              }
            }
          } catch {
            // ignore
          }
        })()
      );
    }

    await Promise.allSettled(tasks);

    return NextResponse.json({
      found: foundUrls.length > 0,
      candidates: foundUrls,
    });
  } catch {
    return NextResponse.json({ found: false, candidates: [] });
  }
}
