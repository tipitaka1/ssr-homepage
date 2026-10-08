#!/usr/bin/env python3
"""상생기록법인 '자세히' 안내 페이지 렌더러 — JSON → 정적 HTML (표준 라이브러리만 사용).

Usage:
  python3 -I render_guides.py --content DIR --out DIR --base /sian/guide/ \
      --assets /sian/ --home /sian/next.html [--noindex] [--site https://www.ss-r.co.kr] [--strict]

  --content  folder of page JSON files (one page per *.json)
  --out      output folder; gets <slug>.html for every page plus index.html (hub)
  --base     URL path of the guide folder (links: {base}{slug}.html)
  --assets   URL path that holds guide.css and guide-drawer.js
  --home     URL of the homepage (brand link, menu anchors, breadcrumb '홈')
  --noindex  preview build: <meta name="robots" content="noindex">, no canonical/og tags
  --site     absolute site origin used for canonical, og:url and JSON-LD
  --strict   treat warnings (missing related page, slug/file-name mismatch…) as errors

Page JSON: {"slug","nav","title","seo_title","description","lead","blocks":[…],"faq":[{"q","a"}],"related":[slug…]}
Block types: h2, p, list, steps, cards, table, kpis, example, note, cta. An unknown type is an error.
Inline markup in any text: **bold**, [[red:…]], [[green:…]], [[blue:…]]; a line break (\n) becomes <br>.
cta.href: mailto:/tel:/http(s): URLs or site paths; a bare page slug ("free-trial") becomes {base}free-trial.html;
          "{base}" and "{home}" at the start are replaced.

All pages are rendered in memory first; if anything fails nothing is written and the exit code is 1.
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

BRAND = "상생기록법인"
MAIL = "ssmd@ss-r.co.kr"
TEL = "02-2694-6962"
TRIAL_MAILTO = ("mailto:ssmd@ss-r.co.kr?subject=%5B%EB%AC%B4%EB%A3%8C%20%EC%8B%9C%ED%97%98"
                "%20%EC%8B%A0%EC%B2%AD%5D%20%EA%B0%95%EC%9D%98%203%ED%8E%B8")  # [무료 시험 신청] 강의 3편
HUB_TITLE = "자세히 알아보기"
HUB_LEAD = "자막을 맡기기 전에 궁금하실 내용을 주제별로 자세히 적었습니다."
HUB_DESC = "강의 자막을 맡기기 전에 궁금하실 내용, 두 가지 자막과 오류율, 단가와 무료 시험, 일하는 방식, 회사를 주제별로 자세히 안내합니다."
GROUPS = [
    ("자막", ["auto-subtitles", "reviewed-subtitles", "error-rate", "math-foreign"]),
    ("맡기기", ["price", "free-trial", "faq"]),
    ("일하는 방식", ["process", "quality", "delivery", "team"]),
    ("회사", ["track-record"]),
]
OTHER_GROUP = "그 밖의 내용"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KPI_COLORS = {"blue", "green", "red"}
ALIGN = {"l": "g-l", "r": "g-r", "c": "g-c"}
URL_SAFE = ":/?#[]@!$&'()*+,;=%~"

_COLOR = re.compile(r"\[\[(red|green|blue):(.+?)\]\]", re.S)
_STRONG = re.compile(r"\*\*(.+?)\*\*", re.S)


class GuideError(Exception):
    """Content or option error; the message says which file and field."""


def esc(s):
    return html.escape(str(s), quote=True)


def inline(text):
    """Escape, then turn the inline markup into HTML."""
    s = esc(text)
    s = _COLOR.sub(lambda m: f'<span class="t-{m.group(1)}">{m.group(2)}</span>', s)
    s = _STRONG.sub(r"<strong>\1</strong>", s)
    return s.replace("\r\n", "\n").replace("\n", "<br>")


def plain(text):
    """Text without markup, whitespace collapsed (for <title>, meta, JSON-LD)."""
    s = _COLOR.sub(r"\2", str(text))
    s = _STRONG.sub(r"\1", s)
    return " ".join(s.split())


def ld_json(obj):
    # ensure_ascii=False keeps Korean readable; "<" (and so "</") is escaped so the
    # text can never close the <script> element or open an HTML comment.
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return s.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


class Ctx:
    def __init__(self, opts, pages, warn):
        self.base, self.assets, self.home = opts.base, opts.assets, opts.home
        self.site, self.noindex = opts.site, opts.noindex
        self.pages, self.warn = pages, warn
        self.slug = None

    def abs(self, path):
        return path if re.match(r"^https?://", path) else self.site + path

    def page_href(self, slug):
        return f"{self.base}{slug}.html"


# ---------------------------------------------------------------- field helpers
def text_of(v, where, allow_empty=False):
    if isinstance(v, bool) or v is None:
        raise GuideError(f"{where}: expected text, got {v!r}")
    if isinstance(v, (int, float)):
        v = str(v)
    if not isinstance(v, str):
        raise GuideError(f"{where}: expected text, got {type(v).__name__}")
    if not allow_empty and not v.strip():
        raise GuideError(f"{where}: empty text")
    return v


def need(obj, key, where):
    if not isinstance(obj, dict):
        raise GuideError(f"{where}: expected an object")
    if key not in obj:
        raise GuideError(f"{where}: missing '{key}'")
    return text_of(obj[key], f"{where}.{key}")


def need_list(obj, key, where, allow_empty=False):
    if not isinstance(obj, dict):
        raise GuideError(f"{where}: expected an object")
    v = obj.get(key)
    if not isinstance(v, list):
        raise GuideError(f"{where}: '{key}' must be a list")
    if not v and not allow_empty:
        raise GuideError(f"{where}: '{key}' is empty")
    return v


def opt_text(obj, key, where):
    v = obj.get(key)
    if v is None or v == "":
        return None
    return text_of(v, f"{where}.{key}")


# ---------------------------------------------------------------- blocks
def b_h2(b, c, w):
    return f"<h2>{inline(need(b, 'text', w))}</h2>"


def b_p(b, c, w):
    return f"<p>{inline(need(b, 'text', w))}</p>"


def b_list(b, c, w):
    items = need_list(b, "items", w)
    lis = "\n".join(f"  <li>{inline(text_of(it, f'{w}.items[{i}]'))}</li>" for i, it in enumerate(items))
    return f'<ul class="g-list">\n{lis}\n</ul>'


def b_steps(b, c, w):
    out = ['<ol class="g-steps">']
    for i, it in enumerate(need_list(b, "items", w)):
        wi = f"{w}.items[{i}]"
        title = need(it, "title", wi)
        human = it.get("human", False)
        if not isinstance(human, bool):
            raise GuideError(f"{wi}.human: must be true or false")
        parts = [f'<span class="g-step-no">{i + 1}</span>', f"<h3>{inline(title)}</h3>"]
        text = opt_text(it, "text", wi)
        if text:
            parts.append(f"<p>{inline(text)}</p>")
        tag = opt_text(it, "tag", wi)
        if tag:
            parts.append(f'<span class="g-tag">{inline(tag)}</span>')
        cls = ' class="human"' if human else ""
        out.append(f"  <li{cls}>{''.join(parts)}</li>")
    out.append("</ol>")
    return "\n".join(out)


def b_cards(b, c, w):
    out = ['<div class="g-cards">']
    for i, it in enumerate(need_list(b, "items", w)):
        wi = f"{w}.items[{i}]"
        inner = f"<h3>{inline(need(it, 'title', wi))}</h3>"
        text = opt_text(it, "text", wi)
        if text:
            inner += f"<p>{inline(text)}</p>"
        out.append(f'  <div class="g-card">{inner}</div>')
    out.append("</div>")
    return "\n".join(out)


def b_table(b, c, w):
    head = [text_of(h, f"{w}.head[{i}]") for i, h in enumerate(need_list(b, "head", w))]
    rows = need_list(b, "rows", w)
    n = len(head)
    align = b.get("align") or []
    if not isinstance(align, list) or any(a not in ALIGN for a in align):
        raise GuideError(f"{w}.align: use a list of 'l', 'r' or 'c'")
    if len(align) > n:
        raise GuideError(f"{w}.align: {len(align)} entries for {n} columns")
    cls = [ALIGN[align[i]] if i < len(align) else "g-l" for i in range(n)]
    caption = opt_text(b, "caption", w)
    label = plain(caption) if caption else "표: " + ", ".join(plain(h) for h in head)
    out = [f'<div class="g-table-wrap" role="region" aria-label="{esc(label)}" tabindex="0">',
           '<table class="g-table">']
    if caption:
        out.append(f"<caption>{inline(caption)}</caption>")
    out.append("<thead><tr>" + "".join(
        f'<th scope="col" class="{cls[i]}">{inline(h)}</th>' for i, h in enumerate(head)) + "</tr></thead>")
    out.append("<tbody>")
    for r, row in enumerate(rows):
        wr = f"{w}.rows[{r}]"
        if not isinstance(row, list) or len(row) != n:
            raise GuideError(f"{wr}: expected a list of {n} cells")
        cells = [inline(text_of(v, f"{wr}[{i}]", allow_empty=True)) for i, v in enumerate(row)]
        tr = f'<th scope="row" class="{cls[0]}">{cells[0]}</th>' + "".join(
            f'<td class="{cls[i]}">{cells[i]}</td>' for i in range(1, n))
        out.append(f"  <tr>{tr}</tr>")
    out.append("</tbody>\n</table>\n</div>")
    return "\n".join(out)


def b_kpis(b, c, w):
    out = ['<ul class="g-kpis">']
    for i, it in enumerate(need_list(b, "items", w)):
        wi = f"{w}.items[{i}]"
        color = it.get("color") or "blue"
        if color not in KPI_COLORS:
            raise GuideError(f"{wi}.color: {color!r} (use blue, green or red)")
        inner = f"<b>{inline(need(it, 'num', wi))}</b><span>{inline(need(it, 'label', wi))}</span>"
        sub = opt_text(it, "sub", wi)
        if sub:
            inner += f"<small>{inline(sub)}</small>"
        out.append(f'  <li class="{color}">{inner}</li>')
    out.append("</ul>")
    return "\n".join(out)


def b_example(b, c, w):
    out = ['<div class="g-example">']
    for i, row in enumerate(need_list(b, "rows", w)):
        wr = f"{w}.rows[{i}]"
        if not isinstance(row, list) or len(row) != 2:
            raise GuideError(f"{wr}: expected [label, text]")
        out.append(f"  <p><b>{inline(text_of(row[0], wr + '[0]'))}</b>"
                   f"<span>{inline(text_of(row[1], wr + '[1]'))}</span></p>")
    out.append("</div>")
    return "\n".join(out)


def b_note(b, c, w):
    return f'<p class="g-note">{inline(need(b, "text", w))}</p>'


def resolve_href(raw, c, where):
    h = raw.strip()
    guide = False
    if SLUG_RE.match(h):
        if h not in c.pages:
            c.warn(f"{where}: page '{h}' has no JSON yet; linking {c.page_href(h)} anyway")
        h, guide = c.page_href(h), True
    elif h.startswith("{base}"):
        h, guide = c.base + h[len("{base}"):], True
    elif h.startswith("{home}"):
        h = c.home + h[len("{home}"):]
    m = re.match(r"^([A-Za-z][A-Za-z0-9+.-]*):", h)
    if m and m.group(1).lower() not in ("mailto", "tel", "http", "https"):
        raise GuideError(f"{where}: link scheme '{m.group(1)}:' is not allowed")
    if not m and not h.startswith(("/", "#")):
        raise GuideError(f"{where}: use a full URL, a site path starting with '/', or a page slug (got {raw!r})")
    return quote(h, safe=URL_SAFE), guide


def b_cta(b, c, w):
    href, guide = resolve_href(need(b, "href", w), c, f"{w}.href")
    cls = "btn btn-green more" if guide else "btn btn-green"
    return (f'<div class="g-cta"><p>{inline(need(b, "text", w))}</p>'
            f'<a class="{cls}" href="{esc(href)}">{inline(need(b, "button", w))}</a></div>')


BLOCKS = {"h2": b_h2, "p": b_p, "list": b_list, "steps": b_steps, "cards": b_cards, "table": b_table,
          "kpis": b_kpis, "example": b_example, "note": b_note, "cta": b_cta}


def render_block(b, c, w):
    if not isinstance(b, dict):
        raise GuideError(f"{w}: expected an object")
    fn = BLOCKS.get(b.get("type"))
    if fn is None:
        raise GuideError(f"{w}: unknown block type {b.get('type')!r} (known: {', '.join(BLOCKS)})")
    return fn(b, c, w)


# ---------------------------------------------------------------- page parts
def head_html(c, *, title, description, url, ld):
    out = ["<!doctype html>", '<html lang="ko">', "<head>", '<meta charset="utf-8">',
           '<meta name="viewport" content="width=device-width, initial-scale=1">',
           f"<title>{esc(title)}</title>",
           f'<meta name="description" content="{esc(description)}">']
    if c.noindex:
        out.append('<meta name="robots" content="noindex">')
    else:
        out += [f'<link rel="canonical" href="{esc(url)}">',
                '<meta property="og:type" content="website">',
                f'<meta property="og:url" content="{esc(url)}">',
                f'<meta property="og:site_name" content="{BRAND}">',
                f'<meta property="og:title" content="{esc(title)}">',
                f'<meta property="og:description" content="{esc(description)}">',
                f'<meta property="og:image" content="{esc(c.site)}/og.png">',
                '<meta property="og:image:width" content="1200">',
                '<meta property="og:image:height" content="630">',
                '<meta property="og:locale" content="ko_KR">',
                '<meta name="twitter:card" content="summary_large_image">']
    out += ['<meta name="theme-color" content="#054c7e">',
            '<link rel="icon" href="/logo-mark.svg" type="image/svg+xml">',
            '<link rel="icon" href="/favicon.ico" sizes="32x32">',
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
            '<link rel="stylesheet" href="/site.css">',
            f'<link rel="stylesheet" href="{esc(c.assets)}guide.css">',
            f'<script defer src="{esc(c.assets)}guide-drawer.js"></script>']
    out += [f'<script type="application/ld+json">{ld_json(obj)}</script>' for obj in ld]
    out.append("</head>")
    return "\n".join(out)


def header_html(c):
    h = esc(c.home)
    return f"""<a class="skip" href="#main">본문으로 건너뛰기</a>

<header class="site-head">
  <div class="wrap head-row">
    <a class="brand" href="{h}" aria-label="{BRAND} 첫 화면">
      <img src="/logo-mark.svg" alt="" width="34" height="34">
      <span>{BRAND}</span>
    </a>
    <nav aria-label="주요 메뉴">
      <ul class="menu">
        <li><a href="{h}#service">두 가지 자막</a></li>
        <li><a href="{h}#trial">무료 시험</a></li>
        <li><a href="{h}#price">단가</a></li>
        <li><a href="{h}#process">일하는 방식</a></li>
        <li><a href="{h}#clients">거래처</a></li>
        <li><a href="{h}#about">회사</a></li>
        <li class="menu-cta"><a class="btn btn-primary" href="{h}#contact">문의</a></li>
      </ul>
    </nav>
  </div>
</header>"""


FOOTER = f"""<footer class="site-foot">
  <div class="wrap">
    <p class="foot-brand"><img src="/logo-mark.svg" alt="" width="28" height="28">㈜{BRAND}</p>
    <p>대표이사 이승재<span class="gap"></span>사업자등록번호 837-86-03311</p>
    <p>서울특별시 서초구 효령로25길 28, 2층 11호 (방배동, 이레힐)</p>
    <p><a href="mailto:{MAIL}">{MAIL}</a><span class="gap"></span><a href="tel:{TEL}">{TEL}</a></p>
    <p class="copy">© {BRAND}</p>
  </div>
</footer>"""


def crumb_html(c, current):
    items = [f'<li><a href="{esc(c.home)}">홈</a></li>']
    if current is None:
        items.append(f'<li aria-current="page">{HUB_TITLE}</li>')
    else:
        items.append(f'<li><a href="{esc(c.base)}index.html">{HUB_TITLE}</a></li>')
        items.append(f'<li aria-current="page">{inline(current)}</li>')
    return f'<nav class="g-crumb" aria-label="현재 위치"><ol>{"".join(items)}</ol></nav>'


def band_html(c, slug):
    if slug == "free-trial":
        btn = f'<a class="btn btn-green" href="{TRIAL_MAILTO}">메일로 무료 시험 신청하기</a>'
    elif "free-trial" in c.pages:
        btn = f'<a class="btn btn-green more" href="{esc(c.page_href("free-trial"))}">무료 시험 알아보기</a>'
    else:
        btn = f'<a class="btn btn-green" href="{esc(c.home)}#trial">무료 시험 알아보기</a>'
    return f"""<section class="g-band" aria-labelledby="g-band-title">
  <div class="wrap g-band-in">
    <div class="g-band-copy">
      <p class="g-band-eyebrow"><span class="g-badge-free">무료</span>처음 맡기시는 기관·회사</p>
      <h2 id="g-band-title">강의 3편, 무료로 먼저 맡겨 보세요</h2>
    </div>
    <div class="g-band-act">
      {btn}
      <p class="g-band-contact">메일 <a href="{TRIAL_MAILTO}">{MAIL}</a><span aria-hidden="true"> · </span>전화 <a href="tel:{TEL}">{TEL}</a></p>
    </div>
  </div>
</section>"""


def breadcrumb_ld(c, trail):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i, "name": name, "item": url}
                                 for i, (name, url) in enumerate(trail, 1)]}


def webpage_ld(c, kind, name, description, url):
    return {"@context": "https://schema.org", "@type": kind, "name": name, "description": description,
            "url": url, "inLanguage": "ko-KR", "isPartOf": {"@id": c.site + "/#website"},
            "publisher": {"@id": c.site + "/#org"}}


def document(c, *, title, description, url, ld, crumb, article, slug):
    return "\n".join([
        head_html(c, title=title, description=description, url=url, ld=ld),
        '<body class="g-page">',
        header_html(c),
        "",
        '<main id="main" class="g-main">',
        '<div class="wrap g-wrap">',
        crumb,
        article,
        "</div>",
        "",
        band_html(c, slug),
        "</main>",
        "",
        FOOTER,
        "</body>",
        "</html>",
        "",
    ])


def page_title(seo_title):
    t = plain(seo_title)
    return t if t.endswith(BRAND) else f"{t} | {BRAND}"


# ---------------------------------------------------------------- pages
def validate_page(p, src):
    for k in ("slug", "nav", "title", "seo_title", "description", "lead"):
        need(p, k, src)
    if not SLUG_RE.match(p["slug"]):
        raise GuideError(f"{src}.slug: {p['slug']!r} — use lowercase letters, digits and '-'")
    if p["slug"] == "index":
        raise GuideError(f"{src}.slug: 'index' is reserved for the hub page")
    need_list(p, "blocks", src, allow_empty=True)
    for key in ("faq", "related"):
        if p.get(key) is not None and not isinstance(p[key], list):
            raise GuideError(f"{src}.{key}: must be a list")


def render_page(p, c, src):
    slug = p["slug"]
    c.slug = slug
    url = c.site + c.page_href(slug)
    body = [f'<article class="guide" data-slug="{slug}" aria-labelledby="g-title-{slug}">',
            f'<h1 id="g-title-{slug}">{inline(p["title"])}</h1>',
            f'<p class="g-lead">{inline(p["lead"])}</p>']
    if not p["blocks"]:
        c.warn(f"{src}: no blocks")
    for i, b in enumerate(p["blocks"]):
        body.append(render_block(b, c, f"{src}.blocks[{i}]"))

    faq = []
    for i, qa in enumerate(p.get("faq") or []):
        w = f"{src}.faq[{i}]"
        faq.append((need(qa, "q", w), need(qa, "a", w)))
    if faq:
        body.append(f'<section class="g-faq" aria-labelledby="g-faq-{slug}">')
        body.append(f'<h2 id="g-faq-{slug}">자주 묻는 질문</h2>')
        for i, (q, a) in enumerate(faq):
            paras = "".join(f"<p>{inline(t.strip())}</p>" for t in re.split(r"\n\s*\n", a) if t.strip())
            body.append(f'<details{" open" if i == 0 else ""}><summary>{inline(q)}</summary>{paras}</details>')
        body.append("</section>")

    links, seen = [], set()
    for i, rel in enumerate(p.get("related") or []):
        w = f"{src}.related[{i}]"
        rel = text_of(rel, w).strip()
        if rel == slug or rel in seen:
            c.warn(f"{w}: '{rel}' is the page itself or repeated; skipped")
            continue
        seen.add(rel)
        if rel not in c.pages:
            c.warn(f"{w}: no JSON for '{rel}'; link skipped")
            continue
        links.append(f'  <li><a class="more" href="{esc(c.page_href(rel))}">{inline(c.pages[rel]["nav"])}</a></li>')
    if links:
        body.append(f'<nav class="g-related" aria-labelledby="g-rel-{slug}">')
        body.append(f'<h2 id="g-rel-{slug}">함께 보면 좋은 내용</h2>')
        body.append("<ul>\n" + "\n".join(links) + "\n</ul>")
        body.append("</nav>")
    body.append("</article>")

    description = plain(p["description"])
    ld = [breadcrumb_ld(c, [("홈", c.abs(c.home)), (HUB_TITLE, c.site + c.base),
                            (plain(p["nav"]), url)]),
          webpage_ld(c, "WebPage", plain(p["title"]), description, url)]
    if faq:
        ld.append({"@context": "https://schema.org", "@type": "FAQPage",
                   "mainEntity": [{"@type": "Question", "name": plain(q),
                                   "acceptedAnswer": {"@type": "Answer", "text": plain(a)}} for q, a in faq]})
    return document(c, title=page_title(p["seo_title"]), description=description, url=url, ld=ld,
                    crumb=crumb_html(c, p["nav"]), article="\n".join(body), slug=slug)


def render_hub(c):
    c.slug = "index"
    url = c.site + c.base  # canonical hub URL = folder (matches sitemap.xml)
    used, groups = set(), []
    for name, slugs in GROUPS:
        used.update(slugs)
        items = [c.pages[s] for s in slugs if s in c.pages]
        if items:
            groups.append((name, items))
    rest = [c.pages[s] for s in sorted(c.pages) if s not in used]
    if rest:
        groups.append((OTHER_GROUP, rest))
    body = ['<article class="guide g-hub" data-slug="index" aria-labelledby="g-title-index">',
            f'<h1 id="g-title-index">{HUB_TITLE}</h1>',
            f'<p class="g-lead">{HUB_LEAD}</p>']
    for gi, (name, items) in enumerate(groups, 1):
        body.append(f'<section class="g-group" aria-labelledby="g-group-{gi}">')
        body.append(f'<h2 id="g-group-{gi}">{esc(name)}</h2>')
        body.append('<ul class="g-hub-list">')
        for p in items:
            body.append(f'  <li><a class="g-hub-card" href="{esc(c.page_href(p["slug"]))}">'
                        f'<b>{inline(p["nav"])}</b><span>{esc(plain(p["description"]))}</span></a></li>')
        body.append("</ul>\n</section>")
    body.append("</article>")
    ld = [breadcrumb_ld(c, [("홈", c.abs(c.home)), (HUB_TITLE, url)]),
          webpage_ld(c, "CollectionPage", HUB_TITLE, HUB_DESC, url)]
    return document(c, title=f"{HUB_TITLE} | {BRAND}", description=HUB_DESC, url=url, ld=ld,
                    crumb=crumb_html(c, None), article="\n".join(body), slug="index")


# ---------------------------------------------------------------- CLI
def norm_dir(v, name):
    if not v.startswith("/"):
        raise GuideError(f"--{name} must be a site path starting with '/' (got {v!r})")
    return v if v.endswith("/") else v + "/"


def build(opts):
    warnings = []

    def warn(msg):
        warnings.append(msg)
        print(f"WARNING: {msg}", file=sys.stderr)

    content = Path(opts.content)
    files = sorted(content.glob("*.json"))
    if not files:
        raise GuideError(f"no *.json files in {content}")
    pages, sources = {}, {}
    for f in files:
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise GuideError(f"{f.name}: invalid JSON — {e}") from None
        validate_page(p, f.name)
        slug = p["slug"]
        if slug in pages:
            raise GuideError(f"{f.name}: slug '{slug}' already used by {sources[slug]}")
        if f.stem != slug:
            warn(f"{f.name}: file name differs from slug '{slug}' (writes {slug}.html)")
        pages[slug], sources[slug] = p, f.name

    c = Ctx(opts, pages, warn)
    out = {f"{slug}.html": render_page(p, c, sources[slug]) for slug, p in pages.items()}
    out["index.html"] = render_hub(c)
    leftovers = [name for name, doc in out.items() if "[[" in doc]
    for name in leftovers:
        warn(f"{name}: unconverted '[[' markup (only red, green, blue are known)")
    if opts.strict and warnings:
        raise GuideError(f"{len(warnings)} warning(s) with --strict; nothing written")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Render '자세히' guide pages from JSON to static HTML.")
    ap.add_argument("--content", required=True, help="folder with page JSON files")
    ap.add_argument("--out", required=True, help="output folder")
    ap.add_argument("--base", required=True, help="URL path of the guide folder, e.g. /sian/guide/")
    ap.add_argument("--assets", required=True, help="URL path holding guide.css and guide-drawer.js, e.g. /sian/")
    ap.add_argument("--home", required=True, help="homepage URL, e.g. /sian/next.html")
    ap.add_argument("--site", default="https://www.ss-r.co.kr", help="site origin for canonical/og/JSON-LD")
    ap.add_argument("--noindex", action="store_true", help="preview build: robots noindex, no canonical/og")
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    opts = ap.parse_args(argv)
    try:
        opts.base = norm_dir(opts.base, "base")
        opts.assets = norm_dir(opts.assets, "assets")
        if not (opts.home.startswith("/") or re.match(r"^https?://", opts.home)):
            raise GuideError(f"--home must start with '/' or http(s):// (got {opts.home!r})")
        if not re.match(r"^https?://[^/]+$", opts.site.rstrip("/")):
            raise GuideError(f"--site must be an origin like https://www.ss-r.co.kr (got {opts.site!r})")
        opts.site = opts.site.rstrip("/")
        docs = build(opts)
    except GuideError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    out_dir = Path(opts.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, doc in docs.items():
        (out_dir / name).write_text(doc, encoding="utf-8", newline="\n")
    print(f"rendered {len(docs) - 1} page(s) + index.html -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
