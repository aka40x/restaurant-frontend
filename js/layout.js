// Layout chung: tự chèn header (menu) và footer vào mọi trang,
// để không phải copy lại HTML menu ở từng file.
//
// Mỗi trang cần có:  <body data-root="./">   (trang ở thư mục gốc)
//              hoặc  <body data-root="../">  (trang trong pages/)
//              hoặc  <body data-root="../../"> (trang trong pages/admin/, pages/staff/ hoặc pages/customer/)
// và hai thẻ rỗng:   <header id="app-header"></header> ... <footer id="app-footer"></footer>
// (cần nạp js/auth.js trước file này để hiện tên người đăng nhập và nút Đăng xuất)

// Thêm trang mới vào menu: thêm 1 dòng vào mảng này (đường dẫn tính từ thư mục frontend/)
const MENU = [
  { href: "index.html", label: "Trang chủ" },
  { href: "pages/admin/branches.html", label: "Chi nhánh" },
  { href: "pages/admin/menu.html", label: "Menu" },
];

function renderLayout() {
  const root = document.body.dataset.root || "./";
  const currentPath = window.location.pathname;
  const user = Auth.getUser();

  const links = MENU.map((item) => {
    const isActive = currentPath.endsWith("/" + item.href) ||
      (item.href === "index.html" && currentPath.endsWith("/"));
    return `<a href="${root}${item.href}" class="${isActive ? "active" : ""}">${item.label}</a>`;
  }).join("");

  // Bên phải header: đã đăng nhập thì hiện tên + vai trò + Đăng xuất, chưa thì hiện nút Đăng nhập
  const userBox = user
    ? `<div class="user-box">
         <a href="${root}${Auth.homePath(user)}" class="user-name">${escapeHtml(user.full_name)}</a>
         <span class="badge badge-info">${escapeHtml(Auth.roleLabel(user))}</span>
         <button id="btn-logout" class="btn btn-small" type="button">Đăng xuất</button>
       </div>`
    : `<a href="${root}pages/login.html" class="btn btn-small btn-primary">Đăng nhập</a>`;

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

  const logoutButton = document.getElementById("btn-logout");
  if (logoutButton) logoutButton.addEventListener("click", () => Auth.logout());
}

renderLayout();