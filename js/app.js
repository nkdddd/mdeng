/* 또박또박 받아쓰기 — 화면과 놀이 */
(() => {
'use strict';

/* ---------- 도우미 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 한글 조각내기 ---------- */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.split('');
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'.split('');
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const isHangul = (ch) => { const c = ch.charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3; };
const split = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 }; };
const join = (p) => String.fromCharCode(0xac00 + p.cho * 588 + p.jung * 28 + p.jong);
const lastChar = (w) => w[w.length - 1];
const hasBatchim = (w) => isHangul(lastChar(w)) && split(lastChar(w)).jong > 0;
/* ㅐ→ㅔ, ㅔ→ㅐ, ㅖ→ㅔ, ㅒ→ㅐ : 헷갈리는 짝 */
const VSWAP = { 1: 5, 5: 1, 7: 5, 3: 1 };
const swapVowel = (ch) => {
  if (!isHangul(ch)) return null;
  const p = split(ch);
  if (!(p.jung in VSWAP)) return null;
  return join({ ...p, jung: VSWAP[p.jung] });
};

/* ---------- 저장: 지금 공부하는 아이의 기록 (js/store.js) ---------- */
let S;
function loadState() {
  S = Object.assign({ stars: 0, best: {} }, STORE.load());
  /* earned = 지금까지 모은 별 전체 (줄어들지 않아요, 내 캐릭터가 이만큼 자라요) */
  if (S.earned == null) S.earned = S.stars;
}
loadState();
const save = () => STORE.save(S);

/* ---------- 소리 ----------
 * 1순위: 미리 만든 녹음 파일(audio/*.mp3, js/clips.js 목록)
 * 2순위: 기기 목소리 중 가장 자연스러운 것 (설정에서 바꿀 수 있음)
 */
const hasTTS = 'speechSynthesis' in window;
const CLIPS = new Set((window.AUDIO_CLIPS && window.AUDIO_CLIPS.keys) || []);
const RATES = { slow: 0.8, normal: 0.95, fast: 1.05 };
let koVoices = [];
let koVoice = null;
/* 자연스러운 목소리일수록 점수가 높아요 */
function voiceScore(v) {
  const n = v.name;
  let s = 0;
  /* 브라우저마다 가진 목소리가 달라서 사실상 Edge→Natural, 크롬→Google, 사파리→Yuna가 돼요 */
  if (/natural|online|neural/i.test(n)) s += 60;          /* Edge: SunHi Online (Natural) */
  if (/google/i.test(n)) s += 55;                         /* Chrome: Google 한국의 */
  if (/premium|프리미엄|enhanced|향상/i.test(n)) s += 50;   /* iPad·Mac: Yuna 프리미엄 */
  if (/yuna|유나|sunhi|injoon|heami|sora|minsu/i.test(n)) s += 5;
  if (!v.localService) s += 3;
  return s;
}
function pickVoice() {
  if (!hasTTS) return;
  koVoices = speechSynthesis.getVoices().filter((v) => /^ko/i.test(v.lang))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
  koVoice = koVoices.find((v) => v.name === S.voiceName) || koVoices[0] || null;
  if (app.className === 'screen-voice') SCREENS.voice();
}
if (hasTTS) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

let playToken = 0;
let clip = null;
function hush() {
  playToken++;
  if (hasTTS) speechSynthesis.cancel();
  if (clip) { clip.pause(); clip = null; }
}
function ttsSpeak(text, slow, voice) {
  if (!hasTTS || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (voice || koVoice) u.voice = voice || koVoice;
  const r = RATES[S.rate] || RATES.normal;
  u.rate = slow ? r * 0.7 : r;
  speechSynthesis.speak(u);
}
function playClips(parts, slow) {
  const tok = ++playToken;
  let i = 0;
  /* 파일이 없으면 그 조각부터 기기 목소리로 (한 번만) */
  const fallback = () => {
    if (tok !== playToken) return;
    playToken++;
    ttsSpeak(parts.slice(i - 1).join(' '), slow);
  };
  const step = () => {
    if (tok !== playToken || i >= parts.length) return;
    const a = new Audio('audio/' + VOICE.key(parts[i++]) + '.mp3');
    a.preservesPitch = true;
    a.playbackRate = slow ? 0.75 : (S.rate === 'slow' ? 0.9 : S.rate === 'fast' ? 1.1 : 1);
    a.onended = () => setTimeout(step, 150);
    a.onerror = fallback;
    clip = a;
    a.play().catch(fallback);
  };
  step();
}
/* parts: 문자열 하나 또는 말 조각 배열 */
function speak(parts, slow) {
  parts = [].concat(parts).map(VOICE.norm).filter(Boolean);
  hush();
  if (!parts.length) return;
  if (S.useClips !== false && CLIPS.size && parts.every((p) => CLIPS.has(VOICE.key(p)))) return playClips(parts, slow);
  ttsSpeak(parts.join(' '), slow);
}
const sayAttr = (parts) => esc([].concat(parts).join('|'));

/* 효과음은 js/sfx.js (실로폰·바스락 …) */
const sfx = (kind, arg) => SFX.play(kind, arg);

/* ---------- 공통 조각 ---------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function bubble(text, extra = '') {
  return `<div class="say ${extra}"><span class="mascot" aria-hidden="true">🐻</span>
    <p>${text}</p><button class="spk" data-say="${esc(text.replace(/<[^>]+>/g, ''))}" aria-label="읽어 주기">🔊</button></div>`;
}
function cells(str, marks = {}) {
  return `<div class="cells">${[...str].map((ch, i) =>
    `<span class="cell${ch === ' ' ? ' sp' : ''}${marks[i] ? ' ' + marks[i] : ''}">${ch === ' ' ? '' : esc(ch)}</span>`).join('')}</div>`;
}
function dots(i, n) {
  return `<div class="dots" aria-label="${n}문제 중 ${i + 1}번째">${Array.from({ length: n }, (_, k) =>
    `<span class="${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('')}</div>`;
}
function maru(el) {
  const m = document.createElement('div');
  m.className = 'maru';
  m.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8 C 80 8, 94 30, 92 52 C 90 78, 68 94, 46 92 C 20 90, 6 70, 8 46 C 10 24, 30 10, 58 12" /></svg>';
  el.appendChild(m);
}
function confetti() {
  if (reduceMotion) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const bits = ['⭐', '🌟', '✨', '🎉', '💛', '🧡'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.textContent = pick(bits);
    s.style.left = Math.random() * 100 + '%';
    s.style.animationDelay = Math.random() * 0.3 + 's';
    s.style.fontSize = 18 + Math.random() * 22 + 'px';
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1800);
}
let toastTimer;
function toast(html, ms = 2200) {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function paintStars() { $('#starCount').textContent = S.earned || 0; }
/* 별을 모아요 (캐릭터는 지킨 날로 자라요 — 한 판이 끝날 때 charRecordRound) */
function earnStars(n) {
  S.stars = (S.stars || 0) + n;
  S.earned = (S.earned || 0) + n;
}
function addStar(n = 1) {
  earnStars(n);
  save();
  paintStars();
  const pill = $('#starPill');
  pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
}
function setBest(key, score) {
  S.best[key] = Math.max(S.best[key] || 0, score);
  save();
}

/* 전역 클릭: 🔊 버튼 */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (b) { speak(b.dataset.say.split('|'), b.dataset.slow === '1'); }
});

/* ---------- 화면 이동 ---------- */
const ISLANDS = [
  { id: 'dict',  icon: '🎧', name: '받아쓰기 섬', sub: '듣고 쓰기',          tone: 't1' },
  { id: 'exam',  icon: '📝', name: '시험 대비',   sub: '학교 받아쓰기 1~10급', tone: 't5' },
  { id: 'josa',  icon: '🧩', name: '조사 마을',   sub: '이·가, 을·를',       tone: 't2' },
  { id: 'vowel', icon: '🦀', name: 'ㅐㅔ 바닷가', sub: '개 🐶 게 🦀',         tone: 't3' },
  { id: 'space', icon: '✂️', name: '띄어쓰기 숲', sub: '어디서 띄울까?',     tone: 't4' },
  { id: 'sound', icon: '🔍', name: '소리 탐정',   sub: '소리랑 글자가 달라!', tone: 't5' },
];
/* 🔢 수학 섬 (문제는 js/math.js) */
const MATH_ISLANDS = [
  { id: 'gugu',   icon: '✖️', name: '구구단 성',   sub: '2단 ~ 9단 · 구구단표',  tone: 't3' },
  { id: 'plus',   icon: '➕', name: '덧셈 동산',   sub: '더하면 커져요',        tone: 't4' },
  { id: 'minus',  icon: '➖', name: '뺄셈 계곡',   sub: '빼면 작아져요',        tone: 't2' },
  { id: 'times',  icon: '🔢', name: '곱셈 공장',   sub: '묶어서 세기',          tone: 't1' },
  { id: 'divide', icon: '➗', name: '나눗셈 빵집', sub: '똑같이 나누기',        tone: 't5' },
  { id: 'mix',    icon: '🧮', name: '수학 왕 탑',  sub: '섞어서 도전',          tone: 't6' },
];
const SCREENS = {};
function go(name, ...args) {
  hush();
  $('#homeBtn').hidden = name === 'home';
  app.innerHTML = '';
  app.className = 'screen-' + name;
  window.scrollTo(0, 0);
  SCREENS[name](...args);
  const h = app.querySelector('h1, h2');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}
$('#homeBtn').addEventListener('click', () => { sfx('pop'); go('home'); });

/* 난이도 표시: ★★☆☆ 보통 · 정답 ⭐1 */
function diffTag(key) {
  const d = diffOf(key), D = DIFF_INFO[d];
  return `<span class="diff-tag d${d}" title="${D.name}: 정답마다 별 ${D.stars}개, 다 맞히면 +${D.bonus}">${diffStars(d)} <small>정답 ⭐${D.stars}</small></span>`;
}
/* ---------- 🗺️ 지도 ---------- */
SCREENS.home = () => {
  const math = S.subject === 'math';
  const card = (s) => `
        <button class="island ${s.tone}" data-go="${s.id}">
          <span class="i-icon" aria-hidden="true">${s.icon}</span>
          <span class="i-name">${s.name}</span>
          <span class="i-sub">${s.sub}</span>
          ${DIFFICULTY[s.id] ? diffTag(s.id) : ['dict', 'exam', ...MATH_ISLANDS.map((x) => x.id)].includes(s.id) ? `<span class="diff-tag">${rangeTag(s.id)}</span>` : ''}
          ${S.best[s.id] ? `<span class="i-best">최고 ${S.best[s.id]}점</span>` : ''}
        </button>`;
  const list = math ? MATH_ISLANDS : ISLANDS;
  app.innerHTML = `
    <h1 class="title">또박또박 <span>${math ? '수학' : '받아쓰기'}</span></h1>
    ${bubble(math ? LINES.mathHome : LINES.home)}
    <div class="map">
      <div class="map-top">${charCard()}</div>
      <div class="subject-tabs" role="tablist" aria-label="과목">
        <button role="tab" data-subj="ko" aria-selected="${!math}">📚 국어</button>
        <button role="tab" data-subj="math" aria-selected="${math}">🔢 수학</button>
      </div>
      ${list.map(card).join('')}
    </div>`;
  $$('.island, .char-card', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); go(b.dataset.go); }));
  $$('[data-subj]', app).forEach((b) => b.addEventListener('click', () => {
    if ((S.subject || 'ko') === b.dataset.subj) return;
    S.subject = b.dataset.subj; save(); sfx('pop'); SCREENS.home();
  }));
  speak(math ? LINES.mathHome : LINES.home);
};
/* 섬 안 단계들의 난이도 범위: ★~★★★★ */
function rangeTag(id) {
  const levels = id === 'dict' ? [...CORE, ...DICTATION, ...GRADE_DICT].map((l) => l.id) : id === 'exam' ? SCHOOL.map((l) => l.id) : MATH.ISLANDS[id].map((l) => l.id);
  const ds = levels.map(diffOf);
  const lo = Math.min(...ds), hi = Math.max(...ds);
  return lo === hi ? diffStars(lo) : `${'★'.repeat(lo)}~${'★'.repeat(hi)}`;
}
/* 📝 시험 대비: 받아쓰기 섬의 시험 탭 */
SCREENS.exam = () => { S.dictTab = 'test'; SCREENS.dict(); };

/* ---------- 결과 ---------- */
function finish(key, score, total, again, extra) {
  const pct = Math.round((score / total) * 100);
  charMigrate();
  charRecordRound(extra && extra.stars ? extra.stars.gained : 0);   /* 🐣 오늘 기록 → 지킨 날 */
  setBest(key, pct);
  const great = pct >= 70;
  app.innerHTML = `
    <div class="finish">
      <div class="fin-top">
        <div class="stamp ${great ? '' : 'soft'}">${great ? '참<br>잘했어요' : '잘<br>했어요'}</div>
        <div class="fin-sum">
          <h2>${total}문제 중에 <b>${score}</b>개 맞혔어요!</h2>
          ${extra && extra.stars ? `<p class="finish-stars" aria-label="별 ${extra.stars.gained}개 받음">⭐ <b>+${extra.stars.gained}</b>${extra.stars.bonus ? ` <small>(다 맞힘 보너스 +${extra.stars.bonus})</small>` : ''}</p>` : ''}
          <p class="diff-note">${diffStars(diffOf(key))} ${DIFF_INFO[diffOf(key)].name}</p>
        </div>
      </div>
      ${extra && extra.stars ? charStrip() : ''}
      ${extra && extra.notes && extra.notes.length ? `<div class="fin-notes">${extra.notes.map((n) => `<p class="qn ${n.kind}">${n.text}</p>`).join('')}</div>` : ''}
      <div class="row">
        <button class="btn primary" id="again">🔁 한 번 더</button>
        <button class="btn" id="toChar">🐣 내 캐릭터</button>
        <button class="btn" id="toMap">🗺️ 지도로</button>
      </div>
    </div>`;
  if (great) { confetti(); sfx('star'); }
  speak([LINES.score(total, score), ...(extra && extra.stars && extra.stars.bonus ? [LINES.perfect(extra.stars.bonus)] : []), great ? LINES.finishGreat : LINES.finishSoso,
...(extra && extra.notes ? extra.notes.filter((n) => n.say).map((n) => n.say) : [])]);
  $('#again').onclick = again;
  $('#toChar').onclick = () => go('char');
  $('#toMap').onclick = () => go('home');
  if (S.grewTo != null) { const st = S.grewTo; delete S.grewTo; save(); setTimeout(() => charGrow(st), great ? 1300 : 700); }
}

/* 문제 풀이 틀: items를 하나씩 render로 넘기고 끝나면 결과 화면 */
/* 1·2학년 받아쓰기(js/grade.js) 단계의 난이도 */
GRADE_DICT.forEach((l) => { DIFFICULTY[l.id] = l.diff; });
MATH.ALL.forEach((l) => { DIFFICULTY[l.id] = l.diff; }); /* 🔢 수학 단계 */
const diffOf = (key) => DIFFICULTY[key] || 2;
const diffStars = (d) => '★'.repeat(d) + '☆'.repeat(4 - d);
function runQuiz(key, items, render) {
  let i = 0, score = 0, streak = 0, maxStreak = 0, gained = 0;
  const D = DIFF_INFO[diffOf(key)];
  const next = () => {
    if (i >= items.length) {
      /* 다 맞히면 난이도만큼 보너스 별 */
      const bonus = score === items.length ? D.bonus : 0;
      if (bonus) addStar(bonus);
      return finish(key, score, items.length, () => go(key, true), { stars: { gained: gained + bonus, bonus } });
    }
    app.innerHTML = '';
    render(items[i], i, items.length, (ok) => {
      if (!ok) { streak = 0; return; }
      score++; streak++; addStar(D.stars); gained += D.stars;
      maxStreak = Math.max(maxStreak, streak);
      if (streak >= 3) showCombo(streak);
    }, () => { i++; next(); });
  };
  next();
}
/* 🔥 연속 정답 */
function showCombo(n) {
  const el = document.createElement('div');
  el.className = 'combo' + (n >= 5 ? ' mega' : '');
  el.innerHTML = `<b>${n >= 5 ? '⚡' : '🔥'} ${n}연속!</b>${n >= 5 ? '<small>대단해!</small>' : ''}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
  setTimeout(() => sfx('star'), 250);
}

/* 고르기 버튼 공통 처리 */
function wireChoices(box, answer, onPick) {
  let done = false;
  $$('.choice', box).forEach((b) => b.addEventListener('click', () => {
    if (done) return;
    done = true;
    const ok = b.dataset.v === answer;
    $$('.choice', box).forEach((c) => {
      c.disabled = true;
      if (c.dataset.v === answer) c.classList.add('right');
    });
    if (!ok) b.classList.add('wrong');
    sfx(ok ? 'ok' : 'no');
    onPick(ok, b.dataset.v);
  }));
}

/* 조사 설명: 마지막 글자를 조각내서 받침 보여 주기 */
const josaPick = (w, j) => (hasBatchim(w) ? j[0] : j[1]);
function josaExplain(noun, ans) {
  const last = lastChar(noun);
  const p = split(last);
  const bat = p.jong > 0;
  return `
    <div class="jamo-box" aria-label="${last} 글자 조각">
      <span class="big-syl">${last}</span><span class="eq">=</span>
      <span class="jm">${CHO[p.cho]}</span><span class="jm">${JUNG[p.jung]}</span>
      <span class="jm ${bat ? 'bat' : 'nobat'}">${bat ? JONG[p.jong] : '없음'}</span>
    </div>
    <p>${bat
      ? `'${last}'에 받침 <b class="hl">${JONG[p.jong]}</b>이 있어요. 그래서 <b class="hl">${ans}</b>!`
      : `'${last}'에는 받침이 없어요. 그래서 <b class="hl">${ans}</b>!`}</p>`;
}

/* ---------- 🧩 조사 마을 ---------- */
SCREENS.josa = (skipIntro) => {
  if (!skipIntro) return josaIntro();
  const items = shuffle(NOUNS).slice(0, QUIZ_SIZE.josa).map((n, k) => {
    const j = JOSA[k % JOSA.length];
    const other = pick(NOUNS.filter((m) => m !== n));
    return { noun: n[0], e: n[1], j, other };
  });
  runQuiz('josa', shuffle(items), (q, i, n, mark, next) => {
    const ans = josaPick(q.noun, q.j);
    const rest = q.j[2] ?? ' ' + q.other[0];
    const pic = q.j[2] ? q.e : q.e + ' ' + q.other[1];
    app.innerHTML = `
      ${dots(i, n)}
      ${bubble(LINES.josaAsk, 'tight')}
      <div class="qcard"><div class="pic" aria-hidden="true">${pic}</div>
        <p class="sentence"><b>${q.noun}</b><span class="blank">?</span>${esc(rest)}</p></div>
      <div class="choices">${shuffle([q.j[0], q.j[1]]).map((v) => `<button class="choice" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="explain" hidden></div>`;
    wireChoices(app, ans, (ok) => {
      mark(ok);
      $('.blank', app).textContent = ans;
      $('.blank', app).classList.add('filled');
      if (ok) maru($('.qcard', app));
      const ex = $('.explain', app);
      ex.innerHTML = `${josaExplain(q.noun, ans)}
        <button class="btn primary next">다음 ➜</button>`;
      ex.hidden = false;
      speak([ok ? LINES.ding : LINES.oops, ...(q.j[2] ? [q.noun + ans + q.j[2]] : [q.noun + ans, q.other[0]])]);
      $('.next', ex).onclick = next;
    });
    speak(LINES.josaAsk);
  });
};
function josaIntro() {
  app.innerHTML = `
    <h2 class="h">🧩 조사 마을</h2>
    ${bubble(LINES.josaBubble)}
    <div class="compare">
      <button class="cmp good" data-say="곰이 있어요.">🐻 곰<b>이</b> 있어요 <small>[고미] 부드러워요 😊</small></button>
      <button class="cmp bad" data-say="곰가 있어요.">🐻 곰<b>가</b> 있어요 <small>어색해요 🤔</small></button>
      <button class="cmp good" data-say="토끼가 있어요.">🐰 토끼<b>가</b> 있어요 <small>부드러워요 😊</small></button>
      <button class="cmp bad" data-say="토끼이 있어요.">🐰 토끼<b>이</b> 있어요 <small>어색해요 🤔</small></button>
    </div>
    <div class="rulecard">
      <p class="rule-q">받침이 뭐야? 글자 아래에 받쳐 주는 친구!</p>
      <div class="jamo-box"><span class="big-syl">곰</span><span class="eq">=</span><span class="jm">ㄱ</span><span class="jm">ㅗ</span><span class="jm bat">ㅁ</span></div>
      <table class="rule">
        <tr><th>받침 있어요</th><td>이 · 을 · 은 · 과</td></tr>
        <tr><th>받침 없어요</th><td>가 · 를 · 는 · 와</td></tr>
      </table>
    </div>
    <button class="btn primary big" id="start">놀이 시작! ▶</button>`;
  speak([LINES.josaBubble, LINES.josaRule]);
  $('#start').onclick = () => go('josa', true);
}

/* ---------- 🦀 ㅐㅔ 바닷가 ---------- */
const vowelSvg = (kind) => {
  /* ㅐ: 짧은 팔이 두 막대 사이(안), ㅔ: 첫 막대 왼쪽(밖), ㅖ: 밖에 팔 두 개 */
  const arms = { ae: '<line x1="34" y1="50" x2="54" y2="50" class="arm"/>',
    e: '<line x1="12" y1="50" x2="34" y2="50" class="arm"/>',
    ye: '<line x1="12" y1="40" x2="34" y2="40" class="arm"/><line x1="12" y1="62" x2="34" y2="62" class="arm"/>' }[kind];
  return `<svg class="vsvg" viewBox="0 0 80 100" aria-hidden="true"><line x1="34" y1="12" x2="34" y2="88" class="bar"/><line x1="62" y1="12" x2="62" y2="88" class="bar"/>${arms}</svg>`;
};
/* ㅐ·ㅔ·ㅖ 설명 한 줄 */
function vowelExplain(ch) {
  const v = split(ch).jung;
  const kind = v === 1 || v === 3 ? 'ae' : v === 5 ? 'e' : 'ye';
  const line = {
    ae: `<b class="hl">${JUNG[v]}</b> — 짧은 팔이 <b>안</b>에 있어요. 개 🐶는 집 <b>안</b>에!`,
    e: `<b class="hl">ㅔ</b> — 짧은 팔이 <b>밖</b>에 있어요. 게 🦀는 집게를 <b>밖</b>으로!`,
    ye: `<b class="hl">ㅖ</b> — [ㅔ]처럼 들려도 팔이 두 개인 ㅖ예요!`,
  }[kind];
  return `<div class="vrow">${vowelSvg(kind)}<p>${line}</p></div>`;
}
SCREENS.vowel = (skipIntro) => {
  if (!skipIntro) return vowelIntro();
  const items = shuffle(VOWELS).slice(0, QUIZ_SIZE.vowel);
  runQuiz('vowel', items, (q, i, n, mark, next) => {
    const ans = q.w[q.i];
    const wrong = swapVowel(ans);
    const shown = q.w.slice(0, q.i) + '?' + q.w.slice(q.i + 1);
    app.innerHTML = `
      ${dots(i, n)}
      ${bubble(LINES.vowelAsk, 'tight')}
      <div class="qcard"><div class="pic" aria-hidden="true">${q.e}</div>
        <div class="wordcells">${cells(shown, { [q.i]: 'q' })}</div>
        <button class="btn small" data-say="${esc(q.w)}">🔊 들어 보기</button></div>
      <div class="choices">${shuffle([ans, wrong]).map((v) => `<button class="choice" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="explain" hidden></div>`;
    wireChoices(app, ans, (ok) => {
      mark(ok);
      $('.wordcells', app).innerHTML = cells(q.w, { [q.i]: 'good' });
      if (ok) maru($('.qcard', app));
      const ex = $('.explain', app);
      ex.innerHTML = `${vowelExplain(ans)}<button class="btn primary next">다음 ➜</button>`;
      ex.hidden = false;
      speak([ok ? LINES.ding : LINES.oops, q.w]);
      $('.next', ex).onclick = next;
    });
    speak([LINES.vowelAsk, q.w]);
  });
};
function vowelIntro() {
  app.innerHTML = `
    <h2 class="h">🦀 ㅐㅔ 바닷가</h2>
    ${bubble(LINES.vowelBubble)}
    <div class="pair">
      <button class="vcard" data-say="${sayAttr(LINES.vowelDog)}">
        <span class="vpic">🐶</span><span class="vword">개</span>${vowelSvg('ae')}
        <span class="vtip">짧은 팔이 <b>안</b>에!<br>개는 집 <b>안</b>에 🏠</span></button>
      <button class="vcard" data-say="${sayAttr(LINES.vowelCrab)}">
        <span class="vpic">🦀</span><span class="vword">게</span>${vowelSvg('e')}
        <span class="vtip">짧은 팔이 <b>밖</b>에!<br>게는 집게를 <b>밖</b>으로 🦀</span></button>
    </div>
    <div class="rulecard">
      <div class="vrow">${vowelSvg('ye')}<p><b class="hl">ㅖ</b>는 팔이 두 개! 시계 ⏰, 계단 🪜은 [시게], [게단]처럼 들려도 <b>ㅖ</b>로 써요.</p></div>
    </div>
    <button class="btn primary big" id="start">놀이 시작! ▶</button>`;
  speak([LINES.vowelBubble, LINES.vowelRule]);
  $('#start').onclick = () => go('vowel', true);
}

/* ---------- ✂️ 띄어쓰기 숲 ---------- */
SCREENS.space = (skipIntro) => {
  if (!skipIntro) return spaceIntro();
  runQuiz('space', shuffle(SPACING).slice(0, QUIZ_SIZE.space), (q, i, n, mark, next) => {
    const syl = [...q.t.replace(/ /g, '')];
    const want = [];
    { let k = 0; for (const ch of q.t) { if (ch === ' ') want[k - 1] = true; else k++; } }
    const gaps = Array(syl.length - 1).fill(false);
    let tries = 0;
    app.innerHTML = `
      ${dots(i, n)}
      ${bubble(LINES.spaceAsk, 'tight')}
      <div class="qcard"><div class="pic" aria-hidden="true">${q.e}</div>
        <div class="spacer" id="spacer"></div>
        <button class="btn small" data-say="${esc(q.t)}" data-slow="1">🔊 천천히 들어 보기</button></div>
      <div class="row"><button class="btn primary" id="check">다 됐어요! ✔</button></div>
      <div class="explain" hidden></div>`;
    const box = $('#spacer');
    const draw = (marks) => {
      box.innerHTML = syl.map((ch, k) => `<span class="cell">${ch}</span>` + (k < gaps.length
        ? `<button class="gap${gaps[k] ? ' on' : ''}${marks && marks[k] ? ' ' + marks[k] : ''}" data-k="${k}" aria-label="${k + 1}번째 틈 ${gaps[k] ? '띄움' : '붙임'}" aria-pressed="${gaps[k]}"></button>` : '')).join('');
      $$('.gap', box).forEach((g) => g.addEventListener('click', () => {
        if ($('#check').disabled) return;
        gaps[+g.dataset.k] = !gaps[+g.dataset.k];
        sfx('pop');
        draw();
      }));
    };
    draw();
    $('#check').onclick = () => {
      const marks = gaps.map((g, k) => (g === !!want[k] ? '' : want[k] ? 'miss' : 'extra'));
      const ok = marks.every((m) => !m);
      tries++;
      sfx(ok ? 'ok' : 'no');
      if (tries === 1) mark(ok);
      const ex = $('.explain', app);
      if (ok) {
        $('#check').disabled = true;
        draw();
        maru($('.qcard', app));
        ex.innerHTML = `<p>딩동댕! <b class="hl">${esc(q.t)}</b></p>
          <p class="small-note">✂️ 이·가·을·를·은·는·에는 앞말에 딱 붙여 썼지요?</p>
          <button class="btn primary next">다음 ➜</button>`;
        speak([LINES.ding, q.t]);
        ex.hidden = false;
        $('.next', ex).onclick = next;
      } else {
        draw(marks);
        ex.innerHTML = `
          <p><span class="lg miss"></span> 빨간 곳은 띄어야 해요. <span class="lg extra"></span> 노란 곳은 붙여야 해요.</p>
          <p class="small-note">${TYPES.space.why}</p>
          <div class="row"><button class="btn primary" id="retry">✏️ 고쳐 볼래요</button><button class="btn" id="show">정답 보고 다음 ➜</button></div>`;
        ex.hidden = false;
        speak(LINES.spaceWrong);
        $('#retry').onclick = () => { ex.hidden = true; draw(); };
        $('#show').onclick = () => {
          gaps.forEach((_, k) => { gaps[k] = !!want[k]; });
          $('#check').disabled = true;
          draw();
          ex.innerHTML = `<p>정답: <b class="hl">${esc(q.t)}</b></p><button class="btn primary next">다음 ➜</button>`;
          speak(q.t);
          $('.next', ex).onclick = next;
        };
      }
    };
    speak([LINES.spaceAsk, q.t]);
  });
};
function spaceIntro() {
  app.innerHTML = `
    <h2 class="h">✂️ 띄어쓰기 숲</h2>
    ${bubble(LINES.spaceBubble)}
    <div class="funny">${FUNNY.map((f, k) => `
      <div class="fcard" data-k="${k}">
        <div class="raw">${cells(f.raw)}</div>
        <div class="row">
          <button class="btn fbtn" data-side="a">${esc(f.a[0])}</button>
          <button class="btn fbtn" data-side="b">${esc(f.b[0])}</button>
        </div>
        <div class="scene" aria-live="polite"><span class="scene-pic">❓</span><span class="scene-txt">어떤 뜻일까?</span></div>
      </div>`).join('')}</div>
    <p class="small-note mobile-only swipe-hint">👉 옆으로 밀면 웃긴 문장이 ${FUNNY.length}개 있어요</p>
    <div class="rulecard"><p>${TYPES.space.why}</p></div>
    <button class="btn primary big" id="start">놀이 시작! ▶</button>`;
  $$('.fbtn', app).forEach((b) => b.addEventListener('click', () => {
    const card = b.closest('.fcard');
    const f = FUNNY[+card.dataset.k][b.dataset.side];
    $$('.fbtn', card).forEach((x) => x.classList.toggle('sel', x === b));
    $('.raw', card).innerHTML = cells(f[0]);
    $('.scene-pic', card).textContent = f[1];
    $('.scene-txt', card).textContent = f[2];
    speak([f[0], f[2]]);
  }));
  speak(LINES.spaceBubble);
  $('#start').onclick = () => go('space', true);
}

/* ---------- 🔍 소리 탐정 ---------- */
function soundCompare(w, s) {
  const mw = {}, ms = {};
  [...w].forEach((ch, k) => { if (s[k] !== ch) { mw[k] = 'hot'; ms[k] = 'hot'; } });
  return `<div class="twoline">
    <div class="tl"><span class="tl-lab">글자</span>${cells(w, mw)}</div>
    <div class="tl"><span class="tl-lab">소리</span>${cells(s, ms)}</div></div>`;
}
SCREENS.sound = (skipIntro) => {
  if (!skipIntro) return soundIntro();
  runQuiz('sound', shuffle(SOUNDS).slice(0, QUIZ_SIZE.sound), (q, i, n, mark, next) => {
    const opts = shuffle([q.w, q.s, ...(q.x ? [q.x] : [])]);
    const tp = TYPES[q.k];
    app.innerHTML = `
      ${dots(i, n)}
      ${bubble(LINES.soundAsk, 'tight')}
      <div class="qcard"><div class="pic" aria-hidden="true">${q.e}</div>
        <p class="ear">👂 [${q.s}]</p>
        <button class="btn small" data-say="${esc(q.w)}">🔊 들어 보기</button></div>
      <div class="choices">${opts.map((v) => `<button class="choice" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="explain" hidden></div>`;
    wireChoices(app, q.w, (ok) => {
      mark(ok);
      if (ok) maru($('.qcard', app));
      const ex = $('.explain', app);
      ex.innerHTML = `
        ${soundCompare(q.w, q.s)}
        <div class="typebadge"><span>${tp.icon}</span>${tp.name}</div>
        <p>${q.tip}</p>
        <p class="small-note">${tp.why}</p>
        <button class="btn primary next">다음 ➜</button>`;
      ex.hidden = false;
      speak([ok ? LINES.ding : LINES.oops, LINES.soundAnswer(q.s, q.w), q.tip]);
      $('.next', ex).onclick = next;
    });
    speak([LINES.soundAsk, q.w]);
  });
};
function soundIntro() {
  app.innerHTML = `
    <h2 class="h">🔍 소리 탐정</h2>
    ${bubble(LINES.soundBubble)}
    <div class="rulecard why">
      <div id="fam">${WHY_FAMILY.map((f) => `<div class="fam-row">${cells(f.w, { 0: 'root' })}</div>`).join('')}</div>
      <button class="btn primary" id="flip">🔊 소리 나는 대로 써 보면?</button>
      <p class="why-say" id="whySay">세 낱말 모두 '먹'이 들어 있어서 '먹다'라는 뜻인 걸 금방 알 수 있어요.</p>
    </div>
    <h3 class="h3">소리를 바꾸는 친구들</h3>
    <div class="types">${['yeon', 'tense', 'nasal', 'palatal', 'h', 'rep', 'liquid'].map((k) => {
      const ex = SOUNDS.find((s) => s.k === k);
      return `<button class="tcard" data-say="${sayAttr(LINES.typeCard(TYPES[k]))}">
        <span class="t-icon">${TYPES[k].icon}</span><span class="t-name">${TYPES[k].name}</span>
        <span class="t-ex">${ex.w} → [${ex.s}]</span></button>`;
    }).join('')}</div>
    <button class="btn primary big" id="start">탐정 출동! ▶</button>`;
  let flipped = false;
  $('#flip').onclick = () => {
    flipped = !flipped;
    $('#fam').innerHTML = WHY_FAMILY.map((f) => `<div class="fam-row">${cells(flipped ? f.s : f.w, flipped ? {} : { 0: 'root' })}</div>`).join('');
    $('#flip').textContent = flipped ? '✏️ 다시 글자로!' : '🔊 소리 나는 대로 써 보면?';
    $('#whySay').innerHTML = flipped
      ? '어? <b class="hl">먹</b>이 사라졌어요! 머거요, 먹꼬, 멍는다… 무슨 뜻인지 알아보기 어렵지요? 그래서 <b>글자는 뜻을 지키고, 입은 편하게 말해요.</b>'
      : '세 낱말 모두 \'먹\'이 들어 있어서 \'먹다\'라는 뜻인 걸 금방 알 수 있어요.';
    speak(flipped ? LINES.flipOn : LINES.flipOff);
  };
  speak([LINES.soundBubble, LINES.pressButton]);
  $('#start').onclick = () => go('sound', true);
}

/* 떠 있는 창 (우리 집 문장 · 캐릭터 성장) */
function sheet(html, cls = '') {
  closeSheet();
  const el = document.createElement('div');
  el.className = 'zoom sheet ' + cls;
  el.id = 'sheet';
  el.innerHTML = `<div class="zoom-in">${html}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el) closeSheet(); });
  document.body.appendChild(el);
  return el;
}
const closeSheet = () => $('#sheet')?.remove();

/* ---------- 🎧 받아쓰기 섬 ---------- */
/* 모든 받아쓰기 문장과 그 문장이 묻는 핵심 개념 (js/spell.js가 찾아요). 처음 쓸 때 한 번 만들어요 */
let dictPool = null;
const RULE_ONLY = (t) => t.filter((k) => k !== 'space' && k !== 'punct');
const qTags = (q) => q.tags || (q.tags = SPELL.tags(q.t, q.hints || []));
function dictAll() {
  if (dictPool) return dictPool;
  const seen = new Set();
  dictPool = [...DICTATION, ...GRADE_DICT, ...SCHOOL].flatMap((l) => l.items).concat(NOTEBOOK)
    .filter((q) => !seen.has(q.t) && seen.add(q.t)).map((q) => ({ ...q, tags: SPELL.tags(q.t, q.hints) }));
  return dictPool;
}
/* 핵심 개념 단계 문제: 그 개념이 앞에 오는(많이 나오는) 문장일수록 먼저, 그중에서 골고루 */
function coreItems(c, n = DICT_SIZE) {
  const P = dictAll();
  let L;
  if (c.keys[0] === 'plain') L = P.filter((q) => !RULE_ONLY(q.tags).length).map((q) => ({ q, r: Math.random() }));
  else if (c.keys[0] === 'mix') L = P.map((q) => ({ q, r: -new Set(RULE_ONLY(q.tags)).size - q.t.length / 12 + Math.random() * 2 }));
  else L = P.filter((q) => q.tags.some((k) => c.keys.includes(k)))
    .map((q) => ({ q, r: Math.min(...c.keys.map((k) => (q.tags.includes(k) ? q.tags.indexOf(k) : 99))) + RULE_ONLY(q.tags).length * 0.3 + Math.random() * 1.5 }));
  return shuffle(L.sort((a, b) => a.r - b.r).slice(0, Math.max(n * 4, 16))).slice(0, n).map((x) => x.q);
}
/* 개념 → 그 개념을 연습하는 핵심 단계 */
const CORE_OF = { vowel: 'c10', bat: 'c2' };
CORE.forEach((c) => c.keys.forEach((k) => { CORE_OF[k] = CORE_OF[k] || c.id; }));
CORE.forEach((c) => { DIFFICULTY[c.id] = c.diff; });
DIFFICULTY.wk = 3; DIFFICULTY.my = 3;

/* 🩹 약점 노트: 개념마다 { n: 만난 수, m: 틀린 수 } (처음 쓴 답으로만) */
function noteWeak(q, g) {
  S.weak = S.weak || {};
  const missed = new Set([...g.errs.map((e) => e.k), ...(g.space.length ? ['space'] : []), ...(g.punct.length ? ['punct'] : [])]);
  new Set([...qTags(q), ...missed]).forEach((k) => {
    if (!CORE_OF[k]) return;
    const w = S.weak[k] || (S.weak[k] = { n: 0, m: 0 });
    w.n++;
    if (missed.has(k)) w.m++;
  });
  save();
}
const weakList = () => Object.entries(S.weak || {}).filter(([, w]) => w.m > 0)
  .map(([k, w]) => ({ k, ...w, rate: w.m / Math.max(w.n, 1) })).sort((a, b) => b.m * b.rate - a.m * a.rate || b.m - a.m);
function weakItems() {
  const top = weakList().slice(0, 3);
  const out = [], seen = new Set();
  for (let t = 0; out.length < DICT_SIZE && t < 4; t++)
    top.forEach((w) => coreItems(CORE.find((c) => c.id === CORE_OF[w.k]), 3).forEach((q) => { if (out.length < DICT_SIZE && !seen.has(q.t)) { seen.add(q.t); out.push(q); } }));
  return shuffle(out);
}
const myItems = () => shuffle((S.myLines || []).map((t) => ({ t, e: '✏️', hints: [] }))).slice(0, DICT_SIZE);

/* 받아쓰기 섬: 묶음(탭)으로 나눠 보여 줘요. 마지막에 본 묶음을 기억해요 */
const DICT_TABS = [
  { id: 'core', label: '🎯 핵심 개념', note: '쉬운 규칙부터 하나씩 · 단계를 누르면 무엇을 묻는지 먼저 알려 줘요' },
  { id: 'g1', label: '📚 1학년', note: `단계마다 ${DICT_SIZE}문제씩`, list: () => GRADE_DICT.filter((l) => l.grade === 1) },
  { id: 'g2', label: '📚 2학년', note: `단계마다 ${DICT_SIZE}문제씩`, list: () => GRADE_DICT.filter((l) => l.grade === 2) },
  { id: 'test', label: '📝 시험', note: '학교 받아쓰기 시험 1-2단계 · 급마다 10문제 차례대로', list: () => SCHOOL },
  { id: 'weak', label: '🩹 약점 노트', note: '자주 틀린 규칙을 모아서 다시 · 공책에서 틀린 문장도 넣을 수 있어요' },
];
const exText = ([w, s]) => (s.includes('✗') ? `${esc(w)} <s>${esc(s.replace(' ✗', ''))}</s>` : `${esc(w)} <small>[${esc(s)}]</small>`);
SCREENS.dict = (quiet) => {
  if (S.dictTab === 'prac') S.dictTab = 'core';
  const tab = DICT_TABS.find((t) => t.id === S.dictTab) || DICT_TABS[0];
  const best = (id) => (S.best[id] != null ? `<span class="i-best">최고 ${S.best[id]}점</span>` : '');
  const tile = (lv) => tab.id === 'test'
    ? `<button class="level" data-id="${lv.id}"><span class="l-grade">${lv.n}급</span><span class="l-name">${lv.name}</span>${diffTag(lv.id)}${best(lv.id)}</button>`
    : `<button class="level" data-id="${lv.id}"><span class="l-icon">${lv.icon}</span><span class="l-name">${lv.name}</span>
        <span class="l-sub">${lv.grade ? `${esc(lv.desc)}` : `${lv.desc} · ${Math.min(DICT_SIZE, lv.items.length)}문제`}</span>${diffTag(lv.id)}${best(lv.id)}</button>`;
  let body;
  if (tab.id === 'core') {
    body = `<div class="levels core">${CORE.map((c, k) => `<button class="level" data-core="${c.id}"><span class="l-icon">${c.icon}</span><span class="l-name"><i class="l-no">${k + 1}</i>${c.name}</span>
        <span class="l-sub">${exText(c.ex[0])}</span>${diffTag(c.id)}${best(c.id)}</button>`).join('')}</div>
      <details class="mix-box"><summary class="small-note">🎲 섞어 풀기 (낱말 · 문장 · 동물)</summary><div class="levels">${DICTATION.map(tile).join('')}</div></details>`;
  } else if (tab.id === 'weak') {
    const W = weakList();
    body = `<div class="weak-list">${W.length ? W.slice(0, 6).map((w) => `<button class="weak-row" data-core="${CORE_OF[w.k]}"><span class="t-icon">${TYPES[w.k].icon}</span><b>${TYPES[w.k].name}</b>
        <span class="weak-bar" style="--p:${Math.round(w.rate * 100)}%"><i></i></span><small>${w.m}번 틀림 / ${w.n}번</small></button>`).join('')
      : '<p class="small-note">아직 틀린 기록이 없어요. 핵심 개념 단계를 풀면 여기에 약점이 모여요.</p>'}</div>
      <div class="row">${W.length ? `<button class="btn primary" data-id="wk">🩹 약점 섞어서 ${DICT_SIZE}문제</button>` : ''}
        ${(S.myLines || []).length ? `<button class="btn" data-id="my">✏️ 우리 집 문장 (${S.myLines.length})</button>` : ''}<button class="btn ghost" id="myEdit">✏️ 문장 넣기</button></div>`;
  } else body = `<div class="levels ${tab.id === 'test' ? 'school' : 'grade'}">${tab.list().map(tile).join('')}</div>`;
  app.innerHTML = `
    <h2 class="h">🎧 받아쓰기 섬</h2>
    ${bubble(LINES.dictBubble, 'tight')}
    <div class="dex-tabs dict-tabs" role="tablist">${DICT_TABS.map((t) => `<button role="tab" aria-selected="${t.id === tab.id}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
    <p class="small-note tab-note">${tab.note}</p>
    ${body}
    ${hasTTS ? '' : '<p class="notice">이 기기에서는 소리가 나오지 않아요. 문제 화면의 👀 어른용 버튼을 눌러 어른이 읽어 주세요.</p>'}`;
  $$('[data-tab]', app).forEach((b) => b.addEventListener('click', () => { S.dictTab = b.dataset.tab; save(); sfx('pop'); SCREENS.dict(true); }));
  $$('[data-id]', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); dictLevel(b.dataset.id); }));
  $$('[data-core]', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); coreIntro(CORE.find((c) => c.id === b.dataset.core)); }));
  $('#myEdit')?.addEventListener('click', myLinesSheet);
  if (quiet !== true) speak(LINES.dictBubble);
};
/* 🎯 핵심 카드: 이 단계가 무엇을 묻는지, 규칙과 예시를 먼저 보여 줘요 */
function coreIntro(c) {
  const T = TYPES[c.keys[0]];
  const why = c.keys[0] === 'plain' ? '받침이 없거나 소리와 글자가 똑같은 말이에요. 한 글자씩 손가락으로 짚으며 빠짐없이 써요.'
    : c.keys[0] === 'mix' ? '앞에서 배운 규칙이 한 문장에 여러 개 숨어 있어요. 다 쓰고 나서 함정마다 다시 확인해요.' : T.why;
  app.innerHTML = `
    <h2 class="h">${c.icon} ${CORE.indexOf(c) + 1}단계 · ${c.name} <small class="h-note">${diffStars(c.diff)}</small></h2>
    <div class="core-card">
      <p class="core-ask"><b>🎯 이 단계에서 확인해요</b>${esc(c.ask)}</p>
      <div class="core-ex">${c.ex.map(([w, s]) => `<div class="ex"><span class="ex-s">${s.includes('✗') ? `<s>${esc(s.replace(' ✗', ''))}</s> ✗` : `🔊 [${esc(s)}]`}</span><span class="ex-arrow">→</span><b>${esc(w)}</b></div>`).join('')}</div>
      <p class="core-why">${why}</p>
    </div>
    <div class="row"><button class="btn primary big" id="coreGo">✏️ 시작! (${DICT_SIZE}문제)</button><button class="btn" id="coreBack">↩ 단계 고르기</button></div>`;
  speak([`${c.name}.`, c.ask]);
  $('#coreGo').onclick = () => { sfx('pop'); dictLevel(c.id); };
  $('#coreBack').onclick = () => go('dict');
}
/* ✏️ 우리 집 문장: 공책에서 틀린 문장을 어른이 넣어 두면 그 문장으로 연습해요 */
function myLinesSheet() {
  const el = sheet(`<h3 class="inv-t">✏️ 우리 집 문장</h3>
    <p class="small-note">공책에서 틀린 문장을 한 줄에 하나씩 적어 주세요. 문장 부호까지 바르게!</p>
    <textarea id="myLines" class="my-lines" rows="7" placeholder="친구를 만났다.&#10;책을 읽습니다.">${esc((S.myLines || []).join('\n'))}</textarea>
    <div id="myCheck" class="small-note"></div>
    <div class="row"><button class="btn primary" id="mySave">저장</button><button class="btn" id="myNo">닫기</button></div>`);
  const ta = $('#myLines', el);
  const show = () => {
    const L = ta.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 40);
    $('#myCheck', el).innerHTML = L.slice(0, 6).map((t) => `${esc(t)} → ${RULE_ONLY(SPELL.tags(t)).slice(0, 3).map((k) => TYPES[k] ? TYPES[k].icon + TYPES[k].name : '').join(' · ') || '쉬운 문장'}`).join('<br>');
    return L;
  };
  ta.addEventListener('input', show);
  show();
  $('#myNo', el).onclick = closeSheet;
  $('#mySave', el).onclick = () => { S.myLines = show(); save(); closeSheet(); toast(`✏️ ${S.myLines.length}문장을 넣었어요`); SCREENS.dict(true); };
}

let inputMode = 'tiles';
function dictLevel(id) {
  const school = SCHOOL.find((l) => l.id === id);
  const core = CORE.find((c) => c.id === id);
  /* 학교 시험 연습은 시험처럼 10문제를 차례대로, 나머지는 5문제를 골라서 */
  const items = school ? school.items : core ? coreItems(core) : id === 'wk' ? weakItems() : id === 'my' ? myItems()
    : shuffle([...DICTATION, ...GRADE_DICT].find((l) => l.id === id).items).slice(0, DICT_SIZE);
  if (!items.length) { go('dict'); return; }
  runQuiz(id, items, (q, i, n, mark, next) => dictQuestion(q, i, n, mark, next, { key: id, exam: !!school }));
  /* runQuiz의 '한 번 더'가 go(key)로 가므로 단계 화면을 등록 */
  SCREENS[id] = () => dictLevel(id);
}

/* 🔤 자모 판 */
const JAMO_ROWS = [
  'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ', 'ㅋㅌㅍㅎㄲㄸㅃㅆㅉ',
  'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ', 'ㅐㅒㅔㅖㅘㅙㅚㅝㅞㅟㅢ',
];
const PUNCTS = ['.', '?', '!', ','];
/* 채점 결과 그리기: 내 글(틀린 칸 빨강, 띄어야 할 곳 ∨, 붙여야 할 곳 ⌒, 빠진 부호) · 바른 글 */
function gradeLines(g, answer) {
  const { U, A, uOf } = g;
  const spMiss = new Set(g.space.filter((s) => s.miss).map((s) => uOf[s.at]));
  const spExtra = new Set(g.space.filter((s) => !s.miss).map((s) => uOf[s.at]));
  const pMiss = new Map(g.punct.filter((p) => p.want && uOf[p.at] >= 0).map((p) => [uOf[p.at], p.want]));
  const pBad = new Set(g.punct.filter((p) => p.got).map((p) => uOf[p.at]));
  const cell = (ch, cls = '') => `<span class="cell${cls}">${ch === ' ' ? '' : esc(ch)}</span>`;
  let mine = '';
  U.chars.forEach((ch, i) => {
    mine += cell(ch, g.marks[i] ? ' bad' : '');
    if (U.punAfter[i]) mine += [...U.punAfter[i]].map((p) => cell(p, ' pun' + (pBad.has(i) ? ' bad' : ''))).join('');
    if (pMiss.has(i)) mine += cell(pMiss.get(i), ' pun want');
    if (spMiss.has(i)) mine += '<span class="cell sp vmark" aria-label="띄어 써요">∨</span>';
    else if (U.gapAfter[i]) mine += `<span class="cell sp${spExtra.has(i) ? ' join' : ''}"${spExtra.has(i) ? ' aria-label="붙여 써요"' : ''}>${spExtra.has(i) ? '⌒' : ''}</span>`;
  });
  const fixSp = new Set(g.space.filter((s) => s.miss).map((s) => s.at));
  const fixP = new Set(g.punct.map((p) => p.at));
  let right = '';
  A.chars.forEach((ch, i) => {
    right += cell(ch, g.fix[i] ? ' fix' : '');
    if (A.punAfter[i]) right += [...A.punAfter[i]].map((p) => cell(p, ' pun' + (fixP.has(i) ? ' fix' : ''))).join('');
    if (A.gapAfter[i]) right += cell(' ', ' sp' + (fixSp.has(i) ? ' fix' : ''));
  });
  return `<div class="tl"><span class="tl-lab">내 글</span><div class="cells">${mine}</div></div>
    <div class="tl"><span class="tl-lab">바른 글</span><div class="cells">${right}</div></div>`;
}
/* 틀린 곳마다 까닭 (같은 까닭은 한 줄로) */
function gradeReasons(g) {
  const rows = [];
  const by = {};
  g.errs.forEach((e) => { (by[e.k] = by[e.k] || []).push(e); });
  Object.entries(by).forEach(([k, es]) => rows.push({ k, text: es.map((e) => (e.k === 'miss' ? `<b>${esc(e.a)}</b> 빠짐` : e.k === 'extra' ? `<s>${esc(e.u)}</s> 더 씀`
    : `<s>${esc(e.u)}</s> → <b>${esc(e.a)}</b>${e.back ? ' <small>(받침을 거꾸로 끌어왔어요)</small>' : ''}`)).join(' · ') }));
  if (g.space.length) rows.push({ k: 'space', text: g.space.map((s) => `${esc(g.A.chars[s.at])}${s.miss ? '<b class="v">∨</b>' : '<b class="v">⌒</b>'}${esc(g.A.chars[s.at + 1])}`).join(' · ') + ' <small>(∨ 띄어 써요 · ⌒ 붙여 써요)</small>' });
  if (g.punct.length) rows.push({ k: 'punct', text: g.punct.map((p) => (p.want ? `<b>${esc(g.A.chars[p.at])}${esc(p.want)}</b> ${p.got ? `(${esc(p.got)} ✗)` : '부호를 빠뜨렸어요'}` : `<s>${esc(p.got)}</s> 부호는 없어요`)).join(' · ') });
  return rows;
}
/* 이 문장에 숨은 함정: 소리 규칙(낱말 → [소리]) + 눈으로 외울 것 */
function trapList(q) {
  const out = [];
  q.t.split(/\s+/).forEach((w) => {
    const P = SPELL.pron(w), say = P.map((x) => x.say).join('');
    const k = P.flatMap((x) => x.why)[0];
    if (k && say !== w) out.push({ k, html: `<b>${esc(w.replace(/[.,!?~]/g, ''))}</b> → 소리 [${esc(say.replace(/[.,!?~]/g, ''))}]` });
  });
  (q.hints || []).forEach(([w, s, k]) => { if (!out.some((o) => o.k === k && o.html.includes(esc(w)))) out.push({ k, html: s === w ? `<b>${esc(w)}</b>` : k === 'spell' || k === 'sais' ? `<b>${esc(w)}</b> <s>${esc(s)}</s>` : `<b>${esc(w)}</b> → 소리 [${esc(s)}]` }); });
  ['ae', 'ye', 'dbl', 'ss', 'vow2', 'wae', 'ui', 'gyeop'].forEach((k) => {
    if (out.some((o) => o.k === k)) return;
    const chs = [...q.t].filter((ch) => SPELL.charTags(ch).includes(k));
    if (chs.length) out.push({ k, html: chs.slice(0, 3).map((c) => `<b>${esc(c)}</b>`).join(' ') });
  });
  return out.filter((o) => TYPES[o.k]).slice(0, 4);
}

function dictQuestion(q, i, n, mark, next, opt = {}) {
  app.classList.remove('dq-done');
  const target = q.t.trim();
  const diff = diffOf(opt.key);
  let typed = '';
  let stack = [];
  let jamo = [];
  let tries = 0;
  if (!['tiles', 'jamo', 'keys'].includes(inputMode)) inputMode = 'tiles';
  inputMode = S.inputMode || inputMode;
  const hasSpace = /\s/.test(target);
  const pieces = (() => {
    const base = [...target].filter((ch) => !/\s/.test(ch));
    const extra = SPELL.decoys(target);
    /* 데이터에 적힌 소리([눈싸람])에서도 헷갈리는 글자를 더해요 */
    (q.hints || []).forEach(([w, so]) => [...so.replace(/ /g, '')].forEach((ch, k) => { if (ch !== w.replace(/ /g, '')[k] && !base.includes(ch) && !extra.includes(ch) && SPELL.isH(ch)) extra.push(ch); }));
    const pun = hasSpace ? PUNCTS.filter((p) => !base.includes(p)).slice(0, 2) : [];
    return shuffle([...base, ...extra, ...pun]).map((ch) => ({ ch, used: false, pun: PUNCTS.includes(ch) }));
  })();
  const traps = trapList(q);
  const trapHtml = traps.map((t) => `<span class="trap"><i>${TYPES[t.k].icon}</i>${TYPES[t.k].name}</span>`).join('');

  app.innerHTML = `
    ${dots(i, n)}
    ${bubble(LINES.dictAsk, 'tight')}
    <div class="listen">
      <button class="btn listen-big" data-say="${esc(q.t)}">🔊 듣기</button>
      <button class="btn" data-say="${esc(q.t)}" data-slow="1">🐢 천천히</button>
      <button class="btn ghost" id="peek">👀 어른용</button>
    </div>
    ${traps.length && !opt.exam ? (diff <= 2 ? `<div class="traps" aria-label="이 문장의 함정">🔎 ${trapHtml}</div>` : `<div class="traps"><button class="link-btn" id="trapBtn">💡 함정 보기</button><span id="trapBox" hidden>${trapHtml}</span></div>`) : ''}
    <div class="paper" id="paper"><div id="ans"></div></div>
    <div class="modes" role="tablist">
      <button class="mode" role="tab" data-m="tiles">🧩 글자 조각</button>
      <button class="mode" role="tab" data-m="jamo">🔤 자모 조립</button>
      <button class="mode" role="tab" data-m="keys">⌨️ 키보드</button>
    </div>
    <div id="pad"></div>
    <div class="row check-row"><span id="padKeys"></span><button class="btn primary big" id="check">다 썼어요! ✔</button></div>
    <div class="explain" id="result" hidden></div>`;

  const paintAns = () => {
    $('#ans').innerHTML = cells(typed + '​');
    const last = $('#ans .cell:last-child');
    if (last) { last.textContent = ''; last.classList.add('cursor'); }
  };
  const ctl = (spaceBtn = true) => `${spaceBtn ? '<button class="btn" id="spc">␣ 띄우기</button>' : ''}<button class="btn" id="bk">⌫ 지우기</button>`;
  const paintPad = () => {
    $$('.mode', app).forEach((b) => b.setAttribute('aria-selected', b.dataset.m === inputMode));
    const pad = $('#pad');
    $('#padKeys').innerHTML = '';
    if (inputMode === 'keys') {
      pad.innerHTML = `<label class="sr" for="typed">여기에 써요</label>
        <input id="typed" class="typed" autocomplete="off" autocapitalize="off" spellcheck="false" lang="ko" placeholder="여기에 써요 (부호까지!)" value="${esc(typed)}">`;
      const inp = $('#typed');
      inp.addEventListener('input', () => { typed = inp.value; paintAns(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('#check').click(); });
      inp.focus();
    } else if (inputMode === 'jamo') {
      /* 자음·모음을 하나씩 눌러 글자를 만들어요 (공책에 쓰는 것처럼) */
      pad.innerHTML = `<div class="jamo">${JAMO_ROWS.map((r, k) => `<div class="jrow ${k < 2 ? 'con' : 'vow'}">${[...r].map((j) => `<button class="jk" data-j="${j}">${j}</button>`).join('')}</div>`).join('')}
        <div class="jrow pun">${PUNCTS.map((p) => `<button class="jk p" data-j="${p}">${p}</button>`).join('')}</div></div>`;
      $('#padKeys').innerHTML = ctl();
      $$('.jk', pad).forEach((b) => b.addEventListener('click', () => { jamo.push(b.dataset.j); typed = SPELL.compose(jamo); sfx('click'); paintAns(); }));
      $('#spc').onclick = () => { if (typed && !typed.endsWith(' ')) { jamo.push(' '); typed = SPELL.compose(jamo); paintAns(); } };
      $('#bk').onclick = () => { jamo.pop(); typed = SPELL.compose(jamo); paintAns(); };
    } else {
      pad.innerHTML = `<div class="tiles">${pieces.map((p, k) => `<button class="tile${p.pun ? ' pun' : ''}" data-k="${k}" ${p.used ? 'disabled' : ''}>${p.ch}</button>`).join('')}</div>`;
      /* 띄우기·지우기는 '다 썼어요' 옆에 (휴대폰에서 아래에 함께 붙어 있어요) */
      $('#padKeys').innerHTML = ctl(hasSpace);
      $$('.tile', pad).forEach((t) => t.addEventListener('click', () => {
        const p = pieces[+t.dataset.k];
        p.used = true; stack.push(+t.dataset.k); typed += p.ch; sfx('pop'); paintAns(); paintPad();
      }));
      $('#spc')?.addEventListener('click', () => { if (typed && !typed.endsWith(' ')) { typed += ' '; stack.push(-1); paintAns(); } });
      $('#bk').onclick = () => {
        const k = stack.pop();
        if (k === undefined) return;
        if (k >= 0) pieces[k].used = false;
        typed = typed.slice(0, -1);
        paintAns(); paintPad();
      };
    }
  };
  const resetInput = () => { typed = ''; stack = []; jamo = []; pieces.forEach((p) => { p.used = false; }); };
  $$('.mode', app).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.m === inputMode) return;
    inputMode = S.inputMode = b.dataset.m;
    save();
    /* 방식을 바꾸면 새로 써요 */
    resetInput();
    paintAns(); paintPad();
  }));
  $('#peek').onclick = () => toast(`<div class="peek"><small>어른이 읽어 주세요</small><b>${esc(q.t)}</b></div>`, 3500);
  $('#trapBtn')?.addEventListener('click', () => { $('#trapBox').hidden = false; $('#trapBtn').remove(); });
  paintAns(); paintPad();

  $('#check').onclick = () => {
    if (!typed.trim()) { toast('먼저 공책에 써 보세요! ✏️'); speak(LINES.writeFirst); return; }
    tries++;
    const g = SPELL.grade(typed, target);
    const ok = g.ok;
    if (tries === 1) {
      mark(ok);
      noteWeak(q, g);
      /* 조각 없이 스스로 쓰면 별 하나 더 */
      if (ok && inputMode !== 'tiles') { addStar(1); toast(`${inputMode === 'jamo' ? '🔤 자모' : '⌨️ 키보드'}로 혼자 써서 ⭐ +1`); }
    }
    sfx(ok ? 'ok' : 'no');
    const res = $('#result');
    const secrets = traps.map((t) => `<li><span class="t-icon">${TYPES[t.k].icon}</span>${t.html} <em>${TYPES[t.k].name}</em></li>`).join('');
    const secretBox = secrets ? `<p class="small-note">이 문장에 숨은 함정</p><ul class="secrets">${secrets}</ul>` : '';
    const checks = `<div class="checks"><span class="${g.lettersOk ? 'ok' : 'no'}">글자 ${g.letters.ok}/${g.letters.total}</span>
      <span class="${g.spaceOk ? 'ok' : 'no'}">띄어쓰기 ${g.spaceOk ? '✓' : `✗${g.space.length}`}</span>
      <span class="${g.punctOk ? 'ok' : 'no'}">문장 부호 ${g.punctOk ? '✓' : `✗${g.punct.length}`}</span></div>`;
    if (ok) {
      $('#paper').innerHTML = cells(q.t);
      maru($('#paper'));
      confetti();
      res.innerHTML = `<p class="yay">딩동댕! 또박또박 잘 썼어요! ⭐</p>
        ${secretBox}
        <button class="btn primary next">다음 ➜</button>`;
      speak(LINES.dictOk);
    } else {
      const rows = gradeReasons(g);
      const main = rows.find((r) => !['letter', 'miss', 'extra'].includes(r.k)) || rows[0];
      $('#paper').innerHTML = gradeLines(g, target);
      res.innerHTML = `${checks}
        ${main ? `<div class="reason main"><div class="typebadge"><span>${TYPES[main.k].icon}</span>${TYPES[main.k].name}</div><p>${main.text}</p><p class="small-note">${TYPES[main.k].why}</p></div>` : ''}
        ${rows.length > 1 ? `<ul class="more-reasons">${rows.filter((r) => r !== main).map((r) => `<li><span>${TYPES[r.k].icon} <b>${TYPES[r.k].name}</b></span> ${r.text}</li>`).join('')}</ul>` : ''}
        <div class="row"><button class="btn primary" id="retry">✏️ 다시 써 볼래요</button><button class="btn next">다음 ➜</button></div>`;
      speak([LINES.dictWrong, q.t]);
      $('#retry').onclick = () => {
        resetInput();
        $('#paper').innerHTML = '<div id="ans"></div>';
        res.hidden = true;
        app.classList.remove('dq-done');
        $('#check').disabled = false;
        paintAns(); paintPad();
        speak(q.t);
      };
    }
    $('#check').disabled = true;
    res.hidden = false;
    app.classList.add('dq-done'); /* 다 쓰면 글자 조각 자리에 결과를 보여 줘요 (스크롤 없이) */
    $('.next', res).onclick = next;
    res.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  };
  setTimeout(() => speak(q.t), 350);
}

/* ---------- 🐣 내 캐릭터 · 66일 공부 도전: 지킨 날 66일이면 10단계(전설) ----------
 * 지킨 날을 어떻게 인정할지는 부모님이 ⚙️ 설정에서 정해요 (부모님 비밀번호 4자리)
 *   trust  👍 아이를 믿어요: 한 판이라도 끝낸 날
 *   stars  ⭐ 열심히 한 날: 그날 모은 별이 need개 이상
 *   parent ✅ 부모님 확인: 부모님이 확인한 날만
 * 어느 방법이든 부모님이 확인한 날은 지킨 날. 쉬어도 줄지 않아요.
 * 속성 바꾸기는 한 번, 10단계까지 키우면 새 캐릭터(0일부터) · 다 키운 캐릭터는 컬렉션. 내 것이 아닌 캐릭터는 그림자.
 * 그림: img/chars/<속성><1~10>.webp
 * 기록: S.char {el, name, changes, start, floor, done:[…], v2} · S.days {날짜: {r 끝낸 판, s 별}} · S.pconf {rule, need, ok:{날짜:true}, pin} */
const CHAR_ELS = [
  { id: 'fire', name: '불꽃', emo: '🔥', c: '#f97316' },
  { id: 'water', name: '물방울', emo: '💧', c: '#0ea5e9' },
  { id: 'leaf', name: '새싹', emo: '🌿', c: '#22c55e' },
  { id: 'bolt', name: '번개', emo: '⚡', c: '#eab308' },
  { id: 'shadow', name: '그림자', emo: '🌙', c: '#8b5cf6' },
];
const CHAR_DAYS = [0, 7, 14, 21, 28, 35, 44, 52, 59, 66];
const CHAR_STARS_OLD = [0, 30, 80, 160, 300, 500, 800, 1200, 1700, 2400]; /* 예전(별) 기준 — 이미 키운 단계를 지켜 주려고 */
const CHAR_STAGE = ['꼬물이', '아기', '꼬마', '새내기', '씩씩이', '단짝', '용사', '고수', '영웅', '전설'];
const CHAR_MAX = CHAR_DAYS.length - 1;
const KEPT_RULES = { trust: ['👍', '아이를 믿어요', '한 판이라도 끝낸 날'], stars: ['⭐', '열심히 한 날', '그날 별을 기준만큼 모은 날'], parent: ['✅', '부모님이 확인해요', '부모님이 확인한 날만'] };
const charImg = (el, st) => `img/chars/${el}${st + 1}.webp`;
const charEl = (id) => CHAR_ELS.find((e) => e.id === id) || CHAR_ELS[0];
const myChar = () => (S.char && CHAR_ELS.some((e) => e.id === S.char.el) ? S.char : null);
const charName = (ch) => (ch && ch.name) || charEl(ch && ch.el).name;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const pconfOf = (st) => Object.assign({ rule: 'trust', need: 10, ok: {} }, (st || S).pconf || {});
function keptOnFor(st, ds) {
  const c = pconfOf(st), d = (st.days || {})[ds];
  if (c.ok && c.ok[ds]) return true;
  if (!d || c.rule === 'parent') return false;
  return c.rule === 'stars' ? (d.s || 0) >= (c.need || 10) : (d.r || 0) > 0;
}
function keptDaysFor(st) {
  const ch = st.char || {}, ds = new Set([...Object.keys(st.days || {}), ...Object.keys(pconfOf(st).ok || {})]);
  return [...ds].filter((d) => (!ch.start || d >= ch.start) && keptOnFor(st, d)).length;
}
function charCalc(n) {
  n = Math.max(0, n || 0);
  let stage = 0;
  CHAR_DAYS.forEach((p, i) => { if (n >= p) stage = i; });
  const next = stage < CHAR_MAX ? CHAR_DAYS[stage + 1] : null;
  const pct = next ? Math.min(100, Math.round(((n - CHAR_DAYS[stage]) / (next - CHAR_DAYS[stage])) * 100)) : 100;
  return { pts: n, stage, next, toNext: next ? next - n : 0, pct };
}
/* 기준이 바뀌어도 이미 키운 단계는 내려가지 않아요 (floor) */
function charNowFor(st) {
  const ch = st.char || {};
  let n = keptDaysFor(st);
  if (ch.floor && n < CHAR_DAYS[ch.floor]) n = CHAR_DAYS[ch.floor];
  return charCalc(n);
}
const charNow = () => charNowFor(S);
/* 예전(모은 별) 기준으로 키운 캐릭터 → 단계는 지키고, 오늘부터 지킨 날로 세요 (한 번만) */
function charMigrate() {
  if (!S.char || S.char.v2) return;
  let floor = 0;
  CHAR_STARS_OLD.forEach((p, i) => { if ((S.earned || 0) >= p) floor = i; });
  S.char = { ...S.char, changes: S.char.changes || 0, start: todayStr(), floor, done: S.char.done || [], v2: 1 };
  save();
}
/* 한 판을 끝낼 때마다: 오늘 기록 → 자랐으면 S.grewTo */
function charRecordRound(stars) {
  const before = charNow().stage, ds = todayStr();
  S.days = S.days || {};
  const d = S.days[ds] || { r: 0, s: 0 };
  S.days[ds] = { r: d.r + 1, s: d.s + (stars || 0) };
  const after = charNow().stage;
  if (myChar() && after > before) S.grewTo = after;
  save();
}
function charThumb() {
  const ch = myChar();
  return ch ? `<img class="cc-img" src="${charImg(ch.el, charNow().stage)}" alt="">` : '<span class="cc-egg" aria-hidden="true">🥚</span>';
}
/* 🗺️ 지도 맨 위 */
function charCard() {
  const ch = myChar(), c = charNow();
  if (!ch) return `<button class="char-card" data-go="char">${charThumb()}<span class="cc-txt"><b>내 캐릭터를 골라 봐요!</b><small>66일을 지키면 전설까지 자라요</small></span><span class="cc-go">›</span></button>`;
  return `<button class="char-card" data-go="char" style="--cc:${charEl(ch.el).c}">${charThumb()}
    <span class="cc-txt"><b>${esc(charName(ch))} <em>Lv${c.stage + 1} ${CHAR_STAGE[c.stage]}</em></b>
      <span class="cc-bar"><i style="width:${c.pct}%"></i></span>
      <small>지킨 날 ${c.pts}/66일 · ${c.next ? `다음 모습까지 ${c.toNext}일` : '전설이 됐어요 🏆'}</small></span><span class="cc-go">›</span></button>`;
}
/* 결과 화면 */
function charStrip() {
  const ch = myChar(), c = charNow(), kept = keptOnFor(S, todayStr());
  if (!ch) return `<button class="char-card" id="finChar">${charThumb()}<span class="cc-txt"><b>🐣 내 캐릭터를 골라 봐요</b><small>66일을 지키면 전설까지 자라요</small></span><span class="cc-go">›</span></button>`;
  const R = KEPT_RULES[pconfOf(S).rule] || KEPT_RULES.trust;
  return `<button class="char-card" id="finChar" style="--cc:${charEl(ch.el).c}">${charThumb()}
    <span class="cc-txt"><b>${esc(charName(ch))} <em>Lv${c.stage + 1}</em></b><span class="cc-bar"><i style="width:${c.pct}%"></i></span>
      <small>${kept ? '✅ 오늘은 지킨 날!' : pconfOf(S).rule === 'parent' ? '✅ 부모님이 확인하면 지킨 날이 돼요' : `${R[0]} 오늘 ${pconfOf(S).rule === 'stars' ? `별 ${(S.days[todayStr()] || {}).s || 0}/${pconfOf(S).need}` : ''} 조금만 더!`} · ${c.pts}/66일</small></span><span class="cc-go">›</span></button>`;
}
document.addEventListener('click', (e) => { if (e.target.closest('#finChar')) { sfx('pop'); go('char'); } });
function charGrow(stage) {
  const ch = myChar();
  if (!ch || !stage) return;
  const E = charEl(ch.el), nm = charName(ch);
  const el = sheet(`<div class="grow" style="--cc:${E.c}">
      <p class="inv-t"><b>${esc(nm)}${josaPick(nm, ['이', '가'])} 자랐어요!</b></p>
      <div class="grow-pic"><img class="old" src="${charImg(ch.el, stage - 1)}" alt=""><img class="new" src="${charImg(ch.el, stage)}" alt=""></div>
      <p class="grow-lv">Lv${stage + 1} · ${CHAR_STAGE[stage]}</p>
      <p class="small-note">${stage >= CHAR_MAX ? '66일을 지켜서 전설이 됐어요! 🏆 이제 새 캐릭터도 키울 수 있어요.' : `지킨 날 ${CHAR_DAYS[stage]}일! 스스로 해낸 거예요!`}</p>
      <button class="btn primary big" id="growOk">좋아요!</button></div>`, 'grow-sheet');
  sfx('victory');
  confetti();
  speak(`${nm}${josaPick(nm, ['이', '가'])} 자랐어! 스스로 해낸 거야!`);
  $('#growOk', el).onclick = closeSheet;
}
let charPick = '';
SCREENS.char = () => {
  charMigrate();
  const ch = myChar(), c = charNow();
  const maxed = !!ch && c.stage >= CHAR_MAX, done = (ch && ch.done) || [];
  const canChange = !!ch && !maxed && (ch.changes || 0) < 1;
  const pickable = (id) => !done.some((d) => d.el === id) && (!ch || id !== ch.el) && (!ch || maxed || canChange);
  const el = charPick && (pickable(charPick) || (ch && charPick === ch.el)) ? charPick : (ch ? ch.el : charPick || 'fire'), E = charEl(el);
  const preview = !!ch && el !== ch.el;
  const R = KEPT_RULES[pconfOf(S).rule] || KEPT_RULES.trust;
  const all = [...ISLANDS.filter((x) => !['dict', 'exam'].includes(x.id)), ...DICTATION.map((d) => ({ id: d.id, icon: '🎧', name: `받아쓰기 ${d.name}` })),
    ...CORE.map((d, k) => ({ id: d.id, icon: d.icon, name: `받아쓰기 ${k + 1}단계 ${d.name}` })),
    ...GRADE_DICT.filter((d) => S.best[d.id] != null).map((d) => ({ id: d.id, icon: '📚', name: `${d.grade}학년 ${d.name}` })),
    ...MATH.ALL.filter((d) => S.best[d.id] != null).map((d) => ({ id: d.id, icon: '🔢', name: `수학 ${d.name}` })),
    ...SCHOOL.map((d) => ({ id: d.id, icon: '📝', name: `시험 ${d.n}급` }))];
  const line = !ch ? '함께 자랄 친구를 골라 봐! 66일을 지키면 전설이 돼.' : maxed ? '전설까지 키웠어! 이제 새 친구를 골라 처음부터 키울 수 있어.' : `${charName(ch)}${josaPick(charName(ch), ['은', '는'])} 지킨 날만큼 자라. 하루 쉬어도 괜찮아, 줄어들지 않아!`;
  const rule = !ch ? '고른 뒤에는 <b>한 번만</b> 바꿀 수 있어요.' : maxed ? '🏆 전설! <b>새 캐릭터</b>를 골라 0일부터 키울 수 있어요. 지금 캐릭터는 컬렉션에 남아요.'
    : canChange ? '속성은 <b>한 번만</b> 바꿀 수 있어요 (지킨 날은 그대로). 다른 친구는 10단계까지 키우면 만나요.' : '바꾸기를 이미 썼어요. <b>10단계(전설)</b>까지 키우면 새 친구를 고를 수 있어요.';
  const elBtn = (e) => {
    const d = done.find((x) => x.el === e.id), mine = ch && e.id === ch.el, lit = mine || !!d; /* 아직 얻지 않은 캐릭터는 고르기 전에도 그림자 */
    const can = pickable(e.id) || (mine && preview);
    return `<button role="radio" aria-checked="${e.id === el}" class="${lit ? '' : 'shadow'}" ${can ? `data-el="${e.id}"` : 'disabled'} style="--cc:${e.c}"><img src="${charImg(e.id, mine ? c.stage : d ? CHAR_MAX : 0)}" alt=""><span>${lit || !ch ? `${e.emo} ${e.name}` : '？'}${d ? ' 🏆' : ''}</span></button>`;
  };
  const btn = !ch ? '이 친구로 정했어!' : preview && maxed ? '🐣 이 친구 새로 키우기' : preview ? '이 친구로 바꾸기 (한 번만)' : '이름 저장';
  app.innerHTML = `
    <h2 class="h">🐣 내 캐릭터 <small class="h-note">${esc(STORE.current().name)} · 66일 공부 도전</small></h2>
    <div class="char-hero${preview || !ch ? ' is-shadow' : ''}" style="--cc:${E.c}">
      <img src="${charImg(el, preview || !ch ? 0 : c.stage)}" alt="">
      <b class="ch-name">${!ch ? `${E.emo} ${E.name}` : preview ? (maxed ? `${E.emo} 새 친구` : '？？？') : esc((ch && ch.name) || E.name)}</b>
      <span class="ch-lv">${!ch ? '어떤 친구가 태어날까? 고르면 모습이 보여요' : preview ? (maxed ? 'Lv1부터 새로 시작해요' : '바꾸면 어떤 모습일까?') : `Lv${c.stage + 1} · ${CHAR_STAGE[c.stage]} · 지킨 날 ${c.pts}/66일`}</span>
      ${preview || !ch ? '' : `<span class="cc-bar big"><i style="width:${c.pct}%"></i></span><small>${c.next ? `다음 모습까지 ${c.toNext}일` : '66일을 지켜 전설이 됐어요!'}</small>`}
    </div>
    ${bubble(line, 'tight')}
    <h3 class="h3">캐릭터</h3>
    <div class="char-els" role="radiogroup" aria-label="캐릭터">${CHAR_ELS.map(elBtn).join('')}</div>
    <p class="small-note">${rule}</p>
    <form class="char-form" id="charForm"><label for="charNm">이름</label>
      <input id="charNm" class="typed small" maxlength="8" autocomplete="off" placeholder="${E.name}" value="${esc(preview ? '' : (ch && ch.name) || '')}">
      <button class="btn primary">${btn}</button></form>
    <h3 class="h3">자라는 모습</h3>
    <div class="char-gal">${CHAR_DAYS.map((p, i) => { const open = !preview && ch && i <= c.stage; return `<span class="cgal${open ? '' : ' lock'}${!preview && ch && i === c.stage ? ' now' : ''}"><img src="${charImg(el, i)}" alt="" loading="lazy"><small>${open ? `Lv${i + 1} ${CHAR_STAGE[i]}` : `${p}일`}</small></span>`; }).join('')}</div>
    ${done.length ? `<h3 class="h3">🏆 다 키운 친구</h3><div class="char-done">${done.map((d) => `<span><img src="${charImg(d.el, CHAR_MAX)}" alt=""><b>${esc(d.name || charEl(d.el).name)}</b></span>`).join('')}</div>` : ''}
    <p class="small-note">🏅 지킨 날: <b>${R[0]} ${R[1]}</b> — ${pconfOf(S).rule === 'stars' ? `그날 별 ${pconfOf(S).need}개 이상` : R[2]} (부모님이 ⚙️ 설정에서 정해요). 7 · 14 · 21 … 66일마다 한 단계, 하루 쉬어도 줄지 않아요.</p>
    <details class="bests-box"><summary class="h3">🏆 섬마다 최고 점수</summary>
    <ul class="bests">${all.map((x) => `<li><span>${x.icon} ${x.name}</span><b>${S.best[x.id] != null ? S.best[x.id] + '점' : '—'}</b></li>`).join('')}</ul></details>`;
  speak(line);
  $$('[data-el]', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); charPick = b.dataset.el; SCREENS.char(); }));
  $('#charForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nm = $('#charNm').value.trim().slice(0, 8);
    if (!ch) S.char = { el, name: nm, changes: 0, start: todayStr(), floor: 0, done: [], v2: 1 };
    else if (preview && maxed) S.char = { el, name: nm, changes: 0, start: dayStr(-1), floor: 0, done: [...done, { el: ch.el, name: ch.name, at: todayStr() }], v2: 1 };
    else if (preview) { if (!confirm(`${E.name}(으)로 바꿀까요? 바꾸기는 한 번만 할 수 있어요.`)) return; S.char = { ...ch, el, name: nm || ch.name, changes: (ch.changes || 0) + 1 }; }
    else S.char = { ...ch, name: nm };
    charPick = '';
    save();
    sfx('star');
    toast(`🐣 ${esc(charName(S.char))}${josaPick(charName(S.char), ['과', '와'])} 함께 자라요!`);
    SCREENS.char();
  });
};

/* ---------- ⚙️ 부모님: 지킨 날 인정 방법 · 날마다 확인 (부모님 비밀번호 4자리) ---------- */
let parentOpen = false;
function keptParentBox() {
  const c = pconfOf(S), nm = esc(STORE.current().name);
  if (!c.pin) return `<section class="setbox"><h3 class="h3">🐣 지킨 날 인정 방법 <small class="h-note">부모님</small></h3>
    <p class="small-note">${nm}의 캐릭터가 자라는 '지킨 날'을 어떻게 인정할지 정해요. 먼저 <b>부모님 비밀번호 4자리</b>를 정해 주세요.</p>
    <form class="rename" id="pinSet"><input class="typed small" id="pinNew" inputmode="numeric" maxlength="4" placeholder="숫자 4자리" autocomplete="off"><button class="btn small primary">정하기</button></form></section>`;
  if (!parentOpen) return `<section class="setbox"><h3 class="h3">🐣 지킨 날 인정 방법 <small class="h-note">부모님</small></h3>
    <p class="small-note">지금: <b>${KEPT_RULES[c.rule][0]} ${KEPT_RULES[c.rule][1]}</b>. 바꾸거나 날마다 확인하려면 부모님 비밀번호를 넣어 주세요.</p>
    <form class="rename" id="pinIn"><input class="typed small" id="pinTry" inputmode="numeric" maxlength="4" type="password" placeholder="비밀번호" autocomplete="off"><button class="btn small primary">열기</button></form></section>`;
  const W = '일월화수목금토';
  const rows = Array.from({ length: 14 }, (_, i) => dayStr(i)).map((ds) => {
    const d = (S.days || {})[ds] || { r: 0, s: 0 }, ok = !!c.ok[ds], k = keptOnFor(S, ds), dt = new Date(ds + 'T00:00');
    return `<li class="kp-row${k ? ' on' : ''}"><span class="kp-d">${dt.getMonth() + 1}/${dt.getDate()} <small>${W[dt.getDay()]}</small></span><span class="kp-i">${d.r}판 · ⭐ ${d.s}</span>
      <button class="btn small${ok ? ' primary' : ''}" data-ok="${ds}">${ok ? '✅ 확인함' : '확인'}</button></li>`;
  }).join('');
  return `<section class="setbox"><h3 class="h3">🐣 지킨 날 인정 방법 <small class="h-note">${nm}</small></h3>
    <div class="seg" role="radiogroup">${Object.entries(KEPT_RULES).map(([k, R]) => `<button role="radio" aria-checked="${c.rule === k}" data-rule="${k}">${R[0]} ${R[1]}</button>`).join('')}</div>
    ${c.rule === 'stars' ? `<div class="seg" style="margin-top:8px">${[5, 10, 20, 30].map((n) => `<button role="radio" aria-checked="${c.need === n}" data-need="${n}">⭐ ${n}개</button>`).join('')}</div>` : ''}
    <p class="small-note">${c.rule === 'stars' ? `그날 별 ${c.need}개 이상 모은 날` : KEPT_RULES[c.rule][2]}을 지킨 날로 쳐요. 어느 방법이든 아래에서 확인한 날은 지킨 날이에요.</p>
    <ul class="kp-list">${rows}</ul>
    <button class="btn small" id="pinLock">🔒 잠그기</button></section>`;
}
function wireKeptParent() {
  const c = pconfOf(S);
  const put = (patch) => { S.pconf = { ...c, ...patch }; save(); SCREENS.voice(); };
  $('#pinSet')?.addEventListener('submit', (e) => { e.preventDefault(); const v = $('#pinNew').value.trim(); if (!/^\d{4}$/.test(v)) { toast('숫자 4자리로 정해 주세요'); return; } parentOpen = true; put({ pin: v }); });
  $('#pinIn')?.addEventListener('submit', (e) => { e.preventDefault(); if ($('#pinTry').value.trim() === c.pin) { parentOpen = true; SCREENS.voice(); } else toast('비밀번호가 달라요'); });
  $('#pinLock')?.addEventListener('click', () => { parentOpen = false; SCREENS.voice(); });
  $$('[data-rule]', app).forEach((b) => b.addEventListener('click', () => put({ rule: b.dataset.rule })));
  $$('[data-need]', app).forEach((b) => b.addEventListener('click', () => put({ need: +b.dataset.need })));
  $$('[data-ok]', app).forEach((b) => b.addEventListener('click', () => { const ok = { ...(c.ok || {}) }; if (ok[b.dataset.ok]) delete ok[b.dataset.ok]; else ok[b.dataset.ok] = true; put({ ok }); }));
}

/* ---------- 🔢 수학 섬 (구구단 · 덧셈 · 뺄셈 · 곱셈 · 나눗셈 · 섞어서) ---------- */
const MATH_LINE = {
  gugu: '구구단 성이야! 단을 골라서 외워 보자. 구구단표에서 노래도 들을 수 있어.',
  plus: '덧셈 동산이야! 더하면 수가 커져.', minus: '뺄셈 계곡이야! 빼면 수가 작아져.',
  times: '곱셈 공장이야! 똑같은 묶음이 몇 개인지 세어 봐.', divide: '나눗셈 빵집이야! 똑같이 나누어 줘.',
  mix: '수학 왕 탑이야! 모두 섞어서 도전해 봐.',
};
function mathIsland(isl) {
  const meta = MATH_ISLANDS.find((x) => x.id === isl);
  app.innerHTML = `
    <h2 class="h">${meta.icon} ${meta.name}</h2>
    ${bubble(MATH_LINE[isl], 'tight')}
    ${isl === 'gugu' ? '<button class="btn gugu-table-btn" id="guguTable">📋 구구단표 보고 노래 듣기</button>' : ''}
    <p class="small-note tab-note">단계마다 ${MATH.SIZE}문제 · 숫자 버튼으로 답해요</p>
    <div class="levels ${isl === 'gugu' ? 'gugu' : 'grade'}">${MATH.ISLANDS[isl].map((lv) => `
      <button class="level" data-id="${lv.id}"><span class="l-icon${isl === 'gugu' && /^\d$/.test(lv.icon) ? ' dan' : ''}">${lv.icon}</span>
        <span class="l-name">${lv.name}</span><span class="l-sub">${esc(lv.desc)}</span>
        ${diffTag(lv.id)}${S.best[lv.id] ? `<span class="i-best">최고 ${S.best[lv.id]}점</span>` : ''}</button>`).join('')}</div>`;
  $$('.level', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); mathLevel(b.dataset.id); }));
  $('#guguTable')?.addEventListener('click', () => { sfx('pop'); go('guguTable'); });
  speak(MATH_LINE[isl]);
}
MATH_ISLANDS.forEach((m) => { SCREENS[m.id] = () => mathIsland(m.id); });
function mathLevel(id) {
  runQuiz(id, MATH.questions(id), mathQuestion);
  SCREENS[id] = () => mathLevel(id); /* '한 번 더' */
}

/* 📋 구구단표: 칸을 누르면 "칠 팔 오십육", 단 이름을 누르면 그 단 노래 */
SCREENS.guguTable = () => {
  app.innerHTML = `<h2 class="h">📋 구구단표</h2>${bubble('칸을 누르면 읽어 주고, 위의 단 이름을 누르면 그 단을 노래해 줘!', 'tight')}
    <div class="gugu-table">${[2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<div class="gt-col">
      <button class="gt-head" data-dan="${d}">${d}단 🎵</button>
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => `<button class="gt-cell" data-say="${esc(MATH.chant(d, b))}" data-d="${d}" data-b="${b}">${d}×${b}=<b>${d * b}</b></button>`).join('')}
    </div>`).join('')}</div>
    <div class="row"><button class="btn primary" id="toGugu">✖️ 구구단 문제 풀기</button></div>`;
  $$('.gt-head', app).forEach((h) => h.addEventListener('click', () => {
    const d = +h.dataset.dan;
    $$('.gt-cell', app).forEach((c) => c.classList.toggle('sing', +c.dataset.d === d));
    speak([`${MATH.ko(d)}단`, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => MATH.chant(d, b))]);
  }));
  $$('.gt-cell', app).forEach((c) => c.addEventListener('click', () => { sfx('pop'); $$('.gt-cell.lit', app).forEach((x) => x.classList.remove('lit')); c.classList.add('lit'); }));
  $('#toGugu').onclick = () => go('gugu');
  speak('칸을 누르면 읽어 주고, 단 이름을 누르면 그 단을 노래해 줘!');
};

/* 문제 화면: 식 + (작은 수는 그림) + 숫자 버튼 */
/* 숫자 뒤 조사는 읽는 소리로: 2(이)예요 · 21(이십일)이에요 · 1(일)을 · 2(이)를 */
const nj = (n, j) => (MATH.eun(MATH.ko(n)) === '은' ? j[0] : j[1]);
const MATH_EMOJI = ['🍎', '🍓', '🐟', '⭐', '🍪', '🎈', '🐥', '🍩'];
const objs = (n, e, cls = '') => `<span class="objs ${cls}">${Array.from({ length: n }, (_, k) => `<i${k && k % 5 === 0 ? ' class="gap5"' : ''}>${e}</i>`).join('')}</span>`;
function mathQuestion(q, i, n, mark, next) {
  const slot = '<span class="slot" id="slot">?</span>';
  const part = (v, isBlank) => (isBlank ? slot : `<span class="num">${v}</span>`);
  const pic = (q.op === '+' || q.op === '-') && q.blank === 'ans' && q.a <= 10 && q.b <= 10;
  const e = MATH_EMOJI[(q.a * 7 + q.b) % MATH_EMOJI.length];
  app.innerHTML = `
    ${dots(i, n)}
    <div class="mq">
      <button class="spk" data-say="${esc(q.say)}" aria-label="문제 읽어 주기">🔊</button>
      <div class="eqn" aria-label="${esc(q.text)}">${part(q.a, q.blank === 'a')}<span class="op">${q.op}</span>${part(q.b, q.blank === 'b')}<span class="op">=</span>${part(q.ans, q.blank === 'ans')}</div>
      ${pic ? `<div class="mpic">${q.op === '+' ? `${objs(q.a, e)}<b class="plus">+</b>${objs(q.b, e, 'b')}` : objs(q.a, e, 'minus-src')}</div>` : ''}
    </div>
    <div class="numpad" id="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-k="${d}">${d}</button>`).join('')}
      <button data-k="del" class="np-del" aria-label="지우기">⌫</button><button data-k="0">0</button><button data-k="ok" class="np-ok" aria-label="확인">✔</button></div>
    <div class="explain" hidden></div>`;
  let typed = '', done = false;
  const paint = () => { const el = $('#slot'); el.textContent = typed || (q.blank === 'ans' ? '?' : '□'); el.classList.toggle('typing', !!typed); };
  paint();
  const check = () => {
    if (done) return;
    if (!typed) { toast('숫자 버튼으로 답을 눌러요! 🔢'); return; }
    done = true;
    const ok = +typed === q.want;
    mark(ok);
    sfx(ok ? 'ok' : 'no');
    const el = $('#slot');
    el.classList.add(ok ? 'right' : 'wrong');
    el.innerHTML = ok ? `${q.want}` : `<s>${typed}</s> ${q.want}`;
    if (ok) maru($('.mq', app));
    $('#numpad').classList.add('used');
    const ex = $('.explain', app);
    ex.innerHTML = `${ok ? '<p class="yay">딩동댕! 정답이에요! ⭐</p>' : `<p class="oops">아쉬워요! 정답은 <b>${q.want}</b>${nj(q.want, ['이에요', '예요'])}.</p>`}
      ${mathWhy(q)}<button class="btn primary next">다음 ➜</button>`;
    ex.hidden = false;
    if (pic && q.op === '-') $$('.minus-src i', app).slice(-q.b).forEach((x) => x.classList.add('gone'));
    const full = `${MATH.ko(q.a)} ${MATH.OPW[q.op]} ${MATH.ko(q.b)}${MATH.eun(MATH.ko(q.b))} ${MATH.ko(q.ans)}`;
    speak([ok ? LINES.ding : LINES.oops, q.op === '×' && q.a <= 9 && q.b <= 9 ? MATH.chant(q.a, q.b) : full]);
    $('.next', ex).onclick = next;
  };
  $$('#numpad button', app).forEach((b) => b.addEventListener('click', () => {
    if (done) return;
    const k = b.dataset.k;
    if (k === 'ok') return check();
    sfx('click');
    if (k === 'del') typed = typed.slice(0, -1);
    else if (typed.length < 3) typed = (typed === '0' ? '' : typed) + k;
    paint();
  }));
  /* 키보드로도: 숫자 · 지우기 · 엔터 */
  const onKey = (ev) => {
    if (!document.body.contains($('#numpad'))) { document.removeEventListener('keydown', onKey); return; }
    if (/^\d$/.test(ev.key)) $(`#numpad [data-k="${ev.key}"]`)?.click();
    else if (ev.key === 'Backspace') $('#numpad [data-k="del"]')?.click();
    else if (ev.key === 'Enter') { if (done) $('.explain .next', app)?.click(); else check(); }
  };
  document.addEventListener('keydown', onKey);
  speak(q.say);
}
/* 왜 그렇게 될까? 틀려도 맞아도 한 줄 설명 + 그림 */
function mathWhy(q) {
  const { a, b, op, ans } = q;
  const eq = `<p class="m-eq">${a} ${op} ${b} = <b>${ans}</b></p>`;
  const back = q.blank === 'ans' ? '' : `<p class="small-note">□ 문제는 거꾸로 생각해요: ${op === '×' ? `${ans} ÷ ${q.blank === 'a' ? b : a} = ${q.want}` : op === '÷' ? (q.blank === 'a' ? `${b} × ${ans} = ${a}` : `${a} ÷ ${ans} = ${b}`) : op === '+' ? `${ans} - ${q.blank === 'a' ? b : a} = ${q.want}` : q.blank === 'a' ? `${ans} + ${b} = ${a}` : `${a} - ${ans} = ${b}`}</p>`;
  if (op === '×') {
    const arr = a <= 9 && b <= 9 ? `<div class="dot-arr" style="--c:${a}" aria-hidden="true">${Array.from({ length: a * b }, () => '<i></i>').join('')}</div>` : '';
    return `${eq}${a <= 9 && b <= 9 ? `<p>🎵 <b>${MATH.chant(a, b)}</b> · ${a}개씩 ${b}묶음이에요.</p>` : `<p>${a}${nj(a, ['을', '를'])} ${b}번 더해요: ${Array(b).fill(a).join(' + ')} = ${ans}</p>`}${arr}${back}`;
  }
  if (op === '÷') return `${eq}<p>🍕 ${a}개를 ${b}명에게 똑같이 나누면 한 명에 <b>${ans}</b>개! ${b}단에서 찾아요: <b>${b} × ${ans} = ${a}</b></p>${back}`;
  const oa = a % 10, ob = b % 10;
  if (op === '+') {
    if (a < 10 && b < 10 && ans > 10) return `${eq}<p>🔟 10 만들기! ${a}에 <b>${10 - a}</b>${nj(10 - a, ['을', '를'])} 더하면 10, 남은 <b>${b - (10 - a)}</b>${nj(b - (10 - a), ['을', '를'])} 더하면 <b>${ans}</b></p>${back}`;
    if (a >= 10 || b >= 10) return `${eq}${columnCalc(a, '+', b, ans)}<p class="small-note">${oa + ob >= 10 ? '일의 자리끼리 더해서 10이 넘으면, 10을 십의 자리로 올려요(받아올림)!' : '일의 자리끼리, 십의 자리끼리 더해요.'}</p>${back}`;
  }
  if (op === '-') {
    if (a > 10 && a < 20 && b < 10 && oa < ob) return `${eq}<p>🪜 ${a}에서 먼저 <b>${oa}</b>${nj(oa, ['을', '를'])} 빼면 10, 남은 <b>${b - oa}</b>${nj(b - oa, ['을', '를'])} 더 빼면 <b>${ans}</b></p>${back}`;
    if (a >= 10) return `${eq}${columnCalc(a, '-', b, ans)}<p class="small-note">${oa < ob ? '일의 자리에서 뺄 수 없으면, 십의 자리에서 10을 빌려 와요(받아내림)!' : '일의 자리끼리, 십의 자리끼리 빼요.'}</p>${back}`;
  }
  return `${eq}${back}`;
}
/* 세로셈: 받아올림은 작은 1, 받아내림은 빌려 온 수 */
function columnCalc(a, op, b, ans) {
  const w = Math.max(String(a).length, String(b).length, String(ans).length);
  const dig = (n) => String(n).padStart(w, ' ').split('');
  const A = dig(a), B = dig(b), marks = Array(w).fill(''), strike = Array(w).fill(false);
  if (op === '+') {
    let c = 0;
    for (let i = w - 1; i >= 0; i--) { const s2 = (+A[i] || 0) + (+B[i] || 0) + c; c = s2 >= 10 ? 1 : 0; if (c && i > 0) marks[i - 1] = '1'; }
  } else {
    const d = A.map((x) => +x || 0);
    for (let i = w - 1; i >= 0; i--) {
      if (d[i] < (+B[i] || 0) && i > 0) { d[i] += 10; d[i - 1] -= 1; marks[i] = String(d[i]); marks[i - 1] = String(d[i - 1]); strike[i - 1] = true; strike[i] = true; }
    }
  }
  const row = (cells, cls = '', opch = '') => `<div class="cc-row ${cls}"><span class="cc-op">${opch}</span>${cells.map((x, k) => `<span${cls === '' && strike[k] ? ' class="st"' : ''}>${x.trim() ? x : ''}</span>`).join('')}</div>`;
  return `<div class="col-calc" aria-hidden="true">${row(marks, 'mk')}${row(A)}${row(B, 'b', op)}<div class="cc-line"></div>${row(dig(ans), 'res')}</div>`;
}

/* ---------- ⚙️ 목소리 설정 (어른용) ---------- */
SCREENS.voice = () => {
  const ua = navigator.userAgent;
  const device = /iPad|iPhone|Macintosh/.test(ua) && 'ontouchend' in document ? 'ios'
    : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? 'mac' : 'pc';
  const tips = {
    ios: '설정 → 손쉬운 사용 → 읽기 및 말하기 → 음성 → 한국어 → <b>Yuna (프리미엄)</b>을 내려받으면 훨씬 자연스러워요. 내려받은 뒤 이 화면을 다시 열어 고르세요.',
    mac: '시스템 설정 → 손쉬운 사용 → 읽기 및 말하기 → 시스템 음성 → 음성 관리에서 <b>Yuna (프리미엄)</b>을 내려받거나, <b>Microsoft Edge</b>로 열면 자연스러운 목소리가 나와요.',
    android: '설정 → 텍스트 음성 변환(TTS) → Google 음성 인식 및 합성 → 한국어 <b>고품질 음성 데이터</b>를 설치하세요.',
    pc: '<b>Microsoft Edge</b>로 열면 "SunHi Online (Natural)" 같은 사람 같은 목소리를 쓸 수 있어요. 크롬에서는 "Google 한국의"가 가장 나아요.',
  }[device];
  const rate = S.rate || 'normal';
  app.innerHTML = `
    <h2 class="h">⚙️ 설정 <small class="h-note">어른용</small></h2>
    <button class="char-card set" id="toCharSet">${charThumb()}<span class="cc-txt"><b>🐣 내 캐릭터</b><small>${esc(STORE.current().name)}의 캐릭터 · 속성 · 이름 · 자라는 모습</small></span><span class="cc-go">›</span></button>
    ${familyBox()}
    ${keptParentBox()}
    <h3 class="h3">🔊 목소리</h3>
    ${CLIPS.size ? `
      <label class="opt"><input type="checkbox" id="useClips" ${S.useClips !== false ? 'checked' : ''}>
        <span><b>🎙️ 녹음된 목소리 쓰기</b><br><small>미리 만든 자연스러운 목소리 (${window.AUDIO_CLIPS.voice || '녹음'}, ${CLIPS.size}개)</small></span></label>` : ''}
    <section class="setbox">
      <h3 class="h3">빠르기</h3>
      <div class="seg" role="radiogroup" aria-label="말 빠르기">${[['slow', '🐢 느리게'], ['normal', '🙂 보통'], ['fast', '🐇 빠르게']].map(([k, l]) =>
        `<button role="radio" aria-checked="${rate === k}" data-rate="${k}">${l}</button>`).join('')}</div>
    </section>
    <section class="setbox">
      <h3 class="h3">기기 목소리</h3>
      ${koVoices.length ? `<ul class="voices">${koVoices.map((v, k) => `
        <li><label class="opt"><input type="radio" name="voice" id="voice-${k}" value="${esc(v.name)}" ${koVoice && v.name === koVoice.name ? 'checked' : ''}>
          <span><b>${esc(v.name)}</b>${k === 0 ? ' <em class="rec">추천</em>' : ''}<br><small>${v.localService ? '기기 안 목소리' : '인터넷 목소리'}</small></span></label>
          <button class="btn small" data-test="${k}">▶ 들어 보기</button></li>`).join('')}</ul>`
        : `<p class="notice">${hasTTS ? '한국어 목소리를 찾는 중이에요. 없으면 아래 방법으로 설치해 주세요.' : '이 브라우저는 읽어 주기를 지원하지 않아요.'}</p>`}
      <p class="tipbox">💡 ${tips}</p>
    </section>
    <p class="small-note">가장 자연스러운 목소리는 부모님 컴퓨터에서 녹음 파일을 한 번 만들어 두는 방법이에요. 방법은 README의 "자연스러운 목소리" 부분에 있어요.</p>`;
  wireFamily();
  wireKeptParent();
  $('#toCharSet').onclick = () => { sfx('pop'); go('char'); };
  $('#useClips')?.addEventListener('change', (e) => { S.useClips = e.target.checked; save(); speak(LINES.voiceTest); });
  $$('[data-rate]', app).forEach((b) => b.addEventListener('click', () => {
    S.rate = b.dataset.rate; save();
    $$('[data-rate]', app).forEach((x) => x.setAttribute('aria-checked', x === b));
    speak(LINES.voiceTest);
  }));
  $$('input[name="voice"]', app).forEach((r) => r.addEventListener('change', () => {
    S.voiceName = r.value; save();
    koVoice = koVoices.find((v) => v.name === r.value) || koVoice;
    hush(); ttsSpeak(LINES.voiceTest);
  }));
  $$('[data-test]', app).forEach((b) => b.addEventListener('click', () => { hush(); ttsSpeak(LINES.voiceTest, false, koVoices[+b.dataset.test]); }));
};
$('#voiceBtn').addEventListener('click', () => { sfx('pop'); go('voice'); });

/* ---------- 👨‍👩‍👧 아이 프로필 · 가족 계정 ---------- */
function paintWho() {
  const me = STORE.current();
  $('#whoAvatar').textContent = me.avatar;
  $('#whoName').textContent = me.name;
}
function switchTo(id) {
  parentOpen = false;
  STORE.use(id);
  loadState();
  pickVoice();
  paintStars();
  paintWho();
}
/* 누가 공부할까? (첫 화면과 👤 버튼) */
function whoButtons() {
  return STORE.profiles().map((p) => {
    const st = STORE.load(p.id);
    return `<button class="who-btn" data-id="${p.id}"><span class="who-av">${p.avatar}</span><b>${esc(p.name)}</b>
      <small>⭐ ${st.earned ?? st.stars ?? 0} · 🐣 Lv${charNowFor(st).stage + 1}</small></button>`;
  }).join('') + '<button class="who-btn add" data-add="1"><span class="who-av">＋</span><b>새 친구</b><small>&nbsp;</small></button>';
}
function wireWho(box, after) {
  $$('.who-btn[data-id]', box).forEach((b) => b.addEventListener('click', () => { sfx('star'); switchTo(b.dataset.id); after(); }));
  $('.who-btn[data-add]', box).addEventListener('click', () => { sfx('pop'); addKidForm(box, after); });
}
function addKidForm(box, after) {
  let avatar = STORE.AVATARS.find((a) => !STORE.profiles().some((p) => p.avatar === a)) || STORE.AVATARS[0];
  box.innerHTML = `
    <form class="kid-form" id="kidForm">
      <label for="kidName">이름</label>
      <input id="kidName" class="typed" maxlength="8" autocomplete="off" placeholder="이름을 써요" required>
      <div class="av-pick" role="radiogroup" aria-label="얼굴 고르기">${STORE.AVATARS.map((a) =>
        `<button type="button" role="radio" aria-checked="${a === avatar}" data-av="${a}">${a}</button>`).join('')}</div>
      <div class="row"><button class="btn primary" type="submit">만들기</button><button class="btn" type="button" id="kidCancel">취소</button></div>
    </form>`;
  $$('[data-av]', box).forEach((b) => b.addEventListener('click', () => {
    avatar = b.dataset.av;
    $$('[data-av]', box).forEach((x) => x.setAttribute('aria-checked', x === b));
  }));
  $('#kidCancel').onclick = () => after(true);
  $('#kidForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#kidName').value.trim();
    if (!name) return;
    switchTo(STORE.add(name, avatar));
    after();
  });
  $('#kidName').focus();
}
SCREENS.who = () => {
  app.innerHTML = `<h2 class="h">👤 누가 공부할까?</h2><div class="who-list" id="whoScreen">${whoButtons()}</div>`;
  const box = $('#whoScreen');
  const after = (cancel) => { if (cancel) { box.innerHTML = whoButtons(); wireWho(box, after); } else go('home'); };
  wireWho(box, after);
};
$('#whoBtn').addEventListener('click', () => { sfx('pop'); go('who'); });

const CLOUD_TEXT = {
  off: '', loading: '연결하는 중…', ready: '로그인하면 여러 기기에서 이어서 공부해요.',
  syncing: '☁️ 저장하는 중…', dirty: '☁️ 곧 저장해요', synced: '☁️ 모두 저장됐어요', error: '⚠️ 클라우드에 연결하지 못했어요. 이 기기에는 저장돼요.',
};
/* 설정 화면: 가족 계정 + 아이별 기록 */
function familyBox() {
  const c = STORE.cloud;
  const account = !c.enabled
    ? '<p class="small-note">가족 계정을 쓰려면 js/firebase-config.js 설정이 필요해요 (README "가족 계정 만들기"). 지금은 이 기기에만 저장돼요.</p>'
    : c.user
      ? `<div class="acct"><span>👤 <b>${esc(c.user.email || c.user.displayName || '로그인됨')}</b></span><button class="btn small" id="signOut">로그아웃</button></div>
         <p class="small-note" id="cloudStatus">${CLOUD_TEXT[c.status] || ''}</p>`
      : `<button class="btn primary" id="signIn" ${c.ready ? '' : 'disabled'}>Google로 로그인</button>
         <p class="small-note" id="cloudStatus">${CLOUD_TEXT[c.status] || ''}</p>
         ${authError ? `<p class="auth-error" role="alert">⚠️ ${authError}</p>` : ''}`;
  const me = STORE.current().id;
  const kids = STORE.profiles().map((p) => {
    const st = STORE.load(p.id);
    const bests = Object.values(st.best || {});
    const avg = bests.length ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length) : null;
    return `<li class="kid-row" data-id="${p.id}">
      <span class="who-av small">${p.avatar}</span>
      <div class="kid-info"><span><b>${esc(p.name)}</b>${p.id === me ? ' <em class="rec">지금</em>' : ''}</span>
        <small>⭐ 모은 별 ${st.earned ?? st.stars ?? 0} · 🐣 캐릭터 Lv${charNowFor(st).stage + 1} · 지킨 날 ${charNowFor(st).pts}일 · 평균 최고 점수 ${avg == null ? '—' : avg + '점'}</small></div>
      <div class="kid-act"><button class="btn small" data-rename="${p.id}">이름</button>${STORE.profiles().length > 1 ? `<button class="btn small" data-del="${p.id}">지우기</button>` : ''}</div>
    </li>`;
  }).join('');
  return `<section class="setbox family">
    <h3 class="h3">👨‍👩‍👧 가족 계정</h3>
    ${account}
    <ul class="kids">${kids}</ul>
  </section>`;
}
function wireFamily() {
  $('#signIn')?.addEventListener('click', doSignIn);
  $('#signOut')?.addEventListener('click', () => STORE.signOut());
  $$('[data-rename]', app).forEach((b) => b.addEventListener('click', () => {
    const row = b.closest('.kid-row');
    const p = STORE.profiles().find((x) => x.id === b.dataset.rename);
    $('.kid-info', row).innerHTML = `<form class="rename"><label class="sr" for="rn-${p.id}">새 이름</label>
      <input id="rn-${p.id}" class="typed small" maxlength="8" value="${esc(p.name)}"><button class="btn small primary">저장</button></form>`;
    $('.kid-act', row).hidden = true;
    const f = $('form', row);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('input', f).value.trim();
      if (name) STORE.update(p.id, { name });
      paintWho();
      SCREENS.voice();
    });
    $('input', f).focus();
  }));
  $$('[data-del]', app).forEach((b) => b.addEventListener('click', () => {
    const act = b.parentElement;
    const id = b.dataset.del;
    act.innerHTML = '<span class="small-note">기록이 모두 지워져요.</span><button class="btn small primary" data-yes="1">지우기</button><button class="btn small" data-no="1">취소</button>';
    $('[data-yes]', act).onclick = async () => { await STORE.remove(id); switchTo(STORE.current().id); SCREENS.voice(); };
    $('[data-no]', act).onclick = () => SCREENS.voice();
  }));
}
/* 로그인 오류를 부모님이 알아볼 수 있게 (Firebase 오류 코드 → 할 일) */
const AUTH_HELP = {
  'auth/unauthorized-domain': 'Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 nkdddd.github.io를 추가해 주세요.',
  'auth/operation-not-allowed': 'Firebase 콘솔 → Authentication → 로그인 방법에서 Google을 "사용 설정"하고 저장해 주세요.',
  'auth/configuration-not-found': 'Firebase 콘솔 → Authentication에서 "시작하기"를 누르고 Google 로그인을 켜 주세요.',
  'auth/popup-closed-by-user': '로그인 창이 닫혔어요. 다시 눌러서 계정을 골라 주세요.',
  'auth/cancelled-popup-request': '로그인 창이 닫혔어요. 다시 눌러 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요. 광고 차단 프로그램이 막을 수도 있어요.',
  'auth/invalid-api-key': 'js/firebase-config.js의 apiKey가 맞는지 확인해 주세요.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'js/firebase-config.js의 apiKey가 맞는지 확인해 주세요.',
  'auth/internal-error': 'Firebase가 잠시 응답하지 않았어요. 조금 뒤 다시 해 주세요.',
};
let authError = '';
async function doSignIn() {
  authError = '';
  try {
    await STORE.signIn();
  } catch (e) {
    const code = e.code || '';
    authError = `로그인하지 못했어요 (${esc(code || e.message || '알 수 없는 오류')}). ${AUTH_HELP[code] || ''}`;
    console.error(e);
  }
  paintSplashAcct();
  if (app.className === 'screen-voice') SCREENS.voice();
}

/* 첫 화면의 부모님 로그인 */
function paintSplashAcct() {
  const box = $('#splashAcct');
  const c = STORE.cloud;
  if (!box || !c.enabled) return;
  if (c.user) {
    box.innerHTML = `<span class="small-note">☁️ ${esc(c.user.email || '가족 계정')} · ${CLOUD_TEXT[c.status] || ''}</span>`;
  } else {
    box.innerHTML = `<button class="btn small" id="splashSignIn" ${c.ready ? '' : 'disabled'}>👨‍👩‍👧 부모님 로그인</button>
      <span class="small-note">${c.status === 'error' ? CLOUD_TEXT.error : '로그인하면 여러 기기에서 이어서 공부해요'}</span>
      ${authError ? `<p class="auth-error" role="alert">⚠️ ${authError}</p>` : ''}`;
    $('#splashSignIn').onclick = doSignIn;
  }
}

/* 다른 기기에서 바뀐 기록이 오면 다시 그려요 */
STORE.on((what) => {
  paintSplashAcct();
  if (what === 'status') { const el = $('#cloudStatus'); if (el) el.textContent = CLOUD_TEXT[STORE.cloud.status] || ''; return; }
  if (what === 'current') { loadState(); pickVoice(); paintStars(); }
  paintWho();
  const list = $('#whoList');
  if (list && !$('#splash').hidden && !$('#kidForm')) { list.innerHTML = whoButtons(); wireWho(list, startAfterWho); }
  if (app.className === 'screen-voice' && !$('form', app)) SCREENS.voice();
  if (what === 'current' && app.className === 'screen-home') go('home');
});

/* ---------- 시작 ---------- */
function startAfterWho(cancel) {
  const list = $('#whoList');
  if (cancel) { list.innerHTML = whoButtons(); wireWho(list, startAfterWho); return; }
  $('#splash').hidden = true;
  go('home');
}
paintStars();
paintWho();
go('home');
$('#whoList').innerHTML = whoButtons();
wireWho($('#whoList'), startAfterWho);
paintSplashAcct();
STORE.init();
/* 테스트용: 주소에 ?gqtest 를 붙이면 화면을 바로 열 수 있어요 */
if (location.search.includes('gqtest')) window.__gq = { go, save, addStar, charGrow, get S() { return S; } };
})();
