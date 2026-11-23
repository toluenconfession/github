export type PaperSource =
  | 'openalex'
  | 'semanticscholar'
  | 'arxiv'
  | 'crossref'
  | 'europepmc';

export type PublisherBadge =
  | 'IEEE'
  | 'Springer'
  | 'Elsevier'
  | 'ACM'
  | 'arXiv'
  | 'PubMed'
  | 'Wiley'
  | 'Nature'
  | 'MDPI'
  | 'Academic';

export interface PaperAuthor {
  name: string;
  affiliation?: string;
  id?: string;
}

export interface ScholarPaper {
  id: string;
  title: string;
  authors: PaperAuthor[];
  year: number | null;
  venue: string;
  publisher: string;
  publisherBadge: PublisherBadge;
  doi: string | null;
  url: string;
  pdfUrl: string | null;
  alternatePdfUrls: string[];
  isOpenAccess: boolean;
  citationCount: number;
  abstract: string | null;
  sources: PaperSource[];
  openAlexId?: string;
  semanticScholarId?: string;
  arxivId?: string;
  concepts?: string[];
}

export type SearchMode = 'all' | 'keyword' | 'author';
export type SortOption = 'relevance' | 'citations' | 'newest';
export type CitationStyle = 'ieee' | 'apa' | 'mla' | 'harvard' | 'bibtex';

export interface SearchResponse {
  papers: ScholarPaper[];
  query: string;
  mode: SearchMode;
  matchedAuthor?: {
    name: string;
    affiliation?: string;
    worksCount?: number;
    citedByCount?: number;
    orcid?: string;
  } | null;
  sourceStats: Record<string, number>;
}

export type BlockType =
  | 'title'
  | 'heading'
  | 'paragraph'
  | 'equation'
  | 'caption'
  | 'reference';

export interface PdfTextBlock {
  id: string;
  type: BlockType;
  column: 'full' | 'left' | 'right';
  original: string;
  translated?: string;
  yRatio: number;
}

export interface TranslatedPageData {
  pageNumber: number;
  blocks: PdfTextBlock[];
  status: 'idle' | 'extracting' | 'translating' | 'done' | 'error';
  error?: string;
}

export type TranslationEngine = 'free-google' | 'free-mymemory' | 'gemini';
