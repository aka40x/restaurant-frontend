// Layout chung: tự chèn header (menu) và footer vào mọi trang,
// để không phải copy lại HTML menu ở từng file.
//
// Mỗi trang cần có:  <body data-root="./">   (trang ở thư mục gốc)
//              hoặc  <body data-root="../">  (trang trong pages/)
//              hoặc  <body data-root="../../"> (trang trong pages/admin/ hoặc pages/customer/)
// và hai thẻ rỗng:   <header id="app-header"></header> ... <footer id="app-footer"></footer>

// Thêm trang mới vào menu: thêm 1 dòng vào mảng này (đường dẫn tính từ thư mục frontend/)
const MENU = [
  { href: "index.html", label: "Trang chủ" },
  { href: "index.html#experience", label: "Thực đơn" },
  { href: "pages/admin/branches.html", label: "Chi nhánh" },
  { href: "pages/customer/reservation.html", label: "Đặt bàn" },
  { href: "pages/customer/reservation-lookup.html", label: "Tra cứu đặt bàn" },
];

function renderLayout() {
  const root = document.body.dataset.root || "./";
  const currentPath = window.location.pathname;
  const reservationLayout = document.body.classList.contains("reservation-page");

  const links = MENU.map((item) => {
    const targetPath = item.href.split("#")[0];
    const isHome = targetPath === "index.html" && (currentPath.endsWith("/index.html") || currentPath.endsWith("/") || currentPath === "");
    const isActive = (currentPath.endsWith("/" + targetPath) || isHome) &&
      (targetPath !== "index.html" || !item.href.includes("#"));
    return `<a href="${root}${item.href}" class="${isActive ? "active" : ""}">${item.label}</a>`;
  }).join("");

  if (!reservationLayout) {
    document.getElementById("app-header").innerHTML = `
      <div class="container header-inner">
        <a href="${root}index.html" class="brand">
          <img src="${root}assets/images/logo.svg" alt="logo" width="28" height="28">
          <span>${CONFIG.APP_NAME}</span>
        </a>
        <nav class="nav">${links}</nav>
      </div>`;
    document.getElementById("app-footer").innerHTML = `
      <div class="container">© ${new Date().getFullYear()} Nhóm 6 · Hệ thống quản lý nhà hàng · HN-KS25-CNTT1</div>`;
    return;
  }

  document.getElementById("app-header").innerHTML = `
    <div class="container header-inner">
      <a href="${root}index.html" class="brand" aria-label="Nhà hàng">
      <span class="brand-copy"><strong>Nhà hàng</strong><small>ẨM THỰC THƯỢNG HẠNG</small></span>
      </a>
      <nav class="nav">${links}</nav>
      <div class="header-contact"><span>HOTLINE ĐẶT BÀN</span><strong>1900 8888</strong></div>
      <a class="header-book" href="${root}pages/customer/reservation.html">Đặt Bàn Ngay</a>
      <a class="account-link" href="${root}pages/admin/reservations.html" aria-label="Khu vực nhân viên" title="Khu vực nhân viên">
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <circle cx="10" cy="6.5" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>
          <path d="M4.5 17c.5-3 2.4-4.5 5.5-4.5s5 1.5 5.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </a>
    </div>`;

  document.getElementById("app-footer").innerHTML = `
    <div class="footer-main">
      <section>
        <h2 class="footer-brand">Nhà hàng</h2>
        <p>Nơi hội tụ tinh hoa ẩm thực truyền thống và đương đại, trao gửi trải nghiệm thưởng thức trong từng phong vị thuần khiết.</p>
        <span class="footer-label">Hotline: <strong class="footer-inline">1900 8888</strong></span>
        <span class="footer-label">Email: <strong class="footer-inline">concierge@nhahang.vn</strong></span>
      </section>
      <section>
        <h2>CHI NHÁNH HOẠT ĐỘNG</h2>
        <address><strong>Chi nhánh Quận 1</strong>Số 18 Đường Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh</address>
        <address><strong>Chi nhánh Hà Nội</strong>Số 36 Phố Lý Thường Kiệt, Quận Hoàn Kiếm, TP. Hà Nội</address>
      </section>
      <section>
        <h2>THỜI GIAN PHỤC VỤ</h2>
        <p><strong>Bữa Trưa</strong>11:30 - 14:30 (Thứ 2 - Chủ Nhật)</p>
        <p><strong>Bữa Tối &amp; Yến Tiệc</strong>17:30 - 22:30 (Thứ 2 - Chủ Nhật)</p>
        <p class="footer-note">Phục vụ phòng VIP theo yêu cầu riêng</p>
      </section>
      <section>
        <h2>ĐẶC QUYỀN HỘI VIÊN</h2>
        <p>Đăng ký nhận thư ngỏ về các thực đơn theo mùa, dạ tiệc rượu vang và sự kiện ẩm thực độc bản.</p>
        <form class="newsletter-form" id="newsletter-form">
          <label class="sr-only" for="newsletter-email">Địa chỉ email</label>
          <input id="newsletter-email" type="email" placeholder="Địa chỉ email của quý khách..." required>
          <button type="submit">Gửi</button>
        </form>
        <p class="footer-privacy">Chúng tôi cam kết bảo mật thông tin cá nhân.</p>
      </section>
    </div>
    <div class="footer-bottom">
      <span>© 2024 Nhà hàng Haute Cuisine Collection. Bản quyền thuộc về Nhà hàng.</span>
      <nav class="footer-links" aria-label="Chính sách">
        <a href="${root}pages/customer/reservation.html">Chính sách Đặt Bàn</a>
        <a href="${root}pages/customer/reservation.html#dress-code">Quy Chuẩn Trang Phục</a>
        <a href="mailto:concierge@nhahang.vn">Bảo Mật</a>
      </nav>
    </div>`;

  document.getElementById("newsletter-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Cảm ơn quý khách. Tính năng đăng ký sẽ sớm được mở.");
    event.currentTarget.reset();
  });
}

renderLayout();
