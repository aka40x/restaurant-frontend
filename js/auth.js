// Quản lý phiên đăng nhập: lưu token, biết user là ai, chuyển trang theo vai trò.
// Nạp file này TRƯỚC js/api.js (api.js dùng Auth để gắn token vào request).
//
// Cách dùng:
//   Auth.getUser()                       -> { full_name, role: { name }, ... } hoặc null nếu chưa đăng nhập
//   Auth.requireRole(["waiter"])         -> đặt cuối trang nội bộ: chưa đăng nhập thì đá về trang login,
//                                           sai vai trò thì đá về màn hình đúng của vai trò đó (admin luôn được vào)
//   Auth.logout()                        -> xoá phiên, về trang đăng nhập

const Auth = (() => {
  const KEY = { access: "access_token", refresh: "refresh_token", user: "user" };

  // Mỗi vai trò có 1 màn hình chính (đường dẫn tính từ thư mục frontend/)
  const ROLE_HOME = {
    admin: "pages/admin/index.html",
    manager: "pages/admin/index.html",
    waiter: "pages/staff/tables.html",
    kitchen: "pages/staff/kitchen.html",
    cashier: "pages/staff/payment.html",
  };
  const ROLE_LABEL = {
    admin: "Quản trị",
    manager: "Quản lý",
    waiter: "Phục vụ",
    kitchen: "Bếp",
    cashier: "Thu ngân",
  };

  const root = () => document.body.dataset.root || "./";
  const get = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { localStorage.setItem(key, value); } catch { /* bỏ qua */ } };
  const del = (key) => { try { localStorage.removeItem(key); } catch { /* bỏ qua */ } };

  function getUser() {
    try { return JSON.parse(get(KEY.user)); } catch { return null; }
  }
  const roleOf = (user) => user?.role?.name;

  function homeFor(user) {
    return ROLE_HOME[roleOf(user)] || "index.html";
  }

  return {
    roleLabel: (user) => ROLE_LABEL[roleOf(user)] || "",
    homePath: (user = getUser()) => homeFor(user), // đường dẫn màn hình chính của user (tính từ frontend/)
    getAccessToken: () => get(KEY.access),
    getRefreshToken: () => get(KEY.refresh),
    setAccessToken: (token) => set(KEY.access, token),
    // Lưu token ngay sau khi đăng nhập (trước khi gọi /auth/me)
    setTokens: (tokens) => { set(KEY.access, tokens.access_token); set(KEY.refresh, tokens.refresh_token); },
    saveUser: (user) => set(KEY.user, JSON.stringify(user)),
    getUser,
    isLoggedIn: () => !!get(KEY.access) && !!getUser(),
    clear: () => { del(KEY.access); del(KEY.refresh); del(KEY.user); },

    goHome: (user = getUser()) => { window.location.replace(root() + homeFor(user)); },
    goLogin: (reason) => {
      const query = reason ? `?reason=${reason}` : "";
      window.location.replace(`${root()}pages/login.html${query}`);
    },
    async logout(reason) {
      const access = get(KEY.access), refresh = get(KEY.refresh);
      // Hết hạn thì token đã vô hiệu rồi, không cần gọi server (tránh lặp với api.js)
      if (refresh && reason !== "expired") {
        try {
          await fetch(`${CONFIG.API_BASE_URL}/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
            body: JSON.stringify({ refresh_token: refresh }),
          });
        } catch { /* lỗi mạng vẫn đăng xuất ở client */ }
      }
      this.clear();
      this.goLogin(reason);
    },

    // Gọi ở cuối mỗi trang nội bộ. admin luôn được vào mọi trang.
    requireRole(allowedRoles) {
      const user = getUser();
      if (!this.isLoggedIn()) return this.goLogin("required");
      const role = roleOf(user);
      if (role !== "admin" && !allowedRoles.includes(role)) this.goHome(user);
    },
  };
})();