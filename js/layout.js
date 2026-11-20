// Layout chung: tự chèn header (menu) và footer vào mọi trang,
// để không phải copy lại HTML menu ở từng file.
//
// Mỗi trang cần có:  <body data-root="./">   (trang ở thư mục gốc)
//              hoặc  <body data-root="../">  (trang trong pages/)
//              hoặc  <body data-root="../../"> (trang trong pages/admin/, pages/staff/, pages/customer/, pages/account/)
// và hai thẻ rỗng:   <header id="app-header"></header> ... <footer id="app-footer"></footer>
// (cần nạp js/auth.js trước file này để hiện tên người đăng nhập và nút Đăng xuất)
//
// Trang nội bộ muốn có SIDEBAR theo vai trò: thêm  data-layout="admin"  vào <body>.

const MENU = [
  { href: "index.html", label: "Trang chủ" },
  { href: "pages/customer/menu.html", label: "Thực đơn" },
  { href: "pages/customer/branches.html", label: "Chi nhánh" },
  { href: "pages/customer/reservation.html", label: "Đặt bàn" },
  { href: "pages/admin/branches.html", label: "Chi nhánh", roles: ["admin"] },
  { href: "pages/admin/pos.html", label: "Gọi món", roles: ["waiter", "manager"] },
  { href: "pages/admin/kitchen.html", label: "Bếp", roles: ["kitchen", "waiter", "manager"] },
];

// Sidebar trang nội bộ. Thêm trang mới: thêm 1 dòng (roles = vai trò được thấy; admin luôn thấy).
const SIDEBAR = [
  { href: "pages/admin/index.html", label: "Tổng quan", roles: ["manager"] },
  { href: "pages/admin/branches.html", label: "Chi nhánh", roles: [] },
  { href: "pages/admin/users.html", label: "Nhân viên", roles: ["manager"] },
  { href: "pages/admin/menu.html", label: "Menu", roles: ["manager"] },
  { href: "pages/admin/tables.html", label: "Quản lý bàn", roles: ["manager"] },
  { href: "pages/admin/reservations.html", label: "Đặt bàn", roles: ["manager", "waiter"] },
  { href: "pages/staff/tables.html", label: "Sơ đồ bàn", roles: ["manager", "waiter"] },
  { href: "pages/admin/kitchen.html", label: "Màn hình bếp", roles: ["manager", "kitchen"] },
  { href: "pages/admin/inventory.html", label: "Kho", roles: ["manager"] },
  { href: "pages/staff/kitchen.html", label: "Màn hình bếp", roles: ["manager", "kitchen"] },
  { href: "pages/staff/payment.html", label: "Thanh toán", roles: ["manager", "cashier"] },
  { href: "pages/account/password.html", label: "Đổi mật khẩu", roles: ["manager", "waiter", "kitchen", "cashier"] },
];

// Chặn chèn HTML lạ khi đưa tên người dùng vào innerHTML
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

const canSee = (item, role) => !item.roles || role === "admin" || item.roles.includes(role);

function renderLayout() {
  const root = document.body.dataset.root || "./";
  const currentPath = window.location.pathname;
  const user = typeof Auth !== "undefined" ? Auth.getUser() : null;
  const role = user?.role?.name;
  const useSidebar = document.body.dataset.layout === "admin" && !!user;

  const isActive = (item) => currentPath.endsWith("/" + item.href) ||
    (item.href === "index.html" && currentPath.endsWith("/"));
  const linkHtml = (item) =>
    `<a href="${root}${item.href}" class="${isActive(item) ? "active" : ""}">${escapeHtml(item.label)}</a>`;

  const links = MENU.filter((item) => canSee(item, role)).map(linkHtml).join("");

  const userBox = user
    ? `<div class="user-box">
       <a href="${root}${Auth.homePath()}" class="btn-login">Vào trang làm việc</a>
       <span>${escapeHtml(user.full_name)} · ${escapeHtml(Auth.roleLabel(user))}</span>
       <button type="button" id="btn-logout" class="btn-logout">Đăng xuất</button>
     </div>`
    : `<div class="user-box"><a href="${root}pages/login.html" class="btn-login">Đăng nhập</a></div>`;

  document.getElementById("app-header").innerHTML = `
    <div class="container header-inner">
      <a href="${root}index.html" class="brand">
        <img src="${root}assets/images/logo.svg" alt="logo" width="28" height="28">
        <span>${CONFIG.APP_NAME}</span>
      </a>
      ${useSidebar ? "" : `<nav class="nav">${links}</nav>`}
      ${userBox}
    </div>`;

  document.getElementById("app-footer").innerHTML = `
    <div class="container">© ${new Date().getFullYear()} Nhóm 6 · Hệ thống quản lý nhà hàng · HN-KS25-CNTT1</div>`;

  document.getElementById("btn-logout")?.addEventListener("click", () => Auth.logout());

  if (useSidebar) renderSidebar(role, linkHtml);
}

// Bọc <main> của trang vào khung có sidebar bên trái (không cần sửa HTML từng trang)
function renderSidebar(role, linkHtml) {
  const main = document.querySelector("main");
  if (!main) return;
  const shell = document.createElement("div");
  shell.className = "admin-shell";
  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.innerHTML = `<nav aria-label="Menu quản lý">${SIDEBAR.filter((i) => canSee(i, role)).map(linkHtml).join("")}</nav>`;
  main.parentNode.insertBefore(shell, main);
  shell.append(aside, main);
  document.body.classList.add("has-sidebar");
}

renderLayout();