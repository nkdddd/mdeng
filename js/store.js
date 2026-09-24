/* 또박또박 받아쓰기 — 저장 (아이 프로필 + 가족 계정 동기화)
 *
 * 이 기기: localStorage에 아이마다 따로 저장해요.
 *   ttobak-profiles      { list: [{ id, name, avatar }], current }
 *   ttobak-v1:<아이 id>   그 아이의 별·도감·점수
 * 가족 계정: js/firebase-config.js가 채워져 있으면 부모님이 Google로 로그인해서
 *   Firestore users/<부모 uid>/kids/<아이 id> = { name, avatar, state, updatedAt } 로 맞춰요.
 *   더 늦게 바뀐 쪽(updatedAt)이 이겨요.
 */
const STORE = (() => {
  const PKEY = 'ttobak-profiles';
  const SKEY = (id) => 'ttobak-v1:' + id;
  const OLD_KEY = 'ttobak-v1';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const AVATARS = ['🐻', '🐰', '🦊', '🐼', '🐯', '🐸', '🐧', '🦄', '🐱', '🐶', '🐹', '🦁'];

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장소를 못 쓰면 이번만 기억 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };
  const newId = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  /* 아직 아무것도 안 한 프로필 */
  const isBlank = (st) => !st || (!(st.earned || st.stars) && !(st.dex || []).length && !Object.keys(st.best || {}).length);

  /* 처음이거나 예전 버전(프로필 없음)이면 '나' 프로필을 만들고 예전 기록을 옮겨요 */
  let P = ls.get(PKEY);
  if (!P || !Array.isArray(P.list) || !P.list.length) {
    const id = newId();
    const old = ls.get(OLD_KEY);
    P = { list: [{ id, name: '나', avatar: '🐻' }], current: id };
    if (old) ls.set(SKEY(id), old);
    ls.set(PKEY, P);
  }
  if (!P.list.some((p) => p.id === P.current)) P.current = P.list[0].id;
  const saveP = () => ls.set(PKEY, P);

  const listeners = new Set();
  const emit = (what) => listeners.forEach((f) => { try { f(what); } catch (e) { console.error(e); } });

  /* ---------- 가족 계정 (Firebase) ---------- */
  const cloud = { enabled: !!window.FIREBASE_CONFIG, ready: false, user: null, status: 'off' };
  let auth = null, db = null;
  const timers = {};
  const setStatus = (s) => { cloud.status = s; emit('status'); };
  const kids = () => db.collection('users').doc(cloud.user.uid).collection('kids');
  const loadScript = (src) => new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => no(new Error('불러오기 실패: ' + src));
    document.head.appendChild(s);
  });

  async function push(id) {
    if (!cloud.user) return;
    const p = P.list.find((x) => x.id === id);
    if (!p) return;
    const state = ls.get(SKEY(id)) || {};
    if (!state.updatedAt) { state.updatedAt = Date.now(); ls.set(SKEY(id), state); }
    /* Firestore는 undefined를 못 받아서 JSON으로 한 번 걸러요 */
    await kids().doc(id).set({ name: p.name, avatar: p.avatar, state: JSON.parse(JSON.stringify(state)), updatedAt: state.updatedAt });
  }
  function schedulePush(id) {
    if (!cloud.user) return;
    clearTimeout(timers[id]);
    setStatus('dirty');
    timers[id] = setTimeout(async () => {
      try { setStatus('syncing'); await push(id); setStatus('synced'); } catch (e) { console.error(e); setStatus('error'); }
    }, 1500);
  }

  /* 클라우드와 이 기기를 맞춰요 */
  async function pullAll() {
    if (!cloud.user) return;
    setStatus('syncing');
    try {
      const snap = await kids().get();
      const remote = {};
      snap.forEach((d) => { remote[d.id] = d.data(); });
      let currentChanged = false;
      /* 새 기기의 빈 '나' 프로필은 클라우드에 아이가 있으면 정리해요 */
      if (Object.keys(remote).length) {
        P.list = P.list.filter((p) => remote[p.id] || !isBlank(ls.get(SKEY(p.id))));
      }
      Object.entries(remote).forEach(([id, r]) => {
        const local = ls.get(SKEY(id));
        let p = P.list.find((x) => x.id === id);
        if (!p) { p = { id, name: r.name, avatar: r.avatar }; P.list.push(p); }
        if (!local || (r.updatedAt || 0) > (local.updatedAt || 0)) {
          p.name = r.name;
          p.avatar = r.avatar;
          ls.set(SKEY(id), { ...(r.state || {}), updatedAt: r.updatedAt || 0 });
          if (id === P.current) currentChanged = true;
        }
      });
      if (!P.list.some((p) => p.id === P.current)) { P.current = P.list[0].id; currentChanged = true; }
      saveP();
      /* 이 기기에만 있거나 더 새로운 것은 올려요 */
      for (const p of P.list) {
        const local = ls.get(SKEY(p.id)) || {};
        const r = remote[p.id];
        if (!r || (local.updatedAt || 0) > (r.updatedAt || 0) || r.name !== p.name || r.avatar !== p.avatar) await push(p.id);
      }
      setStatus('synced');
      emit(currentChanged ? 'current' : 'profiles');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  async function initCloud() {
    if (!cloud.enabled) return;
    setStatus('loading');
    try {
      await loadScript(SDK + 'firebase-app-compat.js');
      await Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
      firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      try { await auth.getRedirectResult(); } catch (e) { console.warn(e); }
      cloud.ready = true;
      setStatus('ready');
      auth.onAuthStateChanged((u) => {
        cloud.user = u;
        emit('user');
        if (u) pullAll(); else setStatus('ready');
      });
      /* 다른 기기에서 공부하고 돌아오면 다시 맞춰요 */
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cloud.user) pullAll(); });
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  return {
    AVATARS,
    cloud,
    on(f) { listeners.add(f); },
    profiles: () => P.list.slice(),
    current: () => P.list.find((p) => p.id === P.current),
    load: (id) => ls.get(SKEY(id || P.current)) || {},
    save(state) {
      state.updatedAt = Date.now();
      ls.set(SKEY(P.current), state);
      schedulePush(P.current);
    },
    use(id) {
      if (!P.list.some((p) => p.id === id)) return;
      P.current = id;
      saveP();
    },
    add(name, avatar) {
      const id = newId();
      P.list.push({ id, name: name || '친구', avatar: avatar || AVATARS[P.list.length % AVATARS.length] });
      saveP();
      ls.set(SKEY(id), { stars: 0, best: {}, updatedAt: Date.now() });
      schedulePush(id);
      emit('profiles');
      return id;
    },
    update(id, fields) {
      const p = P.list.find((x) => x.id === id);
      if (!p) return;
      Object.assign(p, fields);
      saveP();
      const st = ls.get(SKEY(id)) || {};
      st.updatedAt = Date.now();
      ls.set(SKEY(id), st);
      schedulePush(id);
      emit('profiles');
    },
    async remove(id) {
      if (P.list.length <= 1) return false;
      const wasCurrent = P.current === id;
      P.list = P.list.filter((p) => p.id !== id);
      if (P.current === id) P.current = P.list[0].id;
      saveP();
      ls.del(SKEY(id));
      if (cloud.user) { try { await kids().doc(id).delete(); } catch (e) { console.error(e); } }
      emit(wasCurrent ? 'current' : 'profiles');
      return true;
    },
    async signIn() {
      if (!auth) return;
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
      } catch (e) {
        /* 팝업이 막힌 기기(아이패드 앱 속 브라우저 등)는 페이지를 옮겨서 로그인 */
        if (/popup|operation-not-supported/.test(e.code || '')) await auth.signInWithRedirect(provider);
        else throw e;
      }
    },
    signOut: () => auth && auth.signOut(),
    sync: pullAll,
    init: initCloud,
  };
})();
