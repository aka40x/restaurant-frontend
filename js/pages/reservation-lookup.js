const form = document.getElementById("lookup-form");
const searchInput = document.getElementById("lookup-value");
const searchLabel = document.getElementById("lookup-label");
const searchIcon = document.getElementById("lookup-input-icon");
const searchByCode = document.getElementById("search-by-code");
const searchByPhone = document.getElementById("search-by-phone");
const verification = document.getElementById("lookup-verification");
const verificationInput = document.getElementById("verification-value");
const verificationLabel = document.getElementById("verification-label");
const verificationCopy = document.getElementById("verification-copy");
const verifyButton = document.getElementById("btn-verify");
const searchButton = document.getElementById("btn-lookup");
const resultBox = document.getElementById("lookup-result");

const PHONE_RE = /^0\d{9,10}$/;
const STATUS = {
  pending: ["Chờ xác nhận", "badge-warning"],
  confirmed: ["Đã xác nhận", "badge-info"],
  seated: ["Đã đến", "badge-success"],
  cancelled: ["Đã huỷ", "badge-muted"],
  no_show: ["Không đến", "badge-danger"],
};

let searchMode = "code";
let pendingIdentifier = "";
let currentPhone = "";
let currentReservation = null;

function setSearchMode(mode) {
  searchMode = mode;
  const isCode = mode === "code";
  searchByCode.classList.toggle("active", isCode);
  searchByPhone.classList.toggle("active", !isCode);
  searchByCode.setAttribute("aria-selected", String(isCode));
  searchByPhone.setAttribute("aria-selected", String(!isCode));
  searchInput.type = isCode ? "text" : "tel";
  searchInput.autocomplete = isCode ? "off" : "tel";
  searchInput.placeholder = isCode ? "Nhập mã đặt bàn" : "Nhập số điện thoại đã đặt bàn";
  searchLabel.textContent = isCode ? "Mã đặt bàn" : "Số điện thoại";
  searchIcon.textContent = isCode ? "▣" : "♧";
  document.getElementById("lookup-error").textContent = "";
  searchInput.classList.remove("invalid");
  verification.hidden = true;
  pendingIdentifier = "";
}

function showVerificationStep() {
  const isCode = searchMode === "code";
  verificationLabel.textContent = isCode ? "Số điện thoại xác nhận" : "Mã đặt bàn";
  verificationCopy.textContent = isCode
    ? "Để bảo vệ thông tin đặt bàn, vui lòng xác nhận số điện thoại đã dùng khi đặt."
    : "Để bảo vệ thông tin đặt bàn, vui lòng nhập thêm mã đặt bàn.";
  verificationInput.type = isCode ? "tel" : "text";
  verificationInput.autocomplete = isCode ? "tel" : "off";
  verificationInput.placeholder = isCode ? "090 123 4567" : "VD: DB-2K9X4F";
  verification.hidden = false;
  document.getElementById("verification-error").textContent = "";
  verificationInput.classList.remove("invalid");
  verificationInput.focus();
}

function canCancel(reservation) {
  return ["pending", "confirmed"].includes(reservation.status)
    && new Date(reservation.reserved_at) > new Date();
}

function renderResult(reservation) {
  currentReservation = reservation;
  const [statusLabel, badgeClass] = STATUS[reservation.status] || [reservation.status, "badge-muted"];
  const branchName = reservation.branch?.name || `Chi nhánh #${reservation.branch_id}`;
  const branchAddress = reservation.branch?.address || "";
  const tableNumber = reservation.table?.table_number || "Chưa xếp bàn";
  const cancelButton = canCancel(reservation)
    ? '<button id="btn-cancel" class="btn" type="button">Huỷ đặt bàn</button>'
    : "";
  const statusMessage = reservation.status === "cancelled"
    ? "Đặt bàn này đã được huỷ."
    : reservation.status === "seated"
      ? "Quý khách đã được nhận bàn. Chúc quý khách ngon miệng."
      : reservation.status === "no_show"
        ? "Đặt bàn này đã được ghi nhận là khách không đến."
        : "Nhà hàng sẽ xác nhận và chuẩn bị đón tiếp quý khách.";

  resultBox.hidden = false;
  resultBox.innerHTML = `
    <div class="lookup-result-heading">
      <h2>Thông tin đặt bàn</h2>
      <span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="info-grid">
      <div class="info-cell"><div class="label">Mã đặt bàn</div><div class="value">${escapeHtml(reservation.code)}</div></div>
      <div class="info-cell"><div class="label">Thời gian</div><div class="value">${escapeHtml(formatDateTime(reservation.reserved_at))}</div></div>
      <div class="info-cell"><div class="label">Chi nhánh</div><div class="value">${escapeHtml(branchName)}<br>${escapeHtml(branchAddress)}</div></div>
      <div class="info-cell"><div class="label">Số khách / Bàn</div><div class="value">${reservation.party_size} khách · ${escapeHtml(tableNumber)}</div></div>
      <div class="info-cell"><div class="label">Người đặt</div><div class="value">${escapeHtml(reservation.guest_name)} · ${escapeHtml(reservation.guest_phone)}</div></div>
      ${reservation.note ? `<div class="info-cell"><div class="label">Ghi chú</div><div class="value">${escapeHtml(reservation.note)}</div></div>` : ""}
    </div>
    <p class="muted">${escapeHtml(statusMessage)}</p>
    <div class="lookup-result-actions">${cancelButton}</div>`;

  resultBox.querySelector("#btn-cancel")?.addEventListener("click", cancelReservation);
}

async function lookupReservation() {
  const identifier = pendingIdentifier.trim();
  const companion = verificationInput.value.trim();
  const errorBox = document.getElementById("verification-error");
  errorBox.textContent = "";
  verificationInput.classList.remove("invalid");

  let code;
  let phone;
  if (searchMode === "code") {
    code = identifier.toUpperCase();
    phone = companion.replace(/[\s.-]/g, "");
  } else {
    phone = identifier.replace(/[\s.-]/g, "");
    code = companion.toUpperCase();
  }
  if (!PHONE_RE.test(phone)) {
    errorBox.textContent = "Số điện thoại bắt đầu bằng 0, gồm 10-11 số.";
    verificationInput.classList.add("invalid");
    if (searchMode === "phone") searchInput.classList.add("invalid");
    return;
  }
  if (!code) {
    errorBox.textContent = "Vui lòng nhập mã đặt bàn.";
    verificationInput.classList.add("invalid");
    return;
  }

  verifyButton.disabled = true;
  verifyButton.textContent = "Đang tra cứu...";
  try {
    currentPhone = phone;
    const reservation = await api.get("/reservations/lookup", { code, phone });
    renderResult(reservation);
    verification.hidden = true;
  } catch (error) {
    errorBox.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    verifyButton.disabled = false;
    verifyButton.textContent = "Xác nhận thông tin";
  }
}

async function cancelReservation() {
  if (!currentReservation || !confirm(`Huỷ đặt bàn ${currentReservation.code}? Thao tác này không hoàn tác được.`)) {
    return;
  }

  const button = resultBox.querySelector("#btn-cancel");
  button.disabled = true;
  try {
    const updated = await api.post("/reservations/cancel", {
      code: currentReservation.code,
      phone: currentPhone,
    });
    renderResult(updated);
    showToast("Đã huỷ đặt bàn");
  } catch (error) {
    showToast(error.message, "error");
    button.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = searchInput.value.trim();
  const errorBox = document.getElementById("lookup-error");
  errorBox.textContent = "";
  searchInput.classList.remove("invalid");
  if (!value) {
    errorBox.textContent = searchMode === "code" ? "Vui lòng nhập mã đặt bàn." : "Vui lòng nhập số điện thoại.";
    searchInput.classList.add("invalid");
    return;
  }
  if (searchMode === "phone" && !PHONE_RE.test(value.replace(/[\s.-]/g, ""))) {
    errorBox.textContent = "Số điện thoại bắt đầu bằng 0, gồm 10-11 số.";
    searchInput.classList.add("invalid");
    return;
  }

  pendingIdentifier = value;
  showVerificationStep();
});

verifyButton.addEventListener("click", lookupReservation);
verificationInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupReservation();
  }
});
searchByCode.addEventListener("click", () => setSearchMode("code"));
searchByPhone.addEventListener("click", () => setSearchMode("phone"));

const params = new URLSearchParams(window.location.search);
const presetCode = params.get("code");
if (presetCode) {
  setSearchMode("code");
  searchInput.value = presetCode;
  pendingIdentifier = presetCode;
  showVerificationStep();
  let saved;
  try {
    saved = sessionStorage.getItem("lastReservation");
  } catch (error) {
    showToast("Không thể đọc thông tin đặt bàn đã lưu. Vui lòng xác nhận lại.", "error");
  }
  if (saved) {
    try {
      const reservation = JSON.parse(saved);
      if (reservation.code === presetCode && reservation.guest_phone) {
        verificationInput.value = reservation.guest_phone;
        lookupReservation();
      }
    } catch (error) {
      showToast("Không đọc được thông tin đặt bàn đã lưu. Vui lòng xác nhận lại.", "error");
    }
  }
}
