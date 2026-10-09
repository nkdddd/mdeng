/* 또박또박 받아쓰기 — 🤝 친구 · ⚔️ 카드 대결 · 🏪 카드 시장 (Firebase Firestore)
 *
 * 한 이메일(부모님 Google 계정) = 한 가족 계정. 가족 계정끼리 이메일로 친구를 맺어요.
 * 친구 가족의 아이들이 앱을 켜 두면(온라인) 카드 대결을 하고, 언제든 별(⭐)로 카드를 사고팔아요.
 * 별은 앱 안에서만 쓰는 놀이 돈이에요 (진짜 돈과는 상관없어요).
 *
 * Firestore (규칙은 firestore.rules)
 *   emails/<이메일>       { uid }                        이메일로 친구 찾기 (정확한 이메일로만)
 *   profiles/<uid>        { name, kids:[{id,name,avatar}], online:{아이 id: 마지막 시각} }
 *   friends/<uid_uid>     { users:[a,b], from, status:'pending'|'ok', names, emails }
 *   matches/<id>          대결 { users, host, kids, who, stake, status, seed, picks, winner, rounds, settled }
 *   listings/<id>         시장 { seller, sellerKid, sellerName, card, price, status:'open'|'sold'|'cancel', buyer… }
 *
 * 서버 없이 움직여요: 각 가족은 '자기 아이 기록'만 고쳐요.
 *   대결: 카드를 고르는 순간 내 카드를 맡겨 두고(escrow), 이기면 두 장을 받고 지면 그대로 친구 것이 돼요.
 *   시장: 팔려고 내놓은 카드는 맡겨 두고, 팔리면 판 사람이 별을 받아요. 산 사람은 바로 별을 내고 카드를 받아요.
 * 받을 것(이긴 카드, 판 값)은 그 아이가 앱을 열었을 때 들어와요 (js/app.js의 settleSocial).
 */
const SOCIAL = (() => {
  const ONLINE_MS = 75 * 1000;   /* 이 시간 안에 신호가 있으면 온라인 */
  const BEAT_MS = 30 * 1000;     /* 30초마다 "나 여기 있어요" */
  const INVITE_MS = 2 * 60 * 1000; /* 대결 신청은 2분 동안만 */

  const listeners = new Set();
  const emit = (what) => listeners.forEach((f) => { try { f(what); } catch (e) { console.error(e); } });
  const st = { on: false, uid: null, email: '', name: '', kid: null, friends: {}, profiles: {}, matches: {}, mine: {} };
  let db = null, subs = [], profSubs = {}, beat = 0;
  const now = () => Date.now();
  const pairId = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  const warn = (what) => (e) => { console.warn('[social]', what, e); emit('error'); };

  /* ---------- ⚔️ 대결 계산 (두 기기가 같은 seed로 똑같이 계산해요) ---------- */
  /* 힘 = 등급 점수 + 강화 ×2. 점수 차이를 좁혀서 약한 카드도 주사위와 먹이사슬로 뒤집을 수 있어요 */
  const CLASS_POWER = { n: 10, r: 12, a: 14, s: 17, u: 20 };
  /* 🍖 타입 먹이사슬: 왼쪽이 오른쪽을 잡아먹어요 (×1.5).
   * 모든 타입이 딱 3가지를 먹고, 딱 3가지에게 먹혀요 — 어느 타입도 손해 보지 않아요 */
  const FOOD = {
    불꽃: ['풀', '얼음', '강철'], 물: ['불꽃', '땅', '바위'], 풀: ['물', '땅', '바위'], 전기: ['물', '비행', '강철'],
    얼음: ['풀', '드래곤', '비행'], 격투: ['노말', '얼음', '악'], 독: ['풀', '페어리', '고스트'], 땅: ['불꽃', '전기', '독'],
    비행: ['격투', '벌레', '땅'], 에스퍼: ['격투', '독', '노말'], 벌레: ['에스퍼', '악', '페어리'], 바위: ['불꽃', '얼음', '비행'],
    고스트: ['에스퍼', '강철', '벌레'], 드래곤: ['물', '전기', '독'], 악: ['에스퍼', '고스트', '노말'], 강철: ['바위', '페어리', '드래곤'],
    페어리: ['드래곤', '격투', '악'], 노말: ['벌레', '전기', '고스트'],
  };
  /* 🔄 진화 단계 가위바위보 (×1.2): 기본은 날쌔서 덩치 큰 최종 진화를, 최종 진화는 1진화를, 1진화는 기본을 이겨요 */
  const STAGE_NAME = { 1: '기본', 2: '1진화', 3: '최종 진화' };
  const STAGE_EATS = { 1: 3, 3: 2, 2: 1 };
  const FOOD_MUL = 1.5, STAGE_MUL = 1.2;
  const stageOf = (kind) => (/2진화|VMAX|VSTAR|M진화|BREAK|메가진화|V-UNION/.test(kind || '') ? 3 : /1진화|레벨업/.test(kind || '') ? 2 : 1);
  const power = (c) => (CLASS_POWER[c.cls] || 10) + (c.lv || 0) * 2;
  /* a가 b를 만났을 때 받는 배수와 그 이유 */
  function bonus(a, b) {
    let mul = 1;
    const why = [];
    if ((FOOD[a.type] || []).includes(b.type)) { mul *= FOOD_MUL; why.push(`🍖 ${a.type}→${b.type}`); }
    if (a.stage && b.stage && STAGE_EATS[a.stage] === b.stage) { mul *= STAGE_MUL; why.push(`🔄 ${STAGE_NAME[a.stage]}→${STAGE_NAME[b.stage]}`); }
    return { mul, why };
  }
  const edge = (a, b) => bonus(a, b).mul > 1;
  /* 한 판 점수 = 힘 × 주사위 × 먹이사슬 배수 */
  const score = (a, b, die) => Math.round(power(a) * die * bonus(a, b).mul);
  function rng(seed) { /* mulberry32 */
    let t = seed >>> 0;
    return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  /* 3판 2선승. 한 판 = 힘 × 주사위(1~6) × 먹이사슬. 약한 카드도 큰 주사위와 먹이사슬로 이길 수 있어요 */
  function battle(seed, a, b) {
    const r = rng(seed);
    const dice = () => 1 + Math.floor(r() * 6);
    const rounds = [];
    let wa = 0, wb = 0;
    while (wa < 2 && wb < 2 && rounds.length < 9) {
      const da = dice(), db2 = dice();
      const sa = score(a, b, da), sb = score(b, a, db2);
      if (sa === sb) { rounds.push({ da, db: db2, sa, sb, w: -1 }); continue; }
      const w = sa > sb ? 0 : 1;
      if (w === 0) wa++; else wb++;
      rounds.push({ da, db: db2, sa, sb, w });
    }
    return { winner: wa > wb ? 0 : 1, rounds };
  }

  /* ---------- 켜고 끄기 ---------- */
  function stop() {
    subs.forEach((u) => u());
    Object.values(profSubs).forEach((u) => u());
    subs = []; profSubs = {};
    clearInterval(beat);
    Object.assign(st, { on: false, uid: null, email: '', friends: {}, profiles: {}, matches: {}, mine: {} });
    emit('friends'); emit('matches'); emit('listings');
  }
  async function start() {
    const fb = STORE.fb();
    if (!fb.user || !fb.db) { if (st.on) stop(); return; }
    if (st.on && st.uid === fb.user.uid) return;
    if (st.on) stop();
    db = fb.db;
    Object.assign(st, { on: true, uid: fb.user.uid, email: (fb.user.email || '').toLowerCase(), name: fb.user.displayName || (fb.user.email || '').split('@')[0] || '친구' });
    if (st.email) db.collection('emails').doc(st.email).set({ uid: st.uid }).catch(warn('email'));
    publish();
    subs.push(db.collection('friends').where('users', 'array-contains', st.uid).onSnapshot((snap) => {
      st.friends = {};
      snap.forEach((d) => { st.friends[d.id] = { id: d.id, ...d.data() }; });
      watchProfiles();
      emit('friends');
    }, warn('friends')));
    subs.push(db.collection('matches').where('users', 'array-contains', st.uid).onSnapshot((snap) => {
      st.matches = {};
      snap.forEach((d) => { st.matches[d.id] = { id: d.id, ...d.data() }; });
      emit('matches');
    }, warn('matches')));
    subs.push(db.collection('listings').where('seller', '==', st.uid).onSnapshot((snap) => {
      st.mine = {};
      snap.forEach((d) => { st.mine[d.id] = { id: d.id, ...d.data() }; });
      emit('listings');
    }, warn('listings')));
    clearInterval(beat);
    beat = setInterval(heartbeat, BEAT_MS);
    heartbeat();
    emit('friends');
  }
  /* 친구 가족의 아이 목록·온라인 상태를 지켜봐요 */
  function watchProfiles() {
    const want = new Set(friendUids());
    Object.keys(profSubs).forEach((u) => { if (!want.has(u)) { profSubs[u](); delete profSubs[u]; delete st.profiles[u]; } });
    want.forEach((u) => {
      if (profSubs[u]) return;
      profSubs[u] = db.collection('profiles').doc(u).onSnapshot((d) => { st.profiles[u] = d.exists ? d.data() : {}; emit('friends'); }, warn('profile'));
    });
  }
  /* 우리 가족 아이 목록 (친구가 볼 수 있어요: 이름·얼굴만) */
  function publish() {
    if (!st.on) return;
    const kids = STORE.profiles().map(({ id, name, avatar }) => ({ id, name, avatar }));
    db.collection('profiles').doc(st.uid).set({ name: st.name, kids, updatedAt: now() }, { merge: true }).catch(warn('publish'));
  }
  function heartbeat() {
    if (!st.on || !st.kid || document.visibilityState === 'hidden') return;
    db.collection('profiles').doc(st.uid).set({ online: { [st.kid]: now() } }, { merge: true }).catch(warn('beat'));
  }
  /* 지금 공부하는 아이가 바뀌면 */
  function setKid(id) {
    const old = st.kid;
    st.kid = id;
    if (!st.on) return;
    if (old && old !== id) db.collection('profiles').doc(st.uid).set({ online: { [old]: 0 } }, { merge: true }).catch(warn('beat'));
    heartbeat();
  }

  /* ---------- 👫 친구 ---------- */
  const friendUids = () => Object.values(st.friends).filter((f) => f.status === 'ok').map((f) => f.users.find((u) => u !== st.uid));
  function friendList() {
    return Object.values(st.friends).map((f) => {
      const uid = f.users.find((u) => u !== st.uid);
      const p = st.profiles[uid] || {};
      const online = p.online || {};
      return {
        pid: f.id, uid, status: f.status, incoming: f.status === 'pending' && f.from !== st.uid,
        name: p.name || (f.names || {})[uid] || '친구 가족', email: (f.emails || {})[uid] || '',
        kids: f.status === 'ok' ? (p.kids || []).map((k) => ({ ...k, online: now() - (online[k.id] || 0) < ONLINE_MS })) : [],
      };
    }).sort((a, b) => (b.kids.some((k) => k.online) - a.kids.some((k) => k.online)) || a.name.localeCompare(b.name));
  }
  /* 이메일로 친구 신청 → 'sent' | 'accepted' | 'already' | 'pending' | 'self' | 'bad' | 'notfound' */
  async function requestFriend(raw) {
    const email = String(raw || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'bad';
    if (email === st.email) return 'self';
    const e = await db.collection('emails').doc(email).get();
    if (!e.exists) return 'notfound';
    const other = e.data().uid;
    const ref = db.collection('friends').doc(pairId(st.uid, other));
    const cur = await ref.get();
    if (cur.exists) {
      const f = cur.data();
      if (f.status === 'ok') return 'already';
      if (f.from !== st.uid) { await acceptFriend(ref.id); return 'accepted'; }
      return 'pending';
    }
    await ref.set({ users: [st.uid, other], from: st.uid, status: 'pending', names: { [st.uid]: st.name }, emails: { [st.uid]: st.email, [other]: email }, createdAt: now() });
    return 'sent';
  }
  const acceptFriend = (id) => db.collection('friends').doc(id).update({ status: 'ok', ['names.' + st.uid]: st.name, ['emails.' + st.uid]: st.email });
  const removeFriend = (id) => db.collection('friends').doc(id).delete();

  /* ---------- ⚔️ 카드 대결 ---------- */
  const fresh = (m) => m.status !== 'invite' || now() - (m.createdAt || 0) < INVITE_MS;
  /* who: { [uid]: { id, name, avatar } } 두 아이 */
  async function invite(friendUid, me, them, stake) {
    const ref = db.collection('matches').doc();
    await ref.set({
      users: [st.uid, friendUid], host: st.uid, stake: !!stake, status: 'invite',
      kids: { [st.uid]: me.id, [friendUid]: them.id }, who: { [st.uid]: me, [friendUid]: them },
      seed: Math.floor(Math.random() * 2147483647), picks: {}, settled: {}, createdAt: now(), updatedAt: now(),
    });
    return ref.id;
  }
  const respond = (id, yes) => db.collection('matches').doc(id).update({ status: yes ? 'pick' : 'declined', updatedAt: now() });
  /* 카드를 내요. 두 장이 모이면 그 자리에서 승부를 정해요 */
  function pick(id, card) {
    const ref = db.collection('matches').doc(id);
    return db.runTransaction(async (t) => {
      const d = (await t.get(ref)).data();
      if (!d || d.status !== 'pick') throw new Error('closed');
      const picks = { ...(d.picks || {}), [st.uid]: card };
      const upd = { picks, updatedAt: now() };
      /* 두 카드가 모이면 👆 탭 대결 시작 (js/tapbattle.js — 우리집 학습플래너와 같은 규칙) */
      if (picks[d.users[0]] && picks[d.users[1]]) Object.assign(upd, TapBattle.startFields());
      t.update(ref, upd);
      return upd.status || 'pick';
    });
  }
  /* 🎲 한 판 굴렸어요 (who: 나, 또는 기다리다 지쳐서 친구 대신). 두 사람 다 끝까지 굴리면 대결 끝 */
  function roll(id, who, n) {
    const ref = db.collection('matches').doc(id);
    return db.runTransaction(async (t) => {
      const d = (await t.get(ref)).data();
      if (!d || d.status !== 'roll') return false;
      const rolled = { ...(d.rolled || {}) };
      rolled[who] = Math.max(rolled[who] || 0, n);
      const upd = { rolled, updatedAt: now() };
      if (d.users.every((u) => (rolled[u] || 0) >= d.rounds.length)) upd.status = 'done';
      t.update(ref, upd);
      return true;
    });
  }
  /* 👆 한 판 탭 수 내기 (round: 0부터, who: 나 또는 오래 안 오는 친구를 0번으로) */
  function tap(id, who, round, n) {
    const ref = db.collection('matches').doc(id);
    return db.runTransaction(async (t) => {
      const d = (await t.get(ref)).data();
      const upd = TapBattle.addTaps(d, who, round, n);
      if (upd) t.update(ref, upd);
      return !!upd;
    });
  }
  /* 예전 주사위 대결(굴리는 중)을 그만해요 — 건 카드는 settleSocial에서 돌아와요 */
  const drop = (id) => db.collection('matches').doc(id).update({ status: 'cancel', updatedAt: now() });
  function cancel(id) {
    const ref = db.collection('matches').doc(id);
    return db.runTransaction(async (t) => {
      const d = (await t.get(ref)).data();
      if (!d || !['invite', 'pick'].includes(d.status)) return false; /* 주사위를 굴리기 시작하면 끝까지 해요 */
      t.update(ref, { status: 'cancel', updatedAt: now() });
      return true;
    });
  }
  /* 내 쪽 정리가 끝났다고 표시. 둘 다 끝나면 기록을 지워요 */
  async function settled(id) {
    const ref = db.collection('matches').doc(id);
    const m = st.matches[id];
    const other = m && m.users.find((u) => u !== st.uid);
    if (m && m.settled && m.settled[other]) await ref.delete().catch(warn('delete'));
    else await ref.update({ ['settled.' + st.uid]: true }).catch(warn('settled'));
  }

  /* ---------- 🏪 카드 시장 ---------- */
  const sell = (kid, card, price) => db.collection('listings').add({
    seller: st.uid, sellerKid: kid.id, sellerName: kid.name, sellerAvatar: kid.avatar, card, price, status: 'open', createdAt: now(),
  });
  /* 친구 가족들이 내놓은 카드 ('in' 조건은 10명씩) */
  async function market() {
    const uids = friendUids();
    const out = [];
    for (let i = 0; i < uids.length; i += 10) {
      const snap = await db.collection('listings').where('seller', 'in', uids.slice(i, i + 10)).where('status', '==', 'open').get();
      snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    }
    return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  function buy(id, kid) {
    const ref = db.collection('listings').doc(id);
    return db.runTransaction(async (t) => {
      const d = (await t.get(ref)).data();
      if (!d || d.status !== 'open') throw new Error('gone');
      t.update(ref, { status: 'sold', buyer: st.uid, buyerKid: kid.id, buyerName: kid.name, soldAt: now() });
      return d;
    });
  }
  function unlist(id) {
    const ref = db.collection('listings').doc(id);
    return db.runTransaction(async (t) => {
      const d = (await t.get(ref)).data();
      if (!d || d.status !== 'open') return false;
      t.update(ref, { status: 'cancel' });
      return true;
    });
  }
  const removeListing = (id) => db.collection('listings').doc(id).delete().catch(warn('unlist'));

  return {
    ONLINE_MS, power, edge, bonus, stageOf, FOOD, STAGE_NAME, battle, fresh,
    on(f) { listeners.add(f); },
    get ready() { return st.on; },
    get uid() { return st.uid; },
    get email() { return st.email; },
    matches: () => Object.values(st.matches),
    match: (id) => st.matches[id],
    myListings: () => Object.values(st.mine),
    start, stop, publish, setKid,
    friendList, requestFriend, acceptFriend, removeFriend,
    invite, respond, pick, roll, tap, drop, cancel, settled,
    sell, market, buy, unlist, removeListing,
  };
})();
