/* 상생기록법인 — 자동 자막 체험 (시안)
   서버는 아직 붙이지 않았습니다. 진행 단계는 흉내만 내고, 결과는 아래 SAMPLE(예시 강의 받아쓰기)로 보여 줍니다.
   자막 나누기(SSRSplit.split)와 파일 쓰기(toSMI·toSRT·toVTT·toTXT)는 실제로 쓸 코드입니다. 화면과 떨어진 순수 함수입니다.
   바깥 라이브러리 없음. 테스트와 다른 페이지를 위해 window.SSRSplit을 내보냅니다(Node에서는 module.exports). */
(function (root) {
  "use strict";

  /* ───────────── 설정: 기본값과 글자 세는 규칙은 여기서만 바꿉니다 (상생 서버 SubExtractor와 같게) ───────────── */
  const CONFIG = {
    // 줄나눔·표시 시간 기본값(= 서버 API 기본값)
    maxChars: 46,   // 한 줄 최대 글자 수 (서버 MAX_CHAR)
    minDur: 1.5,    // 최소 표시 시간(초): 이보다 짧으면 앞뒤 자막과 합침
    maxDur: 30.0,   // 최대 표시 시간(초): 이보다 길면 둘로 나눔 (서버 MAX_DUR)
    // 화면에서 고를 수 있는 범위
    range: {
      maxChars: { min: 10, max: 999, step: 1 },   // 슬라이더는 로그 눈금(20~100을 쉽게), 숫자 칸은 정확히
      minDur: { min: 0.5, max: 10.0, step: 0.1 },
      maxDur: { min: 1.0, max: 120.0, step: 0.5 }, // 아래 한계는 늘 최소 표시 시간 + durGap
      capScale: { min: 70, max: 160, step: 5, value: 100 }, // 미리보기 글자 크기(%), 파일에는 안 들어감
    },
    // 글자 세기: 서버와 같이 Python len() — 한글·영문·숫자·띄어쓰기·문장부호 모두 1자.
    // 다른 규칙이 필요하면 이 함수만 바꾸면 됩니다(예: 한글 1, 그 밖 0.5).
    count: { len: (text) => Array.from(String(text == null ? "" : text)).length },
    // 서버 세부 기준 (core_config.py, Npass_i4/i5/i6, core_output.py)
    server: {
      mergeGap: 2.0,        // i4: 앞뒤 자막과의 틈이 이 안이면 합침 (MERGE_GAP)
      threshPct: 1.4,       // i5: 남은 줄이 MAX×1.4 이하면 '중간 길이' (THRESH_PCT)
      cutMinPct: 0.3,       // i5: 자르는 자리는 MAX×0.3 이상 (CUT_MIN_PCT)
      cutTarget1: 0.7,      // i5: 긴 줄의 목표·중간 길이의 상한 (CUT_TARGET1)
      cutTarget2: 0.5,      // i5: 중간 길이 줄의 목표 (CUT_TARGET2)
      tierScore: { S: 50, A: 35, B: 30, C: 25 }, // i5 품사 등급 점수
      distBase: 50,         // i5 거리 점수 최대값 (DIST_SCORE_BASE)
      commaShiftSlack: 10,  // i5: 바로 앞 어절이 쉼표로 끝나면, 목표와 거리 차가 이 안일 때 그 뒤로 옮김
      thrBigPct: 1.4,       // i6: 길이가 최대 표시 시간 × 이 값(THR_BIG) 이하이면 가운데에서 자름 — 서버 V34처럼 작업마다 max_dur × 1.4
      cutHalf: 0.5,         // i6 Case A: 길이 × 0.5
      cutBase070: 0.7,      // i6 Case B: 시작 + 최대 표시 시간 × 0.7
      silenceGap: 2.0,      // SMI: 자막 사이 틈이 이 이상이면 &nbsp;로 지움 (MIN_SILENCE_GAP = MERGE_GAP)
      badLineStart: ["있는", "있고", "있기", "있는데", "있으면", "있으면서", "되는", "되고", "되지만", "되면", "되면서", "되게", "되는데",
        "하는", "하고", "하기", "하는데", "하면", "하면서", "대해", "대한", "대하는", "대해서", "대하여", "것도", "것은", "게"],
      abstractNouns: ["문제", "상황", "부분", "점", "것", "경우", "사례", "측면", "내용", "의미", "관점", "상태", "현상", "결과"],
    },
    durGap: 0.5,             // 최대 표시 시간은 최소 표시 시간보다 이만큼 이상 길어야 함
    maxCps: 30,              // 자막 목록 CPS 칸 빨강 기준(SS_SubEditor 기본값)
    // 실제 연결(문지기 API, demo_api_contract.md §A). 비어 있으면 예시 강의만 되는 모드
    apiBase: "https://try-api.ss-r.co.kr",
    turnstileSiteKey: "0x4AAAAAAFQemKuPxfd5AkHV", // Turnstile 위젯 ssr-try 의 사이트 키(공개용)
    api: { pollMs: 3000, giveUpMs: 20 * 60 * 1000, ffmpegBase: "/vendor/ffmpeg/",
      retryMs: [3000, 7000, 15000, 30000] }, // 잠깐 끊길 때 다시 묻기 전 기다리는 시간(5번, 약 1분)
    bridgeGap: 0.3,          // 화면 미리보기만: 자막 사이 틈이 이보다 짧으면 이어 보여 깜빡이지 않게 (파일·목록 시각은 그대로)
    // 체험 한도
    publicSeconds: 300,      // 공개 체험: 앞 5분
    inviteSeconds: 6000,     // 초대 코드: 편당 100분
    publicRunsPerDay: 3,     // 공개 체험 하루 횟수(시안: 이 페이지 메모리에만)
    inviteLectures: 3,       // 초대 코드로 쓸 수 있는 강의 수
    countExampleRuns: false, // 예시 강의도 횟수에서 뺄지
    invitePattern: /^[A-Z0-9]{3,}-[A-Z0-9]{3,}$/i, // 시안: 이 모양이면 통과(실제 연결 때 서버 확인으로 바꿈)
    // 진행 흉내(합계 약 6초)
    simSteps: [
      { label: "소리 뽑기", now: "영상에서 소리를 뽑고 있습니다.", ms: 1100 },
      { label: "보내기", now: "소리를 보내고 있습니다.", ms: 900 },
      { label: "받아쓰기·싱크", now: "받아쓰고 어절마다 시간을 맞추고 있습니다.", ms: 2000 },
      { label: "다듬기·줄나눔", now: "표기를 다듬고 줄을 나누고 있습니다.", ms: 1600 },
      { label: "완료", now: "다 만들었습니다.", ms: 400 },
    ],
    probeTimeout: 10000,     // 영상 길이 읽기를 기다리는 시간(ms)
    exampleBase: "예시강의", // 예시 강의로 받을 때 파일 이름
    fileSuffix: "_자동자막", // <원본이름>_자동자막.<확장자>
    mail: "ssmd@ss-r.co.kr",
  };

  /* ───────────── 예시 강의: 서버가 돌려줄 모양(문장 → 어절 {w, s, e}, 초) ───────────── */
  const SAMPLE = {
    title: "미분의 정의",
    sentences: [
      [{w:"안녕하세요,",s:0.84,e:1.47},{w:"오늘은",s:1.78,e:2.19},{w:"미분의",s:2.27,e:2.71},{w:"정의를",s:2.79,e:3.19},{w:"함께",s:3.29,e:3.61},{w:"살펴보겠습니다.",s:3.69,e:4.41}],
      [{w:"지난",s:5.10,e:5.44},{w:"시간에는",s:5.55,e:6.07},{w:"평균변화율이",s:6.17,e:6.84},{w:"무엇인지",s:6.95,e:7.45},{w:"배웠죠.",s:7.50,e:7.98}],
      [{w:"함수",s:8.77,e:9.12},{w:"y=f(x)에서",s:9.22,e:9.80},{w:"x의",s:9.86,e:10.18},{w:"값이",s:10.27,e:10.59},{w:"a에서",s:10.63,e:11.03},{w:"a+h까지",s:11.07,e:11.58},{w:"변할",s:11.66,e:12.02},{w:"때,",s:12.09,e:12.40},{w:"y의",s:12.63,e:12.95},{w:"값이",s:13.03,e:13.35},{w:"얼마나",s:13.42,e:13.85},{w:"변했는지를",s:13.92,e:14.54},{w:"x의",s:14.61,e:14.89},{w:"변화량으로",s:14.97,e:15.58},{w:"나눈",s:15.66,e:15.98},{w:"것이",s:16.03,e:16.37},{w:"평균변화율이었습니다.",s:16.44,e:17.16}],
      [{w:"식으로",s:17.53,e:17.95},{w:"쓰면",s:18.06,e:18.42},{w:"f(a+h)에서",s:18.48,e:19.10},{w:"f(a)를",s:19.20,e:19.63},{w:"뺀",s:19.68,e:19.96},{w:"값을",s:20.03,e:20.37},{w:"h로",s:20.47,e:20.73},{w:"나눈",s:20.78,e:21.12},{w:"것이죠.",s:21.19,e:21.67}],
      [{w:"그래프로",s:21.98,e:22.52},{w:"보면",s:22.56,e:22.93},{w:"두",s:23.03,e:23.28},{w:"점을",s:23.32,e:23.64},{w:"잇는",s:23.68,e:24.04},{w:"직선,",s:24.13,e:24.50},{w:"즉",s:24.78,e:25.03},{w:"할선의",s:25.13,e:25.58},{w:"기울기와",s:25.65,e:26.16},{w:"같습니다.",s:26.26,e:26.80}],
      [{w:"이",s:27.24,e:27.52},{w:"기울기는",s:27.56,e:28.06},{w:"두",s:28.14,e:28.39},{w:"점",s:28.43,e:28.71},{w:"사이에서",s:28.76,e:29.30},{w:"함숫값의",s:29.37,e:29.89},{w:"평균적인",s:29.94,e:30.44},{w:"변화를",s:30.55,e:30.95},{w:"나타냅니다.",s:31.00,e:31.65}],
      [{w:"그러면",s:32.13,e:32.56},{w:"여기서",s:32.64,e:33.07},{w:"h를",s:33.12,e:33.43},{w:"점점",s:33.49,e:33.84},{w:"작게",s:33.91,e:34.26},{w:"만들면",s:34.34,e:34.74},{w:"어떻게",s:34.79,e:35.23},{w:"될까요?",s:35.28,e:35.77}],
      [{w:"예를",s:36.36,e:36.69},{w:"들어",s:36.75,e:37.10},{w:"h를",s:37.17,e:37.44},{w:"0.1,",s:37.54,e:37.88},{w:"0.01,",s:38.14,e:38.54},{w:"0.001처럼",s:38.73,e:39.32},{w:"계속",s:39.41,e:39.76},{w:"줄여",s:39.86,e:40.18},{w:"보겠습니다.",s:40.26,e:40.93}],
      [{w:"h가",s:41.16,e:41.44},{w:"작아질수록",s:41.49,e:42.09},{w:"두",s:42.15,e:42.40},{w:"번째",s:42.46,e:42.78},{w:"점이",s:42.84,e:43.20},{w:"점",s:43.30,e:43.56},{w:"a",s:43.61,e:43.86},{w:"쪽으로",s:43.95,e:44.40},{w:"다가오고,",s:44.45,e:45.00},{w:"할선의",s:45.29,e:45.71},{w:"기울기도",s:45.78,e:46.28},{w:"조금씩",s:46.33,e:46.75},{w:"달라집니다.",s:46.84,e:47.51}],
      [{w:"그리고",s:48.05,e:48.50},{w:"h가",s:48.60,e:48.90},{w:"0에",s:48.96,e:49.27},{w:"한없이",s:49.35,e:49.75},{w:"가까워지면",s:49.85,e:50.44},{w:"할선은",s:50.51,e:50.92},{w:"어떤",s:51.02,e:51.38},{w:"한",s:51.42,e:51.70},{w:"직선에",s:51.79,e:52.23},{w:"가까워지는데,",s:52.30,e:53.02},{w:"이",s:53.36,e:53.61},{w:"직선을",s:53.71,e:54.13},{w:"바로",s:54.19,e:54.50},{w:"접선이라고",s:54.58,e:55.20},{w:"부릅니다.",s:55.25,e:55.81}],
      [{w:"이때",s:56.58,e:56.95},{w:"평균변화율이",s:57.04,e:57.72},{w:"가까워지는",s:57.77,e:58.39},{w:"극한값을",s:58.47,e:58.98},{w:"x=a에서의",s:59.08,e:59.63},{w:"미분계수라고",s:59.70,e:60.42},{w:"합니다.",s:60.51,e:60.98}],
      [{w:"기호로는",s:61.29,e:61.82},{w:"f′(a)라고",s:61.90,e:62.47},{w:"쓰고,",s:62.54,e:62.92},{w:"에프",s:63.21,e:63.55},{w:"프라임",s:63.61,e:64.06},{w:"에이라고",s:64.10,e:64.64},{w:"읽습니다.",s:64.69,e:65.25}],
      [{w:"정리하면",s:65.78,e:66.32},{w:"f′(a)는",s:66.41,e:66.87},{w:"h가",s:66.94,e:67.23},{w:"0으로",s:67.27,e:67.66},{w:"갈",s:67.75,e:68.00},{w:"때",s:68.06,e:68.33},{w:"평균변화율의",s:68.39,e:69.10},{w:"극한이고,",s:69.18,e:69.73},{w:"그래프에서는",s:69.92,e:70.60},{w:"접선의",s:70.66,e:71.06},{w:"기울기입니다.",s:71.15,e:71.87}],
      [{w:"여기서",s:72.17,e:72.62},{w:"한",s:72.73,e:72.99},{w:"가지",s:73.04,e:73.38},{w:"주의할",s:73.46,e:73.86},{w:"점이",s:73.91,e:74.24},{w:"있습니다.",s:74.29,e:74.88}],
      [{w:"h는",s:75.42,e:75.74},{w:"0에",s:75.80,e:76.11},{w:"가까워질",s:76.17,e:76.66},{w:"뿐,",s:76.70,e:76.98},{w:"0이",s:77.22,e:77.49},{w:"되는",s:77.55,e:77.88},{w:"것은",s:77.93,e:78.28},{w:"아니라는",s:78.37,e:78.89},{w:"점입니다.",s:78.97,e:79.54}],
      [{w:"h가",s:80.00,e:80.29},{w:"0이",s:80.36,e:80.64},{w:"되면",s:80.71,e:81.06},{w:"분모가",s:81.16,e:81.56},{w:"0이",s:81.66,e:81.93},{w:"되어서",s:82.01,e:82.45},{w:"식이",s:82.52,e:82.88},{w:"정의되지",s:82.93,e:83.46},{w:"않기",s:83.53,e:83.88},{w:"때문이에요.",s:83.94,e:84.60}],
      [{w:"그래서",s:85.29,e:85.72},{w:"극한이라는",s:85.80,e:86.38},{w:"개념이",s:86.44,e:86.89},{w:"꼭",s:86.97,e:87.22},{w:"필요한",s:87.26,e:87.71},{w:"겁니다.",s:87.75,e:88.22}],
      [{w:"이",s:88.64,e:88.89},{w:"정의는",s:88.98,e:89.39},{w:"앞으로",s:89.44,e:89.84},{w:"배울",s:89.90,e:90.26},{w:"미분",s:90.31,e:90.67},{w:"공식들의",s:90.78,e:91.27},{w:"출발점이니까",s:91.36,e:92.05},{w:"꼭",s:92.13,e:92.40},{w:"기억해",s:92.45,e:92.86},{w:"두세요.",s:92.93,e:93.40}],
      [{w:"또",s:94.04,e:94.29},{w:"이",s:94.39,e:94.65},{w:"극한값이",s:94.75,e:95.29},{w:"존재하지",s:95.35,e:95.84},{w:"않는",s:95.92,e:96.24},{w:"경우도",s:96.32,e:96.74},{w:"있는데요,",s:96.84,e:97.42},{w:"이럴",s:97.60,e:97.97},{w:"때는",s:98.07,e:98.40},{w:"x=a에서",s:98.46,e:98.94},{w:"미분가능하지",s:98.98,e:99.65},{w:"않다고",s:99.71,e:100.12},{w:"말합니다.",s:100.19,e:100.75}],
      [{w:"대표적인",s:101.19,e:101.70},{w:"예가",s:101.77,e:102.09},{w:"그래프에",s:102.14,e:102.68},{w:"뾰족한",s:102.76,e:103.19},{w:"점이",s:103.28,e:103.63},{w:"있는",s:103.73,e:104.09},{w:"함수입니다.",s:104.19,e:104.85}],
      [{w:"왼쪽에서",s:105.22,e:105.76},{w:"다가갈",s:105.87,e:106.28},{w:"때와",s:106.38,e:106.73},{w:"오른쪽에서",s:106.82,e:107.44},{w:"다가갈",s:107.53,e:107.95},{w:"때",s:108.03,e:108.30},{w:"기울기가",s:108.34,e:108.87},{w:"다르면,",s:108.98,e:109.48},{w:"극한값이",s:109.74,e:110.27},{w:"하나로",s:110.33,e:110.79},{w:"정해지지",s:110.87,e:111.36},{w:"않겠죠.",s:111.45,e:111.95}],
      [{w:"자,",s:112.22,e:112.53},{w:"이제",s:112.80,e:113.14},{w:"간단한",s:113.22,e:113.65},{w:"예를",s:113.72,e:114.07},{w:"하나",s:114.13,e:114.45},{w:"풀어",s:114.52,e:114.90},{w:"보겠습니다.",s:115.00,e:115.65}],
      [{w:"f(x)=x²일",s:115.97,e:116.51},{w:"때",s:116.58,e:116.85},{w:"x=1에서의",s:116.89,e:117.46},{w:"미분계수를",s:117.55,e:118.14},{w:"구해",s:118.19,e:118.52},{w:"봅시다.",s:118.62,e:119.10}],
      [{w:"f(1+h)에서",s:119.78,e:120.41},{w:"f(1)을",s:120.51,e:120.96},{w:"빼면",s:121.02,e:121.38},{w:"2h+h²이",s:121.48,e:121.93},{w:"되고,",s:122.01,e:122.39},{w:"이것을",s:122.66,e:123.08},{w:"h로",s:123.16,e:123.45},{w:"나누면",s:123.56,e:123.96},{w:"2+h가",s:124.04,e:124.43},{w:"됩니다.",s:124.51,e:125.00}],
      [{w:"여기서",s:125.76,e:126.22},{w:"h를",s:126.30,e:126.62},{w:"0으로",s:126.67,e:127.08},{w:"보내면",s:127.15,e:127.60},{w:"2+h는",s:127.70,e:128.06},{w:"2에",s:128.12,e:128.38},{w:"가까워지므로,",s:128.46,e:129.18},{w:"f′(1)은",s:129.41,e:129.91},{w:"2입니다.",s:130.00,e:130.50}],
      [{w:"즉,",s:130.78,e:131.07},{w:"x=1인",s:131.41,e:131.78},{w:"점에서",s:131.89,e:132.33},{w:"접선의",s:132.43,e:132.85},{w:"기울기가",s:132.91,e:133.44},{w:"2라는",s:133.53,e:133.90},{w:"뜻입니다.",s:133.99,e:134.58}],
      [{w:"다음",s:135.31,e:135.65},{w:"시간에는",s:135.69,e:136.24},{w:"이",s:136.31,e:136.57},{w:"미분계수를",s:136.68,e:137.26},{w:"이용해서",s:137.37,e:137.90},{w:"도함수에",s:137.95,e:138.48},{w:"대해",s:138.57,e:138.93},{w:"배워",s:138.97,e:139.33},{w:"보겠습니다.",s:139.44,e:140.09}],
      [{w:"오늘",s:140.34,e:140.66},{w:"배운",s:140.77,e:141.13},{w:"내용",s:141.19,e:141.53},{w:"꼭",s:141.58,e:141.83},{w:"복습해",s:141.94,e:142.39},{w:"두세요.",s:142.46,e:142.91}]
    ],
  };

  /* ───────────── 자막 나누기와 파일 쓰기 (화면과 무관한 순수 함수, 서버 순서: i4a → i5 → i6 → i4b) ─────────────
     서버와 다른 점(브라우저에 MeCab이 없어서):
     - i5 품사 등급(S/A/B/C)은 어절 끝 모양 규칙표로 짐작합니다. 종결 어미(EF)는 . ? ! 와 -니다/-요/-죠,
       연결 어미(EC)는 -고/-며/-면/-서/-는데/-지만/-니까/-므로/-도록/-거나 등, 부사격(JKB)·주격(JKS) 조사는 끝 글자로 봅니다.
       관형형(-ㄴ/-ㄹ/-는/-은/-던/-적인) 뒤는 등급 없음(서버와 같음)이고, 등급 있는 자리가 없을 때 고르는 거리 순위에서도 뒤로 미룹니다(브라우저만).
       그래서 "화면"(명사)을 연결 어미 "-면"으로 보는 식의 오판이 드물게 있습니다.
     - 서버는 자를 자리가 하나도 없으면 MAX 글자 위치에서 어절 중간을 자르지만(fallback-safety), 여기서는 MAX 안의 마지막 어절 경계에서 자릅니다.
     - i6 THR_BIG: 서버(V34)처럼 작업마다 최대 표시 시간 × 1.4로 계산합니다(예전 서버는 설정값 30초 × 1.4 = 42초로 고정).
     - 시간은 서버처럼 그대로 두고(끝 늘이기 없음), 화면 미리보기에서만 짧은 틈을 이어 보입니다(bridge). */
  const SSRSplit = (function () {
    const S = CONFIG.server;
    const TICK = 0.01;
    const CLOSERS = /[)\]}"'”’」』》〉）］｝]+$/u;
    const PUNCT_ONLY = /^[,.?!…:;、。，．？！)\]}"'”’」』》〉）］｝]+$/u;
    const BAD = new Set(S.badLineStart), ABSTRACT = new Set(S.abstractNouns);
    const CONJ = new Set(["그리고", "그러나", "그런데", "하지만", "그래서", "따라서", "그러면", "그러므로", "그럼", "또", "또한", "또는", "혹은", "및", "즉", "게다가", "그러니까", "왜냐하면", "근데", "단"]);
    const num = (v, dflt) => {
      const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      return typeof x === "number" && Number.isFinite(x) ? x : dflt;
    };
    const r3 = (x) => Math.round(x * 1000) / 1000;

    /** 글자 수 (기본: Python len()과 같이 모든 글자 1) */
    const charLen = (text) => CONFIG.count.len(text);

    function resolveOpts(o) {
      o = o || {};
      const maxChars = Math.max(1, Math.floor(num(o.maxChars, CONFIG.maxChars)));
      const maxDur = Math.max(0.1, num(o.maxDur, CONFIG.maxDur));
      return { maxChars, maxDur, minDur: Math.max(0, num(o.minDur, CONFIG.minDur)), mergeGap: Math.max(0, num(o.mergeGap, S.mergeGap)) };
    }

    /** 서버 결과 다듬기: 빈 어절 빼기, 시간은 숫자로, 문장부호만 있는 어절은 앞 어절에 붙이기. 입력은 바꾸지 않음 */
    function cleanSentences(sentences) {
      const out = [];
      for (const sent of Array.isArray(sentences) ? sentences : []) {
        const list = Array.isArray(sent) ? sent : sent && Array.isArray(sent.words) ? sent.words : [];
        const words = [];
        for (const raw of list) {
          if (!raw) continue;
          const w = String(raw.w != null ? raw.w : raw.word != null ? raw.word : raw.text != null ? raw.text : "").replace(/\s+/g, " ").trim();
          if (!w) continue;
          const prev = words[words.length - 1];
          const s = Math.max(0, num(raw.s != null ? raw.s : raw.start, prev ? prev.e : 0));
          let e = num(raw.e != null ? raw.e : raw.end, s);
          if (e < s) e = s;
          if (prev && PUNCT_ONLY.test(w)) { prev.w += w; prev.e = Math.max(prev.e, e); continue; }
          words.push({ w, s, e });
        }
        if (words.length) out.push(words);
      }
      return out;
    }
    /** 앞에서부터 limit초까지만 남김(공개 체험 앞 5분 등) */
    function clipSentences(sentences, limit) {
      const all = cleanSentences(sentences);
      if (!(limit > 0) || limit === Infinity) return all;
      const out = [];
      for (const words of all) {
        const kept = words.filter((w) => w.s < limit).map((w) => ({ w: w.w, s: w.s, e: Math.min(w.e, limit) }));
        if (kept.length) out.push(kept);
      }
      return out;
    }

    const seg = (words) => {
      let start = Infinity, end = -Infinity;
      for (const w of words) { if (w.s < start) start = w.s; if (w.e > end) end = w.e; }
      return { start, end, words, text: words.map((w) => w.w).join(" ") };
    };
    const hasEndPunct = (t) => /[.?!]$/.test(String(t || "").replace(/\s+$/, ""));

    // i4: 최소 표시 시간보다 짧은 자막을 앞(UP)이나 뒤(DOWN) 자막과 합침 (서버 _choose_merge_direction 순서 그대로)
    function mergeShort(segs, o) {
      segs = segs.slice();
      const join = (a, b) => (a.replace(/\s+$/, "") + " " + b.replace(/^\s+/, "")).trim();
      const fits = (a, b) => {
        const start = Math.min(a.start, b.start), end = Math.max(a.end, b.end);
        return end >= start && end - start <= o.maxDur && charLen(join(a.text, b.text)) <= o.maxChars;
      };
      const merge = (a, b) => ({ start: Math.min(a.start, b.start), end: Math.max(a.end, b.end), words: a.words.concat(b.words), text: join(a.text, b.text) });
      let i = 0;
      while (i < segs.length) {
        const c = segs[i];
        if (c.end - c.start >= o.minDur) { i++; continue; }
        const p = i > 0 ? segs[i - 1] : null, n = i + 1 < segs.length ? segs[i + 1] : null;
        const gapUp = p ? c.start - p.end : null, gapDown = n ? n.start - c.end : null;
        const canL = !!p && gapUp >= 0 && gapUp <= o.mergeGap && fits(p, c);
        const canR = !!n && gapDown >= 0 && gapDown <= o.mergeGap && fits(c, n);
        let dir = null;
        if (canL && !hasEndPunct(p.text) && hasEndPunct(c.text)) dir = "UP";               // 규칙 A
        else if (p && n && canR && hasEndPunct(p.text) && !hasEndPunct(n.text)) dir = "DOWN"; // 규칙 B
        else if (canL && canR) dir = gapUp <= gapDown ? "UP" : "DOWN";                     // 틈이 작은 쪽
        else if (canL) dir = "UP";
        else if (canR) dir = "DOWN";
        if (!dir) { i++; continue; }
        if (dir === "UP") segs.splice(i - 1, 2, merge(p, c)); else segs.splice(i, 2, merge(c, n));
        i = Math.max(i - 1, 0);
      }
      return segs;
    }

    // i5 품사 등급 짐작 (MeCab 대신 어절 끝 모양)
    const core = (w) => String(w || "").replace(CLOSERS, "").replace(/[.,!?…:;]+$/, "");
    function jong(ch) { const c = ch ? ch.charCodeAt(0) - 0xAC00 : -1; return c >= 0 && c < 11172 ? c % 28 : -1; }
    function tailOf(w) {
      const c = core(w);
      if (/(에서|에게서|으로서|로서|으로써|로써)$/.test(c)) return "JKB";
      if (/(면서|다면|라면|으면|면|고|으며|며|어서|아서|해서|여서|서|는데|은데|던데|지만|니까|으니|므로|도록|거나|든지|려고|다가|듯이|자마자)$/.test(c)) return "EC";
      if (/(에게|한테|께|으로|로|에|까지|부터|처럼|보다|와|과)$/.test(c)) return "JKB";
      if (/(께서|이|가)$/.test(c)) return "JKS";
      if (/(던|적인)$/.test(c) || [4, 8].includes(jong(c.slice(-1))) || /[는은]$/.test(c)) return "ETM?";
      return "";
    }
    const isEF = (w) => /[.?!]$/.test(String(w).replace(CLOSERS, "")) || /(니다|어요|아요|에요|예요|해요|죠|지요)$/.test(core(w));
    const isContent = (w) => !!w && !BAD.has(core(w)) && !/^[,.?!]/.test(w);
    function tierOf(ph, i) {
      const p = ph[i].w, nx = ph[i + 1] ? ph[i + 1].w : null, sc = S.tierScore;
      if (nx && isEF(p) && isContent(nx)) return sc.S;
      if (nx && /,$/.test(p) && isContent(nx)) return sc.S;
      if (nx && CONJ.has(core(nx))) return sc.A;
      const t = tailOf(p);
      if (t === "EC") return sc.B; // 조건(-면 등)도 서버에서 B
      if (t === "ETM?" && nx && ABSTRACT.has(nx.replace(/[.,!?]+$/, ""))) return sc.B;
      if (t === "JKB" || t === "JKS") return sc.C;
      return 0;
    }
    function badBoundary(ph, i) { // 다음 줄이 쉼표로 끝나는 어절이나 나쁜 시작 단어로 시작하면 금지
      const nx = ph[i + 1];
      if (!nx) return false;
      if (/,$/.test(nx.w)) return true;
      return BAD.has(nx.w.replace(/[.,!?"'”’）)」』…]+$/, ""));
    }
    function chooseCut(ph, target, lower, upper, o) {
      const ce = [];
      let pos = 0;
      ph.forEach((w, i) => { pos += (i ? charLen(" ") : 0) + charLen(w.w); ce.push(pos); });
      const maxd = Math.max(o.maxChars, ph.length, 1);
      const ds = (i) => Math.max(0, S.distBase * (1 - Math.abs(ce[i] - target) / maxd));
      const tiers = [], fb = [];
      for (let i = 0; i < ph.length; i++) {
        if (!(lower <= ce[i] && ce[i] <= upper) || badBoundary(ph, i)) continue;
        fb.push(i);
        const t = tierOf(ph, i);
        if (t) tiers.push([i, t]);
      }
      let best = -1;
      if (tiers.length) {
        let bs = -1;
        for (const [i, t] of tiers) { const s = t + ds(i); if (s > bs) { bs = s; best = i; } }
      } else if (fb.length) {
        const cost = (i) => Math.abs(ce[i] - target) + (tailOf(ph[i].w) === "ETM?" ? o.maxChars * 0.25 : 0); // 관형형 뒤는 미룸(브라우저만)
        best = fb.reduce((b, i) => (cost(i) < cost(b) ? i : b), fb[0]);
      }
      if (best > 0) { // 바로 앞 어절이 쉼표로 끝나면 그 뒤로(서버 _adjust_cut_prev_comma)
        const alt = best - 1;
        if (/,$/.test(ph[alt].w) && !/[.?!]$/.test(ph[best].w) && lower <= ce[alt] && ce[alt] <= upper && !badBoundary(ph, alt)
          && Math.abs(ce[alt] - target) <= Math.abs(ce[best] - target) + S.commaShiftSlack) best = alt;
      }
      if (best < 0) { // 자를 자리 없음: MAX 안의 마지막 어절 경계(서버는 글자 위치에서 자름)
        best = 0;
        for (let i = 0; i < ph.length - 1; i++) if (ce[i] <= o.maxChars) best = i;
      }
      return best + 1; // 왼쪽 줄의 어절 수
    }
    // i5: 한 줄 최대 글자 수를 넘는 자막을 어절 경계에서 나눔
    function lineBreak(sg, o) {
      if (charLen(sg.text) <= o.maxChars) return [sg];
      const MAX = o.maxChars, THRESH = Math.trunc(MAX * S.threshPct), MIN_CUT = Math.trunc(MAX * S.cutMinPct);
      const MID_UPPER = Math.trunc(MAX * S.cutTarget1), T_HALF = Math.trunc(MAX * S.cutTarget2), T_LONG = Math.trunc(MAX * S.cutTarget1);
      const out = [];
      let k = 0;
      const W = sg.words;
      while (k < W.length) {
        const rest = W.slice(k), L = charLen(rest.map((w) => w.w).join(" "));
        if (L <= MAX || rest.length < 2) break;
        const mid = L <= THRESH;
        const n = chooseCut(rest, mid ? T_HALF : T_LONG, MIN_CUT, mid ? Math.min(MID_UPPER, L) : MAX, o);
        out.push(seg(rest.slice(0, n)));
        k += n;
      }
      if (k < W.length) out.push(seg(W.slice(k)));
      return out;
    }
    // i6: 최대 표시 시간보다 길면 나눔 (Case A: 길이 ≤ THR_BIG이면 가운데, Case B: 시작 + MAX_DUR×0.7). 타깃 전에 끝나는 마지막 어절 뒤에서
    function splitByDuration(sg, o) {
      const dur = sg.end - sg.start;
      if (dur <= o.maxDur || sg.words.length < 2) return [sg];
      const thrBig = o.maxDur * S.thrBigPct; // THR_BIG = MAX_DUR × 1.4 — 서버와 같은 곱셈(반올림 없음)
      const target = dur <= thrBig ? sg.start + dur * S.cutHalf : sg.start + o.maxDur * S.cutBase070;
      let left = -1;
      sg.words.forEach((w, i) => { if (w.e <= target) left = i; });
      if (left < 0 || left + 1 >= sg.words.length) return [sg];
      return splitByDuration(seg(sg.words.slice(0, left + 1)), o).concat(splitByDuration(seg(sg.words.slice(left + 1)), o));
    }

    /**
     * 문장(어절 {w,s,e} 배열)들을 서버와 같은 순서로 한 줄 자막으로 나눔: i4a(합치기) → i5(줄나눔) → i6(긴 시간 나누기) → i4b(합치기)
     * 돌려줌: [{id, start, end, text, flags}] — flags: "too-long"(한 줄보다 긺, 어절 하나가 긴 경우), "short"(합칠 수 없어 최소 표시 시간보다 짧음)
     */
    function split(sentences, opts) {
      const o = resolveOpts(opts);
      let segs = cleanSentences(sentences).map(seg);                // i3 결과 = 문장
      segs = mergeShort(segs, o);                                   // i4a
      segs = [].concat(...segs.map((s) => lineBreak(s, o)));        // i5
      segs = [].concat(...segs.map((s) => splitByDuration(s, o)));  // i6
      segs = mergeShort(segs, o);                                   // i4b
      const cues = segs.map((s, i) => ({ start: s.start, end: s.end, text: s.text, order: i })).sort((a, b) => a.start - b.start || a.order - b.order);
      for (let i = 1; i < cues.length; i++) if (cues[i].start < cues[i - 1].start + TICK) cues[i].start = cues[i - 1].start + TICK; // 잘못된 입력 대비
      for (let i = 0; i < cues.length; i++) {
        if (cues[i].end < cues[i].start + TICK) cues[i].end = cues[i].start + TICK;
        if (cues[i + 1] && cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
      }
      return cues.map((c, i) => {
        const start = r3(c.start), end = r3(c.end), flags = [];
        if (charLen(c.text) > o.maxChars) flags.push("too-long");
        if (end - start < o.minDur) flags.push("short");
        return { id: i + 1, start, end, text: c.text, flags };
      });
    }

    /** 화면 미리보기용: 짧은 틈(< gap초)은 앞 자막을 다음 자막 시작까지 늘려 깜빡이지 않게 (새 배열, 파일에는 쓰지 않음) */
    function bridge(cues, gap) {
      const g = num(gap, CONFIG.bridgeGap);
      return (cues || []).map((c, i, a) => {
        const nx = a[i + 1];
        return nx && nx.start - c.end > 0 && nx.start - c.end < g ? Object.assign({}, c, { end: nx.start }) : c;
      });
    }
    /** t초에 보이는 자막의 번호(0부터), 없으면 -1 */
    function cueAt(cues, t) {
      let lo = 0, hi = (cues ? cues.length : 0) - 1, ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (cues[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return ans >= 0 && t < cues[ans].end ? ans : -1;
    }

    /* ── 파일 쓰기: 서버 core_output.py와 같은 모양(UTF-8 BOM, Windows 줄바꿈 CRLF, 마지막 줄바꿈 없음). 형식마다 따로 ── */
    const pad = (n, w) => String(n).padStart(w, "0");
    const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }; // Python round()
    const msOf = (t) => pyRound(Math.max(0, Number(t) || 0) * 1000);
    function stamp(t, sep) {
      const ms = msOf(t);
      return pad(Math.floor(ms / 3600000), 2) + ":" + pad(Math.floor(ms / 60000) % 60, 2) + ":" + pad(Math.floor(ms / 1000) % 60, 2) + sep + pad(ms % 1000, 3);
    }
    const sorted = (cues) => (Array.isArray(cues) ? cues : []).map((c, i) => [c, i]).sort((a, b) => a[0].start - b[0].start || a[1] - b[1]).map((x) => x[0]);
    const EOL = "\r\n";
    /** SRT: 번호 / 시각 / 글 / 빈 줄 */
    function toSRT(cues) {
      const lines = [];
      sorted(cues).forEach((c, i) => lines.push(String(i + 1), stamp(c.start, ",") + " --> " + stamp(c.end, ","), c.text || "", ""));
      return lines.join(EOL);
    }
    /** VTT: WEBVTT / 빈 줄 / (시각 / 글 / 빈 줄)… */
    function toVTT(cues) {
      const lines = ["WEBVTT", ""];
      sorted(cues).forEach((c) => lines.push(stamp(c.start, ".") + " --> " + stamp(c.end, "."), c.text || "", ""));
      return lines.join(EOL);
    }
    /** TXT: 자막 하나에 한 줄 */
    function toTXT(cues) { return sorted(cues).map((c) => c.text || "").join(EOL); }
    /** SMI: 서버 머리글 그대로, <SYNC Start=ms><P Class=KRCC> 다음 줄에 글. 틈이 silenceGap 이상이면 &nbsp;, 끝에 &nbsp; */
    function toSMI(cues) {
      const lines = ["<SAMI>", "<HEAD>", '<STYLE TYPE="text/css">', "<!--", "P { font-size: 10pt; }", ".KRCC { Name: Korean; lang: ko-KR; }", "-->", "</STYLE>", "</HEAD>", "<BODY>", ""];
      const list = sorted(cues);
      let prevEnd = null;
      for (const c of list) {
        if (prevEnd !== null && c.start - prevEnd >= S.silenceGap) lines.push("<SYNC Start=" + msOf(prevEnd) + "><P Class=KRCC>", "&nbsp;");
        lines.push("<SYNC Start=" + msOf(c.start) + "><P Class=KRCC>", String(c.text || "").replace(/\n/g, " "));
        prevEnd = c.end;
      }
      if (list.length) lines.push("<SYNC Start=" + msOf(list[list.length - 1].end) + "><P Class=KRCC>", "&nbsp;");
      lines.push("</BODY>", "</SAMI>");
      return lines.join(EOL);
    }

    /** 내려받기 형식 (서버처럼 모두 UTF-8 BOM) */
    const FORMATS = Object.freeze({
      smi: Object.freeze({ ext: "smi", label: "SMI", mime: "text/plain;charset=utf-8", bom: true, write: (x) => toSMI(x.cues) }),
      srt: Object.freeze({ ext: "srt", label: "SRT", mime: "application/x-subrip;charset=utf-8", bom: true, write: (x) => toSRT(x.cues) }),
      vtt: Object.freeze({ ext: "vtt", label: "VTT", mime: "text/vtt;charset=utf-8", bom: true, write: (x) => toVTT(x.cues) }),
      txt: Object.freeze({ ext: "txt", label: "TXT", mime: "text/plain;charset=utf-8", bom: true, write: (x) => toTXT(x.cues) }),
    });
    /** 파일에 들어갈 글 전체(BOM 포함). data: {cues} */
    function fileText(fmt, data) {
      const f = FORMATS[fmt];
      if (!f) throw new Error("SSRSplit.fileText: 모르는 형식 " + fmt);
      return (f.bom ? "\uFEFF" : "") + f.write(data || {});
    }

    return Object.freeze({ config: CONFIG, charLen, split, bridge, cueAt, cleanSentences, clipSentences, stamp, toSRT, toVTT, toSMI, toTXT, FORMATS, fileText,
      _i: Object.freeze({ mergeShort, lineBreak, splitByDuration, tierOf, seg }) });
  })();

  if (typeof module === "object" && module && module.exports) module.exports = { CONFIG, SAMPLE, SSRSplit };
  if (!root || !root.document) return;
  root.SSRSplit = SSRSplit;

  /* ───────────── 화면 ───────────── */
  const d = root.document;
  const $ = (id) => d.getElementById(id);
  const reduceMQ = root.matchMedia("(prefers-reduced-motion: reduce)");
  const phoneMQ = root.matchMedia("(max-width: 760px)");
  const smooth = () => (reduceMQ.matches ? "auto" : "smooth");
  const SAMPLE_END = (() => { // 예시 강의 길이 = 마지막 말 + 1.5초
    let m = 0;
    for (const s of SAMPLE.sentences) for (const w of s) m = Math.max(m, w.e);
    return Math.ceil((m + 1.5) * 10) / 10;
  })();

  const el = {
    head: d.querySelector(".site-head"),
    tiers: Array.from(d.querySelectorAll("#t-ladder > .t-tier")),
    bench: $("t-bench"), tabs: $("t-tabs"),
    tabPublic: $("t-tab-public"), tabInvite: $("t-tab-invite"), panelPublic: $("t-panel-public"), panelInvite: $("t-panel-invite"),
    publicLeft: $("t-public-left"),
    inviteForm: $("t-invite-form"), inviteInput: $("t-invite-code"), inviteMsg: $("t-invite-msg"), inviteOk: $("t-invite-ok"), inviteLeft: $("t-invite-left"),
    stepFile: $("t-step-file"), drop: $("t-drop"), pick: $("t-pick"), example: $("t-example"), file: $("t-file"), fileErr: $("t-file-err"),
    chosen: $("t-chosen"), chosenName: $("t-chosen-name"), chosenMeta: $("t-chosen-meta"), chosenPart: $("t-chosen-part"), chosenClear: $("t-chosen-clear"),
    reset: $("t-reset"), setMsg: $("t-set-msg"),
    stepGo: $("t-step-go"), agree1: $("t-agree-rights"), agree2: $("t-agree-delete"), make: $("t-make"), makeHint: $("t-make-hint"),
    progress: $("t-progress"), progSteps: $("t-prog-steps"), progBar: $("t-prog-bar"), progFill: $("t-prog-fill"), progTime: $("t-prog-time"), progNow: $("t-prog-now"), cancel: $("t-cancel"),
    result: $("t-result"), resultTitle: $("t-result-title"), resultMeta: $("t-result-meta"), again: $("t-again"),
    banner: $("t-banner"), bannerText: $("t-banner-text"), screen: $("t-screen"), slide: $("t-slide"), video: $("t-video"), audio: $("t-audio"), badge: $("t-badge"), bigplay: $("t-bigplay"), cap: $("t-cap"),
    play: $("t-play"), time: $("t-time"), seek: $("t-seek"),
    capScale: $("res-capScale"), capScaleOut: $("res-capScale-v"),
    stN: $("st-n"), stLong: $("st-long"), stAvg: $("st-avg"), stRed: $("st-red"), stRedWrap: $("st-red-wrap"), resplitNote: $("t-resplit-note"),
    publicQuota: $("t-public-quota"), publicMax: $("t-public-max"), serverNote: $("t-server-note"), offline: $("t-offline"), example2: $("t-example2"),
    inviteMax: $("t-invite-max"), inviteExp: $("t-invite-exp"), inviteBtn: d.querySelector("#t-invite-form button[type=submit]"), human: $("t-human"),
    reqForm: $("t-req-form"), reqConsent: $("t-req-consent"), reqName: $("t-req-name"), reqOrg: $("t-req-org"), reqEmail: $("t-req-email"), reqHuman: $("t-req-human"), reqBtn: $("t-req-btn"), reqMsg: $("t-req-msg"), reqDone: $("t-req-done"), reqCode: $("t-req-code"), reqMail: $("t-req-mail"),
    cues: $("t-cues"), cueCount: $("t-cue-count"), cueScroll: $("t-cue-scroll"), cueList: $("t-cue-list"),
    dlBtns: Array.from(d.querySelectorAll(".t-dl-btn[data-fmt]")), dlLocked: $("t-dl-locked"), dlOpen: $("t-dl-open"), dlMax: $("t-dl-max"), dlName: $("t-dl-name"), toInvite: $("t-to-invite"),
  };
  // 같은 값을 두 곳(설정, 결과 화면)에서 바꿀 수 있음: [슬라이더, 숫자 칸]
  const pairs = {
    maxChars: [[$("set-maxChars"), $("set-maxChars-n")], [$("res-maxChars"), $("res-maxChars-n")]],
    minDur: [[$("set-minDur"), $("set-minDur-n")]],
    maxDur: [[$("set-maxDur"), $("set-maxDur-n")]],
  };
  const KEYS = ["maxChars", "minDur", "maxDur"];

  const state = {
    tab: "public",          // "public" | "invite"
    code: "",               // 확인한 초대 코드
    publicLeft: CONFIG.publicRunsPerDay,
    inviteLeft: CONFIG.inviteLectures,
    source: null,           // {kind:"file", …} | {kind:"example", …}
    opts: { maxChars: CONFIG.maxChars, minDur: CONFIG.minDur, maxDur: CONFIG.maxDur },
    run: null,              // 만드는 중인 일
    result: null,           // {src, mode, end, sentences, cues, title, base, useVideo, live, serverCues, serverSettings}
    server: "unknown",      // 실제 연결: up | down
    runError: "",           // 실제 연결 오류 문구(다음 시작 전까지 보임)
    serverMsg: "", notice: "", closed: false, publicMax: 3, inviteMax: 0, inviteExp: "", tsToken: "", tsWidget: null,
    reqToken: "", reqWidget: null, reqDone: "", reqOff: false, // 초대 코드 자동 발급 칸(문지기 /demo/invite/request)
  };
  // 시험용 고리: 내 컴퓨터(127.0.0.1·localhost)에서만 ?api=주소, ?ts=skip (실제 도메인에서는 무시)
  const LOCAL = /^(127\.0\.0\.1|localhost)$/.test(root.location.hostname);
  const QS = new URLSearchParams(root.location.search);
  if (LOCAL && QS.get("api")) CONFIG.apiBase = QS.get("api").replace(/\/+$/, "");
  const TS_SKIP = LOCAL && QS.get("ts") === "skip";
  const live = () => !!CONFIG.apiBase;
  const inviteOn = () => state.tab === "invite" && !!state.code;
  const liveURLs = new Set();
  let probeSeq = 0, runSeq = 0;

  /* ── 작은 도구 ── */
  const pad2 = (n) => String(n).padStart(2, "0");
  function fmtClock(sec) { // 02:28, 1:02:03
    const s = Math.max(0, Math.floor((Number(sec) || 0) + 1e-6));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h ? h + ":" + pad2(m) : pad2(m)) + ":" + pad2(s % 60);
  }
  function fmtCueTime(sec) { // 00:12.3 (0.1초 아래 버림)
    const t = Math.floor(Math.max(0, Number(sec) || 0) * 10 + 1e-6);
    const s = Math.floor(t / 10), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h ? h + ":" + pad2(m) : pad2(m)) + ":" + pad2(s % 60) + "." + (t % 10);
  }
  function fmtSize(b) {
    if (!(b >= 0)) return "";
    if (b < 1024) return b + "B";
    if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + "KB";
    if (b < 1073741824) return (b / 1048576).toFixed(1) + "MB";
    return (b / 1073741824).toFixed(2) + "GB";
  }
  const fmtLen = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const setText = (node, txt) => { if (node.textContent !== txt) node.textContent = txt; };
  function say(node, kind, txt) {
    node.classList.toggle("is-ok", kind === "ok");
    node.classList.toggle("is-err", kind === "err");
    setText(node, txt);
  }
  function safeName(s) {
    const t = String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, "_").replace(/\s+/g, " ").replace(/^[\s.]+|[\s.]+$/g, "").slice(0, 80);
    return t || "자막";
  }
  const baseName = (name) => safeName(String(name || "").replace(/\.[^.\\/]{1,10}$/, ""));
  const fileName = (base, ext) => safeName(base) + CONFIG.fileSuffix + "." + ext;

  // 설정 문구의 숫자도 CONFIG에서 (data-cfg)
  function fillConfigText() {
    const v = {
      publicMin: String(Math.round(CONFIG.publicSeconds / 60)),
      inviteMin: String(Math.round(CONFIG.inviteSeconds / 60)),
      inviteLectures: String(CONFIG.inviteLectures),
      publicRuns: String(CONFIG.publicRunsPerDay),
    };
    d.querySelectorAll("[data-cfg]").forEach((n) => {
      const k = n.getAttribute("data-cfg");
      if (Object.prototype.hasOwnProperty.call(v, k)) n.textContent = v[k];
    });
  }

  /* ── 머리 띠 그림자 (next.js와 같게) ── */
  const onScroll = () => { if (el.head) el.head.classList.toggle("scrolled", root.scrollY > 8); };
  root.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ── 방식 탭 ── */
  function setTab(tab, focus) {
    state.tab = tab === "invite" ? "invite" : "public";
    const pub = state.tab === "public";
    el.tabPublic.setAttribute("aria-selected", String(pub));
    el.tabInvite.setAttribute("aria-selected", String(!pub));
    el.tabPublic.tabIndex = pub ? 0 : -1;
    el.tabInvite.tabIndex = pub ? -1 : 0;
    el.panelPublic.hidden = !pub;
    el.panelInvite.hidden = pub;
    if (focus) (pub ? el.tabPublic : el.tabInvite).focus();
    refresh();
  }
  el.tabPublic.addEventListener("click", () => setTab("public"));
  el.tabInvite.addEventListener("click", () => setTab("invite"));
  el.tabs.addEventListener("keydown", (e) => {
    const order = ["public", "invite"], i = order.indexOf(state.tab);
    let j = -1;
    if (e.key === "ArrowRight") j = (i + 1) % order.length;
    else if (e.key === "ArrowLeft") j = (i + order.length - 1) % order.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = order.length - 1;
    if (j < 0) return;
    e.preventDefault();
    setTab(order[j], true);
  });

  /* ── 초대 코드 (시안: 모양만 확인) ── */
  el.inviteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!live()) return;
    const raw = el.inviteInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(raw)) {
      state.code = "";
      el.inviteInput.setAttribute("aria-invalid", "true");
      say(el.inviteMsg, "err", raw ? "초대 코드를 다시 확인해 주세요. ‘SSR-7K2Q-9MPX’처럼 영문·숫자와 붙임표(-)로 되어 있습니다." : "초대 코드를 넣어 주세요.");
      el.inviteInput.focus();
      refresh();
      return;
    }
    el.inviteBtn.disabled = true;
    say(el.inviteMsg, "", "확인하고 있습니다…");
    try {
      const j = await api("/demo/invite/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: raw }) });
      state.code = raw;
      state.inviteLeft = j.lectures_left;
      state.inviteMax = j.max_min || Math.round(CONFIG.inviteSeconds / 60);
      state.inviteExp = j.expires || "";
      el.inviteInput.value = raw;
      el.inviteInput.removeAttribute("aria-invalid");
      say(el.inviteMsg, "ok", "초대 코드를 확인했습니다(" + raw + ").");
    } catch (err) {
      state.code = "";
      el.inviteInput.setAttribute("aria-invalid", "true");
      say(el.inviteMsg, "err", errText(err));
    }
    el.inviteBtn.disabled = false;
    refresh();
  });
  el.inviteInput.addEventListener("input", () => {
    el.inviteInput.removeAttribute("aria-invalid");
    if (state.code && el.inviteInput.value.trim().toUpperCase() !== state.code) {
      state.code = "";
      say(el.inviteMsg, "", "");
      refresh();
    } else if (!state.code && el.inviteMsg.classList.contains("is-err")) say(el.inviteMsg, "", "");
  });

  /* ── 1 영상 고르기 ── */
  const AUDIO_EXT = /\.(mp3|m4a|aac|wav|wave|oga|ogg|opus|flac|wma|amr|aiff?)$/i;
  const MEDIA_EXT = /\.(mp4|m4v|mov|qt|mkv|webm|avi|wmv|asf|flv|f4v|mpe?g|m2v|ts|mts|m2ts|3gp|3g2|ogv|vob|mxf|mp3|m4a|aac|wav|wave|oga|ogg|opus|flac|wma|amr|aiff?)$/i;
  const isMedia = (f) => /^(video|audio)\//i.test(f.type || "") || MEDIA_EXT.test(f.name || "");
  const isAudio = (f) => /^audio\//i.test(f.type || "") || (!f.type && AUDIO_EXT.test(f.name || ""));

  function showFileErr(txt) { setText(el.fileErr, txt); el.fileErr.hidden = !txt; }
  function gcURLs() { // 고른 영상이나 결과 화면이 쓰지 않는 주소는 놓아 줌
    const keep = new Set();
    if (state.source && state.source.url) keep.add(state.source.url);
    if (state.result && state.result.src.url) keep.add(state.result.src.url);
    for (const u of Array.from(liveURLs)) if (!keep.has(u)) { URL.revokeObjectURL(u); liveURLs.delete(u); }
  }
  function setSource(src) {
    state.runError = "";
    probeSeq++;
    state.source = src;
    gcURLs();
    refresh();
  }
  function chooseFile(file) {
    showFileErr("");
    if (!file) return;
    if (!isMedia(file)) { showFileErr("영상이나 소리 파일만 고를 수 있습니다(mp4, mov, webm, mp3, wav 등)."); return; }
    if (!file.size) { showFileErr("빈 파일입니다. 다른 파일을 골라 주세요."); return; }
    const url = URL.createObjectURL(file);
    liveURLs.add(url);
    setSource({ kind: "file", file, name: file.name, base: baseName(file.name), size: file.size, url, audio: isAudio(file), duration: null, probe: "loading", playable: null });
    probe(state.source);
    ensureTurnstile();
  }
  // 보이지 않는 <video>로 길이만 읽음. 못 읽어도 멈추지 않음
  function probe(src) {
    const my = probeSeq, v = d.createElement("video");
    let done = false, meta = false, vw = 0;
    const finish = (dur) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      try { v.load(); } catch (_) { /* 무시 */ }
      if (my !== probeSeq || state.source !== src) return;
      src.duration = dur > 0 && Number.isFinite(dur) ? dur : null;
      src.playable = meta;
      src.probe = meta ? "ok" : "fail";
      if (meta && !vw) src.audio = true;
      refresh();
    };
    const timer = setTimeout(() => finish(null), CONFIG.probeTimeout);
    v.addEventListener("loadedmetadata", () => {
      meta = true;
      vw = v.videoWidth;
      if (Number.isFinite(v.duration) && v.duration > 0) { finish(v.duration); return; }
      // 일부 webm은 길이를 바로 주지 않음: 끝으로 보내 길이를 얻음
      v.addEventListener("durationchange", () => { if (Number.isFinite(v.duration) && v.duration > 0) finish(v.duration); });
      try { v.currentTime = 1e101; } catch (_) { finish(null); }
    }, { once: true });
    v.addEventListener("error", () => finish(null), { once: true });
    v.preload = "metadata";
    v.muted = true;
    v.src = src.url;
  }
  function partText(s) {
    const inv = state.tab === "invite", lim = inv ? CONFIG.inviteSeconds : CONFIG.publicSeconds, min = Math.round(lim / 60);
    if (s.duration && s.duration <= lim) return "영상 전체(00:00~" + fmtClock(s.duration) + ")를 씁니다.";
    if (inv && state.inviteMax) return s.duration && s.duration <= state.inviteMax * 60 ? "영상 전체(00:00~" + fmtClock(s.duration) + ")를 씁니다." : "앞 " + state.inviteMax + "분까지 씁니다.";
    return inv ? "앞 " + min + "분까지 씁니다." : "앞 " + min + "분(00:00~" + fmtClock(lim) + ")만 씁니다.";
  }
  function renderSource() {
    const s = state.source;
    el.chosen.hidden = !s;
    el.stepFile.classList.toggle("is-done", !!s);
    if (!s) return;
    if (s.kind === "example") {
      setText(el.chosenName, "예시 강의: " + SAMPLE.title);
      el.chosenName.removeAttribute("title");
      setText(el.chosenMeta, "길이 " + fmtClock(SAMPLE_END) + " · 파일 없이 미리 받아쓴 강의입니다");
      el.chosenMeta.classList.remove("is-err");
      setText(el.chosenPart, "예시 강의 전체(00:00~" + fmtClock(SAMPLE_END) + ")를 씁니다.");
      return;
    }
    setText(el.chosenName, s.name);
    el.chosenName.title = s.name;
    const len = s.probe === "loading" ? "길이 확인 중…"
      : s.duration ? "길이 " + fmtClock(s.duration)
      : s.playable ? "길이를 알 수 없습니다"
      : "길이를 읽지 못했습니다(이 브라우저에서 열리지 않는 형식일 수 있습니다)";
    setText(el.chosenMeta, fmtSize(s.size) + " · " + len);
    el.chosenMeta.classList.toggle("is-err", s.probe === "fail");
    setText(el.chosenPart, partText(s));
  }

  el.pick.addEventListener("click", () => el.file.click());
  el.file.addEventListener("change", () => {
    const f = el.file.files && el.file.files[0];
    el.file.value = ""; // 같은 파일을 다시 골라도 알 수 있게
    chooseFile(f);
  });
  el.example.addEventListener("click", () => {
    showFileErr("");
    setSource({ kind: "example", name: "예시 강의", base: CONFIG.exampleBase, duration: SAMPLE_END, playable: true });
  });
  el.example2.addEventListener("click", () => el.example.click());
  el.chosenClear.addEventListener("click", () => { setSource(null); (live() ? el.pick : el.example2).focus(); });
  el.drop.addEventListener("click", (e) => { // 상자의 빈 곳을 눌러도 고르기
    if (state.run || e.target.closest("button, a, input")) return;
    el.file.click();
  });
  const hasFiles = (e) => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") !== -1);
  let dragDepth = 0;
  el.drop.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; el.drop.classList.add("is-over"); });
  el.drop.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  el.drop.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) el.drop.classList.remove("is-over"); });
  el.drop.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    el.drop.classList.remove("is-over");
    if (!state.run && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) chooseFile(e.dataTransfer.files[0]);
  });
  // 상자 밖에 떨어뜨려도 브라우저가 파일을 열며 페이지를 떠나지 않게
  root.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  root.addEventListener("drop", (e) => { if (hasFiles(e)) e.preventDefault(); });

  /* ── 2 설정 (슬라이더 ↔ 숫자 칸, 설정 ↔ 결과 화면) ── */
  const decimals = (step) => (String(step).split(".")[1] || "").length;
  const parseNum = (s) => { const t = String(s).trim().replace(",", "."); return t === "" || !Number.isFinite(+t) ? NaN : +t; };
  const showVal = (key, v) => (key === "maxChars" ? String(v) : v.toFixed(1));
  const LOGN = 1000; // 글자 수 슬라이더 눈금 0~1000 = 10~999자(로그)
  const toPos = (v) => { const r = CONFIG.range.maxChars; return Math.round(LOGN * Math.log(v / r.min) / Math.log(r.max / r.min)); };
  const fromPos = (pos) => { const r = CONFIG.range.maxChars; return Math.round(r.min * Math.pow(r.max / r.min, pos / LOGN)); };
  const ceilStep = (v, step) => Number((Math.ceil(v / step - 1e-9) * step).toFixed(decimals(step)));
  const maxDurMin = () => Math.max(CONFIG.range.maxDur.min, ceilStep(state.opts.minDur + CONFIG.durGap, CONFIG.range.maxDur.step));
  function snap(key, v) {
    const r = CONFIG.range[key], lo = key === "maxDur" ? maxDurMin() : r.min;
    if (!Number.isFinite(v)) v = state.opts[key];
    v = Math.min(r.max, Math.max(lo, v));
    v = r.min + Math.round((v - r.min) / r.step) * r.step;
    return Number(Math.min(r.max, Math.max(lo, v)).toFixed(decimals(r.step)));
  }
  function syncControls(except) {
    for (const key of KEYS) for (const [range, box] of pairs[key]) {
      if (key === "maxDur") { range.min = String(maxDurMin()); box.min = String(maxDurMin()); }
      if (range !== except) range.value = String(key === "maxChars" ? toPos(state.opts[key]) : state.opts[key]);
      if (key === "maxChars") range.setAttribute("aria-valuetext", state.opts.maxChars + "자");
      if (box !== except) box.value = showVal(key, state.opts[key]);
    }
  }
  function setOpt(key, v, from) {
    const before = KEYS.map((k) => state.opts[k]).join("|");
    state.opts[key] = snap(key, v);
    if (key === "minDur" && state.opts.maxDur < maxDurMin()) { // 최대 표시 시간은 늘 최소보다 길게
      state.opts.maxDur = maxDurMin();
      say(el.setMsg, "ok", "최대 표시 시간을 " + state.opts.maxDur.toFixed(1) + "초로 올렸습니다(최소 표시 시간보다 " + CONFIG.durGap + "초 이상 길어야 합니다).");
    }
    syncControls(from);
    if (before !== KEYS.map((k) => state.opts[k]).join("|")) resplit();
  }
  for (const key of KEYS) {
    const r = CONFIG.range[key];
    for (const [range, box] of pairs[key]) {
      if (key === "maxChars") { range.min = "0"; range.max = String(LOGN); range.step = "1"; }
      else { range.min = String(r.min); range.max = String(r.max); range.step = String(r.step); }
      box.min = String(r.min); box.max = String(r.max); box.step = String(r.step);
      range.addEventListener("input", () => setOpt(key, key === "maxChars" ? fromPos(+range.value) : +range.value, range));
      box.addEventListener("input", () => { const v = parseNum(box.value); if (v >= r.min && v <= r.max) setOpt(key, v, box); });
      box.addEventListener("change", () => setOpt(key, parseNum(box.value), null));
    }
  }
  el.reset.addEventListener("click", () => {
    for (const key of KEYS) setOpt(key, CONFIG[key], null);
    say(el.setMsg, "ok", "기본값으로 되돌렸습니다.");
    clearTimeout(el.setMsg._t);
    el.setMsg._t = setTimeout(() => say(el.setMsg, "ok", ""), 3000);
  });

  /* ── 3 확인과 만들기 단추 ── */
  [el.agree1, el.agree2].forEach((c) => c.addEventListener("change", refresh));
  function blocker() {
    const s = state.source, file = !!s && s.kind === "file";
    if (state.run) return { block: true, text: "만드는 중입니다…" };
    if (!s) return { block: true, text: live() ? "영상을 고르거나 ‘예시 강의로 보기’를 눌러 주세요." : "‘예시 강의로 보기’를 눌러 주세요." };
    if (file && !live()) return { block: true, text: "내 영상 체험은 서버 연결 작업 중입니다. 예시 강의로 보실 수 있습니다." };
    if (file && state.server === "down") return { block: true, text: state.serverMsg || "지금은 자막 서버에 연결할 수 없습니다. 예시 강의는 바로 보실 수 있습니다." };
    if (file && state.tab === "invite" && !state.code) return { block: true, text: "초대 코드를 먼저 확인해 주세요." };
    if (file && state.tab === "public" && state.publicLeft <= 0) return { block: true, text: "오늘 체험을 모두 쓰셨습니다. 예시 강의로 보시거나 초대 코드를 요청해 주세요." };
    if (file && inviteOn() && state.inviteLeft <= 0) return { block: true, text: "초대 코드로 쓸 수 있는 강의를 모두 쓰셨습니다." };
    if (!el.agree1.checked || !el.agree2.checked) return { block: true, text: "위의 두 가지를 확인해 주세요." };
    if (file && !tsToken()) return { block: true, text: CONFIG.turnstileSiteKey ? "사람 확인을 해 주세요." : "사람 확인을 준비하고 있습니다." };
    return { block: false, text: file ? "준비되었습니다. ‘자동 자막 만들기’를 눌러 주세요." : "준비되었습니다. 예시 강의로 만들어 봅니다." };
  }
  function refresh() {
    el.tiers.forEach((li) => {
      const on = li.getAttribute("data-tier") === state.tab;
      li.classList.toggle("is-now", on);
      if (on) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    const on = live();
    el.offline.hidden = on;
    el.drop.hidden = !on;
    el.panelInvite.querySelectorAll("[data-offline-note]").forEach((n) => { n.hidden = on; });
    el.inviteInput.disabled = !on;
    if (el.inviteBtn) el.inviteBtn.disabled = !on;
    el.publicQuota.hidden = !on || state.server !== "up";
    const info = on && state.server === "up" && !!state.notice; // 열려 있을 때의 점검 안내 한 줄
    el.serverNote.hidden = !(on && (state.server === "down" || info));
    el.serverNote.classList.toggle("is-err", state.server === "down");
    el.serverNote.classList.toggle("is-info", info);
    setText(el.serverNote, state.server === "down" ? (state.serverMsg || "지금은 자막 서버에 연결할 수 없습니다.") + " 예시 강의는 바로 보실 수 있습니다." : info ? "안내: " + state.notice : "");
    setText(el.publicLeft, String(state.publicLeft));
    setText(el.publicMax, String(state.publicMax));
    setText(el.inviteLeft, String(state.inviteLeft));
    setText(el.inviteMax, String(state.inviteMax || Math.round(CONFIG.inviteSeconds / 60)));
    setText(el.inviteExp, state.inviteExp ? " · " + state.inviteExp + "까지" : "");
    el.inviteOk.hidden = !state.code;
    el.reqForm.hidden = !on || !!state.code || !!state.reqDone || state.reqOff;
    el.reqDone.hidden = !state.reqDone;
    if (state.tab === "invite" && !el.reqForm.hidden) ensureReqTurnstile();
    renderSource();
    el.stepGo.classList.toggle("is-done", el.agree1.checked && el.agree2.checked);
    const b = blocker();
    el.make.disabled = b.block;
    setText(el.makeHint, b.text);
    el.makeHint.classList.toggle("is-ready", !b.block);
    el.makeHint.classList.toggle("is-err", !!state.runError && !state.run);
    if (state.runError && !state.run) { setText(el.makeHint, state.runError); el.makeHint.classList.remove("is-ready"); }
    renderDownloads();
  }
  el.make.addEventListener("click", start);
  el.cancel.addEventListener("click", cancel);

  /* ── 진행 (흉내) ── */
  function setBusy(on) {
    el.bench.toggleAttribute("inert", on);
    el.bench.classList.toggle("is-busy", on);
    if (on) el.bench.setAttribute("aria-busy", "true"); else el.bench.removeAttribute("aria-busy");
  }
  function start() {
    if (blocker().block) return;
    state.runError = "";
    const run = { id: ++runSeq, src: state.source, mode: inviteOn() ? "invite" : "public", t0: performance.now(), timers: [], tick: 0, total: 0, step: -1 };
    state.run = run;
    stopPlayback();
    el.result.hidden = true;
    el.progSteps.innerHTML = CONFIG.simSteps.map((s) => '<li><i aria-hidden="true"></i><span>' + esc(s.label) + "</span></li>").join("");
    el.progBar.classList.remove("is-done");
    el.progFill.style.width = "0%";
    el.progBar.setAttribute("aria-valuenow", "0");
    setText(el.progTime, "경과 0초");
    setText(el.progNow, "");
    el.progress.hidden = false;
    setBusy(true);
    refresh();
    el.cancel.focus({ preventScroll: true });
    el.progress.scrollIntoView({ block: "nearest", behavior: smooth() });
    if (run.src.kind === "file" && live()) { run.live = true; run.tick = setInterval(() => tick(run), 250); startLive(run); return; }
    let at = 0;
    CONFIG.simSteps.forEach((s, i) => { run.timers.push(setTimeout(() => enterStep(run, i), at)); at += s.ms; });
    run.total = at;
    run.timers.push(setTimeout(() => finish(run), at));
    run.tick = setInterval(() => tick(run), 100);
  }
  function enterStep(run, i) {
    if (state.run !== run) return;
    run.step = i;
    const items = el.progSteps.children, last = CONFIG.simSteps.length - 1;
    for (let k = 0; k < items.length; k++) {
      const done = k < i || (i === last && k === last), on = k === i && i !== last;
      items[k].classList.toggle("is-done", done);
      items[k].classList.toggle("is-on", on);
      if (on) items[k].setAttribute("aria-current", "step"); else items[k].removeAttribute("aria-current");
    }
    setText(el.progNow, CONFIG.simSteps[i].now + (i < last ? " (" + (i + 1) + "/" + (last + 1) + ")" : ""));
    tick(run);
  }
  function tick(run) {
    if (state.run !== run) return;
    const ms = performance.now() - run.t0;
    setText(el.progTime, "경과 " + Math.floor(ms / 1000) + "초");
    if (run.live) return;
    // 움직임 줄이기: 막대가 흐르지 않고 단계가 끝날 때만 한 칸씩
    const pct = reduceMQ.matches ? (Math.max(0, run.step) / CONFIG.simSteps.length) * 100 : Math.min(100, (ms / run.total) * 100);
    el.progFill.style.width = pct.toFixed(1) + "%";
    el.progBar.setAttribute("aria-valuenow", String(Math.round(pct)));
  }
  function stopRun(run) {
    run.timers.forEach(clearTimeout);
    clearInterval(run.tick);
    if (run.liveTimer) { clearInterval(run.liveTimer); run.liveTimer = null; }
    if (run.xhr) try { run.xhr.abort(); } catch (_) { /* 이미 끝남 */ }
    if (run.ff) try { run.ff.terminate(); } catch (_) { /* 이미 끝남 */ }
    run.xhr = run.ff = null;
    state.run = null;
    setBusy(false);
  }
  function finish(run) {
    if (state.run !== run) return;
    stopRun(run);
    if (!run.live && (run.src.kind === "file" || CONFIG.countExampleRuns)) {
      if (run.mode === "invite") state.inviteLeft = Math.max(0, state.inviteLeft - 1);
      else state.publicLeft = Math.max(0, state.publicLeft - 1);
    }
    el.progFill.style.width = "100%";
    el.progBar.setAttribute("aria-valuenow", "100");
    el.progBar.classList.add("is-done");
    el.progress.hidden = true;
    showResult(run);
    refresh();
  }
  function cancel() {
    const run = state.run;
    if (!run) return;
    stopRun(run);
    el.progress.hidden = true;
    refresh();
    setText(el.makeHint, "만들기를 취소했습니다. 다시 하시려면 ‘자동 자막 만들기’를 눌러 주세요.");
    el.makeHint.classList.remove("is-ready");
    el.make.focus();
  }

  /* ── 결과 ── */
  function showResult(run) {
    const src = run.src, limit = run.mode === "invite" ? CONFIG.inviteSeconds : CONFIG.publicSeconds;
    const useVideo = src.kind === "file" && src.playable !== false;
    const clipAt = src.kind === "file" && src.duration ? Math.min(src.duration, limit) : limit;
    const end = src.kind === "example" ? SAMPLE_END : src.duration ? Math.min(src.duration, limit) : Math.min(limit, SAMPLE_END);
    if (run.server) { // 실제 결과: 서버 자막을 그대로 먼저
      const R = run.server, sents = Array.isArray(R.sentences) ? R.sentences : [];
      const sentences = sents.map((x) => (Array.isArray(x.words) && x.words.length ? x.words : [{ w: x.t, s: x.s, e: x.e }]).map((w) => ({ w: String(w.w || ""), s: +w.s, e: +w.e }))).filter((ws) => ws.length);
      const serverCues = (Array.isArray(R.cues) ? R.cues : []).map((c, i) => ({ id: i + 1, start: +c.s, end: +c.e, text: String(c.t || ""), flags: [] }));
      state.result = { src, mode: run.mode, end: src.duration ? Math.min(src.duration, end) : (+R.duration || end), sentences, serverCues, cues: serverCues,
        serverSettings: R.settings || {}, title: src.base, base: src.base, useVideo, live: true };
    } else {
      const sentences = SSRSplit.clipSentences(SAMPLE.sentences, clipAt);
      state.result = { src, mode: run.mode, end, sentences, cues: [], title: src.kind === "example" ? SAMPLE.title : src.base, base: src.base, useVideo };
      state.result.cues = SSRSplit.split(sentences, state.opts);
    }
    state.result.view = SSRSplit.bridge(state.result.cues, CONFIG.bridgeGap);
    setText(el.resultMeta, src.kind === "example"
      ? "예시 강의 ‘" + SAMPLE.title + "’로 만든 자동 자막입니다."
      : "‘" + src.name + "’ " + (src.duration && src.duration <= limit ? "전체" : "앞 " + Math.round(limit / 60) + "분") + "으로 만든 자동 자막입니다.");
    setupPlayer(state.result);
    noteResplit();
    gcURLs(); // 화면이 새 영상으로 바뀐 뒤에 앞 영상 주소를 놓아 줌
    renderCues();
    renderStats();
    renderDownloads();
    el.result.hidden = false;
    el.cues.open = !phoneMQ.matches; // 휴대폰에서는 목록을 접어 둠
    paint(true);
    el.resultTitle.focus({ preventScroll: true });
    el.result.scrollIntoView({ block: "start", behavior: smooth() });
  }

  // 자막 목록 칸 (SS_SubEditor _calcCells와 같은 셈): 길이 = ms로 반올림, CPS = 띄어쓰기 뺀 글자 ÷ 길이, 글자 = text.length
  function cellInfo(c, o) {
    const dur = Math.round((c.end - c.start) * 1000) / 1000, text = String(c.text || "");
    const chars = text.length, cps = dur > 0 ? Math.round((text.replace(/\s/g, "").length / dur) * 10) / 10 : null;
    const durErr = dur < o.minDur || dur > o.maxDur, charsErr = chars > o.maxChars, cpsErr = cps != null && cps > CONFIG.maxCps;
    return { dur, chars, cps, durErr, charsErr, cpsErr,
      durTip: !durErr ? "" : dur < o.minDur ? "최소 표시 시간 " + o.minDur.toFixed(1) + "초보다 짧음" : "최대 표시 시간 " + o.maxDur.toFixed(1) + "초보다 김",
      charsTip: charsErr ? "한 줄 최대 글자 수 " + o.maxChars + "자보다 많음" : "",
      cpsTip: cpsErr ? "초당 글자 수(CPS)가 " + CONFIG.maxCps + "보다 많음(읽기에 빠름)" : "" };
  }
  function timecode(sec, short) { // SS_SubEditor secToTimecode: HH:MM:SS.mmm (휴대폰은 시간이 0이면 MM:SS.mmm)
    const ms = Math.round(Math.max(0, Number(sec) || 0) * 1000), h = Math.floor(ms / 3600000);
    const t = pad2(Math.floor(ms / 60000) % 60) + ":" + pad2(Math.floor(ms / 1000) % 60) + "." + String(ms % 1000).padStart(3, "0");
    return short && !h ? t : pad2(h) + ":" + t;
  }
  function renderStats() {
    const r = state.result;
    if (!r) return;
    let longest = 0, total = 0, red = 0;
    for (const c of r.cues) {
      const k = cellInfo(c, state.opts);
      if (k.chars > longest) longest = k.chars;
      total += c.end - c.start;
      red += (k.durErr ? 1 : 0) + (k.charsErr ? 1 : 0) + (k.cpsErr ? 1 : 0);
    }
    const n = r.cues.length;
    setText(el.stN, String(n));
    setText(el.stLong, fmtLen(longest));
    setText(el.stAvg, n ? (total / n).toFixed(1) : "0");
    setText(el.stRed, String(red));
    el.stRedWrap.hidden = !red;
    setText(el.cueCount, "(" + n + "개)");
  }
  function renderCues() {
    const r = state.result, o = state.opts, short = phoneMQ.matches;
    const cell = (cls, txt, err, tip) => '<span class="t-c ' + cls + (err ? " cell-error" : "") + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">" + txt + "</span>";
    el.cueList.innerHTML = r.cues.map((c, i) => {
      const k = cellInfo(c, o), tc = timecode(c.start, short), cps = k.cps == null ? "—" : String(Math.round(k.cps));
      const why = [k.durTip, k.charsTip, k.cpsTip].filter(Boolean).join(", ");
      const label = tc + " 시작, " + k.dur.toFixed(1) + "초, CPS " + cps + ", " + Math.ceil(k.chars) + "자" + (why ? " (" + why + ")" : "") + ": " + c.text;
      return '<li class="t-cue' + (why ? " is-flag" : "") + '"><button type="button" data-i="' + i + '" aria-label="' + esc(label) + '">' +
        cell("c-s", tc) + cell("c-d", k.dur.toFixed(1), k.durErr, k.durTip) + '<span class="t-c c-t">' + esc(c.text) + "</span>" +
        cell("c-cps", cps, k.cpsErr, k.cpsTip) + cell("c-n", String(Math.ceil(k.chars)), k.charsErr, k.charsTip) + "</button></li>";
    }).join("");
    curIdx = -2;
  }
  function noteResplit() {
    const r = state.result, n = el.resplitNote;
    if (!r || !r.live) { n.hidden = true; return; }
    const orig = r.serverSettings.max_char;
    n.hidden = false;
    setText(n, !r.sentences.length ? "이 결과는 문장 정보가 없어 줄을 다시 나눌 수 없습니다. 서버가 만든 자막 그대로입니다."
      : state.opts.maxChars !== orig ? "서버 자막(한 줄 최대 " + orig + "자)을 " + state.opts.maxChars + "자로 다시 나눠 보여 드립니다. " + orig + "자로 돌리면 서버 자막으로 돌아갑니다."
      : "서버가 만든 자막 그대로입니다.");
  }
  function resplit() {
    const r = state.result;
    if (!r) return;
    if (r.live) { // 실제 결과: 글자 수가 바뀔 때만 문장에서 다시 나누고, 원래 값이면 서버 자막
      r.cues = !r.sentences.length || state.opts.maxChars === r.serverSettings.max_char ? r.serverCues : SSRSplit.split(r.sentences, state.opts);
      noteResplit();
    } else r.cues = SSRSplit.split(r.sentences, state.opts);
    r.view = SSRSplit.bridge(r.cues, CONFIG.bridgeGap);
    renderCues();
    renderStats();
    renderDownloads();
    paint(true);
  }

  /* ── 메일 미리 채우기: 누르는 순간의 값으로 ── */
  function mailto(subject, lines) {
    return "mailto:" + CONFIG.mail + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(lines.join("\r\n"));
  }
  function trialMail() {
    const s = (state.result && state.result.src) || state.source;
    const from = !s ? "예시 강의" : s.kind === "file" ? s.name : "예시 강의";
    return mailto("[무료 시험 신청] 강의 3편", ["기관(회사)명: ", "담당자·연락처: ", "강의 3편(제목·길이): ", "자막 규격(한 줄 최대 글자 수 등): ", "",
      "— 체험에서 넘어옴: " + from + ", 한 줄 최대 " + state.opts.maxChars + "자"]);
  }
  const inviteMail = () => mailto("[초대 코드 요청]", ["기관(회사)명: ", "담당자·연락처: ", "체험하려는 강의 수와 길이: "]);
  d.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
    const h = a.getAttribute("href");
    const make = h.indexOf("%EB%AC%B4%EB%A3%8C%20%EC%8B%9C%ED%97%98") !== -1 ? trialMail : h.indexOf("%EC%B4%88%EB%8C%80%20%EC%BD%94%EB%93%9C") !== -1 ? inviteMail : null;
    if (!make || a.closest(".site-head, .site-foot")) return;
    const update = () => { a.href = make(); };
    a.addEventListener("click", update);
    a.addEventListener("focus", update);
    a.addEventListener("pointerenter", update);
    update();
  });

  /* ── 실제 연결: 문지기 API (demo_api_contract.md §A) ── */
  const ERR = {
    bad_request: "보낸 값이 올바르지 않습니다.", turnstile: "사람 확인이 끝나지 않았습니다. 다시 확인해 주세요.",
    invite_invalid: "초대 코드를 찾을 수 없습니다.", invite_used_up: "이 초대 코드로 만들 수 있는 강의를 모두 쓰셨습니다.", invite_expired: "초대 코드의 기한이 지났습니다.",
    too_long: "영상이 체험할 수 있는 길이보다 깁니다.", too_large: "보낼 소리 파일이 너무 큽니다.", limit_ip: "오늘 체험 횟수를 모두 쓰셨습니다.",
    limit_global: "오늘은 체험이 많아 더 받을 수 없습니다.", not_found: "작업을 찾을 수 없습니다.", expired: "결과를 보관하는 시간(24시간)이 지났습니다.",
    server_off: "자막 서버가 잠시 꺼져 있습니다.", server_busy: "자막 서버가 지금 바쁩니다.", failed: "자막을 만들지 못했습니다.", internal: "잠시 문제가 생겼습니다.",
    network: "서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.",
    limit_request: "같은 이메일 또는 같은 네트워크로 30일 안에 이미 초대 코드를 받으셨습니다.", self_invite_off: "지금은 메일로 신청해 주세요.",
  };
  function errText(e) {
    let t = (e && e.message) || ERR[e && e.code] || (e && e.status ? ERR.internal : ERR.network);
    if (e && e.status === 429) t += " " + (e.retry ? "약 " + Math.max(1, Math.ceil(e.retry / 60)) + "분 뒤에 " : "잠시 뒤에 ") + "다시 해 보세요.";
    return t;
  }
  async function api(path, opts) {
    let res;
    try { res = await fetch(CONFIG.apiBase + path, Object.assign({ cache: "no-store" }, opts)); } catch (_) { throw Object.assign(new Error(""), { code: "network" }); }
    let body = null;
    try { body = await res.json(); } catch (_) { /* 본문 없음 */ }
    if (!res.ok) throw Object.assign(new Error((body && body.message) || ""), { status: res.status, code: body && body.error, retry: body && body.retry_after });
    return body || {};
  }
  // 잠깐의 끊김(와이파이, 서버 통로 다시 연결)은 조금씩 더 기다렸다가 다시 물어봄 — 약 1분 동안 5번까지.
  // 문지기가 작업과 결과를 보관하므로, 끊겼다고 체험 횟수(공개)나 강의 수(초대)를 다시 쓰지 않아도 됩니다.
  async function apiRetry(path, run, ok) {
    const waits = CONFIG.api.retryMs;
    for (let i = 0; ; i++) {
      let err;
      try {
        const j = await api(path);
        if (ok(j)) return j;
        err = Object.assign(new Error(""), { code: "internal", transient: true }); // 200인데 본문이 비었거나 끊김
      } catch (e) { err = e; }
      const transient = err.transient || err.code === "network" || err.status === 502 || err.status === 503 || err.status === 504;
      if (!transient || i >= waits.length || state.run !== run) throw err;
      setText(el.progNow, "연결이 잠시 끊겨 다시 확인하고 있습니다… (" + (i + 1) + "/" + waits.length + ")");
      await wait(waits[i]);
      if (state.run !== run) throw Object.assign(new Error(""), { code: "aborted" });
    }
  }
  async function loadStatus() {
    if (!live()) return;
    try {
      const j = await api("/demo/status");
      // 관리자 화면에서 체험을 닫았거나(open:false) 점검 안내(notice)를 넣었을 때
      state.closed = j.open === false;
      state.notice = typeof j.notice === "string" ? j.notice.trim().slice(0, 200) : "";
      state.server = j.server === "down" || state.closed ? "down" : "up";
      state.serverMsg = state.closed ? (state.notice || "지금은 자동 자막 체험을 잠시 쉬고 있습니다. 곧 다시 열겠습니다.")
        : j.server === "down" ? "지금은 자막 서버가 쉬고 있습니다." : "";
      if (j.public_left != null) state.publicLeft = j.public_left;
      if (j.public_max != null) state.publicMax = j.public_max;
    } catch (e) { state.server = "down"; state.serverMsg = errText(e); }
    refresh();
  }
  // Cloudflare Turnstile: 내 영상을 고를 때만 불러와 사람 확인 자리에 그림, 한 번 쓰면 다시 받음
  let tsLoad = null;
  const tsToken = () => (TS_SKIP ? "test-skip" : state.tsToken);
  function ensureTurnstile() {
    if (!live()) return;
    if (TS_SKIP) { setText(el.human, "사람 확인(시험 모드: 건너뜀)"); return; }
    if (!CONFIG.turnstileSiteKey || state.tsWidget != null) return;
    loadTs().then(() => {
      if (state.tsWidget != null || !root.turnstile) return;
      el.human.textContent = "";
      state.tsWidget = root.turnstile.render(el.human, {
        sitekey: CONFIG.turnstileSiteKey, language: "ko",
        callback: (tok) => { state.tsToken = tok; refresh(); },
        "expired-callback": () => { state.tsToken = ""; refresh(); },
        "error-callback": () => { state.tsToken = ""; refresh(); },
      });
    }).catch(() => setText(el.human, "사람 확인을 불러오지 못했습니다. 새로 고침해 보세요."));
  }
  function tsReset() {
    state.tsToken = "";
    if (state.tsWidget != null && root.turnstile) try { root.turnstile.reset(state.tsWidget); } catch (_) { /* 무시 */ }
  }
  function loadTs() {
    if (!tsLoad) tsLoad = new Promise((res, rej) => {
      const sc = d.createElement("script");
      sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      sc.async = true; sc.onload = res; sc.onerror = rej;
      d.head.appendChild(sc);
    });
    return tsLoad;
  }
  // 초대 코드 자동 발급 칸의 사람 확인(두 번째 위젯) — 초대 코드 탭이 보일 때만 그림
  function ensureReqTurnstile() {
    if (!live()) return;
    if (TS_SKIP) { setText(el.reqHuman, "사람 확인(시험 모드: 건너뜀)"); return; }
    if (!CONFIG.turnstileSiteKey || state.reqWidget != null) return;
    loadTs().then(() => {
      if (state.reqWidget != null || !root.turnstile) return;
      el.reqHuman.textContent = "";
      state.reqWidget = root.turnstile.render(el.reqHuman, {
        sitekey: CONFIG.turnstileSiteKey, language: "ko",
        callback: (tok) => { state.reqToken = tok; },
        "expired-callback": () => { state.reqToken = ""; },
        "error-callback": () => { state.reqToken = ""; },
      });
    }).catch(() => setText(el.reqHuman, "사람 확인을 불러오지 못했습니다. 새로 고침해 보세요."));
  }
  const reqToken = () => (TS_SKIP ? "test-skip" : state.reqToken);
  function reqReset() {
    state.reqToken = "";
    if (state.reqWidget != null && root.turnstile) try { root.turnstile.reset(state.reqWidget); } catch (_) { /* 무시 */ }
  }
  // 초대 코드 자동 발급(계약 v1.2 §A7): 이름·기관·이메일 + 사람 확인 → 코드가 바로 나오고 위 칸에 넣어 확인까지 함
  el.reqForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.reqBusy) return;
    const name = el.reqName.value.trim(), org = el.reqOrg.value.trim(), email = el.reqEmail.value.trim();
    const bad = [[el.reqOrg, !org || org.length > 80, "기관·회사 이름을 넣어 주세요(80자 이하)."],
      [el.reqEmail, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120, "이메일 주소를 올바르게 넣어 주세요."], [el.reqName, name.length > 40, "이름은 40자 이하로 넣어 주세요."]];
    [el.reqName, el.reqOrg, el.reqEmail].forEach((i) => i.removeAttribute("aria-invalid"));
    const first = bad.find((b) => b[1]);
    if (first) { first[0].setAttribute("aria-invalid", "true"); say(el.reqMsg, "err", first[2]); first[0].focus(); return; }
    const token = reqToken();
    if (!token) { say(el.reqMsg, "err", "사람 확인을 먼저 해 주세요."); return; }
    state.reqBusy = true; el.reqBtn.disabled = true;
    say(el.reqMsg, "", "초대 코드를 만들고 있습니다…");
    try {
      const j = await api("/demo/invite/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, org: org, email: email, consent: !!el.reqConsent.checked, turnstile: token }) });
      const code = String(j.code || "").toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(code)) throw Object.assign(new Error(""), { code: "internal" });
      state.reqDone = code;
      setText(el.reqCode, code);
      say(el.reqMsg, "", "");
      el.inviteInput.value = code;
      el.inviteInput.removeAttribute("aria-invalid");
      refresh();
      if (typeof el.inviteForm.requestSubmit === "function") el.inviteForm.requestSubmit(); else el.inviteForm.dispatchEvent(new Event("submit", { cancelable: true }));
      el.reqDone.scrollIntoView({ block: "nearest", behavior: smooth() });
    } catch (err) {
      reqReset();
      if (err && (err.status === 404 || err.code === "self_invite_off")) {
        state.reqOff = true; // 문지기에 아직 자동 발급이 없거나 꺼 둠 → 메일 신청으로
        say(el.reqMsg, "", "");
        refresh();
        const a = el.reqMail.querySelector("a");
        if (a) a.href = mailto("[초대 코드 요청]", ["기관(회사)명: " + org, "이메일: " + email, "이름(선택): " + name, "체험하려는 강의 수와 길이: "]);
        say(el.inviteMsg, "err", "지금은 자동 발급이 닫혀 있습니다. 아래 메일로 요청해 주시면 코드를 보내 드립니다.");
      } else if (err && err.code === "turnstile") {
        say(el.reqMsg, "err", "사람 확인이 지났습니다. 다시 확인한 뒤 눌러 주세요.");
      } else if (err && err.code === "limit_request") {
        say(el.reqMsg, "err", (err.message || ERR.limit_request) + " 그 코드를 쓰시거나 아래 메일로 문의해 주세요.");
      } else {
        say(el.reqMsg, "err", errText(err));
      }
    }
    state.reqBusy = false; el.reqBtn.disabled = false;
  });
  // 브라우저에서 소리만 뽑기: ffmpeg.wasm(단일 스레드, /vendor/ffmpeg/), 파일은 WORKERFS로 붙여 통째로 복사하지 않음
  const loadScript = (src) => new Promise((res, rej) => { const sc = d.createElement("script"); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error("script")); d.head.appendChild(sc); });
  const absURL = (u) => new URL(u, root.location.href).href;
  function audioErr(code, log) {
    if (/does not contain any stream|matches no streams|Output file is empty|Stream map .* matches no streams/i.test(log)) return { code: "noaudio", message: "이 영상에는 소리가 없습니다. 소리가 있는 영상을 골라 주세요." };
    if (/memory|OOM|Cannot enlarge memory|RangeError/i.test(log)) return { code: "oom", message: "기기 메모리가 부족해 소리를 뽑지 못했습니다. PC에서 하시거나 더 짧은 영상으로 해 보세요." };
    return { code: "unsupported", message: "이 파일은 읽을 수 없는 형식입니다. mp4·mov·webm 같은 영상으로 해 보세요." };
  }
  async function extractAudio(file, limit, onProgress, run) {
    const base = CONFIG.api.ffmpegBase;
    try { if (!root.FFmpegWASM) await loadScript(base + "ffmpeg.js"); } catch (_) { throw new Error("소리 뽑기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요."); }
    const ff = new root.FFmpegWASM.FFmpeg();
    run.ff = ff;
    const tail = [];
    let lastTime = 0;
    ff.on("log", ({ message }) => {
      tail.push(message);
      if (tail.length > 80) tail.shift();
      const m = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
      if (m) { lastTime = +m[1] * 3600 + +m[2] * 60 + +m[3]; onProgress(Math.min(1, lastTime / limit)); }
    });
    let code;
    try {
      await ff.load({ coreURL: absURL(base + "ffmpeg-core.js"), wasmURL: absURL(base + "ffmpeg-core.wasm") }); // classWorkerURL을 주면 모듈 워커가 되어 UMD 조각이 멈춤 — 주지 않음(ffmpeg.js 위치 기준으로 자동)
      await ff.createDir("/in");
      await ff.mount("WORKERFS", { files: [file] }, "/in");
      code = await ff.exec(["-hide_banner", "-t", limit.toFixed(3), "-i", "/in/" + file.name, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "32k", "out.m4a"]);
    } catch (e) {
      if (state.run !== run) throw Object.assign(new Error(""), { code: "aborted" });
      const x = audioErr(-1, String(e && (e.message || e)) + "\n" + tail.join("\n"));
      throw Object.assign(new Error(x.message), { code: x.code });
    }
    if (code !== 0) { const x = audioErr(code, tail.join("\n")); throw Object.assign(new Error(x.message), { code: x.code }); }
    const data = await ff.readFile("out.m4a");
    try { await ff.unmount("/in"); } catch (_) { /* 무시 */ }
    ff.terminate();
    run.ff = null;
    if (!data || !data.length) { const x = audioErr(1, "Output file is empty"); throw Object.assign(new Error(x.message), { code: x.code }); }
    const blob = new Blob([data.buffer], { type: "audio/mp4" });
    const dur = (await blobDuration(blob)) || lastTime || Math.min(limit, run.src.duration || limit);
    return { blob, dur: Math.min(dur, limit) };
  }
  function blobDuration(blob) { // 보낼 소리 길이를 잼(못 재면 ffmpeg 기록의 마지막 시각)
    return new Promise((res) => {
      const a = d.createElement("audio"), u = URL.createObjectURL(blob);
      const done = (v) => { clearTimeout(t); URL.revokeObjectURL(u); a.removeAttribute("src"); res(v > 0 && Number.isFinite(v) ? v : 0); };
      const t = setTimeout(() => done(0), 4000);
      a.preload = "metadata";
      a.onloadedmetadata = () => done(a.duration);
      a.onerror = () => done(0);
      a.src = u;
    });
  }
  // 소리만 보내기(계약 v1.1 §A3): 본문 = 소리 파일 그대로, 설정은 주소 뒤(?mode=…), 사람 확인·초대 코드는 머리글.
  // 문지기가 본문을 읽지 않고 서버로 흘려 보내므로 큰 파일(초대 40MB)도 됩니다. 올리기 진행률은 그대로 보입니다.
  function upload(path, blob, headers, onProgress, run) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      run.xhr = x;
      x.open("POST", CONFIG.apiBase + path);
      x.setRequestHeader("Content-Type", blob.type || "audio/mp4");
      Object.keys(headers).forEach((k) => x.setRequestHeader(k, headers[k]));
      x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = () => {
        run.xhr = null;
        let j = null;
        try { j = JSON.parse(x.responseText); } catch (_) { /* 본문 없음 */ }
        if (x.status >= 200 && x.status < 300 && j && j.ticket) resolve(j);
        else reject(Object.assign(new Error((j && j.message) || ""), { status: x.status, code: j && j.error, retry: j && j.retry_after }));
      };
      x.onerror = () => { run.xhr = null; reject(Object.assign(new Error(""), { code: "network" })); };
      x.onabort = () => reject(Object.assign(new Error(""), { code: "aborted" }));
      x.send(blob);
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function liveStep(run, i, frac, st) {
    if (state.run !== run) return;
    if (run.step !== i) enterStep(run, i);
    const pct = [0, 30, 45, 70, 100][i] + (i < 2 && frac != null ? (i === 0 ? 30 : 15) * frac : 0);
    el.progFill.style.width = pct.toFixed(1) + "%";
    el.progBar.setAttribute("aria-valuenow", String(Math.round(pct)));
    let txt = CONFIG.simSteps[i].now;
    if (i < 2 && frac != null) txt += " " + Math.round(frac * 100) + "%";
    if (st && st.status === "queued") txt = "차례를 기다리고 있습니다" + (st.wait_sec ? "(약 " + Math.ceil(st.wait_sec) + "초)" : "") + ".";
    if (st && st.message) txt += " " + st.message;
    setText(el.progNow, txt);
    if (st && (i === 2 || i === 3)) liveClock(run, st.status === "queued" ? "q" : i, st);
    else if (run.liveTimer) { clearInterval(run.liveTimer); run.liveTimer = null; }
  }
  // 서버 단계 동안 1초마다 경과 시간·예상 시간을 보여 줌 (웹에서 대략 추산 — 서버가 세부 단계를 알려 주기 전까지의 임시 방법)
  const LIVE_EST = {
    q: { now: "차례를 기다리고 있습니다", base: 0, perSec: 0 },
    2: { now: "받아쓰고 어절마다 시간을 맞추고 있습니다", base: 15, perSec: 0.06 },
    3: { now: "Gemini로 표기를 다듬고 자막 줄을 나누고 있습니다", base: 20, perSec: 0.12 },
  };
  function fmtSec(sec) {
    sec = Math.max(0, Math.round(sec));
    return sec < 60 ? sec + "초" : Math.floor(sec / 60) + "분 " + (sec % 60) + "초";
  }
  function liveClock(run, key, st) {
    const now = Date.now();
    run.liveAt = run.liveAt || {};
    if (!run.liveAt[key]) run.liveAt[key] = now;
    if (!run.jobAt) run.jobAt = now;
    run.liveKey = key; run.liveSt = st;
    if (!run.liveTimer) run.liveTimer = setInterval(() => {
      if (state.run !== run || run.step >= 4) { clearInterval(run.liveTimer); run.liveTimer = null; return; }
      renderLive(run);
    }, 1000);
    renderLive(run);
  }
  function renderLive(run) {
    const key = run.liveKey, st = run.liveSt || {}, info = LIVE_EST[key];
    if (!info) return;
    const now = Date.now(), el2 = (now - run.liveAt[key]) / 1000, total = (now - run.jobAt) / 1000;
    const dur = run.audioDur || 0, est = info.base + dur * info.perSec;
    let txt = info.now + " · " + fmtSec(el2) + " 지남";
    if (key === "q" && st.wait_sec) txt += " (약 " + Math.ceil(st.wait_sec) + "초 남음)";
    if (key !== "q" && est > 0) txt += el2 <= est * 1.5 ? " (예상 약 " + fmtSec(est) + ")" : " — 조금 더 걸리고 있습니다. 그대로 기다려 주세요.";
    txt += " · 전체 " + fmtSec(total);
    if (st.message) txt += " " + st.message;
    setText(el.progNow, txt);
    if (key !== "q" && est > 0) {
      const lo = key === 2 ? 45 : 70, hi = key === 2 ? 70 : 100;
      const pct = lo + (hi - lo) * Math.min(0.95, el2 / est);
      el.progFill.style.width = pct.toFixed(1) + "%";
      el.progBar.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
  }
  async function startLive(run) {
    const src = run.src;
    const cap = run.mode === "invite" ? (state.inviteMax || Math.round(CONFIG.inviteSeconds / 60)) * 60 : CONFIG.publicSeconds;
    const limit = Math.min(src.duration || cap, cap);
    try {
      liveStep(run, 0, 0);
      const audio = await extractAudio(src.file, limit, (f) => liveStep(run, 0, f), run);
      if (state.run !== run) return;
      run.audioDur = audio.dur;
      liveStep(run, 1, 0);
      const token = tsToken();
      if (!token) throw Object.assign(new Error(""), { code: "turnstile" }); // 소리를 뽑는 사이 사람 확인이 풀림 — 보내지 않음
      const q = new URLSearchParams({
        mode: run.mode,
        dur: audio.dur.toFixed(3),
        max_char: String(state.opts.maxChars),
        min_dur: String(state.opts.minDur),
        max_dur: String(state.opts.maxDur),
        name: String(src.name || "").slice(0, 120),
      });
      const headers = { "X-Turnstile": token };
      if (run.mode === "invite") headers["X-Invite"] = state.code;
      const job = await upload("/demo/jobs?" + q.toString(), audio.blob, headers, (f) => liveStep(run, 1, f), run);
      tsReset();
      if (job.public_left != null) state.publicLeft = job.public_left;
      if (job.lectures_left != null) state.inviteLeft = job.lectures_left;
      const t0 = Date.now(), path = "/demo/jobs/" + encodeURIComponent(job.ticket);
      for (;;) {
        if (state.run !== run) return;
        const st = await apiRetry(path, run, (j) => !!j && typeof j.status === "string");
        if (state.run !== run) return;
        if (st.status === "done") break;
        if (st.status === "failed") throw Object.assign(new Error(st.message || ""), { code: "failed" });
        liveStep(run, st.status === "running" && st.phase === "POST" ? 3 : 2, null, st);
        if (Date.now() - t0 > CONFIG.api.giveUpMs) throw new Error("20분이 지나도 끝나지 않아 기다리기를 멈췄습니다. 잠시 뒤 다시 해 보세요.");
        await wait(CONFIG.api.pollMs);
      }
      const result = await apiRetry(path + "/result", run, (j) => !!j && Array.isArray(j.cues)); // 끊겨 비어 오면 다시
      if (state.run !== run) return;
      liveStep(run, 4, null);
      run.server = result;
      finish(run);
    } catch (e) {
      if (state.run !== run || (e && e.code === "aborted")) return;
      tsReset();
      stopRun(run);
      el.progress.hidden = true;
      refresh();
      state.runError = errText(e);
      refresh();
      loadStatus();
    }
  }

  /* ── 받기 ── */
  function renderDownloads() {
    const open = inviteOn();
    el.dlBtns.forEach((b) => {
      b.disabled = !open;
      b.setAttribute("aria-describedby", open ? "t-dl-open" : "t-dl-why");
    });
    el.dlLocked.hidden = open;
    el.dlOpen.hidden = !open;
    if (state.result) {
      setText(el.dlMax, String(state.opts.maxChars));
      setText(el.dlName, safeName(state.result.base) + CONFIG.fileSuffix + ".smi, .srt, .vtt, .txt");
    }
  }
  function download(fmt) {
    const r = state.result, f = SSRSplit.FORMATS[fmt];
    if (!r || !f || !inviteOn()) return;
    const text = SSRSplit.fileText(fmt, { cues: r.cues });
    const url = URL.createObjectURL(new Blob([text], { type: f.mime }));
    const a = d.createElement("a");
    a.href = url;
    a.download = fileName(r.base, f.ext);
    a.hidden = true;
    d.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  el.dlBtns.forEach((b) => b.addEventListener("click", () => download(b.getAttribute("data-fmt"))));
  el.toInvite.addEventListener("click", () => {
    setTab("invite");
    el.bench.scrollIntoView({ block: "start", behavior: smooth() });
    el.inviteInput.focus({ preventScroll: true });
  });
  el.again.addEventListener("click", () => {
    stopPlayback();
    el.stepFile.scrollIntoView({ block: "start", behavior: smooth() });
    el.pick.focus({ preventScroll: true });
  });

  /* ── 재생: 고른 영상은 <video>, 예시 강의는 JS 시계 ── */
  let raf = 0, curIdx = -2, lastSec = -1, played = false, seekDrag = false, playLabel = "";
  const player = {
    kind: "clock", end: 0, clock: { base: 0, t0: 0, on: false },
    time() {
      if (this.kind === "video") return Math.min(this.end, el.video.currentTime || 0);
      const c = this.clock;
      return c.on ? Math.min(this.end, c.base + (performance.now() - c.t0) / 1000) : c.base;
    },
    playing() { return this.kind === "video" ? !el.video.paused && !el.video.ended : this.clock.on; },
    play() {
      played = true;
      if (this.time() >= this.end - 0.05) this.seek(0);
      if (this.kind === "video") {
        const p = el.video.play();
        if (p && typeof p.catch === "function") p.catch(() => paint(true));
      } else {
        this.clock.t0 = performance.now();
        this.clock.on = true;
      }
      loop();
    },
    pause() {
      if (this.kind === "video") el.video.pause();
      else if (this.clock.on) { this.clock.base = this.time(); this.clock.on = false; }
      paint(true);
    },
    seek(t) {
      t = Math.max(0, Math.min(this.end, Number(t) || 0));
      if (this.kind === "video") { try { el.video.currentTime = t; } catch (_) { /* 아직 못 감 */ } }
      else { this.clock.base = t; this.clock.t0 = performance.now(); }
    },
  };
  function stopPlayback() {
    if (state.result && player.playing()) player.pause();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function loop() {
    if (raf) return;
    const frame = () => {
      raf = 0;
      paint(false);
      if (player.playing()) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    paint(true);
  }
  function setupPlayer(res) {
    const src = res.src, v = el.video;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    player.kind = res.useVideo ? "video" : "clock";
    player.end = res.end;
    player.clock = { base: 0, t0: 0, on: false };
    el.slide.hidden = res.useVideo;
    el.badge.hidden = src.kind !== "example";
    el.audio.hidden = !(res.useVideo && src.audio);
    if (res.useVideo) {
      if (v.getAttribute("src") !== src.url) v.src = src.url;
      v.hidden = false;
      try { v.currentTime = 0; } catch (_) { /* 메타데이터 전 */ }
    } else {
      v.pause();
      if (v.hasAttribute("src")) { v.removeAttribute("src"); v.load(); }
      v.hidden = true;
    }
    el.banner.hidden = src.kind === "example" || (res.live && res.useVideo);
    setText(el.bannerText, res.live ? "이 파일은 브라우저에서 재생되지 않아 예시 화면으로 대신 보여 드립니다. 자막은 실제로 만든 것입니다."
      : src.kind === "file" && !res.useVideo
      ? "미리보기: 서버 연결 전이라 예시 자막이 나옵니다. 이 파일은 브라우저에서 재생되지 않아 예시 화면으로 대신 보여 드립니다."
      : "미리보기: 서버 연결 전이라 예시 자막이 나옵니다");
    el.seek.max = String(res.end);
    el.seek.value = "0";
    played = false;
    curIdx = -2;
    lastSec = -1;
  }
  function paint(force) {
    const r = state.result;
    if (!r) return;
    let t = player.time();
    if (t >= player.end && player.playing()) { // 쓰는 부분(앞 5분 등) 끝에서 멈춤
      if (player.kind === "clock") { player.clock.base = player.end; player.clock.on = false; } else el.video.pause();
      t = player.end;
    }
    const playing = player.playing();
    if (!seekDrag) el.seek.value = String(t);
    const sec = Math.floor(t + 1e-6);
    if (force || sec !== lastSec) {
      lastSec = sec;
      const txt = fmtClock(t) + " / " + fmtClock(player.end);
      setText(el.time, txt);
      el.seek.setAttribute("aria-valuetext", txt);
    }
    const label = playing ? "일시 정지" : "재생";
    if (label !== playLabel) {
      playLabel = label;
      el.play.setAttribute("aria-label", label);
      el.play.classList.toggle("is-playing", playing);
    }
    el.bigplay.hidden = played || playing;
    const idx = SSRSplit.cueAt(r.view || r.cues, t);
    if (force || idx !== curIdx) setCue(idx, playing);
  }
  function setCue(idx, follow) {
    const r = state.result, items = el.cueList.children, old = items[curIdx];
    if (old) { old.classList.remove("is-now"); old.firstElementChild.removeAttribute("aria-current"); }
    curIdx = idx;
    if (idx < 0 || !r.cues[idx]) { el.cap.hidden = true; setText(el.cap, ""); return; }
    setText(el.cap, r.cues[idx].text);
    el.cap.hidden = false;
    const li = items[idx];
    if (!li) return;
    li.classList.add("is-now");
    li.firstElementChild.setAttribute("aria-current", "true");
    if (follow) revealCue(li);
  }
  function revealCue(li) { // 목록 안에서만 스크롤(페이지는 그대로). 사용자가 목록을 만지는 동안은 따라가지 않음
    const box = el.cueScroll;
    if (!box.clientHeight || box.matches(":hover") || box.contains(d.activeElement)) return;
    const br = box.getBoundingClientRect(), lr = li.getBoundingClientRect();
    if (lr.top < br.top || lr.bottom > br.bottom) box.scrollTop += lr.top - br.top - box.clientHeight / 3;
  }

  el.play.addEventListener("click", () => (player.playing() ? player.pause() : player.play()));
  el.bigplay.addEventListener("click", () => { player.play(); el.play.focus({ preventScroll: true }); });
  el.screen.addEventListener("click", (e) => {
    if (!state.result || e.target.closest("button")) return;
    if (player.playing()) player.pause(); else player.play();
  });
  el.seek.addEventListener("pointerdown", () => { seekDrag = true; });
  root.addEventListener("pointerup", () => { seekDrag = false; });
  root.addEventListener("pointercancel", () => { seekDrag = false; });
  el.seek.addEventListener("input", () => { played = true; player.seek(+el.seek.value); paint(true); });
  el.seek.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -15, PageUp: 15 }[e.key];
    let t = null;
    if (step) t = player.time() + step;
    else if (e.key === "Home") t = 0;
    else if (e.key === "End") t = player.end;
    if (t === null) return;
    e.preventDefault();
    played = true;
    player.seek(t);
    paint(true);
  });
  el.cueList.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]"), r = state.result;
    if (!b || !r) return;
    const c = r.cues[+b.getAttribute("data-i")];
    if (!c) return;
    played = true;
    player.seek(c.start + 0.005);
    paint(true);
  });
  el.video.addEventListener("play", () => { if (player.kind === "video") loop(); });
  ["pause", "seeked", "ended", "timeupdate"].forEach((type) => el.video.addEventListener(type, () => { if (player.kind === "video") paint(type !== "timeupdate"); }));
  el.video.addEventListener("loadedmetadata", () => { // 실제 길이로 맞춤
    const r = state.result, dur = el.video.duration;
    if (player.kind !== "video" || !r || !(dur > 0) || !Number.isFinite(dur)) return;
    player.end = Math.min(dur, r.mode === "invite" ? CONFIG.inviteSeconds : CONFIG.publicSeconds);
    el.seek.max = String(player.end);
    lastSec = -1;
    paint(true);
  });
  el.video.addEventListener("error", () => { // 재생이 안 되면 예시 화면과 시계로
    const r = state.result;
    if (player.kind !== "video" || !r || !el.video.hasAttribute("src")) return;
    r.useVideo = false;
    setupPlayer(r);
    paint(true);
  });

  // 글자 크기(미리보기만)
  const capR = CONFIG.range.capScale;
  el.capScale.min = String(capR.min);
  el.capScale.max = String(capR.max);
  el.capScale.step = String(capR.step);
  el.capScale.value = String(capR.value);
  function applyCapScale() {
    const v = +el.capScale.value;
    el.screen.style.setProperty("--cap-scale", String(v / 100));
    setText(el.capScaleOut, v + "%");
  }
  el.capScale.addEventListener("input", applyCapScale);

  /* ── 시작 ── */
  fillConfigText();
  syncControls(null);
  applyCapScale();
  setTab(root.location.hash === "#invite" ? "invite" : "public");
  root.addEventListener("hashchange", () => { if (root.location.hash === "#invite") { setTab("invite"); el.bench.scrollIntoView({ block: "start", behavior: smooth() }); } });
  if (live()) { loadStatus(); if (TS_SKIP) ensureTurnstile(); }
})(typeof window !== "undefined" ? window : undefined);
