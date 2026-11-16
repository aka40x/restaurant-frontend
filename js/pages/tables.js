// Trang Quản lý bàn theo chi nhánh (module Menu và bàn). Gọi API backend (admin / manager):
//   GET    /branches                        chi nhánh (đổ vào ô chọn)
//   GET    /tables?branch_id=&q=            danh sách bàn (lọc theo chi nhánh, tìm theo số bàn)
//   POST   /tables                          thêm bàn
//   PUT    /tables/{id}                     sửa bàn (số bàn, số ghế, khu vực)
//   DELETE /tables/{id}                     ngừng sử dụng (xoá mềm: chỉ đặt is_active = false)
// Phân trang làm ở trình duyệt: backend trả cả danh sách, trang web cắt từng trang.

// Trạng thái bàn (trống / có khách / đã đặt) do hệ thống tự đổi khi đặt bàn, gọi món, thanh toán
// nên ở đây chỉ HIỂN THỊ, không cho nhập tay.
const PAGE_SIZE = 10;
const STATUS_LABEL = { available: "Trống", occupied: "Đang có khách", reserved: "Đã đặt trước" };
const STATUS_BADGE = { available: "badge-success", occupied: "badge-danger", reserved: "badge-warning" };

// ---------- Lấy phần tử trên trang ----------
const form = document.getElementById("table-form");
const formTitle = document.getElementById("form-title");
const submitButton = document.getElementById("btn-submit");
const cancelButton = document.getElementById("btn-cancel");
const branchSelect = document.getElementById("branch_id");
const areaList = document.getElementById("area-list");
const searchInput = document.getElementById("search-input");
const filterBranch = document.getElementById("filter-branch");
const tableBody = document.getElementById("table-body");
const pager = document.getElementById("pager");

// ---------- Trạng thái của trang ----------
let branches = [];
let allTables = []; // bàn lấy từ server (đã lọc / tìm)
let currentPage = 1;
let editingId = null; // null = đang thêm bàn; có số = đang sửa bàn đó

function branchName(id) {
  const found = branches.find((b) => b.id === id);
  return found ? found.name : `#${id}`;
}

// Lỗi 401 (hết phiên) thì api.js đã tự chuyển về trang đăng nhập; ở đây chỉ hiện thông báo
function handleError(error) {
  showToast(error.message, "error");
}

// ---------- Chi nhánh ----------
async function loadBranches() {
  branches = await api.get("/branches"); // admin thấy tất cả, manager chỉ thấy chi nhánh của mình
  const options = branches
    .filter((b) => b.is_active)
    .map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`)
    .join("");
  const selectedFilter = filterBranch.value;
  branchSelect.innerHTML = options;
  filterBranch.innerHTML = `<option value="">Tất cả chi nhánh</option>` +
    branches.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  filterBranch.value = selectedFilter;
}

// ---------- Danh sách bàn ----------
async function loadAll() {
  tableBody.innerHTML = `<tr><td colspan="6" class="muted">Đang tải...</td></tr>`;
  try {
    await loadBranches();
    await loadTables();
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-error">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadTables() {
  const params = {};
  if (searchInput.value.trim()) params.q = searchInput.value.trim();
  if (filterBranch.value) params.branch_id = filterBranch.value;
  allTables = await api.get("/tables", params);
  currentPage = 1;
  renderTables();
  updateAreaSuggestions();
}

// Tải lại danh sách nhưng ở nguyên trang đang xem
async function refreshKeepPage() {
  const page = currentPage;
  await loadTables();
  currentPage = page;
  renderTables();
}

// Gợi ý khu vực: lấy từ các bàn đã có để mọi người gõ cho thống nhất (Tầng 1, Sân vườn...)
function updateAreaSuggestions() {
  const areas = [...new Set(allTables.map((t) => t.area).filter(Boolean))].sort();
  areaList.innerHTML = areas.map((a) => `<option value="${escapeHtml(a).replace(/"/g, "&quot;")}"></option>`).join("");
}

function renderTables() {
  const totalPages = Math.max(1, Math.ceil(allTables.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const rows = allTables.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="muted">Không có bàn nào</td></tr>`;
  } else {
    tableBody.innerHTML = rows.map((t) => `
      <tr class="${t.is_active ? "" : "row-inactive"}">
        <td class="col-nowrap"><strong>${escapeHtml(t.table_number)}</strong></td>
        <td>${escapeHtml(branchName(t.branch_id))}</td>
        <td>${escapeHtml(t.area ?? "")}</td>
        <td>${t.capacity}</td>
        <td>
          ${t.is_active
            ? `<span class="badge ${STATUS_BADGE[t.status] ?? "badge-muted"}">${STATUS_LABEL[t.status] ?? escapeHtml(t.status)}</span>`
            : '<span class="badge badge-muted">Ngừng sử dụng</span>'}
        </td>
        <td><div class="actions">
          <button class="btn btn-small" data-action="edit" data-id="${t.id}">Sửa</button>
          ${t.is_active
            ? `<button class="btn btn-small btn-danger" data-action="deactivate" data-id="${t.id}">Ngừng</button>`
            : `<button class="btn btn-small" data-action="activate" data-id="${t.id}">Mở lại</button>`}
        </div></td>
      </tr>`).join("");
  }
  renderPager(totalPages);
}

function renderPager(totalPages) {
  let html = `<span class="info muted">Tổng ${allTables.length} bàn</span>`;
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
  renderTables();
});

// Tìm kiếm: gõ xong 300ms mới gọi API (tránh gọi liên tục mỗi phím)
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadTables().catch(handleError), 300);
});
filterBranch.addEventListener("change", () => loadTables().catch(handleError));

// ---------- Thêm / sửa bàn ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const f = form.elements;
  if (!f.branch_id.value) {
    showToast("Chưa có chi nhánh đang hoạt động để thêm bàn.", "error");
    return;
  }
  const data = {
    table_number: f.table_number.value.trim(),
    capacity: Number(f.capacity.value),
    area: f.area.value.trim() || null,
    is_active: f.is_active.checked,
  };

  submitButton.disabled = true;
  try {
    if (editingId === null) {
      await api.post("/tables", { branch_id: Number(f.branch_id.value), ...data });
      showToast("Đã thêm bàn");
    } else {
      // Không gửi branch_id: bàn đã tạo thì không đổi chi nhánh
      await api.put(`/tables/${editingId}`, data);
      showToast("Đã cập nhật bàn");
    }
    resetForm();
    await refreshKeepPage();
  } catch (error) {
    handleError(error); // VD: 409 "Số bàn 'A01' đã tồn tại trong chi nhánh..."
  } finally {
    submitButton.disabled = false;
  }
});

function startEdit(id) {
  const t = allTables.find((x) => x.id === id);
  if (!t) return;
  const f = form.elements;
  editingId = id;
  // Chi nhánh có thể đang ngừng hoạt động nên không có trong ô chọn: thêm tạm để hiển thị
  if (!branchSelect.querySelector(`option[value="${t.branch_id}"]`)) {
    branchSelect.insertAdjacentHTML("beforeend",
      `<option value="${t.branch_id}">${escapeHtml(branchName(t.branch_id))}</option>`);
  }
  f.branch_id.value = t.branch_id;
  f.branch_id.disabled = true;
  f.table_number.value = t.table_number;
  f.capacity.value = t.capacity;
  f.area.value = t.area ?? "";
  f.is_active.checked = t.is_active;
  formTitle.textContent = `Sửa bàn #${id}`;
  submitButton.textContent = "Lưu thay đổi";
  cancelButton.hidden = false;
  f.table_number.focus();
}

function resetForm() {
  editingId = null;
  form.reset();
  form.elements.branch_id.disabled = false;
  loadBranches().catch(handleError); // bỏ option chi nhánh thêm tạm ở chế độ sửa
  formTitle.textContent = "Thêm bàn";
  submitButton.textContent = "Thêm";
  cancelButton.hidden = true;
}
cancelButton.addEventListener("click", resetForm);

// ---------- Ngừng sử dụng, mở lại ----------
async function deactivateTable(id) {
  const t = allTables.find((x) => x.id === id);
  if (!confirm(`Ngừng sử dụng bàn ${t ? t.table_number : "#" + id}? (bàn vẫn còn trong dữ liệu, có thể mở lại)`)) return;
  try {
    await api.delete(`/tables/${id}`);
    showToast("Đã ngừng sử dụng bàn");
    if (editingId === id) resetForm();
    await refreshKeepPage();
  } catch (error) {
    handleError(error); // VD: 409 bàn đang có khách
  }
}

async function activateTable(id) {
  try {
    await api.put(`/tables/${id}`, { is_active: true });
    showToast("Đã mở lại bàn");
    await refreshKeepPage();
  } catch (error) {
    handleError(error);
  }
}

tableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  if (action === "edit") startEdit(id);
  if (action === "deactivate") deactivateTable(id);
  if (action === "activate") activateTable(id);
});

// ---------- Khởi động ----------
// Chỉ admin / manager được quản lý bàn (admin luôn được vào). Sai vai trò thì tự chuyển đi.
Auth.requireRole(["manager"]);
const currentRole = Auth.getUser()?.role?.name;
if (Auth.isLoggedIn() && (currentRole === "admin" || currentRole === "manager")) {
  loadAll();
}