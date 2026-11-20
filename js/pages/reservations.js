// Trang Quản lý đặt bàn (manager, waiter, admin). Gọi API backend:
//   GET  /branches                        chi nhánh (đổ vào ô lọc)
//   GET  /reservations?branch_id=&date=&status=   lịch đặt bàn
//   GET  /tables?branch_id=&only_active=true       bàn của chi nhánh (để xếp bàn)
//   PUT  /reservations/{id}/confirm       xác nhận
//   PUT  /reservations/{id}/table         xếp / đổi bàn  {table_id}
//   PUT  /reservations/{id}/check-in      khách đến: mở order cho bàn
//   PUT  /reservations/{id}/no-show       đánh dấu không đến
//   PUT  /reservations/{id}/cancel        nhân viên huỷ
// Danh sách chia theo khung giờ (mỗi giờ một nhóm). Hệ thống tự đánh dấu "không đến" sau 30 phút quá giờ,
// nên trang tự tải lại mỗi phút.

const HOLD_MINUTES = 120; // khớp backend: một bàn không được có 2 đặt bàn cách nhau dưới 2 giờ
const ACTIVE = ["pending", "confirmed", "seated"];

const filterBranch = document.getElementById("filter-branch");
const filterDay = document.getElementById("filter-day");
const filterStatus = document.getElementById("filter-status");
const filterQ = document.getElementById("filter-q");
const listSummary = document.getElementById("list-summary");
const slotSummary = document.getElementById("slot-summary");
const tbody = document.getElementById("reservation-table-body");
const detailEmpty = document.getElementById("detail-empty");
const detailBody = document.getElementById("detail-body");
const detailStatus = document.getElementById("detail-status");
const detailInfo = document.getElementById("detail-info");
const tableBox = document.getElementById("table-box");
const tableSelect = document.getElementById("table-select");
const tableHint = document.getElementById("table-hint");
const detailActions = document.getElementById("detail-actions");

let reservations = []; // đặt bàn của ngày đang xem (đã lọc ở server)
let selectedId = null;
const tablesByBranch = {}; // cache bàn theo chi nhánh
let busy = false; // đang gọi API: chặn bấm trùng

const user = Auth.getUser();
const isAdmin = user?.role?.name === "admin";

function handleError(error) {
  showToast(error.message, "error"); // 401 hết phiên: api.js tự chuyển về trang đăng nhập
}

// ---------- Tải dữ liệu ----------
async function loadBranches() {
  const branches = await api.get("/branches");
  filterBranch.innerHTML = (isAdmin ? `<option value="">Tất cả chi nhánh</option>` : "") +
    branches.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  if (!isAdmin && user?.branch_id) {
    filterBranch.value = String(user.branch_id);
    filterBranch.disabled = true; // nhân viên chỉ làm việc ở chi nhánh của mình
  }
}

async function loadReservations() {
  try {
    reservations = await api.get("/reservations", {
      branch_id: filterBranch.value || undefined,
      date: filterDay.value || undefined,
      status: filterStatus.value || undefined,
    });
  } catch (error) {
    reservations = [];
    handleError(error);
  }
  render();
}

async function getTables(branchId) {
  if (!tablesByBranch[branchId]) {
    tablesByBranch[branchId] = await api.get("/tables", { branch_id: branchId, only_active: true });
  }
  return tablesByBranch[branchId];
}

// ---------- Danh sách theo khung giờ ----------
function visibleReservations() {
  const keyword = filterQ.value.trim().toLowerCase();
  if (!keyword) return reservations;
  return reservations.filter((r) =>
    [r.code, r.guest_name, r.guest_phone].some((text) => String(text).toLowerCase().includes(keyword)));
}

function quickButtons(r) {
  if (r.status === "pending") {
    return `<button type="button" class="btn btn-small btn-primary" data-act="confirm" data-id="${r.id}">Xác nhận</button>`;
  }
  if (r.status === "confirmed" && r.table) {
    return `<button type="button" class="btn btn-small btn-primary" data-act="check-in" data-id="${r.id}">Check-in</button>`;
  }
  if (r.status === "confirmed") {
    return `<span class="muted">Cần xếp bàn</span>`;
  }
  return "";
}

function render() {
  const rows = visibleReservations();
  const guests = rows.reduce((sum, r) => sum + r.party_size, 0);
  listSummary.textContent = rows.length
    ? `${rows.length} đặt bàn · ${guests} khách`
    : "Không có đặt bàn nào theo bộ lọc này.";

  // Đếm theo trạng thái (đầu danh sách)
  const counts = {};
  rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  slotSummary.innerHTML = Object.entries(RESERVATION_STATUS)
    .filter(([status]) => counts[status])
    .map(([status]) => `${reservationBadge(status)} <strong>${counts[status]}</strong>`)
    .join(" &nbsp; ");

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Không có đặt bàn.</td></tr>`;
    return;
  }

  let html = "";
  let currentHour = null;
  rows.forEach((r) => {
    const hour = new Date(r.reserved_at).getHours();
    if (hour !== currentHour) {
      currentHour = hour;
      const group = rows.filter((x) => new Date(x.reserved_at).getHours() === hour);
      const seats = group.reduce((sum, x) => sum + x.party_size, 0);
      html += `<tr class="slot-row"><td colspan="6">${String(hour).padStart(2, "0")}:00 – ${String(hour).padStart(2, "0")}:59
        <span class="muted">· ${group.length} đặt bàn, ${seats} khách</span></td></tr>`;
    }
    html += `<tr class="selectable${r.id === selectedId ? " row-selected" : ""}" data-id="${r.id}">
      <td><strong>${resTime(r.reserved_at)}</strong></td>
      <td>${escapeHtml(r.guest_name)}<div class="muted">${escapeHtml(r.guest_phone)} · ${escapeHtml(r.code)}</div></td>
      <td>${r.party_size}</td>
      <td>${escapeHtml(r.branch.name)}<div class="muted">${r.table ? "Bàn " + escapeHtml(r.table.table_number) : "Chưa xếp bàn"}</div></td>
      <td>${reservationBadge(r.status)}</td>
      <td class="actions">${quickButtons(r)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderDetail();
}

// ---------- Khung xử lý bên trái ----------
function tableConflict(table, r) {
  // Bàn đã có đặt bàn khác (đang hiệu lực) cách giờ này dưới HOLD_MINUTES -> backend sẽ trả 409
  const at = new Date(r.reserved_at).getTime();
  return reservations.find((x) =>
    x.id !== r.id && x.table?.id === table.id && ACTIVE.includes(x.status) &&
    Math.abs(new Date(x.reserved_at).getTime() - at) < HOLD_MINUTES * 60000);
}

async function renderDetail() {
  const r = reservations.find((x) => x.id === selectedId);
  detailEmpty.hidden = Boolean(r);
  detailBody.hidden = !r;
  if (!r) return;

  detailStatus.innerHTML = reservationBadge(r.status);
  detailInfo.innerHTML = `
    <dt>Mã</dt><dd>${escapeHtml(r.code)}</dd>
    <dt>Khách</dt><dd>${escapeHtml(r.guest_name)}</dd>
    <dt>Điện thoại</dt><dd>${escapeHtml(r.guest_phone)}</dd>
    <dt>Số người</dt><dd>${r.party_size}</dd>
    <dt>Giờ</dt><dd>${escapeHtml(formatDateTime(r.reserved_at))}</dd>
    <dt>Chi nhánh</dt><dd>${escapeHtml(r.branch.name)}</dd>
    <dt>Bàn</dt><dd>${r.table ? escapeHtml(r.table.table_number + " (" + r.table.capacity + " chỗ)") : "Chưa xếp"}</dd>
    <dt>Ghi chú</dt><dd>${escapeHtml(r.note || "-")}</dd>`;

  const canArrange = ["pending", "confirmed"].includes(r.status);
  tableBox.hidden = !canArrange;
  if (canArrange) {
    try {
      const tables = await getTables(r.branch.id);
      if (selectedId !== r.id) return; // người dùng đã chọn dòng khác trong lúc chờ
      tableSelect.innerHTML = `<option value="">-- Chọn bàn --</option>` + tables
        .filter((t) => t.capacity >= r.party_size)
        .map((t) => {
          const conflict = tableConflict(t, r);
          const note = conflict ? ` - trùng giờ ${conflict.code}` : "";
          const area = t.area ? ` · ${t.area}` : "";
          return `<option value="${t.id}"${conflict ? " disabled" : ""}${r.table?.id === t.id ? " selected" : ""}>
            ${escapeHtml(t.table_number)} (${t.capacity} chỗ${escapeHtml(area)})${escapeHtml(note)}</option>`;
        }).join("");
      tableHint.textContent = "Chỉ hiện bàn đủ chỗ. Bàn bị khoá là đã có đặt bàn khác cách dưới 2 giờ.";
    } catch (error) {
      handleError(error);
    }
  }

  const buttons = [];
  if (r.status === "pending") buttons.push(["confirm", "Xác nhận", "btn-primary"]);
  if (canArrange) buttons.push(["table", r.table ? "Đổi bàn" : "Xếp bàn", ""]);
  if (r.status === "confirmed" && r.table) buttons.push(["check-in", "Check-in", "btn-primary"]);
  if (canArrange && new Date(r.reserved_at) <= new Date()) buttons.push(["no-show", "Không đến", ""]);
  if (canArrange) buttons.push(["cancel", "Huỷ đặt bàn", "btn-danger"]);
  detailActions.innerHTML = buttons.map(([act, label, cls]) =>
    `<button type="button" class="btn ${cls}" data-act="${act}" data-id="${r.id}">${label}</button>`).join("");
  if (!buttons.length) detailActions.innerHTML = `<span class="muted">Đặt bàn này không còn thao tác nào.</span>`;
}

// ---------- Thao tác ----------
async function runAction(act, id) {
  if (busy) return;
  const r = reservations.find((x) => x.id === id);
  if (!r) return;
  let request, message;
  if (act === "confirm") {
    request = () => api.put(`/reservations/${id}/confirm`);
    message = "Đã xác nhận đặt bàn";
  } else if (act === "table") {
    if (!tableSelect.value) return showToast("Hãy chọn một bàn trước", "error");
    request = () => api.put(`/reservations/${id}/table`, { table_id: Number(tableSelect.value) });
    message = "Đã xếp bàn";
  } else if (act === "check-in") {
    request = () => api.put(`/reservations/${id}/check-in`);
    message = "Đã check-in, bàn chuyển sang có khách";
  } else if (act === "no-show") {
    if (!confirm(`Đánh dấu khách ${r.guest_name} không đến?`)) return;
    request = () => api.put(`/reservations/${id}/no-show`);
    message = "Đã đánh dấu không đến";
  } else if (act === "cancel") {
    if (!confirm(`Huỷ đặt bàn ${r.code} của ${r.guest_name}?`)) return;
    request = () => api.put(`/reservations/${id}/cancel`);
    message = "Đã huỷ đặt bàn";
  } else {
    return;
  }

  busy = true;
  document.querySelectorAll("[data-act]").forEach((b) => { b.disabled = true; });
  try {
    const result = await request();
    showToast(act === "check-in" && result?.order_id ? `${message} (order #${result.order_id})` : message);
    selectedId = id;
  } catch (error) {
    handleError(error); // vd 409: bàn đã có đặt bàn gần giờ này
  } finally {
    busy = false;
    await loadReservations(); // luôn tải lại để thấy trạng thái thật trên server
  }
}

// ---------- Sự kiện ----------
tbody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-act]");
  if (button) return runAction(button.dataset.act, Number(button.dataset.id));
  const row = event.target.closest("tr.selectable");
  if (row) {
    selectedId = Number(row.dataset.id);
    render();
  }
});
detailActions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-act]");
  if (button) runAction(button.dataset.act, Number(button.dataset.id));
});

[filterBranch, filterDay, filterStatus].forEach((el) => el.addEventListener("change", () => {
  selectedId = null;
  loadReservations();
}));
filterQ.addEventListener("input", render); // tìm ngay trên danh sách đã tải
// Chuyển ngày bằng nút ‹ › Hôm nay (tự tính ngày ngay trong file này, không phụ thuộc file khác)
function shiftDay(days) {
  const base = filterDay.value ? new Date(`${filterDay.value}T00:00:00`) : new Date();
  if (days === 0) base.setTime(Date.now()); else base.setDate(base.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  filterDay.value = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
  selectedId = null;
  loadReservations();
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".day-nav button");
  if (!btn) return;
  const t = btn.textContent.trim();
  if (t === "‹") shiftDay(-1);
  else if (t === "›") shiftDay(1);
  else shiftDay(0);
});

// ---------- Khởi động ----------
async function init() {
  filterDay.value = resDateInput();
  try {
    await loadBranches();
  } catch (error) {
    handleError(error);
  }
  await loadReservations();
  setInterval(() => { if (!busy) loadReservations(); }, 60000); // cập nhật trạng thái "không đến" tự động
}

Auth.requireRole(["manager", "waiter"]);
const role = Auth.getUser()?.role?.name;
if (Auth.isLoggedIn() && ["admin", "manager", "waiter"].includes(role)) init();