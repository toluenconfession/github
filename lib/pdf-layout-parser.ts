import { BlockType, PdfTextBlock } from '@/types/scholar';

interface RawGlyphItem {
  str: string;
  x: number;
  xEnd: number;
  topY: number;
  fontSize: number;
}

interface LineSegment {
  text: string;
  xStart: number;
  xEnd: number;
  topY: number;
  fontSize: number;
  column: 'full' | 'left' | 'right';
}

const HEADING_REGEX =
  /^(abstract|keywords|index terms|introduction|related work|background|methodology|methods|proposed method|experiments?|experimental results?|results?|discussion|conclusion|conclusions|acknowledgm?ents?|references|appendix|[ivx]{1,5}\.\s+[a-z]|[0-9]+(\.[0-9]+)*\.?\s+[A-Z])/i;

const CAPTION_REGEX = /^(fig\.|figure|table|algorithm|scheme)\s*[0-9ivx]+/i;

function isLikelyEquation(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (t.length > 180) return false;
  const mathChars = (t.match(/[=+\-*/^_∑∫∏√∞≈≠≤≥±×÷∂∇α-ωΑ-Ω∈∉⊂⊆∪∩()[\]{}]/g) || []).length;
  const words = t.split(/\s+/).filter((w) => /^[a-zA-Z]{4,}$/.test(w)).length;
  if (/[=≈≤≥∑∫]/.test(t) && words <= 3 && mathChars >= 3) return true;
  if (/\(\d+\)\s*$/.test(t) && words <= 4 && mathChars >= 2) return true;
  return false;
}

/**
 * Extracts structured paragraphs in accurate reading order (supports IEEE/ACM 2-column
 * and standard 1-column scientific layouts, inspired by PDFMathTranslate / pdfminer).
 */
export function extractAcademicBlocksFromItems(
  rawItems: any[],
  pageWidth: number,
  pageHeight: number,
  pageNumber: number
): PdfTextBlock[] {
  const glyphs: RawGlyphItem[] = [];

  for (const item of rawItems) {
    if (!item || typeof item.str !== 'string') continue;
    const str = item.str;
    if (!str.trim()) continue;

    const tr = item.transform;
    if (!Array.isArray(tr) || tr.length < 6) continue;

    // Skip rotated vertical margin watermarks (e.g., arXiv left-margin stamp where scaleX ~ 0 and skew != 0)
    if (Math.abs(tr[0]) < 0.1 && Math.abs(tr[1]) > 0.5) continue;

    const fontSize = Math.max(6, Math.hypot(tr[0], tr[1]) || Math.abs(tr[3]) || 10);
    const x = tr[4];
    const pdfY = tr[5];
    const topY = pageHeight - pdfY;
    const width = typeof item.width === 'number' && item.width > 0 ? item.width : str.length * fontSize * 0.5;

    // Skip extreme top/bottom running page numbers if very short
    const yRatio = topY / Math.max(1, pageHeight);
    if ((yRatio < 0.032 || yRatio > 0.968) && str.trim().length <= 6 && /^\d+$/.test(str.trim())) {
      continue;
    }

    glyphs.push({
      str,
      x,
      xEnd: x + width,
      topY,
      fontSize,
    });
  }

  if (glyphs.length === 0) return [];

  // Sort primarily top-to-bottom, then left-to-right
  glyphs.sort((a, b) => (Math.abs(a.topY - b.topY) <= 3 ? a.x - b.x : a.topY - b.topY));

  // Group into horizontal rows, then split across column gutters
  const rows: RawGlyphItem[][] = [];
  for (const g of glyphs) {
    const lastRow = rows[rows.length - 1];
    if (!lastRow) {
      rows.push([g]);
      continue;
    }
    const avgTopY = lastRow.reduce((acc, it) => acc + it.topY, 0) / lastRow.length;
    const avgFont = lastRow.reduce((acc, it) => acc + it.fontSize, 0) / lastRow.length;
    if (Math.abs(g.topY - avgTopY) <= Math.max(3.5, avgFont * 0.48)) {
      lastRow.push(g);
    } else {
      rows.push([g]);
    }
  }

  const midX = pageWidth * 0.5;
  const rawSegments: Omit<LineSegment, 'column'>[] = [];

  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let current: RawGlyphItem[] = [row[0]];

    for (let i = 1; i < row.length; i++) {
      const prev = current[current.length - 1];
      const curr = row[i];
      const gap = curr.x - prev.xEnd;
      const crossesCenterGutter =
        prev.xEnd <= midX + pageWidth * 0.045 &&
        curr.x >= midX - pageWidth * 0.045 &&
        gap > Math.max(prev.fontSize * 1.4, pageWidth * 0.018);

      const hugeGap = gap > Math.max(prev.fontSize * 4.5, pageWidth * 0.08);

      if (crossesCenterGutter || hugeGap) {
        rawSegments.push(buildSegment(current));
        current = [curr];
      } else {
        current.push(curr);
      }
    }
    if (current.length > 0) {
      rawSegments.push(buildSegment(current));
    }
  }

  // Classify columns
  let leftCount = 0;
  let rightCount = 0;

  const classified: LineSegment[] = rawSegments
    .filter((s) => s.text.trim().length > 0)
    .map((s) => {
      const segWidth = s.xEnd - s.xStart;
      const isLeft = s.xEnd <= midX + pageWidth * 0.04 && segWidth < pageWidth * 0.52;
      const isRight = s.xStart >= midX - pageWidth * 0.04 && segWidth < pageWidth * 0.52;
      let column: 'full' | 'left' | 'right' = 'full';
      if (isLeft) {
        column = 'left';
        leftCount++;
      } else if (isRight) {
        column = 'right';
        rightCount++;
      }
      return { ...s, column };
    });

  const isTwoColumnPage = leftCount >= 5 && rightCount >= 5;

  let orderedSegments: LineSegment[] = [];
  if (!isTwoColumnPage) {
    orderedSegments = classified
      .map((s) => ({ ...s, column: 'full' as const }))
      .sort((a, b) => a.topY - b.topY);
  } else {
    // Find first Y where dual-column body starts
    const firstRightY =
      classified.find((s) => s.column === 'right')?.topY ?? pageHeight * 0.25;
    const headerThresholdY = firstRightY - 6;

    const topFull: LineSegment[] = [];
    const leftCol: LineSegment[] = [];
    const rightCol: LineSegment[] = [];
    const bottomFull: LineSegment[] = [];

    for (const seg of classified) {
      if (seg.column === 'left') {
        leftCol.push(seg);
      } else if (seg.column === 'right') {
        rightCol.push(seg);
      } else if (seg.topY <= headerThresholdY) {
        topFull.push(seg);
      } else if (seg.xStart < midX * 0.65 && seg.xEnd < pageWidth * 0.62) {
        leftCol.push({ ...seg, column: 'left' });
      } else {
        bottomFull.push(seg);
      }
    }

    topFull.sort((a, b) => a.topY - b.topY);
    leftCol.sort((a, b) => a.topY - b.topY);
    rightCol.sort((a, b) => a.topY - b.topY);
    bottomFull.sort((a, b) => a.topY - b.topY);

    orderedSegments = [...topFull, ...leftCol, ...rightCol, ...bottomFull];
  }

  // Median body font size for title/heading heuristics
  const sortedFonts = orderedSegments.map((s) => s.fontSize).sort((a, b) => a - b);
  const bodyFont = sortedFonts[Math.floor(sortedFonts.length / 2)] || 10;

  // Merge segments into paragraphs within each column stream
  const blocks: PdfTextBlock[] = [];
  let accLines: LineSegment[] = [];
  let inReferences = false;

  const flushParagraph = () => {
    if (accLines.length === 0) return;
    let combined = '';
    for (let i = 0; i < accLines.length; i++) {
      const piece = accLines[i].text.trim();
      if (!piece) continue;
      if (!combined) {
        combined = piece;
      } else if (
        /[a-zA-Z]-$/.test(combined) &&
        /^[a-z]/.test(piece)
      ) {
        // De-hyphenate line break (e.g., "architec-" + "ture" -> "architecture")
        combined = combined.slice(0, -1) + piece;
      } else {
        combined += ' ' + piece;
      }
    }

    combined = combined.replace(/\s+/g, ' ').trim();
    if (!combined) {
      accLines = [];
      return;
    }

    const first = accLines[0];
    const avgFont = accLines.reduce((s, l) => s + l.fontSize, 0) / accLines.length;

    let type: BlockType = 'paragraph';
    if (pageNumber === 1 && blocks.length === 0 && avgFont >= bodyFont * 1.28) {
      type = 'title';
    } else if (
      (accLines.length <= 3 && avgFont >= bodyFont * 1.15 && combined.length < 150) ||
      (accLines.length <= 2 && HEADING_REGEX.test(combined) && combined.length < 110)
    ) {
      type = 'heading';
      if (/^(references|[ivx]+\.\s*references|\d+\.?\s*references)$/i.test(combined)) {
        inReferences = true;
      }
    } else if (CAPTION_REGEX.test(combined)) {
      type = 'caption';
    } else if (isLikelyEquation(combined)) {
      type = 'equation';
    } else if (inReferences && /^\[\d+\]/.test(combined)) {
      type = 'reference';
    }

    blocks.push({
      id: `p${pageNumber}-b${blocks.length + 1}`,
      type,
      column: first.column,
      original: combined,
      yRatio: Math.min(0.98, Math.max(0.02, first.topY / Math.max(1, pageHeight))),
    });
    accLines = [];
  };

  for (const seg of orderedSegments) {
    if (accLines.length === 0) {
      accLines.push(seg);
      continue;
    }

    const prev = accLines[accLines.length - 1];
    const verticalGap = seg.topY - prev.topY;
    const fontDiff = Math.abs(seg.fontSize - prev.fontSize);

    const startsNewHeading =
      HEADING_REGEX.test(seg.text.trim()) && seg.text.trim().length < 95;
    const startsCaption = CAPTION_REGEX.test(seg.text.trim());
    const startsRefItem = inReferences && /^\[\d+\]/.test(seg.text.trim());
    const equationLine = isLikelyEquation(seg.text) || isLikelyEquation(prev.text);

    const shouldBreak =
      seg.column !== prev.column ||
      verticalGap > prev.fontSize * 1.68 ||
      verticalGap < -prev.fontSize * 1.5 ||
      fontDiff > 1.35 ||
      startsNewHeading ||
      startsCaption ||
      startsRefItem ||
      equationLine ||
      (prev.text.trim().endsWith('.') && accLines.length >= 9);

    if (shouldBreak) {
      flushParagraph();
    }
    accLines.push(seg);
  }

  flushParagraph();
  return blocks;
}

function buildSegment(items: RawGlyphItem[]): Omit<LineSegment, 'column'> {
  let text = '';
  for (let i = 0; i < items.length; i++) {
    const curr = items[i];
    if (i === 0) {
      text = curr.str;
    } else {
      const prev = items[i - 1];
      const gap = curr.x - prev.xEnd;
      const needSpace =
        !text.endsWith(' ') &&
        !curr.str.startsWith(' ') &&
        gap > curr.fontSize * 0.14;
      text += (needSpace ? ' ' : '') + curr.str;
    }
  }
  const avgTopY = items.reduce((s, it) => s + it.topY, 0) / items.length;
  const avgFont = items.reduce((s, it) => s + it.fontSize, 0) / items.length;
  return {
    text: text.replace(/\s+/g, ' ').trim(),
    xStart: items[0].x,
    xEnd: items[items.length - 1].xEnd,
    topY: avgTopY,
    fontSize: avgFont,
  };
}
