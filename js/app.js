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

/* ---------- 저장 ---------- */
const KEY = 'ttobak-v1';
let S = { stars: 0, best: {} };
try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* 저장소를 못 쓰면 이번만 기억 */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ } };
const stickerCount = () => Math.min(STICKERS.length, Math.floor(S.stars / 10));

/* ---------- 소리 ---------- */
let koVoice = null;
const hasTTS = 'speechSynthesis' in window;
function pickVoice() {
  if (!hasTTS) return;
  const vs = speechSynthesis.getVoices();
  koVoice = vs.find((v) => /^ko/i.test(v.lang) && /google|yuna|heami|sunhi|injoon/i.test(v.name))
    || vs.find((v) => /^ko/i.test(v.lang)) || null;
}
if (hasTTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, slow) {
  if (!hasTTS || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\p{Extended_Pictographic}|️|[[\]]/gu, ''));
  u.lang = 'ko-KR';
  if (koVoice) u.voice = koVoice;
  u.rate = slow ? 0.6 : 0.9;
  u.pitch = 1.1;
  speechSynthesis.speak(u);
}

let actx = null;
function sfx(kind) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { ok: [660, 880, 1320], no: [300, 220], pop: [520], star: [880, 1175, 1568, 2093] }[kind];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
      o.type = kind === 'no' ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + 0.25);
    });
  } catch (e) { /* 소리 없이 진행 */ }
}

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
function paintStars() { $('#starCount').textContent = S.stars; }
function addStar() {
  const before = stickerCount();
  S.stars++;
  save();
  paintStars();
  const pill = $('#starPill');
  pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
  if (stickerCount() > before) {
    const st = STICKERS[stickerCount() - 1];
    setTimeout(() => {
      sfx('star');
      toast(`<div class="newsticker"><span>${st}</span>새 스티커를 받았어요!</div>`, 2600);
      speak('와! 새 스티커를 받았어요!');
    }, 700);
  }
}
function setBest(key, score) {
  S.best[key] = Math.max(S.best[key] || 0, score);
  save();
}

/* 전역 클릭: 🔊 버튼 */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (b) { speak(b.dataset.say, b.dataset.slow === '1'); }
});

/* ---------- 화면 이동 ---------- */
const ISLANDS = [
  { id: 'dict',  icon: '🎧', name: '받아쓰기 섬', sub: '듣고 쓰기',          tone: 't1' },
  { id: 'josa',  icon: '🧩', name: '조사 마을',   sub: '이·가, 을·를',       tone: 't2' },
  { id: 'vowel', icon: '🦀', name: 'ㅐㅔ 바닷가', sub: '개 🐶 게 🦀',         tone: 't3' },
  { id: 'space', icon: '✂️', name: '띄어쓰기 숲', sub: '어디서 띄울까?',     tone: 't4' },
  { id: 'sound', icon: '🔍', name: '소리 탐정',   sub: '소리랑 글자가 달라!', tone: 't5' },
  { id: 'book',  icon: '🏆', name: '스티커북',    sub: '모은 스티커',        tone: 't6' },
];
const SCREENS = {};
function go(name, ...args) {
  if (hasTTS) speechSynthesis.cancel();
  $('#homeBtn').hidden = name === 'home';
  app.innerHTML = '';
  app.className = 'screen-' + name;
  window.scrollTo(0, 0);
  SCREENS[name](...args);
  const h = app.querySelector('h1, h2');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}
$('#homeBtn').addEventListener('click', () => { sfx('pop'); go('home'); });

/* ---------- 🗺️ 지도 ---------- */
SCREENS.home = () => {
  app.innerHTML = `
    <h1 class="title">또박또박 <span>받아쓰기</span></h1>
    ${bubble('안녕! 나는 또박이야. 어느 섬에 놀러 갈까?')}
    <div class="map">
      ${ISLANDS.map((s) => `
        <button class="island ${s.tone}" data-go="${s.id}">
          <span class="i-icon" aria-hidden="true">${s.icon}</span>
          <span class="i-name">${s.name}</span>
          <span class="i-sub">${s.sub}</span>
          ${S.best[s.id] ? `<span class="i-best">최고 ${S.best[s.id]}점</span>` : ''}
        </button>`).join('')}
    </div>`;
  $$('.island', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); go(b.dataset.go); }));
  speak('안녕! 나는 또박이야. 어느 섬에 놀러 갈까?');
};

/* ---------- 결과 ---------- */
function finish(key, score, total, again) {
  const pct = Math.round((score / total) * 100);
  setBest(key, pct);
  const great = pct >= 70;
  app.innerHTML = `
    <div class="finish">
      <div class="stamp ${great ? '' : 'soft'}">${great ? '참<br>잘했어요' : '잘<br>했어요'}</div>
      <h2>${total}문제 중에 <b>${score}</b>개 맞혔어요!</h2>
      <p class="finish-stars" aria-label="별 ${score}개">${'⭐'.repeat(score) || '🌱'}</p>
      ${bubble(great ? '우아, 정말 멋져! 별을 모아서 스티커를 받자!' : '괜찮아, 틀린 건 배우는 거야. 한 번 더 해 볼까?')}
      <div class="row">
        <button class="btn primary" id="again">🔁 한 번 더</button>
        <button class="btn" id="toMap">🗺️ 지도로</button>
      </div>
    </div>`;
  if (great) { confetti(); sfx('star'); }
  speak(`${total}문제 중에 ${score}개 맞혔어요! ` + (great ? '참 잘했어요!' : '한 번 더 해 볼까?'));
  $('#again').onclick = again;
  $('#toMap').onclick = () => go('home');
}

/* 문제 풀이 틀: items를 하나씩 render로 넘기고 끝나면 결과 화면 */
function runQuiz(key, items, render) {
  let i = 0, score = 0;
  const next = () => {
    if (i >= items.length) return finish(key, score, items.length, () => go(key, true));
    app.innerHTML = '';
    render(items[i], i, items.length, (ok) => { if (ok) { score++; addStar(); } }, () => { i++; next(); });
  };
  next();
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

/* ---------- 🧩 조사 마을 ---------- */
SCREENS.josa = (skipIntro) => {
  if (!skipIntro) return josaIntro();
  const items = shuffle(NOUNS).slice(0, 10).map((n, k) => {
    const j = JOSA[k % JOSA.length];
    const other = pick(NOUNS.filter((m) => m !== n));
    return { noun: n[0], e: n[1], j, other };
  });
  runQuiz('josa', shuffle(items), (q, i, n, mark, next) => {
    const ans = hasBatchim(q.noun) ? q.j[0] : q.j[1];
    const rest = q.j[2] ?? ' ' + q.other[0];
    const pic = q.j[2] ? q.e : q.e + ' ' + q.other[1];
    app.innerHTML = `
      ${dots(i, n)}
      ${bubble('빈칸에 어떤 말이 들어갈까?')}
      <div class="qcard"><div class="pic" aria-hidden="true">${pic}</div>
        <p class="sentence"><b>${q.noun}</b><span class="blank">?</span>${esc(rest)}</p></div>
      <div class="choices">${shuffle([q.j[0], q.j[1]]).map((v) => `<button class="choice" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="explain" hidden></div>`;
    wireChoices(app, ans, (ok) => {
      mark(ok);
      $('.blank', app).textContent = ans;
      $('.blank', app).classList.add('filled');
      if (ok) maru($('.qcard', app));
      const p = split(lastChar(q.noun));
      const bat = p.jong > 0;
      const ex = $('.explain', app);
      ex.innerHTML = `
        <div class="jamo-box" aria-label="${lastChar(q.noun)} 글자 조각">
          <span class="big-syl">${lastChar(q.noun)}</span><span class="eq">=</span>
          <span class="jm">${CHO[p.cho]}</span><span class="jm">${JUNG[p.jung]}</span>
          <span class="jm ${bat ? 'bat' : 'nobat'}">${bat ? JONG[p.jong] : '없음'}</span>
        </div>
        <p>${bat
          ? `'${lastChar(q.noun)}'에 받침 <b class="hl">${JONG[p.jong]}</b>이 있어요. 그래서 <b class="hl">${ans}</b>!`
          : `'${lastChar(q.noun)}'에는 받침이 없어요. 그래서 <b class="hl">${ans}</b>!`}</p>
        <button class="btn primary next">다음 ➜</button>`;
      ex.hidden = false;
      speak(`${ok ? '딩동댕! ' : '아쉬워! '}${q.noun}${ans}${rest}`);
      $('.next', ex).onclick = next;
    });
    speak('빈칸에 어떤 말이 들어갈까?');
  });
};
function josaIntro() {
  app.innerHTML = `
    <h2 class="h">🧩 조사 마을</h2>
    ${bubble('곰가? 곰이? 어느 게 말하기 편해? 소리 내서 말해 봐!')}
    <div class="compare">
      <button class="cmp good" data-say="곰이 있어요">🐻 곰<b>이</b> 있어요 <small>[고미] 부드러워요 😊</small></button>
      <button class="cmp bad" data-say="곰가 있어요">🐻 곰<b>가</b> 있어요 <small>어색해요 🤔</small></button>
      <button class="cmp good" data-say="토끼가 있어요">🐰 토끼<b>가</b> 있어요 <small>부드러워요 😊</small></button>
      <button class="cmp bad" data-say="토끼이 있어요">🐰 토끼<b>이</b> 있어요 <small>어색해요 🤔</small></button>
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
  speak('곰가? 곰이? 어느 게 말하기 편해? 받침이 있으면 이, 을, 은, 과. 받침이 없으면 가, 를, 는, 와를 써요.');
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
SCREENS.vowel = (skipIntro) => {
  if (!skipIntro) return vowelIntro();
  const items = shuffle(VOWELS).slice(0, 10);
  runQuiz('vowel', items, (q, i, n, mark, next) => {
    const ans = q.w[q.i];
    const wrong = swapVowel(ans);
    const shown = q.w.slice(0, q.i) + '?' + q.w.slice(q.i + 1);
    app.innerHTML = `
      ${dots(i, n)}
      ${bubble('그림을 보고 알맞은 글자를 골라 봐!')}
      <div class="qcard"><div class="pic" aria-hidden="true">${q.e}</div>
        <div class="wordcells">${cells(shown, { [q.i]: 'q' })}</div>
        <button class="btn small" data-say="${esc(q.w)}">🔊 들어 보기</button></div>
      <div class="choices">${shuffle([ans, wrong]).map((v) => `<button class="choice" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="explain" hidden></div>`;
    wireChoices(app, ans, (ok) => {
      mark(ok);
      $('.wordcells', app).innerHTML = cells(q.w, { [q.i]: 'good' });
      if (ok) maru($('.qcard', app));
      const v = split(ans).jung;
      const kind = v === 1 || v === 3 ? 'ae' : v === 5 ? 'e' : 'ye';
      const line = {
        ae: `<b class="hl">${JUNG[v]}</b> — 짧은 팔이 <b>안</b>에 있어요. 개 🐶는 집 <b>안</b>에!`,
        e: `<b class="hl">ㅔ</b> — 짧은 팔이 <b>밖</b>에 있어요. 게 🦀는 집게를 <b>밖</b>으로!`,
        ye: `<b class="hl">ㅖ</b> — [ㅔ]처럼 들려도 팔이 두 개인 ㅖ예요!`,
      }[kind];
      const ex = $('.explain', app);
      ex.innerHTML = `<div class="vrow">${vowelSvg(kind)}<p>${line}</p></div><button class="btn primary next">다음 ➜</button>`;
      ex.hidden = false;
      speak(`${ok ? '딩동댕! ' : '아쉬워! '}${q.w}`);
      $('.next', ex).onclick = next;
    });
    speak('그림을 보고 알맞은 글자를 골라 봐! ' + q.w);
  });
};
function vowelIntro() {
  app.innerHTML = `
    <h2 class="h">🦀 ㅐㅔ 바닷가</h2>
    ${bubble('개랑 게, 들어 봐! 소리가 거의 똑같지? 그래서 귀 말고 눈으로 기억해야 해.')}
    <div class="pair">
      <button class="vcard" data-say="개. 멍멍 짖는 개">
        <span class="vpic">🐶</span><span class="vword">개</span>${vowelSvg('ae')}
        <span class="vtip">짧은 팔이 <b>안</b>에!<br>개는 집 <b>안</b>에 🏠</span></button>
      <button class="vcard" data-say="게. 집게가 있는 게">
        <span class="vpic">🦀</span><span class="vword">게</span>${vowelSvg('e')}
        <span class="vtip">짧은 팔이 <b>밖</b>에!<br>게는 집게를 <b>밖</b>으로 🦀</span></button>
    </div>
    <div class="rulecard">
      <div class="vrow">${vowelSvg('ye')}<p><b class="hl">ㅖ</b>는 팔이 두 개! 시계 ⏰, 계단 🪜은 [시게], [게단]처럼 들려도 <b>ㅖ</b>로 써요.</p></div>
    </div>
    <button class="btn primary big" id="start">놀이 시작! ▶</button>`;
  speak('개랑 게, 소리가 거의 똑같지? ㅐ는 짧은 팔이 안에, ㅔ는 짧은 팔이 밖에 있어요.');
  $('#start').onclick = () => go('vowel', true);
}

/* ---------- ✂️ 띄어쓰기 숲 ---------- */
SCREENS.space = (skipIntro) => {
  if (!skipIntro) return spaceIntro();
  runQuiz('space', shuffle(SPACING).slice(0, 8), (q, i, n, mark, next) => {
    const syl = [...q.t.replace(/ /g, '')];
    const want = [];
    { let k = 0; for (const ch of q.t) { if (ch === ' ') want[k - 1] = true; else k++; } }
    const gaps = Array(syl.length - 1).fill(false);
    let tries = 0;
    app.innerHTML = `
      ${dots(i, n)}
      ${bubble('글자 사이를 눌러서 띄어 써 봐!')}
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
        speak('딩동댕! ' + q.t);
        ex.hidden = false;
        $('.next', ex).onclick = next;
      } else {
        draw(marks);
        ex.innerHTML = `
          <p><span class="lg miss"></span> 빨간 곳은 띄어야 해요. <span class="lg extra"></span> 노란 곳은 붙여야 해요.</p>
          <p class="small-note">${TYPES.space.why}</p>
          <div class="row"><button class="btn primary" id="retry">✏️ 고쳐 볼래요</button><button class="btn" id="show">정답 보고 다음 ➜</button></div>`;
        ex.hidden = false;
        speak('아쉬워! 빨간 곳은 띄고, 노란 곳은 붙여 봐.');
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
    speak('글자 사이를 눌러서 띄어 써 봐! ' + q.t);
  });
};
function spaceIntro() {
  app.innerHTML = `
    <h2 class="h">✂️ 띄어쓰기 숲</h2>
    ${bubble('띄어쓰기를 잘못하면 아버지가 가방에 들어가신대! 눌러서 확인해 봐.')}
    <div class="funny">${FUNNY.map((f, k) => `
      <div class="fcard" data-k="${k}">
        <div class="raw">${cells(f.raw)}</div>
        <div class="row">
          <button class="btn fbtn" data-side="a">${esc(f.a[0])}</button>
          <button class="btn fbtn" data-side="b">${esc(f.b[0])}</button>
        </div>
        <div class="scene" aria-live="polite"><span class="scene-pic">❓</span><span class="scene-txt">어떤 뜻일까?</span></div>
      </div>`).join('')}</div>
    <div class="rulecard"><p>${TYPES.space.why}</p></div>
    <button class="btn primary big" id="start">놀이 시작! ▶</button>`;
  $$('.fbtn', app).forEach((b) => b.addEventListener('click', () => {
    const card = b.closest('.fcard');
    const f = FUNNY[+card.dataset.k][b.dataset.side];
    $$('.fbtn', card).forEach((x) => x.classList.toggle('sel', x === b));
    $('.raw', card).innerHTML = cells(f[0]);
    $('.scene-pic', card).textContent = f[1];
    $('.scene-txt', card).textContent = f[2];
    speak(f[0] + '. ' + f[2]);
  }));
  speak('띄어쓰기를 잘못하면 아버지가 가방에 들어가신대! 버튼을 눌러서 확인해 봐.');
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
  runQuiz('sound', shuffle(SOUNDS).slice(0, 10), (q, i, n, mark, next) => {
    const opts = shuffle([q.w, q.s, ...(q.x ? [q.x] : [])]);
    const tp = TYPES[q.k];
    app.innerHTML = `
      ${dots(i, n)}
      ${bubble('이렇게 소리 나는 낱말, 글자로는 어떻게 쓸까?')}
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
      speak(`${ok ? '딩동댕! ' : '아쉬워! '}소리는 ${q.s}, 글자는 ${q.w}. ${q.tip}`);
      $('.next', ex).onclick = next;
    });
    speak('이렇게 소리 나는 낱말, 글자로는 어떻게 쓸까? ' + q.w);
  });
};
function soundIntro() {
  app.innerHTML = `
    <h2 class="h">🔍 소리 탐정</h2>
    ${bubble('말할 때 소리랑 글자가 다를 때가 있어. 왜 소리 나는 대로 안 쓸까?')}
    <div class="rulecard why">
      <div id="fam">${WHY_FAMILY.map((f) => `<div class="fam-row">${cells(f.w, { 0: 'root' })}</div>`).join('')}</div>
      <button class="btn primary" id="flip">🔊 소리 나는 대로 써 보면?</button>
      <p class="why-say" id="whySay">세 낱말 모두 '먹'이 들어 있어서 '먹다'라는 뜻인 걸 금방 알 수 있어요.</p>
    </div>
    <h3 class="h3">소리를 바꾸는 친구들</h3>
    <div class="types">${['yeon', 'tense', 'nasal', 'palatal', 'h', 'rep', 'liquid'].map((k) => {
      const ex = SOUNDS.find((s) => s.k === k);
      return `<button class="tcard" data-say="${esc(TYPES[k].name + '. ' + TYPES[k].why)}">
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
    speak(flipped ? '머거요, 먹꼬, 멍는다. 어? 먹이 사라졌어요! 그래서 글자는 뜻을 지키고, 입은 편하게 말해요.' : '먹어요, 먹고, 먹는다');
  };
  speak('말할 때 소리랑 글자가 다를 때가 있어. 왜 소리 나는 대로 안 쓸까? 버튼을 눌러 봐.');
  $('#start').onclick = () => go('sound', true);
}

/* ---------- 🎧 받아쓰기 섬 ---------- */
SCREENS.dict = () => {
  app.innerHTML = `
    <h2 class="h">🎧 받아쓰기 섬</h2>
    ${bubble('몇 단계에 도전할까? 잘 듣고 공책에 또박또박 써 보자!')}
    <div class="levels">${DICTATION.map((lv) => `
      <button class="level" data-id="${lv.id}"><span class="l-icon">${lv.icon}</span>
        <span class="l-name">${lv.name}</span><span class="l-sub">${lv.desc} · ${lv.items.length}문제</span>
        ${S.best[lv.id] ? `<span class="i-best">최고 ${S.best[lv.id]}점</span>` : ''}</button>`).join('')}</div>
    ${hasTTS ? '' : '<p class="notice">이 기기에서는 소리가 나오지 않아요. 문제 화면의 👀 어른용 버튼을 눌러 어른이 읽어 주세요.</p>'}`;
  $$('.level', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); dictLevel(b.dataset.id); }));
  speak('몇 단계에 도전할까?');
};

let inputMode = 'tiles';
function dictLevel(id) {
  const lv = DICTATION.find((l) => l.id === id);
  runQuiz(id, shuffle(lv.items), (q, i, n, mark, next) => dictQuestion(q, i, n, mark, next));
  /* runQuiz의 '한 번 더'가 go(key)로 가므로 단계 화면을 등록 */
  SCREENS[id] = () => dictLevel(id);
}

const clean = (s) => s.replace(/[.,!?~]/g, '').replace(/\s+/g, ' ').trim();
function lcsMarks(a, b) {
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let x = n - 1; x >= 0; x--) for (let y = m - 1; y >= 0; y--)
    d[x][y] = a[x] === b[y] ? d[x + 1][y + 1] + 1 : Math.max(d[x + 1][y], d[x][y + 1]);
  const ka = new Array(n).fill(false), kb = new Array(m).fill(false);
  let x = 0, y = 0;
  while (x < n && y < m) {
    if (a[x] === b[y]) { ka[x] = kb[y] = true; x++; y++; } else if (d[x + 1][y] >= d[x][y + 1]) x++; else y++;
  }
  return [ka, kb];
}
/* 글자 칸 표시: 공백을 뺀 순서(keep)를 원래 문자열 칸으로 옮김 */
function marksFor(str, keep, cls) {
  const out = {};
  let k = 0;
  [...str].forEach((ch, idx) => {
    if (ch === ' ' || /[.,!?~]/.test(ch)) return;
    if (!keep[k]) out[idx] = cls;
    k++;
  });
  return out;
}
function spaceSet(s) {
  const set = new Set();
  let k = 0;
  for (const ch of s) { if (ch === ' ') set.add(k); else k++; }
  return set;
}
function diagnose(user, answer, hints) {
  const u = clean(user), a = clean(answer);
  const un = u.replace(/ /g, ''), an = a.replace(/ /g, '');
  const reasons = [];
  if (un === an) {
    reasons.push({ k: 'space', text: '글자는 모두 맞았어요! 띄어쓰기만 다시 볼까요?' });
    return reasons;
  }
  hints.forEach(([w, s, k]) => {
    const sw = s.replace(/ /g, '');
    if (sw !== w.replace(/ /g, '') && un.includes(sw))
      reasons.push({ k, text: `<b>${esc(w)}</b>를 소리 나는 대로 <b>[${esc(s)}]</b>라고 썼어요.` });
  });
  a.split(' ').forEach((word) => {
    [...word].forEach((ch, idx) => {
      const sw = swapVowel(ch);
      if (sw) {
        const bad = word.slice(0, idx) + sw + word.slice(idx + 1);
        if (un.includes(bad)) reasons.push({ k: /[ㅖ]/.test(JUNG[split(ch).jung]) ? 'ye' : 'ae', text: `<s>${esc(bad)}</s> 가 아니라 <b>${esc(word)}</b>예요.` });
      }
    });
  });
  const us = spaceSet(u), as = spaceSet(a);
  if (reasons.length === 0 && ([...as].some((x) => !us.has(x)) || [...us].some((x) => !as.has(x))) && Math.abs(un.length - an.length) <= 1)
    reasons.push({ k: 'space', text: '띄어쓰기도 한 번 더 살펴봐요.' });
  return reasons;
}

function dictQuestion(q, i, n, mark, next) {
  const target = clean(q.t);
  let typed = '';
  let stack = [];
  let tries = 0;
  const pieces = (() => {
    const base = [...target.replace(/ /g, '')];
    const extra = new Set();
    q.hints.forEach(([w, s]) => [...s.replace(/ /g, '')].forEach((ch, k) => { if (ch !== w.replace(/ /g, '')[k]) extra.add(ch); }));
    base.forEach((ch) => { const sw = swapVowel(ch); if (sw) extra.add(sw); });
    base.forEach((ch) => extra.delete(ch));
    return shuffle([...base, ...shuffle([...extra]).slice(0, 4)]).map((ch) => ({ ch, used: false }));
  })();

  app.innerHTML = `
    ${dots(i, n)}
    ${bubble('잘 듣고 공책에 써 봐! 몇 번이든 다시 들을 수 있어.')}
    <div class="listen">
      <button class="btn listen-big" data-say="${esc(q.t)}">🔊 듣기</button>
      <button class="btn" data-say="${esc(q.t)}" data-slow="1">🐢 천천히</button>
      <button class="btn ghost" id="peek">👀 어른용</button>
    </div>
    <div class="paper" id="paper"><div id="ans"></div></div>
    <div class="modes" role="tablist">
      <button class="mode" role="tab" data-m="tiles">🧩 글자 조각</button>
      <button class="mode" role="tab" data-m="keys">⌨️ 키보드</button>
    </div>
    <div id="pad"></div>
    <div class="row"><button class="btn primary big" id="check">다 썼어요! ✔</button></div>
    <div class="explain" id="result" hidden></div>`;

  const paintAns = () => {
    $('#ans').innerHTML = cells(typed + '​') ;
    const last = $('#ans .cell:last-child');
    if (last) { last.textContent = ''; last.classList.add('cursor'); }
  };
  const paintPad = () => {
    $$('.mode', app).forEach((b) => b.setAttribute('aria-selected', b.dataset.m === inputMode));
    const pad = $('#pad');
    if (inputMode === 'keys') {
      pad.innerHTML = `<label class="sr" for="typed">여기에 써요</label>
        <input id="typed" class="typed" autocomplete="off" autocapitalize="off" spellcheck="false" lang="ko" placeholder="여기를 누르고 써요" value="${esc(typed)}">`;
      const inp = $('#typed');
      inp.addEventListener('input', () => { typed = inp.value; paintAns(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('#check').click(); });
      inp.focus();
    } else {
      pad.innerHTML = `<div class="tiles">${pieces.map((p, k) => `<button class="tile" data-k="${k}" ${p.used ? 'disabled' : ''}>${p.ch}</button>`).join('')}</div>
        <div class="row"><button class="btn" id="spc">␣ 띄우기</button><button class="btn" id="bk">⌫ 지우기</button></div>`;
      $$('.tile', pad).forEach((t) => t.addEventListener('click', () => {
        const p = pieces[+t.dataset.k];
        p.used = true; stack.push(+t.dataset.k); typed += p.ch; sfx('pop'); paintAns(); paintPad();
      }));
      $('#spc').onclick = () => { if (typed && !typed.endsWith(' ')) { typed += ' '; stack.push(-1); paintAns(); } };
      $('#bk').onclick = () => {
        const k = stack.pop();
        if (k === undefined) return;
        if (k >= 0) pieces[k].used = false;
        typed = typed.slice(0, -1);
        paintAns(); paintPad();
      };
    }
  };
  $$('.mode', app).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.m === inputMode) return;
    inputMode = b.dataset.m;
    /* 방식을 바꾸면 새로 써요 */
    typed = ''; stack = []; pieces.forEach((p) => { p.used = false; });
    paintAns(); paintPad();
  }));
  $('#peek').onclick = () => toast(`<div class="peek"><small>어른이 읽어 주세요</small><b>${esc(q.t)}</b></div>`, 3500);
  paintAns(); paintPad();

  $('#check').onclick = () => {
    if (!clean(typed)) { toast('먼저 공책에 써 보세요! ✏️'); speak('먼저 공책에 써 보세요!'); return; }
    tries++;
    const u = clean(typed);
    const ok = u === target;
    if (tries === 1) mark(ok);
    sfx(ok ? 'ok' : 'no');
    const [ku, ka] = lcsMarks([...u.replace(/ /g, '')], [...target.replace(/ /g, '')]);
    const res = $('#result');
    const secrets = q.hints.map(([w, s, k]) => `<li><span class="t-icon">${TYPES[k].icon}</span><b>${esc(w)}</b>${s !== w ? ` → 소리 [${esc(s)}]` : ''} <em>${TYPES[k].name}</em></li>`).join('');
    if (ok) {
      $('#paper').innerHTML = cells(q.t);
      maru($('#paper'));
      confetti();
      res.innerHTML = `<p class="yay">딩동댕! 또박또박 잘 썼어요! ⭐</p>
        <p class="small-note">이 문장에 숨은 비밀</p><ul class="secrets">${secrets}</ul>
        <button class="btn primary next">다음 ➜</button>`;
      speak('딩동댕! 또박또박 잘 썼어요!');
    } else {
      const reasons = diagnose(typed, q.t, q.hints);
      $('#paper').innerHTML = `
        <div class="tl"><span class="tl-lab">내 글</span>${cells(u, marksFor(u, ku, 'bad'))}</div>
        <div class="tl"><span class="tl-lab">바른 글</span>${cells(q.t, marksFor(q.t, ka, 'fix'))}</div>`;
      res.innerHTML = `
        ${reasons.length ? reasons.map((r) => `<div class="reason"><div class="typebadge"><span>${TYPES[r.k].icon}</span>${TYPES[r.k].name}</div><p>${r.text}</p><p class="small-note">${TYPES[r.k].why}</p></div>`).join('')
          : '<p>빨간 칸을 바른 글과 비교해 봐요.</p>'}
        <p class="small-note">이 문장에 숨은 비밀</p><ul class="secrets">${secrets}</ul>
        <div class="row"><button class="btn primary" id="retry">✏️ 다시 써 볼래요</button><button class="btn next">다음 ➜</button></div>`;
      speak('아쉬워! 바른 글과 비교해 볼까? ' + q.t);
      $('#retry').onclick = () => {
        typed = ''; stack = []; pieces.forEach((p) => { p.used = false; });
        $('#paper').innerHTML = '<div id="ans"></div>';
        res.hidden = true;
        $('#check').disabled = false;
        paintAns(); paintPad();
        speak(q.t);
      };
    }
    $('#check').disabled = true;
    res.hidden = false;
    $('.next', res).onclick = next;
    res.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  };
  setTimeout(() => speak(q.t), 350);
}

/* ---------- 🏆 스티커북 ---------- */
SCREENS.book = () => {
  const have = stickerCount();
  const toNext = 10 - (S.stars % 10);
  const all = [...ISLANDS.filter((s) => s.id !== 'book' && s.id !== 'dict'), ...DICTATION.map((d) => ({ id: d.id, icon: '🎧', name: `받아쓰기 ${d.name}` }))];
  app.innerHTML = `
    <h2 class="h">🏆 스티커북</h2>
    ${bubble(have < STICKERS.length ? `별을 ${toNext}개 더 모으면 새 스티커를 받아!` : '스티커를 모두 모았어! 최고야!')}
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${S.stars % 10}">
      <span style="width:${(S.stars % 10) * 10}%"></span><b>⭐ ${S.stars % 10} / 10</b></div>
    <div class="stickers">${STICKERS.map((s, k) => `<span class="sticker ${k < have ? 'got' : ''}">${k < have ? s : '?'}</span>`).join('')}</div>
    <h3 class="h3">섬마다 최고 점수</h3>
    <ul class="bests">${all.map((s) => `<li><span>${s.icon} ${s.name}</span><b>${S.best[s.id] != null ? S.best[s.id] + '점' : '—'}</b></li>`).join('')}</ul>`;
  speak(have < STICKERS.length ? `별을 ${toNext}개 더 모으면 새 스티커를 받아!` : '스티커를 모두 모았어!');
};

/* ---------- 시작 ---------- */
paintStars();
go('home');
$('#startBtn').addEventListener('click', () => {
  $('#splash').hidden = true;
  sfx('star');
  go('home');
});
})();
