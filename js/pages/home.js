// Trang chủ: gọi GET /api/health (qua fetch trong js/api.js) để kiểm tra FE -> BE -> MySQL đã thông chưa.

async function checkHealth() {
  const box = document.getElementById("health-status");
  box.className = "status status-loading";
  box.textContent = "Đang kiểm tra kết nối...";

  try {
    const result = await api.get("/health");
    box.className = "status status-ok";
    box.textContent = `✅ Backend OK · MySQL: ${result.database}`;
  } catch (error) {
    box.className = "status status-error";
    // 503 = backend chạy nhưng không nối được MySQL; 0 = không gọi được backend
    box.textContent = `❌ ${error.status === 503 ? "Backend chạy nhưng MySQL lỗi: " + error.data.detail : error.message}`;
  }
}

document.getElementById("api-url").textContent = CONFIG.API_BASE_URL;
document.getElementById("btn-recheck").addEventListener("click", checkHealth);
checkHealth();

// Scroll animation cho các thẻ trải nghiệm & CTA
const observerOptions = {
  root: null,
  rootMargin: "0px",
  threshold: 0.15,
};

const observer = new IntersectionObserver((entries, obs) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      obs.unobserve(entry.target);
    }
  });
}, observerOptions);

document.querySelectorAll(".experience-card, .home-cta, .home-intro").forEach((el) => {
  el.classList.add("animate-on-scroll");
  observer.observe(el);
});
