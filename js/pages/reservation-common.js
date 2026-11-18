// Phần dùng chung cho trang quản lý đặt bàn (pages/admin/reservations.html).
// Nạp TRƯỚC reservations.js. Chỉ chứa hằng số và hàm nhỏ, không đụng tới DOM.

// Trạng thái đặt bàn (khớp backend: pending / confirmed / seated / cancelled / no_show)
const RESERVATION_STATUS = {
  pending: { label: "Chờ xác nhận", badge: "badge-warning" },
  confirmed: { label: "Đã xác nhận", badge: "badge-info" },
  seated: { label: "Đã nhận bàn", badge: "badge-success" },
  cancelled: { label: "Đã huỷ", badge: "badge-danger" },
  no_show: { label: "Không đến", badge: "badge-muted" },
};

function reservationStatusBadge(status) {
  const info = RESERVATION_STATUS[status] || { label: status || "?", badge: "badge-muted" };
  return `<span class="badge ${info.badge}">${escapeHtml(info.label)}</span>`;
}

// "2026-11-18T19:30:00" -> "19:30"
function formatTimeHM(value) {
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

// "2026-11-18T19:30:00" -> "18/11/2026"
function formatDateDMY(value) {
  return new Date(value).toLocaleDateString("vi-VN");
}

// Ngày hôm nay theo giờ máy, dạng "YYYY-MM-DD" cho <input type="date">.
// Không dùng toISOString() vì nó tính theo UTC, buổi sáng ở Việt Nam sẽ ra ngày hôm qua.
function todayInputValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// { table_number: "A1", area: "Tầng 1", capacity: 4 } -> "A1 · Tầng 1"
function reservationTableText(table) {
  if (!table) return "Chưa xếp bàn";
  return table.area ? `${table.table_number} · ${table.area}` : table.table_number;
}