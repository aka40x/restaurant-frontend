// Trang Quản lý menu (module Menu và bàn). Gọi API backend (chỉ admin / manager):
//   GET   /categories                      danh mục (đổ vào ô lọc + form)
//   POST  /categories                      thêm danh mục nhanh
//   GET   /menu-items?q=&category_id=      danh sách món (tìm / lọc)
//   POST  /menu-items                      thêm món
//   PUT   /menu-items/{id}                 sửa món
//   PATCH /menu-items/{id}/availability    bật / tắt còn món
//   DELETE /menu-items/{id}                ngừng bán (xoá mềm: chỉ đặt is_active = false)
//   GET   /menu-items/{id}/options         tuỳ chọn của món
//   POST  /menu-items/{id}/options         thêm tuỳ chọn
//   PUT   /menu-item-options/{id}          sửa tuỳ chọn
//   DELETE /menu-item-options/{id}         ngừng tuỳ chọn (xoá mềm)
// Phân trang làm ở trình duyệt: backend trả cả danh sách, trang web cắt từng trang.

const PAGE_SIZE = 5;

// ---------- Lấy phần tử trên trang ----------
const itemForm = document.getElementById("item-form");
const itemFormTitle = document.getElementById("item-form-title");
const itemSubmit = document.getElementById("btn-item-submit");
const itemCancel = document.getElementById("btn-item-cancel");
const categorySelect = document.getElementById("category_id");
const addCategoryButton = document.getElementById("btn-add-category");

const searchInput = document.getElementById("search-input");
const filterCategory = document.getElementById("filter-category");
const itemBody = document.getElementById("item-table-body");
const pager = document.getElementById("pager");

const optionCard = document.getElementById("option-card");
const optionTitle = document.getElementById("option-title");
const optionBody = document.getElementById("option-table-body");
const optionForm = document.getElementById("option-form");
const optionFormTitle = document.getElementById("option-form-title");
const optionSubmit = document.getElementById("btn-option-submit");
const optionCancel = document.getElementById("btn-option-cancel");
const optionClose = document.getElementById("btn-option-close");

// ---------- Trạng thái của trang ----------
let categories = []; // danh sách danh mục
let allItems = []; // món lấy từ server (đã tìm / lọc)
let currentPage = 1;
let editingItemId = null; // null = đang thêm món; có số = đang sửa món đó
let optionItemId = null; // món đang xem tuỳ chọn
let currentOptions = [];
let editingOptionId = null; // null = đang thêm tuỳ chọn

// Chèn giá trị vào thuộc tính HTML (src="...") thì phải escape cả dấu "
const attr = (value) => escapeHtml(value).replace(/"/g, "&quot;");
const noImage = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><rect width="52" height="52" rx="6" fill="#f3e3b3"/>' +
  '<text x="26" y="34" font-size="24" text-anchor="middle">🍽</text></svg>');

// Link ảnh: bắt đầu bằng http(s):// thì dùng nguyên; còn lại (vd assets/images/menu/pizza.jpg)
// hiểu là file ảnh nằm trong thư mục frontend của dự án
const imgSrc = (url) => (/^(https?:|data:|\/)/.test(url) ? url : "../../" + url);

function categoryName(id) {
  const found = categories.find((c) => c.id === id);
  return found ? found.name : `#${id}`;
}

// Lỗi 401 (hết phiên) thì api.js đã tự chuyển về trang đăng nhập; ở đây chỉ hiện thông báo
function handleError(error) {
  showToast(error.message, "error");
}

// ---------- Danh mục ----------
async function loadCategories() {
  categories = await api.get("/categories");
  const options = categories
    .filter((c) => c.is_active)
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join("");
  const selectedFilter = filterCategory.value;
  const selectedForm = categorySelect.value;
  filterCategory.innerHTML = `<option value="">Tất cả danh mục</option>` + options;
  categorySelect.innerHTML = options;
  filterCategory.value = selectedFilter;
  if (selectedForm) categorySelect.value = selectedForm;
}

addCategoryButton.addEventListener("click", async () => {
  const name = prompt("Tên danh mục mới (VD: Món chính, Đồ uống):");
  if (!name || !name.trim()) return;
  try {
    const created = await api.post("/categories", { name: name.trim() });
    showToast("Đã thêm danh mục");
    await loadCategories();
    categorySelect.value = created.id; // chọn luôn danh mục vừa tạo
  } catch (error) {
    handleError(error);
  }
});

// ---------- Danh sách món ----------
async function loadAll() {
  itemBody.innerHTML = `<tr><td colspan="4" class="muted">Đang tải...</td></tr>`;
  try {
    await loadCategories();
    await loadItems();
  } catch (error) {
    itemBody.innerHTML = `<tr><td colspan="4" class="text-error">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadItems() {
  const params = {};
  if (searchInput.value.trim()) params.q = searchInput.value.trim();
  if (filterCategory.value) params.category_id = filterCategory.value;
  allItems = await api.get("/menu-items", params);
  currentPage = 1;
  renderItems();
}

// Tải lại danh sách nhưng ở nguyên trang đang xem
async function refreshKeepPage() {
  const page = currentPage;
  await loadItems();
  currentPage = page;
  renderItems();
}

function renderItems() {
  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const rows = allItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (rows.length === 0) {
    itemBody.innerHTML = `<tr><td colspan="4" class="muted">Không có món nào</td></tr>`;
  } else {
    itemBody.innerHTML = rows.map((m) => `
      <tr class="${m.is_active ? "" : "row-inactive"}">
        <td><img class="menu-thumb" src="${m.image_url ? attr(imgSrc(m.image_url)) : noImage}" alt="" onerror="this.onerror=null;this.src='${noImage}'"></td>
        <td>
          <strong>${escapeHtml(m.name)}</strong>
          <div class="muted">${escapeHtml(categoryName(m.category_id))}</div>
          <div style="margin-top:4px;">
            ${m.is_available
              ? '<span class="badge badge-success">Còn món</span>'
              : '<span class="badge badge-warning">Hết món</span>'}
            ${m.is_active ? "" : '<span class="badge badge-muted">Ngừng bán</span>'}
          </div>
        </td>
        <td class="price">${formatMoney(m.price)}</td>
        <td><div class="actions">
          <button class="btn btn-small" data-action="toggle" data-id="${m.id}">${m.is_available ? "Báo hết" : "Báo còn"}</button>
          <button class="btn btn-small" data-action="options" data-id="${m.id}">Tuỳ chọn</button>
          <button class="btn btn-small" data-action="edit" data-id="${m.id}">Sửa</button>
          ${m.is_active
            ? `<button class="btn btn-small btn-danger" data-action="deactivate" data-id="${m.id}">Ngừng</button>`
            : `<button class="btn btn-small" data-action="activate" data-id="${m.id}">Mở lại</button>`}
        </div></td>
      </tr>`).join("");
  }
  renderPager(totalPages);
}

function renderPager(totalPages) {
  let html = `<span class="info muted">Tổng ${allItems.length} món</span>`;
  html += `<button data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>‹</button>`;
  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`;
  }
  html += `<button data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>›</button>`;
  pager.innerHTML = html;
}

pager.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (!button || button.disabled) return;
  currentPage = Number(button.dataset.page);
  renderItems();
});

// Tìm kiếm: gõ xong 300ms mới gọi API (tránh gọi liên tục mỗi phím)
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadItems().catch(handleError), 300);
});
filterCategory.addEventListener("change", () => loadItems().catch(handleError));

// ---------- Thêm / sửa món ----------
itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const f = itemForm.elements;
  if (!f.category_id.value) {
    showToast('Chưa có danh mục. Bấm "+ Danh mục" để tạo trước.', "error");
    return;
  }
  const data = {
    category_id: Number(f.category_id.value),
    name: f.name.value.trim(),
    price: Number(f.price.value),
    image_url: f.image_url.value.trim() || null,
    description: f.description.value.trim() || null,
    is_available: f.is_available.checked,
    is_active: f.is_active.checked,
  };

  itemSubmit.disabled = true;
  try {
    if (editingItemId === null) {
      await api.post("/menu-items", data);
      showToast("Đã thêm món");
    } else {
      await api.put(`/menu-items/${editingItemId}`, data);
      showToast("Đã cập nhật món");
    }
    resetItemForm();
    await refreshKeepPage(); // ở nguyên trang đang xem
  } catch (error) {
    handleError(error);
  } finally {
    itemSubmit.disabled = false;
  }
});

function startEditItem(id) {
  const m = allItems.find((x) => x.id === id);
  if (!m) return;
  const f = itemForm.elements;
  editingItemId = id;
  f.category_id.value = m.category_id;
  f.name.value = m.name;
  f.price.value = Number(m.price);
  f.image_url.value = m.image_url ?? "";
  f.description.value = m.description ?? "";
  f.is_available.checked = m.is_available;
  f.is_active.checked = m.is_active;
  itemFormTitle.textContent = `Sửa món #${id}`;
  itemSubmit.textContent = "Lưu thay đổi";
  itemCancel.hidden = false;
  f.name.focus();
}

function resetItemForm() {
  editingItemId = null;
  itemForm.reset();
  itemFormTitle.textContent = "Thêm món";
  itemSubmit.textContent = "Thêm";
  itemCancel.hidden = true;
}
itemCancel.addEventListener("click", resetItemForm);

// ---------- Bật/tắt còn món, ngừng bán, mở lại ----------
async function toggleAvailable(id) {
  const m = allItems.find((x) => x.id === id);
  try {
    // api.js chưa có hàm patch nên gọi thẳng axios instance "http"
    await http.patch(`/menu-items/${id}/availability`, { is_available: !m.is_available });
    showToast(m.is_available ? "Đã đặt hết món" : "Đã đặt còn món");
    await refreshKeepPage();
  } catch (error) {
    handleError(error);
  }
}

async function deactivateItem(id) {
  if (!confirm(`Ngừng bán món #${id}? (món vẫn còn trong dữ liệu, có thể mở lại)`)) return;
  try {
    await api.delete(`/menu-items/${id}`);
    showToast("Đã ngừng bán món");
    if (editingItemId === id) resetItemForm();
    await refreshKeepPage();
  } catch (error) {
    handleError(error);
  }
}

async function activateItem(id) {
  try {
    await api.put(`/menu-items/${id}`, { is_active: true });
    showToast("Đã mở bán lại");
    await refreshKeepPage();
  } catch (error) {
    handleError(error);
  }
}

itemBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  if (action === "edit") startEditItem(id);
  if (action === "toggle") toggleAvailable(id);
  if (action === "options") openOptions(id);
  if (action === "deactivate") deactivateItem(id);
  if (action === "activate") activateItem(id);
});

// ---------- Tuỳ chọn của món ----------
async function openOptions(itemId) {
  optionItemId = itemId;
  const m = allItems.find((x) => x.id === itemId);
  optionTitle.textContent = `Tuỳ chọn của món: ${m ? m.name : "#" + itemId}`;
  resetOptionForm();
  optionCard.hidden = false;
  optionCard.scrollIntoView({ behavior: "smooth", block: "start" });
  await loadOptions();
}

async function loadOptions() {
  optionBody.innerHTML = `<tr><td colspan="7" class="muted">Đang tải...</td></tr>`;
  try {
    currentOptions = await api.get(`/menu-items/${optionItemId}/options`);
    renderOptions();
  } catch (error) {
    optionBody.innerHTML = `<tr><td colspan="7" class="text-error">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderOptions() {
  if (currentOptions.length === 0) {
    optionBody.innerHTML = `<tr><td colspan="7" class="muted">Món này chưa có tuỳ chọn</td></tr>`;
    return;
  }
  optionBody.innerHTML = currentOptions.map((o) => `
    <tr class="${o.is_active ? "" : "row-inactive"}">
      <td><strong>${escapeHtml(o.name)}</strong></td>
      <td>${escapeHtml(o.size ?? "")}</td>
      <td>${escapeHtml(o.topping ?? "")}</td>
      <td class="col-nowrap">+${formatMoney(o.extra_price)}</td>
      <td>${o.is_required ? '<span class="badge badge-info">Bắt buộc</span>' : "Không"}</td>
      <td>${o.is_active
        ? '<span class="badge badge-success">Áp dụng</span>'
        : '<span class="badge badge-muted">Ngừng</span>'}</td>
      <td><div class="actions">
        <button class="btn btn-small" data-action="edit" data-id="${o.id}">Sửa</button>
        ${o.is_active
          ? `<button class="btn btn-small btn-danger" data-action="deactivate" data-id="${o.id}">Ngừng</button>`
          : `<button class="btn btn-small" data-action="activate" data-id="${o.id}">Mở lại</button>`}
      </div></td>
    </tr>`).join("");
}

optionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const f = optionForm.elements;
  const data = {
    name: f.name.value.trim(),
    size: f.size.value.trim() || null,
    topping: f.topping.value.trim() || null,
    extra_price: Number(f.extra_price.value || 0),
    is_required: f.is_required.checked,
    is_active: f.is_active.checked,
  };

  optionSubmit.disabled = true;
  try {
    if (editingOptionId === null) {
      await api.post(`/menu-items/${optionItemId}/options`, data);
      showToast("Đã thêm tuỳ chọn");
    } else {
      await api.put(`/menu-item-options/${editingOptionId}`, data);
      showToast("Đã cập nhật tuỳ chọn");
    }
    resetOptionForm();
    await loadOptions();
  } catch (error) {
    handleError(error);
  } finally {
    optionSubmit.disabled = false;
  }
});

function startEditOption(id) {
  const o = currentOptions.find((x) => x.id === id);
  if (!o) return;
  const f = optionForm.elements;
  editingOptionId = id;
  f.name.value = o.name;
  f.size.value = o.size ?? "";
  f.topping.value = o.topping ?? "";
  f.extra_price.value = Number(o.extra_price);
  f.is_required.checked = o.is_required;
  f.is_active.checked = o.is_active;
  optionFormTitle.textContent = `Sửa tuỳ chọn #${id}`;
  optionSubmit.textContent = "Lưu thay đổi";
  optionCancel.hidden = false;
  f.name.focus();
}

function resetOptionForm() {
  editingOptionId = null;
  optionForm.reset();
  optionFormTitle.textContent = "Thêm tuỳ chọn";
  optionSubmit.textContent = "Thêm tuỳ chọn";
  optionCancel.hidden = true;
}
optionCancel.addEventListener("click", resetOptionForm);

optionClose.addEventListener("click", () => {
  optionCard.hidden = true;
  optionItemId = null;
});

optionBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  if (action === "edit") return startEditOption(id);
  try {
    if (action === "deactivate") {
      if (!confirm("Ngừng áp dụng tuỳ chọn này?")) return;
      await api.delete(`/menu-item-options/${id}`);
      showToast("Đã ngừng tuỳ chọn");
    }
    if (action === "activate") {
      await api.put(`/menu-item-options/${id}`, { is_active: true });
      showToast("Đã áp dụng lại tuỳ chọn");
    }
    if (editingOptionId === id) resetOptionForm();
    await loadOptions();
  } catch (error) {
    handleError(error);
  }
});

// ---------- Khởi động ----------
// Chỉ admin và manager được vào. Chưa đăng nhập / sai vai trò thì Auth tự chuyển sang trang khác.
Auth.requireRole(["manager"]);
const currentRole = Auth.getUser()?.role?.name;
if (Auth.isLoggedIn() && (currentRole === "admin" || currentRole === "manager")) {
  loadAll();
}