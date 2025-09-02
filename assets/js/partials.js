// partials.js — injects header/footer HTML and marks active nav dynamically

// -------- Inject partials --------
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

// -------- Mark active nav (dynamic) --------
function markActiveNav() {
  // Normalize current path (remove trailing slash except root)
  const raw = location.pathname;
  const path = raw === "/" ? "/" : raw.replace(/\/+$/, "");

  // Select all nav links inside primary nav
  const links = Array.from(document.querySelectorAll("#primary-nav a[href]"));
  if (!links.length) return;

  // Helper to normalize href paths (strip origin, trailing slashes, hash/query)
  const norm = (href) => {
    try {
      const u = new URL(href, location.origin);
      const p = u.pathname;
      return p === "/" ? "/" : p.replace(/\/+$/, "");
    } catch {
      return href;
    }
  };

  // Pick the "best" match:
  // 1) Exact path match
  // 2) If no exact, the longest link path that is a prefix of current path
  // 3) As a fallback, keep previous special-case for /try
  let best = null;
  let bestLen = -1;

  for (const a of links) {
    const p = norm(a.getAttribute("href") || "");
    if (!p) continue;

    if (p === path) {
      best = a;
      bestLen = Infinity; // exact wins
      break;
    }
    if (p !== "/" && path.startsWith(p) && p.length > bestLen) {
      best = a;
      bestLen = p.length;
    }
  }

  // Legacy special-case: highlight Try on /try or /try.html
  if (!best && (path === "/try" || path.endsWith("/try.html"))) {
    best = document.querySelector('#primary-nav a[data-nav="try"]');
  }

  if (best) best.setAttribute("aria-current", "page");
}

// -------- Boot --------
inject("site-header", "/partials/header.html");
inject("site-footer", "/partials/footer.html");
