import { NextRequest, NextResponse } from 'next/server';

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true;
  }
  if (/^(10\.|192\.168\.|169\.254\.|127\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url')?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Thiếu đường dẫn PDF.' }, { status: 400 });
  }

  let targetUrl = rawUrl;
  const arxivAbs = targetUrl.match(/^https?:\/\/arxiv\.org\/abs\/([^\s/?#]+)/i);
  if (arxivAbs) {
    targetUrl = `https://arxiv.org/pdf/${arxivAbs[1]}.pdf`;
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: 'Đường dẫn URL không hợp lệ.' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'Nguồn URL không được phép truy cập.' }, { status: 403 });
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(22000),
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Máy chủ nhà xuất bản trả về mã ${res.status}. Hãy tải file PDF về máy rồi kéo thả vào trình dịch.`,
        },
        { status: 422 }
      );
    }

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Check PDF magic header "%PDF-" within first 1024 bytes
    let hasPdfMagic = false;
    const scanLimit = Math.min(bytes.length - 4, 1024);
    for (let i = 0; i <= scanLimit; i++) {
      if (
        bytes[i] === 0x25 && // %
        bytes[i + 1] === 0x50 && // P
        bytes[i + 2] === 0x44 && // D
        bytes[i + 3] === 0x46 // F
      ) {
        hasPdfMagic = true;
        break;
      }
    }

    if (!hasPdfMagic) {
      return NextResponse.json(
        {
          error:
            'Đường dẫn này dẫn tới trang web tường phí (HTML) chứ không phải file PDF trực tiếp. Hãy bấm "Cách tải bài" hoặc tải PDF bằng trình duyệt rồi tải file lên.',
        },
        { status: 422 }
      );
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          'Không thể tải trực tiếp file PDF từ máy chủ gốc (có thể do tường lửa nhà xuất bản). Bạn hãy mở link gốc tải PDF về máy rồi chọn file tại đây.',
      },
      { status: 422 }
    );
  }
}
