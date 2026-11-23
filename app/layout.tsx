import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScholarFlow — Tra Cứu Bài Báo Khoa Học, Trích Dẫn & Dịch PDF Song Song',
  description:
    'Nền tảng nghiên cứu khoa học tinh gọn: Tìm bài báo theo từ khóa hoặc tác giả từ IEEE, OpenAlex, Semantic Scholar, arXiv, PubMed; tạo trích dẫn chuẩn IEEE/APA/BibTeX và dịch PDF song song Trái - Phải.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
