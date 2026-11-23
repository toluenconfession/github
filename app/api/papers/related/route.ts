import { NextRequest, NextResponse } from 'next/server';
import {
  mergeAndRankPapers,
  parseOpenAlexWork,
  parseSemanticScholarPaper,
  searchArxiv,
  searchCrossref,
} from '@/lib/scholar-providers';
import { ScholarPaper } from '@/types/scholar';

const USER_AGENT =
  'ScholarHub/1.0 (Academic Research Assistant; mailto:scholarhub-research@outlook.com)';

async function fetchJsonWithTimeout(url: string, timeoutMs = 7000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getOpenAlexRelated(
  openAlexId?: string,
  doi?: string | null,
  title?: string
): Promise<ScholarPaper[]> {
  let work: any = null;
  if (openAlexId) {
    work = await fetchJsonWithTimeout(`https://api.openalex.org/works/${encodeURIComponent(openAlexId)}`);
  } else if (doi) {
    work = await fetchJsonWithTimeout(
      `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`
    );
  }

  const collected: ScholarPaper[] = [];

  if (work && Array.isArray(work.related_works) && work.related_works.length > 0) {
    const ids = work.related_works
      .slice(0, 12)
      .map((u: string) => u.replace('https://openalex.org/', ''))
      .filter(Boolean);
    if (ids.length > 0) {
      const batch = await fetchJsonWithTimeout(
        `https://api.openalex.org/works?filter=openalex:${ids.join('|')}&per-page=12`
      );
      if (Array.isArray(batch?.results)) {
        collected.push(...batch.results.map((w: any) => parseOpenAlexWork(w)));
      }
    }
  }

  // Also fetch top citing works or topic-matched works
  if (work?.id) {
    const shortId = String(work.id).replace('https://openalex.org/', '');
    const citing = await fetchJsonWithTimeout(
      `https://api.openalex.org/works?filter=cites:${shortId}&sort=cited_by_count:desc&per-page=8`
    );
    if (Array.isArray(citing?.results)) {
      collected.push(...citing.results.map((w: any) => parseOpenAlexWork(w)));
    }
  } else if (title) {
    const fallback = await fetchJsonWithTimeout(
      `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=10`
    );
    if (Array.isArray(fallback?.results)) {
      collected.push(...fallback.results.map((w: any) => parseOpenAlexWork(w)));
    }
  }

  return collected;
}

async function getSemanticScholarRecommendations(
  s2Id?: string,
  doi?: string | null,
  arxivId?: string
): Promise<ScholarPaper[]> {
  const identifier = s2Id || (doi ? `DOI:${doi}` : arxivId ? `ARXIV:${arxivId}` : null);
  if (!identifier) return [];

  const fields =
    'paperId,title,authors,year,venue,publicationVenue,externalIds,url,abstract,citationCount,isOpenAccess,openAccessPdf';
  const data = await fetchJsonWithTimeout(
    `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURIComponent(identifier)}?limit=10&fields=${fields}`
  );
  if (!Array.isArray(data?.recommendedPapers)) return [];
  return data.recommendedPapers.map((p: any) => parseSemanticScholarPaper(p));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title = '',
      doi = null,
      openAlexId,
      semanticScholarId,
      arxivId,
      concepts = [],
    } = body || {};

    if (!title && !doi && !openAlexId) {
      return NextResponse.json({ error: 'Thiếu thông tin bài báo.' }, { status: 400 });
    }

    const topicQuery =
      Array.isArray(concepts) && concepts.length >= 2
        ? `${concepts.slice(0, 2).join(' ')} ${title.split(/\s+/).slice(0, 5).join(' ')}`
        : title;

    const [oaRes, s2Res, crRes, axRes] = await Promise.allSettled([
      getOpenAlexRelated(openAlexId, doi, title),
      getSemanticScholarRecommendations(semanticScholarId, doi, arxivId),
      searchCrossref(topicQuery, 'keyword'),
      searchArxiv(topicQuery.split(/\s+/).slice(0, 7).join(' '), 'keyword'),
    ]);

    const merged = mergeAndRankPapers([
      oaRes.status === 'fulfilled' ? oaRes.value : [],
      s2Res.status === 'fulfilled' ? s2Res.value : [],
      crRes.status === 'fulfilled' ? crRes.value.slice(0, 8) : [],
      axRes.status === 'fulfilled' ? axRes.value.slice(0, 8) : [],
    ]);

    // Exclude the exact input paper itself
    const normalizedSelf = String(title).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    const filtered = merged.filter((p) => {
      if (doi && p.doi && p.doi.toLowerCase() === String(doi).toLowerCase()) return false;
      const t = p.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (normalizedSelf.length > 12 && t === normalizedSelf) return false;
      return true;
    });

    return NextResponse.json({ papers: filtered.slice(0, 24) });
  } catch {
    return NextResponse.json(
      { error: 'Không thể tải danh sách bài báo liên quan.' },
      { status: 500 }
    );
  }
}
