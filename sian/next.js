/* 홈페이지 다음 판 — 움직임 (움직임 줄이기 설정을 켠 사람에게는 정지 화면) */
(() => {
  const d = document;
  d.documentElement.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 머리 띠 그림자
  const head = d.querySelector(".site-head");
  const onScroll = () => head && head.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // 화면에 들어오면 나타나기
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  d.querySelectorAll(".reveal, .steps").forEach((el) => io.observe(el));

  // 숫자 세며 올라가기
  const fmt = (v, dec) => dec ? v.toFixed(dec) : Math.round(v).toLocaleString("ko-KR");
  const cio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const el = e.target, to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    if (reduce) { el.textContent = fmt(to, dec); return; }
    const t0 = performance.now(), dur = 1400;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e3 = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(to * e3, dec);
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = fmt(0, dec);
    requestAnimationFrame(step);
  }), { threshold: 0.6 });
  d.querySelectorAll("[data-count]").forEach((el) => cio.observe(el));

  // 강의 화면: 마우스를 따라 살짝 기울어지고 빛이 따라옴 (PC)
  const lec = d.querySelector(".lecture"), tilt = d.querySelector(".tilt"), scr = d.querySelector(".screen");
  if (lec && tilt && !reduce && matchMedia("(pointer: fine)").matches) {
    lec.addEventListener("pointermove", (e) => {
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      tilt.style.setProperty("--ry", ((x - 0.5) * 10).toFixed(2) + "deg");
      tilt.style.setProperty("--rx", ((0.5 - y) * 8).toFixed(2) + "deg");
      scr.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
      scr.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
    });
    lec.addEventListener("pointerleave", () => {
      tilt.style.setProperty("--rx", "0deg"); tilt.style.setProperty("--ry", "0deg");
    });
  }

  // 자막 시연: 자동 자막이 뜨고 → 틀린 곳 빨강 → 검수자가 고쳐 초록
  const cap = d.querySelector(".caption"), status = d.querySelector(".status"), bar = d.querySelector(".playbar span");
  if (!cap || !status || reduce) return;
  const LINES = [
    ["오늘은 미분의 ", "정이", "정의", "를 살펴보겠습니다"],
    ["h가 0으로 갈 때 평균 ", "변화률", "변화율", "의 극한입니다"],
    ["이것을 ", "에프 프라임 에이", "f′(a)", "로 씁니다"],
  ];
  const LABEL = { auto: "자동 자막", err: "틀린 곳 발견", ok: "검수 완료" };
  const setStatus = (s) => { status.dataset.state = s; status.textContent = LABEL[s]; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let visible = false, running = false, progress = 30;
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible && !running) loop();
  }, { threshold: 0.2 }).observe(scr);
  const waitVisible = async () => { while (!visible || d.hidden) await sleep(300); };

  async function loop() {
    running = true;
    await sleep(1200); // 처음에는 정지 화면(검수 완료)을 잠깐 보여 줌
    for (let i = 0; ; i++) {
      await waitVisible();
      const [pre, bad, good, post] = LINES[i % LINES.length];
      cap.classList.add("out"); await sleep(380);
      const a = d.createElement("span"), tok = d.createElement("span"), b = d.createElement("span"), cur = d.createElement("span");
      tok.className = "tok"; cur.className = "cursor";
      cap.replaceChildren(a, tok, b, cur);
      cap.classList.remove("out"); setStatus("auto");
      const full = pre + bad + post;
      for (let k = 1; k <= full.length; k++) {
        const s = full.slice(0, k);
        a.textContent = s.slice(0, pre.length);
        tok.textContent = s.slice(pre.length, pre.length + bad.length);
        b.textContent = s.slice(pre.length + bad.length);
        await sleep(58);
      }
      cur.remove();
      await sleep(650);
      tok.classList.add("err"); setStatus("err");
      await sleep(1200);
      tok.classList.remove("err"); tok.textContent = good; tok.classList.add("ok"); setStatus("ok");
      progress = progress >= 88 ? 30 : progress + 12;
      if (bar) bar.style.width = progress + "%";
      await sleep(2200);
    }
  }
})();
