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
  /* stars = 쓸 수 있는 별(포획 타임에 걸어요), earned = 지금까지 모은 별 전체(스티커 기준) */
  if (S.earned == null) S.earned = S.stars;
}
loadState();
const save = () => STORE.save(S);
const stickerCount = () => Math.min(STICKERS.length, Math.floor(S.earned / 10));

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
  S.earned++;
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
  { id: 'dex',   icon: '📖', name: '포켓몬 도감', sub: '공부하면 포켓몬을 만나요!', tone: 'poke' },
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
function dexHint() {
  const q = questNow();
  const have = (S.dex || []).filter((n) => POKE_BY[n]).length;
  if (!q) return `카드 ${have}/${POKEMON.length}장 · 모든 퀘스트 완료!`;
  if (S.qready) return `🔥 ${q.p} 등장 준비 완료!`;
  return `카드 ${have}/${POKEMON.length}장 · 🧩 ${q.p}까지 조각 ${q.steps.length - (S.qstep || 0)}개`;
}
SCREENS.home = () => {
  app.innerHTML = `
    <h1 class="title">또박또박 <span>받아쓰기</span></h1>
    ${bubble(LINES.home)}
    <div class="map">
      ${ISLANDS.map((s) => `
        <button class="island ${s.tone}" data-go="${s.id}">
          <span class="i-icon" aria-hidden="true">${s.icon}</span>
          <span class="i-name">${s.name}</span>
          <span class="i-sub">${s.id === 'dex' ? dexHint() : s.sub}</span>
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
  app.innerHTML = `
    <div class="finish">
      <div class="stamp ${great ? '' : 'soft'}">${great ? '참<br>잘했어요' : '잘<br>했어요'}</div>
      <h2>${total}문제 중에 <b>${score}</b>개 맞혔어요!</h2>
      <p class="finish-stars" aria-label="별 ${score}개">${'⭐'.repeat(score) || '🌱'}</p>
      ${extra && extra.badge ? `<div class="badge-won"><span class="badge got big" style="--bc:${extra.badge[2]}"><i>${extra.badge[1]}</i></span><p><b>${extra.badge[0]}</b>를 받았어요!</p></div>` : ''}
      ${extra && extra.caught && extra.caught.length ? `<div class="caught-row" aria-label="이번에 잡은 포켓몬">${extra.caught.map((q) => `<span class="mini">${artImg(q.m, q.shiny)}<small>${q.name}</small></span>`).join('')}</div>` : ''}
      ${bubble(great ? LINES.great : LINES.soso)}
      ${questPanel(false)}
      <div class="row">
        <button class="btn primary" id="again">🔁 한 번 더</button>
        <button class="btn" id="toDex">📖 도감</button>
        <button class="btn" id="toMap">🗺️ 지도로</button>
      </div>
    </div>`;
  if (great) { confetti(); sfx('star'); }
  speak([LINES.score(total, score), great ? LINES.finishGreat : LINES.finishSoso,
    ...(extra && extra.badge ? [LINES.badge(extra.badge[0])] : [])]);
  $('#again').onclick = again;
  $('#toDex').onclick = () => go('dex');
  $('#toMap').onclick = () => go('home');
}

/* 문제 풀이 틀: items를 하나씩 render로 넘기고 끝나면 결과 화면 */
function runQuiz(key, items, render) {
  let i = 0, score = 0, streak = 0, maxStreak = 0, lastOk = false;
  const seen = []; /* 이번 판에 만난 포켓몬 */
  const next = () => {
    if (i >= items.length) return endRound(key, score, items.length, maxStreak, seen, () => go(key, true));
    app.innerHTML = '';
    render(items[i], i, items.length, (ok) => {
      lastOk = ok;
      if (!ok) { streak = 0; return; }
      score++; streak++; addStar();
      maxStreak = Math.max(maxStreak, streak);
      if (streak >= 3) showCombo(streak);
    }, () => {
      i++;
      /* 정답 뒤에 가끔 풀숲이 흔들려요 (한 판에 최대 3마리, 한 마리도 못 만났으면 끝나기 전에 꼭) */
      const left = items.length - i;
      const want = lastOk && left > 0 && seen.length < ENCOUNTER_MAX
        && (Math.random() < 0.35 || (seen.length === 0 && left <= 2));
      if (want) {
        const e = rollWild(streak, seen);
        seen.push(e);
        showWild(e, next);
      } else next();
    });
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

/* ---------- ⚡ 포켓몬: 공부 중에 만나고, 끝나면 잡아요 ---------- */
const TYPE_TONE = { 전기: 't3', 불꽃: 't1', 물: 't2', 풀: 't4', 에스퍼: 't6', 고스트: 't5', 벌레: 't4', 드래곤: 't5', 얼음: 't2' };
const POKE_BY = Object.fromEntries(POKEMON.map((m) => [m[0], m]));
const dexHas = (name) => (S.dex || []).includes(name);
const hasShiny = (name) => (S.shinies || []).includes(name);
function addDex(name) {
  S.dex = S.dex || [];
  if (dexHas(name)) return false;
  S.dex.push(name);
  save();
  return true;
}
const ballSvg = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="b-bot"/><path d="M4 50 A46 46 0 0 1 96 50 Z" class="b-top"/><path d="M4 50 H96" class="b-line"/><circle cx="50" cy="50" r="13" class="b-btn"/><circle cx="50" cy="50" r="6" class="b-dot"/></svg>';

/* 공식 그림을 불러올 수 있는지 한 번 확인 (못 쓰면 이모지) */
let artOK = false;
{ const t = new Image(); t.onload = () => { artOK = true; }; t.src = POKE_ART(25); }
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
const gradeChip = (g, shiny) => shiny
  ? `<span class="grade-chip gs">🌈 시크릿 ✨</span>`
  : `<span class="grade-chip g${g}">${GRADES[g].icon} ${GRADES[g].name}</span>`;

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

/* ---------- 🗺️ 전설 퀘스트 (미션 하나 = 조각 하나) ---------- */
const questNow = () => QUESTS[S.qi || 0] || null;
function missionText(ms, noTimes) {
  const where = MODE_NAME[ms.mode];
  const what = ms.streak ? `한 판에 ${ms.streak}연속 정답` : `${ms.min}점${ms.min < 100 ? ' 넘기' : ' 받기'}`;
  return `${where}에서 ${what}${!noTimes && (ms.times || 1) > 1 ? ` ${ms.times}번` : ''}`;
}
function missionHits(ms, key, pct, maxStreak) {
  const isDict = /^d\d$/.test(key);
  if (ms.mode === 'dict' ? !isDict : ms.mode !== 'any' && ms.mode !== key) return false;
  if (ms.min != null && pct < ms.min) return false;
  if (ms.streak != null && maxStreak < ms.streak) return false;
  return true;
}
/* 한 판이 끝나면 지금 미션을 확인해요 → 알림 문장 목록 */
function checkQuest(key, pct, maxStreak) {
  const q = questNow();
  if (!q || S.qready) return [];
  const ms = q.steps[S.qstep || 0];
  if (!missionHits(ms, key, pct, maxStreak)) return [];
  S.qcount = (S.qcount || 0) + 1;
  const notes = [];
  if (S.qcount >= (ms.times || 1)) {
    S.qstep = (S.qstep || 0) + 1;
    S.qcount = 0;
    notes.push({ kind: 'piece', text: `🧩 퀘스트 조각 획득! <b>${q.p}</b> ${S.qstep}/${q.steps.length}`, say: LINES.piece(q.p) });
    if (S.qstep >= q.steps.length) {
      S.qready = true;
      notes.push({ kind: 'ready', text: `🔥 조각을 다 모았어요! 포획 타임에 <b>${q.p}</b>${josaPick(q.p, ['이', '가'])} 나타나요!`, say: LINES.ready(q.p, josaPick(q.p, ['이', '가'])) });
    }
  } else {
    notes.push({ kind: 'step', text: `🗺️ 미션 진행: ${missionText(ms, true)} (${S.qcount}/${ms.times}번)` });
  }
  save();
  return notes;
}
/* 전설을 잡으면 다음 퀘스트로, 배지도 하나 */
function questCaught() {
  S.qi = (S.qi || 0) + 1;
  S.qstep = 0;
  S.qcount = 0;
  S.qready = false;
  let badge = null;
  if ((S.badges || 0) < BADGES.length) { S.badges = (S.badges || 0) + 1; badge = BADGES[S.badges - 1]; }
  save();
  return badge;
}
/* 퀘스트 카드 (도감 · 지도) */
function questPanel(full) {
  const q = questNow();
  if (!q) return full ? '<div class="quest done">🏆 모든 전설 퀘스트를 끝냈어요! 대단해요!</div>' : '';
  const m = POKE_BY[q.p];
  const step = S.qstep || 0;
  const pieces = q.steps.map((_, k) => `<span class="piece ${k < step ? 'on' : ''}">🧩</span>`).join('');
  const ms = q.steps[Math.min(step, q.steps.length - 1)];
  const go = ms.mode === 'any' ? '' : ms.mode === 'dict' || /^d\d$/.test(ms.mode) ? 'dict' : ms.mode;
  return `<div class="quest g${m[5]}">
    <div class="quest-art">${artOK ? artImg(m, false, S.qready ? '' : 'sil') : `<span class="art-fallback">${m[1]}</span>`}</div>
    <div class="quest-body">
      <small>🗺️ ${GRADES[m[5]].name} 퀘스트</small>
      <b>${q.p}</b>
      <div class="pieces" aria-label="조각 ${step}/${q.steps.length}">${pieces}</div>
      ${S.qready
        ? '<p>🔥 준비 완료! 아무 섬이나 공부를 마치면 포획 타임에 나타나요.</p>'
        : `<p>다음 미션: <b>${missionText(ms, true)}</b>${(ms.times || 1) > 1 ? ` (${S.qcount || 0}/${ms.times}번)` : ''}</p>`}
      ${full && !S.qready && go ? `<button class="btn small" data-go-mode="${go}">하러 가기 ▶</button>` : ''}
    </div>
  </div>`;
}

/* ---------- 🌿 공부 중에 만나는 포켓몬 ---------- */
const ENCOUNTER_MAX = 3;
function rollWild(streak, seen) {
  const caughtBig = (S.dex || []).some((n) => POKE_BY[n] && 'lms'.includes(POKE_BY[n][5]));
  /* 연속 정답이 길수록 희귀 확률이 올라가요: 0연속 12% → 3연속 42% → 5연속 이상 60% */
  const grade = Math.random() < Math.min(0.6, 0.12 + 0.1 * streak) ? 'r' : 'c';
  const pool = POKEMON.filter((m) => m[5] === grade && !seen.some((e) => e.name === m[0]));
  const fresh = pool.filter((m) => !dexHas(m[0]));
  const m = pick(fresh.length && Math.random() < 0.7 ? fresh : pool);
  /* ✨ 시크릿(이로치)은 전설·신화를 잡은 뒤에만, 연속 정답일수록 잘 나와요 */
  const shiny = caughtBig && Math.random() < (streak >= 5 ? 0.12 : 0.04);
  return { m, name: m[0], id: m[3], type: m[2], grade: m[5], genus: m[4], shiny };
}
function showWild(e, cont) {
  const N = e.name, subj = josaPick(N, ['이', '가']);
  app.innerHTML = `
    <div class="wild ${TYPE_TONE[e.type] || 'tn'}${e.shiny ? ' shiny' : ''}">
      <div class="bush" aria-hidden="true">🌿🌿🌿</div>
      <div class="wild-mon" aria-hidden="true">${artImg(e.m, e.shiny)}</div>
    </div>
    <p class="wild-line" aria-live="polite">${esc(LINES.rustle)}</p>
    <div class="row wild-after" hidden>
      ${gradeChip(e.grade, e.shiny)}
      <p class="small-note">${esc(LINES.wildLater)}</p>
      <button class="btn primary big" id="wildGo">계속 공부하기 ▶</button>
    </div>`;
  sfx('pop');
  speak(LINES.rustle);
  setTimeout(() => {
    const wild = $('.wild', app);
    if (!wild) return;
    wild.classList.add('out');
    playCry(e.id);
    sfx(e.grade === 'r' || e.shiny ? 'star' : 'ok');
    $('.wild-line', app).innerHTML = `<b>${esc(LINES.appear(N, subj))}</b>`;
    $('.wild-after', app).hidden = false;
    $('#wildGo').onclick = () => { sfx('pop'); cont(); };
    setTimeout(() => speak([...(e.shiny ? [LINES.shiny] : []), LINES.appear(N, subj), LINES.wildLater]), 700);
  }, reduceMotion ? 100 : 1100);
}

/* 한 판이 끝나면: 퀘스트 확인 → 포획 타임 → 결과 */
function endRound(key, score, total, maxStreak, seen, again) {
  const pct = Math.round((score / total) * 100);
  const notes = checkQuest(key, pct, maxStreak);
  const list = seen.slice();
  const q = questNow();
  if (S.qready && q) {
    const m = POKE_BY[q.p];
    list.push({ m, name: m[0], id: m[3], type: m[2], grade: m[5], genus: m[4], shiny: false, legend: true });
  }
  const done = (caught, badge) => finish(key, score, total, again, { caught, notes, badge });
  if (list.length) catchScene(list, done, notes); else done([], null);
}

/* ---------- 🔴 포획 타임: 만난 포켓몬을 하나씩 던져서 잡아요 ----------
 * 화살표가 가운데(성공 칸)에 올 때 던지면 잡혀요. 등급이 높을수록 칸이 좁고 화살표가 빨라요.
 * 별을 걸수록 화살표가 느려져요 (건 별은 던질 때 써요). */
const BET_MAX = 5;
const SWEEP_MS = [650, 950, 1300, 1750, 2300, 3000]; /* 별 0~5개: 한쪽 끝에서 끝까지 가는 시간 */
const SPEED_WORD = ['아주 빠름', '빠름', '보통', '느림', '아주 느림', '거북이 🐢'];

function catchScene(list, onEnd, notes) {
  const caught = [];
  let badge = null;
  const fast = reduceMotion;
  const wait = (ms) => new Promise((r) => setTimeout(r, fast ? Math.min(ms, 120) : ms));
  const run = (el, frames, opts) => el.animate(frames, { fill: 'forwards', ...opts, duration: fast ? 1 : opts.duration }).finished;
  let k = 0;

  const show = () => {
    const q = list[k];
    const N = q.name, obj = josaPick(N, ['을', '를']), subj = josaPick(N, ['이', '가']);
    const G = GRADES[q.grade];
    const zone = G.zone - (q.shiny ? 1 : 0);
    const bigName = { l: '전설의', m: '신화 속', s: '비밀의' }[q.grade];
    let bet = 0, pos = 50, dir = 1, raf = 0, last = 0, thrown = false;
    app.innerHTML = `
      <h2 class="h">🔴 포획 타임! <small class="h-note">${k + 1} / ${list.length}</small></h2>
      ${k === 0 && notes && notes.length ? `<div class="quest-notes">${notes.map((n) => `<p class="qn ${n.kind}">${n.text}</p>`).join('')}</div>` : ''}
      ${bubble(q.legend ? LINES.bigAppear(bigName, N, subj) : LINES.throwAsk)}
      <div class="field ${TYPE_TONE[q.type] || 'tn'}${q.shiny ? ' shiny' : ''} g${q.grade}">
        <span class="field-grade">${gradeChip(q.grade, q.shiny)}</span>
        <div class="target" id="target">${artImg(q.m, q.shiny)}</div>
        <div class="flash" aria-hidden="true"></div>
        <div class="aim" id="aim" aria-hidden="true">
          <div class="aim-bar"><span class="aim-zone" style="left:${50 - zone}%;width:${zone * 2}%"></span></div>
          <span class="aim-arrow" id="arrow">▼</span>
        </div>
        <button class="throwball" id="throw" aria-label="${N}에게 몬스터볼 던지기">${ballSvg}</button>
      </div>
      <div class="bet" id="betBox">
        <button class="btn bet-btn" id="betMinus" aria-label="별 하나 덜 걸기">−</button>
        <div class="bet-stars" id="betStars" aria-live="polite"></div>
        <button class="btn bet-btn" id="betPlus" aria-label="별 하나 더 걸기">＋</button>
      </div>
      <p class="bet-note" id="betNote"></p>
      <p class="catch-msg" aria-live="polite"></p>
      <div class="row" id="after"></div>`;
    const arrow = $('#arrow');
    const sweep = () => SWEEP_MS[bet] * G.speed;
    const paintBet = () => {
      $('#betStars').innerHTML = Array.from({ length: BET_MAX }, (_, s) => `<span class="${s < bet ? 'on' : ''}">⭐</span>`).join('');
      $('#betNote').innerHTML = `⭐ <b>${bet}개</b> 걸기 · 화살표 <b>${SPEED_WORD[bet]}</b> · 남은 별 ${thrown ? S.stars : S.stars - bet}개`;
      $('#betMinus').disabled = thrown || bet === 0;
      $('#betPlus').disabled = thrown || bet >= BET_MAX || bet >= S.stars;
    };
    const tick = (t) => {
      if (!last) last = t;
      const dt = Math.min(t - last, 50);
      last = t;
      pos += dir * (100 * dt / sweep());
      if (pos >= 100) { pos = 200 - pos; dir = -1; }
      if (pos <= 0) { pos = -pos; dir = 1; }
      arrow.style.left = pos + '%';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    paintBet();
    $('#betPlus').onclick = () => { bet++; sfx('pop'); paintBet(); };
    $('#betMinus').onclick = () => { bet--; sfx('pop'); paintBet(); };
    playCry(q.id);
    if (q.legend) { sfx('star'); confetti(); }
    const intro = q.legend ? [LINES.bigAppear(bigName, N, subj), LINES.throwAsk]
      : k === 0 ? [...(notes || []).filter((n) => n.say).map((n) => n.say), LINES.catchIntro, LINES.throwAsk] : [LINES.throwAsk];
    setTimeout(() => { if (!thrown) speak(intro); }, 900);

    $('#throw').addEventListener('click', async () => {
      if (thrown) return;
      thrown = true;
      cancelAnimationFrame(raf);
      hush();
      const hit = Math.abs(pos - 50) <= zone;
      if (bet) { S.stars -= bet; save(); paintStars(); }
      paintBet();
      $('#aim').classList.add(hit ? 'hit' : 'miss');
      const ball = $('#throw'), target = $('#target'), field = $('.field', app), msg = $('.catch-msg', app);
      ball.disabled = true;
      const b = ball.getBoundingClientRect(), tr = target.getBoundingClientRect();
      const dx = tr.left + tr.width / 2 - (b.left + b.width / 2);
      const dy = tr.top + tr.height / 2 - (b.top + b.height / 2);
      const off = hit ? 0 : (pos < 50 ? -1 : 1) * 70;
      sfx('whoosh');
      await run(ball, [
        { transform: 'translate(0, 0) rotate(0) scale(1)' },
        { transform: `translate(${(dx + off) * 0.5}px, ${dy - 90}px) rotate(-400deg) scale(.85)`, offset: 0.55 },
        { transform: `translate(${dx + off}px, ${dy}px) rotate(-720deg) scale(.7)` },
      ], { duration: 650, easing: 'cubic-bezier(.3,.6,.5,1)' });

      if (!hit) {
        sfx('no');
        run(ball, [
          { transform: `translate(${dx + off}px, ${dy}px) rotate(-720deg) scale(.7)`, opacity: 1 },
          { transform: `translate(${dx + off * 3}px, ${dy + 260}px) rotate(-1000deg) scale(.6)`, opacity: 0 },
        ], { duration: 700, easing: 'ease-in' });
        await wait(250);
        await run(target, [
          { transform: 'translateX(0)', opacity: 1 },
          { transform: 'translateX(-14px)', opacity: 1, offset: 0.25 },
          { transform: `translateX(${pos < 50 ? 300 : -300}px) rotate(${pos < 50 ? 20 : -20}deg)`, opacity: 0 },
        ], { duration: 700, easing: 'ease-in' });
        /* 전설은 사라지지 않고 다음 판에 다시 나와요 */
        msg.innerHTML = `<b class="missed">💨 ${LINES.fled(N, subj)}</b>${q.legend ? `<small>${LINES.legendAway}</small>` : ''}`;
        speak([LINES.missed, LINES.fled(N, subj), ...(q.legend ? [LINES.legendAway] : [])]);
      } else {
        field.classList.add('flashing');
        sfx('pop');
        await run(target, [
          { transform: 'scale(1)', filter: 'brightness(1)', opacity: 1 },
          { transform: 'scale(1.08)', filter: 'brightness(4)', opacity: 1, offset: 0.35 },
          { transform: 'scale(0)', filter: 'brightness(4)', opacity: 0 },
        ], { duration: 520, easing: 'ease-in' });
        await run(ball, [
          { transform: `translate(${dx}px, ${dy}px) rotate(-720deg) scale(.7)` },
          { transform: `translate(${dx}px, ${dy + 60}px) rotate(-720deg) scale(.7)` },
        ], { duration: 280, easing: 'cubic-bezier(.5,0,1,1)' });
        for (let w = 1; w <= 3; w++) {
          msg.textContent = '…'.repeat(w);
          sfx('click');
          await run(ball, [
            { transform: `translate(${dx}px, ${dy + 60}px) rotate(0deg) scale(.7)` },
            { transform: `translate(${dx}px, ${dy + 60}px) rotate(-22deg) scale(.7)`, offset: 0.3 },
            { transform: `translate(${dx}px, ${dy + 60}px) rotate(22deg) scale(.7)`, offset: 0.7 },
            { transform: `translate(${dx}px, ${dy + 60}px) rotate(0deg) scale(.7)` },
          ], { duration: 520, easing: 'ease-in-out' });
          await wait(260);
        }
        const isNew = addDex(N);
        if (q.shiny && !hasShiny(N)) { S.shinies = [...(S.shinies || []), N]; save(); }
        if (q.legend) badge = questCaught();
        caught.push(q);
        ball.classList.add('locked');
        sfx('star');
        confetti();
        msg.innerHTML = `<b>딸깍! ${N}${obj} 잡았다!</b>`;
        $('#after').innerHTML = `
          <div class="card-reveal">${pokeCard(q.m, q.shiny)}</div>
          ${isNew ? `<p class="small-note">📖 새 카드! 도감에 ${N}${subj} 등록됐어요.</p>` : ''}`;
        speak(LINES.caught(N, obj));
      }
      const lastOne = k === list.length - 1;
      $('#after').insertAdjacentHTML('beforeend', `<button class="btn primary big" id="nextMon">${lastOne ? '결과 보기 ▶' : '다음 포켓몬 ▶'}</button>`);
      $('#nextMon').onclick = () => { k++; if (k < list.length) show(); else onEnd(caught, badge); };
    });
  };
  show();
}

/* ---------- 📖 포켓몬 도감 (카드 모음) ---------- */
const badgeCase = () => `<div class="badges" aria-label="배지 ${S.badges || 0}개">${BADGES.map(([b, e, c], k) => k < (S.badges || 0)
  ? `<span class="badge got" style="--bc:${c}" title="${b}"><i>${e}</i><small>${b}</small></span>`
  : '<span class="badge"><i>?</i><small>&nbsp;</small></span>').join('')}</div>`;
/* 카드 한 장 */
function pokeCard(m, shiny, locked) {
  const [name, , type, id, genus, g] = m;
  if (locked) {
    return `<div class="pcard locked g${g}"><span class="pc-no">${dexNo(id)}</span>
      <span class="pc-art">${artOK ? artImg(m, false, 'sil') : '<span class="art-fallback">?</span>'}</span>
      <b>???</b><small>${'lms'.includes(g) ? '🔒 퀘스트로 만나요' : '&nbsp;'}</small>${gradeChip(g)}</div>`;
  }
  return `<button class="pcard g${shiny ? 's shiny' : g}" data-id="${id}" data-say="${sayAttr([name, genus])}">
    <span class="pc-no">${dexNo(id)}</span>
    <span class="pc-art">${artImg(m, shiny)}</span>
    <b>${name}</b><small>${genus}</small>${gradeChip(g, shiny)}</button>`;
}
let dexTab = 'all';
SCREENS.dex = () => {
  const count = (g) => POKEMON.filter((m) => m[5] === g && dexHas(m[0])).length;
  const total = (g) => POKEMON.filter((m) => m[5] === g).length;
  const shinyCards = (S.shinies || []).filter((n) => POKE_BY[n]).map((n) => POKE_BY[n]);
  const tabs = [['all', '전체', (S.dex || []).filter((n) => POKE_BY[n]).length, POKEMON.length], ...'crlms'.split('').map((g) => [g, `${GRADES[g].icon} ${GRADES[g].name}`,
    g === 's' ? count('s') + shinyCards.length : count(g), g === 's' ? null : total(g)])];
  let cards;
  if (dexTab === 's') {
    cards = POKEMON.filter((m) => m[5] === 's').map((m) => pokeCard(m, false, !dexHas(m[0]))).join('')
      + shinyCards.map((m) => pokeCard(m, true)).join('')
      + '<p class="small-note dex-tip">✨ 색이 다른(이로치) 카드는 전설이나 신화를 잡은 뒤, 연속 정답을 이어 가면 가끔 나타나요.</p>';
  } else {
    cards = POKEMON.filter((m) => dexTab === 'all' || m[5] === dexTab).map((m) => pokeCard(m, false, !dexHas(m[0]))).join('');
  }
  app.innerHTML = `
    <h2 class="h">📖 포켓몬 도감</h2>
    ${bubble(LINES.pokeDex)}
    ${questPanel(true)}
    <div class="dex-tabs" role="tablist">${tabs.map(([g, label, have, all]) =>
      `<button role="tab" aria-selected="${dexTab === g}" data-tab="${g}" class="g${g}">${label}<small>${have}${all != null ? `/${all}` : ''}</small></button>`).join('')}</div>
    <div class="pdex">${cards}</div>
    <section class="setbox"><h3 class="h3">🏅 퀘스트 배지 <small class="h-note">전설·신화를 잡을 때마다 하나씩</small></h3>${badgeCase()}</section>`;
  speak(LINES.pokeDex);
  $$('[data-tab]', app).forEach((b) => b.addEventListener('click', () => { dexTab = b.dataset.tab; sfx('pop'); SCREENS.dex(); }));
  $$('.pcard[data-id]', app).forEach((c) => c.addEventListener('click', () => playCry(+c.dataset.id)));
  $('[data-go-mode]', app)?.addEventListener('click', (e) => go(e.target.dataset.goMode));
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
  const toNext = 10 - (S.earned % 10);
  const all = [...ISLANDS.filter((s) => !['book', 'dict', 'dex'].includes(s.id)), ...DICTATION.map((d) => ({ id: d.id, icon: '🎧', name: `받아쓰기 ${d.name}` }))];
  app.innerHTML = `
    <h2 class="h">🏆 스티커북</h2>
    ${bubble(have < STICKERS.length ? LINES.bookLeft(toNext) : LINES.bookAll)}
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${S.earned % 10}">
      <span style="width:${(S.earned % 10) * 10}%"></span><b>⭐ ${S.earned % 10} / 10</b></div>
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
    <h2 class="h">⚙️ 설정 <small class="h-note">어른용</small></h2>
    ${familyBox()}
    <h3 class="h3">🔊 목소리</h3>
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
  wireFamily();
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

/* ---------- 👨‍👩‍👧 아이 프로필 · 가족 계정 ---------- */
function paintWho() {
  const me = STORE.current();
  $('#whoAvatar').textContent = me.avatar;
  $('#whoName').textContent = me.name;
}
function switchTo(id) {
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
      <small>⭐ ${st.earned ?? st.stars ?? 0} · 📖 ${(st.dex || []).length}</small></button>`;
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
        <small>⭐ 모은 별 ${st.earned ?? st.stars ?? 0} · 📖 도감 ${(st.dex || []).length}/${POKEMON.length} · 🏅 배지 ${st.badges || 0} · 평균 최고 점수 ${avg == null ? '—' : avg + '점'}</small></div>
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
})();
