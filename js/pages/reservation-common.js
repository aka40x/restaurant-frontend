// Hàm dùng chung cho các trang đặt bàn (module M3): nhãn trạng thái, giờ, ngày.
// Nạp file này TRƯỚC script riêng của trang. Tên bắt đầu bằng RESERVATION_ / res để khỏi trùng với trang khác.

// Trạng thái đặt bàn -> [nhãn tiếng Việt, class badge trong css/style.css]
const RESERVATION_STATUS = {
  pending: ["Chờ xác nhận", "badge-warning"],
  confirmed: ["Đã xác nhận", "badge-info"],
  seated: ["Đã nhận bàn", "badge-success"],
  cancelled: ["Đã huỷ", "badge-muted"],
  no_show: ["Không đến", "badge-danger"],
};

// <span class="badge ...">Chờ xác nhận</span>
function reservationBadge(status) {
  const [label, badge] = RESERVATION_STATUS[status] || [status, "badge-muted"];
  return `<span class="badge ${badge}">${escapeHtml(label)}</span>`;
}

// "2026-11-26T19:00:00" -> "19:00"
function resTime(value) {
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Date -> "2026-11-26" (giờ máy người dùng, dùng cho ô chọn ngày)
function resDateInput(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Cộng / trừ ngày cho chuỗi "YYYY-MM-DD"
function resAddDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return resDateInput(d);
}