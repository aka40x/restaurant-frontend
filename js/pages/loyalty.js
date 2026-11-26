// Trang Khách thân thiết: tra điểm theo SĐT, tích điểm cho hoá đơn đã thanh toán, đổi điểm lấy voucher.
//   Tra cứu      -> GET  /loyalty/{phone}
//   Tích điểm    -> POST /loyalty/earn   { payment_id, phone }
//   Đổi điểm     -> POST /loyalty/redeem { phone, points }   (trả về mã voucher dùng ở màn hình Thanh toán)
// Backend tính điểm và tiền: trang này chỉ hiển thị kết quả server trả về.

const POINT_VALUE = 1000; // chỉ để hiện "xem trước"; số tiền thật do server quyết định (crud/loyalty.py)
const MIN_REDEEM = 10;
const PHONE_RE = /^0\d{9,10}$/;

const phoneInput = document.getElementById("phone");
const lookupMsg = document.getElementById("lookup-msg");
const accountBox = document.getElementById("account");
const accName = document.getElementById("acc-name");
const accPhone = document.getElementById("acc-phone");
const accBalance = document.getElementById("acc-balance");
const historyList = document.getElementById("history");
const paymentInput = document.getElementById("payment-id");
const earnButton = document.getElementById("btn-earn");
const earnMsg = document.getElementById("earn-msg");
const pointsInput = document.getElementById("points");
const redeemButton = document.getElementById("btn-redeem");
const redeemPreview = document.getElementById("redeem-preview");
const redeemMsg = document.getElementById("redeem-msg");
const voucherResult = document.getElementById("voucher-result");

const setMsg = (el, text, kind) => { el.className = `msg ${kind || "muted"}`; el.textContent = text; };
const currentPhone = () => phoneInput.value.trim();

function checkPhone(msgEl) {
  if (PHONE_RE.test(currentPhone())) return true;
  setMsg(msgEl, "Nhập số điện thoại hợp lệ (bắt đầu bằng 0, 10 đến 11 số)", "text-error");
  phoneInput.focus();
  return false;
}

const TYPE_LABEL = { earn: "Tích điểm", redeem: "Đổi điểm" };

function renderAccount(acc) {
  accName.textContent = acc.full_name;
  accPhone.textContent = acc.phone;
  accBalance.textContent = Number(acc.balance).toLocaleString("vi-VN");
  historyList.innerHTML = acc.history.length === 0
    ? `<li class="muted">Chưa có giao dịch nào</li>`
    : acc.history.map((h) => {
        const sign = h.points > 0 ? "plus" : "minus";
        const note = h.type === "earn" ? `Thanh toán #${h.payment_id}` : "Đổi lấy voucher";
        return `<li>
          <span>${escapeHtml(TYPE_LABEL[h.type] || h.type)}<br><span class="muted">${escapeHtml(note)} · ${formatDateTime(h.created_at)}</span></span>
          <span class="${sign}">${h.points > 0 ? "+" : ""}${h.points}</span>
        </li>`;
      }).join("");
  accountBox.hidden = false;
}

async function lookup() {
  if (!checkPhone(lookupMsg)) return false;
  setMsg(lookupMsg, "Đang tra cứu...");
  try {
    renderAccount(await api.get(`/loyalty/${currentPhone()}`));
    setMsg(lookupMsg, "");
    return true;
  } catch (error) {
    accountBox.hidden = true;
    setMsg(lookupMsg, error.status === 404 ? "Khách chưa có điểm. Tích điểm cho hoá đơn đầu tiên để tạo tài khoản." : error.message,
      error.status === 404 ? "muted" : "text-error");
    return false;
  }
}

document.getElementById("lookup-form").addEventListener("submit", (event) => {
  event.preventDefault();
  voucherResult.hidden = true;
  lookup();
});

// ---------- Tích điểm ----------
earnButton.addEventListener("click", async () => {
  setMsg(earnMsg, "");
  const paymentId = Number(paymentInput.value);
  if (!checkPhone(earnMsg)) return;
  if (!Number.isInteger(paymentId) || paymentId < 1) {
    setMsg(earnMsg, "Nhập mã thanh toán (số nguyên dương)", "text-error");
    paymentInput.focus();
    return;
  }
  earnButton.disabled = true;
  try {
    const result = await api.post("/loyalty/earn", { payment_id: paymentId, phone: currentPhone() });
    setMsg(earnMsg, `Đã cộng ${result.earned} điểm. Số dư hiện tại: ${result.balance} điểm.`, "text-ok");
    paymentInput.value = "";
    showToast(`Đã cộng ${result.earned} điểm`);
    await lookup();
  } catch (error) {
    setMsg(earnMsg, error.message, "text-error");
  } finally {
    earnButton.disabled = false;
  }
});

// ---------- Đổi điểm ----------
pointsInput.addEventListener("input", () => {
  const points = Number(pointsInput.value);
  redeemPreview.className = "muted msg";
  redeemPreview.textContent = Number.isInteger(points) && points >= MIN_REDEEM
    ? `Tương đương giảm ${formatMoney(points * POINT_VALUE)}`
    : "";
});

redeemButton.addEventListener("click", async () => {
  setMsg(redeemMsg, "");
  voucherResult.hidden = true;
  const points = Number(pointsInput.value);
  if (!checkPhone(redeemMsg)) return;
  if (!Number.isInteger(points) || points < MIN_REDEEM) {
    setMsg(redeemMsg, `Mỗi lần đổi tối thiểu ${MIN_REDEEM} điểm`, "text-error");
    pointsInput.focus();
    return;
  }
  if (!confirm(`Đổi ${points} điểm lấy voucher giảm ${formatMoney(points * POINT_VALUE)}?`)) return;
  redeemButton.disabled = true;
  try {
    const r = await api.post("/loyalty/redeem", { phone: currentPhone(), points });
    voucherResult.innerHTML = `
      <div>Mã voucher (dùng 1 lần, hết hạn ${new Date(r.end_date).toLocaleDateString("vi-VN")}):</div>
      <code id="voucher-code">${escapeHtml(r.voucher_code)}</code>
      <button type="button" class="btn" id="btn-copy">Sao chép</button>
      <div class="muted">Giảm ${formatMoney(r.discount_value)}, áp dụng cho đơn từ ${formatMoney(r.discount_value)} trở lên. Nhập mã này vào ô "Mã voucher" ở màn hình Thanh toán.</div>`;
    voucherResult.hidden = false;
    document.getElementById("btn-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(r.voucher_code); showToast("Đã sao chép mã voucher"); }
      catch { showToast("Không sao chép được, hãy chọn mã và nhấn Ctrl + C", "error"); }
    });
    pointsInput.value = "";
    redeemPreview.textContent = "";
    showToast("Đổi điểm thành công");
    await lookup();
  } catch (error) {
    setMsg(redeemMsg, error.message, "text-error");
  } finally {
    redeemButton.disabled = false;
  }
});