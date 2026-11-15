// Trang Nhân viên (admin + manager).
//   Danh sách -> GET  /users?q=&role_id=&branch_id=&is_active=
//   Vai trò   -> GET  /roles        (manager chỉ nhận waiter/cashier/kitchen)
//   Chi nhánh -> GET  /branches     (chỉ admin cần; manager bị cố định chi nhánh của mình)
//   Thêm      -> POST /users        Sửa -> PUT /users/{id}
//   Khoá/mở   -> POST /users/{id}/lock | /unlock
// Phân quyền thật nằm ở backend; ở đây chỉ ẩn bớt nút cho gọn.

const me = Auth.getUser();
const isAdmin = me?.role?.name === "admin";

const form = document.getElementById("user-form");
const tableBody = document.getElementById("user-table-body");
const roleSelect = document.getElementById("role_id");
const branchSelect = document.getElementById("branch_id");
const branchField = document.getElementById("branch-field");
const passwordInput = document.getElementById("password");
const filterQ = document.getElementById("filter-q");
const filterRole = document.getElementById("filter-role");
const filterBranch = document.getElementById("filter-branch");
const filterActive = document.getElementById("filter-active");
const submitButton = document.getElementById("btn-submit");
const cancelButton = document.getElementById("btn-cancel");

const ROLE_VN = { admin: "Quản trị viên", manager: "Quản lý", cashier: "Thu ngân", waiter: "Phục vụ", kitchen: "Bếp" };
let editingId = null;
let roles = [];
let branches = [];
let managedRoleNames = new Set(); // vai trò mà người đang đăng nhập được phép quản lý

const roleName = (id) => roles.find((r) => r.id === Number(id))?.name;
const optionList = (items, label) => items.map((i) => `<option value="${i.id}">${escapeHtml(label(i))}</option>`).join("");

// ---------- Khởi tạo ----------
async function init() {
  try {
    roles = await api.get("/roles");
    managedRoleNames = new Set(roles.map((r) => r.name));
    roleSelect.innerHTML = optionList(roles, (r) => ROLE_VN[r.name] || r.name);
    filterRole.insertAdjacentHTML("beforeend", optionList(roles, (r) => ROLE_VN[r.name] || r.name));

    if (isAdmin) {
      branches = await api.get("/branches");
      filterBranch.hidden = false;
      filterBranch.insertAdjacentHTML("beforeend", optionList(branches, (b) => b.name));
      branchSelect.innerHTML = optionList(branches.filter((b) => b.is_active), (b) => b.name);
    } else {
      branchField.hidden = true; // manager: luôn là chi nhánh của mình, server tự gán
    }
    syncBranchField();
    loadUsers();
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-error">${escapeHtml(error.message)}</td></tr>`;
  }
}

// Admin không thuộc chi nhánh nào -> khoá ô chọn chi nhánh khi chọn vai trò admin
function syncBranchField() {
  if (!isAdmin) return;
  const forAdmin = roleName(roleSelect.value) === "admin";
  branchSelect.disabled = forAdmin;
  branchSelect.required = !forAdmin;
}
roleSelect.addEventListener("change", syncBranchField);

// ---------- Danh sách ----------
async function loadUsers() {
  tableBody.innerHTML = `<tr><td colspan="5" class="muted">Đang tải...</td></tr>`;
  const params = {};
  if (filterQ.value.trim()) params.q = filterQ.value.trim();
  if (filterRole.value) params.role_id = filterRole.value;
  if (filterBranch.value) params.branch_id = filterBranch.value;
  if (filterActive.value) params.is_active = filterActive.value;
  try {
    renderUsers(await api.get("/users", params));
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-error">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderUsers(users) {
  if (users.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="muted">Không có nhân viên nào</td></tr>`;
    return;
  }
  tableBody.innerHTML = users.map((u) => {
    const isSelf = u.id === me.id;
    const canManage = (!isSelf && managedRoleNames.has(u.role.name)) || (isSelf && isAdmin);
    const lockBtn = isSelf ? "" : (u.is_active
      ? `<button class="btn btn-small btn-danger" data-action="lock" data-id="${u.id}">Khoá</button>`
      : `<button class="btn btn-small" data-action="unlock" data-id="${u.id}">Mở</button>`);
    return `
    <tr class="${u.is_active ? "" : "row-inactive"}">
      <td><strong>${escapeHtml(u.full_name)}</strong>${isSelf ? ' <span class="muted">(bạn)</span>' : ""}
        <div class="muted">${escapeHtml(u.email)}</div>
        <div class="muted">${escapeHtml(u.phone)}</div></td>
      <td>${escapeHtml(ROLE_VN[u.role.name] || u.role.name)}</td>
      <td>${escapeHtml(u.branch?.name ?? "Tất cả")}</td>
      <td>${u.is_active ? '<span class="badge badge-success">Đang làm việc</span>' : '<span class="badge badge-muted">Đã khoá</span>'}</td>
      <td class="actions">${canManage ? `<button class="btn btn-small" data-action="edit" data-id="${u.id}">Sửa</button> ${lockBtn}` : ""}</td>
    </tr>`;
  }).join("");
}

[filterRole, filterBranch, filterActive].forEach((el) => el.addEventListener("change", loadUsers));
let timer;
filterQ.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(loadUsers, 300); });

// ---------- Thêm / Sửa ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = {
    full_name: form.full_name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim() || null,
    role_id: Number(roleSelect.value),
  };
  if (isAdmin) data.branch_id = roleName(roleSelect.value) === "admin" ? null : Number(branchSelect.value);
  if (editingId === null) {
    if (passwordInput.value.length < 8) return showToast("Mật khẩu tối thiểu 8 ký tự", "error");
    data.password = passwordInput.value;
  } else {
    if (passwordInput.value) {
      if (passwordInput.value.length < 8) return showToast("Mật khẩu mới tối thiểu 8 ký tự", "error");
      data.password = passwordInput.value;
    }
    data.is_active = form.is_active.checked;
  }

  submitButton.disabled = true;
  try {
    if (editingId === null) {
      await api.post("/users", data);
      showToast("Đã thêm nhân viên");
    } else {
      await api.put(`/users/${editingId}`, data);
      showToast("Đã cập nhật nhân viên");
    }
    resetForm();
    loadUsers();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

async function startEdit(id) {
  try {
    const u = await api.get(`/users/${id}`);
    editingId = id;
    form.full_name.value = u.full_name;
    form.email.value = u.email;
    form.phone.value = u.phone ?? "";
    passwordInput.value = "";
    passwordInput.required = false;
    document.getElementById("password-label").textContent = "Mật khẩu mới";
    document.getElementById("password-hint").textContent = "Để trống nếu không đổi mật khẩu.";
    roleSelect.value = u.role.id;
    roleSelect.disabled = id === me.id; // không tự đổi vai trò của mình
    if (isAdmin) branchSelect.value = u.branch_id ?? "";
    syncBranchField();
    form.is_active.checked = u.is_active;
    form.is_active.disabled = id === me.id;
    document.getElementById("active-row").hidden = false;
    document.getElementById("form-title").textContent = `Sửa nhân viên #${id}`;
    submitButton.textContent = "Lưu thay đổi";
    cancelButton.hidden = false;
    form.full_name.focus();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function resetForm() {
  editingId = null;
  form.reset();
  passwordInput.required = true;
  roleSelect.disabled = false;
  form.is_active.disabled = false;
  document.getElementById("password-label").textContent = "Mật khẩu *";
  document.getElementById("password-hint").textContent = "Tối thiểu 8 ký tự.";
  document.getElementById("active-row").hidden = true;
  document.getElementById("form-title").textContent = "Thêm nhân viên";
  submitButton.textContent = "Thêm";
  cancelButton.hidden = true;
  syncBranchField();
}
cancelButton.addEventListener("click", resetForm);

// ---------- Khoá / Mở ----------
async function setLock(id, lock) {
  if (lock && !confirm("Khoá tài khoản này? Họ sẽ bị đăng xuất và không đăng nhập được nữa.")) return;
  try {
    await api.post(`/users/${id}/${lock ? "lock" : "unlock"}`);
    showToast(lock ? "Đã khoá tài khoản" : "Đã mở khoá tài khoản");
    if (editingId === id) resetForm();
    loadUsers();
  } catch (error) {
    showToast(error.message, "error");
  }
}

tableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === "edit") startEdit(id);
  else setLock(id, button.dataset.action === "lock");
});

init();