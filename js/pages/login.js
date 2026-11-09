// Trang đăng nhập: POST /auth/login lấy token -> GET /auth/me lấy vai trò -> chuyển đúng màn hình:
//   phục vụ -> sơ đồ bàn | bếp -> màn hình bếp | thu ngân -> thanh toán | quản lý, admin -> trang quản lý
// (bảng vai trò -> trang nằm trong js/auth.js, mục ROLE_HOME)

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorBox = document.getElementById("login-error");
const submitButton = document.getElementById("btn-login");

// Đã đăng nhập rồi mà mở lại trang này thì đưa thẳng về màn hình của mình
if (Auth.isLoggedIn()) Auth.goHome();

// Lý do bị đưa về đây (do Auth.goLogin / Auth.logout gắn vào địa chỉ)
const reason = new URLSearchParams(window.location.search).get("reason");
if (reason === "expired") showError("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
if (reason === "required") showError("Bạn cần đăng nhập để vào trang đó.");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showError("Vui lòng nhập email và mật khẩu.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Đang đăng nhập...";
  try {
    const tokens = await api.post("/auth/login", { email, password });
    Auth.setTokens(tokens); // phải lưu trước để /auth/me có token gửi kèm
    const user = await api.get("/auth/me");
    Auth.saveUser(user);
    Auth.goHome(user);
  } catch (error) {
    Auth.clear(); // lỡ lưu token rồi mà bước sau lỗi thì dọn sạch
    showError(error.message); // vd: "Email hoặc mật khẩu không đúng", "Tài khoản đã bị khoá"
    submitButton.disabled = false;
    submitButton.textContent = "Đăng nhập";
  }
});

document.getElementById("show-password").addEventListener("change", (event) => {
  passwordInput.type = event.target.checked ? "text" : "password";
});

// Bấm tài khoản thử -> điền sẵn email + mật khẩu mẫu
document.querySelectorAll(".demo-list button").forEach((button) => {
  button.addEventListener("click", () => {
    emailInput.value = button.dataset.email;
    passwordInput.value = "Restaurant@123";
  });
});