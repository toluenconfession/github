# ScholarFlow — Web Nghiên Cứu Khoa Học & Dịch PDF Song Song (Chuẩn Vercel 0đ)

Ứng dụng web tối giản phục vụ viết bài báo & nghiên cứu khoa học:
1. **Tìm kiếm đa nguồn (Từ khóa & Tác giả)**: Tổng hợp trực tiếp từ **OpenAlex, IEEE/Crossref, Semantic Scholar, arXiv, Europe PMC** và liên kết nhanh tới **Google Scholar, IEEE Xplore, ScienceDirect, SpringerLink, Connected Papers**.
2. **Trích dẫn 1-click & Danh mục References**: Tự động sinh trích dẫn chuẩn **IEEE `[1]`**, **APA 7th**, **MLA**, **Harvard**, **BibTeX (`.bib`)**.
3. **Mở khóa & Hướng dẫn tải bài báo bị tường phí**: Tự động quét bản Preprint mở hợp pháp (Unpaywall, kho ĐH, arXiv) và cung cấp 5 bước tải bài chi tiết + mẫu Email xin bài từ tác giả.
4. **Dịch PDF trực tiếp (Trái: PDF gốc — Phải: Bản dịch)**:
   - Tự động nhận diện bố cục bài báo 2 cột chuẩn IEEE / ACM / arXiv.
   - Bảo toàn phương trình toán học và trích dẫn `[1]`.
   - Hỗ trợ chế độ **Song ngữ** và gióng vị trí đoạn dịch sang PDF gốc khi nhấp chuột.
   - Miễn phí 100% không cần API key (hỗ trợ gắn thêm Gemini API Key cá nhân nếu muốn).

## Chạy thử trên máy tính

```bash
npm install
npm run dev
```

Mở `http://localhost:3000` trên trình duyệt.

## Đưa lên tên miền `.vercel.app` miễn phí (0đ)

1. Tạo một repository mới trên GitHub và đẩy thư mục `scholar-hub` này lên.
2. Đăng nhập [vercel.com](https://vercel.com) bằng tài khoản GitHub (Gói **Hobby — Free**).
3. Bấm **Add New... → Project** → chọn repository vừa tạo → bấm **Deploy** (không cần chỉnh sửa cấu hình hay nạp thẻ tín dụng).
4. Sau ~1 phút, bạn sẽ nhận ngay đường link `https://ten-du-an.vercel.app` để mọi người truy cập.
