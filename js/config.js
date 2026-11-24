// Cấu hình chung của frontend.
// Đổi API_BASE_URL nếu backend chạy ở địa chỉ/cổng khác (hoặc khi deploy).
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const CONFIG = {
  API_BASE_URL: IS_LOCAL ? "http://127.0.0.1:8000/api" : "https://restaurant-api-p83u.onrender.com/api",
  APP_NAME: "Quản lý nhà hàng",
};
