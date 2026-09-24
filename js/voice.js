/* 또박또박 받아쓰기 — 말 조각 이름표
 * 브라우저와 녹음 파일 만드는 스크립트(tools/make-audio.mjs)가 함께 써요.
 * 같은 말이면 같은 파일 이름(key)이 나와요.
 */
const VOICE = (() => {
  const norm = (s) => String(s)
    .replace(/\p{Extended_Pictographic}|️|‍|[[\]]/gu, '')
    .replace(/\s+/g, ' ').trim();

  /* FNV-1a 32비트 */
  const key = (s) => {
    const t = norm(s);
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };

  const batchim = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 > 0; };

  /* 앱이 말할 수 있는 모든 조각 */
  function allPhrases() {
    const out = new Set();
    const add = (s) => { const n = norm(s); if (n) out.add(n); };
    Object.values(LINES).forEach((v) => { if (typeof v === 'string') add(v); else if (Array.isArray(v)) v.forEach(add); });
    Object.values(TYPES).forEach((t) => add(LINES.typeCard(t)));
    for (let n = 1; n <= 10; n++) add(LINES.bookLeft(n));
    const totals = new Set([...Object.values(QUIZ_SIZE), ...DICTATION.map((d) => d.items.length)]);
    for (let t = 1; t <= QUIZ_SIZE.poke * 2; t++) totals.add(t); /* 포켓몬은 도망친 포켓몬이 다시 나와서 문제 수가 늘어요 */
    totals.forEach((t) => { for (let s = 0; s <= t; s++) add(LINES.score(t, s)); });
    BADGES.forEach(([b]) => add(LINES.badge(b)));
    DICTATION.forEach((d) => d.items.forEach((q) => add(q.t)));
    SOUNDS.forEach((q) => { add(q.w); add(LINES.soundAnswer(q.s, q.w)); add(q.tip); });
    VOWELS.forEach((q) => add(q.w));
    SPACING.forEach((q) => add(q.t));
    FUNNY.forEach((f) => { add(f.a[0]); add(f.a[2]); add(f.b[0]); add(f.b[2]); });
    add(LINES.appear('포켓몬', '이'));
    POKEMON.forEach(([n, , , , genus]) => {
      add(n);
      add(genus);
      add(LINES.caught(n, batchim(n) ? '을' : '를'));
      add(LINES.fled(n, batchim(n) ? '이' : '가'));
      add(LINES.reappear(n, batchim(n) ? '이' : '가'));
      add(LINES.gotBall(n, batchim(n) ? '을' : '를'));
      POKE_JOSA.forEach((j) => { if (!j[2].startsWith(n)) add(j[2] + n + (batchim(n) ? j[0] : j[1]) + j[3]); });
    });
    NOUNS.forEach(([noun]) => {
      add(noun);
      JOSA.forEach((j) => {
        const form = noun + (batchim(noun) ? j[0] : j[1]);
        if (j[2]) add(form + j[2]); else add(form);
      });
    });
    return [...out];
  }

  return { norm, key, allPhrases };
})();
