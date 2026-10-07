# '자세히' 페이지 만들기 (tools/guide)

홈페이지의 '… 자세히' 페이지 12개와 모음 페이지(/guide/)는 이 폴더의 JSON을 `render_guides.py`가 정적 HTML로 바꿔 만든다. 표준 라이브러리만 쓴다(Python 3.8 이상).

- `content/<slug>.json` — 페이지 내용 (slug, nav, title, seo_title, description, lead, blocks, faq, related). 글에는 `**굵게**`, `[[red:…]]`, `[[green:…]]`, `[[blue:…]]`만 쓴다.
- `render_guides.py` — 만드는 프로그램. 쓰는 법은 `python3 render_guides.py --help`.

## 본 페이지(/guide/) 다시 만들기

저장소 맨 위 폴더에서:

```
python3 -I tools/guide/render_guides.py --content tools/guide/content --out guide --base /guide/ --assets / --home / --strict
```

- `--assets /` → 페이지가 `/site.css`, `/guide.css`, `/guide-drawer.js`를 읽는다.
- `--noindex`를 붙이지 않으므로 canonical·og·JSON-LD(BreadcrumbList·WebPage·FAQPage)가 들어간다. 모음 페이지의 canonical은 `https://www.ss-r.co.kr/guide/`.
- `--strict` → 경고(없는 관련 페이지, 파일 이름과 slug 불일치 등)도 오류로 멈춘다.
- 페이지를 더하거나 빼면 `sitemap.xml`의 /guide/ 주소도 고친다.

## 미리보기(/sian/guide/)로 만들기

```
python3 -I tools/guide/render_guides.py --content tools/guide/content --out sian/guide --base /sian/guide/ --assets /sian/ --home /sian/next.html --noindex --strict
```

이 폴더(/tools/)와 /sian/은 robots.txt에서 검색 제외다.
