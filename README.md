# Frontend: Hệ thống quản lý nhà hàng (Nhóm 6)

Repo **frontend** của Nhóm 6, lớp **HN-KS25-CNTT1**, xây trên base của thầy. Không dùng framework, không cần cài đặt hay build gì. Đã có sẵn:

- Layout chung (header + menu + footer) cho mọi trang
- Module gọi API `js/api.js` dùng **axios**: cấu hình `baseURL` một lần, gom xử lý lỗi một chỗ bằng interceptor
- Trang chủ kiểm tra kết nối **Frontend → Backend → MySQL**
- Trang **Chi nhánh**: ví dụ CRUD đầy đủ (thêm / sửa / ngừng hoạt động / tìm kiếm) gọi sang backend FastAPI
- Bảng màu sang trọng (đen than, vàng champagne, màu da, nền ngà) khai báo ở `:root` trong `css/style.css`

## 1. Cấu trúc thư mục

```
frontend/
├── index.html             # Trang chủ (kiểm tra kết nối)
├── pages/
│   ├── admin/             # Trang nội bộ (nhân viên, quản lý)
│   │   └── branches.html  # Trang CRUD mẫu
│   └── customer/          # Trang cho khách (web đặt bàn, menu)
├── css/
│   └── style.css          # Style chung, đổi màu ở :root
├── js/
│   ├── config.js          # API_BASE_URL: địa chỉ backend
│   ├── api.js             # axios instance + api.get / post / put / delete
│   ├── utils.js           # escapeHtml, formatMoney, showToast...
│   ├── layout.js          # Chèn header/menu/footer vào mọi trang
│   └── pages/             # Mỗi trang 1 file JS riêng
│       ├── home.js
│       └── branches.js
└── assets/images/         # Ảnh, logo, icon
```

## 2. Chạy frontend

**Bước 1: chạy backend trước.** Làm theo `backend/README.md` cho đến khi mở http://127.0.0.1:8000/api/health thấy `"database":"connected"`.

**Bước 2: mở frontend bằng một web server.** Chọn 1 trong 2 cách:

- **VS Code + Live Server (khuyên dùng):** cài extension *Live Server* (Ritwick Dey), chuột phải `index.html` → **Open with Live Server**. Trang mở ở `http://127.0.0.1:5500/index.html` và tự tải lại khi bạn lưu file.
- **Có Python:** trong thư mục `frontend/` chạy `python -m http.server 5500`, rồi mở http://127.0.0.1:5500

Trang chủ hiện **✅ Backend OK · MySQL: connected** là FE đã nối được BE. Bấm menu **Chi nhánh** để thử thêm / sửa / ngừng hoạt động.

> Nhấp đúp mở thẳng file `index.html` (địa chỉ `file:///...`) thường vẫn chạy, nhưng hay gặp lỗi khó hiểu. Nên dùng Live Server.

## 3. Frontend nối với backend thế nào?

```
Trình duyệt (FE: 127.0.0.1:5500) --axios--> Backend FastAPI (127.0.0.1:8000/api) --> MySQL
```

- **axios** được nạp từ CDN bằng thẻ `<script>` ở cuối mỗi trang HTML (cần có mạng). Không cần `npm install`.

- Địa chỉ backend nằm ở **một chỗ duy nhất**: `js/config.js`
  ```js
  API_BASE_URL: "http://127.0.0.1:8000/api",
  ```
  Backend đổi cổng, hoặc deploy lên server, thì chỉ sửa dòng này.
- Mọi lời gọi API đều qua `js/api.js`. File này tạo sẵn 1 axios instance (`http`) có `baseURL`, và bọc thành các hàm trả về thẳng `response.data`:
  ```js
  try {
    const items = await api.get("/branches");            // GET  /api/branches
    const found = await api.get("/branches", { q: "quận" }); // GET /api/branches?q=quận
    const item  = await api.post("/branches", { name: "Chi nhánh Đà Nẵng", address: "..." });
    await api.put(`/branches/${item.id}`, { phone: "0236123456" });
    await api.delete(`/branches/${item.id}`);
  } catch (error) {
    showToast(error.message, "error");  // câu báo lỗi đã được dịch cho dễ đọc
    console.log(error.status);          // 404, 422, 500... hoặc 0 nếu không gọi được server
  }
  ```
- Cần gửi token đăng nhập kèm mọi request? Trong `js/api.js` đã có sẵn đoạn interceptor mẫu (đang comment), chỉ cần bỏ comment.
- Backend phải cho phép FE gọi (**CORS**). Base code backend đã bật sẵn (`CORS_ORIGINS=*` trong `backend/.env`).

## 4. Thêm trang mới (vd: trang Món ăn)

1. Copy `pages/admin/branches.html` thành `pages/admin/menu-items.html`, sửa `<title>` và nội dung HTML.
2. Copy `js/pages/branches.js` thành `js/pages/menu-items.js`, đổi `/branches` thành `/menu-items` (API của module bạn).
3. Ở cuối `menu-items.html`, đổi `../../js/pages/branches.js` thành `../../js/pages/menu-items.js`.
4. Thêm link vào menu trong `js/layout.js`:
   ```js
   { href: "pages/admin/menu-items.html", label: "Món ăn" },
   ```

Lưu ý khi tạo trang:

- Trang ở thư mục gốc: `<body data-root="./">`; trang trong `pages/`: `data-root="../"`; trang trong `pages/admin/` hoặc `pages/customer/`: `data-root="../../"`.
- Giữ thứ tự thẻ `<script>`: axios (CDN) → `config.js` → `api.js` → `utils.js` → `layout.js` → script riêng của trang.
- Khi chèn dữ liệu người dùng nhập vào `innerHTML`, luôn bọc bằng `escapeHtml(...)` để chống chèn mã độc (XSS).

## 5. Lỗi hay gặp

| Hiện tượng | Cách sửa |
|---|---|
| "Không kết nối được backend..." | Backend chưa chạy, hoặc `API_BASE_URL` trong `js/config.js` sai cổng |
| Console báo `axios is not defined` | Máy không có mạng nên không tải được axios từ CDN, hoặc thẻ `<script>` axios bị đặt sau `api.js` |
| "Backend chạy nhưng MySQL lỗi" | Xem mục *Lỗi hay gặp* trong `backend/README.md` |
| Console (F12) báo `blocked by CORS policy` | Kiểm tra `CORS_ORIGINS` trong `backend/.env`, sửa xong nhớ chạy lại backend |
| Menu/header không hiện | Sai `data-root` ở thẻ `<body>`, hoặc sai đường dẫn file JS. Mở F12 → Console để xem lỗi |
| Sửa code mà trang không đổi | Tải lại cứng: `Ctrl + F5` |

## 6. Quy ước làm việc của Nhóm 6

- Hai repo riêng: `backend` và `frontend`. Một chức năng dùng **cùng tên nhánh** ở cả 2 repo, vd `feature/m1-auth`.
- Không code trực tiếp trên `main`: tạo nhánh `feature/<module>-<việc>`, push, tạo Pull Request, bạn khác review rồi merge.
- Trang nội bộ để trong `pages/admin/`, trang cho khách để trong `pages/customer/`. Mỗi trang 1 file JS riêng trong `js/pages/`.
- File chung (`js/layout.js`, `css/style.css`): chỉ thêm đúng phần của mình (1 dòng menu, class mới), không đổi màu hay class có sẵn khi chưa báo nhóm.
