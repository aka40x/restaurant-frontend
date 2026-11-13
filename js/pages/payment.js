// Trang Thu ngân: chọn order cần thanh toán -> xem hoá đơn, áp voucher -> thanh toán -> in hoá đơn.
//   Danh sách order chưa thanh toán -> GET  /orders?status=open | sent | served
//   Xem hoá đơn tạm / áp voucher    -> GET  /payments/bill/{order_id}?voucher_code=
//   Thanh toán                      -> POST /payments   { order_id, method, voucher_code }
// Backend là nơi tính tiền: trang này chỉ hiển thị số tiền server trả về, không tự tính.

const PAYABLE_STATUSES = ["open", "sent", "served"]; // giống PAYABLE_STATUSES ở backend (crud/payment.py)
const STATUS_LABEL = { open: "Đang gọi món", sent: "Đã gửi bếp", served: "Đã phục vụ" };
const METHOD_LABEL = { cash: "Tiền mặt", card: "Thẻ", transfer: "Chuyển khoản" };

const orderList = document.getElementById("order-list");
const refreshButton = document.getElementById("btn-refresh");
const emptyState = document.getElementById("empty-state");
const billView = document.getElementById("bill-view");
const receiptView = document.getElementById("receipt-view");
const billTitle = document.getElementById("bill-title");
const billStatus = document.getElementById("bill-status");
const billLines = document.getElementById("bill-lines");
const billTotals = document.getElementById("bill-totals");
const voucherInput = document.getElementById("voucher-input");
const voucherButton = document.getElementById("btn-voucher");
const voucherMsg = document.getElementById("voucher-msg");
const payButton = document.getElementById("btn-pay");
const receipt = document.getElementById("receipt");
const printButton = document.getElementById("btn-print");
const nextButton = document.getElementById("btn-next");

let orders = [];           // các order chưa thanh toán đang hiện bên trái
let selectedOrder = null;  // order đang chọn
let currentBill = null;    // hoá đơn server trả về gần nhất
let appliedVoucher = null; // mã voucher đã được server chấp nhận
let paying = false;        // đang gửi yêu cầu thanh toán (chặn bấm 2 lần)

// Mỗi lúc chỉ hiện một trong ba màn bên phải: "empty" | "bill" | "receipt"
function showPanel(name) {
  emptyState.hidden = name !== "empty";
  billView.hidden = name !== "bill";
  receiptView.hidden = name !== "receipt";
}

// ---------- Danh sách order ----------
async function loadOrders() {
  orderList.innerHTML = `<p class="muted">Đang tải...</p>`;
  try {
    // API chỉ lọc được một trạng thái mỗi lần nên gọi cả ba rồi gộp lại
    const groups = await Promise.all(PAYABLE_STATUSES.map((status) => api.get("/orders", { status })));
    orders = groups.flat().sort((a, b) => a.id - b.id);
    renderOrders();
  } catch (error) {
    orderList.innerHTML = `<p class="text-error">${escapeHtml(error.message)}</p>`;
  }
}

function renderOrders() {
  if (orders.length === 0) {
    orderList.innerHTML = `<p class="muted">Không có order nào cần thanh toán</p>`;
    return;
  }
  // Order chỉ có table_id (chưa có API bàn trả số bàn như A1) nên hiện "Bàn #id"
  orderList.innerHTML = orders.map((o) => `
    <button type="button" class="order-item ${selectedOrder?.id === o.id ? "active" : ""}" data-id="${o.id}">
      <div class="row">
        <strong>Bàn #${o.table_id}</strong>
        <span class="badge badge-info">${escapeHtml(STATUS_LABEL[o.status] || o.status)}</span>
      </div>
      <div class="muted">Order #${o.id} · ${formatDateTime(o.created_at)}</div>
    </button>`).join("");
}

orderList.addEventListener("click", (event) => {
  const button = event.target.closest(".order-item");
  if (button) selectOrder(Number(button.dataset.id));
});

refreshButton.addEventListener("click", loadOrders);

// ---------- Hoá đơn tạm ----------
async function selectOrder(id) {
  selectedOrder = orders.find((o) => o.id === id) || null;
  if (!selectedOrder) return;
  appliedVoucher = null;
  voucherInput.value = "";
  voucherMsg.textContent = "";
  renderOrders();
  try {
    currentBill = await fetchBill(null);
    renderBill();
    showPanel("bill");
  } catch (error) {
    showToast(error.message, "error");
    if (error.status === 404 || error.status === 409) backToList(); // order đã bị huỷ / đã thanh toán
  }
}

const fetchBill = (voucherCode) =>
  api.get(`/payments/bill/${selectedOrder.id}`, voucherCode ? { voucher_code: voucherCode } : undefined);

function lineRow(line) {
  const unitPrice = Number(line.unit_price) + Number(line.options_price); // đã gồm tuỳ chọn size/topping
  return `
    <tr>
      <td>${escapeHtml(line.name)}</td>
      <td class="text-right">${line.quantity}</td>
      <td class="text-right">${formatMoney(unitPrice)}</td>
      <td class="text-right">${formatMoney(line.line_total)}</td>
    </tr>`;
}

function totalsHtml(subtotal, discount, total, voucherCode) {
  const discountRow = Number(discount) > 0
    ? `<div class="total-line"><span>Giảm giá${voucherCode ? ` (${escapeHtml(voucherCode)})` : ""}</span><span>- ${formatMoney(discount)}</span></div>`
    : "";
  return `
    <div class="total-line"><span>Tạm tính</span><span>${formatMoney(subtotal)}</span></div>
    ${discountRow}
    <div class="total-line grand"><span>Tổng thanh toán</span><span>${formatMoney(total)}</span></div>`;
}

function renderBill() {
  const bill = currentBill;
  billTitle.textContent = `Bàn #${selectedOrder.table_id} · Order #${bill.order_id}`;
  billStatus.innerHTML = `<span class="badge badge-info">${escapeHtml(STATUS_LABEL[selectedOrder.status] || selectedOrder.status)}</span>`;
  billLines.innerHTML = bill.lines.length === 0
    ? `<tr><td colspan="4" class="muted">Order chưa có món nào</td></tr>`
    : bill.lines.map(lineRow).join("");
  billTotals.innerHTML = totalsHtml(bill.subtotal, bill.discount_amount, bill.total_amount, bill.voucher_code);
  payButton.disabled = bill.lines.length === 0;
}

// ---------- Áp voucher ----------
voucherButton.addEventListener("click", async () => {
  if (!selectedOrder) return;
  const code = voucherInput.value.trim().toUpperCase();
  voucherInput.value = code;
  voucherMsg.className = "muted";
  voucherMsg.textContent = "";
  voucherButton.disabled = true;
  try {
    // Để trống ô voucher rồi bấm Áp dụng = bỏ voucher đang áp
    currentBill = await fetchBill(code || null);
    appliedVoucher = code || null;
    renderBill();
    voucherMsg.textContent = appliedVoucher ? "Đã áp dụng voucher" : "Đã bỏ voucher";
  } catch (error) {
    // Hoá đơn giữ nguyên như trước, chỉ báo lý do: không tồn tại, hết hạn, chưa đủ tối thiểu, hết lượt...
    voucherMsg.className = "text-error";
    voucherMsg.textContent = error.message;
  } finally {
    voucherButton.disabled = false;
  }
});

voucherInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    voucherButton.click();
  }
});

// ---------- Thanh toán ----------
payButton.addEventListener("click", async () => {
  if (!currentBill || paying) return;
  const method = document.querySelector('input[name="method"]:checked').value;
  const message = `Xác nhận thanh toán ${formatMoney(currentBill.total_amount)} bằng ${METHOD_LABEL[method].toLowerCase()}?`;
  if (!confirm(message)) return;

  paying = true;
  payButton.disabled = true;
  try {
    const payment = await api.post("/payments", {
      order_id: currentBill.order_id,
      method,
      voucher_code: appliedVoucher,
    });
    showToast("Thanh toán thành công");
    await showReceipt(payment, currentBill, selectedOrder.table_id);
    loadOrders(); // order vừa thanh toán không còn trong danh sách
  } catch (error) {
    showToast(error.message, "error");
    if (error.status === 409) backToList(); // order đã được thanh toán rồi (hoặc không còn thanh toán được)
  } finally {
    paying = false;
    payButton.disabled = !currentBill || currentBill.lines.length === 0;
  }
});

// ---------- Hoá đơn đã thanh toán + in ----------
async function showReceipt(payment, bill, tableId) {
  const user = Auth.getUser();
  // Tên chi nhánh chỉ để in cho đẹp, không lấy được thì bỏ qua
  const branchName = await api.get(`/branches/${bill.branch_id}`).then((b) => b.name).catch(() => null);

  receipt.innerHTML = `
    <h2>${escapeHtml(CONFIG.APP_NAME)}</h2>
    <div class="center muted">${branchName ? escapeHtml(branchName) + "<br>" : ""}HOÁ ĐƠN THANH TOÁN</div>
    <hr>
    <div>Bàn #${tableId} · Order #${payment.order_id}</div>
    <div>Mã thanh toán: #${payment.id}</div>
    <div>Thời gian: ${formatDateTime(payment.paid_at)}</div>
    <div>Thu ngân: ${escapeHtml(user?.full_name || "")}</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Món</th><th class="text-right">SL</th><th class="text-right">Đơn giá</th><th class="text-right">Thành tiền</th></tr>
        </thead>
        <tbody>${bill.lines.map(lineRow).join("")}</tbody>
      </table>
    </div>
    ${totalsHtml(payment.subtotal, payment.discount_amount, payment.total_amount, bill.voucher_code)}
    <div>Phương thức: ${escapeHtml(METHOD_LABEL[payment.method] || payment.method)}</div>
    <p class="center">Cảm ơn quý khách đã sử dụng dịch vụ!</p>`;
  showPanel("receipt");
}

printButton.addEventListener("click", () => window.print());

function backToList() {
  selectedOrder = null;
  currentBill = null;
  appliedVoucher = null;
  showPanel("empty");
  loadOrders();
}
nextButton.addEventListener("click", backToList);

loadOrders();
