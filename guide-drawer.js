/* 상생기록법인 — '자세히' 서랍
   a.more(또는 a[data-more])가 가리키는 안내 페이지(…/guide/*.html)를 페이지를 떠나지 않고 엽니다.
   PC는 오른쪽 패널, 휴대폰은 아래에서 올라오는 시트. 바깥 라이브러리 없음.
   주소: 열면 #more-<slug>가 붙고, 뒤로 가기로 닫힙니다. 밖에서 쓸 수 있는 것은 window.SSRMore.open/close 뿐. */
(() => {
  "use strict";
  if (window.SSRMore) return;

  const d = document, root = d.documentElement;
  const SEG = "/guide/";
  const HASH_RE = /^#more-([A-Za-z0-9_-]+)$/;
  const FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,iframe,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const cache = new Map(); // 주소(# 없이) → Promise<article.guide>

  let ui = null, isOpen = false, current = "", trigger = null, seq = 0, baseHref = "";
  let hideTimer = 0, backWait = null, inerted = [], padSaved = "";

  // ---------------------------------------------------------------- 주소
  const toURL = (h, base) => { try { return new URL(h, base || location.href); } catch (_) { return null; } };
  const noHash = (u) => { const x = new URL(u.href); x.hash = ""; return x.href; };
  const sameOrigin = (h) => { const u = toURL(h); return !!u && u.origin === location.origin; };
  const ours = (st) => !!(st && typeof st === "object" && typeof st.ssrMore === "string" && sameOrigin(st.ssrMore));
  const slugOf = (href) => {
    const p = new URL(href).pathname;
    return decodeURIComponent(p.slice(p.lastIndexOf("/") + 1)).replace(/\.html$/i, "");
  };
  const hashURL = (href) => location.pathname + location.search + "#more-" + slugOf(href);
  const plainURL = () => location.pathname + location.search;

  function attrBase() {
    const v = root.getAttribute("data-guide-base") || (d.body && d.body.getAttribute("data-guide-base"));
    const u = v ? toURL(v.endsWith("/") ? v : v + "/") : null;
    return u ? u.pathname : null;
  }
  function dirOf(path) {
    const i = path.lastIndexOf(SEG);
    return i >= 0 ? path.slice(0, i + SEG.length) : path.slice(0, path.lastIndexOf("/") + 1);
  }
  function guideBase() {
    const b = attrBase();
    if (b) return b;
    for (const a of d.querySelectorAll("a.more[href], a[data-more][href]")) {
      const u = toURL(a.getAttribute("href"));
      if (u && u.origin === location.origin && u.pathname.includes(SEG)) return dirOf(u.pathname);
    }
    return location.pathname.includes(SEG) ? dirOf(location.pathname) : null;
  }
  function isGuide(u) {
    if (!u || u.origin !== location.origin || !/\.html$/i.test(u.pathname)) return false;
    if (u.pathname.includes(SEG)) return true;
    const b = attrBase();
    return !!b && u.pathname.startsWith(b);
  }

  // ---------------------------------------------------------------- 불러오기
  function absolutize(node, pageHref) {
    node.querySelectorAll("[href],[src]").forEach((el) => {
      for (const at of ["href", "src"]) {
        const v = el.getAttribute(at);
        if (v && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(v)) {
          const u = toURL(v, pageHref);
          if (u) el.setAttribute(at, u.origin === location.origin ? u.pathname + u.search + u.hash : u.href);
        }
      }
    });
  }
  function load(href) {
    let p = cache.get(href);
    if (!p) {
      p = fetch(href, { credentials: "same-origin" })
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then((text) => {
          const art = new DOMParser().parseFromString(text, "text/html").querySelector("article.guide");
          if (!art) throw new Error("article.guide not found");
          art.querySelectorAll("script").forEach((s) => s.remove());
          absolutize(art, href);
          return art;
        });
      p.catch(() => { if (cache.get(href) === p) cache.delete(href); });
      cache.set(href, p);
    }
    return p;
  }
  function prefetch(e) {
    if (!finePointer.matches || (e.pointerType && e.pointerType === "touch")) return;
    const a = e.target instanceof Element ? e.target.closest("a.more[href], a[data-more][href]") : null;
    if (!a) return;
    const u = toURL(a.getAttribute("href"));
    if (isGuide(u) && u.pathname !== location.pathname) load(noHash(u)).catch(() => {});
  }

  // ---------------------------------------------------------------- 화면
  function build() {
    const box = d.createElement("div");
    box.className = "g-drawer";
    box.hidden = true;
    box.innerHTML =
      '<div class="g-drawer-overlay"></div>' +
      '<div class="g-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="g-drawer-label" tabindex="-1">' +
        '<div class="g-drawer-head">' +
          '<span class="g-drawer-grab" aria-hidden="true"></span>' +
          '<span class="g-drawer-label" id="g-drawer-label">자세히 보기</span>' +
          '<a class="g-drawer-newtab" href="" target="_blank" rel="noopener">새 창에서 보기<span aria-hidden="true"> ↗</span></a>' +
          '<button type="button" class="g-drawer-close" aria-label="닫기"><span aria-hidden="true">×</span></button>' +
        "</div>" +
        '<div class="g-drawer-body"></div>' +
      "</div>";
    d.body.appendChild(box);
    ui = {
      box,
      overlay: box.querySelector(".g-drawer-overlay"),
      panel: box.querySelector(".g-drawer-panel"),
      body: box.querySelector(".g-drawer-body"),
      newtab: box.querySelector(".g-drawer-newtab"),
    };
    ui.overlay.addEventListener("click", requestClose);
    box.querySelector(".g-drawer-close").addEventListener("click", requestClose);
  }
  function skeleton() {
    const s = d.createElement("div");
    s.className = "g-skel";
    s.innerHTML = '<p class="g-sr" role="status">불러오는 중입니다</p><i class="h"></i><i></i><i></i><i class="s"></i><i class="gap"></i><i></i><i></i><i class="s"></i>';
    return s;
  }
  function fail(href) {
    const box = d.createElement("div");
    box.className = "g-drawer-error";
    box.setAttribute("role", "alert");
    box.innerHTML = "<p><b>내용을 불러오지 못했습니다.</b>인터넷 연결을 확인하시거나 페이지를 바로 열어 보세요.</p>" +
      '<a class="btn btn-primary" data-g-direct href="">페이지 열기</a>';
    const a = box.querySelector("a");
    a.href = href;
    ui.body.replaceChildren(box);
    ui.body.removeAttribute("aria-busy");
    a.focus({ preventScroll: true });
  }
  // 같은 id가 페이지에 이미 있으면(안내 페이지 안에서 다른 안내를 열 때) 서랍 쪽 id를 바꿈
  function dedupeIds(node) {
    const map = new Map();
    for (const el of [node, ...node.querySelectorAll("[id]")]) {
      if (!el.id) continue;
      const ex = d.getElementById(el.id);
      if (ex && !ui.body.contains(ex)) { map.set(el.id, "gd-" + el.id); el.id = "gd-" + el.id; }
    }
    if (!map.size) return;
    for (const el of [node, ...node.querySelectorAll("[aria-labelledby],[aria-describedby],[aria-controls],[for],[href^='#']")]) {
      for (const at of ["aria-labelledby", "aria-describedby", "aria-controls", "for"]) {
        const v = el.getAttribute(at);
        if (v) el.setAttribute(at, v.split(/\s+/).map((t) => map.get(t) || t).join(" "));
      }
      const h = el.getAttribute("href");
      if (h && h[0] === "#" && map.has(h.slice(1))) el.setAttribute("href", "#" + map.get(h.slice(1)));
    }
  }

  async function render(href) {
    const my = ++seq;
    current = href;
    ui.newtab.href = href;
    ui.panel.setAttribute("aria-labelledby", "g-drawer-label");
    ui.body.setAttribute("aria-busy", "true");
    ui.body.replaceChildren(skeleton());
    ui.body.scrollTop = 0;
    if (!ui.panel.contains(d.activeElement)) ui.panel.focus({ preventScroll: true });
    let art;
    try { art = await load(href); } catch (_) { if (my === seq && isOpen) fail(href); return false; }
    if (my !== seq || !isOpen) return false;
    const node = d.importNode(art, true);
    dedupeIds(node);
    ui.body.replaceChildren(node);
    ui.body.removeAttribute("aria-busy");
    ui.body.scrollTop = 0;
    const h = node.querySelector("h1");
    if (h) {
      if (!h.id) h.id = "g-drawer-title";
      h.setAttribute("tabindex", "-1");
      ui.panel.setAttribute("aria-labelledby", h.id);
      h.focus({ preventScroll: true });
    }
    return true;
  }

  // ---------------------------------------------------------------- 열고 닫기
  function lock() {
    const sbw = Math.max(0, innerWidth - root.clientWidth); // 스크롤바 너비만큼 채워 화면이 밀리지 않게
    root.classList.add("g-lock");
    padSaved = d.body.style.paddingRight;
    if (sbw) d.body.style.paddingRight = (parseFloat(getComputedStyle(d.body).paddingRight) || 0) + sbw + "px";
    for (const el of d.body.children) {
      if (el !== ui.box && !el.inert) { el.inert = true; inerted.push(el); }
    }
  }
  function unlock() {
    root.classList.remove("g-lock");
    d.body.style.paddingRight = padSaved;
    inerted.forEach((el) => { el.inert = false; });
    inerted = [];
  }
  function show() {
    if (!ui) build();
    clearTimeout(hideTimer);
    if (isOpen) return;
    isOpen = true;
    lock();
    ui.box.inert = false;
    ui.box.hidden = false;
    void ui.box.offsetWidth; // 처음 모습을 그린 뒤에 미끄러져 들어오게
    ui.box.classList.add("is-open");
    d.addEventListener("keydown", onKey, true);
    d.addEventListener("focusin", onFocusIn, true);
  }
  const toMs = (v) => (parseFloat(v) || 0) * (/ms\s*$/.test(v) ? 1 : 1000);
  function transitionMs(el) {
    const cs = getComputedStyle(el), dur = cs.transitionDuration.split(","), del = cs.transitionDelay.split(",");
    return Math.max(0, ...dur.map((v, i) => toMs(v) + toMs(del[i % del.length] || "0s")));
  }
  function hide(restoreFocus) {
    if (!isOpen) return;
    isOpen = false;
    seq++;
    d.removeEventListener("keydown", onKey, true);
    d.removeEventListener("focusin", onFocusIn, true);
    ui.box.classList.remove("is-open");
    ui.box.inert = true; // 사라지는 동안에는 누르거나 초점이 들어가지 않게
    unlock();
    const t = trigger;
    trigger = null;
    current = "";
    if (restoreFocus !== false && t && t.isConnected && typeof t.focus === "function") t.focus({ preventScroll: true });
    const finish = () => {
      if (isOpen) return;
      ui.box.hidden = true;
      ui.body.replaceChildren();
      ui.body.removeAttribute("aria-busy");
      ui.panel.setAttribute("aria-labelledby", "g-drawer-label");
    };
    const ms = reduceMotion.matches ? 0 : transitionMs(ui.panel);
    if (ms) hideTimer = setTimeout(finish, ms + 40); else finish();
  }

  // 서랍이 쌓은 기록만큼 뒤로 가서 닫음(뒤로 가기 단추와 같은 결과)
  function goBack(n) {
    backWait = new Promise((resolve) => {
      const done = () => { clearTimeout(t); removeEventListener("popstate", done); backWait = null; resolve(); };
      const t = setTimeout(done, 700);
      addEventListener("popstate", done);
    });
    history.go(-n);
  }
  function requestClose() {
    if (!isOpen) return;
    const st = history.state;
    const depth = ours(st) ? (st.ssrDepth | 0) : 0;
    hide(true);
    if (depth > 0) goBack(depth);
    else if (HASH_RE.test(location.hash)) history.replaceState(ours(st) ? null : st, "", plainURL());
  }
  function pushEntry(href) {
    const st = history.state;
    history.pushState({ ssrMore: href, ssrDepth: ours(st) ? (st.ssrDepth | 0) + 1 : 1 }, "", hashURL(href));
  }
  function openURL(href, opts) {
    opts = opts || {};
    if (backWait) return backWait.then(() => openURL(href, opts));
    if (isOpen) {
      if (href === current) { ui.body.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" }); return Promise.resolve(true); }
    } else {
      trigger = opts.trigger || null;
      baseHref = location.href; // 닫혀서 이 주소로 돌아오면 초점을 trigger로 돌려줌
      show();
    }
    if (opts.push !== false) pushEntry(href);
    return render(href);
  }
  function deepLink(slug) {
    const base = guideBase();
    if (!base) return;
    const st = history.state;
    history.replaceState(ours(st) ? null : st, "", plainURL()); // 뒤로 가기가 이 페이지(서랍 닫힘)로 오도록
    openURL(new URL(base + slug + ".html", location.href).href, { trigger: null });
  }

  // ---------------------------------------------------------------- 이벤트
  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!a || a.hasAttribute("download") || a.hasAttribute("data-g-direct")) return;
    const target = (a.getAttribute("target") || "").toLowerCase();
    if (target && target !== "_self") return;
    const inPanel = isOpen && ui.panel.contains(a);
    if (!inPanel && !a.matches("a.more, a[data-more]")) return;
    const u = toURL(a.getAttribute("href"));
    if (!u) return;
    if (inPanel && u.hash.length > 1 && noHash(u) === noHash(location)) { // 서랍 안의 #링크는 서랍 안에서 이동
      const id = decodeURIComponent(u.hash.slice(1));
      const el = [...ui.body.querySelectorAll("[id]")].find((x) => x.id === id);
      if (el) { e.preventDefault(); el.scrollIntoView({ block: "start", behavior: reduceMotion.matches ? "auto" : "smooth" }); }
      return;
    }
    if (!isGuide(u) || (!inPanel && u.pathname === location.pathname)) return;
    e.preventDefault();
    openURL(noHash(u), { trigger: a });
  }
  function onKey(e) {
    if (!isOpen || e.isComposing) return;
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); e.stopPropagation(); requestClose(); return; }
    if (e.key !== "Tab") return;
    const list = [...ui.panel.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    if (!list.length) { e.preventDefault(); ui.panel.focus(); return; }
    const first = list[0], last = list[list.length - 1], cur = d.activeElement;
    const i = list.indexOf(cur);
    if (i === -1) { // 패널 자체나 제목(tabindex=-1)에 초점이 있을 때
      e.preventDefault();
      if (!ui.panel.contains(cur)) { (e.shiftKey ? last : first).focus(); return; }
      const next = e.shiftKey
        ? [...list].reverse().find((el) => cur.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
        : list.find((el) => cur.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      (next || (e.shiftKey ? last : first)).focus();
    } else if (e.shiftKey && i === 0) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); first.focus(); }
  }
  function onFocusIn(e) {
    if (isOpen && !ui.box.contains(e.target)) {
      const h = ui.body.querySelector("h1[tabindex]");
      (h || ui.panel).focus({ preventScroll: true });
    }
  }
  addEventListener("popstate", (e) => {
    const st = e.state;
    if (ours(st)) {
      if (!isOpen) { trigger = null; show(); }
      if (st.ssrMore !== current) render(st.ssrMore);
      return;
    }
    const m = HASH_RE.exec(location.hash);
    if (m) { deepLink(m[1]); return; }
    if (isOpen) hide(location.href === baseHref); // 서랍 안에서 다른 #구역으로 갔으면 초점은 그대로
  });
  addEventListener("hashchange", () => {
    if (isOpen && !HASH_RE.test(location.hash) && !ours(history.state)) hide(location.href === baseHref);
  });
  d.addEventListener("click", onClick);
  d.addEventListener("pointerover", prefetch, { passive: true });
  d.addEventListener("focusin", prefetch);

  window.SSRMore = Object.freeze({
    open(urlOrSlug) {
      const x = String(urlOrSlug || "").trim();
      let href;
      if (/^[A-Za-z0-9_-]+$/.test(x)) href = new URL((guideBase() || SEG) + x + ".html", location.href).href;
      else {
        const u = toURL(x);
        if (!u || u.origin !== location.origin) throw new TypeError("SSRMore.open: a page slug or a same-origin URL is required");
        href = noHash(u);
      }
      const ae = d.activeElement;
      return openURL(href, { trigger: ae && ae !== d.body && !(ui && ui.box.contains(ae)) ? ae : null });
    },
    close() { requestClose(); },
  });

  // 처음 열 때 주소에 #more-<slug>가 있으면 바로 엶 (새로 고침이면 쌓인 기록을 그대로 씀)
  const st0 = history.state, m0 = HASH_RE.exec(location.hash);
  if (m0 && ours(st0)) { show(); render(st0.ssrMore); }
  else if (m0) deepLink(m0[1]);
})();
