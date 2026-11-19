// Trang Kho (manager và admin): xem tồn kho nguyên liệu, nhập kho, kiểm kê, thêm nguyên liệu, cảnh báo sắp hết.
//   Xem tồn kho       -> GET  /inventory                    (admin thêm ?branch_id=)
//   Nhập thêm hàng    -> POST /inventory/{id}/receive       { amount }
//   Kiểm kê (sửa)     -> PUT  /inventory/{id}               { quantity, min_quantity }
//   Thêm nguyên liệu  -> POST /ingredients, rồi POST /inventory (đưa vào kho chi nhánh với tồn 0)
//   Chi nhánh (admin) -> GET  /branches
// {id} là id dòng tồn kho (trường "id" của mỗi dòng trong GET /inventory), không phải ingredient_id.
// Tìm theo tên và lọc "Chỉ sắp hết" làm ngay trên trình duyệt từ dữ liệu đã tải (mỗi dòng có cờ is_low).

(() => {
  const user = Auth.getUser();
  const isAdmin = user?.role?.name === "admin";

  const tableBody = document.getElementById("inventory-body");
  const summary = document.getElementById("summary");
  const searchInput = document.getElementById("search-input");
  const filterSelect = document.getElementById("filter-select");
  const branchSelect = document.getElementById("branch-select");
  const addButton = document.getElementById("btn-add-ingredient");

  const receiveDialog = document.getElementById("dlg-receive");
  const receiveForm = document.getElementById("form-receive");
  const receiveAmount = document.getElementById("receive-amount");
  const editDialog = document.getElementById("dlg-edit");
  const editForm = document.getElementById("form-edit");
  const editQuantity = document.getElementById("edit-quantity");
  const editMin = document.getElementById("edit-min");
  const ingredientDialog = document.getElementById("dlg-ingredient");
  const ingredientForm = document.getElementById("form-ingredient");
  const ingredientName = document.getElementById("ingredient-name");
  const ingredientUnit = document.getElementById("ingredient-unit");

  let items = [];             // các dòng tồn kho đang hiện (từ API)
  let currentBranchId = null; // admin chọn; manager để backend tự lấy chi nhánh của mình
  let activeItem = null;      // dòng đang nhập kho / kiểm kê
  let busy = false;           // đang gửi yêu cầu (chặn bấm đúp)

  const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
  const formatQty = (value) => numberFormat.format(Number(value));

  // Bỏ dấu và chữ hoa để tìm "bot mi" ra "Bột mì"
  const plain = (text) =>
    String(text ?? "").toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // ---------- Hiển thị bảng ----------
  function rowHtml(item) {
    return `
      <tr class="${item.is_low ? "row-low" : ""}">
        <td><strong>${escapeHtml(item.ingredient_name)}</strong></td>
        <td>${escapeHtml(item.unit)}</td>
        <td class="text-right">${formatQty(item.quantity)}</td>
        <td class="text-right">${formatQty(item.min_quantity)}</td>
        <td>${item.is_low
          ? '<span class="badge badge-warning">Sắp hết</span>'
          : '<span class="badge badge-success">Đủ hàng</span>'}</td>
        <td class="actions">
          <button type="button" class="btn btn-small" data-action="receive" data-id="${item.id}">Nhập kho</button>
          <button type="button" class="btn btn-small" data-action="edit" data-id="${item.id}">Sửa</button>
        </td>
      </tr>`;
  }

  function render() {
    const keyword = plain(searchInput.value.trim());
    const lowOnly = filterSelect.value === "low";
    const shown = items.filter((item) =>
      (!lowOnly || item.is_low) && plain(item.ingredient_name).includes(keyword));
    const lowCount = items.filter((item) => item.is_low).length;

    summary.textContent = items.length > 0 ? `${items.length} nguyên liệu · ${lowCount} sắp hết` : "";
    if (shown.length === 0) {
      const text = items.length === 0 ? "Chưa có dữ liệu" : "Không có nguyên liệu phù hợp";
      tableBody.innerHTML = `<tr><td colspan="6" class="muted">${text}</td></tr>`;
      return;
    }
    tableBody.innerHTML = shown.map(rowHtml).join("");
  }

  // ---------- Đọc dữ liệu ----------
  async function loadInventory() {
    tableBody.innerHTML = `<tr><td colspan="6" class="muted">Đang tải...</td></tr>`;
    try {
      const params = isAdmin && currentBranchId ? { branch_id: currentBranchId } : undefined;
      items = await api.get("/inventory", params);
      render();
    } catch (error) {
      items = [];
      summary.textContent = "";
      tableBody.innerHTML = `<tr><td colspan="6" class="text-error">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function loadBranches() {
    try {
      const branches = (await api.get("/branches")).filter((b) => b.is_active);
      branchSelect.innerHTML = branches
        .map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`)
        .join("");
      currentBranchId = branches.length > 0 ? Number(branches[0].id) : null;
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  // Cập nhật đúng dòng vừa sửa bằng dữ liệu server trả về, không phải tải lại cả bảng
  function replaceItem(updated) {
    items = items.map((item) => (item.id === updated.id ? updated : item));
    render();
  }

  // Gửi yêu cầu: chặn bấm đúp, khoá nút trong lúc gửi, lỗi từ backend hiện bằng toast
  async function runSubmit(form, action) {
    if (busy) return;
    const button = form.querySelector('button[type="submit"]');
    busy = true;
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  // ---------- Nhập kho ----------
  function openReceive(item) {
    activeItem = item;
    receiveDialog.querySelector("#receive-name strong").textContent = `${item.ingredient_name} (${item.unit})`;
    document.getElementById("receive-hint").textContent = `Tồn hiện tại: ${formatQty(item.quantity)} ${item.unit}`;
    receiveForm.reset();
    receiveDialog.showModal();
    receiveAmount.focus();
  }

  receiveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeItem) return;
    const raw = receiveAmount.value.trim();
    const amount = Number(raw);
    if (raw === "" || !Number.isFinite(amount) || amount <= 0) {
      showToast("Số lượng nhập phải lớn hơn 0", "error");
      receiveAmount.focus();
      return;
    }
    runSubmit(receiveForm, async () => {
      const updated = await api.post(`/inventory/${activeItem.id}/receive`, { amount });
      replaceItem(updated);
      receiveDialog.close();
      showToast("Đã nhập kho");
    });
  });

  // ---------- Kiểm kê ----------
  function openEdit(item) {
    activeItem = item;
    editDialog.querySelector("#edit-name strong").textContent = `${item.ingredient_name} (${item.unit})`;
    editQuantity.value = Number(item.quantity);
    editMin.value = Number(item.min_quantity);
    editDialog.showModal();
    editQuantity.focus();
  }

  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeItem) return;
    const quantityRaw = editQuantity.value.trim();
    const minRaw = editMin.value.trim();
    const quantity = Number(quantityRaw);
    const minimum = Number(minRaw);
    if (quantityRaw === "" || minRaw === "" || !Number.isFinite(quantity) || !Number.isFinite(minimum)
        || quantity < 0 || minimum < 0) {
      showToast("Tồn kho và mức tối thiểu phải là số không âm", "error");
      return;
    }
    runSubmit(editForm, async () => {
      const updated = await api.put(`/inventory/${activeItem.id}`, { quantity, min_quantity: minimum });
      replaceItem(updated);
      editDialog.close();
      showToast("Đã cập nhật kho");
    });
  });

  // ---------- Thêm nguyên liệu ----------
  addButton.addEventListener("click", () => {
    ingredientForm.reset();
    ingredientDialog.showModal();
    ingredientName.focus();
  });

  ingredientForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = ingredientName.value.trim();
    const unit = ingredientUnit.value.trim();
    if (!name || !unit) {
      showToast("Hãy nhập tên và đơn vị của nguyên liệu", "error");
      return;
    }
    const branchId = isAdmin ? currentBranchId : user?.branch_id;
    if (!branchId) {
      showToast("Chưa xác định được chi nhánh để thêm vào kho", "error");
      return;
    }
    runSubmit(ingredientForm, async () => {
      // Tên trùng thì bước này trả 409 kèm câu thông báo của backend
      const ingredient = await api.post("/ingredients", { name, unit });
      await api.post("/inventory", { branch_id: Number(branchId), ingredient_id: ingredient.id, quantity: 0, min_quantity: 0 });
      ingredientDialog.close();
      showToast("Đã thêm nguyên liệu");
      await loadInventory();
    });
  });

  // ---------- Sự kiện chung ----------
  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = items.find((i) => i.id === Number(button.dataset.id));
    if (!item) return;
    if (button.dataset.action === "receive") openReceive(item);
    if (button.dataset.action === "edit") openEdit(item);
  });

  // Nút "Huỷ" trong mọi hộp thoại
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-close]");
    if (button) button.closest("dialog").close();
  });

  searchInput.addEventListener("input", render);
  filterSelect.addEventListener("change", render);
  branchSelect.addEventListener("change", () => {
    currentBranchId = Number(branchSelect.value);
    loadInventory();
  });

  // ---------- Khởi động ----------
  async function init() {
    // Trang Tổng quan bấm vào "N sắp hết" sẽ mở trang này kèm ?low=true
    if (new URLSearchParams(window.location.search).get("low") === "true") filterSelect.value = "low";
    if (isAdmin) {
      branchSelect.hidden = false;
      await loadBranches();
    }
    await loadInventory();
  }
  init();
})();
