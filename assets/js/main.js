/* ============================================================
   ЛИСТВА — движок блога
   Настройки сайта — в объекте SITE ниже.
   ============================================================ */

const SITE = {
  title: "Архон",
  subtitle: "личный журнал записей",
  author: "Артём",
  about: [
    "Это мой личный журнал — место, куда я складываю записи, которые не хочется терять: мысли, решения, важные события.",
    "Здесь нет алгоритмов и спешки — только то, что действительно имеет значение, сохранённое навсегда.",
    "Новые записи появляются нерегулярно — тогда, когда есть о чём рассказать."
  ],
  heroEyebrow: "записи о важном",
  heroTitle: "Записи, которые остаются",
  heroSub: "Место для мыслей, решений и событий, которые важно сохранить. Пишу, когда есть <em>о чём</em> рассказать."
};

/* ---------- утилиты ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^\w\sа-яё-]/gi, "")
    .replace(/\s+/g, "-");
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric", month: "long", year: "numeric"
    }).format(new Date(iso));
  } catch (e) { return iso; }
}

/* ---------- лёгкий markdown-парсер ---------- */
function renderInline(text) {
  // защищаем инлайн-код
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (m, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = escapeHtml(text);
  // изображения
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (m, alt, src, title) => `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ""} loading="lazy" />`);
  // ссылки
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // жирный
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // курсив
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  // возвращаем код
  text = text.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[+i]);
  return text;
}

function mdToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  let html = "";
  let i = 0;
  let inList = null, inQuote = false, inCode = false;
  let codeBuf = [];

  const closeList = () => { if (inList) { html += `</${inList}>`; inList = null; } };
  const closeQuote = () => { if (inQuote) { html += "</blockquote>"; inQuote = false; } };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      if (!inCode) { closeList(); closeQuote(); inCode = true; codeBuf = []; }
      else { html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`; inCode = false; }
      i++; continue;
    }
    if (inCode) { codeBuf.push(line); i++; continue; }

    if (/^\s*$/.test(line)) { closeList(); closeQuote(); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList(); closeQuote();
      const lvl = h[1].length;
      html += `<h${lvl} id="${slugify(h[2])}">${renderInline(h[2])}</h${lvl}>`;
      i++; continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { closeList(); closeQuote(); html += "<hr>"; i++; continue; }

    if (/^\s*>\s?/.test(line)) {
      closeList();
      if (!inQuote) { html += "<blockquote>"; inQuote = true; }
      html += `<p>${renderInline(line.replace(/^\s*>\s?/, ""))}</p>`;
      i++; continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      closeQuote();
      if (inList !== "ul") { closeList(); html += "<ul>"; inList = "ul"; }
      html += `<li>${renderInline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`;
      i++; continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      closeQuote();
      if (inList !== "ol") { closeList(); html += "<ol>"; inList = "ol"; }
      html += `<li>${renderInline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`;
      i++; continue;
    }

    // абзац — собираем до пустой строки или следующего блока
    closeList(); closeQuote();
    const para = [line]; i++;
    while (i < lines.length) {
      const nl = lines[i];
      if (/^\s*$/.test(nl) ||
          /^(#{1,6})\s/.test(nl) ||
          /^\s*[-*+]\s+/.test(nl) ||
          /^\s*\d+[.)]\s+/.test(nl) ||
          /^\s*>\s?/.test(nl) ||
          /^\s*```/.test(nl) ||
          /^\s*(---|\*\*\*|___)\s*$/.test(nl)) break;
      para.push(nl); i++;
    }
    html += `<p>${renderInline(para.join(" "))}</p>`;
  }
  closeList(); closeQuote();
  if (inCode) html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
  return html;
}

/* ---------- состояние ---------- */
let POSTS = [];

async function loadIndex() {
  try {
    const res = await fetch("posts/index.json", { cache: "no-store" });
    POSTS = (await res.json()) || [];
    POSTS.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (e) {
    POSTS = [];
  }
}

/* ---------- представления ---------- */
function revealObserve(root) {
  root.querySelectorAll(".reveal").forEach((el, idx) => {
    if (!el.dataset.d) el.dataset.d = idx % 4;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
      }, { threshold: 0.12 });
      io.observe(el);
    } else {
      el.classList.add("in");
    }
  });
}

function renderHome() {
  document.title = `${SITE.title} — ${SITE.subtitle}`;
  setNav("home");

  const cards = POSTS.map((p) => `
    <a class="post-card reveal" href="#/post/${encodeURIComponent(p.slug)}" data-d="${0}">
      <div class="post-meta">
        <span>${formatDate(p.date)}</span>
        <span class="dot"></span>
        <span>${p.readingTime || 2} мин чтения</span>
      </div>
      <h3 class="post-title">${escapeHtml(p.title)}</h3>
      <p class="post-excerpt">${escapeHtml(p.excerpt || "")}</p>
      <div class="post-foot">
        <div class="post-tags">${(p.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        <span class="post-arrow">→</span>
      </div>
    </a>
  `).join("");

  app.innerHTML = `
    <section class="hero">
      <div class="hero-blob" aria-hidden="true"></div>
      <div class="wrap">
        <span class="hero-eyebrow reveal">${escapeHtml(SITE.heroEyebrow)}</span>
        <h1 class="hero-title reveal d1">${SITE.heroTitle}</h1>
        <p class="hero-sub reveal d2">${SITE.heroSub}</p>
      </div>
    </section>
    <section class="posts">
      <div class="wrap">
        <div class="section-head reveal">
          <h2>Из журнала</h2>
          <span class="stem"></span>
        </div>
        ${cards || `<p class="empty">Пока пусто — первая запись скоро появится.</p>`}
      </div>
    </section>
  `;
  revealObserve(app);
}

function renderAbout() {
  document.title = `О журнале — ${SITE.title}`;
  setNav("about");
  app.innerHTML = `
    <section class="about">
      <div class="wrap">
        <div class="about-card reveal">
          <h1>О журнале</h1>
          ${SITE.about.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
          <p style="margin-top:1.6rem;font-style:italic;color:var(--moss)">— ${escapeHtml(SITE.author)}</p>
        </div>
      </div>
    </section>
  `;
  revealObserve(app);
}

async function renderPost(slug) {
  setNav(null);
  const meta = POSTS.find((p) => p.slug === slug);
  if (!meta) {
    app.innerHTML = `<section class="empty">Запись не найдена. <a href="#/">Вернуться в журнал</a></section>`;
    return;
  }
  let content;
  try {
    const res = await fetch(`posts/${encodeURIComponent(slug)}.md`, { cache: "no-store" });
    content = await res.text();
  } catch (e) {
    content = "";
  }
  document.title = `${meta.title} — ${SITE.title}`;

  app.innerHTML = `
    <article class="article">
      <div class="wrap">
        <a class="back-link reveal" href="#/"><span class="arr">←</span> к журналу</a>
        <header class="article-head reveal d1">
          <h1 class="article-title">${escapeHtml(meta.title)}</h1>
          <div class="article-meta">
            <span>${formatDate(meta.date)}</span>
            <span class="dot"></span>
            <span>${meta.readingTime || 2} мин чтения</span>
            ${(meta.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
          </div>
        </header>
        <div class="article-body reveal d2">${mdToHtml(content)}</div>
        <div class="article-end reveal">
          <span class="line"></span>
          <span>с любовью, ${escapeHtml(SITE.author)}</span>
          <span class="line"></span>
        </div>
      </div>
    </article>
  `;
  revealObserve(app);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setNav(key) {
  document.querySelectorAll(".site-nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === key);
  });
}

/* ---------- роутер ---------- */
function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/post/")) {
    renderPost(decodeURIComponent(hash.slice("#/post/".length)));
  } else if (hash.startsWith("#/about")) {
    renderAbout();
  } else {
    renderHome();
  }
}

/* ---------- шапка при прокрутке ---------- */
function onScroll() {
  $("#siteHeader").classList.toggle("scrolled", window.scrollY > 24);
}

/* ---------- запуск ---------- */
(async function init() {
  $("#year").textContent = new Date().getFullYear();
  await loadIndex();
  window.addEventListener("hashchange", route);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  route();
})();
