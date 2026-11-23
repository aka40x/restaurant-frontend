// Trang chủ: lấy tối đa 6 món đang bán + chi nhánh đang hoạt động từ API công khai.
// Mỗi khối tự báo lỗi riêng, một khối lỗi không làm hỏng cả trang.
// API: GET /public/categories, GET /public/menu-items, GET /branches (khách chỉ thấy chi nhánh đang hoạt động)

const hhmm = (t) => String(t || "").slice(0, 5); // "10:00:00" -> "10:00"
const minutes = (t) => { const [h, m] = hhmm(t).split(":").map(Number); return h * 60 + m; };
// escapeHtml chưa escape dấu " và ', nên khi chèn vào thuộc tính HTML (src, alt, href) phải dùng hàm này
const escapeAttr = (value) => escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function isOpenNow(b) {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const open = minutes(b.open_time), close = minutes(b.close_time);
  if (open === close) return true; // giờ mở = giờ đóng: hiểu là mở cả ngày
  return open <= close ? now >= open && now < close : now >= open || now < close;
}

// image_url trong DB là đường dẫn trong frontend (vd assets/images/menu/a.svg); trang chủ ở thư mục gốc nên dùng thẳng
function dishHtml(m, categoryName) {
  return `
    <article class="hp-dish">
      <div class="hp-dish-photo">
        ${m.image_url
          ? `<img src="${escapeAttr(m.image_url)}" alt="${escapeAttr(m.name)}" loading="lazy">`
          : `<div class="hp-noimg">Chưa có ảnh</div>`}
      </div>
      <div class="hp-dish-body">
        <div class="hp-dish-top">
          <h3 class="hp-dish-name">${escapeHtml(m.name)}</h3>
          <span class="hp-dish-price">${formatMoney(m.price)}</span>
        </div>
        <p class="hp-dish-desc">${escapeHtml(m.description || "Món đặc trưng của nhà hàng.")}</p>
        ${categoryName ? `<span class="hp-dish-cat">${escapeHtml(categoryName)}</span>` : ""}
      </div>
    </article>`;
}

async function loadFeatured() {
  const box = document.getElementById("featured-grid");
  box.innerHTML = Array(3).fill(`<div class="hp-skeleton"></div>`).join("");
  try {
    const [categories, items] = await Promise.all([api.get("/public/categories"), api.get("/public/menu-items")]);
    const name = (id) => categories.find((c) => c.id === id)?.name || "";
    const known = new Set(categories.map((c) => c.id)); // khớp trang menu: món thuộc danh mục đã ngừng thì không hiện
    const picks = items.filter((m) => m.is_available !== false && known.has(m.category_id)).slice(0, 6);
    box.innerHTML = picks.length
      ? picks.map((m) => dishHtml(m, name(m.category_id))).join("")
      : `<div class="hp-state">Thực đơn đang được cập nhật.</div>`;
  } catch (error) {
    box.innerHTML = `<div class="hp-state is-error">${escapeHtml(error.message)}</div>`;
  }
}

async function loadBranches() {
  const box = document.getElementById("branch-grid");
  try {
    const list = (await api.get("/branches", { only_active: true })).filter((b) => b.is_active);
    box.innerHTML = list.length
      ? list.map((b) => {
        const open = isOpenNow(b);
        return `
        <article class="hp-branch">
          <div class="hp-branch-top">
            <h3>${escapeHtml(b.name)}</h3>
            <span class="hp-open ${open ? "" : "is-closed"}">${open ? "Đang mở cửa" : "Đã đóng cửa"}</span>
          </div>
          <p>${escapeHtml(b.address)}</p>
          ${b.phone ? `<p><strong>Điện thoại:</strong> <a href="tel:${escapeAttr(b.phone)}">${escapeHtml(b.phone)}</a></p>` : ""}
          <p><strong>Giờ mở cửa:</strong> ${hhmm(b.open_time)} – ${hhmm(b.close_time)}</p>
          <a class="hp-btn hp-btn-line" href="pages/customer/reservation.html?branch_id=${b.id}">Đặt bàn tại đây</a>
        </article>`;
      }).join("")
      : `<div class="hp-state">Chưa có chi nhánh nào đang mở. Bạn quay lại sau nhé.</div>`;
  } catch (error) {
    box.innerHTML = `<div class="hp-state is-error">${escapeHtml(error.message)}</div>`;
  }
}

loadFeatured();
loadBranches();