# -*- coding: utf-8 -*-
"""홈페이지 「품질」 메뉴(/quality/) — 오류율 측정 기준 + 두 가지 자막의 오류율 + 100개 언어 자동 자막 등급표 + 품질을 지키는 방법.
등급표 재료는 같은 폴더의 lang_grades.json(언어 코드·이름·등급·오류율 — 서브웍스 엔진 01~04 가운데 그 언어에 가장 좋은 값, 엔진 이름은 넣지 않음 · 11/5 14:3x 안평식 「서브웍스 실제 엔진 값」). 서브웍스 현관 /api/lang_grades 의 sw(83개 언어) + 6220b 의 10/29 값(17개 언어)에서 뽑아 넣는다.
글을 고칠 때는 이 파일을 고치고 저장소 루트에서 `python3 tools/quality/render_quality.py`. 머리·바닥은 자세히 페이지와 같은 꼴. 2026-11-05 1판(안평식 12:50 ④ 「품질」 메뉴)."""
import html
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = "https://www.ss-r.co.kr"
BRAND = "상생기록법인"
URL = SITE + "/quality/"
TITLE = "품질"
DESC = "자막 오류율 측정 기준, 자동 자막 오류율 약 3%(2026-2학기 실제 강의 3,330편 실측)·사람이 검수한 자막 약 0.3%, 100개 언어 자동 자막 등급표(언어별 측정 오류율, A·B·C·F)와 품질을 지키는 방법."
MAJOR = {"ko": "기준 단가 안내 언어", "en": "기준 단가 안내 언어", "zh": "기준 단가 안내 언어", "ja": "기준 단가 안내 언어"}
MAJOR_ORDER = ["ko", "en", "zh", "ja"]
GRADES = [
    ("A", "측정 오류율 5% 이하", "자동 자막을 바로 초안으로 쓸 수 있는 수준입니다. 사람이 검수하면 납품 품질이 됩니다."),
    ("B", "5% 초과 ~ 10%", "자동 자막을 초안으로 쓸 수 있지만 검수에 시간이 더 듭니다."),
    ("C", "10% 초과 ~ 20%", "자동 자막만으로는 어렵습니다. 사람 검수·받아쓰기를 전제로 협의합니다."),
    ("F", "20% 초과", "자동 자막을 드리지 않습니다. 사람 받아쓰기로 협의합니다."),
]


def esc(s):
    return html.escape(s, quote=True)


HEAD = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — 오류율 측정 기준과 100개 언어 등급표 | {brand}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:site_name" content="{brand}">
<meta property="og:title" content="{title} — 오류율 측정 기준과 100개 언어 등급표 | {brand}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{site}/og.png">
<meta property="og:locale" content="ko_KR">
<meta name="theme-color" content="#054c7e">
<link rel="icon" href="/logo-mark.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/site.css?v=20261105b">
<link rel="stylesheet" href="/guide.css?v=20261105d">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"홈","item":"{site}/"}},{{"@type":"ListItem","position":2,"name":"{title}","item":"{url}"}}]}}</script>
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"WebPage","name":"{title} — 오류율 측정 기준과 100개 언어 등급표","url":"{url}","description":"{desc}","inLanguage":"ko","isPartOf":{{"@type":"WebSite","name":"{brand}","url":"{site}/"}}}}</script>
</head>
<body class="g-page">
<a class="skip" href="#main">본문으로 건너뛰기</a>

<header class="site-head">
  <div class="wrap head-row">
    <a class="brand" href="/" aria-label="상생기록법인 첫 화면">
      <img src="/logo-mark.svg" alt="" width="34" height="34">
      <span>상생기록법인</span>
    </a>
    <nav aria-label="주요 메뉴">
      <ul class="menu">
        <li><a href="/#service">두 가지 자막</a></li>
        <li><a href="/#trial">무료 시범 제작</a></li>
        <li><a href="/#price">단가</a></li>
        <li><a href="/quality/" aria-current="page">품질</a></li>
        <li><a href="/#process">일하는 방식</a></li>
        <li><a href="/#clients">거래처</a></li>
        <li><a href="/#about">회사</a></li>
        <li class="menu-cta"><a class="btn btn-primary" href="/#contact">문의</a></li>
      </ul>
    </nav>
  </div>
</header>

<main id="main" class="g-main">
<div class="wrap g-wrap">
<nav class="g-crumb" aria-label="현재 위치"><ol><li><a href="/">홈</a></li><li aria-current="page">{title}</li></ol></nav>
<article class="guide quality" aria-labelledby="g-title">
<h1 id="g-title">품질 — 숫자로 말합니다</h1>
<p class="g-lead">자동 자막의 오류율을 숨기지 않고, 측정 기준을 공개하고, 언어마다 자동 자막이 어느 수준인지 등급으로 보여 드립니다. 중요한 용도는 사람이 검수한 자막을 권합니다.</p>
"""

FOOT = """
</article>
</div>
</main>

<footer class="site-foot">
  <div class="wrap">
    <p class="foot-brand"><img src="/logo-mark.svg" alt="" width="28" height="28">㈜상생기록법인</p>
    <p>대표이사 이승재<span class="gap"></span>사업자등록번호 837-86-03311</p>
    <p>서울특별시 서초구 효령로25길 28, 2층 11호 (방배동, 이레힐)</p>
    <p><a href="mailto:ssmd@ss-r.co.kr">ssmd@ss-r.co.kr</a><span class="gap"></span><a href="tel:02-2694-6962">02-2694-6962</a></p>
    <p class="foot-legal"><a href="/terms/">이용약관</a><span class="gap"></span><a href="/privacy/"><b>개인정보 처리방침</b></a><span class="gap"></span><a href="/data/">데이터 처리 안내</a></p>
    <p class="copy">© 상생기록법인</p>
  </div>
</footer>
</body>
</html>
"""


CNT = {}


def kpis():
    items = [("약 3%", "자동 자막 오류율", "정확도 약 97% · 2026-2학기 실제 강의 3,330편 · 1,381시간 실측", "blue"),
             ("약 0.3%", "사람이 검수한 자막 오류율", "정확도 약 99.7% · 1,000글자 중 약 3글자 수정이 필요합니다", "green"),
             ("100개 언어", "자동 자막 등급표", f"A {CNT.get('A', 0)} · B {CNT.get('B', 0)} · C {CNT.get('C', 0)} · F {CNT.get('F', 0)} — 2026-11-05 측정", "blue")]
    return '<ul class="g-kpis">' + "".join(f'<li class="{c}"><b>{esc(n)}</b><span>{esc(l)}</span><small>{esc(s)}</small></li>' for n, l, s, c in items) + "</ul>"


def grade_table(data):
    rows = data["rows"]
    cnt = data["count"]
    out = ['<div class="q-legend">']
    for g, band, meaning in GRADES:
        out.append(f'<div class="q-leg"><span class="q-grade q-{g}">{g}</span><div><b>{esc(band)}</b><p>{esc(meaning)}</p></div></div>')
    out.append("</div>")
    for g, band, _ in GRADES:
        langs = [r for r in rows if r["grade"] == g]
        chips = []
        for r in sorted(langs, key=lambda r: (MAJOR_ORDER.index(r["code"]) if r["code"] in MAJOR_ORDER else 9, r["name"])):   # 한국어·영어·중국어·일본어 먼저
            star = ' <i class="q-major" title="기준 단가 안내 언어">★</i>' if r["code"] in MAJOR else ""
            er = r.get("er")
            ers = "" if er is None else ("0.1% 미만" if er < 0.001 else f"{er * 100:.1f}%")
            dag = '<sup title="60초 시료">†</sup>' if r.get("basis") == "60s" else ""
            chips.append(f'<li><span class="q-grade q-{g} q-sm">{g}</span><span class="q-nm">{esc(r["name"])}{star}</span><small class="q-er" title="이 언어의 측정 오류율(글자, 띄어쓰기·문장부호 제외)">{esc(ers)}{dag}</small><small class="q-cd">{esc(r["code"])}</small></li>')
        out.append(f'<h3 class="q-h3"><span class="q-grade q-{g}">{g}</span> {esc(band)} <span class="q-n">{cnt.get(g, len(langs))}개 언어</span></h3>')
        out.append('<ul class="q-langs">' + "".join(chips) + "</ul>")
    return "\n".join(out)


def body(data):
    return "\n".join([
        kpis(),
        '<p class="g-note">※ 자체 측정값입니다. 강의 주제·발음·음질에 따라 달라집니다. 오류율의 정의와 측정 원칙은 아래와 같습니다.</p>',

        '<h2 id="measure">오류율은 이렇게 측정합니다</h2>',
        '<div class="g-cards"><div class="g-card"><h3>오류율</h3><p>사람이 고친 글자 수 ÷ 자동 자막 글자 수</p></div><div class="g-card"><h3>정확도</h3><p>100% − 오류율</p></div></div>',
        '<ul class="g-list">'
        '<li>사람이 수정·삭제·삽입한 글자는 이유를 가리지 않고 모두 오류로 측정합니다. 띄어쓰기와 문장부호도 한 글자입니다.</li>'
        '<li>여러 강의를 합칠 때는 비율 평균이 아니라 고친 글자 합계 ÷ 자동 자막 글자 합계입니다.</li>'
        '<li>줄나눔과 싱크는 글자가 아니므로 따로 확인합니다.</li>'
        '<li>사람이 검수한 자막은 검수 완료본을 다른 검수자가 재확인해 측정합니다.</li>'
        '</ul>',
        '<p><a class="more" href="/guide/error-rate.html">측정 예시와 원칙 자세히</a> <a class="more" href="/report-sample.html">무료 시범 제작의 오류 분석 리포트 예시</a></p>',

        '<h2 id="grades">100개 언어 자동 자막 등급표</h2>',
        '<p>언어마다 자동 자막이 어느 수준인지 네 등급으로 나눴습니다. 등급과 옆의 작은 숫자는 <strong>상생기록법인이 실제로 쓰는 음성 인식 엔진으로 잰 값</strong>이라, 맡기시면 같은 수준이 나옵니다. 사람이 검수한 자막은 언어마다 검수자 확보에 따라 협의합니다. ★ 표시는 기준 단가를 안내하는 언어(한국어·영어·중국어·일본어)입니다.</p>',
        grade_table(data),
        '<p class="g-note">※ 측정 방법 — 언어마다 공개 평가 자료(FLEURS)의 읽은 문장 60개(3편)를 상생기록법인이 쓰는 음성 인식 엔진 4개로 받아써, '
        '<strong>그 언어에 가장 좋은 엔진의 글자 오류율</strong>로 등급을 매겼습니다(2026-11-05). † 표시 17개 언어는 FLEURS 에 없어 다른 공개 자료 60초 시료로 잰 값입니다(2026-10-29). '
        '등급표의 숫자는 띄어쓰기·문장부호를 뺀 글자 오류율이라, 위 강의 오류율(띄어쓰기·문장부호 포함)과 셈법이 다릅니다. '
        '실제 강의는 전문 용어·잡음·긴 발화 때문에 읽은 문장보다 높게 나올 수 있습니다(한국어 실제 강의 약 3%). 엔진이 바뀌면 다시 재서 올립니다.</p>',

        '<h2 id="keep">품질을 지키는 방법</h2>',
        '<ol class="g-steps">'
        '<li><span class="g-step-no">1</span><h3>자동 자막은 엔진을 언어별로 고릅니다</h3><p>언어마다 등급표의 근거가 된 측정으로 가장 알맞은 음성 인식 엔진과 싱크 방식을 정해 둡니다.</p></li>'
        '<li class="human"><span class="g-step-no">2</span><h3>사람이 검수합니다</h3><p>15년 경력의 관리자와 숙련 검수자가 말투는 살리고 틀린 것만 고칩니다. 수식·외국어·전문 용어는 기관 지침대로 표기합니다.</p></li>'
        '<li class="human"><span class="g-step-no">3</span><h3>관리자가 다시 확인합니다</h3><p>검수 완료본을 관리자가 포맷·규격·누락을 확인한 뒤 납품합니다.</p></li>'
        '<li><span class="g-step-no">4</span><h3>숫자로 보고합니다</h3><p>무료 시범 제작에서는 강의별 오류율과 오류 유형을 담은 오류 분석 리포트를 드립니다. 계약 뒤에도 같은 기준으로 측정합니다.</p></li>'
        '</ol>',
        '<p><a class="more" href="/guide/quality.html">품질 관리 자세히</a> <a class="more" href="/guide/process.html">제작 공정</a></p>',

        '<h2 id="try">내 강의로 직접 확인하세요</h2>',
        '<div class="g-cards">'
        '<div class="g-card"><h3>자동 자막 체험</h3><p>영상 앞 5분을 지금 바로. 소리만 보내고 24시간 안에 지웁니다.</p><p style="margin-top:8px"><a class="btn btn-line" href="/try.html">체험하기</a></p></div>'
        '<div class="g-card"><h3>강의 3편 무료 시범 제작</h3><p>사람이 검수한 자막과 오류 분석 리포트를 받아 보고 결정하세요.</p><p style="margin-top:8px"><a class="btn btn-primary" href="/guide/free-trial.html">조건 보기</a></p></div>'
        '</div>',

        '<section class="g-faq" aria-labelledby="faq-title"><h2 id="faq-title">자주 묻는 질문</h2>'
        '<details><summary>등급이 A 면 검수 없이 써도 되나요?</summary><p>초안으로는 바로 쓸 수 있습니다. 다만 강의 자막처럼 틀리면 안 되는 용도는 사람 검수를 권합니다. A 등급 한국어도 실제 강의에서는 1,000글자 중 약 30글자 수정이 필요합니다.</p></details>'
        '<details><summary>등급표의 한국어 숫자와 위의 「약 3%」는 왜 다른가요?</summary><p>등급표는 공개 평가 자료의 또렷하게 읽은 문장을 띄어쓰기·문장부호를 빼고 잰 값이고, 위 3%는 2026-2학기 실제 강의 3,330편을 띄어쓰기·문장부호까지 넣어 잰 값입니다. 강의를 맡기실 때의 기대치는 실제 강의 값(약 3%)으로 보시면 됩니다.</p></details>'
        '<details><summary>표에 없는 언어는요?</summary><p>표는 자동 자막이 가능한 100개 언어입니다. 그 밖의 언어는 사람 받아쓰기로 협의합니다.</p></details>'
        '<details><summary>우리 기관 강의의 오류율을 미리 알 수 있나요?</summary><p>강의 3편 무료 시범 제작의 오류 분석 리포트에서 같은 기준으로 측정한 강의별 오류율을 드립니다.</p></details>'
        '</section>',

        '<nav class="g-related" aria-label="함께 볼 페이지"><h2>함께 볼 페이지</h2><ul>'
        '<li><a class="more" href="/guide/error-rate.html">오류율 측정 기준</a></li><li><a class="more" href="/guide/auto-subtitles.html">자동 자막</a></li>'
        '<li><a class="more" href="/guide/reviewed-subtitles.html">사람이 검수한 자막</a></li><li><a class="more" href="/guide/math-foreign.html">수식·외국어</a></li>'
        '<li><a class="more" href="/guide/quality.html">품질 관리</a></li><li><a class="more" href="/data/">데이터 처리 안내</a></li>'
        '</ul></nav>',
    ])


def render():
    data = json.load(open(os.path.join(HERE, "lang_grades.json"), encoding="utf-8"))
    assert len(data["rows"]) == 100, len(data["rows"])
    CNT.clear()
    CNT.update(data["count"])
    page = HEAD.format(title=TITLE, brand=BRAND, desc=esc(DESC), url=URL, site=SITE) + body(data) + FOOT
    d = os.path.join(ROOT, "quality")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(page)
    print("quality/index.html", len(page), "자 · 언어", len(data["rows"]), data["count"])


if __name__ == "__main__":
    render()
