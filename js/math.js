/* 또박또박 수학 — 🔢 구구단 · 사칙연산 문제 만들기 (화면은 js/app.js의 수학 섬)
 *
 * 섬마다 단계(level)가 있고, 단계마다 문제를 새로 만들어요 (외우는 게 아니라 매번 달라요).
 * 문제: { a, b, op, ans, blank, text, say, why }
 *   op    '+', '-', '×', '÷'
 *   blank 어디가 빈칸인지: 'ans'(보통) · 'a' · 'b' (□ 채우기)
 *   say   읽어 줄 말 ("칠 곱하기 팔은?")
 * 레벨 id는 국어 단계와 겹치지 않게 m으로 시작해요 (별·최고 점수·난이도 표에 그대로 써요).
 */
const MATH = (() => {
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* 숫자를 한자어로 읽기: 56 → 오십육, 100 → 백 */
  const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  function ko(n) {
    if (n === 0) return '영';
    let s = '';
    const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
    if (h) s += (h > 1 ? D[h] : '') + '백';
    if (t) s += (t > 1 ? D[t] : '') + '십';
    if (o) s += D[o];
    return s;
  }
  const batchim = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c % 28 !== 0; };
  const eun = (w) => (batchim(w) ? '은' : '는');
  const OPW = { '+': '더하기', '-': '빼기', '×': '곱하기', '÷': '나누기' };
  /* 구구단 노래: 이 삼은 육 · 칠 팔 오십육 */
  const chant = (a, b) => `${ko(a)} ${ko(b)}${a * b < 10 ? eun(ko(b)) : ''} ${ko(a * b)}`;

  function make(a, op, b, blank = 'ans') {
    const ans = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : a / b;
    const shown = { a: blank === 'a' ? '□' : a, b: blank === 'b' ? '□' : b, ans: blank === 'ans' ? '?' : ans };
    const want = blank === 'a' ? a : blank === 'b' ? b : ans;
    const text = `${shown.a} ${op} ${shown.b} = ${shown.ans}`;
    const sayA = blank === 'a' ? '몇' : ko(a), sayB = blank === 'b' ? '몇' : ko(b);
    const say = blank === 'ans' ? `${sayA} ${OPW[op]} ${sayB}${eun(sayB)}?` : `${sayA} ${OPW[op]} ${sayB}${eun(sayB)} ${ko(ans)}. 빈칸은?`;
    return { a, b, op, ans, blank, want, text, say, key: `${a}${op}${b}${blank}` };
  }
  /* 겹치지 않게 n개 */
  function many(n, gen) {
    const out = [], seen = new Set();
    for (let t = 0; out.length < n && t < n * 40; t++) {
      const q = gen();
      if (seen.has(q.key)) continue;
      seen.add(q.key);
      out.push(q);
    }
    return out;
  }
  const times = (dans, blank) => () => { const a = dans[ri(0, dans.length - 1)], b = ri(1, 9); return make(a, '×', b, blank ? blank() : 'ans'); };

  /* 섬 → 단계들 (diff: 1 쉬움 ~ 4 도전) */
  const ISLANDS = {
    gugu: [
      ...[2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ id: 'mg' + d, icon: `${d}`, name: `${d}단`, desc: `${d} × 1 ~ ${d} × 9`, diff: d <= 2 || d === 5 ? 1 : d <= 4 ? 2 : 3,
        gen: (n) => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, n).map((b) => make(d, '×', b)) })),
      { id: 'mgA', icon: '🎲', name: '2~5단 섞기', desc: '앞쪽 단 섞어서', diff: 2, gen: (n) => many(n, times([2, 3, 4, 5])) },
      { id: 'mgB', icon: '🎲', name: '6~9단 섞기', desc: '뒤쪽 단 섞어서', diff: 3, gen: (n) => many(n, times([6, 7, 8, 9])) },
      { id: 'mgZ', icon: '🏆', name: '구구단 왕', desc: '2~9단 모두', diff: 4, gen: (n) => many(n, times([2, 3, 4, 5, 6, 7, 8, 9])) },
    ],
    plus: [
      { id: 'mp1', icon: '🍎', name: '10까지 더하기', desc: '3 + 4', diff: 1, gen: (n) => many(n, () => { const a = ri(1, 8); return make(a, '+', ri(1, 10 - a)); }) },
      { id: 'mp2', icon: '🔟', name: '10 만들기', desc: '7 + □ = 10', diff: 1, gen: (n) => many(n, () => { const a = ri(1, 9); return make(a, '+', 10 - a, 'b'); }) },
      { id: 'mp3', icon: '🚀', name: '받아올림 덧셈', desc: '8 + 5', diff: 2, gen: (n) => many(n, () => { const a = ri(2, 9); return make(a, '+', ri(11 - a, 9)); }) },
      { id: 'mp4', icon: '🧱', name: '두 자리 + 한 자리', desc: '27 + 5', diff: 3, gen: (n) => many(n, () => make(ri(11, 89), '+', ri(2, 9))) },
      { id: 'mp5', icon: '🏔️', name: '두 자리 + 두 자리', desc: '38 + 24', diff: 4, gen: (n) => many(n, () => { const a = ri(11, 79); return make(a, '+', ri(11, 99 - a)); }) },
    ],
    minus: [
      { id: 'mm1', icon: '🍪', name: '10까지 빼기', desc: '8 - 3', diff: 1, gen: (n) => many(n, () => { const a = ri(2, 10); return make(a, '-', ri(1, a - 1)); }) },
      { id: 'mm2', icon: '🔟', name: '10에서 빼기', desc: '10 - □ = 4', diff: 1, gen: (n) => many(n, () => make(10, '-', ri(1, 9), 'b')) },
      { id: 'mm3', icon: '🪜', name: '받아내림 뺄셈', desc: '13 - 5', diff: 2, gen: (n) => many(n, () => { const b = ri(2, 9); return make(ri(11, b + 9), '-', b); }) },
      { id: 'mm4', icon: '🧱', name: '두 자리 - 한 자리', desc: '42 - 7', diff: 3, gen: (n) => many(n, () => make(ri(20, 99), '-', ri(2, 9))) },
      { id: 'mm5', icon: '🏔️', name: '두 자리 - 두 자리', desc: '63 - 28', diff: 4, gen: (n) => many(n, () => { const b = ri(11, 69); return make(ri(b + 3, 99), '-', b); }) },
    ],
    times: [
      { id: 'mt1', icon: '✖️', name: '구구단 섞기', desc: '2~9단 곱셈', diff: 2, gen: (n) => many(n, times([2, 3, 4, 5, 6, 7, 8, 9])) },
      { id: 'mt2', icon: '🔍', name: '□ 찾기', desc: '4 × □ = 28', diff: 3, gen: (n) => many(n, times([2, 3, 4, 5, 6, 7, 8, 9], () => (Math.random() < 0.5 ? 'a' : 'b'))) },
      { id: 'mt3', icon: '🏔️', name: '두 자리 × 한 자리', desc: '14 × 3', diff: 4, gen: (n) => many(n, () => make(ri(11, 32), '×', ri(2, 5))) },
    ],
    divide: [
      { id: 'md1', icon: '🍕', name: '똑같이 나누기', desc: '12 ÷ 3', diff: 2, gen: (n) => many(n, () => { const b = ri(2, 5), q = ri(1, 9); return make(b * q, '÷', b); }) },
      { id: 'md2', icon: '➗', name: '구구단으로 나누기', desc: '56 ÷ 8', diff: 3, gen: (n) => many(n, () => { const b = ri(2, 9), q = ri(2, 9); return make(b * q, '÷', b); }) },
      { id: 'md3', icon: '🔍', name: '□ 찾기', desc: '□ ÷ 6 = 7', diff: 4, gen: (n) => many(n, () => { const b = ri(2, 9), q = ri(2, 9); return make(b * q, '÷', b, Math.random() < 0.5 ? 'a' : 'b'); }) },
    ],
    mix: [
      { id: 'mx1', icon: '⚖️', name: '덧셈·뺄셈', desc: '20까지 섞어서', diff: 2, gen: (n) => many(n, () => (Math.random() < 0.5
        ? (() => { const a = ri(2, 15); return make(a, '+', ri(1, 20 - a)); })()
        : (() => { const a = ri(5, 20); return make(a, '-', ri(1, a - 1)); })())) },
      { id: 'mx2', icon: '🌈', name: '사칙연산 섞기', desc: '+ − × ÷ 모두', diff: 3, gen: (n) => many(n, () => {
        const k = ri(0, 3);
        if (k === 0) { const a = ri(5, 60); return make(a, '+', ri(2, 30)); }
        if (k === 1) { const b = ri(2, 30); return make(ri(b + 1, 80), '-', b); }
        if (k === 2) return times([2, 3, 4, 5, 6, 7, 8, 9])();
        const b = ri(2, 9); return make(b * ri(2, 9), '÷', b);
      }) },
      { id: 'mx3', icon: '👑', name: '수학 왕 도전', desc: '빈칸까지 섞어서', diff: 4, gen: (n) => many(n, () => {
        const blank = ['ans', 'ans', 'a', 'b'][ri(0, 3)];
        const k = ri(0, 3);
        if (k === 0) { const a = ri(11, 60); return make(a, '+', ri(11, 39), blank); }
        if (k === 1) { const b = ri(11, 40); return make(ri(b + 3, 99), '-', b, blank); }
        if (k === 2) return times([3, 4, 6, 7, 8, 9], () => blank)();
        const b = ri(3, 9); return make(b * ri(3, 9), '÷', b, blank);
      }) },
    ],
  };
  const ALL = Object.values(ISLANDS).flat();
  const BY = Object.fromEntries(ALL.map((l) => [l.id, l]));
  const SIZE = 8; /* 한 판에 8문제 */

  return { ISLANDS, ALL, BY, SIZE, ko, chant, eun, OPW, make, questions: (id) => BY[id].gen(SIZE) };
})();
