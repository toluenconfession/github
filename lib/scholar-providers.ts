import {
  PaperAuthor,
  PaperSource,
  PublisherBadge,
  ScholarPaper,
  SearchMode,
  SortOption,
} from '@/types/scholar';

const USER_AGENT =
  'ScholarHub/1.0 (Academic Research Assistant; mailto:scholarhub-research@ outlook.com)';

function cleanDoi(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
  return trimmed || null;
}

function stripHtml(text?: string | null): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

export function detectPublisherBadge(
  doi: string | null,
  venue: string,
  publisher: string,
  sources: PaperSource[],
  arxivId?: string
): PublisherBadge {
  const d = (doi || '').toLowerCase();
  const v = `${venue} ${publisher}`.toLowerCase();

  if (d.startsWith('10.1109/') || /\bieee\b/.test(v)) return 'IEEE';
  if (d.startsWith('10.1038/') || /\bnature\b/.test(v)) return 'Nature';
  if (d.startsWith('10.1016/') || /elsevier|sciencedirect/.test(v)) return 'Elsevier';
  if (d.startsWith('10.1007/') || /springer/.test(v)) return 'Springer';
  if (d.startsWith('10.1145/') || /\bacm\b|association for computing machinery/.test(v))
    return 'ACM';
  if (d.startsWith('10.1002/') || /wiley/.test(v)) return 'Wiley';
  if (d.startsWith('10.3390/') || /mdpi/.test(v)) return 'MDPI';
  if (arxivId || d.includes('arxiv') || /\barxiv\b/.test(v) || sources.includes('arxiv'))
    return 'arXiv';
  if (sources.includes('europepmc') || /pubmed|pmc|biomed/.test(v)) return 'PubMed';
  return 'Academic';
}

function reconstructOpenAlexAbstract(
  inverted?: Record<string, number[]> | null
): string | null {
  if (!inverted || typeof inverted !== 'object') return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        if (typeof pos === 'number' && pos >= 0 && pos < 5000) {
          words[pos] = word;
        }
      }
    }
  }
  const text = words.filter(Boolean).join(' ').trim();
  return text || null;
}

function normalizePdfUrl(url?: string | null): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u.startsWith('http')) return null;
  const arxivAbs = u.match(/^https?:\/\/arxiv\.org\/abs\/([^\s/?#]+)/i);
  if (arxivAbs) {
    return `https://arxiv.org/pdf/${arxivAbs[1]}.pdf`;
  }
  if (/^http:\/\/arxiv\.org\/pdf\//i.test(u)) {
    return u.replace(/^http:/i, 'https:');
  }
  return u;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 7500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, application/xml, text/xml, */*',
        ...(options.headers || {}),
      },
      signal: controller.signal,
      next: { revalidate: 300 },
    });
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. OpenAlex Provider (250M+ Works: IEEE, Springer, Elsevier, ACM, OA...)   */
/* -------------------------------------------------------------------------- */
export async function searchOpenAlex(
  query: string,
  mode: SearchMode,
  yearFrom?: number,
  publisherFilter?: string
): Promise<{
  papers: ScholarPaper[];
  matchedAuthor?: {
    name: string;
    affiliation?: string;
    worksCount?: number;
    citedByCount?: number;
    orcid?: string;
  } | null;
}> {
  let matchedAuthor = null;
  const filters: string[] = [];

  if (yearFrom && yearFrom > 1900) {
    filters.push(`from_publication_date:${yearFrom}-01-01`);
  }

  // If mode === 'author', first look up the OpenAlex Author ID for accurate author publications
  let authorId: string | null = null;
  if (mode === 'author') {
    try {
      const authorRes = await fetchWithTimeout(
        `https://api.openalex.org/authors?search=${encodeURIComponent(query)}&per-page=1`
      );
      if (authorRes.ok) {
        const authorJson = await authorRes.json();
        const topAuthor = authorJson?.results?.[0];
        if (topAuthor?.id) {
          authorId = String(topAuthor.id).replace('https://openalex.org/', '');
          matchedAuthor = {
            name: topAuthor.display_name,
            affiliation: topAuthor.last_known_institutions?.[0]?.display_name || undefined,
            worksCount: topAuthor.works_count,
            citedByCount: topAuthor.cited_by_count,
            orcid: topAuthor.orcid || undefined,
          };
          filters.push(`authorships.author.id:${authorId}`);
        }
      }
    } catch {
      // Fallback to text query below
    }
  }

  let searchParam = '';
  if (mode === 'author' && authorId) {
    searchParam = `sort=cited_by_count:desc`;
  } else {
    const effectiveQuery =
      publisherFilter === 'ieee' ? `${query} IEEE` : query;
    searchParam = `search=${encodeURIComponent(effectiveQuery)}`;
  }

  const filterStr = filters.length > 0 ? `&filter=${filters.join(',')}` : '';
  const url = `https://api.openalex.org/works?${searchParam}${filterStr}&per-page=18`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) return { papers: [], matchedAuthor };
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  const papers: ScholarPaper[] = results.map((w: any) => parseOpenAlexWork(w));
  return { papers, matchedAuthor };
}

export function parseOpenAlexWork(w: any): ScholarPaper {
  const doi = cleanDoi(w.doi);
  const openAlexId = w.id ? String(w.id).replace('https://openalex.org/', '') : undefined;
  const primaryLoc = w.primary_location || {};
  const bestOa = w.open_access?.oa_url || w.best_oa_location?.pdf_url || null;
  const venue =
    primaryLoc?.source?.display_name ||
    w.best_oa_location?.source?.display_name ||
    '';
  const publisher =
    primaryLoc?.source?.host_organization_name ||
    primaryLoc?.source?.display_name ||
    '';

  // Gather all direct PDF URLs across OpenAlex locations
  const pdfSet = new Set<string>();
  if (w.best_oa_location?.pdf_url) {
    const p = normalizePdfUrl(w.best_oa_location.pdf_url);
    if (p) pdfSet.add(p);
  }
  if (primaryLoc?.pdf_url) {
    const p = normalizePdfUrl(primaryLoc.pdf_url);
    if (p) pdfSet.add(p);
  }
  if (Array.isArray(w.locations)) {
    for (const loc of w.locations) {
      if (loc?.pdf_url) {
        const p = normalizePdfUrl(loc.pdf_url);
        if (p) pdfSet.add(p);
      }
      if (typeof loc?.landing_page_url === 'string' && /arxiv\.org\/abs\//i.test(loc.landing_page_url)) {
        const p = normalizePdfUrl(loc.landing_page_url);
        if (p) pdfSet.add(p);
      }
    }
  }
  if (bestOa && (/\.pdf($|\?)/i.test(bestOa) || /arxiv\.org/i.test(bestOa))) {
    const p = normalizePdfUrl(bestOa);
    if (p) pdfSet.add(p);
  }

  let arxivId: string | undefined;
  const idsArxiv = w.ids?.arxiv || '';
  const arxivMatch = String(idsArxiv).match(/arxiv\.org\/abs\/([^\s/?#]+)/i);
  if (arxivMatch) {
    arxivId = arxivMatch[1];
    pdfSet.add(`https://arxiv.org/pdf/${arxivId}.pdf`);
  }

  const allPdfs = Array.from(pdfSet);
  const pdfUrl = allPdfs[0] || null;

  const authors: PaperAuthor[] = Array.isArray(w.authorships)
    ? w.authorships.slice(0, 12).map((a: any) => ({
        name: a?.author?.display_name || 'Unknown',
        affiliation: a?.institutions?.[0]?.display_name || undefined,
        id: a?.author?.id ? String(a.author.id).replace('https://openalex.org/', '') : undefined,
      }))
    : [];

  const landingUrl =
    primaryLoc?.landing_page_url ||
    (doi ? `https://doi.org/${doi}` : null) ||
    bestOa ||
    w.id ||
    '';

  const concepts: string[] = Array.isArray(w.topics)
    ? w.topics.slice(0, 4).map((t: any) => t.display_name).filter(Boolean)
    : Array.isArray(w.concepts)
      ? w.concepts.slice(0, 4).map((c: any) => c.display_name).filter(Boolean)
      : [];

  const sources: PaperSource[] = ['openalex'];
  const publisherBadge = detectPublisherBadge(doi, venue, publisher, sources, arxivId);

  return {
    id: doi || openAlexId || Math.random().toString(36).slice(2),
    title: stripHtml(w.title || w.display_name) || 'Untitled Paper',
    authors,
    year: typeof w.publication_year === 'number' ? w.publication_year : null,
    venue,
    publisher,
    publisherBadge,
    doi,
    url: landingUrl,
    pdfUrl,
    alternatePdfUrls: allPdfs.slice(1),
    isOpenAccess: Boolean(pdfUrl || w.open_access?.is_oa),
    citationCount: typeof w.cited_by_count === 'number' ? w.cited_by_count : 0,
    abstract: reconstructOpenAlexAbstract(w.abstract_inverted_index),
    sources,
    openAlexId,
    arxivId,
    concepts,
  };
}

/* -------------------------------------------------------------------------- */
/* 2. Semantic Scholar Provider (IEEE, ACM, CS, Med, Engineering)             */
/* -------------------------------------------------------------------------- */
export async function searchSemanticScholar(
  query: string,
  mode: SearchMode,
  yearFrom?: number
): Promise<ScholarPaper[]> {
  const fields =
    'paperId,title,authors,year,venue,publicationVenue,externalIds,url,abstract,citationCount,isOpenAccess,openAccessPdf';
  const yearParam = yearFrom ? `&year=${yearFrom}-` : '';

  if (mode === 'author') {
    // Search author first, then get top papers
    const authorRes = await fetchWithTimeout(
      `https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(query)}&limit=2&fields=name,papers.paperId,papers.title,papers.authors,papers.year,papers.venue,papers.externalIds,papers.url,papers.abstract,papers.citationCount,papers.isOpenAccess,papers.openAccessPdf`
    );
    if (authorRes.ok) {
      const aData = await authorRes.json();
      const rawPapers = aData?.data?.[0]?.papers || [];
      if (rawPapers.length > 0) {
        return rawPapers
          .filter((p: any) => (!yearFrom || (p.year && p.year >= yearFrom)))
          .slice(0, 15)
          .map((p: any) => parseSemanticScholarPaper(p));
      }
    }
  }

  const res = await fetchWithTimeout(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=15&fields=${fields}${yearParam}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map((p: any) => parseSemanticScholarPaper(p));
}

export function parseSemanticScholarPaper(p: any): ScholarPaper {
  const ext = p.externalIds || {};
  const doi = cleanDoi(ext.DOI);
  const arxivId = ext.ArXiv ? String(ext.ArXiv) : undefined;
  const venue = p.publicationVenue?.name || p.venue || '';
  const oaPdf = normalizePdfUrl(p.openAccessPdf?.url);
  const arxivPdf = arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : null;
  const pdfUrl = oaPdf || arxivPdf || null;
  const alternatePdfUrls = oaPdf && arxivPdf && oaPdf !== arxivPdf ? [arxivPdf] : [];
  const sources: PaperSource[] = ['semanticscholar'];
  const publisherBadge = detectPublisherBadge(doi, venue, venue, sources, arxivId);

  return {
    id: doi || `s2:${p.paperId}`,
    title: stripHtml(p.title) || 'Untitled Paper',
    authors: Array.isArray(p.authors)
      ? p.authors.slice(0, 12).map((a: any) => ({ name: a.name || 'Unknown' }))
      : [],
    year: typeof p.year === 'number' ? p.year : null,
    venue,
    publisher: venue,
    publisherBadge,
    doi,
    url: doi ? `https://doi.org/${doi}` : p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
    pdfUrl,
    alternatePdfUrls,
    isOpenAccess: Boolean(pdfUrl || p.isOpenAccess),
    citationCount: typeof p.citationCount === 'number' ? p.citationCount : 0,
    abstract: stripHtml(p.abstract),
    sources,
    semanticScholarId: p.paperId,
    arxivId,
  };
}

/* -------------------------------------------------------------------------- */
/* 3. Crossref Provider (Official DOI Registry: IEEE, Elsevier, Springer...)  */
/* -------------------------------------------------------------------------- */
export async function searchCrossref(
  query: string,
  mode: SearchMode,
  yearFrom?: number,
  publisherFilter?: string
): Promise<ScholarPaper[]> {
  const params = new URLSearchParams({ rows: '14' });
  if (mode === 'author') {
    params.set('query.author', query);
  } else {
    params.set('query.bibliographic', publisherFilter === 'ieee' ? `${query} IEEE` : query);
  }

  const filters: string[] = [];
  if (yearFrom) filters.push(`from-pub-date:${yearFrom}`);
  if (publisherFilter === 'ieee') filters.push('prefix:10.1109');
  if (filters.length > 0) params.set('filter', filters.join(','));

  const res = await fetchWithTimeout(`https://api.crossref.org/works?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.message?.items) ? data.message.items : [];

  return items
    .filter((item: any) => Array.isArray(item.title) && item.title[0])
    .map((item: any): ScholarPaper => {
      const doi = cleanDoi(item.DOI);
      const title = stripHtml(item.title?.[0]) || 'Untitled';
      const venue = stripHtml(item['container-title']?.[0]) || '';
      const publisher = item.publisher || '';
      const year =
        item.published?.['date-parts']?.[0]?.[0] ||
        item['published-print']?.['date-parts']?.[0]?.[0] ||
        item['published-online']?.['date-parts']?.[0]?.[0] ||
        null;

      const authors: PaperAuthor[] = Array.isArray(item.author)
        ? item.author.slice(0, 12).map((a: any) => ({
            name: [a.given, a.family].filter(Boolean).join(' ') || a.name || 'Unknown',
            affiliation: a.affiliation?.[0]?.name || undefined,
          }))
        : [];

      let pdfUrl: string | null = null;
      if (Array.isArray(item.link)) {
        const pdfLink = item.link.find(
          (l: any) =>
            l?.['content-type'] === 'application/pdf' &&
            typeof l?.URL === 'string' &&
            !/ieeexplore|sciencedirect|onlinelibrary\.wiley/i.test(l.URL)
        );
        if (pdfLink) pdfUrl = normalizePdfUrl(pdfLink.URL);
      }

      const sources: PaperSource[] = ['crossref'];
      const publisherBadge = detectPublisherBadge(doi, venue, publisher, sources);

      return {
        id: doi || Math.random().toString(36).slice(2),
        title,
        authors,
        year: typeof year === 'number' ? year : null,
        venue,
        publisher,
        publisherBadge,
        doi,
        url: item.URL || (doi ? `https://doi.org/${doi}` : ''),
        pdfUrl,
        alternatePdfUrls: [],
        isOpenAccess: Boolean(pdfUrl),
        citationCount: typeof item['is-referenced-by-count'] === 'number' ? item['is-referenced-by-count'] : 0,
        abstract: stripHtml(item.abstract),
        sources,
      };
    });
}

/* -------------------------------------------------------------------------- */
/* 4. arXiv Provider (100% Free Direct Full-Text PDFs)                        */
/* -------------------------------------------------------------------------- */
export async function searchArxiv(
  query: string,
  mode: SearchMode,
  yearFrom?: number
): Promise<ScholarPaper[]> {
  const sanitized = query.replace(/["()]/g, ' ').trim();
  const searchQuery =
    mode === 'author'
      ? `au:"${sanitized}"`
      : `all:${sanitized}`;
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&start=0&max_results=12`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const xml = await res.text();

  const entries = xml.split('<entry>').slice(1);
  const papers: ScholarPaper[] = [];

  for (const rawEntry of entries) {
    const entry = rawEntry.split('</entry>')[0] || '';
    const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const publishedMatch = entry.match(/<published>(\d{4})-/);
    const doiMatch = entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
    const journalMatch = entry.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/);

    const rawIdUrl = idMatch?.[1]?.trim() || '';
    const arxivIdMatch = rawIdUrl.match(/arxiv\.org\/abs\/([^\s?#<]+)/i);
    const arxivId = arxivIdMatch ? arxivIdMatch[1] : undefined;
    if (!arxivId || !titleMatch) continue;

    const year = publishedMatch ? parseInt(publishedMatch[1], 10) : null;
    if (yearFrom && year && year < yearFrom) continue;

    const authorMatches = Array.from(entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g));
    const authors: PaperAuthor[] = authorMatches.slice(0, 12).map((m) => ({
      name: m[1].replace(/\s+/g, ' ').trim(),
    }));

    const doi = cleanDoi(doiMatch?.[1]);
    const journalRef = stripHtml(journalMatch?.[1]) || 'arXiv Preprint';
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    const sources: PaperSource[] = ['arxiv'];
    const publisherBadge = detectPublisherBadge(doi, journalRef, 'arXiv', sources, arxivId);

    papers.push({
      id: doi || `arxiv:${arxivId}`,
      title: stripHtml(titleMatch[1]) || 'Untitled arXiv Paper',
      authors,
      year,
      venue: journalRef,
      publisher: 'arXiv (Cornell University)',
      publisherBadge,
      doi,
      url: `https://arxiv.org/abs/${arxivId}`,
      pdfUrl,
      alternatePdfUrls: [],
      isOpenAccess: true,
      citationCount: 0,
      abstract: stripHtml(summaryMatch?.[1]),
      sources,
      arxivId,
    });
  }

  return papers;
}

/* -------------------------------------------------------------------------- */
/* 5. Europe PMC Provider (Biomedical, Life Sciences & Direct OA PDFs)        */
/* -------------------------------------------------------------------------- */
export async function searchEuropePmc(
  query: string,
  mode: SearchMode,
  yearFrom?: number
): Promise<ScholarPaper[]> {
  const qParts: string[] = [mode === 'author' ? `AUTH:"${query}"` : query];
  if (yearFrom) qParts.push(`FIRST_PDATE:[${yearFrom}-01-01 TO 2099-12-31]`);
  const qStr = qParts.join(' AND ');

  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(qStr)}&resultType=core&pageSize=10&format=json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await res.json();
  const list = Array.isArray(data?.resultList?.result) ? data.resultList.result : [];

  return list.map((r: any): ScholarPaper => {
    const doi = cleanDoi(r.doi);
    const pmcid = r.pmcid ? String(r.pmcid) : null;
    const isOa = r.isOpenAccess === 'Y' || Boolean(pmcid && r.hasPDF === 'Y');
    const pdfUrl =
      pmcid && r.hasPDF === 'Y'
        ? `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${pmcid}&blobtype=pdf`
        : null;

    const authors: PaperAuthor[] = Array.isArray(r.authorList?.author)
      ? r.authorList.author.slice(0, 12).map((a: any) => ({
          name: a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Unknown',
        }))
      : [];

    const venue = r.journalInfo?.journal?.title || r.journalTitle || 'Europe PMC';
    const year = r.pubYear ? parseInt(String(r.pubYear), 10) : null;
    const sources: PaperSource[] = ['europepmc'];

    return {
      id: doi || `pmc:${r.id}`,
      title: stripHtml(r.title) || 'Untitled Paper',
      authors,
      year: Number.isFinite(year) ? year : null,
      venue,
      publisher: venue,
      publisherBadge: detectPublisherBadge(doi, venue, venue, sources),
      doi,
      url: doi
        ? `https://doi.org/${doi}`
        : pmcid
          ? `https://europepmc.org/article/PMC/${pmcid.replace(/^PMC/, '')}`
          : `https://europepmc.org/article/${r.source}/${r.id}`,
      pdfUrl,
      alternatePdfUrls: [],
      isOpenAccess: isOa,
      citationCount: typeof r.citedByCount === 'number' ? r.citedByCount : 0,
      abstract: stripHtml(r.abstractText),
      sources,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Deduplication, Merging & Ranking                                           */
/* -------------------------------------------------------------------------- */
function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u1ef9]/g, '')
    .slice(0, 90);
}

export function mergeAndRankPapers(
  lists: ScholarPaper[][],
  options: {
    onlyPdf?: boolean;
    publisherFilter?: string;
    sort?: SortOption;
  } = {}
): ScholarPaper[] {
  const byDoi = new Map<string, ScholarPaper>();
  const byTitle = new Map<string, ScholarPaper>();
  const merged: ScholarPaper[] = [];

  for (const list of lists) {
    for (const incoming of list) {
      if (!incoming.title || incoming.title.length < 4) continue;
      const doiKey = incoming.doi ? incoming.doi.toLowerCase() : null;
      const titleKey = normalizeTitleKey(incoming.title);

      const existing =
        (doiKey && byDoi.get(doiKey)) || (titleKey.length > 14 ? byTitle.get(titleKey) : undefined);

      if (existing) {
        // Merge rich metadata
        for (const s of incoming.sources) {
          if (!existing.sources.includes(s)) existing.sources.push(s);
        }
        if (!existing.doi && incoming.doi) {
          existing.doi = incoming.doi;
          byDoi.set(incoming.doi.toLowerCase(), existing);
        }
        if (!existing.pdfUrl && incoming.pdfUrl) {
          existing.pdfUrl = incoming.pdfUrl;
          existing.isOpenAccess = true;
        } else if (incoming.pdfUrl && incoming.pdfUrl !== existing.pdfUrl) {
          if (!existing.alternatePdfUrls.includes(incoming.pdfUrl)) {
            existing.alternatePdfUrls.push(incoming.pdfUrl);
          }
        }
        for (const alt of incoming.alternatePdfUrls) {
          if (alt !== existing.pdfUrl && !existing.alternatePdfUrls.includes(alt)) {
            existing.alternatePdfUrls.push(alt);
          }
        }
        if (
          (!existing.abstract || existing.abstract.length < 80) &&
          incoming.abstract &&
          incoming.abstract.length > (existing.abstract?.length || 0)
        ) {
          existing.abstract = incoming.abstract;
        }
        if (incoming.citationCount > existing.citationCount) {
          existing.citationCount = incoming.citationCount;
        }
        if (!existing.openAlexId && incoming.openAlexId) existing.openAlexId = incoming.openAlexId;
        if (!existing.semanticScholarId && incoming.semanticScholarId)
          existing.semanticScholarId = incoming.semanticScholarId;
        if (!existing.arxivId && incoming.arxivId) existing.arxivId = incoming.arxivId;
        if (!existing.venue && incoming.venue) existing.venue = incoming.venue;
        if (existing.publisherBadge === 'Academic' && incoming.publisherBadge !== 'Academic') {
          existing.publisherBadge = incoming.publisherBadge;
        }
      } else {
        const clone: ScholarPaper = {
          ...incoming,
          sources: [...incoming.sources],
          alternatePdfUrls: [...incoming.alternatePdfUrls],
        };
        merged.push(clone);
        if (doiKey) byDoi.set(doiKey, clone);
        if (titleKey.length > 14) byTitle.set(titleKey, clone);
      }
    }
  }

  let filtered = merged;

  if (options.onlyPdf) {
    filtered = filtered.filter((p) => Boolean(p.pdfUrl));
  }

  if (options.publisherFilter && options.publisherFilter !== 'all') {
    if (options.publisherFilter === 'ieee') {
      filtered = filtered.filter((p) => p.publisherBadge === 'IEEE');
    } else if (options.publisherFilter === 'arxiv') {
      filtered = filtered.filter((p) => p.publisherBadge === 'arXiv' || Boolean(p.arxivId));
    } else if (options.publisherFilter === 'springer_elsevier') {
      filtered = filtered.filter((p) =>
        ['Springer', 'Elsevier', 'Nature', 'Wiley', 'ACM'].includes(p.publisherBadge)
      );
    } else if (options.publisherFilter === 'pubmed') {
      filtered = filtered.filter(
        (p) => p.publisherBadge === 'PubMed' || p.sources.includes('europepmc')
      );
    }
  }

  if (options.sort === 'citations') {
    filtered.sort((a, b) => b.citationCount - a.citationCount);
  } else if (options.sort === 'newest') {
    filtered.sort((a, b) => (b.year || 0) - (a.year || 0) || b.citationCount - a.citationCount);
  } else {
    // Balanced relevance: preserve provider rank while gently boosting multi-source matches & OA availability
    filtered = filtered
      .map((p, idx) => ({
        paper: p,
        score:
          100 -
          idx * 1.4 +
          (p.sources.length - 1) * 12 +
          (p.pdfUrl ? 6 : 0) +
          Math.min(20, Math.log10((p.citationCount || 0) + 1) * 5),
      }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.paper);
  }

  return filtered.slice(0, 40);
}
