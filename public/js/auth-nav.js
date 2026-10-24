(() => {
  const nav = document.querySelector(".site-header nav");
  if (!nav) return;

  const ROLE_KEY = "tinMoiActiveRole";
  const pageUrl = new URL(window.location.href);
  const requestedRole = pageUrl.searchParams.get("as");
  if (["admin", "user", "guest"].includes(requestedRole)) {
    sessionStorage.setItem(ROLE_KEY, requestedRole);
  }
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function roleHref(path, role) {
    if (!["admin", "user", "guest"].includes(role)) return path;
    if (path === "/#latest") return `/?as=${encodeURIComponent(role)}#latest`;
    if (path === "/") return `/?as=${encodeURIComponent(role)}`;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}as=${encodeURIComponent(role)}`;
  }

  function getPreferredRole(session) {
    const tabRole = sessionStorage.getItem(ROLE_KEY);
    // Strictly honor the role chosen in this tab. Do not silently switch to
    // the other cookie-backed identity when the selected identity is missing.
    if (tabRole === "guest") return null;
    if (tabRole === "admin") return session.admin ? "admin" : null;
    if (tabRole === "user") return session.user ? "user" : null;
    if (session.admin) {
      sessionStorage.setItem(ROLE_KEY, "admin");
      return "admin";
    }
    if (session.user) {
      sessionStorage.setItem(ROLE_KEY, "user");
      return "user";
    }
    sessionStorage.setItem(ROLE_KEY, "guest");
    return null;
  }

  function attachLogoutHandlers() {
    nav.querySelectorAll("[data-logout-role]").forEach((button) => {
      button.addEventListener("click", async () => {
        const role = button.dataset.logoutRole;
        const endpoint = role === "admin" ? "/api/auth/admin/logout" : "/api/auth/user/logout";
        button.disabled = true;
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role })
          });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || "Không thể đăng xuất.");
          // Keep this tab in guest mode after logout, even if the other role's
          // cookie remains valid in the shared browser cookie jar.
          sessionStorage.setItem(ROLE_KEY, "guest");
          // Force a fresh navigation and retain guest state despite other-tab cookies.
          window.location.replace("/?as=guest");
        } catch (error) {
          button.disabled = false;
          alert(error.message || "Không thể kết nối máy chủ để đăng xuất.");
        }
      });
    });
  }

  async function updateNavigation() {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (!response.ok) return;
      const session = await response.json();
      const role = getPreferredRole(session);
      const baseLinks = `
        <a href="${roleHref("/", role || "guest")}">Trang chủ</a>
        <a href="${roleHref("/#latest", role || "guest")}">Tin mới</a>
      `;
      const links = [baseLinks];

      if (role === "admin") {
        links.push(`
          <a href="${roleHref("/admin.html", "admin")}">Quản trị bài viết</a>
          <a href="${roleHref("/admin-users.html", "admin")}">Quản lý tài khoản</a>
          <span class="nav-account-label">Admin: ${escapeHTML(session.admin.username)}</span>
          <button class="nav-auth-button" type="button" data-logout-role="admin">Đăng xuất admin</button>
        `);
      } else if (role === "user") {
        links.push(`
          <span class="nav-account-label">Xin chào, ${escapeHTML(session.user.username)}</span>
          <button class="nav-auth-button" type="button" data-logout-role="user">Đăng xuất</button>
        `);
      } else {
        links.push(`
          <a href="/user-login.html">Đăng nhập</a>
          <a href="/register.html">Đăng ký</a>
          <a href="/login.html">Quản trị</a>
        `);
      }

      nav.innerHTML = links.join("");
      nav.classList.add("auth-aware-nav");
      attachLogoutHandlers();
    } catch (error) {
      console.warn("Không kiểm tra được trạng thái đăng nhập:", error.message);
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    .auth-aware-nav { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:16px; }
    .auth-aware-nav .nav-account-label { color:#53635b; font-size:14px; }
    .auth-aware-nav .nav-auth-button { border:1px solid #0b7657; border-radius:8px; padding:8px 12px; background:#fff; color:#0b7657; font:inherit; cursor:pointer; }
    .auth-aware-nav .nav-auth-button:hover { background:#edf7f2; }
    .auth-aware-nav .nav-auth-button:disabled { opacity:.6; cursor:wait; }
    @media (max-width:700px) { .auth-aware-nav { gap:10px; } .auth-aware-nav .nav-account-label { width:100%; text-align:right; } }
  `;
  document.head.appendChild(style);
  updateNavigation();
})();
