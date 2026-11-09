// Module gọi API bằng axios: cấu hình 1 lần, mọi trang dùng chung.
// (axios được nạp từ CDN bằng thẻ <script> trong từng trang HTML, trước file này; js/auth.js cũng phải nạp trước)
//
// Cách dùng (trong các file js/pages/*.js):
//   const items = await api.get("/items");
//   const items = await api.get("/items", { q: "com" });          // -> /items?q=com
//   const created = await api.post("/items", { name: "Trà đá", price: 5000 });
//   await api.put("/items/1", { name: "Tên mới" });
//   await api.delete("/items/1");
//
// Các hàm trả về thẳng dữ liệu JSON (đã lấy sẵn response.data).
// Nếu lỗi, hàm sẽ throw ApiError -> bắt bằng try/catch và hiện error.message cho người dùng.
//
// Đăng nhập: mọi request tự gắn "Authorization: Bearer <access token>".
// Access token hết hạn (401) -> tự dùng refresh token xin token mới rồi gọi lại request đó.
// Refresh token cũng hết hạn -> xoá phiên và chuyển về trang đăng nhập.

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status; // mã HTTP: 404, 422, 500... (0 = không gọi được server)
    this.data = data; // nội dung lỗi gốc server trả về
  }
}

// Instance axios dùng chung: mọi request tự nối thêm baseURL phía trước
const http = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  timeout: 10000, // quá 10 giây không phản hồi thì báo lỗi
  headers: { "Content-Type": "application/json" },
});

// Gắn token đăng nhập vào mọi request (nếu đã đăng nhập)
http.interceptors.request.use((config) => {
  const token = Auth.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Lấy câu thông báo lỗi dễ đọc từ response của FastAPI
function getErrorMessage(data, status) {
  if (data && typeof data.detail === "string") return data.detail;
  // Lỗi 422 (dữ liệu không hợp lệ): detail là mảng [{ loc: [...], msg: "..." }]
  if (data && Array.isArray(data.detail)) {
    return data.detail.map((e) => `${e.loc[e.loc.length - 1]}: ${e.msg}`).join("; ");
  }
  return `Lỗi ${status}`;
}

// Xin access token mới bằng refresh token. Nhiều request cùng hết hạn một lúc thì chỉ xin 1 lần.
let refreshing = null;
function refreshAccessToken() {
  if (!refreshing) {
    refreshing = axios
      .post(`${CONFIG.API_BASE_URL}/auth/refresh`, { refresh_token: Auth.getRefreshToken() })
      .then((res) => {
        Auth.setAccessToken(res.data.access_token);
        return res.data.access_token;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// Gom xử lý lỗi một chỗ: đổi lỗi của axios thành ApiError dễ dùng
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    // Đăng nhập sai mật khẩu cũng là 401, và lỗi của chính /auth/refresh thì không được refresh tiếp
    const isAuthCall = ["/auth/login", "/auth/refresh"].includes(original?.url);

    // Access token hết hạn: thử làm mới 1 lần rồi gọi lại request cũ
    if (status === 401 && original && !original._retry && !isAuthCall && Auth.getRefreshToken()) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return http(original);
      } catch {
        Auth.logout("expired");
        return Promise.reject(new ApiError("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại", 401));
      }
    }

    if (error.response) {
      // Server có trả lời nhưng là lỗi (4xx, 5xx)
      const { data } = error.response;
      return Promise.reject(new ApiError(getErrorMessage(data, status), status, data));
    }
    // Không có response: server tắt, sai URL, bị chặn CORS, hoặc quá thời gian chờ
    return Promise.reject(new ApiError(
      "Không kết nối được backend. Backend đã chạy chưa? Kiểm tra CONFIG.API_BASE_URL.", 0,
    ));
  },
);

const api = {
  get: (path, params) => http.get(path, { params }).then((res) => res.data),
  post: (path, body) => http.post(path, body).then((res) => res.data),
  put: (path, body) => http.put(path, body).then((res) => res.data),
  delete: (path) => http.delete(path).then((res) => res.data),
};