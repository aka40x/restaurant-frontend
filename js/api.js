// Module gọi API bằng fetch: cấu hình 1 lần, mọi trang dùng chung.
//
// Cách dùng (trong các file js/pages/*.js):
//   const items = await api.get("/items");
//   const items = await api.get("/items", { q: "com" });
//   const created = await api.post("/items", { name: "Trà đá", price: 5000 });
//   await api.put("/items/1", { name: "Tên mới" });
//   await api.delete("/items/1");
//
// Nếu lỗi, hàm sẽ throw ApiError -> bắt bằng try/catch và hiện error.message cho người dùng.
//
// Đăng nhập: mọi request tự gắn "Authorization: Bearer <access token>".
// Access token hết hạn (401) -> tự dùng refresh token xin token mới rồi gọi lại request đó.
// Refresh token cũng hết hạn -> xoá phiên và chuyển về trang đăng nhập.

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function getErrorMessage(data, status) {
  if (data && typeof data.detail === "string") return data.detail;
  if (data && Array.isArray(data.detail)) {
    return data.detail.map((error) => {
      const field = error.loc?.[error.loc.length - 1] ?? "dữ liệu";
      return `${field}: ${error.msg}`;
    }).join("; ");
  }
  return `Lỗi ${status}`;
}

async function readResponseData(response) {
  const responseText = await response.text();
  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

let refreshing = null;
function refreshAccessToken() {
  if (!refreshing) {
    refreshing = (async () => {
      const baseUrl = CONFIG.API_BASE_URL.replace(/\/+$/, "");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let response;
      try {
        response = await fetch(`${baseUrl}/auth/refresh`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: Auth.getRefreshToken() }),
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await readResponseData(response);
      if (!response.ok) {
        throw new ApiError(getErrorMessage(data, response.status), response.status, data);
      }
      if (!data || typeof data.access_token !== "string") {
        throw new ApiError("Backend không trả về access token hợp lệ", response.status, data);
      }
      Auth.setAccessToken(data.access_token);
      return data.access_token;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function request(method, path, body, params, retried = false) {
  const baseUrl = CONFIG.API_BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/${path.replace(/^\/+/, "")}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    });
  }

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const accessToken = Auth.getAccessToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Không kết nối được backend. Backend đã chạy chưa? Kiểm tra CONFIG.API_BASE_URL.", 0,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (
    response.status === 401 &&
    !retried &&
    !["/auth/login", "/auth/refresh"].includes(`/${path.replace(/^\/+/, "")}`) &&
    Auth.getRefreshToken()
  ) {
    try {
      await refreshAccessToken();
    } catch {
      Auth.logout("expired");
      throw new ApiError("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại", 401);
    }
    return request(method, path, body, params, true);
  }

  const data = await readResponseData(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, response.status), response.status, data);
  }
  return data;
}

const api = {
  get: (path, params) => request("GET", path, undefined, params),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  delete: (path) => request("DELETE", path),
};
