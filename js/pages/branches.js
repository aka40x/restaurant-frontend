// Trang Chi nhánh: ví dụ CRUD đầy đủ gọi sang backend.
//   Xem danh sách  -> GET    /branches?q=...
//   Thêm           -> POST   /branches
//   Sửa            -> PUT    /branches/{id}
//   Ngừng hoạt động-> DELETE /branches/{id}   (xoá mềm: chỉ đặt is_active = false)
//   Mở lại         -> PUT    /branches/{id}   {is_active: true}
// Làm module của mình: copy file này + pages/admin/branches.html rồi đổi "branches" thành tài nguyên của bạn.

const form = document.getElementById("branch-form");
const nameInput = document.getElementById("name");
const tableBody = document.getElementById("branch-table-body");
const searchInput = document.getElementById("search-input");
const formTitle = document.getElementById("form-title");
const submitButton = document.getElementById("btn-submit");
const cancelButton = document.getElementById("btn-cancel");

let editingId = null; // null = đang thêm mới; có số = đang sửa chi nhánh đó

// API trả giờ dạng "10:00:00", input type=time chỉ cần "10:00"
const hhmm = (t) => (t || "").slice(0, 5);

// ---------- Đọc dữ liệu ----------
async function loadBranches() {
  tableBody.innerHTML = `<tr><td colspan="5" class="muted">Đang tải...</td></tr>`;
  try {
    const keyword = searchInput.value.trim();
    const branches = await api.get("/branches", keyword ? { q: keyword } : undefined);
    renderBranches(branches);
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-error">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderBranches(branches) {
  if (branches.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="muted">Chưa có dữ liệu</td></tr>`;
    return;
  }
  tableBody.innerHTML = branches.map((b) => `
    <tr class="${b.is_active ? "" : "row-inactive"}">
      <td>${b.id}</td>
      <td>
        <strong>${escapeHtml(b.name)}</strong>
        <div class="muted">${escapeHtml(b.address)}</div>
        <div class="muted">${escapeHtml(b.phone)}</div>
      </td>
      <td>${hhmm(b.open_time)} - ${hhmm(b.close_time)}</td>
      <td>${b.is_active
        ? '<span class="badge badge-success">Đang hoạt động</span>'
        : '<span class="badge badge-muted">Ngừng hoạt động</span>'}</td>
      <td class="actions">
        <button class="btn btn-small" data-action="edit" data-id="${b.id}">Sửa</button>
        ${b.is_active
          ? `<button class="btn btn-small btn-danger" data-action="deactivate" data-id="${b.id}">Ngừng</button>`
          : `<button class="btn btn-small" data-action="activate" data-id="${b.id}">Mở lại</button>`}
      </td>
    </tr>`).join("");
}

// ---------- Thêm / Sửa ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault(); // không cho trình duyệt tự reload trang

  const data = {
    name: nameInput.value.trim(),
    address: form.address.value.trim(),
    phone: form.phone.value.trim() || null,
    open_time: form.open_time.value,
    close_time: form.close_time.value,
    is_active: form.is_active.checked,
  };

  submitButton.disabled = true;
  try {
    if (editingId === null) {
      await api.post("/branches", data);
      showToast("Đã thêm chi nhánh");
    } else {
      await api.put(`/branches/${editingId}`, data);
      showToast("Đã cập nhật chi nhánh");
    }
    resetForm();
    loadBranches();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

async function startEdit(id) {
  try {
    const b = await api.get(`/branches/${id}`);
    editingId = id;
    nameInput.value = b.name;
    form.address.value = b.address;
    form.phone.value = b.phone ?? "";
    form.open_time.value = hhmm(b.open_time);
    form.close_time.value = hhmm(b.close_time);
    form.is_active.checked = b.is_active;
    formTitle.textContent = `Sửa chi nhánh #${id}`;
    submitButton.textContent = "Lưu thay đổi";
    cancelButton.hidden = false;
    nameInput.focus();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = "Thêm chi nhánh";
  submitButton.textContent = "Thêm";
  cancelButton.hidden = true;
}

// ---------- Ngừng hoạt động / Mở lại ----------
async function deactivateBranch(id) {
  if (!confirm(`Ngừng hoạt động chi nhánh #${id}?`)) return;
  try {
    await api.delete(`/branches/${id}`);
    showToast("Đã ngừng hoạt động chi nhánh");
    if (editingId === id) resetForm();
    loadBranches();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function activateBranch(id) {
  try {
    await api.put(`/branches/${id}`, { is_active: true });
    showToast("Đã mở lại chi nhánh");
    loadBranches();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// Bắt sự kiện click cho các nút trong bảng (event delegation)
tableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === "edit") startEdit(id);
  if (button.dataset.action === "deactivate") deactivateBranch(id);
  if (button.dataset.action === "activate") activateBranch(id);
});

cancelButton.addEventListener("click", resetForm);

// Tìm kiếm: gõ xong 300ms mới gọi API (tránh gọi liên tục mỗi phím)
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadBranches, 300);
});

loadBranches();
