const box = document.getElementById("success-content");

function readReservation() {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return null;
  try {
    const saved = sessionStorage.getItem("lastReservation");
    const reservation = saved ? JSON.parse(saved) : null;
    return reservation?.code === code ? reservation : null;
  } catch (error) {
    showToast("Không thể đọc thông tin đặt bàn trên thiết bị này.", "error");
    return null;
  }
}

function renderReservation(reservation) {
  const branchName = reservation.branch?.name || `Chi nhánh #${reservation.branch_id}`;
  const tableText = reservation.table
    ? `${reservation.table.table_number}${reservation.table.area ? " - " + reservation.table.area : ""}`
    : "Nhà hàng sẽ sắp xếp";  box.innerHTML = `
    <div class="success-code-row">
      <div>
        <div class="code-label">MÃ ĐẶT BÀN</div>
        <div class="code-value" id="reservation-code">${escapeHtml(reservation.code)}</div>
      </div>
      <button id="btn-copy" class="btn copy-button" type="button">▣ &nbsp;Sao chép</button>
    </div>
    <div class="success-info-grid">
      <div class="success-info-cell">
        <div class="label">▣ &nbsp;Thời gian</div>
        <div class="value">${escapeHtml(formatDateTime(reservation.reserved_at))}</div>
      </div>
      <div class="success-info-cell">
        <div class="label">♧ &nbsp;Số lượng khách</div>
        <div class="value">${String(reservation.party_size).padStart(2, "0")} Khách người lớn</div>
      </div>
      <div class="success-info-cell">
        <div class="label">♧ &nbsp;Chi nhánh</div>
        <div class="value">${escapeHtml(branchName)}${reservation.branch?.address ? `, ${escapeHtml(reservation.branch.address)}` : ""}</div>
      </div>
      <div class="success-info-cell">
        <div class="label">▤ &nbsp;Bàn</div>
        <div class="value">${escapeHtml(tableText)}</div>
      </div>
    </div>
    <div class="success-actions">
      <a class="btn btn-primary" href="reservation-lookup.html?code=${encodeURIComponent(reservation.code)}">⌕ &nbsp;Tra Cứu Bàn Tiệc</a>
      <a class="btn" href="../../index.html">⌂ &nbsp;Về Trang Chủ</a>
    </div>`;

  box.querySelector("#btn-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(reservation.code);
      showToast("Đã sao chép mã đặt bàn");
    } catch (error) {
      showToast(`Không thể sao chép tự động. Mã đặt bàn: ${reservation.code}`, "error");
    }
  });
}

const reservation = readReservation();
if (reservation) {
  renderReservation(reservation);
} else {
  box.classList.add("success-empty");
  box.innerHTML = `
    <h2>Không có thông tin đặt bàn</h2>
    <p class="muted">Trang này chỉ hiển thị sau khi đặt bàn. Nếu đã có mã, vui lòng tra cứu đặt bàn.</p>
    <div class="success-actions">
      <a class="btn btn-primary" href="reservation.html">Đặt bàn</a>
      <a class="btn" href="reservation-lookup.html">Tra cứu đặt bàn</a>
    </div>`;
}
