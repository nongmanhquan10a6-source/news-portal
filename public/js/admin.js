(() => {
  const form = document.getElementById("article-form");
  const message = document.getElementById("form-message");
  const globalMessage = document.getElementById("global-message");
  const articleList = document.getElementById("admin-article-list");
  const pagination = document.getElementById("admin-article-pagination");
  const PAGE_SIZE = 5;
  let currentPage = 1;
  let allArticles = [];
  const submitButton = document.getElementById("article-submit");
  const cancelEditButton = document.getElementById("cancel-edit-btn");
  let originalSlug = null;

  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function dateLabel(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("vi-VN");
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    let result;
    try { result = await response.json(); }
    catch { result = { success: false, message: "Phản hồi máy chủ không hợp lệ." }; }
    if (!response.ok || result.success === false) {
      const error = new Error(result.message || "Thao tác thất bại.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function showGlobal(text, isError = false) {
    globalMessage.textContent = text;
    globalMessage.classList.toggle("error", isError);
  }

  async function checkAdminSession() {
    try {
      await api("/api/auth/me");
      return true;
    } catch {
      window.location.replace("/login.html");
      return false;
    }
  }

  function resetArticleForm() {
    form.reset();
    form.elements.author.value = "Ban biên tập";
    originalSlug = null;
    form.dataset.mode = "create";
    document.getElementById("article-form-heading").textContent = "Đăng bài viết mới";
    submitButton.textContent = "Lưu bài viết";
    cancelEditButton.hidden = true;
    message.textContent = "";
    message.classList.remove("error");
  }

  function beginEdit(article) {
    originalSlug = article.slug;
    form.dataset.mode = "edit";
    for (const field of ["title", "slug", "sourceUrl", "summary", "content", "imageUrl", "category", "author", "status"]) {
      if (form.elements[field]) form.elements[field].value = article[field] || (field === "author" ? "Ban biên tập" : "");
    }
    document.getElementById("article-form-heading").textContent = "Sửa bài viết";
    submitButton.textContent = "Lưu thay đổi";
    cancelEditButton.hidden = false;
    message.textContent = `Đang sửa bài: ${article.title}`;
    message.classList.remove("error");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderPagination() {
    if (!pagination) return;
    const total = allArticles.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, total);

    if (total <= PAGE_SIZE) {
      pagination.innerHTML = total
        ? `<span class="admin-pagination-info">Hiển thị ${start}–${end} trong ${total} bài viết</span>`
        : "";
      return;
    }

    const pageButtons = [];
    pageButtons.push(`<button type="button" class="admin-page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="Trang trước">Trước</button>`);
    for (let page = 1; page <= totalPages; page += 1) {
      pageButtons.push(`<button type="button" class="admin-page-btn ${page === currentPage ? "active" : ""}" data-page="${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`);
    }
    pageButtons.push(`<button type="button" class="admin-page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} aria-label="Trang sau">Sau</button>`);
    pagination.innerHTML = `<span class="admin-pagination-info">Hiển thị ${start}–${end} trong ${total} bài viết</span><div class="admin-pagination-controls">${pageButtons.join("")}</div>`;
  }

  function renderArticles() {
    if (!allArticles.length) {
      articleList.innerHTML = '<tr><td colspan="4">Chưa có bài viết nào.</td></tr>';
      if (pagination) pagination.innerHTML = "";
      articleList._articles = [];
      return;
    }

    const totalPages = Math.max(1, Math.ceil(allArticles.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const visibleArticles = allArticles.slice(startIndex, startIndex + PAGE_SIZE);
    articleList.innerHTML = visibleArticles.map((article) => `
      <tr>
        <td><strong>${escapeHTML(article.title)}</strong><br><small>${escapeHTML(article.slug)}</small></td>
        <td><span class="status-pill ${article.status === "published" ? "" : "banned"}">${article.status === "published" ? "Đã xuất bản" : "Bản nháp"}</span></td>
        <td>${escapeHTML(dateLabel(article.updatedAt || article.createdAt))}</td>
        <td><div class="admin-actions">
          <button type="button" class="admin-action" data-edit-slug="${escapeHTML(article.slug)}">Sửa</button>
          <button type="button" class="admin-action danger" data-delete-article="${escapeHTML(article.slug)}">Xóa</button>
        </div></td>
      </tr>
    `).join("");
    // Keep the complete list here so edit actions work for the currently displayed page.
    articleList._articles = allArticles;
    renderPagination();
  }

  async function loadArticles() {
    articleList.innerHTML = '<tr><td colspan="4">Đang tải bài viết...</td></tr>';
    try {
      const result = await api("/api/admin/articles");
      allArticles = Array.isArray(result.data) ? result.data : [];
      currentPage = Math.min(currentPage, Math.max(1, Math.ceil(allArticles.length / PAGE_SIZE)));
      renderArticles();
    } catch (error) {
      articleList.innerHTML = `<tr><td colspan="4">${escapeHTML(error.message)}</td></tr>`;
      if (pagination) pagination.innerHTML = "";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const editing = form.dataset.mode === "edit" && originalSlug;
    submitButton.disabled = true;
    message.classList.remove("error");
    message.textContent = editing ? "Đang cập nhật bài viết..." : "Đang lưu bài viết...";
    try {
      const url = editing ? `/api/articles/${encodeURIComponent(originalSlug)}` : "/api/articles";
      const result = await api(url, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(data)
      });
      message.textContent = result.message || (editing ? "Đã cập nhật bài viết." : "Đã lưu bài viết.");
      resetArticleForm();
      currentPage = 1;
      await loadArticles();
      showGlobal(result.message || "Đã lưu thay đổi.");
    } catch (error) {
      message.textContent = `Lỗi: ${error.message}`;
      message.classList.add("error");
      if (error.status === 401 || error.status === 403) window.location.replace("/login.html");
    } finally {
      submitButton.disabled = false;
    }
  });

  cancelEditButton.addEventListener("click", resetArticleForm);

  pagination?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    const nextPage = Number(button.dataset.page);
    const totalPages = Math.max(1, Math.ceil(allArticles.length / PAGE_SIZE));
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > totalPages) return;
    currentPage = nextPage;
    renderArticles();
  });

  articleList.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-slug]");
    const deleteButton = event.target.closest("[data-delete-article]");
    if (editButton) {
      const slug = editButton.dataset.editSlug;
      const article = (articleList._articles || []).find((item) => item.slug === slug);
      if (article) beginEdit(article);
    }
    if (deleteButton) {
      const slug = deleteButton.dataset.deleteArticle;
      if (!confirm(`Bạn chắc chắn muốn xóa bài viết “${slug}”? Bình luận liên quan cũng sẽ bị xóa.`)) return;
      deleteButton.disabled = true;
      try {
        const result = await api(`/api/articles/${encodeURIComponent(slug)}`, { method: "DELETE" });
        showGlobal(result.message || "Đã xóa bài viết.");
        if (originalSlug === slug) resetArticleForm();
        await loadArticles();
      } catch (error) {
        showGlobal(error.message, true);
        deleteButton.disabled = false;
      }
    }
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    const button = document.getElementById("logout-btn");
    button.disabled = true;
    try {
      await api("/api/auth/admin/logout", { method: "POST" });
      sessionStorage.setItem("tinMoiActiveRole", "guest");
      window.location.replace("/?as=guest");
    } catch (error) {
      button.disabled = false;
      showGlobal(error.message || "Không thể đăng xuất.", true);
    }
  });

  // BFCache can restore admin.html without re-running this script. Revalidate
  // the session every time the page is shown; if logout happened in another
  // page, replace the stale admin document with the login page.
  let sessionCheckInProgress = false;
  async function revalidateAdminOnPageShow(event) {
    if (!event.persisted) return;
    if (sessionCheckInProgress) return;
    sessionCheckInProgress = true;
    document.documentElement.style.visibility = "hidden";
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (!response.ok) {
        window.location.replace("/login.html");
        return;
      }
      document.documentElement.style.visibility = "";
    } catch {
      // Fail closed: do not reveal a potentially stale admin page if the
      // server cannot confirm the session after a BFCache restore.
      window.location.replace("/login.html");
    } finally {
      sessionCheckInProgress = false;
    }
  }
  window.addEventListener("pageshow", revalidateAdminOnPageShow);

  (async () => {
    document.documentElement.style.visibility = "hidden";
    if (!(await checkAdminSession())) return;
    // Visiting the protected admin page establishes this tab's intended role.
    // This matters when both adminToken and userToken cookies exist in Chrome.
    sessionStorage.setItem("tinMoiActiveRole", "admin");
    document.documentElement.style.visibility = "";
    await loadArticles();

    // If the admin came from an article detail page, load that article into
    // the edit form instead of showing a blank "Đăng bài viết mới" form.
    const requestedEditSlug = new URLSearchParams(window.location.search).get("edit");
    if (requestedEditSlug) {
      const article = (articleList._articles || []).find((item) => item.slug === requestedEditSlug);
      if (article) {
        beginEdit(article);
      } else {
        showGlobal("Không tìm thấy bài viết cần chỉnh sửa. Vui lòng tải lại danh sách bài viết.", true);
      }
    }
  })();
})();
