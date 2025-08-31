async function inject(id, url) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    const html = await fetch(url, { credentials: "same-origin" }).then(r => r.text());
    el.innerHTML = html;
    if (id === "site-header") markActiveNav();
  } catch (e) {
    console.warn("Partial load failed:", url, e);
  }
}

function markActiveNav() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const nav = document.querySelector('#primary-nav a[data-nav="try"]');
  if (nav && (path.endsWith("/try.html") || path === "/try")) {
    nav.setAttribute("aria-current", "page");
  }
}

inject("site-header", "/partials/header.html");
inject("site-footer", "/partials/footer.html");