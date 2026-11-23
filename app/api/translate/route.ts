import { NextRequest, NextResponse } from 'next/server';
import { TranslationEngine } from '@/types/scholar';

// Open-source Lingva instances (inspired by GitHub thedaviddelta/lingva-translate)
const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://translate.plausibility.cloud',
];

async function translateViaGoogleFree(
  text: string,
  targetLang: string
): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    targetLang
  )}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`GTX status ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.[0])) throw new Error('Invalid GTX payload');

  return data[0]
    .map((segment: any) => (Array.isArray(segment) ? segment[0] || '' : ''))
    .join('')
    .trim();
}

async function translateViaLingva(
  text: string,
  targetLang: string
): Promise<string> {
  for (const base of LINGVA_INSTANCES) {
    try {
      const res = await fetch(
        `${base}/api/v1/auto/${encodeURIComponent(targetLang)}/${encodeURIComponent(text)}`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.translation) return String(data.translation).trim();
      }
    } catch {
      // try next instance
    }
  }
  throw new Error('Lingva instances unavailable');
}

async function translateViaMyMemory(
  text: string,
  targetLang: string
): Promise<string> {
  const chunk = text.slice(0, 490);
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${encodeURIComponent(targetLang)}`,
    { signal: AbortSignal.timeout(7000) }
  );
  if (!res.ok) throw new Error('MyMemory failed');
  const data = await res.json();
  return String(data?.responseData?.translatedText || text).trim();
}

async function translateSingleFree(
  text: string,
  targetLang: string,
  preferMyMemory = false
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return '';

  // Skip pure numbers, citations, or raw equations without letters
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount < 2) return trimmed;

  if (preferMyMemory && trimmed.length < 480) {
    try {
      return await translateViaMyMemory(trimmed, targetLang);
    } catch {
      // fallback to GTX
    }
  }

  try {
    return await translateViaGoogleFree(trimmed, targetLang);
  } catch {
    try {
      return await translateViaLingva(trimmed, targetLang);
    } catch {
      if (trimmed.length <= 490) {
        return await translateViaMyMemory(trimmed, targetLang);
      }
      throw new Error('Tất cả nguồn dịch miễn phí đang bận, vui lòng thử lại sau giây lát.');
    }
  }
}

async function translateBatchViaGemini(
  texts: string[],
  targetLang: string,
  apiKey: string
): Promise<string[]> {
  const langName =
    targetLang === 'vi'
      ? 'Vietnamese (academic scientific style)'
      : targetLang === 'en'
        ? 'English'
        : targetLang;

  const prompt = `You are a scientific paper translator (inspired by PDFMathTranslate).
Translate each JSON string element into ${langName}.
Rules:
1. Preserve academic precision, technical abbreviations (e.g., CNN, Transformer, IoT, OFDM, SNR), mathematical symbols, variables, and citation brackets like [1], [2, 5], (Smith et al., 2022).
2. Return ONLY a valid JSON array of strings with the EXACT same length (${texts.length}) in the exact same order. No markdown fences.

Input JSON:
${JSON.stringify(texts)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(25000),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API lỗi (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = await res.json();
  const rawOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const parsed = JSON.parse(rawOutput);
  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new Error('Gemini trả về số đoạn không khớp');
  }
  return parsed.map((item: any) => String(item ?? ''));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const texts: string[] = Array.isArray(body?.texts) ? body.texts : [];
    const targetLang: string = body?.targetLang || 'vi';
    const engine: TranslationEngine = body?.engine || 'free-google';
    const geminiApiKey: string | undefined = body?.geminiApiKey?.trim();

    if (texts.length === 0) {
      return NextResponse.json({ translations: [] });
    }

    if (engine === 'gemini' && geminiApiKey) {
      try {
        const translations = await translateBatchViaGemini(texts, targetLang, geminiApiKey);
        return NextResponse.json({ translations, usedEngine: 'gemini' });
      } catch (err: any) {
        return NextResponse.json(
          { error: err?.message || 'Không thể dịch bằng Gemini API Key đã nhập.' },
          { status: 400 }
        );
      }
    }

    // Parallel execution with concurrency 5 for smooth, fast, rate-limit-friendly translation
    const results = new Array<string>(texts.length).fill('');
    const concurrency = 5;
    let cursor = 0;

    async function worker() {
      while (cursor < texts.length) {
        const idx = cursor++;
        results[idx] = await translateSingleFree(
          texts[idx],
          targetLang,
          engine === 'free-mymemory'
        );
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, texts.length) }, () => worker())
    );

    return NextResponse.json({
      translations: results,
      usedEngine: engine,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Lỗi khi dịch nội dung PDF.' },
      { status: 500 }
    );
  }
}
