// Màn hình bếp dạng cột: Chờ nấu | Đang nấu | Xong. Bấm vào thẻ món để chuyển sang bước tiếp theo.
//
// API sử dụng (xem backend/app/routers):
//   POST /auth/login, GET /auth/me                 đăng nhập
//   GET  /kitchen/items                            hàng đợi món đã gửi bếp (pending / cooking / done), cũ nhất trước
//   PUT  /orders/{order_id}/items/{id}/status      {status:"cooking"} hoặc {status:"done"}  (bếp, quản lý, admin)
//                                                  {status:"served"}  (phục vụ, quản lý, admin: nút "Đã mang ra" ở cột Xong)
// Trang nhận sự kiện realtime qua WebSocket; mất kết nối thì tự làm mới 5 giây / lần.

const TOKEN_KEY = "token"; // cùng khoá mà js/api.js đọc để gắn Authorization
const POLL_MS = 5000;
const WARN_MIN = 10; // chờ từ 10 phút: đổi màu vàng
const LATE_MIN = 20; // chờ từ 20 phút: đổi màu đỏ
const NEW_FLASH_MS = 6000; // thẻ mới nhấp nháy viền trong 6 giây
// Khớp ITEM_TRANSITIONS ở backend/app/crud/order.py
const COOK_ROLES = ["kitchen", "manager", "admin"]; // nhận món, nấu xong
const SERVE_ROLES = ["waiter", "manager", "admin"]; // mang món ra cho khách

const ROLE_LABEL = { admin: "Quản trị", manager: "Quản lý", cashier: "Thu ngân", waiter: "Phục vụ", kitchen: "Bếp" };

const COLUMNS = [
  { status: "pending", action: "Bắt đầu nấu", next: "cooking", toast: "Đang nấu", roles: COOK_ROLES },
  { status: "cooking", action: "Nấu xong", next: "done", toast: "Đã nấu xong", roles: COOK_ROLES },
  { status: "done", action: "Đã mang ra", next: "served", toast: "Đã mang ra", roles: SERVE_ROLES },
];
// Vai trò hiện tại có được bấm nút của cột này không
const canAct = (col) => !!state.user && !!col.next && col.roles.includes(state.user.role.name);

const state = {
  user: null,
  canCook: false,
  items: [],
  lastJson: "",
  seen: null, // Set id món đã thấy (null = chưa tải lần đầu, để lần đầu không nhấp nháy hết)
  fresh: new Map(), // id món mới -> thời điểm hết nhấp nháy
  busy: new Set(), // id món đang gửi lệnh đổi trạng thái
  loading: false,
  reloadAgain: false, // có yêu cầu tải mới lúc đang tải dở: tải lại ngay khi xong, để không lỡ sự kiện
  pollTick: 0,
  poll: null,
  tick: null,
  sound: false,
  audio: null,
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

// Lỗi không phải hết phiên: hiện bảng bếp kèm thông báo lỗi, KHÔNG đá ra trang đăng nhập
function showFatal(message) {
  $("loginBox").hidden = true;
  $("kdApp").hidden = false;
  setOnline(false, message);
}

function showLogin(message) {
  $("kdApp").hidden = true;
  $("loginBox").hidden = false;
  const box = $("loginError");
  box.hidden = !message;
  box.textContent = message || "";
}

async function startApp() {
  const roleName = state.user.role.name;
  $("loginBox").hidden = true;
  $("kdApp").hidden = false;
  $("kdReadonly").hidden = COLUMNS.some((c) => c.roles.includes(roleName)); // chỉ thu ngân... mới thấy "chế độ xem"
  $("userName").textContent = state.user.full_name;
  $("userRole").textContent = (ROLE_LABEL[roleName] || roleName) + (state.user.branch ? " · " + state.user.branch.name : "");

  state.items = [];
  state.lastJson = "";
  state.seen = null;
  state.fresh.clear();
  render();
  await load();
  startTimers();
  startRealtime();
}

function logout(message) {
  stopTimers();
  Realtime.close();
  clearSession();
  Object.assign(state, { user: null, canCook: false, items: [], lastJson: "", seen: null });
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

// ---------- Tải hàng đợi ----------
function setOnline(ok, message) {
  const el = $("kdStatus");
  el.classList.toggle("offline", !ok);
  el.textContent = ok ? "Cập nhật lúc " + new Date().toLocaleTimeString("vi-VN") : message || "Mất kết nối";
}

async function load() {
  if (!state.user) return;
  if (state.loading) {
    state.reloadAgain = true;
    return;
  }
  state.loading = true;
  try {
    // Không truyền ?status=...: backend mặc định trả đủ pending + cooking + done
    const items = await api.get("/kitchen/items");
    if (!state.user) return; // đã đăng xuất trong lúc chờ
    setOnline(true);
    applyItems(items);
  } catch (error) {
    if (error.status === 401) handleError(error);
    else setOnline(false, error.status === 0 ? "Mất kết nối, đang thử lại..." : error.message);
  } finally {
    state.loading = false;
    if (state.reloadAgain) {
      state.reloadAgain = false;
      load();
    }
  }
}

function applyItems(items) {
  // Món mới xuất hiện sau lần tải đầu: nhấp nháy viền, bật âm báo nếu là món chờ nấu
  let newPending = 0;
  if (state.seen) {
    for (const item of items) {
      if (!state.seen.has(item.id)) {
        state.fresh.set(item.id, Date.now() + NEW_FLASH_MS);
        if (item.status === "pending") newPending++;
      }
    }
  }
  state.seen = new Set(items.map((i) => i.id));
  if (newPending && state.sound) beep();

  const json = JSON.stringify(items);
  if (json === state.lastJson) return; // không đổi gì thì khỏi vẽ lại
  state.lastJson = json;
  state.items = items;
  render();
}

// ---------- Vẽ bảng ----------
function cardHtml(item, col) {
  const clickable = canAct(col);
  const isFresh = (state.fresh.get(item.id) || 0) > Date.now();
  const opts = item.options.length ? `<div class="kd-opts">${escapeHtml(item.options.join(", "))}</div>` : "";
  const note = item.note ? `<div class="kd-note">Ghi chú: ${escapeHtml(item.note)}</div>` : "";

  let foot = "";
  if (clickable) {
    foot = `<button type="button" class="kd-btn ${col.status === "pending" ? "kd-btn-dark" : "kd-btn-gold"} kd-btn-block">${col.action}</button>`;
  } else if (col.status === "done") {
    foot = `<div class="kd-wait">Chờ phục vụ mang ra</div>`;
  }

  return `
    <article class="kd-card ${clickable ? "kd-clickable" : ""} ${isFresh ? "kd-new" : ""} ${state.busy.has(item.id) ? "kd-busy" : ""}"
             data-id="${item.id}" data-next="${clickable ? col.next : ""}">
      <div class="kd-card-top">
        <div>
          <div class="kd-table">Bàn ${escapeHtml(item.table_number)}</div>
          <div class="kd-order">Order #${item.order_id}</div>
        </div>
        <span class="kd-time" data-sent="${escAttr(item.sent_at)}" data-stage="${col.status}">--:--</span>
      </div>
      <div class="kd-dish"><span class="kd-qty">${item.quantity}×</span>${escapeHtml(item.menu_item_name)}</div>
      ${opts}
      ${note}
      ${foot ? `<div class="kd-card-foot">${foot}</div>` : ""}
    </article>`;
}

function render() {
  for (const col of COLUMNS) {
    const list = state.items.filter((i) => i.status === col.status);
    $("cnt-" + col.status).textContent = list.length;
    $("col-" + col.status).innerHTML = list.length
      ? list.map((i) => cardHtml(i, col)).join("")
      : `<div class="kd-empty">Không có món nào.</div>`;
  }
  updateTimes();
}

// ---------- Thời gian chờ ----------
// sent_at từ MySQL không có múi giờ, trình duyệt hiểu là giờ máy: đúng khi máy bếp và máy chủ cùng múi giờ.
function formatElapsed(totalSeconds) {
  const s = Math.max(0, totalSeconds); // đồng hồ lệch nhẹ thì không hiện số âm
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function updateTimes() {
  const now = Date.now();
  document.querySelectorAll(".kd-time").forEach((el) => {
    const sent = new Date(el.dataset.sent).getTime();
    if (Number.isNaN(sent)) {
      el.textContent = "--:--";
      return;
    }
    const seconds = Math.floor((now - sent) / 1000);
    el.textContent = formatElapsed(seconds);
    // Món đã xong thì không còn "trễ" nữa: hiện màu xám, chỉ hiện tổng thời gian từ lúc gửi
    const minutes = seconds / 60;
    const level = el.dataset.stage === "done" ? "stop" : minutes >= LATE_MIN ? "late" : minutes >= WARN_MIN ? "warn" : "";
    el.className = "kd-time" + (level ? " " + level : "");
  });
}

// ---------- Đổi trạng thái món ----------
async function changeStatus(id, next) {
  const item = state.items.find((i) => i.id === id);
  if (!item || state.busy.has(id)) return;
  const col = COLUMNS.find((c) => c.next === next);
  const previous = item.status;

  state.busy.add(id);
  item.status = next; // chuyển cột ngay cho bếp thấy phản hồi, lỗi thì trả lại
  render();
  try {
    await api.put(`/orders/${item.order_id}/items/${id}/status`, { status: next });
    showToast(`Bàn ${item.table_number}: ${item.menu_item_name} · ${col.toast}`);
  } catch (error) {
    item.status = previous;
    handleError(error);
  } finally {
    state.busy.delete(id);
    state.lastJson = ""; // ép vẽ lại theo dữ liệu thật từ server (đúng cả khi bị lỗi 409 do người khác đã đổi)
    await load();
  }
}

// ---------- Âm báo món mới ----------
function beep() {
  try {
    state.audio = state.audio || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.audio;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (error) {
    // trình duyệt không hỗ trợ âm thanh: bỏ qua, màn hình vẫn nhấp nháy báo món mới
  }
}

function toggleSound() {
  state.sound = !state.sound;
  $("btnSound").textContent = "Âm báo: " + (state.sound ? "Bật" : "Tắt");
  $("btnSound").setAttribute("aria-pressed", String(state.sound));
  if (state.sound) beep(); // bấm nút là thao tác của người dùng nên trình duyệt cho phát, và để bếp nghe thử
}

// ---------- Tự làm mới ----------
function startTimers() {
  stopTimers();
  state.poll = setInterval(() => {
    if (document.hidden || state.busy.size) return;
    // Realtime đang nối thì sự kiện tự tới: chỉ tải lại mỗi 30 giây phòng khi lỡ. Mất kết nối thì 5 giây một lần như cũ.
    if (Realtime.isOpen() && ++state.pollTick % 6 !== 0) return;
    load();
  }, POLL_MS);
  state.tick = setInterval(updateTimes, 1000);
}

function stopTimers() {
  clearInterval(state.poll);
  clearInterval(state.tick);
  state.poll = state.tick = null;
}

// ---------- Thông báo realtime (WebSocket) ----------
// Backend gửi: {type:"order.sent", table_number, count} khi phục vụ gửi món xuống bếp,
//              {type:"item.status", ...} khi món đổi trạng thái (từ màn hình bếp khác, hoặc phục vụ bấm "Đã mang ra"),
//              {type:"order.changed", kind:"transfer|merge|split", ...} khi order đổi bàn / gộp / tách.
function startRealtime() {
  Realtime.connect({
    onStatus: showLive,
    onOpen: (isReconnect) => {
      if (isReconnect) load(); // vừa nối lại sau khi mất kết nối: có thể đã lỡ món mới nên tải lại
    },
    onEvent: (msg) => {
      if (msg.type === "order.sent") showToast(`Bàn ${msg.table_number}: ${msg.count} món mới`);
      if (msg.type === "order.changed") showToast(describeChange(msg));
      if (msg.type === "order.sent" || msg.type === "item.status" || msg.type === "order.changed") load(); // thẻ mới nhấp nháy và kêu ở applyItems
    },
    // Không tự đăng xuất khi realtime lỗi xác thực: nhãn "Hết phiên" đã hiện, chỉ đăng xuất khi bấm nút
  });
}

// Câu báo cho bếp khi order đổi bàn / gộp / tách (thẻ món tự đổi tên bàn sau khi tải lại)
function describeChange(msg) {
  if (msg.kind === "transfer") return `Bàn ${msg.from_table_number} chuyển sang bàn ${msg.table_number}`;
  if (msg.kind === "merge") return `Gộp bàn ${msg.other_table_number} vào bàn ${msg.table_number}`;
  if (msg.kind === "split") return `Tách món từ bàn ${msg.table_number} sang bàn ${msg.other_table_number}`;
  return "Order vừa thay đổi";
}

function showLive(name, info) {
  const el = $("kdLive");
  el.className = "kd-live " + name;
  el.textContent = {
    connecting: "Đang kết nối...",
    open: "Trực tiếp",
    reconnecting: `Mất kết nối, thử lại lần ${info.attempt}...`,
    auth_failed: "Hết phiên",
    closed: "",
  }[name] || "";
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
  $("btnSound").addEventListener("click", toggleSound);

  // Bấm vào bất kỳ chỗ nào trên thẻ (hoặc nút) để chuyển trạng thái
  document.querySelector(".kd-board").addEventListener("click", (event) => {
    const card = event.target.closest(".kd-card");
    if (!card || !card.dataset.next) return; // thẻ không có data-next = vai trò này không được bấm
    changeStatus(Number(card.dataset.id), card.dataset.next);
  });

  // Quay lại tab: tải ngay, khỏi chờ lượt làm mới tiếp theo
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.user) load();
  });
}

init();