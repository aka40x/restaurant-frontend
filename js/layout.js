// Layout chung: tự chèn header (menu) và footer vào mọi trang,
// để không phải copy lại HTML menu ở từng file.
//
// Mỗi trang cần có:  <body data-root="./">   (trang ở thư mục gốc)
//              hoặc  <body data-root="../">  (trang trong pages/)
//              hoặc  <body data-root="../../"> (trang trong pages/admin/, pages/staff/ hoặc pages/customer/)
// và hai thẻ rỗng:   <header id="app-header"></header> ... <footer id="app-footer"></footer>
// (cần nạp js/auth.js trước file này để hiện tên người đăng nhập và nút Đăng xuất)

// Thêm trang mới vào menu: thêm 1 dòng vào mảng này (đường dẫn tính từ thư mục frontend/)
// roles: chỉ hiện mục này cho các vai trò liệt kê (không ghi roles = ai cũng thấy). admin thấy tất cả mục.
const MENU = [
  { href: "index.html", label: "Trang chủ" },
  { href: "pages/admin/branches.html", label: "Chi nhánh" },
  { href: "pages/admin/menu.html", label: "Menu" },
];

// Chặn chèn HTML lạ khi đưa tên người dùng vào innerHTML
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function renderLayout() {
  const root = document.body.dataset.root || "./";
  const currentPath = window.location.pathname;

  const links = MENU.map((item) => {
    const isActive = currentPath.endsWith("/" + item.href) ||
      (item.href === "index.html" && currentPath.endsWith("/"));
    return `<a href="${root}${item.href}" class="${isActive ? "active" : ""}">${item.label}</a>`;
  }).join("");

  // Chỉ hiện tên + nút Đăng xuất khi đã đăng nhập (trang chưa nạp auth.js thì bỏ qua)
  const user = typeof Auth !== "undefined" ? Auth.getUser() : null;
  const userBox = user
    ? `<div class="user-box">
         <span>${escapeHtml(user.full_name)} · ${escapeHtml(Auth.roleLabel(user))}</span>
         <button type="button" id="btn-logout" class="btn-logout">Đăng xuất</button>
       </div>`
    : "";

  document.getElementById("app-header").innerHTML = `
    <div class="container header-inner">
      <a href="${root}index.html" class="brand">
        <img src="${root}assets/images/logo.svg" alt="logo" width="28" height="28">
        <span>${CONFIG.APP_NAME}</span>
      </a>
      <nav class="nav">${links}</nav>
      ${userBox}
    </div>`;

  document.getElementById("app-footer").innerHTML = `
    <div class="container">© ${new Date().getFullYear()} Nhóm 6 · Hệ thống quản lý nhà hàng · HN-KS25-CNTT1</div>`;

  document.getElementById("btn-logout")?.addEventListener("click", () => Auth.logout());
}

renderLayout();