const detailContainer = document.getElementById("article-detail");
let activeArticleSlug = "";
let currentSession = { admin: null, user: null };
let commentsCache = [];

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatDate(value, withTime = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("vi-VN", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "long" });
}

function renderArticle(article) {
  const title = escapeHTML(article.title || "Chưa có tiêu đề");
  const activeRole = sessionStorage.getItem("tinMoiActiveRole") || "guest";
  const roleQuery = `as=${encodeURIComponent(activeRole)}`;
  document.title = `${article.title || "Bài viết"} - Tin Mới`;

  detailContainer.innerHTML = `
    <a class="back-link" href="/?${roleQuery}#latest">← Quay lại tin mới</a>
    <div class="article-category">${escapeHTML(article.category || "Tin tức")}</div>
    <h1>${title}</h1>
    ${currentSession.admin ? `<div class="admin-article-tools"><a class="admin-article-link" href="/admin.html?as=admin&edit=${encodeURIComponent(article.slug || activeArticleSlug)}">Sửa bài viết</a><button type="button" class="admin-article-delete" id="admin-delete-article">Xóa bài viết</button></div>` : ""}
    <div class="detail-meta">${escapeHTML(article.author || "Ban biên tập")}${article.publishedAt ? ` · ${escapeHTML(formatDate(article.publishedAt))}` : ""}</div>
    ${article.imageUrl ? `<img class="detail-image" src="${escapeHTML(article.imageUrl)}" alt="${title}">` : ""}
    ${article.summary ? `<div class="detail-summary">${escapeHTML(article.summary)}</div>` : ""}
    ${(() => {
      const url = article.sourceUrl || "";
      let videoId = "";
      try {
        const parsed = new URL(url);
        if (["www.youtube.com", "youtube.com", "m.youtube.com"].includes(parsed.hostname)) videoId = parsed.searchParams.get("v") || "";
        else if (parsed.hostname === "youtu.be") videoId = parsed.pathname.slice(1).split("/")[0];
      } catch {}
      if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return `<div class="article-video"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="Video minh họa bài viết" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
      }
      if (url) return `<p><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Xem nguồn bài viết →</a></p>`;
      return "";
    })()}
    <div class="detail-content">${escapeHTML(article.content || "").split(/\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p>${paragraph}</p>`).join("")}</div>
    <section id="comments-section" class="comments-section" aria-labelledby="comments-heading">
      <div class="comments-heading-row"><h2 id="comments-heading">Bình luận</h2><span id="comment-count" class="comment-count">Đang tải...</span></div>
      <p id="comment-status" class="comment-status" role="status" aria-live="polite"></p>
      <div id="comment-composer"></div>
      <div id="comment-list" aria-live="polite"><p>Đang tải bình luận...</p></div>
    </section>
  `;
}

function showArticleError(message) {
  detailContainer.innerHTML = `
    <a class="back-link" href="/">← Về trang chủ</a>
    <div class="detail-status"><h2>Không thể mở bài viết</h2><p>${escapeHTML(message)}</p></div>
  `;
}

async function loadSession() {
  try {
    const pageUrl = new URL(window.location.href);
    const requestedRole = pageUrl.searchParams.get("as");
    if (["admin", "user", "guest"].includes(requestedRole)) {
      sessionStorage.setItem("tinMoiActiveRole", requestedRole);
    }

    const response = await fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!response.ok) {
      currentSession = { admin: null, user: null };
      return;
    }

    const session = await response.json();
    const tabRole = sessionStorage.getItem("tinMoiActiveRole") || "guest";
    // This hint controls UI only. The backend independently authorizes every write.
    // Never switch this tab to the other role merely because its cookie exists.
    if (tabRole === "admin") {
      currentSession = { admin: session.admin || null, user: null };
    } else if (tabRole === "user") {
      currentSession = { admin: null, user: session.user || null };
    } else {
      currentSession = { admin: null, user: null };
    }
  } catch (error) {
    currentSession = { admin: null, user: null };
    console.warn("Không kiểm tra được trạng thái đăng nhập:", error.message);
  }
}

async function requestJSON(url, options = {}) {
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
    error.code = result.code;
    throw error;
  }
  return result;
}

function commentComposerMarkup(parentId = "", isReply = false) {
  return `
    <form class="comment-form ${isReply ? "reply-comment-form" : "main-comment-form"}" data-parent-id="${escapeHTML(parentId)}">
      <label class="sr-only" for="${isReply ? `reply-input-${escapeHTML(parentId)}` : "comment-input"}">${isReply ? "Nội dung trả lời" : "Nội dung bình luận"}</label>
      <textarea ${isReply ? `id="reply-input-${escapeHTML(parentId)}"` : 'id="comment-input"'} name="content" rows="${isReply ? 2 : 3}" maxlength="2000" required placeholder="${isReply ? "Viết câu trả lời..." : "Bạn nghĩ gì về bài viết này?"}"></textarea>
      <div class="comment-form-actions">
        <span class="comment-form-note">Tối đa 2.000 ký tự</span>
        <div>
          ${isReply ? '<button type="button" class="comment-cancel-reply">Hủy</button>' : ""}
          <button class="comment-submit" type="submit">${isReply ? "Gửi trả lời" : "Gửi bình luận"}</button>
        </div>
      </div>
    </form>
  `;
}

const reactionLabels = {
  like: { emoji: "👍", label: "Thích" },
  haha: { emoji: "😆", label: "Haha" },
  sad: { emoji: "😢", label: "Buồn" },
  love: { emoji: "❤️", label: "Yêu thích" },
  angry: { emoji: "😡", label: "Phẫn nộ" }
};

function renderOneComment(comment, childrenMap) {
  const id = String(comment._id);
  const children = childrenMap.get(id) || [];
  const isOwner = Boolean(currentSession.user && String(currentSession.user.id) === String(comment.user?._id));
  const counts = comment.reactionCounts || {};
  const actions = comment.isDeleted ? '<span class="comment-form-note">Bình luận đã bị xóa</span>' : currentSession.admin ? `
    <span class="comment-form-note">Chế độ kiểm duyệt Admin</span>
    <button type="button" class="comment-action danger-text" data-admin-delete-comment="${escapeHTML(id)}">Xóa bình luận</button>
  ` : currentSession.user ? `
    <button type="button" class="comment-action" data-reply-comment="${escapeHTML(id)}">Trả lời</button>
    ${isOwner ? `<button type="button" class="comment-action danger-text" data-delete-own-comment="${escapeHTML(id)}">Xóa</button>` : ""}
    <div class="reaction-row" aria-label="Cảm xúc">
      ${Object.entries(reactionLabels).map(([type, item]) => `
        <button type="button" class="reaction-button ${comment.myReaction === type ? "selected" : ""}" data-reaction-type="${type}" data-reaction-comment="${escapeHTML(id)}" aria-pressed="${comment.myReaction === type ? "true" : "false"}" title="${item.label}">
          <span aria-hidden="true">${item.emoji}</span><span>${item.label}</span><b>${Number(counts[type] || 0)}</b>
        </button>
      `).join("")}
    </div>
  ` : `
    <div class="reaction-row read-only-reactions" aria-label="Số cảm xúc">
      ${Object.entries(reactionLabels).filter(([type]) => Number(counts[type] || 0) > 0).map(([type, item]) => `
        <span class="reaction-readonly" title="${item.label}">${item.emoji} ${Number(counts[type] || 0)}</span>
      `).join("") || '<span class="comment-form-note">Chưa có cảm xúc</span>'}
    </div>
  `;

  return `
    <article class="comment-card" data-comment-card="${escapeHTML(id)}">
      <div class="comment-author-row">
        <span class="comment-avatar" aria-hidden="true">${escapeHTML((comment.user?.username || "T").slice(0, 1).toUpperCase())}</span>
        <div><strong>${escapeHTML(comment.user?.username || "Thành viên đã xóa")}</strong><time datetime="${escapeHTML(comment.createdAt || "")}">${escapeHTML(formatDate(comment.createdAt, true))}</time></div>
      </div>
      <p class="comment-content ${comment.isDeleted ? "deleted-comment-content" : ""}">${escapeHTML(comment.content || (comment.isDeleted ? "Bình luận này đã bị xóa." : ""))}</p>
      <div class="comment-actions">${actions}</div>
      <div class="reply-form-slot"></div>
      ${children.length ? `<div class="comment-replies">${children.map((child) => renderOneComment(child, childrenMap)).join("")}</div>` : ""}
    </article>
  `;
}

function renderComments() {
  const list = document.getElementById("comment-list");
  const count = document.getElementById("comment-count");
  if (!list || !count) return;
  count.textContent = `${commentsCache.length} bình luận`;
  if (!commentsCache.length) {
    list.innerHTML = '<div class="comments-empty"><strong>Chưa có bình luận nào</strong><p>Hãy là người đầu tiên chia sẻ ý kiến của bạn.</p></div>';
    return;
  }

  const childrenMap = new Map();
  for (const comment of commentsCache) {
    const parentKey = comment.parent ? String(comment.parent) : "";
    if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
    childrenMap.get(parentKey).push(comment);
  }
  const roots = childrenMap.get("") || [];
  // If malformed/orphaned data exists, still render comments that have no visible parent.
  const visible = new Set();
  const markVisible = (comment) => {
    const id = String(comment._id);
    if (visible.has(id)) return;
    visible.add(id);
    for (const child of childrenMap.get(id) || []) markVisible(child);
  };
  roots.forEach(markVisible);
  const orphaned = commentsCache.filter((comment) => !visible.has(String(comment._id)));
  list.innerHTML = roots.map((comment) => renderOneComment(comment, childrenMap)).join("") +
    (orphaned.length ? `<div class="orphaned-comments">${orphaned.map((comment) => renderOneComment(comment, childrenMap)).join("")}</div>` : "");
}

function setCommentStatus(message, isError = false) {
  const status = document.getElementById("comment-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function loadComments() {
  const list = document.getElementById("comment-list");
  if (!list || !activeArticleSlug) return;
  try {
    const result = await requestJSON(`/api/articles/${encodeURIComponent(activeArticleSlug)}/comments`);
    commentsCache = Array.isArray(result.data) ? result.data : [];
    renderComments();
  } catch (error) {
    list.innerHTML = `<div class="comments-empty">${escapeHTML(error.message || "Không thể tải bình luận.")}</div>`;
  }
}

function renderCommentComposer() {
  const composer = document.getElementById("comment-composer");
  if (!composer) return;
  if (currentSession.user) {
    composer.innerHTML = commentComposerMarkup();
  } else if (currentSession.admin) {
    composer.innerHTML = '<p class="comment-login-hint">Bạn đang đăng nhập với quyền Admin. Hãy dùng tài khoản thành viên để bình luận hoặc thả cảm xúc.</p>';
  } else {
    const returnToArticle = `/article.html?slug=${encodeURIComponent(activeArticleSlug)}&as=user`;
    composer.innerHTML = `<p class="comment-login-hint">Bạn cần <a href="/user-login.html?redirect=${encodeURIComponent(returnToArticle)}">đăng nhập</a> để bình luận, trả lời hoặc thả cảm xúc.</p>`;
  }
}

function initCommentSection() {
  const section = document.getElementById("comments-section");
  if (!section) return;
  renderCommentComposer();

  section.addEventListener("click", async (event) => {
    const replyButton = event.target.closest("[data-reply-comment]");
    const cancelButton = event.target.closest(".comment-cancel-reply");
    const deleteButton = event.target.closest("[data-delete-own-comment]");
    const adminDeleteButton = event.target.closest("[data-admin-delete-comment]");
    const reactionButton = event.target.closest("[data-reaction-comment]");
    if (adminDeleteButton) {
      if (!currentSession.admin) return;
      if (!confirm("Admin: xóa bình luận này và toàn bộ câu trả lời bên dưới?")) return;
      adminDeleteButton.disabled = true;
      try {
        const result = await requestJSON(`/api/admin/comments/${encodeURIComponent(adminDeleteButton.dataset.adminDeleteComment)}`, { method: "DELETE" });
        setCommentStatus(result.message || "Đã xóa bình luận.");
        await loadComments();
      } catch (error) {
        setCommentStatus(error.message || "Không thể xóa bình luận.", true);
        adminDeleteButton.disabled = false;
      }
      return;
    }

    if (replyButton) {
      if (!currentSession.user) return;
      section.querySelectorAll(".reply-comment-form").forEach((form) => form.remove());
      const commentId = replyButton.dataset.replyComment;
      const slot = replyButton.closest(".comment-card")?.querySelector(":scope > .reply-form-slot");
      if (slot) {
        slot.innerHTML = commentComposerMarkup(commentId, true);
        slot.querySelector("textarea")?.focus();
      }
      return;
    }

    if (cancelButton) {
      cancelButton.closest(".reply-comment-form")?.remove();
      return;
    }

    if (deleteButton) {
      const commentId = deleteButton.dataset.deleteOwnComment;
      if (!confirm("Xóa bình luận của bạn và tất cả câu trả lời bên dưới? Thao tác này không thể hoàn tác.")) return;
      deleteButton.disabled = true;
      try {
        const result = await requestJSON(`/api/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
        setCommentStatus(result.message || "Đã xóa bình luận.");
        await loadComments();
      } catch (error) {
        setCommentStatus(error.message, true);
        deleteButton.disabled = false;
      }
      return;
    }

    if (reactionButton) {
      const commentId = reactionButton.dataset.reactionComment;
      const type = reactionButton.dataset.reactionType;
      if (!currentSession.user) return;
      reactionButton.disabled = true;
      try {
        const result = await requestJSON(`/api/comments/${encodeURIComponent(commentId)}/react`, {
          method: "POST",
          body: JSON.stringify({ type })
        });
        setCommentStatus(result.message || "Đã cập nhật cảm xúc.");
        await loadComments();
      } catch (error) {
        setCommentStatus(error.message, true);
        reactionButton.disabled = false;
        if (error.status === 403 || error.status === 401) {
          await loadSession();
          renderCommentComposer();
          await loadComments();
        }
      }
    }
  });

  section.addEventListener("submit", async (event) => {
    const form = event.target.closest(".comment-form");
    if (!form) return;
    event.preventDefault();
    const textarea = form.querySelector("textarea[name='content']");
    const content = textarea?.value.trim() || "";
    const parentId = form.dataset.parentId || "";
    const button = form.querySelector("button[type='submit']");
    if (!content) {
      setCommentStatus("Vui lòng nhập nội dung trước khi gửi.", true);
      textarea?.focus();
      return;
    }
    if (content.length > 2000) {
      setCommentStatus("Bình luận tối đa 2.000 ký tự.", true);
      return;
    }
    button.disabled = true;
    try {
      const result = await requestJSON(`/api/articles/${encodeURIComponent(activeArticleSlug)}/comments`, {
        method: "POST",
        body: JSON.stringify({ content, ...(parentId ? { parentId } : {}) })
      });
      setCommentStatus(result.message || "Đã gửi bình luận.");
      form.reset();
      if (parentId) form.remove();
      await loadComments();
    } catch (error) {
      setCommentStatus(error.message || "Không thể gửi bình luận.", true);
      button.disabled = false;
      if (error.status === 401 || error.status === 403) {
        await loadSession();
        renderCommentComposer();
        await loadComments();
      }
    }
  });
}

async function loadArticle() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  activeArticleSlug = slug || "";
  if (!slug) {
    showArticleError("Đường dẫn bài viết không hợp lệ.");
    return;
  }

  try {
    await loadSession();
    const response = await fetch(`/api/articles/${encodeURIComponent(slug)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.success || !result.data) throw new Error("Không tìm thấy bài viết.");
    renderArticle(result.data);
    initCommentSection();
    await loadComments();
  } catch (error) {
    console.error("Lỗi tải bài viết:", error);
    showArticleError(error.message || "Không thể tải bài viết.");
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("#admin-delete-article");
  if (!button || !currentSession.admin || !activeArticleSlug) return;
  if (!confirm("Bạn chắc chắn muốn xóa bài viết này? Bình luận và câu trả lời liên quan cũng sẽ bị xóa.")) return;
  button.disabled = true;
  try {
    const result = await requestJSON(`/api/articles/${encodeURIComponent(activeArticleSlug)}`, { method: "DELETE" });
    alert(result.message || "Đã xóa bài viết.");
    window.location.replace("/?as=admin");
  } catch (error) {
    alert(error.message || "Không thể xóa bài viết.");
    button.disabled = false;
  }
});


loadArticle();


// Re-render the article after browser Back/Forward restores a cached document,
// so moderation and edit/delete controls always reflect this tab's role.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});
