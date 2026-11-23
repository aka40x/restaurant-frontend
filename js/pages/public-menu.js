// Trang khách: thực đơn công khai, lọc theo nhóm món và tìm theo tên.
// API công khai (không cần đăng nhập): GET /public/categories, GET /public/menu-items
// (xem restaurant-backend/app/routers/public_menu.py).
const chipsBox = document.getElementById("chips");
const listBox = document.getElementById("menu-list");
const searchInput = document.getElementById("menu-search");

let categories = [];
let items = [];
let activeCategory = null; // null = tất cả
let keyword = "";

// image_url trong DB là đường dẫn trong frontend (vd assets/images/menu/a.svg) hoặc link đầy đủ
const imgSrc = (url) => (/^(https?:|data:|\/)/.test(url) ? url : "../../" + url);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
const categoryName = (id) => (categories.find((c) => c.id === id) || {}).name || "";
// escapeHtml chưa escape dấu " và ', nên khi chèn vào thuộc tính HTML (src, alt) phải dùng hàm này
const escapeAttr = (value) => escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function photoHtml(m) {
  return m.image_url
    ? `<img src="${escapeAttr(imgSrc(m.image_url))}" alt="${escapeAttr(m.name)}" loading="lazy">`
    : escapeHtml(m.name.charAt(0));
}

function dishHtml(m) {
  return `
    <article class="dish ${m.is_available ? "" : "is-soldout"}">
      <div class="dish-photo">${photoHtml(m)}</div>
      <div class="dish-body">
        <div class="dish-head">
          <h3>${escapeHtml(m.name)}</h3>
          <span class="price">${formatMoney(m.price)}</span>
        </div>
        ${m.description ? `<p>${escapeHtml(m.description)}</p>` : ""}
        <div class="dish-foot">
          ${m.is_available
            ? `<span class="badge badge-info">${escapeHtml(categoryName(m.category_id))}</span>`
            : `<span class="badge badge-muted">Tạm hết</span>`}
          <button type="button" class="dish-more" data-id="${m.id}">Xem chi tiết</button>
        </div>
      </div>
    </article>`;
}

// ---------- Hộp thoại chi tiết món ----------
const dishDialog = document.getElementById("dish-dialog");
function openDish(id) {
  const m = items.find((x) => x.id === id);
  if (!m) return;
  document.getElementById("dlg-photo").innerHTML = photoHtml(m);
  document.getElementById("dlg-title").textContent = m.name;
  document.getElementById("dlg-price").textContent = formatMoney(m.price);
  document.getElementById("dlg-soldout").hidden = m.is_available;  // món tạm hết: hiện nhãn "Tạm hết"
  document.getElementById("dlg-book").hidden = !m.is_available;   // món tạm hết: ẩn nút Đặt bàn
  document.getElementById("dlg-desc").textContent = m.description || "Món này chưa có mô tả.";  dishDialog.showModal();
}
document.getElementById("dlg-close").addEventListener("click", () => dishDialog.close());
dishDialog.addEventListener("click", (event) => { if (event.target === dishDialog) dishDialog.close(); }); // bấm ra ngoài thì đóng
listBox.addEventListener("click", (event) => {
  const button = event.target.closest(".dish-more");
  if (button) openDish(Number(button.dataset.id));
});

function renderChips() {
  const all = [{ id: null, name: "Tất cả" }, ...categories];
  chipsBox.innerHTML = all.map((c) =>
    `<button type="button" class="chip" data-id="${c.id ?? ""}" aria-pressed="${c.id === activeCategory}">${escapeHtml(c.name)}</button>`).join("");
}

function renderMenu() {
  const k = norm(keyword.trim());
  const shown = items.filter((m) =>
    (activeCategory === null || m.category_id === activeCategory) && (!k || norm(m.name).includes(k)));
  if (!shown.length) {
    listBox.innerHTML = `<p class="muted">Không có món nào khớp. Thử bỏ bộ lọc hoặc gõ tên khác.</p>`;
    return;
  }
  listBox.innerHTML = categories.map((c) => {
    const list = shown.filter((m) => m.category_id === c.id);
    return list.length ? `
      <section class="menu-section">
        <h2>${escapeHtml(c.name)}</h2>
        ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ""}
        <div class="dish-grid">${list.map(dishHtml).join("")}</div>
      </section>` : "";
  }).join("");
}

chipsBox.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  activeCategory = chip.dataset.id === "" ? null : Number(chip.dataset.id);
  renderChips();
  renderMenu();
});
searchInput.addEventListener("input", () => { keyword = searchInput.value; renderMenu(); });

async function loadMenu() {
  try {
    [categories, items] = await Promise.all([api.get("/public/categories"), api.get("/public/menu-items")]);
    categories = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    renderChips();
    renderMenu();
  } catch (error) {
    listBox.innerHTML = `<p class="text-error">${escapeHtml(error.message)}</p>`;
  }
}
loadMenu();