// Các hàm tiện ích dùng chung cho nhiều trang.

// Chống XSS: luôn dùng hàm này khi chèn dữ liệu người dùng nhập vào innerHTML
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// 45000 -> "45.000 ₫"
function formatMoney(value) {
  return Number(value).toLocaleString("vi-VN") + " ₫";
}

// "2026-11-04T09:30:00" -> "09:30 4/11/2026"
function formatDateTime(value) {
  const d = new Date(value);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " " +
    d.toLocaleDateString("vi-VN");
}

// Hiện thông báo nhỏ ở góc màn hình. type: "success" | "error"
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-exit");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}
// Bấm ra vùng tối (backdrop) thì <dialog> tự đóng
(function () {
  let downOnBackdrop = false;
  const isBackdropHit = (dialog, event) => {
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  document.addEventListener("mousedown", (event) => {
    const d = event.target;
    downOnBackdrop = d instanceof HTMLDialogElement && d.open && !d.hasAttribute("data-no-backdrop-close") && isBackdropHit(d, event);
  });
  document.addEventListener("click", (event) => {
    const d = event.target;
    if (downOnBackdrop && d instanceof HTMLDialogElement && d.open && isBackdropHit(d, event)) d.close();
    downOnBackdrop = false;
  });
})();