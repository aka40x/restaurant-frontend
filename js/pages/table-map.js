// Sơ đồ bàn (module Menu và bàn, phối hợp module Order). Gọi API backend:
//   GET  /branches                      chi nhánh (admin chọn được, nhân viên chỉ có chi nhánh của mình)
//   GET  /tables?only_active=true&branch_id=   các bàn đang sử dụng của chi nhánh
//   GET  /reservations?date=hôm nay&branch_id= đặt bàn hôm nay (để biết bàn nào đặt trước)
//   GET  /orders?branch_id=             order của chi nhánh (bàn nào đang có order, đặt bàn nào đã có order)
//   GET  /orders/{id}                   chi tiết order (món, tạm tính)
//   POST /orders                        mở order cho bàn trống / bàn đặt trước
//
// Màu bàn:
//   Đang phục vụ (đỏ)  = bàn có order chưa thanh toán (open / sent / served)
//   Đặt trước (vàng)   = đặt bàn (chờ xác nhận / đã xác nhận) chưa có order, giờ đến nằm trong khoảng
//                        từ 30 phút trước đến 120 phút sau (120 phút = thời gian giữ bàn của backend,
//                        30 phút = quá giờ ngần đó backend tự đánh dấu "không đến")
//                        Đặt bàn "chờ xác nhận" phải bấm Xác nhận trước thì mới check-in được.
//   Trống (xanh)       = còn lại (đặt bàn muộn hơn trong ngày chỉ hiện ghi chú nhỏ trên thẻ)
// Bấm vào bàn: xem thông tin; bàn trống / đặt trước thì mở order; bàn đang phục vụ thì vào xem / gọi món.

// Trang gọi món của module Order (pages/admin/pos.html). Nhận ?order_id=...&table_id=...
// Nếu bạn Order đặt tên trang khác thì chỉ cần sửa dòng này.
const ORDER_PAGE = "../admin/pos.html";
function orderUrl(orderId, tableId) {
  return `${ORDER_PAGE}?order_id=${orderId}&table_id=${tableId}`;
}

const REFRESH_MS = 15000; // tự tải lại sơ đồ mỗi 15 giây
const RESERVED_GRACE_MINUTES = 30; // khách đến trễ tối đa 30 phút vẫn còn giữ bàn (khớp NO_SHOW_MINUTES của backend)
const RESERVED_AHEAD_MINUTES = 120; // trước giờ đến tối đa 120 phút thì bàn đã tính là "đặt trước"
const ACTIVE_ORDER_STATUSES = ["open", "sent", "served"];
const ORDER_STATUS_LABEL = { open: "Đang gọi món", sent: "Đã gửi bếp", served: "Đã ra món" };
const ITEM_STATUS_LABEL = {
  pending: "Chờ gửi bếp", cooking: "Đang nấu", done: "Đã xong", served: "Đã phục vụ", cancelled: "Đã huỷ",
};
const STATE_LABEL = { available: "Trống", reserved: "Đặt trước", occupied: "Đang phục vụ" };

// ---------- Lấy phần tử trên trang ----------
const mapBox = document.getElementById("map");
const branchLabel = document.getElementById("branch-label");
const branchSelect = document.getElementById("branch-select");
const refreshButton = document.getElementById("btn-refresh");
const dialog = document.getElementById("table-dialog");
const dialogTitle = document.getElementById("dialog-title");
const dialogBody = document.getElementById("dialog-body");
const dialogActions = document.getElementById("dialog-actions");
const dialogClose = document.getElementById("dialog-close");

// ---------- Trạng thái của trang ----------
let branches = [];
let tables = []; // bàn kèm trạng thái đã tính: { ...bàn, state, reservation }
let currentBranchId = null;
let warnedPartial = false; // đã báo "tải thiếu đặt bàn / order" chưa (tránh báo lại mỗi 15 giây)

function handleError(error) {
  showToast(error.message, "error");
}

const pad = (n) => String(n).padStart(2, "0");
const todayText = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // giờ máy, không dùng UTC
};
const timeText = (value) => {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ---------- Tải dữ liệu ----------
async function loadBranches() {
  branches = await api.get("/branches"); // admin: tất cả; nhân viên khác: chỉ chi nhánh của mình
  const active = branches.filter((b) => b.is_active);
  branchSelect.innerHTML = active.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  currentBranchId = active.length ? active[0].id : null;
  const showSelect = active.length > 1;
  branchSelect.hidden = !showSelect;
  branchLabel.textContent = !showSelect && active.length ? active[0].name : "";
}

async function loadMap() {
  if (currentBranchId === null) {
    mapBox.innerHTML = `<p class="muted">Chưa có chi nhánh đang hoạt động.</p>`;
    return;
  }
  const branchId = currentBranchId;
  // Bàn là dữ liệu chính (lỗi thì báo). Đặt bàn và order là phụ: lỗi thì vẫn vẽ sơ đồ theo
  // dining_tables.status nhưng phải báo để nhân viên biết sơ đồ có thể chưa đúng (đặt trước có thể bị thiếu).
  let partial = false;
  const soft = (promise) => promise.catch(() => { partial = true; return []; });
  const [tableList, reservations, orders] = await Promise.all([
    api.get("/tables", { only_active: true, branch_id: branchId }),
    soft(api.get("/reservations", { date: todayText(), branch_id: branchId })),
    soft(api.get("/orders", { branch_id: branchId })),
  ]);
  if (branchId !== currentBranchId) return; // đã đổi chi nhánh trong lúc chờ tải
  if (partial && !warnedPartial) {
    showToast("Không tải được đặt bàn hoặc order, sơ đồ có thể chưa đúng. Hãy tải lại sau ít phút.", "error");
  }
  warnedPartial = partial;
  
  // Order đang phục vụ của từng bàn (mới nhất trước)
  const activeByTable = new Map();
  for (const o of [...orders].sort((x, y) => y.id - x.id)) {
    if (ACTIVE_ORDER_STATUSES.includes(o.status) && !activeByTable.has(o.table_id)) activeByTable.set(o.table_id, o);
  }
  // Đặt bàn đã được mở order (khách đã tới) thì không còn tính là "đặt trước"
  const usedReservations = new Set(
    orders.filter((o) => o.reservation_id && o.status !== "cancelled").map((o) => o.reservation_id),
  );
  tables = tableList.map((t) => withState(t, reservations, activeByTable.get(t.id) || null, usedReservations));
  renderMap();
}

// Đang phục vụ > đặt trước > trống
function withState(table, reservations, activeOrder, usedReservations) {
  if (activeOrder || table.status === "occupied") {
    return { ...table, state: "occupied", reservation: null, laterReservation: null, activeOrder };
  }

  const now = Date.now();
  const mine = reservations
    .filter((r) => r.table && r.table.id === table.id && ["pending", "confirmed"].includes(r.status))
    .filter((r) => !usedReservations.has(r.id))
    .map((r) => ({ r, time: new Date(r.reserved_at).getTime() }))
    .filter((x) => x.time >= now - RESERVED_GRACE_MINUTES * 60000)
    .sort((a, b) => a.time - b.time);

  const current = mine.find((x) => x.time <= now + RESERVED_AHEAD_MINUTES * 60000);
  if (current) return { ...table, state: "reserved", reservation: current.r, laterReservation: null, activeOrder: null };
  const later = mine.length ? mine[0].r : null; // đặt bàn muộn hơn trong ngày
  if (table.status === "reserved") return { ...table, state: "reserved", reservation: null, laterReservation: later, activeOrder: null };
  return { ...table, state: "available", reservation: null, laterReservation: later, activeOrder: null };
}

// ---------- Vẽ sơ đồ ----------
function renderMap() {
  for (const state of Object.keys(STATE_LABEL)) {
    document.getElementById(`count-${state}`).textContent = tables.filter((t) => t.state === state).length;
  }
  if (tables.length === 0) {
    mapBox.innerHTML = `<p class="muted">Chi nhánh này chưa có bàn nào. Thêm bàn ở trang "Quản lý bàn".</p>`;
    return;
  }

  // Gom theo khu vực (bàn chưa có khu vực xếp vào "Khu vực khác")
  const groups = new Map();
  for (const t of tables) {
    const area = t.area || "Khu vực khác";
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(t);
  }
  mapBox.innerHTML = [...groups.entries()].map(([area, list]) => `
    <section class="area">
      <h2>${escapeHtml(area)}</h2>
      <div class="table-grid">
        ${list.map(cardHtml).join("")}
      </div>
    </section>`).join("");
}

function cardHtml(t) {
  // Không chỉ dùng màu: luôn có chữ trạng thái (người mù màu vẫn đọc được)
  let stateText = STATE_LABEL[t.state];
  if (t.state === "reserved" && t.reservation) {
    stateText += ` ${timeText(t.reservation.reserved_at)}`;
    if (t.reservation.status === "pending") stateText += " · chờ xác nhận";
  }  
  return `
    <button type="button" class="table-card is-${t.state}" data-id="${t.id}">
      <span class="t-number">${escapeHtml(t.table_number)}</span>
      <span class="t-seats">${t.capacity} ghế</span>
      <span class="t-state">${escapeHtml(stateText)}</span>
      ${t.state === "available" && t.laterReservation
        ? `<span class="t-note">Có đặt ${timeText(t.laterReservation.reserved_at)}</span>` : ""}
    </button>`;
}

mapBox.addEventListener("click", (event) => {
  const card = event.target.closest(".table-card");
  if (card) openTable(Number(card.dataset.id));
});

// ---------- Hộp thoại chi tiết bàn ----------
function showDialog(title, bodyHtml, actionsHtml) {
  dialogTitle.textContent = title;
  dialogBody.innerHTML = bodyHtml;
  dialogActions.innerHTML = actionsHtml;
  if (!dialog.open) dialog.showModal();
}
dialogClose.addEventListener("click", () => dialog.close());

function openTable(id) {
  const t = tables.find((x) => x.id === id);
  if (!t) return;
  const title = `Bàn ${t.table_number} · ${STATE_LABEL[t.state]}`;
  const basic = `<li>Số ghế: <b>${t.capacity}</b></li><li>Khu vực: <b>${escapeHtml(t.area || "Khu vực khác")}</b></li>`;

  if (t.state === "occupied") {
    showDialog(title, `<ul class="info-list">${basic}</ul><p class="muted">Đang tải order...</p>`, "");
    showOrderOfTable(t, title, basic);
  } else if (t.state === "reserved") {
    const r = t.reservation;
    const pending = Boolean(r) && r.status === "pending"; // chưa xác nhận thì backend chưa cho check-in
    const info = r
      ? `<li>Khách: <b>${escapeHtml(r.guest_name)}</b> · ${escapeHtml(r.guest_phone)}</li>
         <li>Giờ đến: <b>${timeText(r.reserved_at)}</b> · ${r.party_size} người</li>
         <li>Mã đặt bàn: ${escapeHtml(r.code)}</li>${r.note ? `<li>Ghi chú: ${escapeHtml(r.note)}</li>` : ""}`
      : "";
    const statusLine = pending ? `<li>Trạng thái: <b>Chờ xác nhận</b></li>` : "";
    const action = pending
      ? `<button type="button" class="btn btn-primary" id="btn-confirm">Xác nhận đặt bàn</button>`
      : `<button type="button" class="btn btn-primary" id="btn-open-order">Khách đã đến, mở order</button>`;
    showDialog(title, `<ul class="info-list">${basic}${info}${statusLine}</ul>`, action);
    if (pending) {
      document.getElementById("btn-confirm").addEventListener("click", () => confirmReservation(t));
    } else {
      document.getElementById("btn-open-order").addEventListener("click", () => openOrder(t, r ? r.id : null));
    }
  } else {
    const later = t.laterReservation
      ? `<li>Đặt trước lúc <b>${timeText(t.laterReservation.reserved_at)}</b>: ${escapeHtml(t.laterReservation.guest_name)} · ${t.laterReservation.party_size} người</li>`
      : "";
    showDialog(title, `<ul class="info-list">${basic}${later}</ul><p class="muted">Bàn đang trống.</p>`,
      `<button type="button" class="btn btn-primary" id="btn-open-order">Mở order</button>`);
    document.getElementById("btn-open-order").addEventListener("click", () => openOrder(t, null));
  }
}

// Bàn đang phục vụ: hiện tóm tắt order chưa thanh toán (đã biết id từ danh sách order)
async function showOrderOfTable(t, title, basic) {
  try {
    if (!t.activeOrder) {
      // Bàn còn đánh dấu "có khách" nhưng không có order nào đang mở
      showDialog(title, `<ul class="info-list">${basic}</ul><p class="muted">Bàn này chưa có order đang phục vụ.</p>`,
        `<button type="button" class="btn btn-primary" id="btn-open-order">Mở order</button>`);
      document.getElementById("btn-open-order").addEventListener("click", () => openOrder(t, null));
      return;
    }
    const order = await api.get(`/orders/${t.activeOrder.id}`);
    if (!dialog.open) return; // người dùng đã đóng hộp thoại trong lúc chờ tải
    const lines = order.items.map((i) => `
      <tr class="${i.status === "cancelled" ? "cancelled" : ""}">
        <td>${escapeHtml(i.menu_item_name)} × ${i.quantity}
          <div class="muted">${escapeHtml(ITEM_STATUS_LABEL[i.status] ?? i.status)}</div></td>
        <td class="num">${formatMoney(i.line_total)}</td>
      </tr>`).join("");
    const body = `
      <ul class="info-list">${basic}
        <li>Order #${order.id}: <b>${escapeHtml(ORDER_STATUS_LABEL[order.status] ?? order.status)}</b></li></ul>
      ${order.items.length
        ? `<table class="order-lines"><tbody>${lines}</tbody></table>`
        : `<p class="muted">Chưa gọi món nào.</p>`}
      <div class="order-total"><span>Tạm tính</span><span>${formatMoney(order.subtotal)}</span></div>`;
    showDialog(title, body,
      `<a class="btn btn-primary" href="${orderUrl(order.id, t.id)}">Xem / gọi món</a>`);
  } catch (error) {
    dialog.close();
    handleError(error);
    refresh();
  }
}
// Xác nhận đặt bàn đang chờ (waiter / manager được phép), xong thì hiện nút "Khách đã đến"
async function confirmReservation(t) {
  const button = document.getElementById("btn-confirm");
  button.disabled = true;
  try {
    const updated = await api.put(`/reservations/${t.reservation.id}/confirm`);
    t.reservation.status = updated.status; // "confirmed"
    showToast("Đã xác nhận đặt bàn");
    openTable(t.id); // vẽ lại hộp thoại với nút check-in
  } catch (error) {
    button.disabled = false;
    handleError(error);
    if (error.status === 400 || error.status === 409) { // VD: người khác vừa xác nhận / huỷ rồi
      dialog.close();
      refresh();
    }
  }
}

// Mở order mới cho bàn rồi chuyển sang trang gọi món của module Order
async function openOrder(t, reservationId) {
  const button = document.getElementById("btn-open-order");
  button.disabled = true;
  try {
    let orderId;
    if (reservationId) {
      // Khách đặt trước đã đến: check-in (đặt bàn -> seated, bàn -> occupied, tự mở order)
      const result = await api.put(`/reservations/${reservationId}/check-in`);
      orderId = result.order_id;
    } else {
      const order = await api.post("/orders", { table_id: t.id });
      orderId = order.id;
    }
    window.location.href = orderUrl(orderId, t.id);
  } catch (error) {
    button.disabled = false;
    handleError(error);
    if (error.status === 409) {
      dialog.close();
      refresh();
    }
  }
}

// ---------- Làm mới ----------
function refresh() {
  return loadMap().catch((error) => {
    mapBox.innerHTML = `<p class="text-error">${escapeHtml(error.message)}</p>`;
  });
}
refreshButton.addEventListener("click", refresh);
branchSelect.addEventListener("change", () => {
  currentBranchId = Number(branchSelect.value);
  refresh();
});
setInterval(() => { if (!dialog.open) refresh(); }, REFRESH_MS); // đang mở hộp thoại thì không tải lại

// ---------- Khởi động ----------
// Phục vụ và quản lý được vào (admin luôn được). Sai vai trò thì Auth tự chuyển sang trang khác.
Auth.requireRole(["waiter", "manager"]);
if (Auth.isLoggedIn()) {
  loadBranches().then(refresh).catch((error) => {
    mapBox.innerHTML = `<p class="text-error">${escapeHtml(error.message)}</p>`;
  });
}