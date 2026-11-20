// Trang Quản lý đặt bàn (admin / manager / waiter).
//
// API backend sử dụng:
//   GET /branches                              chi nhánh (đổ vào ô lọc)
//   GET /reservations?branch_id=&date=&status= danh sách đặt bàn
//   GET /tables?branch_id=&only_active=true    bàn của chi nhánh (đổ vào ô chọn bàn)
//   PUT /reservations/{id}/confirm             xác nhận
//   PUT /reservations/{id}/table  {table_id}   xếp bàn / đổi bàn
//   PUT /reservations/{id}/check-in            khách đến: seated + mở order cho bàn
//   PUT /reservations/{id}/no-show             đánh dấu khách không đến
//   PUT /reservations/{id}/cancel              huỷ
//
// Luồng: pending --xác nhận--> confirmed --xếp bàn + check-in--> seated
//        pending / confirmed --huỷ--> cancelled;  --quá giờ--> no_show
// Ô "Tìm" lọc ngay trên trình duyệt (backend chưa có tham số tìm kiếm).
// Danh sách tự làm mới 30 giây / lần để thấy đặt bàn mới của khách.

Auth.requireRole(["manager", "waiter"]);

const POLL_INTERVAL_MS = 30000;

// ---------- Phần tử trên trang ----------
const byId = (id) => document.getElementById(id);
const filterBranch = byId("filter-branch");
const filterDay = byId("filter-day");
const filterStatus = byId("filter-status");
const filterQ = byId("filter-q");
const listSummary = byId("list-summary");
const listBody = byId("reservation-table-body");

const detailEmpty = byId("detail-empty");
const detailBody = byId("detail-body");
const detailStatus = byId("detail-status");
const detailInfo = byId("detail-info");
const detailActions = byId("detail-actions");
const tableBox = byId("table-box");
const tableSelect = byId("table-select");
const tableHint = byId("table-hint");

// ---------- Trạng thái của trang ----------
let reservations = []; // danh sách lấy từ server (chưa lọc theo ô Tìm)
let selectedId = null; // đặt bàn đang chọn
let busy = false; // đang gửi lệnh lên server
let loadSeq = 0; // đánh số lần tải để bỏ qua kết quả cũ về muộn
let lastCheckIn = null; // { reservationId, orderId, tableText } để hiện nút sang trang gọi món

function handleError(error) {
  showToast(error.message, "error");
}

function currentReservation() {
  return reservations.find((r) => r.id === selectedId) || null;
}

// ---------- Chi nhánh ----------
async function loadBranches() {
  try {
    const branches = await api.get("/branches");
    for (const branch of branches) {
      const option = document.createElement("option");
      option.value = branch.id;
      option.textContent = branch.name;
      filterBranch.appendChild(option);
    }
  } catch (error) {
    handleError(error);
  }
}

// ---------- Danh sách ----------
async function loadReservations({ silent = false } = {}) {
  const seq = ++loadSeq;
  const before = JSON.stringify(currentReservation());
  let data;
  try {
    data = await api.get("/reservations", {
      branch_id: filterBranch.value || undefined,
      date: filterDay.value || undefined,
      status: filterStatus.value || undefined,
    });
  } catch (error) {
    if (!silent) handleError(error);
    return;
  }
  if (seq !== loadSeq) return; // đã có lần tải mới hơn

  reservations = data;
  renderList();

  const now = currentReservation();
  if (selectedId !== null && !now) {
    selectedId = null; // đặt bàn đang chọn không còn trong danh sách (đổi bộ lọc...)
    renderList();
    renderDetail();
  } else if (before !== JSON.stringify(now)) {
    renderDetail(); // chỉ vẽ lại khi dữ liệu thật sự đổi, để khỏi mất ô bàn đang chọn dở
  }
}

function visibleReservations() {
  const keyword = filterQ.value.trim().toLowerCase();
  if (!keyword) return reservations;
  const digits = keyword.replace(/\s+/g, "");
  return reservations.filter(
    (r) =>
      r.code.toLowerCase().includes(keyword) ||
      r.guest_name.toLowerCase().includes(keyword) ||
      r.guest_phone.replace(/\s+/g, "").includes(digits),
  );
}

function renderList() {
  const rows = visibleReservations();

  const pending = rows.filter((r) => r.status === "pending").length;
  let summary = `${rows.length} đặt bàn`;
  if (rows.length !== reservations.length) summary += ` (lọc từ ${reservations.length})`;
  if (pending > 0) summary += ` · ${pending} chờ xác nhận`;
  listSummary.textContent = summary;

  if (rows.length === 0) {
    listBody.innerHTML = `<tr><td colspan="5" class="muted">Không có đặt bàn nào.</td></tr>`;
    return;
  }

  listBody.innerHTML = rows
    .map(
      (r) => `
      <tr class="selectable ${r.id === selectedId ? "row-selected" : ""}" data-id="${r.id}">
        <td>
          <strong>${escapeHtml(formatTimeHM(r.reserved_at))}</strong><br>
          <span class="muted">${escapeHtml(formatDateDMY(r.reserved_at))}</span>
        </td>
        <td>
          ${escapeHtml(r.guest_name)}<br>
          <span class="muted">${escapeHtml(r.guest_phone)} · ${escapeHtml(r.code)}</span>
        </td>
        <td>${r.party_size}</td>
        <td>
          ${escapeHtml(r.branch.name)}<br>
          <span class="muted">${escapeHtml(reservationTableText(r.table))}</span>
        </td>
        <td>${reservationStatusBadge(r.status)}</td>
      </tr>`,
    )
    .join("");
}

listBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  selectedId = Number(row.dataset.id);
  renderList();
  renderDetail();
});

// ---------- Chi tiết + thao tác ----------
function renderDetail() {
  const r = currentReservation();
  if (!r) {
    detailEmpty.hidden = false;
    detailBody.hidden = true;
    return;
  }
  detailEmpty.hidden = true;
  detailBody.hidden = false;

  detailStatus.innerHTML = `${reservationStatusBadge(r.status)} <strong>${escapeHtml(r.code)}</strong>`;

  const info = [
    ["Thời gian", formatDateTime(r.reserved_at)],
    ["Khách", r.guest_name],
    ["Điện thoại", r.guest_phone],
    ["Số người", r.party_size],
    ["Chi nhánh", r.branch.name],
    ["Bàn", reservationTableText(r.table) + (r.table ? ` (${r.table.capacity} chỗ)` : "")],
    ["Ghi chú", r.note || "—"],
  ];
  detailInfo.innerHTML = info
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`)
    .join("");

  // Chỉ xếp / đổi bàn được khi đặt bàn còn pending hoặc confirmed
  const editable = r.status === "pending" || r.status === "confirmed";
  tableBox.hidden = !editable;
  if (editable) fillTableSelect(r);

  renderActions(r);
}

async function fillTableSelect(r) {
  tableSelect.innerHTML = `<option value="">Đang tải bàn...</option>`;
  tableHint.textContent = "";
  let tables;
  try {
    tables = await api.get("/tables", { branch_id: r.branch.id, only_active: true });
  } catch (error) {
    tableSelect.innerHTML = `<option value="">Không tải được danh sách bàn</option>`;
    handleError(error);
    return;
  }
  if (selectedId !== r.id) return; // trong lúc chờ, người dùng đã chọn đặt bàn khác

  const options = [`<option value="">— Chọn bàn —</option>`];
  for (const t of tables) {
    const tooSmall = t.capacity < r.party_size;
    let label = `${t.table_number}${t.area ? " · " + t.area : ""} · ${t.capacity} chỗ`;
    if (tooSmall) label += " (không đủ chỗ)";
    else if (t.status === "occupied") label += " (đang có khách)";
    const selected = r.table && r.table.id === t.id ? "selected" : "";
    options.push(`<option value="${t.id}" ${tooSmall ? "disabled" : ""} ${selected}>${escapeHtml(label)}</option>`);
  }
  tableSelect.innerHTML = options.join("");

  tableHint.textContent = r.table
    ? "Chọn bàn khác rồi bấm “Đổi bàn” để đổi. Bàn đã có đặt bàn khác trong ±2 giờ sẽ bị từ chối."
    : "Chưa xếp bàn. Cần xếp bàn trước khi check-in. Bàn đã có đặt bàn khác trong ±2 giờ sẽ bị từ chối.";
}

function renderActions(r) {
  const buttons = [];
  const open = r.status === "pending" || r.status === "confirmed";

  if (r.status === "pending") {
    buttons.push(`<button class="btn btn-primary" type="button" data-action="confirm">Xác nhận</button>`);
  }
  if (open) {
    buttons.push(
      `<button class="btn" type="button" data-action="assign">${r.table ? "Đổi bàn" : "Xếp bàn"}</button>`,
    );
  }
  if (r.status === "confirmed") {
    const noTable = !r.table;
    buttons.push(
      `<button class="btn btn-primary" type="button" data-action="checkin" ${noTable ? "disabled" : ""}
        ${noTable ? 'title="Cần xếp bàn trước khi check-in"' : ""}>Check-in</button>`,
    );
  }
  if (open && new Date(r.reserved_at) <= new Date()) {
    buttons.push(`<button class="btn" type="button" data-action="noshow">Không đến</button>`);
  }
  if (open) {
    buttons.push(`<button class="btn btn-danger" type="button" data-action="cancel">Huỷ đặt bàn</button>`);
  }

  let html = buttons.join("");
  if (r.status === "confirmed" && !r.table) {
    html += `<p class="muted" style="width:100%;margin:0">Xếp bàn xong mới check-in được.</p>`;
  }
  if (r.status === "seated") {
    html += `<p class="muted" style="width:100%;margin:0">Khách đã nhận bàn.</p>`;
    if (lastCheckIn && lastCheckIn.reservationId === r.id) {
      html += `<div class="notice" style="width:100%">Đã mở order #${lastCheckIn.orderId} cho bàn ${escapeHtml(lastCheckIn.tableText)}.
        <a class="btn btn-primary btn-small" href="pos.html">Đến trang gọi món</a></div>`;
    }
  }
  if (r.status === "cancelled" || r.status === "no_show") {
    html += `<p class="muted" style="width:100%;margin:0">Đặt bàn đã đóng, không còn thao tác.</p>`;
  }
  detailActions.innerHTML = html;
}

detailActions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) runAction(button.dataset.action);
});

async function runAction(action) {
  const r = currentReservation();
  if (!r || busy) return;
  const base = `/reservations/${r.id}`;
  let path;
  let body;
  let successMessage;

  if (action === "confirm") {
    path = `${base}/confirm`;
    successMessage = `Đã xác nhận đặt bàn ${r.code}`;
  } else if (action === "assign") {
    const tableId = Number(tableSelect.value);
    if (!tableId) {
      showToast("Hãy chọn bàn trước.", "error");
      return;
    }
    path = `${base}/table`;
    body = { table_id: tableId };
    successMessage = "Đã xếp bàn";
  } else if (action === "checkin") {
    path = `${base}/check-in`;
    successMessage = `Check-in thành công cho ${r.guest_name}`;
  } else if (action === "noshow") {
    if (!window.confirm(`Đánh dấu khách ${r.guest_name} (${r.code}) là không đến?`)) return;
    path = `${base}/no-show`;
    successMessage = "Đã đánh dấu không đến";
  } else if (action === "cancel") {
    if (!window.confirm(`Huỷ đặt bàn ${r.code} của ${r.guest_name}?`)) return;
    path = `${base}/cancel`;
    successMessage = "Đã huỷ đặt bàn";
  } else {
    return;
  }

  busy = true;
  detailActions.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const updated = await api.put(path, body);
    const index = reservations.findIndex((x) => x.id === updated.id);
    if (index !== -1) reservations[index] = updated;

    if (action === "checkin" && updated.order_id) {
      lastCheckIn = {
        reservationId: updated.id,
        orderId: updated.order_id,
        tableText: updated.table ? updated.table.table_number : "",
      };
      successMessage += ` · đã mở order #${updated.order_id}`;
    }
    showToast(successMessage);
  } catch (error) {
    // Router check-in / no-show chưa được include_router trong backend/app/main.py -> FastAPI trả "Not Found"
    if ((action === "checkin" || action === "noshow") && error.status === 404 && error.message === "Not Found") {
      showToast("Backend chưa bật API này (thiếu include_router reservation_checkin trong main.py).", "error");
    } else {
      handleError(error);
    }
  } finally {
    busy = false;
    renderList();
    renderDetail();
  }
}

// ---------- Bộ lọc ----------
filterBranch.addEventListener("change", () => loadReservations());
filterDay.addEventListener("change", () => loadReservations());
filterStatus.addEventListener("change", () => loadReservations());
filterQ.addEventListener("input", renderList);

// ---------- Khởi động ----------
async function init() {
  filterDay.value = todayInputValue(); // mặc định xem các đặt bàn hôm nay; xoá ngày để xem tất cả
  await loadBranches();
  await loadReservations();
  setInterval(() => {
    if (!document.hidden && !busy) loadReservations({ silent: true });
  }, POLL_INTERVAL_MS);
}

init();