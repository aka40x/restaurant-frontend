// Kết nối WebSocket tới backend để nhận thông báo realtime, tự kết nối lại khi mất mạng.
// Nạp file này SAU config.js (và auth.js nếu có), TRƯỚC script riêng của trang.
//
// Cách dùng:
//   Realtime.connect({
//     onEvent(msg)        { ... },   // msg = { type: "order.sent" | "item.status", ... } (xem backend/app/core/realtime.py)
//     onOpen(isReconnect) { ... },   // mỗi lần kết nối xong. isReconnect = true: vừa nối lại -> nên tải lại dữ liệu
//                                    // (trong lúc mất kết nối có thể đã lỡ sự kiện)
//     onStatus(name, info){ ... },   // "connecting" | "open" | "reconnecting" (info.attempt, info.delay) | "auth_failed" | "closed"
//     onAuthFail()        { ... },   // token hết hạn mà không làm mới được -> đưa người dùng về trang đăng nhập
//     getToken: () => "...",         // không bắt buộc: mặc định lấy token từ Auth (js/auth.js) hoặc localStorage "token"
//   });
//   Realtime.isOpen();   // đang nối và đã được server xác nhận?
//   Realtime.close();    // đăng xuất hoặc rời trang thì gọi
//
// Cách xử lý mất kết nối:
//   - Mỗi 25 giây gửi "ping"; 10 giây không thấy gì từ server thì coi như đứt (bắt cả kiểu "đứt ngầm" khi mất wifi).
//   - Đứt là tự nối lại: chờ 1s, 2s, 4s, 8s, 15s rồi 30s mỗi lần (có lệch ngẫu nhiên để các máy không dồn vào cùng lúc).
//   - Có mạng lại (sự kiện "online") hoặc quay lại tab thì nối ngay, không chờ hết thời gian.
//   - Server đóng với mã 4401 (token hết hạn): thử làm mới token 1 lần rồi nối lại; không được thì gọi onAuthFail.

const Realtime = (() => {
  const PING_MS = 25000;
  const PONG_WAIT_MS = 10000;
  const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
  const CLOSE_UNAUTHORIZED = 4401;

  let opts = null;
  let socket = null;
  let ready = false; // server đã gửi "hello" = đã xác thực xong
  let wantOpen = false; // người dùng muốn giữ kết nối (chưa gọi close)
  let attempt = 0;
  let everReady = false;
  let refreshTried = false;
  let retryTimer = null;
  let pingTimer = null;
  let pongTimer = null;

  function defaultToken() {
    try {
      return (typeof Auth !== "undefined" && Auth.getAccessToken && Auth.getAccessToken()) || localStorage.getItem("token");
    } catch (error) {
      return null;
    }
  }

  // http://127.0.0.1:8000/api -> ws://127.0.0.1:8000/api/ws?token=...   (https -> wss)
  function wsUrl(token) {
    const base = CONFIG.API_BASE_URL.replace(/\/+$/, "").replace(/^http/, "ws");
    return `${base}/ws?token=${encodeURIComponent(token)}`;
  }

  function notify(name, info) {
    if (opts && opts.onStatus) opts.onStatus(name, info || {});
  }

  // ---- Nhịp tim: phát hiện kết nối đứt ngầm ----
  function stopHeartbeat() {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pingTimer = pongTimer = null;
  }

  function startHeartbeat(sock) {
    stopHeartbeat();
    pingTimer = setInterval(() => {
      if (sock !== socket || sock.readyState !== WebSocket.OPEN) return;
      try {
        sock.send("ping");
      } catch (error) {
        return; // onclose sẽ xử lý
      }
      clearTimeout(pongTimer);
      pongTimer = setTimeout(() => drop(sock), PONG_WAIT_MS);
    }, PING_MS);
  }

  // Bỏ socket hiện tại (đứt hoặc không còn tin được) rồi nối lại
  function drop(sock) {
    if (sock !== socket) return;
    detach(sock);
    socket = null;
    ready = false;
    stopHeartbeat();
    scheduleRetry();
  }

  function detach(sock) {
    sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
    try {
      sock.close();
    } catch (error) {
      // đã đóng rồi
    }
  }

  // ---- Nối lại ----
  function scheduleRetry() {
    if (!wantOpen || retryTimer) return;
    const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    const delay = Math.round(base * (0.75 + Math.random() * 0.5)); // lệch ±25%
    attempt++;
    notify("reconnecting", { attempt, delay });
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, delay);
  }

  function retryNow() {
    if (!wantOpen || isOpen()) return;
    clearTimeout(retryTimer);
    retryTimer = null;
    attempt = 0;
    if (socket && socket.readyState === WebSocket.CONNECTING) return; // đang nối rồi
    if (socket) {
      detach(socket);
      socket = null;
      ready = false;
    }
    open();
  }

  async function handleUnauthorized() {
    if (!refreshTried && typeof refreshAccessToken === "function" && typeof Auth !== "undefined" && Auth.getRefreshToken()) {
      refreshTried = true;
      try {
        await refreshAccessToken(); // js/api.js: xin access token mới bằng refresh token
        if (wantOpen) open();
        return;
      } catch (error) {
        // refresh token cũng hết hạn: rơi xuống báo lỗi
      }
    }
    notify("auth_failed");
    if (opts && opts.onAuthFail) opts.onAuthFail();
  }

  function open() {
    if (!wantOpen || (socket && socket.readyState <= WebSocket.OPEN)) return;
    const token = opts.getToken();
    if (!token) {
      notify("auth_failed");
      if (opts.onAuthFail) opts.onAuthFail();
      return;
    }
    if (attempt === 0 && !everReady) notify("connecting");

    let sock;
    try {
      sock = new WebSocket(wsUrl(token));
    } catch (error) {
      scheduleRetry();
      return;
    }
    socket = sock;

    sock.onopen = () => {
      if (sock === socket) startHeartbeat(sock);
    };
    sock.onmessage = (event) => {
      if (sock !== socket) return;
      clearTimeout(pongTimer); // nghe được gì từ server cũng là còn sống
      pongTimer = null;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      if (message.type === "pong") return;
      if (message.type === "hello") {
        // Server xác nhận token ổn: lúc này mới tính là "đã kết nối"
        const wasReconnect = everReady;
        ready = true;
        everReady = true;
        attempt = 0;
        refreshTried = false;
        notify("open");
        if (opts.onOpen) opts.onOpen(wasReconnect);
        return;
      }
      if (opts.onEvent) opts.onEvent(message);
    };
    sock.onclose = (event) => {
      if (sock !== socket) return;
      socket = null;
      ready = false;
      stopHeartbeat();
      if (!wantOpen) return;
      if (event.code === CLOSE_UNAUTHORIZED) handleUnauthorized();
      else scheduleRetry();
    };
    sock.onerror = () => {
      // Lỗi nào cũng kèm sự kiện close ngay sau đó, xử lý nối lại ở onclose
    };
  }

  function isOpen() {
    return ready && !!socket && socket.readyState === WebSocket.OPEN;
  }

  function connect(options) {
    close();
    opts = { getToken: defaultToken, ...options };
    wantOpen = true;
    attempt = 0;
    everReady = false;
    refreshTried = false;
    open();
  }

  function close() {
    wantOpen = false;
    clearTimeout(retryTimer);
    retryTimer = null;
    stopHeartbeat();
    if (socket) {
      detach(socket);
      socket = null;
    }
    const wasConnected = ready;
    ready = false;
    if (opts && wasConnected) notify("closed");
  }

  // Có mạng lại hoặc quay lại tab: thử nối ngay
  window.addEventListener("online", retryNow);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) retryNow();
  });

  return { connect, close, isOpen };
})();