const form = document.getElementById("reservation-form");
const branchSelect = document.getElementById("branch");
const dateInput = document.getElementById("date");
const slotBox = document.getElementById("time-slots");
const partyInput = document.getElementById("party_size");
const partyChips = document.getElementById("party-chips");
const nameInput = document.getElementById("guest_name");
const phoneInput = document.getElementById("guest_phone");
const emailInput = document.getElementById("guest_email");
const noteInput = document.getElementById("note");
const submitButton = document.getElementById("btn-submit");

const PHONE_RE = /^0\d{9,10}$/;
const MIN_ADVANCE_MINUTES = 30;
const MAX_ADVANCE_DAYS = 60;
const SLOT_STEP_MINUTES = 30;
const LUNCH_START = 11 * 60 + 30;
const LUNCH_END = 14 * 60;
const DINNER_START = 17 * 60 + 30;
const DINNER_END = 20 * 60;
const pad = (value) => String(value).padStart(2, "0");
const toDateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

let branches = [];
let selectedTime = null;

const getBranch = () => branches.find((branch) => String(branch.id) === branchSelect.value);
const getPreferredArea = () => form.querySelector('input[name="preferred_area"]:checked')?.value || "Khu Vực Chung";

async function loadBranches() {
  branchSelect.innerHTML = `<option value="">Đang tải chi nhánh...</option>`;
  try {
    branches = (await api.get("/branches", { only_active: true })).filter((branch) => branch.is_active);
    branchSelect.innerHTML = `<option value="">-- Chọn chi nhánh --</option>` + branches
      .map((branch) =>
        `<option value="${branch.id}">${escapeHtml(branch.name)} - ${escapeHtml(branch.address)}</option>`,
      ).join("");
    if (branches.length === 0) {
      branchSelect.innerHTML = `<option value="">Hiện chưa có chi nhánh hoạt động</option>`;
    }
  } catch (error) {
    branchSelect.innerHTML = `<option value="">Không tải được chi nhánh</option>`;
    showToast(error.message, "error");
  }
  renderSlots();
  updateSummary();
}

function renderSlots() {
  const branch = getBranch();
  const date = dateInput.value;
  slotBox.innerHTML = "";
  if (!branch || !date) {
    slotBox.innerHTML = `<span class="time-group-label">TRƯA / TỐI</span><span class="field-hint">Chọn chi nhánh và ngày để xem giờ còn chỗ.</span>`;
    return;
  }

  const [openHour, openMinute] = branch.open_time.split(":").map(Number);
  const [closeHour, closeMinute] = branch.close_time.split(":").map(Number);
  const openAt = openHour * 60 + openMinute;
  const closeAt = closeHour * 60 + closeMinute;
  const earliest = new Date(Date.now() + MIN_ADVANCE_MINUTES * 60_000);
  const groups = [
    { label: "TRƯA", start: LUNCH_START, end: LUNCH_END },
    { label: "TỐI", start: DINNER_START, end: DINNER_END },
  ];

  for (const group of groups) {
    const label = document.createElement("span");
    label.className = "time-group-label";
    label.textContent = group.label;
    slotBox.appendChild(label);

    const buttons = document.createElement("div");
    buttons.className = "chip-group";
    for (let minute = group.start; minute <= group.end; minute += SLOT_STEP_MINUTES) {
      if (minute < openAt || minute > closeAt) continue;
      const time = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip${time === selectedTime ? " selected" : ""}`;
      button.textContent = time;
      button.dataset.time = time;
      button.disabled = new Date(`${date}T${time}:00`) < earliest;
      buttons.appendChild(button);
    }
    if (!buttons.children.length) {
      const empty = document.createElement("span");
      empty.className = "field-hint";
      empty.textContent = "Không có giờ phù hợp";
      buttons.appendChild(empty);
    }
    slotBox.appendChild(buttons);
  }

  if (selectedTime && !slotBox.querySelector(".chip.selected:not(:disabled)")) {
    selectedTime = null;
  }
}

function setError(id, message, input) {
  document.getElementById(id).textContent = message || "";
  if (input) input.classList.toggle("invalid", Boolean(message));
}

function updateSummary() {
  const branch = getBranch();
  const date = dateInput.value;
  document.getElementById("sum-branch").textContent = branch?.name || "Chọn chi nhánh";
  document.getElementById("sum-time").textContent =
    date && selectedTime ? `${selectedTime}, ${date.split("-").reverse().join("/")}` : "Chọn ngày và giờ";
  document.getElementById("sum-party").textContent = `${partyInput.value || 0} Khách`;
  document.getElementById("party-total").textContent = partyInput.value || "0";
  document.getElementById("sum-area").textContent = getPreferredArea();
  document.getElementById("sum-name").textContent = nameInput.value.trim() || "-";
}

function validate() {
  let valid = true;
  const fail = (id, message, input) => {
    setError(id, message, input);
    valid = false;
  };
  for (const [id, input] of [
    ["err-branch", branchSelect],
    ["err-date", dateInput],
    ["err-party", partyInput],
    ["err-name", nameInput],
    ["err-phone", phoneInput],
    ["err-email", emailInput],
    ["err-note", noteInput],
  ]) setError(id, "", input);
  setError("err-time", "");

  if (!getBranch()) fail("err-branch", "Vui lòng chọn chi nhánh.", branchSelect);
  if (!dateInput.value) fail("err-date", "Vui lòng chọn ngày dùng bữa.", dateInput);
  if (!selectedTime) fail("err-time", "Vui lòng chọn khung giờ đón tiếp.");

  const size = Number(partyInput.value);
  if (!Number.isInteger(size) || size < 1 || size > 50) {
    fail("err-party", "Số khách từ 1 đến 50 người.", partyInput);
  }
  if (!nameInput.value.trim()) fail("err-name", "Vui lòng nhập họ tên.", nameInput);
  if (!PHONE_RE.test(phoneInput.value.replace(/[\s.-]/g, ""))) {
    fail("err-phone", "Số điện thoại bắt đầu bằng 0, gồm 10-11 số.", phoneInput);
  }
  if (!emailInput.validity.valid || !emailInput.value.trim()) {
    fail("err-email", "Vui lòng nhập địa chỉ email hợp lệ.", emailInput);
  }

  const combinedNote = `Email: ${emailInput.value.trim()}; Khu vực: ${getPreferredArea()}`
    + (noteInput.value.trim() ? `; Ghi chú: ${noteInput.value.trim()}` : "");
  if (combinedNote.length > 255) {
    fail("err-note", "Email và ghi chú vượt quá giới hạn lưu trữ. Vui lòng rút ngắn ghi chú.", noteInput);
  }
  return valid;
}

slotBox.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-time]");
  if (!button || button.disabled) return;
  selectedTime = button.dataset.time;
  setError("err-time", "");
  renderSlots();
  updateSummary();
});

partyChips.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-size]");
  if (!button) return;
  partyInput.value = button.dataset.size === "8" ? "8" : button.dataset.size;
  syncPartyChips();
  updateSummary();
});

function syncPartyChips() {
  partyChips.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("selected", chip.dataset.size === partyInput.value);
  });
}

form.querySelectorAll('input[name="preferred_area"]').forEach((input) => {
  input.addEventListener("change", () => {
    form.querySelectorAll(".preference-card").forEach((card) => {
      card.classList.toggle("selected", card.contains(input));
      card.querySelector(".preference-check").textContent = card.contains(input) ? "●" : "○";
    });
    updateSummary();
  });
});

branchSelect.addEventListener("change", () => {
  selectedTime = null;
  renderSlots();
  updateSummary();
});
dateInput.addEventListener("change", () => {
  selectedTime = null;
  renderSlots();
  updateSummary();
});
partyInput.addEventListener("input", () => {
  syncPartyChips();
  updateSummary();
});
[nameInput, phoneInput, emailInput, noteInput].forEach((input) => {
  input.addEventListener("input", updateSummary);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validate()) return;

  submitButton.disabled = true;
  submitButton.textContent = "Đang xác nhận...";
  try {
    const note = `Email: ${emailInput.value.trim()}; Khu vực: ${getPreferredArea()}`
      + (noteInput.value.trim() ? `; Ghi chú: ${noteInput.value.trim()}` : "");
    const result = await api.post("/reservations", {
      branch_id: Number(branchSelect.value),
      guest_name: nameInput.value.trim(),
      guest_phone: phoneInput.value.replace(/[\s.-]/g, ""),
      party_size: Number(partyInput.value),
      reserved_at: `${dateInput.value}T${selectedTime}:00`,
      note,
    });

    let saved = true;
    try {
      sessionStorage.setItem("lastReservation", JSON.stringify(result));
    } catch (error) {
      saved = false;
    }
    const successPage = saved ? "reservation-success.html" : "reservation-lookup.html";
    window.location.href = `${successPage}?code=${encodeURIComponent(result.code)}`;
  } catch (error) {
    showToast(error.message, "error");
    submitButton.disabled = false;
    submitButton.innerHTML = "♜ &nbsp;Xác Nhận Đặt Bàn Ngay";
  }
});

[
  ["err-branch", branchSelect], ["err-date", dateInput], ["err-party", partyInput],
  ["err-name", nameInput], ["err-phone", phoneInput], ["err-email", emailInput], ["err-note", noteInput],
].forEach(([id, input]) => {
  input.addEventListener("input", () => setError(id, "", input));
  input.addEventListener("change", () => setError(id, "", input));
});
const today = new Date();
dateInput.min = toDateInput(today);
dateInput.max = toDateInput(new Date(today.getTime() + MAX_ADVANCE_DAYS * 86_400_000));
dateInput.value = toDateInput(today);
partyInput.value = "2";
syncPartyChips();
loadBranches();
