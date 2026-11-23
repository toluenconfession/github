import { CitationStyle, ScholarPaper } from '@/types/scholar';

function splitName(fullName: string): { given: string[]; family: string } {
  const cleaned = fullName.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { given: [], family: 'Unknown' };
  if (cleaned.includes(',')) {
    const [family, rest] = cleaned.split(',', 2);
    return {
      family: family.trim(),
      given: (rest || '').trim().split(/\s+/).filter(Boolean),
    };
  }
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { given: [], family: parts[0] };
  return {
    family: parts[parts.length - 1],
    given: parts.slice(0, -1),
  };
}

function formatIeeeAuthor(name: string): string {
  const { given, family } = splitName(name);
  if (given.length === 0) return family;
  const initials = given.map((g) => `${g[0].toUpperCase()}.`).join(' ');
  return `${initials} ${family}`;
}

function formatApaAuthor(name: string): string {
  const { given, family } = splitName(name);
  if (given.length === 0) return family;
  const initials = given.map((g) => `${g[0].toUpperCase()}.`).join(' ');
  return `${family}, ${initials}`;
}

export function formatCitation(
  paper: ScholarPaper,
  style: CitationStyle,
  index = 1
): string {
  const authors = paper.authors.length > 0 ? paper.authors : [{ name: 'Unknown Author' }];
  const year = paper.year ? String(paper.year) : 'n.d.';
  const title = paper.title.replace(/\.$/, '').trim();
  const venue = paper.venue || paper.publisher || 'Academic Publication';
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : paper.url;

  switch (style) {
    case 'ieee': {
      let authorStr = '';
      if (authors.length > 6) {
        authorStr = `${formatIeeeAuthor(authors[0].name)} et al.`;
      } else if (authors.length === 1) {
        authorStr = formatIeeeAuthor(authors[0].name);
      } else if (authors.length === 2) {
        authorStr = `${formatIeeeAuthor(authors[0].name)} and ${formatIeeeAuthor(authors[1].name)}`;
      } else {
        const head = authors.slice(0, -1).map((a) => formatIeeeAuthor(a.name)).join(', ');
        authorStr = `${head}, and ${formatIeeeAuthor(authors[authors.length - 1].name)}`;
      }
      const doiPart = paper.doi
        ? `, doi: ${paper.doi}.`
        : paper.url
          ? `. [Online]. Available: ${paper.url}`
          : '.';
      return `[${index}] ${authorStr}, "${title}," ${venue}, ${year}${doiPart}`;
    }

    case 'apa': {
      let authorStr = '';
      if (authors.length === 1) {
        authorStr = formatApaAuthor(authors[0].name);
      } else if (authors.length <= 20) {
        const head = authors.slice(0, -1).map((a) => formatApaAuthor(a.name)).join(', ');
        authorStr = `${head}, & ${formatApaAuthor(authors[authors.length - 1].name)}`;
      } else {
        const first19 = authors.slice(0, 19).map((a) => formatApaAuthor(a.name)).join(', ');
        authorStr = `${first19}, ... ${formatApaAuthor(authors[authors.length - 1].name)}`;
      }
      return `${authorStr} (${year}). ${title}. ${venue}. ${doiUrl}`;
    }

    case 'mla': {
      let authorStr = '';
      const first = splitName(authors[0].name);
      const firstFormatted =
        first.given.length > 0 ? `${first.family}, ${first.given.join(' ')}` : first.family;
      if (authors.length === 1) {
        authorStr = firstFormatted;
      } else if (authors.length === 2) {
        authorStr = `${firstFormatted}, and ${authors[1].name}`;
      } else {
        authorStr = `${firstFormatted}, et al.`;
      }
      return `${authorStr.replace(/\.$/, '')}. "${title}." ${venue}, ${year}, ${doiUrl}.`;
    }

    case 'harvard': {
      let authorStr = '';
      if (authors.length <= 3) {
        authorStr = authors.map((a) => formatApaAuthor(a.name)).join('; ');
      } else {
        authorStr = `${formatApaAuthor(authors[0].name)} et al.`;
      }
      return `${authorStr} (${year}) '${title}', ${venue}. Available at: ${doiUrl}.`;
    }

    case 'bibtex': {
      const firstFamily = splitName(authors[0].name)
        .family.toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'paper';
      const firstTitleWord =
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .find((w) => w.length > 3) || 'study';
      const citeKey = `${firstFamily}${paper.year || 'nd'}${firstTitleWord}`;
      const bibAuthors = authors.map((a) => a.name).join(' and ');
      const isArxiv = paper.publisherBadge === 'arXiv' || venue.toLowerCase().includes('arxiv');
      const entryType = venue.toLowerCase().includes('conference') || venue.toLowerCase().includes('proceedings')
        ? 'inproceedings'
        : 'article';
      const venueField = entryType === 'inproceedings' ? 'booktitle' : 'journal';

      const lines = [
        `@${entryType}{${citeKey},`,
        `  title     = {${title}},`,
        `  author    = {${bibAuthors}},`,
        `  ${venueField} = {${venue}},`,
        `  year      = {${paper.year || ''}},`,
      ];
      if (paper.doi) lines.push(`  doi       = {${paper.doi}},`);
      if (isArxiv && paper.arxivId) lines.push(`  eprint    = {${paper.arxivId}},`);
      if (doiUrl) lines.push(`  url       = {${doiUrl}}`);
      lines.push(`}`);
      return lines.join('\n');
    }
  }
}

export function exportBibliography(papers: ScholarPaper[], style: CitationStyle): string {
  return papers
    .map((paper, idx) => formatCitation(paper, style, idx + 1))
    .join(style === 'bibtex' ? '\n\n' : '\n');
}

export function getExternalSearchLinks(query: string, mode: 'all' | 'keyword' | 'author' = 'all') {
  const encoded = encodeURIComponent(query.trim());
  const scholarQuery = mode === 'author' ? encodeURIComponent(`author:"${query.trim()}"`) : encoded;
  return [
    {
      name: 'Google Scholar',
      url: `https://scholar.google.com/scholar?q=${scholarQuery}`,
      badge: 'Scholar',
    },
    {
      name: 'IEEE Xplore',
      url:
        mode === 'author'
          ? `https://ieeexplore.ieee.org/search/searchresult.jsp?action=search&newsearch=true&matchBoolean=true&queryText=(%22Authors%22:${encoded})`
          : `https://ieeexplore.ieee.org/search/searchresult.jsp?newsearch=true&queryText=${encoded}`,
      badge: 'IEEE',
    },
    {
      name: 'ScienceDirect',
      url:
        mode === 'author'
          ? `https://www.sciencedirect.com/search?authors=${encoded}`
          : `https://www.sciencedirect.com/search?qs=${encoded}`,
      badge: 'Elsevier',
    },
    {
      name: 'SpringerLink',
      url: `https://link.springer.com/search?query=${encoded}`,
      badge: 'Springer',
    },
    {
      name: 'Connected Papers',
      url: `https://www.connectedpapers.com/search?q=${encoded}`,
      badge: 'Graph',
    },
  ];
}
