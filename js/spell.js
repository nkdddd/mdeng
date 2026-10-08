/* 또박또박 맞춤법 엔진 — 소리 규칙 · 자세한 채점 · 헷갈리는 글자 조각 · 자모 조립
 *
 * SPELL.pron(문장)   글자마다 [소리]와 바뀐 까닭(TYPES 키)을 알려 줘요.  익은 → [이근] (yeon)
 * SPELL.tags(문장)   이 문장이 묻는 핵심 개념들 (소리 규칙 + ㅐ/ㅔ·겹모음·쌍받침 같은 눈으로 외울 것)
 * SPELL.grade(쓴 글, 바른 글)  글자·띄어쓰기·문장부호를 칸마다 비교하고, 틀린 곳마다 까닭을 붙여요
 * SPELL.decoys(문장)  글자 조각에 섞을 '헷갈리는 글자' (소리 나는 대로 쓴 글자, ㅐ↔ㅔ, ㅆ↔ㅅ …)
 * SPELL.compose(자모 목록)  ㄱ ㅏ ㅂ ㅅ → '값' (자모 조립 입력)
 *
 * 1·2학년 받아쓰기에 나오는 규칙만 다뤄요. 낱말마다 다른 된소리(눈사람 [눈싸람])나 사이시옷은
 * 데이터의 hints가 알려 줘요.
 */
const SPELL = (() => {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.split('');
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'.split('');
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const isH = (ch) => { const c = ch.charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3; };
  const dec = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return { cho: CHO[Math.floor(c / 588)], jung: JUNG[Math.floor((c % 588) / 28)], jong: JONG[c % 28] }; };
  const com = (s) => String.fromCharCode(0xac00 + CHO.indexOf(s.cho) * 588 + JUNG.indexOf(s.jung) * 28 + JONG.indexOf(s.jong || ''));
  const PUNCT = /[.,!?~]/;

  /* 겹받침: [앞, 뒤] */
  const DBL = { ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'], ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'] };
  const DBL_BY = Object.fromEntries(Object.entries(DBL).map(([k, [a, b]]) => [a + b, k]));
  /* 겹받침이 끝에서 내는 소리 (밟·읽은 예외: 읽다 [익따]) */
  const DBL_SOUND = { ㄳ: 'ㄱ', ㄵ: 'ㄴ', ㄶ: 'ㄴ', ㄺ: 'ㄱ', ㄻ: 'ㅁ', ㄼ: 'ㄹ', ㄽ: 'ㄹ', ㄾ: 'ㄹ', ㄿ: 'ㅂ', ㅀ: 'ㄹ', ㅄ: 'ㅂ' };
  /* 받침 대장 7형제 */
  const REP = { ㄲ: 'ㄱ', ㅋ: 'ㄱ', ㅅ: 'ㄷ', ㅆ: 'ㄷ', ㅈ: 'ㄷ', ㅊ: 'ㄷ', ㅌ: 'ㄷ', ㅎ: 'ㄷ', ㅍ: 'ㅂ' };
  const TENSE = { ㄱ: 'ㄲ', ㄷ: 'ㄸ', ㅂ: 'ㅃ', ㅅ: 'ㅆ', ㅈ: 'ㅉ' };
  const LAX = Object.fromEntries(Object.entries(TENSE).map(([a, b]) => [b, a]));
  const ASP = { ㄱ: 'ㅋ', ㄷ: 'ㅌ', ㅂ: 'ㅍ', ㅈ: 'ㅊ', ㅅ: 'ㅆ' };
  const NASAL = { ㄱ: 'ㅇ', ㄷ: 'ㄴ', ㅂ: 'ㅁ' };
  const CAN_CHO = new Set(CHO);

  /* 어절 하나의 소리: syl = [{cho,jung,jong}] → 같은 길이 [{cho,jung,jong, why:Set}] */
  function pronWord(word) {
    const S = word.map((s) => ({ ...s, why: new Set() }));
    const n = S.length;
    for (let i = 0; i < n; i++) {
      const a = S[i], b = S[i + 1];
      if (!a.jong) continue;
      if (!b) { /* 끝 받침 */
        if (DBL[a.jong]) { a.jong = DBL_SOUND[a.jong]; a.why.add('gyeop'); } else if (REP[a.jong]) { a.why.add(a.jong === 'ㅆ' || a.jong === 'ㄲ' ? 'ss' : 'rep'); a.jong = REP[a.jong]; }
        continue;
      }
      const L = a.jong, R = b.cho;
      const hFirst = L === 'ㅎ' || L === 'ㄶ' || L === 'ㅀ';
      /* 🙈 ㅎ 받침 */
      if (hFirst) {
        const rest = L === 'ㅎ' ? '' : DBL[L][0];
        if (ASP[R] && R !== 'ㅅ') { b.cho = ASP[R]; a.jong = rest; a.why.add('h'); b.why.add('h'); continue; }
        if (R === 'ㅅ') { b.cho = 'ㅆ'; a.jong = rest; a.why.add('h'); b.why.add('h'); continue; }
        if (R === 'ㅇ') { a.jong = rest; a.why.add('h'); if (rest) { b.cho = rest; a.jong = ''; b.why.add('yeon'); } continue; }
        if (R === 'ㄴ') { a.jong = rest || 'ㄴ'; if (rest === 'ㄹ') b.cho = 'ㄹ'; a.why.add('h'); continue; }
        a.jong = rest || 'ㄷ'; a.why.add('h');
        continue;
      }
      /* 🙈 받침 + ㅎ → 거센소리 (축하 [추카], 뿌듯해 [뿌드태]) */
      if (R === 'ㅎ') {
        const last = DBL[L] ? DBL[L][1] : L;
        const base = REP[last] || last;
        if (ASP[base] && base !== 'ㅅ') {
          b.cho = ASP[base] === 'ㅌ' && b.jung === 'ㅣ' ? 'ㅊ' : ASP[base];
          a.jong = DBL[L] ? DBL[L][0] : ''; a.why.add('h'); b.why.add(b.cho === 'ㅊ' && base === 'ㄷ' ? 'palatal' : 'h');
          continue;
        }
      }
      /* 🦋 ㄷ·ㅌ + 이 → 지·치 */
      if ((L === 'ㄷ' || L === 'ㅌ' || L === 'ㄾ') && R === 'ㅇ' && b.jung === 'ㅣ') {
        b.cho = L === 'ㄷ' ? 'ㅈ' : 'ㅊ'; a.jong = L === 'ㄾ' ? 'ㄹ' : ''; a.why.add('palatal'); b.why.add('palatal');
        continue;
      }
      /* 🚚 받침 이사 (겹받침은 뒤엣것만) */
      if (R === 'ㅇ') {
        if (L === 'ㅇ') continue;
        if (DBL[L]) {
          const [f, s] = DBL[L];
          a.jong = f; b.cho = s === 'ㅅ' ? 'ㅆ' : s; a.why.add('gyeop'); b.why.add('gyeop');
        } else if (CAN_CHO.has(L)) {
          b.cho = L; a.jong = ''; a.why.add(L === 'ㅆ' || L === 'ㄲ' ? 'ss' : 'yeon'); b.why.add('yeon');
        }
        continue;
      }
      /* 💪 ㄹ 뒤 '게·걸·거' (볼게요 [볼께요], 할걸 [할껄]) */
      if (L === 'ㄹ' && R === 'ㄱ' && ['ㅔ', 'ㅓ'].includes(b.jung) && (!b.jong || b.jong === 'ㄹ')) { b.cho = 'ㄲ'; b.why.add('tense'); continue; }
      /* 받침을 대표 소리로 */
      let sl = L;
      if (DBL[L]) {
        sl = L === 'ㄺ' && R === 'ㄱ' ? 'ㄹ' : L === 'ㄼ' && /^밟/.test(com({ ...word[i] })) ? 'ㅂ' : DBL_SOUND[L];
        a.why.add('gyeop');
      } else if (REP[L]) { sl = REP[L]; a.why.add(L === 'ㅆ' || L === 'ㄲ' ? 'ss' : 'rep'); }
      a.jong = sl;
      /* 💪 된소리 */
      if ((NASAL[sl] || DBL[L]) && TENSE[R] && !(DBL[L] && !['ㄼ', 'ㄾ', 'ㄵ', 'ㄻ', 'ㄺ', 'ㄳ', 'ㅄ', 'ㄿ'].includes(L))) {
        b.cho = TENSE[R]; b.why.add('tense');
      }
      /* 🤧 코맹맹이: ㄱ·ㄷ·ㅂ + ㄴ·ㅁ */
      if (NASAL[sl] && (R === 'ㄴ' || R === 'ㅁ')) { a.jong = NASAL[sl]; a.why.add('nasal'); continue; }
      /* 👯 ㄹㄹ */
      if ((sl === 'ㄴ' && R === 'ㄹ') || (sl === 'ㄹ' && R === 'ㄴ')) { a.jong = 'ㄹ'; b.cho = 'ㄹ'; (sl === 'ㄴ' ? a : b).why.add('liquid'); continue; }
      /* ㅁ·ㅇ + ㄹ → ㄴ (음료 [음뇨]), ㄱ·ㅂ + ㄹ → ㅇ·ㅁ + ㄴ (독립 [동닙]) */
      if (R === 'ㄹ' && (sl === 'ㅁ' || sl === 'ㅇ')) { b.cho = 'ㄴ'; b.why.add('nasal'); continue; }
      if (R === 'ㄹ' && NASAL[sl]) { b.cho = 'ㄴ'; a.jong = NASAL[sl]; a.why.add('nasal'); b.why.add('nasal'); }
    }
    /* 모음: ㅢ [ㅣ], ㅖ [ㅔ] */
    S.forEach((s, i) => {
      if (s.jung === 'ㅢ' && (i > 0 || s.cho !== 'ㅇ')) { s.jung = 'ㅣ'; s.why.add('ui'); }
      if (s.jung === 'ㅖ' && !['ㅇ', 'ㄹ'].includes(s.cho)) { s.jung = 'ㅔ'; s.why.add('ye'); }
    });
    return S;
  }

  /* 문장 → 글자마다 { ch, say, why[] } (띄어쓰기·문장부호는 그대로) */
  function pron(text) {
    const out = [];
    String(text).split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { out.push({ ch: ' ', say: ' ', why: [] }); return; }
      const chars = [...tok];
      const idx = [], syl = [];
      chars.forEach((ch, k) => { if (isH(ch)) { idx.push(k); syl.push(dec(ch)); } });
      const P = pronWord(syl);
      const word = chars.map((ch) => ({ ch, say: ch, why: [] }));
      idx.forEach((k, j) => { word[k].say = com(P[j]); word[k].why = [...P[j].why]; });
      out.push(...word);
    });
    return out;
  }
  const sayAll = (text) => pron(text).map((x) => x.say).join('');

  /* 눈으로 외워야 하는 글자 (소리로는 알 수 없어요) */
  const VOW_TAG = { ㅐ: 'ae', ㅔ: 'ae', ㅒ: 'ye', ㅖ: 'ye', ㅚ: 'wae', ㅙ: 'wae', ㅞ: 'wae', ㅟ: 'vow2', ㅘ: 'vow2', ㅝ: 'vow2', ㅢ: 'ui' };
  function charTags(ch) {
    if (!isH(ch)) return [];
    const d = dec(ch), t = [];
    if (VOW_TAG[d.jung]) t.push(VOW_TAG[d.jung]);
    if (LAX[d.cho] || d.cho === 'ㅆ') t.push('dbl');
    if (d.jong === 'ㅆ' || d.jong === 'ㄲ') t.push('ss');
    if (DBL[d.jong]) t.push('gyeop');
    return t;
  }
  /* 문장이 묻는 개념들 (많이 나온 순) + 띄어쓰기·문장부호 */
  function tags(text, hints = []) {
    const n = {};
    const add = (k, w = 1) => { n[k] = (n[k] || 0) + w; };
    pron(text).forEach((x) => { x.why.forEach((k) => add(k, 2)); charTags(x.ch).forEach((k) => add(k)); });
    hints.forEach(([, , k]) => add(k, 2));
    if (/\s/.test(text.trim())) add('space');
    if (PUNCT.test(text)) add('punct');
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }

  /* ---------- ✔ 자세한 채점 ---------- */
  /* 글자 칸 나누기: 글자(공백·부호 빼고), 글자 뒤 띄어쓰기, 글자 뒤 부호 */
  function cellsOf(text) {
    const chars = [], gapAfter = [], punAfter = [];
    let lead = '';
    for (const ch of String(text).trim()) {
      if (/\s/.test(ch)) { if (chars.length) gapAfter[chars.length - 1] = true; continue; }
      if (PUNCT.test(ch)) { if (chars.length) punAfter[chars.length - 1] = (punAfter[chars.length - 1] || '') + ch; else lead += ch; continue; }
      chars.push(ch);
    }
    return { chars, gapAfter: chars.map((_, i) => !!gapAfter[i] && i < chars.length - 1), punAfter: chars.map((_, i) => punAfter[i] || '') };
  }
  /* 두 글자가 얼마나 다른지 (자모 단위) */
  function cost(u, a) {
    if (u === a) return 0;
    if (!isH(u) || !isH(a)) return 1;
    const x = dec(u), y = dec(a);
    return ((x.cho !== y.cho) + (x.jung !== y.jung) + (x.jong !== y.jong)) / 3.2;
  }
  /* 글자 맞추기 (편집 거리) → [[u index | -1, a index | -1]] */
  function align(U, A) {
    const n = U.length, m = A.length;
    const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost(U[i - 1], A[j - 1]));
    const out = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && Math.abs(d[i][j] - (d[i - 1][j - 1] + cost(U[i - 1], A[j - 1]))) < 1e-9) { out.push([i - 1, j - 1]); i--; j--; }
      else if (j > 0 && (i === 0 || Math.abs(d[i][j] - (d[i][j - 1] + 1)) < 1e-9)) { out.push([-1, j - 1]); j--; }
      else { out.push([i - 1, -1]); i--; }
    }
    return out.reverse();
  }
  const VOW_GROUP = [['ㅐ', 'ㅔ', 'ae'], ['ㅒ', 'ㅖ', 'ye'], ['ㅔ', 'ㅖ', 'ye'], ['ㅐ', 'ㅖ', 'ye'], ['ㅚ', 'ㅙ', 'wae'], ['ㅚ', 'ㅞ', 'wae'], ['ㅙ', 'ㅞ', 'wae'],
    ['ㅚ', 'ㅐ', 'wae'], ['ㅚ', 'ㅔ', 'wae'], ['ㅙ', 'ㅐ', 'wae'], ['ㅞ', 'ㅔ', 'wae'], ['ㅢ', 'ㅣ', 'ui'], ['ㅢ', 'ㅡ', 'ui'], ['ㅢ', 'ㅔ', 'ui'],
    ['ㅟ', 'ㅣ', 'vow2'], ['ㅟ', 'ㅜ', 'vow2'], ['ㅘ', 'ㅏ', 'vow2'], ['ㅝ', 'ㅓ', 'vow2'], ['ㅚ', 'ㅗ', 'vow2'], ['ㅚ', 'ㅞ', 'wae'], ['ㅕ', 'ㅔ', 'vowel'], ['ㅕ', 'ㅓ', 'vowel'], ['ㅑ', 'ㅏ', 'vowel']];
  const vowKind = (a, b) => (VOW_GROUP.find(([x, y]) => (x === a && y === b) || (x === b && y === a)) || [0, 0, 'vowel'])[2];
  /* 한 칸 틀린 까닭: u 쓴 글자, a 바른 글자, p 그 글자의 소리 정보 */
  function why(u, a, p, prevA) {
    if (!isH(u) || !isH(a)) return 'letter';
    const x = dec(u), y = dec(a);
    if (p && u === p.say && p.why.length) return p.why[0]; /* 소리 나는 대로 썼어요 */
    if (x.jung !== y.jung) return vowKind(x.jung, y.jung);
    if (x.cho !== y.cho) {
      if (TENSE[y.cho] === x.cho) return prevA && isH(prevA) && dec(prevA).jong ? 'tense' : 'dbl';
      if (LAX[y.cho] === x.cho || (y.cho === 'ㅆ' && x.cho === 'ㅅ')) return 'dbl';
      if (ASP[y.cho] === x.cho || ASP[x.cho] === y.cho) return 'h';
      if (y.cho === 'ㅇ' && prevA && isH(prevA) && dec(prevA).jong) return 'yeon';
      return 'letter';
    }
    if (x.jong !== y.jong) {
      if (y.jong === 'ㅆ' || y.jong === 'ㄲ') return 'ss';
      if (DBL[y.jong]) return 'gyeop';
      if (y.jong === 'ㅎ') return 'h';
      if (NASAL[REP[y.jong] || y.jong] === x.jong) return 'nasal';
      if (REP[y.jong] === x.jong || (REP[y.jong] && REP[x.jong] === REP[y.jong])) return 'rep';
      return 'bat';
    }
    return 'letter';
  }
  /* 채점 결과:
   *  ok        글자·띄어쓰기·부호 모두 맞음
   *  letters   { ok, total }
   *  marks     쓴 글 칸마다 'bad' | ''  ·  fix 바른 글 칸마다 'fix' | ''
   *  errs      [{ k, u, a, at }]  (k = TYPES 키: 무엇을 틀렸나)
   *  space     [{ at, miss: true(띄어야 함) | false(붙여야 함) }]  (바른 글 칸 기준)
   *  punct     [{ at, want, got }] */
  function grade(user, answer) {
    const U = cellsOf(user), A = cellsOf(answer);
    const P = pron(answer).filter((x) => x.ch !== ' ' && !PUNCT.test(x.ch));
    const pairs = align(U.chars, A.chars);
    const errs = [], uBad = new Array(U.chars.length).fill(''), aFix = new Array(A.chars.length).fill('');
    const uOf = new Array(A.chars.length).fill(-1);
    let okN = 0;
    pairs.forEach(([ui, ai]) => {
      if (ai >= 0) uOf[ai] = ui;
      if (ui >= 0 && ai >= 0 && U.chars[ui] === A.chars[ai]) { okN++; return; }
      if (ui >= 0) uBad[ui] = 'bad';
      if (ai >= 0) aFix[ai] = 'fix';
      if (ui >= 0 && ai >= 0) errs.push({ k: why(U.chars[ui], A.chars[ai], P[ai], A.chars[ai - 1]), u: U.chars[ui], a: A.chars[ai], at: ai });
      else if (ai >= 0) errs.push({ k: 'miss', u: '', a: A.chars[ai], at: ai });
      else errs.push({ k: 'extra', u: U.chars[ui], a: '', at: -1 });
    });
    /* 이웃 칸을 함께 보고 까닭을 고쳐요 */
    errs.forEach((e, n) => {
      const f = errs[n + 1];
      if (!f || e.at < 0 || f.at !== e.at + 1 || !isH(e.u) || !isH(f.u) || !isH(e.a) || !isH(f.a)) return;
      const u0 = dec(e.u), u1 = dec(f.u), a0 = dec(e.a), a1 = dec(f.a);
      /* 소리 → 솔이: 뒷글자 첫소리를 받침으로 끌어온 '거꾸로 이사' */
      if (!a0.jong && u0.jong && u0.jong === a1.cho && u1.cho === 'ㅇ') { e.k = f.k = 'yeon'; e.back = true; }
      /* 빨갛게 → 빨각에: ㅎ 받침과 뒷글자가 함께 흔들렸어요 */
      if (['ㅎ', 'ㄶ', 'ㅀ'].includes(a0.jong)) e.k = f.k = 'h';
    });
    /* 받침 이사처럼 두 칸이 같이 틀리면 한 번만 */
    const merged = [];
    errs.forEach((e) => {
      const last = merged[merged.length - 1];
      if (last && e.k === last.k && e.at === last.at + last.a.length && e.at >= 0) { last.u += e.u; last.a += e.a; return; }
      merged.push({ ...e });
    });
    /* 띄어쓰기·부호: 바른 글 칸 i 뒤를 비교 (짝이 맞는 칸만) */
    const space = [], punct = [];
    A.chars.forEach((_, i) => {
      const ui = uOf[i];
      if (i < A.chars.length - 1) {
        const uGap = ui >= 0 && uOf[i + 1] === ui + 1 ? U.gapAfter[ui] : null;
        if (uGap != null && uGap !== A.gapAfter[i]) space.push({ at: i, miss: A.gapAfter[i] });
      }
      const got = ui >= 0 ? U.punAfter[ui] : '';
      if (A.punAfter[i] !== (got || '') && (A.punAfter[i] || got)) punct.push({ at: i, want: A.punAfter[i], got });
    });
    const allLetters = okN === A.chars.length && U.chars.length === A.chars.length;
    return {
      ok: allLetters && !space.length && !punct.length,
      lettersOk: allLetters, spaceOk: !space.length, punctOk: !punct.length,
      letters: { ok: okN, total: A.chars.length }, marks: uBad, fix: aFix, errs: merged, space, punct, U, A, uOf,
    };
  }

  /* ---------- 🧩 헷갈리는 글자 조각 ---------- */
  const VOW_SWAP = { ㅓ: ['ㅔ'], ㅐ: ['ㅔ'], ㅔ: ['ㅐ'], ㅖ: ['ㅔ'], ㅒ: ['ㅖ'], ㅚ: ['ㅙ', 'ㅞ'], ㅙ: ['ㅚ', 'ㅞ'], ㅞ: ['ㅙ', 'ㅚ'], ㅟ: ['ㅣ'], ㅢ: ['ㅣ', 'ㅡ'], ㅘ: ['ㅏ'], ㅝ: ['ㅓ'], ㅕ: ['ㅔ'] };
  const JONG_SWAP = { ㅆ: ['ㅅ', 'ㄷ'], ㄲ: ['ㄱ'], ㅅ: ['ㅆ', 'ㄷ'], ㄷ: ['ㅅ'], ㅈ: ['ㄷ', 'ㅅ'], ㅊ: ['ㅅ', 'ㄷ'], ㅌ: ['ㅅ'], ㅍ: ['ㅂ'], ㅋ: ['ㄱ'], ㅎ: ['', 'ㄱ'], ㅂ: ['ㅁ'], ㄱ: ['ㅇ'] };
  /* 글자마다 헷갈리는 짝을 가장 헷갈리는 것부터 */
  function confusables(ch, p) {
    if (!isH(ch)) return [];
    const d = dec(ch), out = [];
    const put = (s) => { const c = com(s); if (c !== ch && !out.includes(c)) out.push(c); };
    if (p && p.say !== ch && isH(p.say)) put(dec(p.say));
    (VOW_SWAP[d.jung] || []).forEach((v) => put({ ...d, jung: v }));
    if (LAX[d.cho]) put({ ...d, cho: LAX[d.cho] });
    if (DBL[d.jong]) { put({ ...d, jong: DBL[d.jong][0] }); put({ ...d, jong: DBL[d.jong][1] }); }
    (JONG_SWAP[d.jong] || []).forEach((j) => put({ ...d, jong: j }));
    if (TENSE[d.cho]) put({ ...d, cho: TENSE[d.cho] }); /* 자세히 → 자쎄히 */
    return out;
  }
  /* 문장에 섞을 헷갈리는 조각들 (max개) */
  function decoys(text, max) {
    const P = pron(text).filter((x) => x.ch !== ' ' && !PUNCT.test(x.ch));
    if (!max) max = Math.max(5, Math.min(10, P.length));
    const have = new Set(P.map((x) => x.ch));
    /* 규칙이 있는 글자 → 눈으로 외우는 글자 → 나머지 순서로, 글자마다 하나씩 돌아가며 */
    const all = [];
    P.forEach((x) => {
      const r = x.why.length ? 0 : charTags(x.ch).length ? 1 : 2;
      confusables(x.ch, x).forEach((c, k) => { if (!have.has(c)) all.push({ c, s: k + r * 0.5 + Math.random() * 0.3 }); });
    });
    const out = [];
    all.sort((a, b) => a.s - b.s).forEach(({ c }) => { if (out.length < max && !out.includes(c)) out.push(c); });
    return out;
  }

  /* ---------- 🔤 자모 조립 ---------- */
  const VOW_JOIN = { ㅗㅏ: 'ㅘ', ㅗㅐ: 'ㅙ', ㅗㅣ: 'ㅚ', ㅜㅓ: 'ㅝ', ㅜㅔ: 'ㅞ', ㅜㅣ: 'ㅟ', ㅡㅣ: 'ㅢ' };
  const isVow = (j) => JUNG.includes(j);
  /* 자모 목록 → 글자 (공백·부호는 그대로) */
  function compose(list) {
    let out = '', cur = null;
    const flush = () => {
      if (!cur) return;
      out += cur.jung && cur.cho ? com({ cho: cur.cho, jung: cur.jung, jong: cur.jong || '' }) : cur.jung || cur.cho;
      cur = null;
    };
    for (const j of list) {
      if (!CHO.includes(j) && !isVow(j) && !JONG.includes(j)) { flush(); out += j; continue; }
      if (isVow(j)) {
        if (!cur) { cur = { jung: j }; flush(); continue; }
        if (cur.cho && !cur.jung) { cur.jung = j; continue; }
        if (cur.jung && !cur.jong) {
          if (VOW_JOIN[cur.jung + j] && cur.cho) { cur.jung = VOW_JOIN[cur.jung + j]; continue; }
          flush(); cur = { jung: j }; flush(); continue;
        }
        if (cur.jong) {
          let move = cur.jong;
          if (DBL[cur.jong]) { [cur.jong, move] = DBL[cur.jong]; } else cur.jong = '';
          flush(); cur = { cho: move, jung: j }; continue;
        }
        flush(); cur = { jung: j }; flush(); continue;
      }
      /* 자음 */
      if (!cur) { cur = { cho: j }; continue; }
      if (!cur.jung) { flush(); cur = { cho: j }; continue; }
      if (!cur.jong) { if (JONG.includes(j) && cur.cho) { cur.jong = j; continue; } flush(); cur = { cho: j }; continue; }
      if (DBL_BY[cur.jong + j]) { cur.jong = DBL_BY[cur.jong + j]; continue; }
      flush(); cur = { cho: j };
    }
    flush();
    return out;
  }

  return { pron, sayAll, tags, charTags, grade, decoys, confusables, compose, cellsOf, isH, dec, com, CHO, JUNG, PUNCT };
})();
