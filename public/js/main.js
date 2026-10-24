
const articleList = document.getElementById("article-list");
const articleCount = document.getElementById("article-count");
const searchInput = document.getElementById("article-search");
const categoryFilter = document.getElementById("category-filter");

let allArticles = [];

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("vi-VN");
}

function getArticleUrl(article) {
  // Carry this tab's selected identity through navigation. Cookies are shared
  // by tabs on localhost; the URL hint keeps presentation tied to this tab.
  const url = new URL(window.location.href);
  const queryRole = url.searchParams.get("as");
  const storedRole = sessionStorage.getItem("tinMoiActiveRole");
  const role = ["admin", "user", "guest"].includes(queryRole)
    ? queryRole
    : (["admin", "user", "guest"].includes(storedRole) ? storedRole : "guest");
  return `/article.html?slug=${encodeURIComponent(article.slug || "")}&as=${encodeURIComponent(role)}`;
}

function renderArticles() {
  const keyword = (searchInput?.value || "")
    .trim()
    .toLocaleLowerCase("vi");

  const selectedCategory = categoryFilter?.value || "";

  const filtered = allArticles.filter((article) => {
    const searchableText = [
      article.title,
      article.summary,
      article.category,
      article.author,
    ].join(" ").toLocaleLowerCase("vi");

    const matchesKeyword = searchableText.includes(keyword);
    const matchesCategory =
      !selectedCategory || article.category === selectedCategory;

    return matchesKeyword && matchesCategory;
  });

  articleCount.textContent = `${filtered.length} bài viết`;

  if (filtered.length === 0) {
    articleList.innerHTML = `
      <div class="empty-state">
        <h3>Không tìm thấy bài viết</h3>
        <p>Hãy thử từ khóa hoặc danh mục khác.</p>
      </div>
    `;
    return;
  }

  articleList.innerHTML = filtered.map((article) => {
    const url = getArticleUrl(article);
    const title = escapeHTML(article.title || "Chưa có tiêu đề");
    const image = article.imageUrl
      ? `
        <a class="article-image-link" href="${url}" aria-label="Đọc ${title}">
          <img
            src="${escapeHTML(article.imageUrl)}"
            alt="${title}"
            loading="lazy"
          >
        </a>
      `
      : "";

    return `
      <article class="article-card">
        ${image}
        <div class="article-body">
          <span class="article-category">
            ${escapeHTML(article.category || "Tin tức")}
          </span>

          <h3>
            <a href="${url}">${title}</a>
          </h3>

          <p>${escapeHTML(article.summary || "")}</p>

          <div class="article-meta">
            ${escapeHTML(article.author || "Ban biên tập")}
            ${article.publishedAt
              ? ` · ${escapeHTML(formatDate(article.publishedAt))}`
              : ""}
          </div>

          <a class="read-more" href="${url}">Đọc bài viết →</a>
        </div>
      </article>
    `;
  }).join("");
}

async function loadArticles() {
  try {
    const response = await fetch("/api/articles");
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error("Không tải được danh sách bài viết.");
    }

    allArticles = Array.isArray(result.data) ? result.data : [];

    if (categoryFilter) {
      const categories = [
        ...new Set(
          allArticles
            .map((article) => article.category)
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b, "vi"));

      categoryFilter.innerHTML = `
        <option value="">Tất cả danh mục</option>
        ${categories.map((category) => `
          <option value="${escapeHTML(category)}">
            ${escapeHTML(category)}
          </option>
        `).join("")}
      `;
    }

    renderArticles();
  } catch (error) {
    articleList.innerHTML = `
      <div class="news-error">
        Không thể tải bài viết. Vui lòng tải lại trang.
      </div>
    `;

    articleCount.textContent = "Có lỗi xảy ra";
    console.error("Lỗi tải bài viết:", error);
  }
}

searchInput?.addEventListener("input", renderArticles);
categoryFilter?.addEventListener("change", renderArticles);

loadArticles();
