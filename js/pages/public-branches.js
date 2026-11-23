// Trang khách: danh sách chi nhánh. API công khai: GET /branches (khách chỉ thấy chi nhánh đang hoạt động).
const listBox = document.getElementById("branch-list");
const hhmm = (t) => String(t || "").slice(0, 5); // "10:00:00" -> "10:00"
const minutes = (t) => { const [h, m] = hhmm(t).split(":").map(Number); return h * 60 + m; };
// escapeHtml chưa escape dấu " và ', nên khi chèn vào thuộc tính HTML (src, alt, href) phải dùng hàm này
const escapeAttr = (value) => escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Đang mở cửa? (giờ máy của khách; xử lý cả trường hợp đóng cửa qua nửa đêm)
function isOpenNow(b) {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const open = minutes(b.open_time), close = minutes(b.close_time);
  if (open === close) return true; // giờ mở = giờ đóng: hiểu là mở cả ngày
  return open <= close ? now >= open && now < close : now >= open || now < close;
}

const icon = (path) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${path}</svg>`;
const ICON_PIN = icon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>');
const ICON_PHONE = icon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>');
const ICON_CLOCK = icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');

function branchCard(b) {
  const open = isOpenNow(b);
  return `
    <article class="branch-card">
      <div class="branch-top">
        <h2>${escapeHtml(b.name)}</h2>
        <span class="badge ${open ? "badge-success" : "badge-muted"}">${open ? "Đang mở cửa" : "Đã đóng cửa"}</span>
      </div>
      <ul class="branch-info">
        <li>${ICON_PIN}<span>${escapeHtml(b.address)}</span></li>
        ${b.phone ? `<li>${ICON_PHONE}<a href="tel:${escapeAttr(b.phone)}">${escapeHtml(b.phone)}</a></li>` : ""}
        <li>${ICON_CLOCK}<span>${hhmm(b.open_time)} - ${hhmm(b.close_time)} (mỗi ngày)</span></li>
      </ul>
      <a class="btn btn-book" href="reservation.html?branch_id=${b.id}">Đặt bàn tại đây</a>
    </article>`;
}

async function loadBranches() {
  try {
    const list = (await api.get("/branches", { only_active: true })).filter((b) => b.is_active);
    listBox.innerHTML = list.length
      ? list.map(branchCard).join("")
      : `<p class="muted">Chưa có chi nhánh nào đang mở. Bạn quay lại sau nhé.</p>`;
  } catch (error) {
    listBox.innerHTML = `<p class="text-error">${escapeHtml(error.message)}</p>`;
  }
}
loadBranches();