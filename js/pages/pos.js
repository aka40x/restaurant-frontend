// Trang Gọi món cho phục vụ: chọn bàn -> chọn món (tuỳ chọn, ghi chú) -> gửi bếp -> xem trạng thái món.
//
// API sử dụng (xem backend/app/routers):
//   POST /auth/login, GET /auth/me          đăng nhập
//   GET  /pos/tables, GET /pos/menu         bàn (kèm order đang phục vụ) và thực đơn
//   POST /orders                            mở order cho bàn (khi gọi món đầu tiên)
//   POST /orders/{id}/items                 thêm món;  PUT / DELETE /orders/{id}/items/{item_id}  sửa số lượng / huỷ
//   POST /orders/{id}/send-to-kitchen       gửi các món mới xuống bếp
//   PUT  /orders/{id}/items/{item_id}/status  {status:"served"}  xác nhận đã ra món
//   GET  /orders/{id}                       tải lại order (tự làm mới 5 giây / lần để thấy bếp cập nhật)
// Vào từ Sơ đồ bàn: pos.html?order_id=..&table_id=.. mở thẳng bàn đó.

const TOKEN_KEY = "token"; // cùng khoá mà js/api.js đọc để gắn Authorization
const POLL_MS = 5000;

const ROLE_LABEL = { admin: "Quản trị", manager: "Quản lý", cashier: "Thu ngân", waiter: "Phục vụ", kitchen: "Bếp" };
const ORDER_STATUS = {
  open: ["Đang gọi món", "po-badge-warning"],
  sent: ["Đã gửi bếp", "po-badge-info"],
  served: ["Đã ra hết món", "po-badge-success"],
};
const ITEM_STATUS = {
  pending: ["Chờ bếp", "po-badge-warning"],
  cooking: ["Đang nấu", "po-badge-info"],
  done: ["Đã xong, chờ ra món", "po-badge-success"],
  served: ["Đã ra món", "po-badge-dark"],
  cancelled: ["Đã huỷ", "po-badge-danger"],
};

const state = {
  user: null,
  tables: [],
  categories: [],
  table: null, // bàn đang chọn
  order: null, // order đang phục vụ của bàn (null = bàn chưa có order)
  catId: "all",
  search: "",
  dish: null, // món đang mở trong modal
  dishQty: 1,
  poll: null,
  busy: false,
  dirty: false, // có sự kiện realtime tới lúc đang thao tác: tải lại order khi thao tác xong
  pollTick: 0,
};

// ---------- Phiên đăng nhập ----------
// Dùng chung với Auth của nhóm (js/auth.js) nếu trang có nạp; không thì dùng khoá "token" riêng của trang.
const hasAuth = typeof Auth !== "undefined";
function getToken() {
  return (hasAuth && Auth.getAccessToken()) || localStorage.getItem(TOKEN_KEY);
}
function saveSession(tokens) {
  localStorage.setItem(TOKEN_KEY, tokens.access_token);
  if (hasAuth) Auth.setTokens(tokens);
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  if (hasAuth) Auth.clear();
}

// api.js cũ (axios) không tự gắn token nên gắn ở đây. api.js mới (fetch) đã tự gắn, và không có biến `http`.
if (typeof http !== "undefined") {
  http.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
}

const $ = (id) => document.getElementById(id);
// escapeHtml (utils.js) không escape dấu nháy, nên dùng bản này khi chèn vào thuộc tính HTML
const escAttr = (v) => escapeHtml(v).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// Phòng khi trang không nạp js/utils.js: tự có hàm thông báo tối thiểu
if (typeof showToast === "undefined") {
  window.showToast = (message, type = "success") => {
    const el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  };
}

// ---------- Khởi động / đăng nhập ----------
function tokenPayload() {
  try {
    const part = (getToken() || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part));
  } catch (error) {
    return {};
  }
}

// Lấy thông tin người đăng nhập. Backend chưa có /auth/me thì lấy vai trò từ chính token.
async function loadUser(emailHint) {
  try {
    return await api.get("/auth/me");
  } catch (error) {
    if (error.status !== 404 && error.status !== 405) throw error;
    const payload = tokenPayload();
    return { id: Number(payload.sub), full_name: emailHint || "Nhân viên #" + payload.sub, role: { name: payload.role || "" }, branch: null };
  }
}

async function init() {
  bindEvents();
  if (!getToken()) return showLogin();
  try {
    // Dùng thông tin đã lưu lúc đăng nhập, khỏi gọi /auth/me mỗi lần vào trang
    const saved = hasAuth ? Auth.getUser() : null;
    state.user = saved && saved.role && saved.role.name ? saved : await loadUser();
    await startApp();
  } catch (error) {
    if (error.status === 401) {
      clearSession(); // chỉ khi token thật sự hết hạn (làm mới token cũng thất bại)
      showLogin("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
    } else {
      showFatal(error.message || String(error)); // lỗi khác (mất mạng, backend lỗi...): GIỮ phiên, chỉ báo lỗi
    }
  }
}

// Lỗi không phải hết phiên: hiện màn hình gọi món kèm thông báo lỗi, KHÔNG đá ra trang đăng nhập
function showFatal(message) {
  $("loginBox").hidden = true;
  $("posApp").hidden = false;
  showTablesError(message);
}

function showTablesError(message) {
  $("tableGrid").innerHTML = `<div class="po-empty">Không tải được danh sách bàn: ${escapeHtml(message)}<br><br><button type="button" class="po-btn po-btn-sm" id="btnRetry">Thử lại</button></div>`;
  $("btnRetry").addEventListener("click", () => location.reload());
}

function showLogin(message) {
  $("posApp").hidden = true;
  $("loginBox").hidden = false;
  const box = $("loginError");
  box.hidden = !message;
  box.textContent = message || "";
}

// Vào từ Sơ đồ bàn (pages/staff/tables.html): pos.html?order_id=..&table_id=.. -> mở thẳng bàn đó
async function openFromUrl() {
  const params = new URLSearchParams(location.search);
  const tableId = Number(params.get("table_id"));
  const orderId = Number(params.get("order_id"));
  const table =
    (tableId && state.tables.find((t) => t.id === tableId)) ||
    (orderId && state.tables.find((t) => t.active_order_id === orderId));
  if (table) await selectTable(table.id);
}

async function startApp() {
  $("loginBox").hidden = true;
  $("posApp").hidden = false;
  $("userName").textContent = state.user.full_name;
  const roleName = ROLE_LABEL[state.user.role.name] || state.user.role.name;
  $("userRole").textContent = roleName + (state.user.branch ? " · " + state.user.branch.name : "");
  await loadData();
  await openFromUrl();
  startRealtime();
}

function logout(message) {
  stopPoll();
  Realtime.close();
  clearSession();
  Object.assign(state, { user: null, table: null, order: null, tables: [], categories: [] });
  closeDish();
  showLogin(message);
}

// 401 = token hết hạn -> về trang đăng nhập; lỗi khác -> báo trên màn hình
function handleError(error) {
  if (error.status === 401) {
    logout("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
  } else {
    showToast(error.message, "error");
  }
}

async function loadData() {
  try {
    const [tables, menu] = await Promise.all([api.get("/pos/tables"), api.get("/pos/menu")]);
    state.tables = tables;
    state.categories = menu;
    state.table = null;
    state.order = null;
    $("stepTables").hidden = false;
    $("stepMenu").hidden = true;
    renderTables();
    renderSheet();
  } catch (error) {
    handleError(error);
    if (error.status !== 401) showTablesError(error.message);
  }
}

async function refreshTables() {
  try {
    state.tables = await api.get("/pos/tables");
    if (state.table) state.table = state.tables.find((t) => t.id === state.table.id) || null;
    renderTables();
  } catch (error) {
    handleError(error);
  }
}

// ---------- Bước 1: chọn bàn ----------
function tableStatus(table) {
  if (table.active_order_id) return ["occupied", "Đang có khách"];
  if (table.status === "reserved") return ["reserved", "Đã đặt trước"];
  return ["available", "Trống"];
}

function renderTables() {
  const grid = $("tableGrid");
  if (state.tables.length === 0) {
    grid.innerHTML = `<div class="po-empty">Chưa có bàn nào trong chi nhánh.</div>`;
    return;
  }
  grid.innerHTML = state.tables.map((t) => {
    const [cls, label] = tableStatus(t);
    return `
      <button type="button" class="po-table status-${cls} ${state.table && state.table.id === t.id ? "selected" : ""}" data-id="${t.id}">
        <span class="po-table-num">${escapeHtml(t.table_number)}</span>
        <span class="po-table-meta">${t.capacity} ghế${t.area ? " · " + escapeHtml(t.area) : ""}</span>
        <span class="po-table-meta">${label}</span>
      </button>`;
  }).join("");
}

async function selectTable(id) {
  const table = state.tables.find((t) => t.id === id);
  if (!table) return;
  try {
    state.order = table.active_order_id ? await api.get(`/orders/${table.active_order_id}`) : null;
  } catch (error) {
    handleError(error);
    return;
  }
  state.table = table;
  state.catId = "all";
  state.search = "";
  $("searchInput").value = "";
  $("menuTableName").textContent = "Bàn " + table.table_number;
  $("stepTables").hidden = true;
  $("stepMenu").hidden = false;
  renderCategories();
  renderDishes();
  renderSheet();
  startPoll();
}

async function backToTables() {
  stopPoll();
  state.table = null;
  state.order = null;
  $("stepMenu").hidden = true;
  $("stepTables").hidden = false;
  renderSheet();
  await refreshTables();
}

// ---------- Bước 2: menu theo danh mục ----------
function renderCategories() {
  const tabs = [{ id: "all", name: "Tất cả" }, ...state.categories];
  $("catTabs").innerHTML = tabs.map((c) =>
    `<button type="button" class="po-cat ${String(c.id) === String(state.catId) ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`
  ).join("");
}

function renderDishes() {
  const keyword = state.search.trim().toLowerCase();
  const items = state.categories
    .filter((c) => state.catId === "all" || String(c.id) === String(state.catId))
    .flatMap((c) => c.items)
    .filter((i) => !keyword || i.name.toLowerCase().includes(keyword));

  if (items.length === 0) {
    $("dishGrid").innerHTML = `<div class="po-empty" style="grid-column: 1 / -1;">Không có món phù hợp.</div>`;
    return;
  }
  $("dishGrid").innerHTML = items.map((i) => `
    <button type="button" class="po-dish" data-id="${i.id}" ${i.is_available ? "" : "disabled"}>
      <div class="po-dish-img">${escapeHtml(i.name.charAt(0))}${i.image_url ? `<img src="${escAttr(i.image_url)}" alt="" loading="lazy">` : ""}</div>
      <span class="po-dish-name">${escapeHtml(i.name)}</span>
      <span class="po-dish-price">${i.is_available ? formatMoney(i.price) : '<span class="po-badge po-badge-danger">Hết món</span>'}</span>
    </button>`).join("");
}

function findDish(id) {
  for (const c of state.categories) {
    const found = c.items.find((i) => i.id === id);
    if (found) return found;
  }
  return null;
}

// ---------- Modal chọn tuỳ chọn, số lượng, ghi chú ----------
function optionRow(type, name, option, checked, disabled) {
  const extra = Number(option.extra_price);
  return `
    <div class="po-opt-row">
      <label class="po-check">
        <input type="${type}" name="${name}" value="${option.id ?? ""}" data-price="${extra || 0}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span>${escapeHtml(option.name)}</span>
      </label>
      <span class="po-opt-price">${extra > 0 ? "+" + formatMoney(extra) : ""}</span>
    </div>`;
}

function openDish(id) {
  const dish = findDish(id);
  if (!dish) return;
  state.dish = dish;
  state.dishQty = 1;
  $("dishTitle").textContent = dish.name;

  const sizes = dish.options.filter((o) => o.size);
  const others = dish.options.filter((o) => !o.size);
  const sizeRequired = sizes.some((o) => o.is_required);
  let html = dish.description ? `<p class="po-dish-desc">${escapeHtml(dish.description)}</p>` : "";

  if (sizes.length) {
    html += `<div class="po-opt-group"><div class="po-opt-title">Kích cỡ${sizeRequired ? " (bắt buộc)" : ""}</div>`;
    if (!sizeRequired) html += optionRow("radio", "size", { id: "", name: "Mặc định", extra_price: 0 }, true, false);
    html += sizes.map((o, idx) => optionRow("radio", "size", o, sizeRequired && idx === 0, false)).join("");
    html += `</div>`;
  }
  if (others.length) {
    html += `<div class="po-opt-group"><div class="po-opt-title">Topping / tuỳ chọn thêm</div>`;
    html += others.map((o) => optionRow("checkbox", "opt", o, o.is_required, o.is_required)).join("");
    html += `</div>`;
  }
  html += `
    <div class="po-field">
      <label class="po-label" for="dishNote">Ghi chú cho bếp</label>
      <textarea id="dishNote" class="po-input" maxlength="255" placeholder="VD: ít cay, không hành..."></textarea>
    </div>
    <div class="po-modal-qty">
      <div class="po-qty">
        <button type="button" id="qtyMinus" aria-label="Giảm">−</button>
        <span id="qtyValue">1</span>
        <button type="button" id="qtyPlus" aria-label="Tăng">+</button>
      </div>
      <span class="po-modal-total" id="dishTotal"></span>
    </div>`;
  $("dishBody").innerHTML = html;
  updateDishTotal();
  $("dishModal").classList.add("open");
  $("dishModal").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeDish() {
  state.dish = null;
  $("dishModal").classList.remove("open");
  $("dishModal").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function selectedOptionIds() {
  return [...$("dishBody").querySelectorAll('input[name="size"]:checked, input[name="opt"]:checked')]
    .map((input) => Number(input.value))
    .filter(Boolean);
}

function updateDishTotal() {
  if (!state.dish) return;
  const extra = [...$("dishBody").querySelectorAll('input[name="size"]:checked, input[name="opt"]:checked')]
    .reduce((sum, input) => sum + Number(input.dataset.price || 0), 0);
  $("qtyValue").textContent = state.dishQty;
  $("qtyMinus").disabled = state.dishQty <= 1;
  $("qtyPlus").disabled = state.dishQty >= 99;
  $("dishTotal").textContent = formatMoney((Number(state.dish.price) + extra) * state.dishQty);
}

// Thêm món vào order. Bàn chưa có order thì mở order mới ngay lần gọi đầu tiên.
async function addDish() {
  if (!state.dish || state.busy) return;
  const dish = state.dish;
  const body = {
    menu_item_id: dish.id,
    quantity: state.dishQty,
    note: $("dishNote").value.trim() || null,
    option_ids: selectedOptionIds(),
  };
  state.busy = true;
  $("dishAdd").disabled = true;
  try {
    if (!state.order) {
      try {
        state.order = await api.post("/orders", { table_id: state.table.id });
      } catch (error) {
        if (error.status === 409) {
          // Bàn vừa được mở order bởi người khác: tải order đó về, phục vụ bấm thêm món lại
          await refreshTables();
          if (state.table && state.table.active_order_id) {
            state.order = await api.get(`/orders/${state.table.active_order_id}`);
            renderSheet();
          }
          showToast("Bàn này vừa có order, hãy chọn lại món.", "error");
          closeDish();
          return;
        }
        throw error;
      }
    }
    state.order = await api.post(`/orders/${state.order.id}/items`, body);
    markTableOccupied();
    closeDish();
    showToast(`Đã thêm ${dish.name} (chưa gửi bếp)`);
    renderSheet();
  } catch (error) {
    handleError(error);
  } finally {
    state.busy = false;
    $("dishAdd").disabled = false;
  }
}

function markTableOccupied() {
  if (state.table && state.order) {
    state.table.active_order_id = state.order.id;
    state.table.active_order_status = state.order.status;
  }
}

// ---------- Phiếu gọi món (cột phải) ----------
const isUnsent = (item) => item.status === "pending" && !item.sent_at;

function itemBadge(item) {
  if (isUnsent(item)) return ["Chưa gửi bếp", "po-badge-nude"];
  return ITEM_STATUS[item.status] || [item.status, "po-badge-nude"];
}

function itemRow(item) {
  const [label, cls] = itemBadge(item);
  const opts = item.options.map((o) => o.name).join(", ");
  let actions = "";
  if (isUnsent(item)) {
    actions = `
      <div class="po-qty">
        <button type="button" data-action="dec" data-id="${item.id}" ${item.quantity <= 1 ? "disabled" : ""} aria-label="Giảm">−</button>
        <span>${item.quantity}</span>
        <button type="button" data-action="inc" data-id="${item.id}" ${item.quantity >= 99 ? "disabled" : ""} aria-label="Tăng">+</button>
      </div>
      <button type="button" class="po-btn po-btn-danger po-btn-sm" data-action="cancel" data-id="${item.id}">Huỷ món</button>`;
  } else if (item.status === "done") {
    actions = `<button type="button" class="po-btn po-btn-gold po-btn-sm" data-action="serve" data-id="${item.id}">Đã ra món</button>`;
  }
  return `
    <div class="po-item ${item.status === "cancelled" ? "cancelled" : ""}">
      <div class="po-item-top">
        <div>
          <div class="po-item-name">${escapeHtml(item.menu_item_name)} × ${item.quantity}</div>
          ${opts ? `<div class="po-item-opts">${escapeHtml(opts)}</div>` : ""}
          ${item.note ? `<div class="po-item-note">Ghi chú: ${escapeHtml(item.note)}</div>` : ""}
        </div>
        <span class="po-badge ${cls}">${label}</span>
      </div>
      <div class="po-item-bottom">
        <div class="po-actions">${actions}</div>
        ${item.status === "cancelled" ? "" : `<span class="po-item-total">${formatMoney(item.line_total)}</span>`}
      </div>
    </div>`;
}

function renderSheet() {
  const box = $("sheet");
  if (!state.table) {
    box.innerHTML = `<div class="po-empty">Chọn một bàn để bắt đầu gọi món.</div>`;
    return;
  }
  const order = state.order;
  const [stLabel, stClass] = order ? (ORDER_STATUS[order.status] || [order.status, "po-badge-nude"]) : ["Chưa có order", "po-badge-nude"];
  const items = order ? order.items : [];
  const unsent = items.filter(isUnsent).length;

  box.innerHTML = `
    <div class="po-sheet-head">
      <div>
        <h4>Phiếu gọi món · Bàn ${escapeHtml(state.table.table_number)}</h4>
        <div class="po-sheet-sub">${order ? "Order #" + order.id : "Chọn món để mở order"} · Phục vụ: ${escapeHtml(state.user.full_name)}</div>
      </div>
      <span class="po-badge ${stClass}">${stLabel}</span>
    </div>
    <div class="po-items">
      ${items.length ? items.map(itemRow).join("") : `<div class="po-empty">Chưa có món nào.<br>Bấm vào món bên trái để thêm.</div>`}
    </div>
    <div class="po-sheet-foot">
      <div class="po-subtotal"><span>Tạm tính:</span><strong>${formatMoney(order ? order.subtotal : 0)}</strong></div>
      <button type="button" id="btnSend" class="po-btn po-btn-primary po-btn-block" ${unsent ? "" : "disabled"}>
        Gửi bếp${unsent ? ` (${unsent} món)` : ""}
      </button>
    </div>`;
}

// Chạy 1 thao tác gọi API trên phiếu: chặn bấm đúp, lỗi thì báo và tải lại order cho đúng với server
async function runAction(fn) {
  if (state.busy) return;
  state.busy = true;
  try {
    await fn();
    renderSheet();
  } catch (error) {
    handleError(error);
    await reloadOrder();
  } finally {
    state.busy = false;
    if (state.dirty) {
      state.dirty = false;
      reloadOrder();
    }
  }
}

async function reloadOrder() {
  if (!state.order) return;
  try {
    state.order = await api.get(`/orders/${state.order.id}`);
    renderSheet();
  } catch (error) {
    if (error.status === 401) handleError(error);
  }
}

function itemAction(action, itemId) {
  const item = state.order && state.order.items.find((i) => i.id === itemId);
  if (!item) return;
  const base = `/orders/${state.order.id}/items/${itemId}`;
  runAction(async () => {
    if (action === "inc" || action === "dec") {
      const quantity = item.quantity + (action === "inc" ? 1 : -1);
      if (quantity < 1 || quantity > 99) return;
      state.order = await api.put(base, { quantity });
    } else if (action === "cancel") {
      if (!confirm(`Huỷ món "${item.menu_item_name}"?`)) return;
      state.order = await api.delete(base);
      showToast("Đã huỷ món");
    } else if (action === "serve") {
      state.order = await api.put(base + "/status", { status: "served" });
      showToast(`Đã ra món ${item.menu_item_name}`);
    }
  });
}

function sendToKitchen() {
  if (!state.order) return;
  const count = state.order.items.filter(isUnsent).length;
  runAction(async () => {
    state.order = await api.post(`/orders/${state.order.id}/send-to-kitchen`);
    markTableOccupied();
    showToast(`Đã gửi ${count} món xuống bếp`);
  });
}

// ---------- Tự làm mới để thấy bếp cập nhật trạng thái ----------
function startPoll() {
  stopPoll();
  state.poll = setInterval(pollOrder, POLL_MS);
}

function stopPoll() {
  clearInterval(state.poll);
  state.poll = null;
}

async function pollOrder() {
  if (!state.order || state.busy || document.hidden || state.dish) return;
  // Realtime đang nối thì sự kiện tự tới: chỉ tải lại mỗi 30 giây phòng khi lỡ. Mất kết nối thì 5 giây một lần như cũ.
  if (Realtime.isOpen() && ++state.pollTick % 6 !== 0) return;
  try {
    const fresh = await api.get(`/orders/${state.order.id}`);
    if (state.busy) return; // người dùng vừa thao tác trong lúc chờ: bỏ kết quả cũ
    if (!ORDER_STATUS[fresh.status]) {
      // order đã thanh toán / huỷ ở nơi khác -> bàn coi như trống
      showToast("Order của bàn này đã đóng.");
      state.order = null;
      await refreshTables();
      renderSheet();
    } else if (JSON.stringify(fresh) !== JSON.stringify(state.order)) {
      state.order = fresh;
      renderSheet();
    }
  } catch (error) {
    if (error.status === 401) handleError(error);
  }
}

// ---------- Thông báo realtime (WebSocket) ----------
// Backend gửi: {type:"item.status", order_id, table_number, menu_item_name, quantity, status} khi bếp đổi trạng thái món,
//              {type:"order.changed", kind:"transfer|merge|split", ...} khi order đổi bàn / gộp / tách.
function startRealtime() {
  Realtime.connect({
    onStatus: showLive,
    onOpen: (isReconnect) => {
      // Vừa nối lại sau khi mất kết nối: có thể đã lỡ sự kiện nên tải lại cho đúng
      if (!isReconnect) return;
      if (state.table) reloadOrder();
      else refreshTables();
    },
    onEvent: onRealtimeEvent,
  });
}

function showLive(name, info) {
  const el = $("rtStatus");
  el.className = "po-rt " + name;
  el.textContent = {
    connecting: "Đang kết nối...",
    open: "Trực tiếp",
    reconnecting: `Mất kết nối, thử lại lần ${info.attempt}...`,
    auth_failed: "Hết phiên",
    closed: "",
  }[name] || "";
}

function onRealtimeEvent(msg) {
  if (msg.type === "order.changed") {
    // Order đổi bàn / gộp / tách: đang ở màn hình chọn bàn thì tải lại bàn; đang mở đúng order đó thì tải lại order
    if (!state.table) refreshTables();
    else if (state.order && (state.order.id === msg.order_id || state.order.id === msg.other_order_id)) reloadOrder();
    return;
  }
  if (msg.type !== "item.status") return;
  // Món nấu xong: báo cho phục vụ biết để mang ra (mọi phục vụ cùng chi nhánh đều thấy)
  if (msg.status === "done") {
    notify(`Món đã xong · Bàn ${msg.table_number}`, `${msg.menu_item_name} × ${msg.quantity}: mang ra cho khách`);
  }
  // Đang mở đúng order đó thì cập nhật trạng thái món ngay. Đang bận thao tác thì tải lại khi xong.
  if (state.order && state.order.id === msg.order_id) {
    if (state.busy) state.dirty = true;
    else reloadOrder();
  }
}

// Thông báo nổi ở góc dưới phải, bấm để tắt, tự tắt sau 20 giây
function notify(title, detail) {
  let box = $("notices");
  if (!box) {
    box = document.createElement("div");
    box.id = "notices";
    box.className = "po-notices";
    document.body.appendChild(box);
  }
  const el = document.createElement("button");
  el.type = "button";
  el.className = "po-notice";
  const head = document.createElement("strong");
  head.textContent = title; // textContent: tên món do người dùng nhập, không chèn HTML
  const body = document.createElement("span");
  body.textContent = detail;
  el.append(head, body);
  el.addEventListener("click", () => el.remove());
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => el.remove(), 20000);
}

// ---------- Gắn sự kiện ----------
function bindEvents() {
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("loginSubmit");
    button.disabled = true;
    try {
      const tokens = await api.post("/auth/login", {
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value,
      });
      saveSession(tokens);
      state.user = await loadUser($("loginEmail").value.trim());
      if (hasAuth) Auth.saveUser(state.user); // để thanh menu chung biết ai đang đăng nhập
      $("loginPassword").value = "";
      await startApp();
    } catch (error) {
      clearSession();
      showLogin(error.message);
    } finally {
      button.disabled = false;
    }
  });
  $("btnLogout").addEventListener("click", () => logout());
  $("btnBack").addEventListener("click", backToTables);

  $("tableGrid").addEventListener("click", (event) => {
    const tile = event.target.closest("[data-id]");
    if (tile) selectTable(Number(tile.dataset.id));
  });
  $("catTabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-cat]");
    if (!tab) return;
    state.catId = tab.dataset.cat;
    renderCategories();
    renderDishes();
  });
  let searchTimer;
  $("searchInput").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = event.target.value;
      renderDishes();
    }, 200);
  });
  $("dishGrid").addEventListener("click", (event) => {
    const card = event.target.closest(".po-dish");
    if (card && !card.disabled) openDish(Number(card.dataset.id));
  });
  $("dishGrid").addEventListener("error", (event) => {
    if (event.target.tagName === "IMG") event.target.remove(); // ảnh lỗi -> hiện chữ cái đầu thay thế
  }, true);

  // Modal
  $("dishClose").addEventListener("click", closeDish);
  $("dishCancel").addEventListener("click", closeDish);
  $("dishModal").addEventListener("click", (event) => {
    if (event.target === $("dishModal")) closeDish();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.dish) closeDish();
  });
  $("dishBody").addEventListener("change", updateDishTotal);
  $("dishBody").addEventListener("click", (event) => {
    if (event.target.id === "qtyMinus" && state.dishQty > 1) state.dishQty--;
    else if (event.target.id === "qtyPlus" && state.dishQty < 99) state.dishQty++;
    else return;
    updateDishTotal();
  });
  $("dishAdd").addEventListener("click", addDish);

  // Phiếu gọi món
  $("sheet").addEventListener("click", (event) => {
    if (event.target.closest("#btnSend")) return sendToKitchen();
    const button = event.target.closest("[data-action]");
    if (button) itemAction(button.dataset.action, Number(button.dataset.id));
  });
}

init();