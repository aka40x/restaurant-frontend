// Đổi mật khẩu: POST /auth/change-password {current_password, new_password}
// Thành công -> đăng xuất, bắt đăng nhập lại bằng mật khẩu mới.
const passwordForm = document.getElementById("password-form");
const passwordSubmit = document.getElementById("btn-submit");

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = document.getElementById("current_password").value;
  const next = document.getElementById("new_password").value;
  const confirmation = document.getElementById("confirm_password").value;

  if (next.length < 8) return showToast("Mật khẩu mới tối thiểu 8 ký tự", "error");
  if (next !== confirmation) return showToast("Mật khẩu nhập lại không khớp", "error");
  if (next === current) return showToast("Mật khẩu mới phải khác mật khẩu hiện tại", "error");

  passwordSubmit.disabled = true;
  try {
    await api.post("/auth/change-password", { current_password: current, new_password: next });
    showToast("Đổi mật khẩu thành công");
    setTimeout(() => Auth.logout("password-changed"), 800);
  } catch (error) {
    showToast(error.message, "error");
    passwordSubmit.disabled = false;
  }
});