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
  if (typeof cry !== 'undefined' && cry) cry.pause();
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

let actx = null;
function sfx(kind) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { ok: [660, 880, 1320], no: [300, 220], pop: [520], star: [880, 1175, 1568, 2093], click: [190], whoosh: [1200, 900, 600, 400] }[kind];
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
      speak(LINES.sticker);
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
  if (b) { speak(b.dataset.say.split('|'), b.dataset.slow === '1'); }
});

/* ---------- 화면 이동 ---------- */
const ISLANDS = [
  { id: 'poke',  icon: '⚡', name: '포켓몬 잡기', sub: '야생의 포켓몬이 나타났다!', tone: 'poke' },
  { id: 'dict',  icon: '🎧', name: '받아쓰기 섬', sub: '듣고 쓰기',          tone: 't1' },
  { id: 'josa',  icon: '🧩', name: '조사 마을',   sub: '이·가, 을·를',       tone: 't2' },
  { id: 'vowel', icon: '🦀', name: 'ㅐㅔ 바닷가', sub: '개 🐶 게 🦀',         tone: 't3' },
  { id: 'space', icon: '✂️', name: '띄어쓰기 숲', sub: '어디서 띄울까?',     tone: 't4' },
  { id: 'sound', icon: '🔍', name: '소리 탐정',   sub: '소리랑 글자가 달라!', tone: 't5' },
  { id: 'book',  icon: '🏆', name: '스티커북',    sub: '모은 스티커',        tone: 't6' },
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

/* ---------- 🗺️ 지도 ---------- */
SCREENS.home = () => {
  app.innerHTML = `
    <h1 class="title">또박또박 <span>받아쓰기</span></h1>
    ${bubble(LINES.home)}
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
  speak(LINES.home);
};

/* ---------- 결과 ---------- */
function finish(key, score, total, again, extra) {
  const pct = Math.round((score / total) * 100);
  setBest(key, pct);
  const great = pct >= 70;
  /* 포켓몬이 아닌 섬에서 잘하면 보너스 포켓몬 */
  const bonus = great && key !== 'poke' && key !== 'bonus';
  app.innerHTML = `
    <div class="finish">
      <div class="stamp ${great ? '' : 'soft'}">${great ? '참<br>잘했어요' : '잘<br>했어요'}</div>
      <h2>${total}문제 중에 <b>${score}</b>개 맞혔어요!</h2>
      <p class="finish-stars" aria-label="별 ${score}개">${'⭐'.repeat(score) || '🌱'}</p>
      ${extra && extra.badge ? `<div class="badge-won"><span class="badge got big" style="--bc:${extra.badge[2]}"><i>${extra.badge[1]}</i></span><p><b>${extra.badge[0]}</b>를 받았어요!</p></div>` : ''}
      ${extra && extra.caught && extra.caught.length ? `<div class="caught-row" aria-label="이번에 잡은 포켓몬">${extra.caught.map((q) => `<span class="mini">${artImg(q.m, q.shiny)}<small>${q.name}</small></span>`).join('')}</div>` : ''}
      ${bubble(great ? LINES.great : LINES.soso)}
      ${bonus ? `<button class="bonus-card" id="bonus"><span class="ball">${ballSvg}</span><span><b>🎁 보너스 포켓몬!</b><small>잘했으니까 야생의 포켓몬을 만나러 가요</small></span></button>` : ''}
      <div class="row">
        ${key === 'bonus' ? '<button class="btn primary" id="again">⚡ 포켓몬 모험</button>' : '<button class="btn primary" id="again">🔁 한 번 더</button>'}
        <button class="btn" id="toMap">🗺️ 지도로</button>
      </div>
    </div>`;
  if (great) { confetti(); sfx('star'); }
  speak([LINES.score(total, score), great ? LINES.finishGreat : LINES.finishSoso,
    ...(extra && extra.badge ? [LINES.badge(extra.badge[0])] : []), ...(bonus ? [LINES.bonus] : [])]);
  $('#again').onclick = key === 'bonus' ? () => go('poke') : again;
  $('#toMap').onclick = () => go('home');
  $('#bonus')?.addEventListener('click', () => { sfx('pop'); go('bonus'); });
}

/* 문제 풀이 틀: items를 하나씩 render로 넘기고 끝나면 결과 화면 */
function runQuiz(key, items, render, onDone) {
  let i = 0, score = 0, streak = 0;
  const next = () => {
    if (i >= items.length) {
      const end = (extra) => finish(key, score, items.length, () => go(key, true), extra);
      return onDone ? onDone(score, end) : end(null);
    }
    app.innerHTML = '';
    render(items[i], i, items.length, (ok) => {
      if (!ok) { streak = 0; return; }
      score++; streak++; addStar();
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
      ${bubble(LINES.josaAsk)}
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
      ${bubble(LINES.vowelAsk)}
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
      ${bubble(LINES.spaceAsk)}
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
      ${bubble(LINES.soundAsk)}
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

/* ---------- ⚡ 포켓몬 잡기 ---------- */
const TYPE_TONE = { 전기: 't3', 불꽃: 't1', 물: 't2', 풀: 't4', 에스퍼: 't6', 고스트: 't5', 벌레: 't4', 드래곤: 't5' };
const dexHas = (name) => (S.dex || []).includes(name);
function addDex(name) {
  S.dex = S.dex || [];
  if (dexHas(name)) return false;
  S.dex.push(name);
  save();
  return true;
}
/* 헷갈리는 가짜 이름: 비슷한 소리 하나만 바꿔요 (ㄱ↔ㅋ↔ㄲ, ㅠ↔ㅜ, ㅐ↔ㅔ …) */
const CHO_NEAR = { 0: [15, 1], 15: [0, 1], 1: [0, 15], 3: [16, 4], 16: [3, 4], 4: [3, 16], 7: [17, 8], 17: [7, 8], 8: [7, 17], 12: [14, 13], 14: [12, 13], 13: [12, 14], 9: [10], 10: [9] };
const JUNG_NEAR = { 1: [5], 5: [1], 3: [1], 7: [5], 17: [13], 13: [17], 12: [8], 8: [12], 6: [4], 4: [6] };
function fakeNames(name, n = 2) {
  const real = new Set(POKEMON.map((m) => m[0]));
  const out = new Set();
  [...name].forEach((ch, k) => {
    if (!isHangul(ch)) return;
    const p = split(ch);
    (CHO_NEAR[p.cho] || []).forEach((c) => out.add(name.slice(0, k) + join({ ...p, cho: c }) + name.slice(k + 1)));
    (JUNG_NEAR[p.jung] || []).forEach((v) => out.add(name.slice(0, k) + join({ ...p, jung: v }) + name.slice(k + 1)));
  });
  return shuffle([...out].filter((f) => !real.has(f))).slice(0, n);
}
const aeIndex = (w) => [...w].findIndex((ch) => isHangul(ch) && [1, 3, 5, 7].includes(split(ch).jung));
const ballSvg = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="b-bot"/><path d="M4 50 A46 46 0 0 1 96 50 Z" class="b-top"/><path d="M4 50 H96" class="b-line"/><circle cx="50" cy="50" r="13" class="b-btn"/><circle cx="50" cy="50" r="6" class="b-dot"/></svg>';

/* 공식 그림을 불러올 수 있는지 한 번 확인 (못 쓰면 이모지 + 실루엣 문제 빼기) */
let artOK = false;
{ const t = new Image(); t.onload = () => { artOK = true; }; t.src = POKE_ART(25); }
/* 그림을 못 불러오면 이모지로 바꿔요 */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('art')) return;
  const span = document.createElement('span');
  span.className = 'art-fallback';
  span.textContent = img.dataset.e || '?';
  img.replaceWith(span);
}, true);
const artImg = (m, shiny, cls = '') => `<img class="art ${cls}" src="${POKE_ART(m[3], shiny)}" data-e="${m[1]}" alt="" draggable="false">`;
const dexNo = (id) => 'No.' + String(id).padStart(3, '0');
const hasShiny = (name) => (S.shinies || []).includes(name);

let cry = null;
function playCry(id) {
  if (S.cries === false) return false;
  try {
    if (cry) cry.pause();
    cry = new Audio(POKE_CRY(id));
    cry.volume = 0.4;
    cry.play().catch(() => {});
    return true;
  } catch (e) { return false; }
}

/* 포켓몬 한 마리 만나기: 문제 종류 정하기 */
function makeEncounter(m, again, prevKind) {
  let kinds = ['josa', ...(fakeNames(m[0]).length === 2 ? ['name'] : []), ...(aeIndex(m[0]) >= 0 ? ['vowel', 'vowel'] : []), ...(artOK ? ['who'] : [])];
  if (again && kinds.length > 1) kinds = kinds.filter((k) => k !== prevKind);
  /* '피카츄와 피카츄'가 되지 않게. 다시 나올 땐 '다시 나타났다'가 답을 알려 주지 않게 '이/가' 문장은 빼요 */
  const j = pick(POKE_JOSA.filter((t) => !t[2].startsWith(m[0]) && !(again && t[0] === '이')));
  return { m, name: m[0], e: m[1], type: m[2], id: m[3], genus: m[4], kind: pick(kinds), j, again, shiny: Math.random() < SHINY_CHANCE };
}

function pokeRound(count, key) {
  const fresh = shuffle(POKEMON.filter((m) => !dexHas(m[0])));
  const seen = shuffle(POKEMON.filter((m) => dexHas(m[0])));
  const picks = [...fresh, ...seen].slice(0, count).map((m) => makeEncounter(m));
  const caughtNow = [];
  runQuiz(key, picks, (q, i, n, mark, next) => {
    const N = q.name;
    const subj = josaPick(N, ['이', '가']), obj = josaPick(N, ['을', '를']);
    let ans, opts, ask, stage;
    if (q.kind === 'josa') {
      ans = josaPick(N, q.j);
      opts = shuffle([q.j[0], q.j[1]]);
      ask = LINES.josaAsk;
      stage = `<p class="sentence">${esc(q.j[2])}<b>${N}</b><span class="blank">?</span>${esc(q.j[3])}</p>`;
    } else if (q.kind === 'vowel') {
      const k = aeIndex(N);
      ans = N[k];
      opts = shuffle([ans, swapVowel(ans)]);
      ask = LINES.vowelAsk;
      stage = `<div class="wordcells">${cells(N.slice(0, k) + '?' + N.slice(k + 1), { [k]: 'q' })}</div>`;
    } else if (q.kind === 'name') {
      ans = N;
      opts = shuffle([N, ...fakeNames(N)]);
      ask = LINES.pokeName;
      stage = `<button class="btn small" data-say="${esc(N)}">🔊 이름 다시 듣기</button>`;
    } else { /* who: 실루엣 보고 이름 읽기 */
      ans = N;
      const others = shuffle(POKEMON.filter((p) => p[0] !== N)).sort((a, b) => Math.abs(a[0].length - N.length) - Math.abs(b[0].length - N.length)).slice(0, 2);
      opts = shuffle([N, ...others.map((p) => p[0])]);
      ask = LINES.pokeWho;
      stage = '';
    }
    const hidden = q.kind === 'name' || q.kind === 'who';
    app.innerHTML = `
      ${dots(i, n)}
      <div class="tray" aria-label="모은 몬스터볼 ${caughtNow.length}개">${ballTray(caughtNow.length)}</div>
      ${bubble(ask)}
      <div class="encounter ${TYPE_TONE[q.type] || 'tn'}${q.shiny ? ' shiny' : ''}">
        ${q.again ? '<span class="tag again">🔁 다시 나타났다!</span>' : ''}${q.shiny ? '<span class="tag sparkle">✨ 색이 다른 포켓몬!</span>' : ''}
        <div class="mon" aria-hidden="true">${artImg(q.m, q.shiny, q.kind === 'who' ? 'sil' : '')}</div>
        <p class="mon-name">${hidden ? '???' : N}<small>${q.type} 타입</small></p>
        <p class="mon-no">${dexNo(q.id)} · ${hidden ? '???' : q.genus}</p>
        ${stage}
      </div>
      <div class="choices ${hidden ? 'names' : ''}">${opts.map((v) => `<button class="choice" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
      <div class="explain" hidden></div>`;
    const cried = playCry(q.id);
    const intro = [...(q.shiny ? [LINES.shiny] : []), q.again ? LINES.reappear(N, subj) : LINES.appear('포켓몬', '이'), ask, ...(q.kind === 'name' ? [N] : [])];
    const introTimer = setTimeout(() => speak(intro), cried ? 1100 : 0);
    wireChoices(app, ans, (ok, chosen) => {
      clearTimeout(introTimer);
      mark(ok);
      const enc = $('.encounter', app);
      $('.mon-name', app).innerHTML = `${N}<small>${q.type} 타입</small>`;
      $('.mon-no', app).textContent = `${dexNo(q.id)} · ${q.genus}`;
      $('.art.sil', app)?.classList.remove('sil');
      if (q.kind === 'josa') { $('.blank', app).textContent = ans; $('.blank', app).classList.add('filled'); }
      if (q.kind === 'vowel') $('.wordcells', app).innerHTML = cells(N, { [aeIndex(N)]: 'good' });
      /* 잡기는 마지막 '포획 타임'에! 지금은 몬스터볼만 모아요 */
      if (ok) {
        caughtNow.push(q);
        $('.tray', app).innerHTML = ballTray(caughtNow.length, true);
      }
      /* 도망친 포켓몬은 한 번 더 나와요 */
      const comes = !ok && !q.again;
      if (comes) picks.push(makeEncounter(q.m, true, q.kind)); /* runQuiz가 같은 배열을 보고 있어요 */
      enc.classList.add(ok ? 'happy' : 'fleeing');
      const headline = ok ? LINES.gotBall(N, obj) : LINES.fled(N, subj);
      let body;
      if (q.kind === 'josa') body = josaExplain(N, ans);
      else if (q.kind === 'vowel') body = vowelExplain(ans);
      else if (q.kind === 'name') {
        const fake = ok ? opts.find((o) => o !== N) : chosen;
        const diff = {};
        [...N].forEach((ch, k) => { if (fake[k] !== ch) diff[k] = 'hot'; });
        body = `<div class="twoline"><div class="tl"><span class="tl-lab">진짜 이름</span>${cells(N, diff)}</div>
          <div class="tl"><span class="tl-lab">가짜 이름</span>${cells(fake, diff)}</div></div>
          <p>비슷하게 들려도 한 글자가 달라요. 소리를 잘 들으면 가짜를 찾을 수 있어요!</p>`;
      } else {
        body = `<div class="wordcells">${cells(N)}</div><p>그림자의 주인공은 <b class="hl">${N}</b>! ${esc(q.genus)}예요.</p>`;
      }
      const ex = $('.explain', app);
      ex.innerHTML = `<p class="catch-line ${ok ? 'yay' : ''}">${ok ? '🔴 ' : '💨 '}${headline}</p>
        ${comes ? `<p class="small-note">🔁 ${LINES.fledSoon}</p>` : ''}
        ${body}<button class="btn primary next">다음 ➜</button>`;
      ex.hidden = false;
      const said = q.kind === 'josa' ? [q.j[2] + N + ans + q.j[3]] : [];
      speak([ok ? LINES.ding : LINES.oops, ...said, headline, ...(comes ? [LINES.fledSoon] : [])]);
      $('.next', ex).onclick = next;
    });
  }, (score, end) => {
    let badge = null;
    if (key === 'poke' && score >= 6 && (S.badges || 0) < BADGES.length) {
      S.badges = (S.badges || 0) + 1;
      save();
      badge = BADGES[S.badges - 1];
    }
    const done = () => end({ caught: caughtNow, badge });
    if (caughtNow.length) catchScene(caughtNow, done); else done();
  });
}

/* 모은 몬스터볼 줄 */
function ballTray(n, popLast) {
  if (!n) return '<span class="tray-empty">맞히면 몬스터볼을 모아요</span>';
  return Array.from({ length: n }, (_, k) => `<span class="tball${popLast && k === n - 1 ? ' pop' : ''}">${ballSvg}</span>`).join('');
}

/* 🔴 포획 타임: 모은 몬스터볼을 하나씩 던져서 잡아요 (항상 성공) */
function catchScene(list, onEnd) {
  const fast = reduceMotion;
  const wait = (ms) => new Promise((r) => setTimeout(r, fast ? Math.min(ms, 120) : ms));
  const run = (el, frames, opts) => el.animate(frames, { fill: 'forwards', ...opts, duration: fast ? 1 : opts.duration }).finished;
  let k = 0;
  let busy = false;
  const register = (q) => {
    const isNew = addDex(q.name);
    if (q.shiny && !hasShiny(q.name)) { S.shinies = [...(S.shinies || []), q.name]; save(); }
    return isNew;
  };

  const show = () => {
    const q = list[k];
    app.innerHTML = `
      <h2 class="h">🔴 포획 타임! <small class="h-note">${k + 1} / ${list.length}</small></h2>
      ${bubble(LINES.throwAsk)}
      <div class="field ${TYPE_TONE[q.type] || 'tn'}${q.shiny ? ' shiny' : ''}">
        <div class="target" id="target">${artImg(q.m, q.shiny)}</div>
        <div class="flash" aria-hidden="true"></div>
        <button class="throwball" id="throw" aria-label="${q.name}에게 몬스터볼 던지기">${ballSvg}</button>
        <p class="throw-hint">👆 톡!</p>
      </div>
      <p class="catch-msg" aria-live="polite"></p>
      <div class="row" id="after"></div>
      <div class="row"><button class="btn ghost" id="skip">모두 잡기 ⏭</button></div>`;
    playCry(q.id);
    setTimeout(() => speak(LINES.throwAsk), 900);
    $('#throw').addEventListener('click', () => throwAt(q));
    $('#skip').onclick = () => {
      hush();
      list.slice(k).forEach(register);
      onEnd();
    };
  };

  const throwAt = async (q) => {
    if (busy) return;
    busy = true;
    hush();
    const ball = $('#throw'), target = $('#target'), field = $('.field', app);
    $('.throw-hint', app).hidden = true;
    ball.disabled = true;
    const b = ball.getBoundingClientRect(), t = target.getBoundingClientRect();
    const dx = t.left + t.width / 2 - (b.left + b.width / 2);
    const dy = t.top + t.height / 2 - (b.top + b.height / 2);
    /* 1. 휙! 포물선으로 날아가기 */
    sfx('whoosh');
    await run(ball, [
      { transform: 'translate(0, 0) rotate(0) scale(1)' },
      { transform: `translate(${dx * 0.5}px, ${dy - 90}px) rotate(-400deg) scale(.85)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(-720deg) scale(.7)` },
    ], { duration: 650, easing: 'cubic-bezier(.3,.6,.5,1)' });
    /* 2. 번쩍! 포켓몬이 빛이 되어 공 속으로 */
    field.classList.add('flashing');
    sfx('pop');
    await run(target, [
      { transform: 'scale(1)', filter: 'brightness(1)', opacity: 1 },
      { transform: 'scale(1.08)', filter: 'brightness(4)', opacity: 1, offset: 0.35 },
      { transform: 'scale(0)', filter: 'brightness(4)', opacity: 0 },
    ], { duration: 520, easing: 'ease-in' });
    /* 3. 톡 떨어지기 */
    await run(ball, [
      { transform: `translate(${dx}px, ${dy}px) rotate(-720deg) scale(.7)` },
      { transform: `translate(${dx}px, ${dy + 70}px) rotate(-720deg) scale(.7)` },
    ], { duration: 280, easing: 'cubic-bezier(.5,0,1,1)' });
    /* 4. 흔들흔들 하나, 둘, 셋 */
    const msg = $('.catch-msg', app);
    for (let w = 1; w <= 3; w++) {
      msg.textContent = '…'.repeat(w);
      sfx('click');
      await run(ball, [
        { transform: `translate(${dx}px, ${dy + 70}px) rotate(0deg) scale(.7)` },
        { transform: `translate(${dx}px, ${dy + 70}px) rotate(-22deg) scale(.7)`, offset: 0.3 },
        { transform: `translate(${dx}px, ${dy + 70}px) rotate(22deg) scale(.7)`, offset: 0.7 },
        { transform: `translate(${dx}px, ${dy + 70}px) rotate(0deg) scale(.7)` },
      ], { duration: 520, easing: 'ease-in-out' });
      await wait(260);
    }
    /* 5. 딸깍! */
    const N = q.name, obj = josaPick(N, ['을', '를']), subj = josaPick(N, ['이', '가']);
    const isNew = register(q);
    ball.classList.add('locked');
    sfx('star');
    confetti();
    msg.innerHTML = `<b>딸깍! ${N}${obj} 잡았다!</b>`;
    const last = k === list.length - 1;
    $('#after').innerHTML = `
      ${isNew ? `<p class="small-note">📖 새 포켓몬! 도감에 ${N}${subj} 등록됐어요. (${S.dex.length}/${POKEMON.length})</p>` : ''}
      ${q.shiny ? '<p class="small-note">✨ 색이 다른 포켓몬을 잡았어요!</p>' : ''}
      <button class="btn primary big" id="nextMon">${last ? '결과 보기 ▶' : '다음 포켓몬 ▶'}</button>`;
    speak(LINES.caught(N, obj));
    $('#nextMon').onclick = () => {
      k++;
      busy = false;
      if (k < list.length) show(); else onEnd();
    };
    $('#skip').parentElement.hidden = last;
  };
  show();
}
SCREENS.poke = (skipIntro) => (skipIntro ? pokeRound(QUIZ_SIZE.poke, 'poke') : pokeIntro());
SCREENS.bonus = () => pokeRound(1, 'bonus');

const badgeCase = () => `<div class="badges" aria-label="배지 ${S.badges || 0}개">${BADGES.map(([b, e, c], k) => k < (S.badges || 0)
  ? `<span class="badge got" style="--bc:${c}" title="${b}"><i>${e}</i><small>${b}</small></span>`
  : '<span class="badge"><i>?</i><small>&nbsp;</small></span>').join('')}</div>`;

function pokeIntro() {
  const have = (S.dex || []).length;
  app.innerHTML = `
    <h2 class="h">⚡ 포켓몬 잡기</h2>
    ${bubble(LINES.pokeBubble)}
    <div class="poke-hero">
      <div class="ball big" aria-hidden="true">${ballSvg}</div>
      <ul class="poke-rules">
        <li>🧩 <b>조사</b> — 피카츄<b class="hl">가</b>? 이상해꽃<b class="hl">이</b>?</li>
        <li>🦀 <b>ㅐ·ㅔ</b> — 메타몽, 팬텀, 캐터피</li>
        <li>👂 <b>진짜 이름</b> — 피카츄? 피가츄?</li>
        ${artOK ? '<li>👤 <b>그림자 퀴즈</b> — 이 포켓몬은 누구일까?</li>' : ''}
      </ul>
      <p>맞히면 몬스터볼로 <b>잡고</b>, 틀리면 <b>도망가요</b>. 도망친 포켓몬은 한 번 더 나타나요!<br>✨ 아주 가끔 <b>색이 다른 포켓몬</b>도 나와요.</p>
    </div>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${POKEMON.length}" aria-valuenow="${have}">
      <span style="width:${(have / POKEMON.length) * 100}%"></span><b>📖 도감 ${have} / ${POKEMON.length}</b></div>
    <section class="setbox"><h3 class="h3">🏅 체육관 배지 <small class="h-note">8마리 중 6마리 넘게 잡으면 하나씩!</small></h3>${badgeCase()}</section>
    <div class="row">
      <button class="btn primary big" id="start">모험 시작! ▶</button>
      <button class="btn big" id="dexBtn">📖 도감</button>
    </div>`;
  speak(LINES.pokeBubble);
  $('#start').onclick = () => go('poke', true);
  $('#dexBtn').onclick = () => go('dex');
}
SCREENS.dex = () => {
  const have = (S.dex || []).length;
  const shinies = (S.shinies || []).length;
  app.innerHTML = `
    <h2 class="h">📖 포켓몬 도감 <small class="h-note">${have} / ${POKEMON.length}${shinies ? ` · ✨ ${shinies}` : ''}</small></h2>
    ${bubble(LINES.pokeDex)}
    <div class="dex">${POKEMON.map((m) => {
      const [name, , type, id, genus] = m;
      return dexHas(name)
        ? `<button class="dexcard ${TYPE_TONE[type] || 'tn'}" data-id="${id}" data-say="${sayAttr([name, genus])}"><span class="dex-no">${dexNo(id)}</span>${hasShiny(name) ? '<span class="dex-shiny" title="색이 다른 포켓몬">✨</span>' : ''}<span class="dex-art">${artImg(m, hasShiny(name))}</span><b>${name}</b><small>${genus}</small></button>`
        : `<div class="dexcard empty"><span class="dex-no">${dexNo(id)}</span><span class="dex-art">${artOK ? artImg(m, false, 'sil') : '<span class="art-fallback">?</span>'}</span><b>???</b><small>&nbsp;</small></div>`;
    }).join('')}</div>
    <button class="btn primary big" id="start">포켓몬 잡으러 가기 ▶</button>`;
  speak(LINES.pokeDex);
  $$('.dexcard[data-id]', app).forEach((c) => c.addEventListener('click', () => playCry(+c.dataset.id)));
  $('#start').onclick = () => go('poke', true);
};

/* ---------- 🎧 받아쓰기 섬 ---------- */
SCREENS.dict = () => {
  app.innerHTML = `
    <h2 class="h">🎧 받아쓰기 섬</h2>
    ${bubble(LINES.dictBubble)}
    <div class="levels">${DICTATION.map((lv) => `
      <button class="level" data-id="${lv.id}"><span class="l-icon">${lv.icon}</span>
        <span class="l-name">${lv.name}</span><span class="l-sub">${lv.desc} · ${lv.items.length}문제</span>
        ${S.best[lv.id] ? `<span class="i-best">최고 ${S.best[lv.id]}점</span>` : ''}</button>`).join('')}</div>
    ${hasTTS ? '' : '<p class="notice">이 기기에서는 소리가 나오지 않아요. 문제 화면의 👀 어른용 버튼을 눌러 어른이 읽어 주세요.</p>'}`;
  $$('.level', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); dictLevel(b.dataset.id); }));
  speak(LINES.dictBubble);
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
    ${bubble(LINES.dictAsk)}
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
    if (!clean(typed)) { toast('먼저 공책에 써 보세요! ✏️'); speak(LINES.writeFirst); return; }
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
      speak(LINES.dictOk);
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
      speak([LINES.dictWrong, q.t]);
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
    ${bubble(have < STICKERS.length ? LINES.bookLeft(toNext) : LINES.bookAll)}
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${S.stars % 10}">
      <span style="width:${(S.stars % 10) * 10}%"></span><b>⭐ ${S.stars % 10} / 10</b></div>
    <div class="stickers">${STICKERS.map((s, k) => `<span class="sticker ${k < have ? 'got' : ''}">${k < have ? s : '?'}</span>`).join('')}</div>
    <h3 class="h3">섬마다 최고 점수</h3>
    <ul class="bests">${all.map((s) => `<li><span>${s.icon} ${s.name}</span><b>${S.best[s.id] != null ? S.best[s.id] + '점' : '—'}</b></li>`).join('')}</ul>`;
  speak(have < STICKERS.length ? LINES.bookLeft(toNext) : LINES.bookAll);
};

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
    <h2 class="h">⚙️ 목소리 설정 <small class="h-note">어른용</small></h2>
    ${CLIPS.size ? `
      <label class="opt"><input type="checkbox" id="useClips" ${S.useClips !== false ? 'checked' : ''}>
        <span><b>🎙️ 녹음된 목소리 쓰기</b><br><small>미리 만든 자연스러운 목소리 (${window.AUDIO_CLIPS.voice || '녹음'}, ${CLIPS.size}개)</small></span></label>` : ''}
    <label class="opt"><input type="checkbox" id="useCries" ${S.cries !== false ? 'checked' : ''}>
      <span><b>🐾 포켓몬 울음소리</b><br><small>포켓몬이 나타날 때 울음소리를 들려줘요</small></span></label>
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
  $('#useCries').addEventListener('change', (e) => { S.cries = e.target.checked; save(); if (S.cries) playCry(25); });
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

/* ---------- 시작 ---------- */
paintStars();
go('home');
$('#startBtn').addEventListener('click', () => {
  $('#splash').hidden = true;
  sfx('star');
  go('home');
});
})();
