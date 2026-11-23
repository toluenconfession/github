import { NextRequest, NextResponse } from 'next/server';
import {
  mergeAndRankPapers,
  searchArxiv,
  searchCrossref,
  searchEuropePmc,
  searchOpenAlex,
  searchSemanticScholar,
} from '@/lib/scholar-providers';
import { SearchMode, SearchResponse, SortOption } from '@/types/scholar';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('q') || '').trim();
  const mode = ((searchParams.get('mode') || 'all') as SearchMode);
  const yearFromRaw = searchParams.get('yearFrom');
  const yearFrom = yearFromRaw ? parseInt(yearFromRaw, 10) : undefined;
  const onlyPdf = searchParams.get('onlyPdf') === 'true';
  const publisherFilter = searchParams.get('publisher') || 'all';
  const sort = ((searchParams.get('sort') || 'relevance') as SortOption);

  if (!query) {
    return NextResponse.json(
      { error: 'Vui lòng nhập từ khóa hoặc tên tác giả.' },
      { status: 400 }
    );
  }

  const [oaRes, s2Res, crRes, axRes, pmcRes] = await Promise.allSettled([
    searchOpenAlex(query, mode, yearFrom, publisherFilter),
    searchSemanticScholar(query, mode, yearFrom),
    searchCrossref(query, mode, yearFrom, publisherFilter),
    searchArxiv(query, mode, yearFrom),
    searchEuropePmc(query, mode, yearFrom),
  ]);

  const oaPapers = oaRes.status === 'fulfilled' ? oaRes.value.papers : [];
  const matchedAuthor = oaRes.status === 'fulfilled' ? oaRes.value.matchedAuthor : null;
  const s2Papers = s2Res.status === 'fulfilled' ? s2Res.value : [];
  const crPapers = crRes.status === 'fulfilled' ? crRes.value : [];
  const axPapers = axRes.status === 'fulfilled' ? axRes.value : [];
  const pmcPapers = pmcRes.status === 'fulfilled' ? pmcRes.value : [];

  const papers = mergeAndRankPapers(
    [oaPapers, s2Papers, crPapers, axPapers, pmcPapers],
    {
      onlyPdf,
      publisherFilter,
      sort,
    }
  );

  const response: SearchResponse = {
    papers,
    query,
    mode,
    matchedAuthor,
    sourceStats: {
      OpenAlex: oaPapers.length,
      'Semantic Scholar': s2Papers.length,
      'Crossref / IEEE': crPapers.length,
      arXiv: axPapers.length,
      'Europe PMC': pmcPapers.length,
    },
  };

  return NextResponse.json(response);
}
