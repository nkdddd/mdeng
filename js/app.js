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
  /* stars = 쓸 수 있는 별(포획 타임에 걸고, 카드 강화에 써요), earned = 지금까지 모은 별 전체 */
  if (S.earned == null) S.earned = S.stars;
  migrateEvo();
}
/* 🧬 진화: 같은 모습 EVO_NEED마리가 모이면 다음 단계 한 마리로 → [[전, 후], …]
 * one: 아이가 눌러서 한 단계만 (예전 기록 정리는 한꺼번에) */
function evolveFrom(name, one) {
  const out = [];
  let n = name;
  for (;;) {
    const line = EVOLUTION.find((l) => l.includes(n));
    const next = line && line[line.indexOf(n) + 1];
    if (!next || (S.catches[n] || 0) < EVO_NEED) return out;
    while (S.catches[n] >= EVO_NEED) { /* 예전 기록은 한꺼번에: 캐터피 9 → 단데기 3 → 버터플 1 */
      S.catches[n] -= EVO_NEED;
      S.catches[next] = (S.catches[next] || 0) + 1;
      out.push([n, next]);
      if (one) break;
    }
    if (!S.catches[n]) delete S.catches[n];
    S.dex = S.dex || [];
    if (!S.dex.includes(next)) S.dex.push(next);
    if (one) return out;
    n = next;
  }
}
/* 진화 규칙이 생기기 전에 잡은 포켓몬도 3마리씩 모아 진화시켜요 (처음 한 번만) */
function migrateEvo() {
  if (S.evoV) return;
  S.catches = S.catches || {};
  (S.dex || []).forEach((n) => {
    const m = POKEMON.find((x) => x[0] === n);
    if (m && 'cr'.includes(m[5]) && !S.catches[n]) S.catches[n] = 1; /* 몇 번 잡았는지 모르면 한 마리 */
  });
  EVOLUTION.forEach((line) => line.forEach((n) => evolveFrom(n)));
  S.evoV = 1;
  STORE.save(S);
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

/* 효과음은 js/sfx.js (실로폰·바스락·몬스터볼 소리 …) */
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
function paintStars() { $('#starCount').textContent = S.stars; }
function addStar(n = 1) {
  S.stars += n;
  S.earned += n;
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
  { id: 'dex',   icon: '📖', name: '포켓몬 도감', sub: '공부하면 포켓몬을 만나요!', tone: 'poke' },
  { id: 'dict',  icon: '🎧', name: '받아쓰기 섬', sub: '듣고 쓰기',          tone: 't1' },
  { id: 'josa',  icon: '🧩', name: '조사 마을',   sub: '이·가, 을·를',       tone: 't2' },
  { id: 'vowel', icon: '🦀', name: 'ㅐㅔ 바닷가', sub: '개 🐶 게 🦀',         tone: 't3' },
  { id: 'space', icon: '✂️', name: '띄어쓰기 숲', sub: '어디서 띄울까?',     tone: 't4' },
  { id: 'sound', icon: '🔍', name: '소리 탐정',   sub: '소리랑 글자가 달라!', tone: 't5' },
  { id: 'book',  icon: '🎒', name: '포켓몬 가방', sub: '잡은 포켓몬',        tone: 't6' },
  { id: 'friends', icon: '🤝', name: '친구 광장', sub: '카드 대결 · 카드 시장', tone: 'friends' },
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
  return `<span class="diff-tag d${d}" title="${D.name}: 정답마다 별 ${D.stars}개, 희귀 포켓몬 ${Math.round(D.rare * 100)}%부터">${diffStars(d)} <small>정답 ⭐${D.stars}</small></span>`;
}
/* ---------- 🗺️ 지도 ---------- */
function dexHint() {
  const q = questNow();
  const have = (S.dex || []).filter((n) => POKE_BY[n]).length;
  if (packCount()) return `🎴 뜯을 카드팩이 ${packCount()}개 있어요!`;
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
          <span class="i-sub">${s.id === 'dex' ? dexHint() : s.id === 'friends' ? friendsHint() : s.sub}</span>
          ${DIFFICULTY[s.id] ? diffTag(s.id) : s.id === 'dict' ? '<span class="diff-tag">★★~★★★★</span>' : ''}
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
      <div class="fin-top">
        <div class="stamp ${great ? '' : 'soft'}">${great ? '참<br>잘했어요' : '잘<br>했어요'}</div>
        <div class="fin-sum">
          <h2>${total}문제 중에 <b>${score}</b>개 맞혔어요!</h2>
          ${extra && extra.stars ? `<p class="finish-stars" aria-label="별 ${extra.stars.gained}개 받음">⭐ <b>+${extra.stars.gained}</b>${extra.stars.bonus ? ` <small>(다 맞힘 보너스 +${extra.stars.bonus})</small>` : ''}</p>` : ''}
          <p class="diff-note">${diffStars(diffOf(key))} ${DIFF_INFO[diffOf(key)].name}</p>
        </div>
      </div>
      ${extra && extra.caught && extra.caught.length ? `<div class="caught-row" aria-label="이번에 잡은 포켓몬"><small>이번에 잡은 포켓몬</small>${extra.caught.map((q) => `<span class="mini">${artImg(q.m, q.shiny)}<small>${q.name}</small></span>`).join('')}</div>` : ''}
      ${extra && extra.badge ? `<div class="badge-won"><span class="badge got big" style="--bc:${extra.badge[2]}"><i>${extra.badge[1]}</i></span><p><b>${extra.badge[0]}</b>를 받았어요!</p></div>` : ''}
      <div class="fin-grid">
        ${packCount() ? `<button class="pack-cta" id="toPacks">${packArt(packList()[0].k, packList()[0].p)}<span><b>🎴 카드팩 뜯기!</b><small>${packCount()}팩이 기다려요</small></span></button>` : ''}
        ${questPanel(false)}
      </div>
      <div class="row">
        <button class="btn primary" id="again">🔁 한 번 더</button>
        <button class="btn" id="toDex">📖 도감</button>
        <button class="btn" id="toMap">🗺️ 지도로</button>
      </div>
    </div>`;
  if (great) { confetti(); sfx('star'); }
  speak([LINES.score(total, score), ...(extra && extra.stars && extra.stars.bonus ? [LINES.perfect(extra.stars.bonus)] : []), great ? LINES.finishGreat : LINES.finishSoso,
    ...(extra && extra.badge ? [LINES.badge(extra.badge[0])] : [])]);
  $('#again').onclick = again;
  $('#toDex').onclick = () => go('dex');
  $('#toMap').onclick = () => go('home');
  $('#toPacks')?.addEventListener('click', () => { sfx('pop'); go('packs', () => go('home')); });
}

/* 문제 풀이 틀: items를 하나씩 render로 넘기고 끝나면 결과 화면 */
/* 1·2학년 받아쓰기(js/grade.js) 단계의 난이도 */
GRADE_DICT.forEach((l) => { DIFFICULTY[l.id] = l.diff; });
const diffOf = (key) => DIFFICULTY[key] || 2;
const diffStars = (d) => '★'.repeat(d) + '☆'.repeat(4 - d);
function runQuiz(key, items, render) {
  let i = 0, score = 0, streak = 0, maxStreak = 0, lastOk = false, gained = 0;
  const D = DIFF_INFO[diffOf(key)];
  const seen = []; /* 이번 판에 만난 포켓몬 */
  const next = () => {
    if (i >= items.length) {
      /* 다 맞히면 난이도만큼 보너스 별 */
      const bonus = score === items.length ? D.bonus : 0;
      if (bonus) addStar(bonus);
      return endRound(key, score, items.length, maxStreak, seen, () => go(key, true), { gained: gained + bonus, bonus });
    }
    app.innerHTML = '';
    render(items[i], i, items.length, (ok) => {
      lastOk = ok;
      if (!ok) { streak = 0; return; }
      score++; streak++; addStar(D.stars); gained += D.stars;
      maxStreak = Math.max(maxStreak, streak);
      if (streak >= 3) showCombo(streak);
    }, () => {
      i++;
      /* 정답 뒤에 가끔 풀숲이 흔들려요 (한 판에 최대 3마리, 한 마리도 못 만났으면 끝나기 전에 꼭) */
      const left = items.length - i;
      const want = lastOk && left > 0 && seen.length < ENCOUNTER_MAX
        && (Math.random() < 0.35 || (seen.length === 0 && left <= 2));
      if (want) {
        const e = rollWild(streak, seen, diffOf(key));
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

/* ---------- ⚡ 포켓몬: 공부 중에 만나고, 끝나면 잡아요 ---------- */
const TYPE_TONE = { 전기: 't3', 불꽃: 't1', 물: 't2', 풀: 't4', 에스퍼: 't6', 고스트: 't5', 벌레: 't4', 드래곤: 't5', 얼음: 't2' };
const POKE_BY = Object.fromEntries(POKEMON.map((m) => [m[0], m]));
const dexHas = (name) => (S.dex || []).includes(name);
const hasShiny = (name) => (S.shinies || []).includes(name);
const evoLine = (name) => EVOLUTION.find((l) => l.includes(name));
/* 가족의 지금 모습: 도감에 있는 가장 높은 단계 (아직 없으면 1단계) */
function evoNow(name) {
  const line = evoLine(name);
  if (!line) return name;
  let cur = line[0];
  line.forEach((n) => { if (dexHas(n)) cur = n; });
  return cur;
}
/* 다음 진화까지 모은 수: ●●○ */
const evoDots = (name) => `<span class="evo-dots" aria-hidden="true">${'●'.repeat(Math.min(EVO_NEED, (S.catches || {})[name] || 0)).padEnd(EVO_NEED, '○')}</span>`;
const canEvolve = (name) => !!evoNext(name) && ((S.catches || {})[name] || 0) >= EVO_NEED;
/* 🎬 진화 장면: 화면 가득 클로즈업 → 하얗게 빛나며 두 모습이 번갈아 → 번쩍! → 새 모습
 * from/to: 그림 HTML (포켓몬 그림이나 카드) */
async function evoCinema({ from, to, before, after, fromCry, toCry, card }) {
  const w = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 80) : ms));
  hush();
  const el = document.createElement('div');
  el.className = 'evo-cine';
  el.innerHTML = `<div class="evo-rays" aria-hidden="true"></div>
    <div class="evo-stage${card ? ' card' : ''}"><div class="evo-a">${from}</div><div class="evo-b">${to}</div></div>
    <p class="evo-cap" aria-live="polite">${before}</p><div class="evo-flash" aria-hidden="true"></div>
    <button class="btn primary big evo-ok" hidden>와! 멋지다 👏</button>`;
  document.body.appendChild(el);
  const A = $('.evo-a', el), B = $('.evo-b', el), stage = $('.evo-stage', el);
  await w(30);
  el.classList.add('in'); /* 어두워지면서 가까이 다가가요 */
  if (fromCry) playCry(fromCry);
  speak(before.replace(/<[^>]+>/g, ''));
  await w(1500);
  el.classList.add('glow');
  sfx('evolve');
  await w(1000);
  /* 두 모습이 점점 빠르게 번갈아 */
  let t = 480, flip = false;
  while (t > 45) {
    flip = !flip;
    A.style.opacity = flip ? 0 : 1;
    B.style.opacity = flip ? 1 : 0;
    stage.style.transform = `scale(${flip ? 1.08 : 0.94})`;
    if (flip) sfx('click');
    await w(t);
    t *= 0.8;
  }
  A.style.opacity = 0; B.style.opacity = 1; stage.style.transform = '';
  el.classList.add('burst');
  sfx('catch');
  await w(420);
  el.classList.remove('glow');
  el.classList.add('reveal');
  confetti();
  if (toCry) playCry(toCry);
  $('.evo-cap', el).innerHTML = after;
  setTimeout(() => speak(after.replace(/<[^>]+>/g, '')), 600);
  const ok = $('.evo-ok', el);
  await w(900);
  ok.hidden = false;
  ok.focus({ preventScroll: true });
  await new Promise((r) => { ok.onclick = r; });
  el.classList.add('out');
  await w(350);
  el.remove();
}
/* 아이가 눌러서 포켓몬 진화 (한 단계) → 새 이름 */
async function evolvePokemon(name) {
  if (!canEvolve(name)) return null;
  const [[a, b]] = evolveFrom(name, true);
  save();
  const ma = POKE_BY[a], mb = POKE_BY[b];
  await evoCinema({
    from: artImg(ma), to: artImg(mb), fromCry: ma[3], toCry: mb[3],
    before: `어라…? <b>${esc(a)}</b>의 모습이…!`,
    after: `축하해! <b>${esc(a)}</b>${josaPick(a, ['은', '는'])} <b>${esc(b)}</b>${ro(b)} 진화했다! 🎉`,
  });
  return b;
}
const evoNext = (name) => { const l = evoLine(name); return l && l[l.indexOf(name) + 1]; };
const ro = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c % 28 && c % 28 !== 8 ? '으로' : '로'; };
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
  const isDict = /^(d\d|s\d+|g\d+)$/.test(key); /* 학교 시험·1·2학년 받아쓰기도 받아쓰기로 쳐요 */
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
function rollWild(streak, seen, diff) {
  const caughtBig = (S.dex || []).some((n) => POKE_BY[n] && 'lms'.includes(POKE_BY[n][5]));
  /* 어려운 섬일수록, 연속 정답이 길수록 희귀 확률이 올라가요 (예: 쉬움 0연속 8% · 도전 3연속 65%, 최대 75%) */
  const grade = Math.random() < Math.min(0.75, DIFF_INFO[diff].rare + 0.1 * streak) ? 'r' : 'c';
  /* 풀숲에는 가족마다 지금 모습만 나와요 (파이리 → 리자드를 얻으면 리자드가 나와요) */
  const now = (g) => POKEMON.filter((m) => m[5] === g && evoNow(m[0]) === m[0] && !seen.some((e) => e.name === m[0]));
  const pool = now(grade).length ? now(grade) : now(grade === 'r' ? 'c' : 'r');
  const fresh = pool.filter((m) => !dexHas(m[0]));
  const m = pick(fresh.length && Math.random() < 0.7 ? fresh : pool);
  /* ✨ 시크릿(이로치)은 전설·신화를 잡은 뒤에만, 연속 정답일수록 잘 나와요 */
  const shiny = caughtBig && Math.random() < (streak >= 5 ? 0.12 : 0.04);
  return { m, name: m[0], id: m[3], type: m[2], grade: m[5], genus: m[4], shiny, diff };
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
  sfx('rustle');
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
function endRound(key, score, total, maxStreak, seen, again, stars) {
  const pct = Math.round((score / total) * 100);
  const notes = checkQuest(key, pct, maxStreak);
  const list = seen.slice();
  const q = questNow();
  if (S.qready && q) {
    const m = POKE_BY[q.p];
    list.push({ m, name: m[0], id: m[3], type: m[2], grade: m[5], genus: m[4], shiny: false, legend: true, diff: diffOf(key) });
  }
  const done = (caught, badge) => finish(key, score, total, again, { caught, notes, badge, stars });
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
      ${bubble(q.legend ? LINES.bigAppear(bigName, N, subj) : LINES.throwAsk, 'tight')}
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
      $('#betBox').hidden = true;
      $('#betNote').hidden = true;
      const tip = $('.say', app);
      if (tip) tip.hidden = true;
      sfx('throw');
      await run(ball, [
        { transform: 'translate(0, 0) rotate(0) scale(1)' },
        { transform: `translate(${(dx + off) * 0.5}px, ${dy - 90}px) rotate(-400deg) scale(.85)`, offset: 0.55 },
        { transform: `translate(${dx + off}px, ${dy}px) rotate(-720deg) scale(.7)` },
      ], { duration: 650, easing: 'cubic-bezier(.3,.6,.5,1)' });

      if (!hit) {
        sfx('miss');
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
        field.classList.add('done'); /* 휴대폰에서는 풀밭을 작게 접어 결과가 한 화면에 보이게 */
        /* 전설은 사라지지 않고 다음 판에 다시 나와요 */
        msg.innerHTML = `<b class="missed">💨 ${LINES.fled(N, subj)}</b>${q.legend ? `<small>${LINES.legendAway}</small>` : ''}`;
        speak([LINES.missed, LINES.fled(N, subj), ...(q.legend ? [LINES.legendAway] : [])]);
      } else {
        field.classList.add('flashing');
        sfx('hit');
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
          sfx('wobble');
          await run(ball, [
            { transform: `translate(${dx}px, ${dy + 60}px) rotate(0deg) scale(.7)` },
            { transform: `translate(${dx}px, ${dy + 60}px) rotate(-22deg) scale(.7)`, offset: 0.3 },
            { transform: `translate(${dx}px, ${dy + 60}px) rotate(22deg) scale(.7)`, offset: 0.7 },
            { transform: `translate(${dx}px, ${dy + 60}px) rotate(0deg) scale(.7)` },
          ], { duration: 520, easing: 'ease-in-out' });
          await wait(260);
        }
        const isNew = addDex(N);
        S.catches = S.catches || {};
        S.catches[N] = (S.catches[N] || 0) + 1;
        save();
        if (q.shiny && !hasShiny(N)) { S.shinies = [...(S.shinies || []), N]; save(); }
        if (q.legend) badge = questCaught();
        const packKind = q.legend || q.shiny || 'lms'.includes(q.grade) ? 'l' : 'b';
        addPack(packKind, N, q.diff);
        caught.push(q);
        ball.classList.add('locked');
        field.classList.add('done');
        sfx('catch');
        confetti();
        msg.innerHTML = `<b>딸깍! ${N}${obj} 잡았다!</b>`;
        $('#after').innerHTML = `
          <div class="card-reveal">${pokeCard(q.m, q.shiny)}</div>
          ${isNew ? `<p class="small-note">📖 새 카드! 도감에 ${N}${subj} 등록됐어요.</p>` : ''}
          ${!q.legend && canEvolve(N) ? `<button class="btn primary evo-cta" id="evoNow">🧬 ${N} ${EVO_NEED}마리가 모였어요! 눌러서 진화!</button>`
            : evoNext(N) ? `<p class="small-note">🧬 ${esc(evoNext(N))}까지 ${evoDots(N)} ${S.catches[N]}/${EVO_NEED}</p>` : ''}
          <p class="pack-got">🎴 ${PACK_ODDS[packKind].name} 획득!</p>`;
        speak([LINES.caught(N, obj), LINES.packGot, ...(!q.legend && canEvolve(N) ? [LINES.canEvolve(N)] : [])]);
        $('#evoNow')?.addEventListener('click', async (e) => {
          e.currentTarget.remove();
          const b = await evolvePokemon(N);
          if (!b) return;
          const rv = $('#after .card-reveal');
          if (rv) rv.innerHTML = pokeCard(POKE_BY[b]);
          rv?.insertAdjacentHTML('afterend', `<p class="small-note">✨ ${esc(b)}${ro(b)} 진화! 📖 도감에 ${esc(b)} 등록</p>`);
        });
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
    <div class="row">
      <button class="btn primary" id="toPacks">🎴 카드팩 뜯기 (${packCount()})</button>
      <button class="btn" id="toAlbum">🗂️ 카드 앨범 (${cardCount()}종)</button>
    </div>
    ${questPanel(true)}
    <div class="dex-tabs" role="tablist">${tabs.map(([g, label, have, all]) =>
      `<button role="tab" aria-selected="${dexTab === g}" data-tab="${g}" class="g${g}">${label}<small>${have}${all != null ? `/${all}` : ''}</small></button>`).join('')}</div>
    <div class="pdex">${cards}</div>
    <section class="setbox"><h3 class="h3">🏅 퀘스트 배지 <small class="h-note">전설·신화를 잡을 때마다 하나씩</small></h3>${badgeCase()}</section>`;
  speak(LINES.pokeDex);
  $$('[data-tab]', app).forEach((b) => b.addEventListener('click', () => { dexTab = b.dataset.tab; sfx('pop'); SCREENS.dex(); }));
  $$('.pcard[data-id]', app).forEach((c) => c.addEventListener('click', () => playCry(+c.dataset.id)));
  $('[data-go-mode]', app)?.addEventListener('click', (e) => go(e.target.dataset.goMode));
  $('#toPacks').onclick = () => go('packs');
  $('#toAlbum').onclick = () => go('album');
};

/* ---------- 🎴 카드팩 · 카드 앨범 ---------- */
/* 카드팩 = [{ k: 'b'|'l', p: 잡은 포켓몬 이름 }] — 예전 기록({ b: 2, l: 1 })은 이름 없는 팩으로 바꿔요 */
function packList() {
  if (!Array.isArray(S.packs)) {
    const old = S.packs || {};
    S.packs = [...Array(old.l || 0).fill(0).map(() => ({ k: 'l', p: null })), ...Array(old.b || 0).fill(0).map(() => ({ k: 'b', p: null }))];
  }
  return S.packs;
}
const packCount = () => packList().length;
const hasGlowPack = () => packList().some((x) => x.k === 'l');
function addPack(kind, name, diff) {
  packList().push({ k: kind, p: name, d: diff || 2 });
  save();
}
const cardCount = () => Object.keys(S.cards || {}).length;
const cardLv = (id) => (S.cardLv || {})[id] || 0;
const lvStars = (lv) => '★'.repeat(lv) + '☆'.repeat(UPGRADE_COST.length - lv);
/* ♻️ 바꿀 수 있는 일반 카드: 강화하지 않은 일반 카드 (겹친 카드도 한 장씩 셈) */
function tradeable() {
  return Object.entries(S.cards || {}).filter(([id]) => CARD_BY[id] && CARD_BY[id][5] === 'n' && !cardLv(id));
}
const tradeCount = () => tradeable().reduce((a, [, n]) => a + n, 0);
/* 일반 카드 10장을 내고 상위 카드 뽑기권 한 장. 겹친 카드부터 써요 */
function tradeCommons() {
  let left = TRADE_COUNT;
  const list = tradeable().sort((a, b) => b[1] - a[1]);
  for (const [id] of list) { while (left && S.cards[id] > 1) { S.cards[id]--; left--; } }
  for (const [id] of list) { if (left && S.cards[id] === 1) { delete S.cards[id]; left--; } }
  packList().push({ k: 'x', p: null, d: 2 });
  save();
}
/* +5 카드가 바뀔 상위 카드: 같은 포켓몬 카드 먼저, 없으면 진화 가족 카드.
 * 바로 위 등급부터 찾아요 (일반 → 레어 → 아트 레어 → 슈퍼 레어 → 스페셜) */
const CLASS_ORDER = 'nrasu';
function evolveTarget(c) {
  const up = CLASS_ORDER.slice(CLASS_ORDER.indexOf(c[5]) + 1);
  for (const [k, how] of [[8, 'mon'], [9, 'family']]) {
    if (!c[k]) continue;
    for (const cls of up) {
      const list = (CARD_POOL[cls] || []).filter((d) => d[k] === c[k] && d[0] !== c[0]);
      if (list.length) return { cls, list, how };
    }
  }
  return null;
}
/* 강화한 카드 한 장이 상위 카드로 바뀌어요. 겹친 카드는 강화 전(+0)으로 남아요 */
function evolveCard(c, target) {
  const next = pick(target.list);
  S.stars -= EVOLVE_COST;
  if (--S.cards[c[0]] <= 0) delete S.cards[c[0]];
  delete S.cardLv[c[0]];
  S.cards[next[0]] = (S.cards[next[0]] || 0) + 1;
  save();
  paintStars();
  return next;
}
/* 카드 목록(js/cards.js, 약 1.3MB)은 처음 필요할 때 한 번만 불러와요 */
let cardsLoading = null;
function loadCards() {
  if (window.CARDS) return Promise.resolve();
  if (!cardsLoading) {
    cardsLoading = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'js/cards.js';
      s.onload = () => {
        window.CARD_BY = Object.fromEntries(window.CARDS.map((c) => [c[0], c]));
        window.CARD_POOL = {};
        window.CARDS.forEach((c) => { (window.CARD_POOL[c[5]] = window.CARD_POOL[c[5]] || []).push(c); });
        ok();
      };
      s.onerror = () => { cardsLoading = null; no(new Error('카드 목록을 불러오지 못했어요')); };
      document.head.appendChild(s);
    });
  }
  return cardsLoading;
}
/* 잡은 포켓몬과 관련된 카드 중에서 한 장:
 * 그 포켓몬 카드(3배) · 진화 가족 카드 → 없으면 비슷한 포켓몬 카드(전설끼리, 또는 같은 타입) → 그래도 없으면 아무 카드.
 * 등급은 팩 확률로 먼저 정하되, 그 포켓몬 카드에 있는 등급 중에서만 골라요 */
function drawCard(kind, name, diff) {
  const rel = (name && CARD_REL[name]) || [[], [], []];
  const weighted = [];
  rel[0].forEach((i) => weighted.push([CARDS[i], 3, 'exact']));
  rel[1].forEach((i) => weighted.push([CARDS[i], 1, 'family']));
  rel[2].forEach((i) => weighted.push([CARDS[i], 1, 'similar']));
  if (!weighted.length) CARDS.forEach((c) => weighted.push([c, 1, 'any']));
  /* 어려운 섬에서 잡은 포켓몬의 팩일수록 레어 이상 카드가 잘 나와요 */
  const boost = DIFF_INFO[diff || 2].card;
  const odds = Object.fromEntries(Object.entries(PACK_ODDS[kind]).map(([c, v]) => [c, c === 'n' || c === 'name' ? v : v * boost]));
  const present = [...new Set(weighted.map((w) => w[0][5]))];
  let classes = present.filter((c) => odds[c] > 0);
  if (!classes.length) classes = present; /* 빛나는 팩인데 일반 카드뿐이면 그중에서 */
  const weightOf = (c) => odds[c] || 1;
  let roll = Math.random() * classes.reduce((a, c) => a + weightOf(c), 0);
  const cls = classes.find((c) => (roll -= weightOf(c)) < 0) || classes[0];
  const inClass = weighted.filter((w) => w[0][5] === cls);
  let r = Math.random() * inClass.reduce((a, w) => a + w[1], 0);
  const hit = inClass.find((w) => (r -= w[1]) < 0) || inClass[0];
  return { card: hit[0], how: hit[2] };
}
/* 어떤 카드인지 알려 주는 한 줄 */
function relLine(name, how, card) {
  if (!name || how === 'any') return '';
  if (how === 'exact') return `🎯 ${esc(name)} 카드예요!`;
  if (how === 'family') return `👪 ${esc(name)}의 진화 가족 카드예요!`;
  const m = POKE_BY[name];
  return 'lms'.includes(m[5]) ? `✨ ${esc(name)} 카드가 없어서, 다른 전설·신화 포켓몬 카드가 나왔어요!`
    : `✨ ${esc(name)} 카드가 없어서, 같은 ${esc(m[2])} 타입 포켓몬 카드가 나왔어요!`;
}
const cardImgUrl = (c) => CARD_IMG + c[6];
const cardDetailUrl = (c) => 'https://pokemoncard.co.kr/cards/detail/' + c[0];
const classChip = (cls) => `<span class="class-chip c${cls}">${CARD_CLASS[cls].icon} ${CARD_CLASS[cls].name}</span>`;
/* 카드 그림. 못 불러오면 이름이 적힌 카드로 바꿔요 */
const cardFace = (c, lazy, lv = cardLv(c[0])) => `<span class="tcg c${c[5]}${lv ? ` lv lv${lv}` : ''}">${lv ? `<i class="lv-badge">+${lv}</i>` : ''}<img class="cimg" src="${cardImgUrl(c)}" alt="${esc(c[1])} 카드"${lazy ? ' loading="lazy"' : ''} referrerpolicy="no-referrer" data-name="${esc(c[1])}" data-kind="${esc(c[2])}"></span>`;
/* 🌀 카드를 옆으로 밀면 회전문처럼 빙글빙글 (놓으면 관성으로 돌다가 앞면에서 멈춰요) */
function makeSpin(tcg) {
  if (!tcg || tcg.closest('.spin3d')) return;
  const wrap = document.createElement('div');
  wrap.className = 'spin3d';
  const rot = document.createElement('div');
  rot.className = 'spin-rot';
  tcg.replaceWith(wrap);
  wrap.appendChild(rot);
  rot.appendChild(tcg);
  tcg.classList.add('spin-front');
  rot.insertAdjacentHTML('beforeend', `<div class="spin-back" aria-hidden="true"><span class="pack-ball">${ballSvg}</span></div><div class="spin-shine" aria-hidden="true"></div>`);
  wrap.insertAdjacentHTML('beforeend', '<small class="spin-hint">👆 옆으로 쓱 밀면 빙글빙글!</small>');
  let angle = 0, vel = 0, drag = null, raf = 0, lastX = 0, lastT = 0, half = 0;
  const paint = () => {
    rot.style.transform = `rotateY(${angle}deg)`;
    rot.style.setProperty('--shine', `${50 + Math.sin((angle * Math.PI) / 180) * 60}%`);
    const h = Math.floor((angle + 90) / 180);
    if (h !== half) { half = h; sfx('click'); } /* 반 바퀴마다 착착 */
  };
  wrap.addEventListener('pointerdown', (e) => {
    cancelAnimationFrame(raf);
    drag = { x: e.clientX, a: angle, moved: false };
    lastX = e.clientX; lastT = performance.now(); vel = 0;
    try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const t = performance.now();
    if (Math.abs(e.clientX - drag.x) > 4) { drag.moved = true; wrap.querySelector('.spin-hint')?.remove(); }
    angle = drag.a + (e.clientX - drag.x) * 0.9;
    vel = ((e.clientX - lastX) * 0.9 * 16) / Math.max(8, t - lastT);
    lastX = e.clientX; lastT = t;
    paint();
  });
  const release = () => {
    if (!drag) return;
    const flung = drag.moved && Math.abs(vel) > 6;
    drag = null;
    if (flung) sfx('whoosh');
    const step = () => {
      vel *= 0.975;
      angle += vel;
      if (Math.abs(vel) > 0.5) { paint(); raf = requestAnimationFrame(step); return; }
      /* 앞면으로 부드럽게 멈춰요 */
      const from = angle, to = Math.round(angle / 360) * 360, t0 = performance.now();
      const settle = (t) => {
        const k = Math.min(1, (t - t0) / 450), ease = 1 - Math.pow(1 - k, 3);
        angle = from + (to - from) * ease;
        paint();
        if (k < 1) raf = requestAnimationFrame(settle); else { angle = to % 360; paint(); }
      };
      raf = requestAnimationFrame(settle);
    };
    raf = requestAnimationFrame(step);
  };
  wrap.addEventListener('pointerup', release);
  wrap.addEventListener('pointercancel', release);
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('cimg')) return;
  const div = document.createElement('span');
  div.className = 'cimg-fallback';
  div.innerHTML = `<b>${esc(img.dataset.name)}</b><small>${esc(img.dataset.kind)}</small><i>🎴</i>`;
  img.replaceWith(div);
}, true);
/* 팩 겉면: 잡은 포켓몬 그림이 있으면 그걸, 없으면 몬스터볼 */
const packArt = (kind, name) => {
  const m = name && POKE_BY[name];
  return `<div class="pack p${kind}">
    <div class="pack-top"></div>
    <div class="pack-body"><span class="pack-ball${m ? ' mon' : ''}">${m ? artImg(m, false) : ballSvg}</span><b>${m ? `${esc(name)} 팩` : PACK_ODDS[kind].name}</b><small>POKÉMON CARD</small></div>
  </div>`;
};

/* 카드팩 뜯기: 톡톡톡 세 번 → 윗부분이 찢어지고 → 카드가 올라와 뒤집혀요 */
SCREENS.packs = (back) => {
  const packs = packList();
  const pk = packs[0]; /* 받은 순서대로 뜯어요 */
  const kind = pk && pk.k;
  const leave = () => (back ? back() : go('dex'));
  if (!pk) {
    app.innerHTML = `<h2 class="h">🎴 카드팩</h2>${bubble('카드팩이 없어요. 공부하면서 포켓몬을 잡으면 카드팩을 받아요!')}
      <div class="row"><button class="btn primary" id="album">🗂️ 카드 앨범</button><button class="btn" id="back">돌아가기</button></div>`;
    $('#album').onclick = () => go('album');
    $('#back').onclick = leave;
    return;
  }
  app.innerHTML = `
    <h2 class="h">🎴 카드팩 뜯기</h2>
    <p class="small-note">남은 팩 ${packCount()}개${hasGlowPack() ? ` · ✨ 빛나는 팩 ${packs.filter((x) => x.k === 'l').length}개` : ''}${pk.p ? ` · 이번 팩: ${esc(pk.p)}` : ''}</p>
    ${bubble(LINES.packTap, 'tight')}
    <div class="pack-stage" id="stage">
      ${packArt(kind, pk.p)}
      <div class="flip" id="flip" hidden><div class="flip-in"><div class="face back"><span class="pack-ball">${ballSvg}</span></div><div class="face front" id="front"></div></div></div>
      <p class="tap-hint" id="tapHint">👆 톡! 톡! 톡!</p>
    </div>
    <div class="reveal-info" id="info" aria-live="polite"></div>
    <div class="row" id="packBtns"></div>`;
  speak(LINES.packTap);
  let taps = 0, opening = false, card = null, how = '';
  loadCards().then(() => { ({ card, how } = drawCard(kind, pk.p, pk.d)); $('#front').innerHTML = cardFace(card); }).catch(() => {
    $('#info').innerHTML = '<p class="auth-error">⚠️ 카드 목록을 불러오지 못했어요. 인터넷을 확인하고 다시 해 주세요.</p>';
  });
  const pack = $('.pack', app);
  pack.addEventListener('click', async () => {
    if (opening) return;
    taps++;
    sfx(taps < 3 ? 'crinkle' : 'tear');
    pack.classList.remove('shake'); void pack.offsetWidth; pack.classList.add('shake', 't' + Math.min(taps, 3));
    if (taps < 3) return;
    opening = true;
    await loadCards().catch(() => {});
    if (!card) { opening = false; taps = 2; return; }
    /* 뜯은 순간 기록해요 (중간에 나가도 카드는 받아요) */
    packs.shift();
    S.cards = S.cards || {};
    S.cards[card[0]] = (S.cards[card[0]] || 0) + 1;
    const dup = S.cards[card[0]] > 1;
    save();
    $('#tapHint').hidden = true;
    pack.classList.add('torn');
    await new Promise((r) => setTimeout(r, reduceMotion ? 50 : 650));
    const flip = $('#flip');
    flip.hidden = false;
    flip.classList.add('rise');
    await new Promise((r) => setTimeout(r, reduceMotion ? 50 : 600));
    /* 카드 속 포켓몬 타입에 맞는 효과(번개·불꽃·물보라 …)가 가장 셀 때 카드가 뒤집혀요 */
    await CardFX.play(card[7], card[5], flip);
    flip.classList.add('turn', 'c' + card[5]);
    if (card[5] === 'u') setTimeout(confetti, 500);
    $('#info').innerHTML = `${classChip(card[5])}<b>${esc(card[1])}</b><small>${esc(card[2])} · ${esc(CARD_SETS[card[3]])}${card[4] ? ` · ${esc(card[4])}` : ''}</small>
      ${kind === 'x' ? '<p class="rel-line">♻️ 상위 카드 뽑기권으로 뽑은 카드예요!</p>' : relLine(pk.p, how, card) ? `<p class="rel-line">${relLine(pk.p, how, card)}</p>` : ''}
      ${dup ? `<p class="small-note">이미 가진 카드예요 (${S.cards[card[0]]}장)</p>` : '<p class="small-note">🗂️ 새 카드! 앨범에 넣었어요.</p>'}`;
    speak([LINES.cardClass[card[5]], card[1]]);
    $('#packBtns').innerHTML = `
      ${packCount() ? `<button class="btn primary big" id="more">🎴 한 팩 더<span class="wide-only"> 뜯기</span> (${packCount()})</button>` : ''}
      <button class="btn" id="album">🗂️ <span class="wide-only">카드 </span>앨범</button><button class="btn" id="back">돌아가기</button>`;
    $('#more')?.addEventListener('click', () => SCREENS.packs(back));
    $('#album').onclick = () => go('album');
    $('#back').onclick = leave;
  });
};

/* 🗂️ 카드 앨범 */
let albumTab = 'all';
SCREENS.album = () => {
  app.innerHTML = `<h2 class="h">🗂️ 카드 앨범</h2><p class="small-note">카드를 불러오는 중…</p>`;
  loadCards().then(() => {
    if (app.className !== 'screen-album') return;
    const mine = Object.entries(S.cards || {}).map(([id, n]) => [CARD_BY[id], n]).filter(([c]) => c)
      .sort((a, b) => 'usarn'.indexOf(a[0][5]) - 'usarn'.indexOf(b[0][5]));
    const count = (cls) => mine.filter(([c]) => cls === 'all' || c[5] === cls).length;
    const shown = mine.filter(([c]) => albumTab === 'all' || c[5] === albumTab);
    app.innerHTML = `
      <h2 class="h">🗂️ 카드 앨범 <small class="h-note">${mine.length}종 · 전체 ${CARDS.length}종</small></h2>
      ${bubble(LINES.album)}
      <div class="row"><button class="btn primary" id="toPacks">🎴 카드팩 뜯기 (${packCount()})</button><button class="btn" id="toDex">📖 도감</button></div>
      <section class="trade">
        <div class="trade-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${TRADE_COUNT}" aria-valuenow="${Math.min(tradeCount(), TRADE_COUNT)}">
          <span style="width:${Math.min(100, (tradeCount() / TRADE_COUNT) * 100)}%"></span><b>⚪ 일반 카드 ${tradeCount()} / ${TRADE_COUNT}</b></div>
        <p class="small-note">일반 카드 ${TRADE_COUNT}장을 모으면 <b>레어 이상</b>이 나오는 상위 카드 뽑기권으로 바꿀 수 있어요. 겹친 카드부터 쓰고, 강화한 카드는 쓰지 않아요.</p>
        <button class="btn primary" id="trade" ${tradeCount() >= TRADE_COUNT ? '' : 'disabled'}>♻️ ${TRADE_COUNT}장 바꾸고 뽑기!</button>
      </section>
      <div class="dex-tabs" role="tablist">${['all', ...Object.keys(CARD_CLASS)].map((k) => `<button role="tab" aria-selected="${albumTab === k}" data-tab="${k}">${k === 'all' ? '전체' : `${CARD_CLASS[k].icon} ${CARD_CLASS[k].name}`}<small>${count(k)}</small></button>`).join('')}</div>
      <div class="album">${shown.length ? shown.map(([c, n]) => `<button class="album-card" data-id="${c[0]}">${cardFace(c, true)}${n > 1 ? `<span class="dup">×${n}</span>` : ''}</button>`).join('')
        : '<p class="small-note">아직 카드가 없어요. 포켓몬을 잡고 카드팩을 뜯어 봐요!</p>'}</div>
      <div class="zoom" id="zoom" hidden></div>`;
    speak(LINES.album);
    $('#toPacks').onclick = () => go('packs', () => go('album'));
    $('#toDex').onclick = () => go('dex');
    $('#trade').onclick = () => {
      if (tradeCount() < TRADE_COUNT) return;
      tradeCommons();
      sfx('star');
      speak(LINES.trade);
      /* 방금 받은 뽑기권을 바로 뜯어요 */
      const packs = packList();
      packs.unshift(packs.pop());
      save();
      go('packs', () => go('album'));
    };
    $$('[data-tab]', app).forEach((b) => b.addEventListener('click', () => { albumTab = b.dataset.tab; sfx('pop'); SCREENS.album(); }));
    const openZoom = (c, quiet, from) => {
      const z = $('#zoom');
      const lv = cardLv(c[0]);
      const cost = UPGRADE_COST[lv];
      const evo = cost == null ? evolveTarget(c) : null;
      z.innerHTML = `<div class="zoom-in">${cardFace(c)}<div class="reveal-info">${classChip(c[5])}<b>${esc(c[1])}${lv ? ` <span class="lv-text">+${lv}</span>` : ''}</b>
        <small>${esc(c[2])} · ${esc(CARD_SETS[c[3]])}${c[4] ? ` · ${esc(c[4])}` : ''} · ${S.cards[c[0]]}장</small>
        <p class="lv-stars" aria-label="강화 ${lv}단계">${lvStars(lv)}</p>
        ${cost != null
          ? `<button class="btn primary" id="enhance" ${S.stars >= cost ? '' : 'disabled'}>⭐ ${cost}개로 +${lv + 1} 강화</button>
             <small>${S.stars >= cost ? `가진 별 ${S.stars}개` : `별이 ${cost - S.stars}개 더 필요해요 (가진 별 ${S.stars}개)`}</small>`
          : evo
            ? `<p class="rel-line">🌟 +5 최고 단계! 이제 ${evo.how === 'mon' ? `같은 ${esc(c[8])}` : `${esc(c[8])} 진화 가족`}의 ${classChip(evo.cls)} 카드로 바꿀 수 있어요</p>
               <button class="btn primary" id="evolve" ${S.stars >= EVOLVE_COST ? '' : 'disabled'}>🌟 ⭐ ${EVOLVE_COST}개로 상위 카드로 바꾸기</button>
               <small>${S.stars >= EVOLVE_COST ? `가진 별 ${S.stars}개` : `별이 ${EVOLVE_COST - S.stars}개 더 필요해요 (가진 별 ${S.stars}개)`}${S.cards[c[0]] > 1 ? ` · 겹친 ${S.cards[c[0]] - 1}장은 +0으로 남아요` : ''}</small>`
            : '<p class="rel-line">👑 최고 단계! 이 포켓몬에서 가장 높은 카드예요</p>'}
        ${from ? `<p class="rel-line">🌟 ${esc(from[1])} → ${esc(c[1])} 카드로 바뀌었어요!</p>` : ''}
        <a class="small-note" href="${cardDetailUrl(c)}" target="_blank" rel="noopener">카드 자세히 보기 ↗</a></div>
        <button class="btn" id="zoomClose">닫기</button></div>`;
      z.hidden = false;
      makeSpin($('.zoom-in > .tcg', z));
      if (!quiet) speak(c[1]);
      $('#zoomClose').onclick = () => { z.hidden = true; SCREENS.album(); };
      z.onclick = (e) => { if (e.target === z) { z.hidden = true; SCREENS.album(); } };
      $('#enhance')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (S.stars < cost) return;
        $('#enhance').disabled = true;
        S.stars -= cost;
        S.cardLv = S.cardLv || {};
        S.cardLv[c[0]] = lv + 1;
        save();
        paintStars();
        /* 강화할수록 효과도 세져요 */
        await CardFX.play(c[7], ['n', 'r', 'a', 's', 'u', 'u'][lv + 1], $('.zoom-in .tcg', z));
        sfx('star');
        openZoom(c, true);
        $('.zoom-in .tcg', z).classList.add('powerup');
        speak(lv + 1 >= UPGRADE_COST.length ? LINES.enhanceMax : LINES.enhance);
      });
      $('#evolve')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (S.stars < EVOLVE_COST) return;
        $('#evolve').disabled = true;
        const fromFace = cardFace(c, false, UPGRADE_COST.length);
        const next = evolveCard(c, evo);
        z.hidden = true;
        await evoCinema({
          card: true, from: fromFace, to: cardFace(next, false, 0),
          before: `어라…? <b>${esc(c[1])}</b> 카드가 빛나기 시작했어!`,
          after: `${CARD_CLASS[next[5]].icon} <b>${esc(next[1])}</b> 카드로 진화했어! 🎉`,
        });
        albumTab = 'all';
        z.hidden = false;
        openZoom(next, true, c);
        $('.zoom-in .tcg', z).classList.add('powerup');
      });
    };
    $$('.album-card', app).forEach((b) => b.addEventListener('click', () => openZoom(CARD_BY[b.dataset.id])));
  }).catch(() => {
    app.innerHTML = `<h2 class="h">🗂️ 카드 앨범</h2><p class="auth-error">⚠️ 카드 목록을 불러오지 못했어요. 인터넷을 확인하고 다시 해 주세요.</p>`;
  });
};

/* ---------- 🎧 받아쓰기 섬 ---------- */
/* 받아쓰기 섬: 칸이 많아서 묶음(탭)으로 나눠 보여 줘요. 마지막에 본 묶음을 기억해요 */
const DICT_TABS = [
  { id: 'prac', label: '🎧 연습', note: `단계마다 ${DICT_SIZE}문제씩`, list: () => DICTATION },
  { id: 'g1', label: '📚 1학년', note: `단계마다 ${DICT_SIZE}문제씩`, list: () => GRADE_DICT.filter((l) => l.grade === 1) },
  { id: 'g2', label: '📚 2학년', note: `단계마다 ${DICT_SIZE}문제씩`, list: () => GRADE_DICT.filter((l) => l.grade === 2) },
  { id: 'test', label: '📝 시험', note: '학교 받아쓰기 시험 1-2단계 · 급마다 10문제 차례대로', list: () => SCHOOL },
];
SCREENS.dict = (quiet) => {
  const tab = DICT_TABS.find((t) => t.id === S.dictTab) || DICT_TABS[0];
  const best = (id) => (S.best[id] ? `<span class="i-best">최고 ${S.best[id]}점</span>` : '');
  const tile = (lv) => tab.id === 'test'
    ? `<button class="level" data-id="${lv.id}"><span class="l-grade">${lv.n}급</span><span class="l-name">${lv.name}</span>${diffTag(lv.id)}${best(lv.id)}</button>`
    : `<button class="level" data-id="${lv.id}"><span class="l-icon">${lv.icon}</span><span class="l-name">${lv.name}</span>
        <span class="l-sub">${lv.grade ? `${esc(lv.desc)}` : `${lv.desc} · ${Math.min(DICT_SIZE, lv.items.length)}문제`}</span>${diffTag(lv.id)}${best(lv.id)}</button>`;
  app.innerHTML = `
    <h2 class="h">🎧 받아쓰기 섬</h2>
    ${bubble(LINES.dictBubble, 'tight')}
    <div class="dex-tabs dict-tabs" role="tablist">${DICT_TABS.map((t) => `<button role="tab" aria-selected="${t.id === tab.id}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
    <p class="small-note tab-note">${tab.note}</p>
    <div class="levels ${tab.id === 'test' ? 'school' : tab.id === 'prac' ? '' : 'grade'}">${tab.list().map(tile).join('')}</div>
    ${hasTTS ? '' : '<p class="notice">이 기기에서는 소리가 나오지 않아요. 문제 화면의 👀 어른용 버튼을 눌러 어른이 읽어 주세요.</p>'}`;
  $$('[data-tab]', app).forEach((b) => b.addEventListener('click', () => { S.dictTab = b.dataset.tab; save(); sfx('pop'); SCREENS.dict(true); }));
  $$('.level', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); dictLevel(b.dataset.id); }));
  if (quiet !== true) speak(LINES.dictBubble);
};

let inputMode = 'tiles';
function dictLevel(id) {
  const school = SCHOOL.find((l) => l.id === id);
  /* 학교 시험 연습은 시험처럼 10문제를 차례대로, 연습 단계는 5문제를 골라서 */
  const items = school ? school.items : shuffle([...DICTATION, ...GRADE_DICT].find((l) => l.id === id).items).slice(0, DICT_SIZE);
  runQuiz(id, items, (q, i, n, mark, next) => dictQuestion(q, i, n, mark, next));
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
    if (sw === w.replace(/ /g, '') || !un.includes(sw)) return;
    reasons.push(k === 'spell' || k === 'sais'
      ? { k, text: `<s>${esc(s)}</s>${josaPick(s, ['이', '가'])} 아니라 <b>${esc(w)}</b>${hasBatchim(w) ? '이에요' : '예요'}.` }
      : { k, text: `<b>${esc(w)}</b>${josaPick(w, ['을', '를'])} 소리 나는 대로 <b>[${esc(s)}]</b>${josaPick(s, ['이라고', '라고'])} 썼어요.` });
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
  app.classList.remove('dq-done');
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
    ${bubble(LINES.dictAsk, 'tight')}
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
    <div class="row check-row"><span id="padKeys"></span><button class="btn primary big" id="check">다 썼어요! ✔</button></div>
    <div class="explain" id="result" hidden></div>`;

  const paintAns = () => {
    $('#ans').innerHTML = cells(typed + '​') ;
    const last = $('#ans .cell:last-child');
    if (last) { last.textContent = ''; last.classList.add('cursor'); }
  };
  const paintPad = () => {
    $$('.mode', app).forEach((b) => b.setAttribute('aria-selected', b.dataset.m === inputMode));
    const pad = $('#pad');
    $('#padKeys').innerHTML = '';
    if (inputMode === 'keys') {
      pad.innerHTML = `<label class="sr" for="typed">여기에 써요</label>
        <input id="typed" class="typed" autocomplete="off" autocapitalize="off" spellcheck="false" lang="ko" placeholder="여기를 누르고 써요" value="${esc(typed)}">`;
      const inp = $('#typed');
      inp.addEventListener('input', () => { typed = inp.value; paintAns(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('#check').click(); });
      inp.focus();
    } else {
      pad.innerHTML = `<div class="tiles">${pieces.map((p, k) => `<button class="tile" data-k="${k}" ${p.used ? 'disabled' : ''}>${p.ch}</button>`).join('')}</div>`;
      /* 띄우기·지우기는 '다 썼어요' 옆에 (휴대폰에서 아래에 함께 붙어 있어요) */
      $('#padKeys').innerHTML = '<button class="btn" id="spc">␣ 띄우기</button><button class="btn" id="bk">⌫ 지우기</button>';
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
    const secrets = q.hints.map(([w, s, k]) => `<li><span class="t-icon">${TYPES[k].icon}</span><b>${esc(w)}</b>${s === w ? '' : k === 'spell' || k === 'sais' ? ` <s class="wrong">${esc(s)}</s> ✗` : ` → 소리 [${esc(s)}]`} <em>${TYPES[k].name}</em></li>`).join('');
    const secretBox = secrets ? `<p class="small-note">이 문장에 숨은 비밀</p><ul class="secrets">${secrets}</ul>` : '';
    if (ok) {
      $('#paper').innerHTML = cells(q.t);
      maru($('#paper'));
      confetti();
      res.innerHTML = `<p class="yay">딩동댕! 또박또박 잘 썼어요! ⭐</p>
        ${secretBox}
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
        ${secretBox}
        <div class="row"><button class="btn primary" id="retry">✏️ 다시 써 볼래요</button><button class="btn next">다음 ➜</button></div>`;
      speak([LINES.dictWrong, q.t]);
      $('#retry').onclick = () => {
        typed = ''; stack = []; pieces.forEach((p) => { p.used = false; });
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

/* ---------- 🎒 포켓몬 가방 ---------- */
SCREENS.book = () => {
  const all = [...ISLANDS.filter((x) => !['book', 'dict', 'dex', 'friends'].includes(x.id)), ...DICTATION.map((d) => ({ id: d.id, icon: '🎧', name: `받아쓰기 ${d.name}` })),
    ...GRADE_DICT.filter((d) => S.best[d.id] != null).map((d) => ({ id: d.id, icon: '📚', name: `${d.grade}학년 ${d.name}` })),
    ...SCHOOL.map((d) => ({ id: d.id, icon: '📝', name: `시험 ${d.n}급` }))];
  /* 가방에는 지금 가진 포켓몬만 (진화하면 3마리가 1마리로 바뀌어요) */
  const held = (n) => (S.catches || {})[n] || (dexHas(n) && 'lms'.includes(POKE_BY[n][5]) ? 1 : 0);
  const mine = POKEMON.filter((m) => held(m[0]) > 0).sort((a, b) => held(b[0]) - held(a[0]));
  app.innerHTML = `
    <h2 class="h">🎒 포켓몬 가방 <small class="h-note">${mine.reduce((a, m) => a + held(m[0]), 0)}마리</small></h2>
    ${bubble(mine.length ? LINES.bagBubble : LINES.bagEmpty)}
    <div class="bag">${mine.map((m) => `<button class="bag-mon g${m[5]}${hasShiny(m[0]) ? ' shiny' : ''}${canEvolve(m[0]) ? ' can-evo' : ''}" data-id="${m[3]}" data-name="${m[0]}"${canEvolve(m[0]) ? '' : ` data-say="${sayAttr(m[0])}"`}>
      ${canEvolve(m[0]) ? '<span class="evo-badge">🧬 진화!</span>' : ''}
      ${artImg(m, hasShiny(m[0]))}<b>${m[0]}</b>${held(m[0]) > 1 ? `<span class="dup">×${held(m[0])}</span>` : ''}
      ${evoNext(m[0]) ? `<small class="bag-evo" title="${esc(evoNext(m[0]))}까지">${evoDots(m[0])}</small>` : ''}</button>`).join('')}</div>
    <p class="small-note">🧬 같은 포켓몬을 ${EVO_NEED}마리 모으면 진화할 수 있어요! <b>🧬 진화!</b>가 붙은 포켓몬을 눌러 봐요.</p>
    <div class="row"><button class="btn primary" id="toAlbum">🗂️ 카드 앨범</button><button class="btn" id="toDex">📖 도감</button></div>
    <details class="bests-box"><summary class="h3">🏆 섬마다 최고 점수</summary>
    <ul class="bests">${all.map((x) => `<li><span>${x.icon} ${x.name}</span><b>${S.best[x.id] != null ? S.best[x.id] + '점' : '—'}</b></li>`).join('')}</ul></details>`;
  speak(mine.length ? LINES.bagBubble : LINES.bagEmpty);
  $$('.bag-mon', app).forEach((b) => b.addEventListener('click', async () => {
    if (b.classList.contains('can-evo')) { if (await evolvePokemon(b.dataset.name)) SCREENS.book(); return; }
    playCry(+b.dataset.id);
  }));
  $('#toAlbum').onclick = () => go('album');
  $('#toDex').onclick = () => go('dex');
};

/* ---------- 🤝 친구 광장: 친구 · ⚔️ 카드 대결 · 🏪 카드 시장 (js/social.js) ---------- */
function friendsHint() {
  if (!STORE.cloud.user) return '부모님 로그인이 필요해요';
  const list = SOCIAL.friendList();
  const req = list.filter((f) => f.incoming).length;
  const on = list.reduce((a, f) => a + f.kids.filter((k) => k.online).length, 0);
  return req ? `📩 친구 신청 ${req}개` : on ? `🟢 지금 온라인 친구 ${on}명` : '카드 대결 · 카드 시장';
}
/* 카드 한 장 내보내기·받기 (강화 단계도 함께) */
function takeCard(id) {
  const n = (S.cards || {})[id] || 0;
  if (!n) return null;
  let lv = 0;
  if (n <= 1) { lv = cardLv(id); delete S.cards[id]; if (S.cardLv) delete S.cardLv[id]; } else S.cards[id] = n - 1; /* 겹친 카드는 +0짜리를 보내요 */
  return { id, lv };
}
function giveCard(id, lv) {
  S.cards = S.cards || {};
  S.cards[id] = (S.cards[id] || 0) + 1;
  if (lv) { S.cardLv = S.cardLv || {}; S.cardLv[id] = Math.max(S.cardLv[id] || 0, lv); }
}
const cardInfo = (c, lv) => ({ id: c[0], name: c[1], cls: c[5], type: c[7] || '', lv: lv || 0 });
const kidInfo = () => { const p = STORE.current(); return { id: p.id, name: p.name, avatar: p.avatar }; };
const PRICE_HINT = { n: 2, r: 6, a: 12, s: 25, u: 50 };

/* 받을 것 정리: 이긴 카드·돌려받을 카드·판 값 (지금 공부하는 아이 것만) */
let battleId = null;
function settleSocial() {
  if (!SOCIAL.ready) return;
  const me = SOCIAL.uid, kid = STORE.current().id;
  S.social = S.social || { escrow: {}, done: {} };
  const book = S.social;
  let changed = false;
  const notes = [];
  for (const m of SOCIAL.matches()) {
    if (!m.kids || m.kids[me] !== kid) continue;
    const other = m.users.find((u) => u !== me);
    /* 이미 정리한 대결: 표시를 남기고, 둘 다 끝났으면 기록을 지워요 */
    if (book.done[m.id]) { const done = m.settled || {}; if (!done[me] || done[other]) SOCIAL.settled(m.id); continue; }
    const them = (m.who || {})[other] || { name: '친구' };
    const mine = book.escrow[m.id];
    const expired = m.status === 'invite' && !SOCIAL.fresh(m);
    if (m.status === 'done') {
      if (m.winner === me) {
        if (m.stake) {
          const got = m.picks[other];
          if (mine) giveCard(mine.id, mine.lv);
          giveCard(got.id, got.lv);
          notes.push(`⚔️ ${esc(them.name)}${josaPick(them.name, ['과', '와'])}의 대결에서 이겨서 <b>${esc(got.name)}</b> 카드를 받았어요!`);
        } else { S.stars += 1; S.earned += 1; notes.push(`🤝 ${esc(them.name)}${josaPick(them.name, ['과', '와'])}의 친선 대결에서 이겨서 ⭐1!`); }
      } else if (m.stake && mine) notes.push(`⚔️ ${esc(them.name)}에게 <b>${esc(mine.name)}</b> 카드를 보냈어요. 다음엔 이길 거야!`);
    } else if (m.status === 'cancel' || m.status === 'declined' || expired) {
      if (mine) giveCard(mine.id, mine.lv);
      if (expired && m.host === me) SOCIAL.cancel(m.id).catch(() => {});
    } else continue;
    delete book.escrow[m.id];
    book.done[m.id] = 1;
    changed = true;
    SOCIAL.settled(m.id);
  }
  for (const l of SOCIAL.myListings()) {
    if (l.sellerKid !== kid) continue;
    const key = 'L' + l.id;
    if (book.done[key]) { SOCIAL.removeListing(l.id); continue; }
    if (l.status === 'sold') {
      S.stars += l.price;
      notes.push(`🏪 ${esc(l.buyerName || '친구')}${josaPick(l.buyerName || '친구', ['이', '가'])} <b>${esc(l.card.name)}</b> 카드를 사서 별 ${l.price}개를 받았어요!`);
    } else if (l.status === 'cancel') giveCard(l.card.id, l.card.lv);
    else continue;
    book.done[key] = 1;
    changed = true;
    SOCIAL.removeListing(l.id);
  }
  if (!changed) return;
  const keys = Object.keys(book.done);
  if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((k) => delete book.done[k]);
  save();
  paintStars();
  /* 대결 화면에서 결과를 보고 있으면 알림은 그 화면이 보여 줘요 */
  notes.forEach((n, i) => setTimeout(() => { if (app.className !== 'screen-battle') toast(n, 3800); }, i * 3900));
}

/* 🎁 부모님이 부탁한 선물: 그 가족 계정(이메일)의 첫 번째 아이에게 한 번만 들어가요.
 * 이메일은 코드에 남기지 않고 SHA-256 해시로만 맞춰 봐요. 클라우드와 맞춘 뒤(synced)에 넣어서 다른 기기 기록을 덮지 않아요. */
const GIFTS = [
  {
    id: 'gift-2026-09-first', to: 'bb3a10b83767db61904d93849d0a0d50df6b0b3b641f43027c1fd78722cd7731',
    pokemon: ['리자몽', '거북왕', '이상해꽃', '라이츄', '망나뇽', '루카리오', '갸라도스', '팬텀', '개굴닌자', '피카츄'],
    shiny: ['피카츄'],
    cards: ['BS2024017136', 'BS2023015134', 'BS2025015246', 'BS2023001226', 'BS2024007090', 'BS2025015240', 'BS2019005057', 'BS2014001061', 'BS2017012051', 'BS2017010074'],
  },
];
let giftBusy = false;
async function claimGifts() {
  const u = STORE.cloud.user;
  if (giftBusy || !u || !u.email || !window.crypto || !crypto.subtle || STORE.cloud.status !== 'synced') return;
  const first = STORE.profiles()[0];
  if (!first || STORE.current().id !== first.id) return;
  const todo = GIFTS.filter((g) => !(S.gifts || {})[g.id]);
  if (!todo.length) return;
  giftBusy = true;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(u.email.trim().toLowerCase()));
    const h = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    for (const g of todo.filter((x) => x.to === h)) {
      S.gifts = { ...(S.gifts || {}), [g.id]: Date.now() };
      S.catches = S.catches || {};
      g.pokemon.forEach((n) => { addDexQuiet(n); S.catches[n] = (S.catches[n] || 0) + 1; });
      (g.shiny || []).forEach((n) => { if (!hasShiny(n)) S.shinies = [...(S.shinies || []), n]; });
      g.cards.forEach((id) => giveCard(id, 0));
      save();
      paintStars();
      await loadCards().catch(() => {});
      const el = sheet(`<p class="inv-av">🎁</p><p class="inv-t"><b>선물이 도착했어요!</b></p>
        <div class="gift-mons">${g.pokemon.map((n) => `<span class="mini">${artImg(POKE_BY[n], (g.shiny || []).includes(n))}<small>${n}</small></span>`).join('')}</div>
        <div class="album gift-cards">${g.cards.map((id) => window.CARD_BY && CARD_BY[id] ? `<span class="album-card">${cardFace(CARD_BY[id], true)}</span>` : '').join('')}</div>
        <p class="small-note">포켓몬 ${g.pokemon.length}마리 · 카드 ${g.cards.length}장이 가방과 앨범에 들어갔어요!</p>
        <button class="btn primary big" id="giftOk">와! 고마워요 🎉</button>`, 'wide');
      sfx('victory');
      confetti();
      setTimeout(confetti, 800);
      speak('선물이 도착했어! 멋진 포켓몬과 카드가 들어왔어!');
      $('#giftOk', el).onclick = () => { closeSheet(); if (app.className === 'screen-home') go('home'); };
    }
  } catch (e) { console.error(e); } finally { giftBusy = false; }
}
function addDexQuiet(name) { S.dex = S.dex || []; if (POKE_BY[name] && !S.dex.includes(name)) S.dex.push(name); }

/* 떠 있는 창 (대결 신청·카드 고르기·값 정하기) */
function sheet(html, cls = '') {
  closeSheet();
  const el = document.createElement('div');
  el.className = 'zoom sheet ' + cls;
  el.id = 'sheet';
  el.innerHTML = `<div class="zoom-in">${html}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el) closeSheet(); });
  document.body.appendChild(el);
  makeSpin($('.zoom-in > .tcg', el));
  return el;
}
const closeSheet = () => $('#sheet')?.remove();

/* 친구가 대결을 신청하면 어느 화면에서든 떠요 */
let inviteShown = null;
const dismissed = new Set();
function checkInvites() {
  if (!SOCIAL.ready) return;
  const me = SOCIAL.uid, kid = STORE.current().id;
  const m = SOCIAL.matches().find((x) => x.status === 'invite' && x.host !== me && x.kids[me] === kid && SOCIAL.fresh(x) && !dismissed.has(x.id));
  if (inviteShown && (!m || m.id !== inviteShown)) { if ($('#sheet.invite')) closeSheet(); inviteShown = null; }
  if (!m || inviteShown === m.id || app.className === 'screen-battle') return;
  inviteShown = m.id;
  const them = m.who[m.host];
  const el = sheet(`<p class="inv-av">${them.avatar}</p>
    <p class="inv-t"><b>${esc(them.name)}</b>${josaPick(them.name, ['이', '가'])} 카드 대결을 신청했어요!</p>
    <p class="small-note">${m.stake ? '🎴 카드 걸기 대결: 이기면 친구 카드를 가져오고, 지면 내 카드가 친구에게 가요.' : '🤝 친선 대결: 카드는 그대로, 이기면 ⭐1'}</p>
    <div class="row"><button class="btn primary" id="invYes">⚔️ 좋아!</button><button class="btn" id="invNo">다음에</button></div>`, 'invite');
  sfx('star');
  speak(`${them.name}${josaPick(them.name, ['이', '가'])} 카드 대결을 신청했어!`);
  $('#invYes', el).onclick = async () => {
    closeSheet(); inviteShown = null; dismissed.add(m.id);
    try { await SOCIAL.respond(m.id, true); go('battle', m.id); } catch (e) { toast('대결이 이미 끝났어요'); }
  };
  $('#invNo', el).onclick = () => { closeSheet(); inviteShown = null; dismissed.add(m.id); SOCIAL.respond(m.id, false).catch(() => {}); };
}

SOCIAL.on((what) => {
  if (what === 'matches' || what === 'listings') settleSocial();
  if (what === 'matches') checkInvites();
  if (app.className === 'screen-battle' && what === 'matches') renderBattle();
  const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
  if (app.className === 'screen-friends' && (what === 'friends' || what === 'listings') && !typing && !$('#sheet')) SCREENS.friends(null, true);
  if (app.className === 'screen-home' && what === 'friends') { const sub = $('[data-go="friends"] .i-sub'); if (sub) sub.textContent = friendsHint(); }
});
setInterval(() => { if (app.className === 'screen-friends' && friendsTab === 'fr' && !$('#sheet')) SCREENS.friends(null, true); checkInvites(); }, 20000);

let friendsTab = 'fr';
SCREENS.friends = (tab, quiet) => {
  if (tab) friendsTab = tab;
  const c = STORE.cloud;
  const head = '<h2 class="h">🤝 친구 광장</h2>';
  if (!c.enabled || !c.user) {
    app.innerHTML = `${head}${bubble('친구와 카드 대결을 하고 카드를 사고팔려면, 부모님이 가족 계정으로 로그인해야 해요.')}
      <div class="setbox"><p class="small-note">한 이메일(Google 계정)이 우리 가족 계정이에요. 로그인한 뒤 친구 부모님의 이메일로 친구를 맺어요.</p>
      ${c.enabled ? `<button class="btn primary" id="frSignIn" ${c.ready ? '' : 'disabled'}>👨‍👩‍👧 부모님 로그인</button>` : '<p class="small-note">가족 계정 설정(js/firebase-config.js)이 필요해요.</p>'}
      ${authError ? `<p class="auth-error" role="alert">⚠️ ${authError}</p>` : ''}</div>`;
    $('#frSignIn')?.addEventListener('click', async () => { await doSignIn(); if (app.className === 'screen-friends') SCREENS.friends(); });
    if (!quiet) speak('친구와 놀려면 부모님이 로그인해야 해요.');
    return;
  }
  if (!SOCIAL.ready) { SOCIAL.start(); app.innerHTML = `${head}<p class="small-note">친구 광장에 연결하는 중…</p>`; return; }
  app.innerHTML = `${head}
    <div class="dex-tabs dict-tabs" role="tablist">
      <button role="tab" data-ftab="fr" aria-selected="${friendsTab === 'fr'}">👫 친구 · ⚔️ 대결</button>
      <button role="tab" data-ftab="mk" aria-selected="${friendsTab === 'mk'}">🏪 카드 시장</button>
    </div>
    <div id="fbody"></div>`;
  $$('[data-ftab]', app).forEach((b) => b.addEventListener('click', () => { sfx('pop'); SCREENS.friends(b.dataset.ftab); }));
  if (friendsTab === 'mk') marketTab(quiet); else friendsBody(quiet);
};

let frMsg = '';
function friendsBody(quiet) {
  const box = $('#fbody');
  const list = SOCIAL.friendList();
  const ok = list.filter((f) => f.status === 'ok');
  const incoming = list.filter((f) => f.incoming);
  const outgoing = list.filter((f) => f.status === 'pending' && !f.incoming);
  box.innerHTML = `
    ${ok.length ? `<div class="fam-list">${ok.map((f) => `<div class="fam-card">
      <div class="fam-head"><b>${esc(f.name)}</b> <small>가족</small></div>
      <div class="fam-kids">${f.kids.length ? f.kids.map((k) => `<div class="fk${k.online ? ' on' : ''}">
        <span class="fk-av">${k.avatar}</span><span class="fk-name">${esc(k.name)}</span>
        <span class="fk-dot">${k.online ? '🟢 온라인' : '⚪ 쉬는 중'}</span>
        ${k.online ? `<button class="btn small primary" data-fight="${f.uid}|${k.id}">⚔️ 대결</button>` : ''}</div>`).join('') : '<p class="small-note">아직 아이가 없어요</p>'}</div>
    </div>`).join('')}</div>` : `${bubble('아직 친구가 없어요. 부모님께 친구를 맺어 달라고 해 봐요!', 'tight')}`}
    ${incoming.length ? `<div class="req-list">${incoming.map((f) => `<div class="req">📩 <span><b>${esc(f.name)}</b> <small>${esc(f.email)}</small><br>친구 신청이 왔어요</span>
      <button class="btn small primary" data-accept="${f.pid}">수락</button><button class="btn small" data-drop="${f.pid}">거절</button></div>`).join('')}</div>` : ''}
    <details class="parent-box"${ok.length ? '' : ' open'}><summary>👨‍👩‍👧 부모님: 친구 맺기</summary>
      <p class="small-note">우리 가족 계정: <b>${esc(SOCIAL.email)}</b><br>친구 부모님께 이 이메일을 알려 주고, 아래에 친구 부모님의 이메일을 써서 신청하세요. 상대 부모님이 수락하면 친구가 돼요.</p>
      <form id="addFriend" class="add-friend"><label class="sr" for="frEmail">친구 부모님 이메일</label>
        <input id="frEmail" class="typed small" type="email" inputmode="email" autocomplete="off" placeholder="친구 부모님 이메일">
        <button class="btn small primary" type="submit">친구 신청</button></form>
      <p class="small-note" id="frMsg" role="status">${frMsg}</p>
      ${outgoing.map((f) => `<div class="req">⏳ <span>${esc(f.email || f.name)}<br><small>수락을 기다려요</small></span><button class="btn small" data-drop="${f.pid}">취소</button></div>`).join('')}
      ${ok.map((f) => `<div class="req">👫 <span>${esc(f.name)} <small>${esc(f.email)}</small></span><button class="btn small" data-drop="${f.pid}" data-confirm="1">친구 끊기</button></div>`).join('')}
    </details>`;
  $$('[data-fight]', box).forEach((b) => b.addEventListener('click', () => { const [uid, kidId] = b.dataset.fight.split('|'); askFight(uid, kidId); }));
  $$('[data-accept]', box).forEach((b) => b.addEventListener('click', async () => { b.disabled = true; await SOCIAL.acceptFriend(b.dataset.accept).catch(() => toast('수락하지 못했어요')); sfx('star'); }));
  $$('[data-drop]', box).forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.confirm && b.textContent !== '정말 끊을까요?') { b.textContent = '정말 끊을까요?'; return; }
    b.disabled = true; await SOCIAL.removeFriend(b.dataset.drop).catch(() => toast('처리하지 못했어요'));
  }));
  $('#addFriend').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#frMsg');
    msg.textContent = frMsg = '찾는 중…';
    const MSG = {
      sent: '✉️ 친구 신청을 보냈어요. 상대 부모님이 수락하면 친구가 돼요.', accepted: '🎉 친구가 됐어요!', already: '이미 친구예요.',
      pending: '벌써 신청했어요. 수락을 기다려요.', self: '우리 가족 이메일이에요.', bad: '이메일을 다시 확인해 주세요.',
      notfound: '그 이메일로 로그인한 가족이 없어요. 친구 부모님이 먼저 이 앱에서 한 번 로그인해야 해요.',
    };
    try { frMsg = MSG[await SOCIAL.requestFriend($('#frEmail').value)] || ''; } catch (err) { console.error(err); frMsg = '⚠️ 신청하지 못했어요. Firestore 규칙(README "친구 광장")을 확인해 주세요.'; }
    if ($('#frMsg')) $('#frMsg').textContent = frMsg;
  });
  if (!quiet) speak(ok.some((f) => f.kids.some((k) => k.online)) ? '온라인 친구에게 카드 대결을 신청해 봐!' : '친구가 앱을 켜면 초록불이 들어와요.');
}

/* 대결 신청: 카드를 걸까, 친선으로 할까 */
function askFight(uid, kidId) {
  const f = SOCIAL.friendList().find((x) => x.uid === uid);
  const k = f && f.kids.find((x) => x.id === kidId);
  if (!k) return;
  if (!Object.keys(S.cards || {}).length) { toast('카드가 있어야 대결할 수 있어요. 카드팩을 뜯어 봐요!'); return; }
  const el = sheet(`<p class="inv-av">${k.avatar}</p><p class="inv-t"><b>${esc(k.name)}</b>${josaPick(k.name, ['과', '와'])} 대결!</p>
    <button class="btn primary" id="fStake">🎴 카드 걸기 대결<small>이기면 친구 카드를 가져와요 (지면 내 카드가 가요)</small></button>
    <button class="btn" id="fFriendly">🤝 친선 대결<small>카드는 그대로, 이기면 ⭐1</small></button>
    <button class="btn ghost" id="fClose">취소</button>`, 'fight');
  const send = async (stake) => {
    closeSheet();
    try { const id = await SOCIAL.invite(uid, kidInfo(), { id: k.id, name: k.name, avatar: k.avatar }, stake); sfx('pop'); go('battle', id); } catch (e) { console.error(e); toast('대결을 신청하지 못했어요'); }
  };
  $('#fStake', el).onclick = () => send(true);
  $('#fFriendly', el).onclick = () => send(false);
  $('#fClose', el).onclick = closeSheet;
}

/* ---------- ⚔️ 대결 화면 ---------- */
SCREENS.battle = (id) => {
  battleId = id;
  app.innerHTML = '<h2 class="h">⚔️ 카드 대결</h2><p class="small-note">카드를 불러오는 중…</p>';
  loadCards().then(() => { if (app.className === 'screen-battle' && battleId === id) renderBattle(); })
    .catch(() => { app.innerHTML = '<h2 class="h">⚔️ 카드 대결</h2><p class="auth-error">⚠️ 카드 목록을 불러오지 못했어요.</p>'; });
};
const battleCache = {}; /* 끝난 대결 기록은 곧 지워져서, 보고 있는 동안은 여기 남겨 둬요 */
function renderBattle() {
  if (!window.CARD_BY) return;
  const m = SOCIAL.match(battleId) || battleCache[battleId];
  if (m) battleCache[battleId] = m;
  const back = '<div class="row"><button class="btn primary" id="bBack">🤝 친구 광장으로</button></div>';
  const wireBack = () => { $('#bBack')?.addEventListener('click', () => go('friends', 'fr')); };
  if (!m) { app.innerHTML = `<h2 class="h">⚔️ 카드 대결</h2><p class="small-note">이 대결은 끝났어요.</p>${back}`; wireBack(); return; }
  const me = SOCIAL.uid, other = m.users.find((u) => u !== me);
  const mine = m.who[me], them = m.who[other];
  const top = `<h2 class="h">⚔️ 카드 대결</h2>
    <div class="vs"><span class="vs-kid">${mine.avatar}<b>${esc(mine.name)}</b></span><span class="vs-x">VS</span><span class="vs-kid">${them.avatar}<b>${esc(them.name)}</b></span></div>
    <p class="small-note center-note">${m.stake ? '🎴 카드 걸기 대결 · 이기면 친구 카드를 가져와요' : '🤝 친선 대결 · 카드는 그대로, 이기면 ⭐1'}</p>`;
  const quit = '<button class="btn ghost" id="bQuit">그만하기</button>';
  const wireQuit = () => { $('#bQuit')?.addEventListener('click', async () => { await SOCIAL.cancel(m.id).catch(() => {}); go('friends', 'fr'); }); };
  if (m.status === 'invite') {
    app.innerHTML = `${top}<div class="wait">⏳ <b>${esc(them.name)}</b>의 대답을 기다려요…</div><div class="row">${quit}</div>`;
    wireQuit();
    return;
  }
  if (m.status === 'declined' || m.status === 'cancel') {
    app.innerHTML = `${top}<div class="wait">${m.status === 'declined' ? `🙅 ${esc(them.name)}${josaPick(them.name, ['이', '가'])} 다음에 하재요.` : '대결을 그만했어요. 건 카드는 돌아와요.'}</div>${back}`;
    wireBack();
    return;
  }
  if (m.status === 'pick') {
    const myPick = (m.picks || {})[me];
    if (myPick) {
      const c = CARD_BY[myPick.id];
      app.innerHTML = `${top}<div class="bt-pick">${c ? cardFace(c, false, myPick.lv) : ''}<p>내 카드: <b>${esc(myPick.name)}</b> · ⚡ ${SOCIAL.power(myPick)}</p></div>
        <div class="wait">⏳ ${esc(them.name)}${josaPick(them.name, ['이', '가'])} 카드를 고르는 중…</div><div class="row">${quit}</div>`;
      wireQuit();
      return;
    }
    const owned = Object.keys(S.cards || {}).map((id) => CARD_BY[id]).filter(Boolean)
      .map((c) => ({ c, p: SOCIAL.power(cardInfo(c, cardLv(c[0]))) })).sort((a, b) => b.p - a.p);
    app.innerHTML = `${top}${bubble(m.stake ? '대결할 카드를 골라! 지면 이 카드가 친구에게 가.' : '대결할 카드를 골라! 친선 대결이라 카드는 그대로야.', 'tight')}
      <p class="small-note center-note">⚡ 힘 = 등급 + 강화 · 타입 상성이 맞으면 +8 · 주사위 운도 있어요</p>
      <div class="album picker">${owned.map(({ c, p }) => `<button class="album-card" data-pick="${c[0]}">${cardFace(c, true)}<span class="pw">⚡${p}</span>${S.cards[c[0]] > 1 ? `<span class="dup">×${S.cards[c[0]]}</span>` : ''}</button>`).join('')}</div>
      <div class="row">${quit}</div>`;
    wireQuit();
    $$('[data-pick]', app).forEach((b) => b.addEventListener('click', () => confirmPick(m, CARD_BY[b.dataset.pick])));
    speak(m.stake ? '대결할 카드를 골라! 지면 이 카드가 친구에게 가.' : '대결할 카드를 골라!');
    return;
  }
  if (m.status === 'roll' || m.status === 'done') rollView(m, top);
}
function confirmPick(m, c) {
  const info = cardInfo(c, cardLv(c[0]));
  const el = sheet(`${cardFace(c)}<p class="inv-t"><b>${esc(c[1])}</b> · ⚡ ${SOCIAL.power(info)}</p>
    <p class="small-note">${m.stake ? '이 카드로 할까요? 지면 친구에게 가요.' : '이 카드로 할까요?'}</p>
    <div class="row"><button class="btn primary" id="pYes">⚔️ 이 카드로!</button><button class="btn" id="pNo">다시 고를래</button></div>`);
  $('#pNo', el).onclick = closeSheet;
  $('#pYes', el).onclick = async () => {
    closeSheet();
    S.social = S.social || { escrow: {}, done: {} };
    let card = info;
    if (m.stake) { /* 이 카드를 맡겨 둬요 (이기면 돌아와요) */
      const t = takeCard(c[0]);
      if (!t) return;
      card = cardInfo(c, t.lv);
      S.social.escrow[m.id] = { ...t, name: c[1] };
      save();
    }
    sfx('pop');
    try { await SOCIAL.pick(m.id, card); } catch (e) {
      if (m.stake && S.social.escrow[m.id]) { const t = S.social.escrow[m.id]; giveCard(t.id, t.lv); delete S.social.escrow[m.id]; save(); }
      toast('대결이 이미 끝났어요');
    }
  };
}
/* 🎲 3판 2선승: 아이가 직접 주사위를 굴려요. 두 사람이 다 굴려야 그 판 결과가 나와요 */
/* 주사위 눈 그림 */
const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
const dieSvg = (n) => `<svg viewBox="0 0 100 100" aria-label="${n}"><rect x="5" y="5" width="90" height="90" rx="20" class="die-body"/>${PIPS[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${n === 1 ? 13 : 9}" class="${n === 1 ? 'pip one' : 'pip'}"/>`).join('')}</svg>`;
let revealChain = Promise.resolve();
function rollSides(m) {
  const me = SOCIAL.uid, other = m.users.find((u) => u !== me);
  const meFirst = m.users[0] === me; /* rounds는 users[0] 기준이라 내 쪽으로 돌려요 */
  const rounds = (m.rounds || []).map((r) => (meFirst ? r : { da: r.db, db: r.da, sa: r.sb, sb: r.sa, w: r.w === -1 ? -1 : 1 - r.w }));
  return { me, other, rounds, A: m.picks[me], B: m.picks[other] };
}
function rollView(m, top) {
  const { me, other, rounds, A, B } = rollSides(m);
  stageWho = { me: m.who[me], them: m.who[other] };
  let root = $('#arena');
  if (!root || root.dataset.mid !== m.id) {
    const ca = CARD_BY[A.id], cb = CARD_BY[B.id];
    app.innerHTML = `${top}
      <div class="arena" id="arena" data-mid="${m.id}" data-shown="0">
        <div class="fighter" id="fA">${ca ? cardFace(ca, false, A.lv) : ''}<b>${esc(A.name)}</b><span class="pw">⚡${SOCIAL.power(A)}${SOCIAL.edge(A, B) ? ' +8 상성!' : ''}</span>
          <span class="die" id="dA" aria-label="내 주사위">🎲</span></div>
        <div class="score" id="bScore">0 : 0</div>
        <div class="fighter" id="fB">${cb ? cardFace(cb, false, B.lv) : ''}<b>${esc(B.name)}</b><span class="pw">⚡${SOCIAL.power(B)}${SOCIAL.edge(B, A) ? ' +8 상성!' : ''}</span>
          <span class="die" id="dB" aria-label="친구 주사위">🎲</span><small class="die-note" id="nB"></small></div>
      </div>
      <div class="roll-ctl" id="rollCtl" aria-live="polite"></div>
      <div class="rounds" id="bRounds" aria-live="polite"></div>
      <div id="bEnd"></div>`;
    root = $('#arena');
    if (m.status === 'roll') speak('주사위를 굴려! 큰 숫자가 나오면 힘이 세져!');
  }
  const rolled = m.rolled || {};
  const mine = rolled[me] || 0, theirs = rolled[other] || 0;
  const doneN = m.status === 'done' ? rounds.length : Math.min(mine, theirs);
  /* 새로 끝난 판을 하나씩 보여 줘요 */
  let shown = +root.dataset.shown;
  for (; shown < doneN; shown++) { const i = shown; revealChain = revealChain.then(() => revealRound(rounds, i)); }
  root.dataset.shown = shown;
  const ctl = $('#rollCtl');
  if (doneN >= rounds.length) {
    ctl.innerHTML = '';
    if (!root.dataset.end) { root.dataset.end = '1'; revealChain = revealChain.then(() => battleEnd(m)); }
    return;
  }
  const cur = doneN;
  $('#nB').textContent = theirs > cur ? '✅ 굴렸어!' : '';
  if (mine > cur) {
    ctl.innerHTML = `<p class="wait">⏳ 친구가 주사위를 굴리길 기다려요…</p>`;
    clearTimeout(rollView.t);
    rollView.t = setTimeout(() => { /* 친구가 오래 안 굴리면 대신 굴려 줄 수 있어요 */
      const now = SOCIAL.match(m.id);
      if (!now || now.status !== 'roll' || ((now.rolled || {})[other] || 0) > cur || !$('#rollCtl')) return;
      $('#rollCtl').insertAdjacentHTML('beforeend', '<button class="btn" id="proxyRoll">⏩ 친구 주사위도 굴려 주기</button>');
      $('#proxyRoll').onclick = () => { $('#proxyRoll').disabled = true; SOCIAL.roll(m.id, other, cur + 1).catch(() => {}); };
    }, 20000);
    return;
  }
  const hint = theirs > cur ? '친구는 벌써 굴렸어! 너도 굴려!' : '';
  const btn = $('#rollBtn');
  if (btn && +btn.dataset.r === cur) { $('#rollHint').textContent = hint; return; } /* 이번 판 버튼이 이미 있어요 */
  ctl.innerHTML = `<button class="btn primary big roll-btn" id="rollBtn" data-r="${cur}">🎲 ${cur + 1}판 주사위 굴리기!</button>
    <p class="small-note center-note" id="rollHint">${hint}</p>`;
  $('#rollBtn').onclick = async () => {
    $('#rollBtn').disabled = true;
    const done = rounds.slice(0, cur);
    const tension = done.filter((x) => x.w === 0).length === 1 && done.filter((x) => x.w === 1).length === 1;
    const st = openStage(tension ? '🔥 마지막 판!' : `${cur + 1}판`, tension);
    const theyRolled = ((SOCIAL.match(m.id) || m).rolled || {})[other] > cur;
    restPane(st.them, 0, theyRolled ? '✅ 벌써 굴렸어! 두근두근…' : '⏳ 친구가 굴리길 기다려요');
    await rollPane(st.me, rounds[cur].da, ['-60vw', '-40vh']);
    $('#dA').innerHTML = dieSvg(rounds[cur].da);
    SOCIAL.roll(m.id, me, cur + 1).catch(() => toast('앗, 연결이 끊겼어요. 다시 눌러 봐요'));
    /* 친구가 이미 굴렸으면 그대로 두고 친구 주사위를 이어서 보여 줘요. 아니면 잠깐 뒤 닫아요 */
    if (!theyRolled) closeStage(700); else stageClose = setTimeout(() => closeStage(), 8000);
  };
}
/* 🎲 주사위 무대: 화면을 둘로 나눠요 (가로 화면: 왼쪽 나 · 오른쪽 친구 / 세로 화면(휴대폰): 위 나 · 아래 친구)
 * 내 주사위: 손에서 달그락 → 휙 던져 통통 튀며 데굴데굴 → 딱! 멈춤. 친구 주사위는 둘 다 굴린 뒤에 굴러요. */
const CUBE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const cubeHTML = () => `<div class="cube">${[1, 6, 2, 5, 3, 4].map((n) => `<div class="cf f${n}">${dieSvg(n)}</div>`).join('')}</div>`;
const dwait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 60) : ms));
let dstage = null, stageWho = null, stageClose = 0;
function openStage(label, tension) {
  clearTimeout(stageClose);
  if (dstage && document.body.contains(dstage.el)) {
    dstage.el.classList.toggle('tension', !!tension);
    dstage.label.textContent = label;
    return dstage;
  }
  const who = stageWho || { me: { name: '나', avatar: '🙂' }, them: { name: '친구', avatar: '🙂' } };
  const pane = (side, p) => `<div class="dice-pane ${side}"><p class="pane-who">${p.avatar} ${esc(p.name)}${side === 'me' ? ' <small>(나)</small>' : ''}</p>
    <div class="dice-floor"><div class="dice-fly">${cubeHTML()}</div><div class="dice-shadow"></div></div>
    <p class="dice-num" aria-live="polite"></p><p class="pane-note"></p></div>`;
  const el = document.createElement('div');
  el.className = 'dice-stage' + (tension ? ' tension' : '');
  el.innerHTML = `<p class="dice-label">${label}</p>${pane('me', who.me)}<div class="dice-vs">VS</div>${pane('them', who.them)}<div class="dice-banner" aria-live="polite"></div>`;
  document.body.appendChild(el);
  const P = (side) => { const r = $('.dice-pane.' + side, el); return { root: r, fly: $('.dice-fly', r), cube: $('.cube', r), num: $('.dice-num', r), note: $('.pane-note', r) }; };
  dstage = { el, label: $('.dice-label', el), banner: $('.dice-banner', el), me: P('me'), them: P('them') };
  requestAnimationFrame(() => el.classList.add('in'));
  return dstage;
}
async function closeStage(after = 0) {
  const st = dstage;
  if (!st) return;
  await dwait(after);
  if (dstage !== st) return;
  dstage = null;
  st.el.classList.add('out');
  await dwait(320);
  st.el.remove();
}
/* 멈춰 있는 주사위: 값이 있으면 그 면, 없으면 '?' (아직 모름) */
function restPane(p, value, note) {
  p.fly.getAnimations().forEach((a) => a.cancel());
  p.cube.getAnimations().forEach((a) => a.cancel());
  p.root.classList.toggle('secret', !value);
  p.root.classList.toggle('landed', !!value);
  const [fx, fy] = CUBE_ROT[value || 5];
  p.cube.style.transform = value ? `rotateX(${fx}deg) rotateY(${fy}deg)` : `rotateX(${fx - 20}deg) rotateY(${fy + 30}deg)`;
  p.num.innerHTML = value ? `${value}` : '';
  p.note.textContent = note || '';
}
async function rollPane(p, value, from) {
  p.root.classList.remove('secret', 'landed');
  p.num.innerHTML = '';
  p.note.textContent = '';
  const [fx, fy] = CUBE_ROT[value];
  /* 1) 달그락달그락 */
  p.cube.style.transform = `rotateX(${fx - 25}deg) rotateY(${fy + 35}deg)`;
  p.fly.classList.add('shaking');
  sfx(dstage && dstage.el.classList.contains('tension') ? 'drumroll' : 'diceShake');
  await dwait(dstage && dstage.el.classList.contains('tension') ? 1000 : 600);
  p.fly.classList.remove('shaking');
  /* 2) 휙 던져서 통통 튀며 데굴데굴 */
  const D = 1400, hops = [0.34, 0.62, 0.82, 0.93];
  sfx('diceRoll', hops.map((h) => (h * D) / 1000));
  const spinX = 720 + 360 * Math.floor(Math.random() * 2), spinY = 1080 + 360 * Math.floor(Math.random() * 2);
  if (!reduceMotion) {
    const [sx, sy] = from; /* 던져 오는 방향 (화면 밖) */
    p.fly.animate([
      { transform: `translate(${sx}, ${sy}) scale(.55)` },
      { transform: 'translate(0, 0) scale(1)', offset: hops[0] },
      { transform: 'translate(0, -14%) scale(1.05)', offset: (hops[0] + hops[1]) / 2 },
      { transform: 'translate(0, 0) scale(1)', offset: hops[1] },
      { transform: 'translate(0, -6%) scale(1.02)', offset: (hops[1] + hops[2]) / 2 },
      { transform: 'translate(0, 0) scale(1)', offset: hops[2] },
      { transform: 'translate(0, -2%) scale(1)', offset: (hops[2] + hops[3]) / 2 },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: D, easing: 'linear' });
    await p.cube.animate([
      { transform: `rotateX(${fx - spinX}deg) rotateY(${fy - spinY}deg) rotateZ(90deg)` },
      { transform: `rotateX(${fx}deg) rotateY(${fy}deg) rotateZ(0deg)` },
    ], { duration: D, easing: 'cubic-bezier(.2, .65, .25, 1)' }).finished;
  }
  /* 3) 딱! 멈춤 */
  p.cube.style.transform = `rotateX(${fx}deg) rotateY(${fy}deg)`;
  sfx('diceLand');
  p.root.classList.add('landed');
  p.num.innerHTML = `${value}${value === 6 ? ' <small>최고!</small>' : value === 1 ? ' <small>앗!</small>' : '!'}`;
  if (value === 6) { sfx('diceBig'); confetti(); }
  await dwait(800);
}
async function revealRound(rounds, i) {
  if (!$('#arena')) return;
  const r = rounds[i];
  $('#dA').innerHTML = dieSvg(r.da);
  $('#nB').textContent = '';
  const before = rounds.slice(0, i);
  const tension = before.filter((x) => x.w === 0).length === 1 && before.filter((x) => x.w === 1).length === 1;
  const st = openStage(tension ? '🔥 마지막 판!' : `${i + 1}판`, tension);
  restPane(st.me, r.da);
  await rollPane(st.them, r.db, ['60vw', '40vh']);
  $('#dB').innerHTML = dieSvg(r.db);
  /* 이 판 결과 */
  const win = r.w === -1 ? null : r.w === 0;
  st.banner.innerHTML = `<b>${win === null ? '🤝 비겼어요! 한 번 더!' : win ? '👍 이 판은 내가 이겼어!' : '💥 이 판은 친구가 이겼어!'}</b><small>나 ${r.sa} : ${r.sb} 친구</small>`;
  st.banner.className = 'dice-banner show ' + (win === true ? 'win' : win === false ? 'lose' : 'tie');
  (win === true ? st.me : win === false ? st.them : null)?.root.classList.add('winner');
  sfx(win === true ? 'roundWin' : win === false ? 'roundLose' : 'pop');
  await dwait(1600);
  await closeStage();
  const lines = $('#bRounds');
  lines.insertAdjacentHTML('beforeend', `<p class="rd">${i + 1}판: 🎲${r.da} → <b>${r.sa}</b> vs <b>${r.sb}</b> ← 🎲${r.db} ${r.w === -1 ? '🤝 비겼어요, 한 번 더!' : r.w === 0 ? '👍 내가 이겼어!' : '💥 친구가 이겼어!'}</p>`);
  const won = rounds.slice(0, i + 1);
  $('#bScore').textContent = `${won.filter((x) => x.w === 0).length} : ${won.filter((x) => x.w === 1).length}`;
  const f = r.w === 0 ? $('#fA') : r.w === 1 ? $('#fB') : null;
  if (f) { f.classList.remove('hit'); void f.offsetWidth; f.classList.add('hit'); }
  await new Promise((res) => setTimeout(res, reduceMotion ? 60 : 300));
}
/* 🏆 승리 / 😢 패배 장면 (card: 이기면 가져온 카드, 지면 보낸 카드) */
async function battleScene(won, stake, card) {
  const w = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 60) : ms));
  const c = card && CARD_BY[card.id];
  const el = document.createElement('div');
  el.className = 'bt-over ' + (won ? 'win' : 'lose');
  el.innerHTML = won
    ? `<div class="evo-rays gold" aria-hidden="true"></div>
       <p class="bt-big">🏆</p><p class="bt-word">승리!</p>
       ${stake && c ? `<div class="bt-card">${cardFace(c, false, card.lv)}<span class="bt-get">GET!</span></div><p class="bt-sub"><b>${esc(card.name)}</b> 카드를 가져왔어요!</p>` : '<p class="bt-sub">🤝 친선 대결 승리! ⭐ +1</p>'}
       <button class="btn primary big bt-ok">좋아! 👍</button>`
    : `<div class="rain" aria-hidden="true">${Array.from({ length: 28 }, () => `<i style="left:${Math.random() * 100}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(0.7 + Math.random() * 0.6).toFixed(2)}s"></i>`).join('')}</div>
       <p class="bt-big">😢</p><p class="bt-word">아쉽다…</p>
       ${stake && c ? `<div class="bt-card gone">${cardFace(c, false, card.lv)}</div><p class="bt-sub"><b>${esc(card.name)}</b> 카드가 친구에게 갔어요</p>` : ''}
       <p class="bt-sub">괜찮아! 다음엔 꼭 이길 거야 💪</p>
       <button class="btn primary big bt-ok">다시 힘내기 💪</button>`;
  document.body.appendChild(el);
  await w(20);
  el.classList.add('in');
  if (won) {
    sfx('victory');
    confetti();
    setTimeout(confetti, 700);
    setTimeout(confetti, 1500);
    if (c) setTimeout(() => CardFX.play(card.type, card.cls, $('.bt-card', el)).catch(() => {}), 900);
  } else sfx('defeat');
  const ok = $('.bt-ok', el);
  await w(1400);
  ok.classList.add('ready');
  await new Promise((r) => { ok.onclick = r; });
  el.classList.add('out');
  await w(350);
  el.remove();
}
async function battleEnd(m) {
  if (!$('#arena')) return;
  const { me, other, A, B } = rollSides(m);
  const them = m.who[other];
  const won = m.winner === me;
  await battleScene(won, m.stake, won ? B : A);
  $('#bEnd').innerHTML = `<p class="bt-result ${won ? 'win' : 'lose'}">${won ? '🏆 이겼어요!' : '😢 아쉽게 졌어요'}</p>
    <p class="small-note center-note">${m.stake ? (won ? `🎴 <b>${esc(B.name)}</b> 카드를 가져왔어요! (내 카드도 돌아와요)` : `🎴 <b>${esc(A.name)}</b> 카드가 ${esc(them.name)}에게 갔어요. 다음엔 이길 거야!`) : won ? '🤝 친선 대결 승리! ⭐1' : '🤝 친선 대결이라 카드는 그대로예요.'}</p>
    <div class="row"><button class="btn primary" id="bAgain">⚔️ 한 번 더</button><button class="btn" id="bBack">🤝 친구 광장</button></div>`;
  speak(won ? (m.stake ? `이겼어! ${B.name} 카드를 가져왔어!` : '이겼어! 별 하나!') : '아쉽게 졌어. 다음엔 이길 거야!');
  $('#bBack').onclick = () => go('friends', 'fr');
  $('#bAgain').onclick = () => askFight(other, m.kids[other]);
}

/* ---------- 🏪 카드 시장 ---------- */
async function marketTab(quiet) {
  const box = $('#fbody');
  box.innerHTML = '<p class="small-note">시장을 둘러보는 중…</p>';
  let list = [];
  try { await loadCards(); list = await SOCIAL.market(); } catch (e) { console.error(e); box.innerHTML = '<p class="auth-error">⚠️ 시장을 불러오지 못했어요.</p>'; return; }
  if (app.className !== 'screen-friends' || friendsTab !== 'mk') return;
  const kid = STORE.current().id;
  const mine = SOCIAL.myListings().filter((l) => l.sellerKid === kid && l.status === 'open');
  const item = (l, own) => {
    const c = CARD_BY[l.card.id];
    return `<div class="mk-item">${c ? `<button class="album-card" data-view="${l.card.id}|${l.card.lv}">${cardFace(c, true, l.card.lv)}</button>` : ''}
      <b>${esc(l.card.name)}</b><small>${own ? '내가 내놓음' : `${l.sellerAvatar || ''} ${esc(l.sellerName || '')}`}</small>
      ${own ? `<button class="btn small" data-unlist="${l.id}">⭐${l.price} · 내리기</button>`
        : `<button class="btn small primary" data-buy="${l.id}" ${S.stars < l.price ? 'disabled' : ''}>⭐ ${l.price}에 사기</button>`}</div>`;
  };
  box.innerHTML = `
    <div class="mk-top"><span>⭐ 내 별 <b>${S.stars}</b>개</span><button class="btn small primary" id="sellBtn">🏷️ 카드 팔기</button><button class="btn small" id="mkRefresh" aria-label="새로 보기">🔄</button></div>
    <p class="small-note">별은 앱 안에서만 쓰는 놀이 돈이에요. 친구 가족들끼리만 사고팔아요.</p>
    <h3 class="h3">친구들이 내놓은 카드</h3>
    ${list.length ? `<div class="market">${list.map((l) => item(l)).join('')}</div>` : '<p class="small-note">아직 내놓은 카드가 없어요.</p>'}
    ${mine.length ? `<h3 class="h3">내가 내놓은 카드</h3><div class="market">${mine.map((l) => item(l, true)).join('')}</div>` : ''}`;
  $('#mkRefresh').onclick = () => marketTab(true);
  $('#sellBtn').onclick = sellFlow;
  $$('[data-view]', box).forEach((b) => b.addEventListener('click', () => { const [id, lv] = b.dataset.view.split('|'); const c = CARD_BY[id]; const el = sheet(`${cardFace(c, false, +lv)}<p class="inv-t"><b>${esc(c[1])}</b></p>${classChip(c[5])}<button class="btn" id="vClose">닫기</button>`); $('#vClose', el).onclick = closeSheet; }));
  $$('[data-buy]', box).forEach((b) => b.addEventListener('click', () => buyFlow(list.find((l) => l.id === b.dataset.buy))));
  $$('[data-unlist]', box).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const ok = await SOCIAL.unlist(b.dataset.unlist).catch(() => false);
    toast(ok ? '카드를 내렸어요. 앨범으로 돌아와요.' : '이미 팔렸어요!');
    setTimeout(() => marketTab(true), 600);
  }));
  if (!quiet) speak('별로 친구 카드를 사거나, 내 카드를 팔 수 있어!');
}
function buyFlow(l) {
  if (!l) return;
  const c = CARD_BY[l.card.id];
  const el = sheet(`${cardFace(c, false, l.card.lv)}<p class="inv-t"><b>${esc(l.card.name)}</b></p>
    <p class="small-note">${l.sellerAvatar || ''} ${esc(l.sellerName || '')}의 카드 · 내 별 ${S.stars}개</p>
    <div class="row"><button class="btn primary" id="bYes" ${S.stars < l.price ? 'disabled' : ''}>⭐ ${l.price}개로 사기</button><button class="btn" id="bNo">안 살래</button></div>`);
  $('#bNo', el).onclick = closeSheet;
  $('#bYes', el).onclick = async () => {
    $('#bYes', el).disabled = true;
    try {
      await SOCIAL.buy(l.id, kidInfo());
      S.stars -= l.price;
      giveCard(l.card.id, l.card.lv);
      save();
      paintStars();
      closeSheet();
      sfx('catch');
      confetti();
      toast(`🎴 <b>${esc(l.card.name)}</b> 카드를 샀어요! 앨범에 넣었어요.`, 3000);
      marketTab(true);
    } catch (e) { closeSheet(); toast('앗, 벌써 팔렸어요!'); marketTab(true); }
  };
}
function sellFlow() {
  const owned = Object.keys(S.cards || {}).map((id) => CARD_BY[id]).filter(Boolean).sort((a, b) => 'nrasu'.indexOf(b[5]) - 'nrasu'.indexOf(a[5]));
  if (!owned.length) { toast('팔 카드가 없어요. 카드팩을 뜯어 봐요!'); return; }
  const el = sheet(`<p class="inv-t">🏷️ 어떤 카드를 팔까요?</p>
    <div class="album picker">${owned.map((c) => `<button class="album-card" data-sell="${c[0]}">${cardFace(c, true)}${S.cards[c[0]] > 1 ? `<span class="dup">×${S.cards[c[0]]}</span>` : ''}</button>`).join('')}</div>
    <button class="btn" id="sClose">닫기</button>`, 'wide');
  $('#sClose', el).onclick = closeSheet;
  $$('[data-sell]', el).forEach((b) => b.addEventListener('click', () => priceFlow(CARD_BY[b.dataset.sell])));
}
function priceFlow(c) {
  const lvNow = S.cards[c[0]] > 1 ? 0 : cardLv(c[0]);
  let price = PRICE_HINT[c[5]] + lvNow * 3;
  const el = sheet(`${cardFace(c, false, lvNow)}<p class="inv-t"><b>${esc(c[1])}</b></p>
    <p class="small-note">얼마에 팔까요? (보통 ${CARD_CLASS[c[5]].name} 카드는 ⭐${PRICE_HINT[c[5]]}쯤)</p>
    <div class="bet"><button class="btn bet-btn" id="pm">−</button><b class="price">⭐ <span id="pv">${price}</span></b><button class="btn bet-btn" id="pp">＋</button></div>
    <div class="row"><button class="btn primary" id="sYes">🏷️ 시장에 내놓기</button><button class="btn" id="sNo">취소</button></div>`);
  const paint = () => { $('#pv', el).textContent = price; };
  $('#pm', el).onclick = () => { price = Math.max(1, price - (price > 20 ? 5 : 1)); sfx('pop'); paint(); };
  $('#pp', el).onclick = () => { price = Math.min(999, price + (price >= 20 ? 5 : 1)); sfx('pop'); paint(); };
  $('#sNo', el).onclick = closeSheet;
  $('#sYes', el).onclick = async () => {
    $('#sYes', el).disabled = true;
    const t = takeCard(c[0]); /* 팔릴 때까지 시장에 맡겨 둬요 */
    if (!t) return;
    save();
    try {
      await SOCIAL.sell(kidInfo(), cardInfo(c, t.lv), price);
      closeSheet();
      sfx('star');
      toast(`🏷️ ${esc(c[1])} 카드를 ⭐${price}에 내놓았어요. 팔리면 별이 들어와요!`, 3000);
      marketTab(true);
    } catch (e) { console.error(e); giveCard(t.id, t.lv); save(); closeSheet(); toast('내놓지 못했어요'); }
  };
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
  SOCIAL.setKid(id);
  settleSocial();
  claimGifts();
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
  if (what === 'status') { const el = $('#cloudStatus'); if (el) el.textContent = CLOUD_TEXT[STORE.cloud.status] || ''; if (STORE.cloud.status === 'synced') claimGifts(); return; }
  if (what === 'current') { loadState(); pickVoice(); paintStars(); SOCIAL.setKid(STORE.current().id); settleSocial(); }
  if (what === 'user') SOCIAL.start();
  if (what === 'profiles' || what === 'current') SOCIAL.publish();
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
SOCIAL.setKid(STORE.current().id);
STORE.init();
})();
