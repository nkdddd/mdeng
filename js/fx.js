/* 또박또박 받아쓰기 — 카드 뽑기 효과 (번개 · 불꽃 · 물보라 …)
 * 화면 위에 캔버스를 잠깐 띄워서 그려요. 동영상 파일 없이 그때그때 그려서 가볍고 인터넷이 없어도 돼요.
 *   CardFX.play(타입, 카드 등급, 카드 요소) → 효과가 가장 센 순간(카드를 뒤집을 때)에 끝나는 Promise
 */
const CardFX = (() => {
  /* 포켓몬 타입 → 효과 */
  const FAMILY = {
    전기: 'bolt', 불꽃: 'fire', 물: 'water', 풀: 'leaf', 벌레: 'leaf', 얼음: 'ice',
    에스퍼: 'psy', 페어리: 'psy', 고스트: 'smoke', 악: 'smoke', 독: 'smoke', 드래곤: 'dragon',
    바위: 'rock', 땅: 'rock', 격투: 'rock', 강철: 'rock', 노말: 'spark', 비행: 'spark',
  };
  /* 카드 등급이 높을수록 크게 */
  const POWER = { n: 0.55, r: 0.8, a: 1.1, s: 1.45, u: 1.8 };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- 소리 (Web Audio로 만든 효과음) ---------- */
  let actx = null;
  function noise(dur, { type = 'lowpass', from = 2000, to = 400, gain = 0.3, q = 1, delay = 0 } = {}) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + delay;
      const len = Math.floor(actx.sampleRate * dur);
      const buf = actx.createBuffer(1, len, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = actx.createBufferSource();
      src.buffer = buf;
      const f = actx.createBiquadFilter();
      f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(actx.destination);
      src.start(t); src.stop(t + dur);
    } catch (e) { /* 소리 없이 */ }
  }
  function tone(freqs, { wave = 'sine', gain = 0.12, step = 0.07, len = 0.25, delay = 0 } = {}) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach((fq, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + delay + i * step;
        o.type = wave; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + len + 0.05);
      });
    } catch (e) { /* 소리 없이 */ }
  }
  const SOUND = {
    bolt: () => { noise(0.18, { type: 'highpass', from: 3000, to: 1500, gain: 0.35 }); noise(0.25, { type: 'highpass', from: 2500, to: 800, gain: 0.3, delay: 0.22 }); noise(0.5, { type: 'lowpass', from: 900, to: 80, gain: 0.45, delay: 0.45 }); },
    fire: () => { noise(1.1, { type: 'lowpass', from: 300, to: 1800, gain: 0.3 }); noise(0.6, { type: 'bandpass', from: 1200, to: 300, gain: 0.25, delay: 0.4 }); },
    water: () => { noise(0.5, { type: 'bandpass', from: 2500, to: 400, gain: 0.35, q: 2, delay: 0.3 }); tone([600, 900, 750, 1100], { gain: 0.05, step: 0.09, len: 0.12, delay: 0.5 }); },
    leaf: () => { noise(0.9, { type: 'bandpass', from: 800, to: 3000, gain: 0.18, q: 3 }); tone([660, 880], { gain: 0.06, delay: 0.4 }); },
    ice: () => { tone([1568, 2093, 2637, 3136], { wave: 'triangle', gain: 0.07, step: 0.06, delay: 0.3 }); noise(0.3, { type: 'highpass', from: 5000, to: 3000, gain: 0.15, delay: 0.35 }); },
    psy: () => { tone([392, 523, 659, 784, 1047], { gain: 0.07, step: 0.08, len: 0.4 }); },
    smoke: () => { noise(1.0, { type: 'lowpass', from: 200, to: 600, gain: 0.3 }); tone([220, 185], { wave: 'triangle', gain: 0.07, step: 0.25, len: 0.5, delay: 0.3 }); },
    dragon: () => { noise(0.9, { type: 'lowpass', from: 200, to: 1200, gain: 0.35 }); tone([196, 294, 392], { wave: 'sawtooth', gain: 0.04, step: 0.1, len: 0.4, delay: 0.4 }); },
    rock: () => { noise(0.35, { type: 'lowpass', from: 400, to: 60, gain: 0.55, delay: 0.35 }); noise(0.2, { type: 'lowpass', from: 300, to: 60, gain: 0.35, delay: 0.6 }); },
    spark: () => { tone([1047, 1319, 1568, 2093], { gain: 0.07, step: 0.06 }); },
  };

  /* ---------- 캔버스 ---------- */
  let cv = null, ctx = null, raf = 0, W = 0, H = 0, dpr = 1, dim = null;
  let parts = [], bolts = [], rings = [], flash = 0, flashColor = '255,255,255', endAt = 0;
  function mount() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.className = 'fx-canvas';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    /* 뒤를 어둡게 해서 빛이 잘 보이게 (카드는 그 위에 밝게) */
    dim = document.createElement('div');
    dim.className = 'fx-dim';
    document.body.appendChild(dim);
    document.body.classList.add('fx-on');
    ctx = cv.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function unmount() {
    cancelAnimationFrame(raf); raf = 0;
    removeEventListener('resize', resize);
    cv && cv.remove();
    if (dim) { const d = dim; d.classList.add('out'); setTimeout(() => d.remove(), 400); }
    document.body.classList.remove('fx-on');
    cv = null; dim = null; parts = []; bolts = []; rings = []; flash = 0;
  }

  /* 알갱이: 모양 shape, 속도, 수명(ms), 중력, 공기 저항 */
  function add(p) {
    parts.push(Object.assign({ vx: 0, vy: 0, g: 0, drag: 1, size: 4, grow: 0, rot: 0, vr: 0, age: 0, life: 1000, glow: false, alpha: 1, color: '#fff', colors: null }, p));
  }
  function burst(x, y, n, make) { for (let i = 0; i < n; i++) add(make(i, n, x, y)); }
  /* 번개: 가운데를 흔들어서 지그재그 선 */
  function boltPath(x1, y1, x2, y2, rough) {
    let pts = [[x1, y1], [x2, y2]];
    for (let k = 0; k < 6; k++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const off = (Math.random() - 0.5) * rough / (k + 1);
        next.push([(ax + bx) / 2 + off, (ay + by) / 2 + off * 0.3], [bx, by]);
      }
      pts = next;
    }
    return pts;
  }
  function strike(x, y, P) {
    const sx = x + rand(-W * 0.35, W * 0.35);
    bolts.push({ pts: boltPath(sx, -20, x, y, 160), age: 0, life: 220, width: 4 * P });
    if (Math.random() < 0.7) bolts.push({ pts: boltPath(x + rand(-60, 60), y - rand(80, 180), x + rand(-120, 120), y + rand(40, 120), 60), age: 0, life: 160, width: 2 * P });
    flash = 0.55 * Math.min(1, P); flashColor = '255,250,200';
  }

  /* ---------- 효과별 연출 (t: 시작부터 ms, x·y: 카드 가운데) ---------- */
  const SCRIPT = {
    bolt(x, y, P, at) {
      at(0, () => strike(x, y, P));
      at(230, () => strike(x, y, P));
      at(460, () => {
        strike(x, y, P);
        burst(x, y, 40 * P, () => { const a = rand(0, 6.28), s = rand(3, 11) * P; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.12, drag: 0.95, life: rand(400, 900), size: rand(2, 4), color: pickOf(['#fff7b0', '#ffe14d', '#ffffff', '#9be7ff']), glow: true, shape: 'spark' }; });
      });
      if (P > 1) at(750, () => strike(x, y, P * 0.8));
      return 520;
    },
    fire(x, y, P, at) {
      /* 아래에서 불꽃이 솟아오르다가, 카드에서 확 터져요 */
      at(460, () => {
        burst(x, y, 50 * P, () => { const a = rand(0, 6.28), s = rand(2, 9) * P; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: -0.04, drag: 0.96, life: rand(500, 1000), size: rand(8, 18), grow: -0.015, colors: ['#fff3a0', '#ffb020', '#ff4d1f', '#8b000000'], glow: true, shape: 'flame' }; });
        flash = 0.3; flashColor = '255,200,120';
      });
      return { peak: 480, tick: (t) => {
        if (t < 1300) for (let i = 0; i < 4 * P; i++) add({ x: rand(0, W), y: H + 10, vx: rand(-0.6, 0.6), vy: rand(-7, -3.5), drag: 0.99, life: rand(700, 1300), size: rand(10, 26) * P, grow: -0.012, colors: ['#fff3a0', '#ffb020', '#ff5a1f', '#b3121266'], glow: true, shape: 'flame' });
      } };
    },
    water(x, y, P, at) {
      at(380, () => {
        burst(x, y, 70 * P, () => { const a = rand(-3.1, 0.05), s = rand(4, 13) * P; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.32, drag: 0.99, life: rand(700, 1300), size: rand(3, 7), color: pickOf(['#bfe9ff', '#5ab8ff', '#2f8fe0', '#ffffff']), shape: 'drop' }; });
        [0, 140, 280].forEach((d, k) => rings.push({ x, y, r: 10, vr: 5 + k, age: -d, life: 900, color: '120,200,255', width: 4 - k }));
        flash = 0.25; flashColor = '180,225,255';
      });
      return { peak: 420, tick: (t) => { if (t < 1400 && Math.random() < 0.5 * P) add({ x: rand(0, W), y: H + 10, vx: rand(-0.3, 0.3), vy: rand(-3, -1.5), life: 1600, size: rand(4, 12), color: '#8fd3ff', shape: 'bubble' }); } };
    },
    leaf(x, y, P, at) {
      at(0, () => burst(x, y, 36 * P, (i, n) => ({ x, y, orbit: { a: (i / n) * 6.28, r: rand(20, 60), vr: rand(2.2, 3.6), va: rand(0.05, 0.09) }, life: rand(1100, 1700), size: rand(8, 14), rot: rand(0, 6), vr2: rand(-0.2, 0.2), color: pickOf(['#4caf50', '#7bd66b', '#2e8b3e', '#b5e86b']), shape: 'leaf' })));
      return 500;
    },
    ice(x, y, P, at) {
      at(420, () => {
        burst(x, y, 26 * P, (i, n) => { const a = (i / n) * 6.28, s = rand(5, 10) * P; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.93, life: 700, size: rand(12, 22), rot: a, color: '#e6f7ff', glow: true, shape: 'shard' }; });
        flash = 0.4; flashColor = '220,245,255';
      });
      return { peak: 460, tick: (t) => { if (t < 1500 && Math.random() < 0.8 * P) add({ x: rand(0, W), y: -10, vx: rand(-0.6, 0.6), vy: rand(1.5, 3.5), life: 2000, size: rand(4, 9), rot: rand(0, 6), vr: rand(-0.05, 0.05), color: '#ffffff', shape: 'flake' }); } };
    },
    psy(x, y, P, at) {
      at(0, () => burst(x, y, 40 * P, (i, n) => ({ x, y, spiral: { a: (i / n) * 12.56, r: rand(220, 320) }, life: 520, size: rand(4, 8), color: pickOf(['#ff9ad5', '#c084fc', '#f0abfc', '#ffffff']), glow: true, shape: 'orb' })));
      at(520, () => {
        burst(x, y, 50 * P, () => { const a = rand(0, 6.28), s = rand(2, 8) * P; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.95, life: rand(600, 1100), size: rand(3, 7), color: pickOf(['#ff9ad5', '#c084fc', '#ffffff']), glow: true, shape: 'orb' }; });
        rings.push({ x, y, r: 20, vr: 9, age: 0, life: 600, color: '240,170,252', width: 5 });
        flash = 0.3; flashColor = '250,220,255';
      });
      return 540;
    },
    smoke(x, y, P, at) {
      at(0, () => burst(x, y, 24 * P, () => { const a = rand(0, 6.28), s = rand(0.6, 2.2); return { x: x + rand(-40, 40), y: y + rand(-40, 40), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.3, life: rand(1400, 2000), size: rand(30, 60), grow: 0.9, alpha: 0.35, color: pickOf(['#6b21a8', '#4c1d95', '#1f1b2e', '#8b5cf6']), shape: 'puff' }; }));
      at(500, () => { burst(x, y, 20 * P, () => { const a = rand(0, 6.28), s = rand(3, 7); return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.95, life: 800, size: rand(3, 6), color: '#d8b4fe', glow: true, shape: 'orb' }; }); flash = 0.2; flashColor = '120,60,160'; });
      return 520;
    },
    dragon(x, y, P, at) {
      at(0, () => burst(x, y, 30 * P, (i, n) => ({ x, y, orbit: { a: (i / n) * 6.28, r: rand(30, 70), vr: rand(2.5, 4), va: rand(0.08, 0.12) }, life: rand(900, 1400), size: rand(12, 20), grow: -0.01, colors: ['#e0e7ff', '#818cf8', '#6d28d9', '#1e1b4b00'], glow: true, shape: 'flame' })));
      at(480, () => { burst(x, y, 40 * P, () => { const a = rand(0, 6.28), s = rand(3, 9) * P; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.95, life: rand(500, 900), size: rand(8, 16), grow: -0.015, colors: ['#e0e7ff', '#60a5fa', '#7c3aed', '#1e1b4b00'], glow: true, shape: 'flame' }; }); flash = 0.35; flashColor = '200,190,255'; });
      return 500;
    },
    rock(x, y, P, at) {
      at(380, () => {
        burst(x, y, 30 * P, () => { const a = rand(-3.1, 0), s = rand(4, 12) * P; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.4, life: rand(900, 1400), size: rand(6, 16), rot: rand(0, 6), vr: rand(-0.2, 0.2), color: pickOf(['#8d6e63', '#a1887f', '#6d4c41', '#9e9e9e']), shape: 'rock' }; });
        burst(x, y, 16, () => { const a = rand(0, 6.28), s = rand(1, 3); return { x, y: y + 60, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.4, life: 1100, size: rand(20, 40), grow: 0.6, alpha: 0.35, color: '#bcaaa4', shape: 'puff' }; });
        shake(P);
      });
      return 420;
    },
    spark(x, y, P, at) {
      at(380, () => {
        burst(x, y, 44 * P, () => { const a = rand(0, 6.28), s = rand(2, 9) * P; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.06, drag: 0.96, life: rand(700, 1300), size: rand(5, 11), rot: rand(0, 6), vr: rand(-0.1, 0.1), color: pickOf(['#ffe14d', '#fff7b0', '#ffffff', '#ffc233']), glow: true, shape: 'star' }; });
        rings.push({ x, y, r: 20, vr: 8, age: 0, life: 500, color: '255,230,120', width: 4 });
        flash = 0.25; flashColor = '255,245,200';
      });
      return 420;
    },
  };

  function shake(P) {
    const el = document.getElementById('app');
    if (!el || reduce) return;
    el.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-8 * P}px, ${5 * P}px)` }, { transform: `translate(${7 * P}px, ${-6 * P}px)` }, { transform: `translate(${-5 * P}px, ${3 * P}px)` }, { transform: 'translate(0,0)' }], { duration: 420 });
  }

  /* ---------- 그리기 ---------- */
  const lerpColor = (cols, k) => cols[Math.min(cols.length - 1, Math.floor(k * cols.length))];
  function drawPart(p) {
    const k = p.age / p.life;
    const a = Math.max(0, (1 - k) * p.alpha);
    const size = Math.max(0.5, p.size);
    ctx.globalAlpha = a;
    ctx.fillStyle = ctx.strokeStyle = p.colors ? lerpColor(p.colors, k) : p.color;
    ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    switch (p.shape) {
      case 'flame': case 'orb': case 'spark': {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
        g.addColorStop(0, ctx.fillStyle); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.28); ctx.fill(); break;
      }
      case 'puff': ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.28); ctx.fill(); break;
      case 'drop': ctx.beginPath(); ctx.ellipse(0, 0, size * 0.7, size * 1.2, Math.atan2(p.vy, p.vx) + 1.57, 0, 6.28); ctx.fill(); break;
      case 'bubble': ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.28); ctx.stroke(); break;
      case 'leaf': ctx.beginPath(); ctx.ellipse(0, 0, size, size * 0.45, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(0,60,0,.35)'; ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke(); break;
      case 'shard': ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(0, size * 0.25); ctx.lineTo(-size * 0.3, 0); ctx.lineTo(0, -size * 0.25); ctx.closePath(); ctx.fill(); break;
      case 'flake': ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) { ctx.rotate(1.047); ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke(); } break;
      case 'rock': ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(size * 0.3, size * 0.8); ctx.lineTo(-size * 0.7, size * 0.5); ctx.lineTo(-size * 0.8, -size * 0.4); ctx.lineTo(size * 0.2, -size * 0.8); ctx.closePath(); ctx.fill(); break;
      case 'star': ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? size * 0.45 : size; ctx.lineTo(Math.cos(i * 0.628) * r, Math.sin(i * 0.628) * r); } ctx.closePath(); ctx.fill(); break;
      default: ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }
  function frame(state) {
    const now = performance.now();
    const dt = Math.min(40, now - state.last);
    state.last = now;
    const t = now - state.t0;
    state.timeline = state.timeline.filter(([at, fn]) => (t >= at ? (fn(), false) : true));
    if (state.tick) state.tick(t);
    ctx.clearRect(0, 0, W, H);
    const f = dt / 16.7;
    parts = parts.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) return false;
      if (p.orbit) { /* 소용돌이치며 퍼져요 */
        p.orbit.a += p.orbit.va * f; p.orbit.r += p.orbit.vr * f;
        p.x = state.x + Math.cos(p.orbit.a) * p.orbit.r; p.y = state.y + Math.sin(p.orbit.a) * p.orbit.r;
        p.rot += (p.vr2 || 0.1) * f;
      } else if (p.spiral) { /* 소용돌이치며 가운데로 모여요 */
        const k = p.age / p.life;
        const r = p.spiral.r * (1 - k), a = p.spiral.a + k * 6;
        p.x = state.x + Math.cos(a) * r; p.y = state.y + Math.sin(a) * r;
      } else {
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * f;
        p.x += p.vx * f; p.y += p.vy * f; p.rot += p.vr * f;
      }
      p.size += p.grow * f * (p.grow > 0 ? 1 : p.size);
      drawPart(p);
      return true;
    });
    ctx.globalCompositeOperation = 'source-over';
    rings = rings.filter((r) => {
      r.age += dt;
      if (r.age < 0) return true;
      if (r.age >= r.life) return false;
      r.r += r.vr * f;
      ctx.globalAlpha = 1 - r.age / r.life;
      ctx.strokeStyle = `rgb(${r.color})`; ctx.lineWidth = r.width;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.28); ctx.stroke();
      return true;
    });
    bolts = bolts.filter((b) => {
      b.age += dt;
      if (b.age >= b.life) return false;
      const a = 1 - b.age / b.life;
      ctx.globalCompositeOperation = 'lighter';
      [[b.width * 4, `rgba(255,230,80,${0.35 * a})`], [b.width * 1.8, `rgba(255,245,160,${0.8 * a})`], [b.width * 0.7, `rgba(255,255,255,${a})`]].forEach(([w, c]) => {
        ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round';
        ctx.beginPath(); b.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
      });
      return true;
    });
    if (flash > 0.01) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = flash * 0.6; ctx.fillStyle = `rgb(${flashColor})`; ctx.fillRect(0, 0, W, H);
      flash *= Math.pow(0.86, f);
    }
    ctx.globalAlpha = 1;
    if (now < endAt || parts.length || bolts.length || rings.length || flash > 0.01) raf = requestAnimationFrame(() => frame(state));
    else unmount();
  }

  function play(type, cls, el) {
    const fam = FAMILY[type] || 'spark';
    const P = POWER[cls] || 1;
    (SOUND[fam] || SOUND.spark)();
    if (reduce) return new Promise((r) => setTimeout(r, 150));
    unmount();
    mount();
    const box = el ? el.getBoundingClientRect() : { left: W / 2, top: H / 2, width: 0, height: 0 };
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const state = { t0: performance.now(), last: performance.now(), x, y, timeline: [], tick: null };
    const at = (ms, fn) => state.timeline.push([ms, fn]);
    const r = SCRIPT[fam](x, y, P, at);
    const peak = typeof r === 'number' ? r : r.peak;
    if (r && r.tick) state.tick = r.tick;
    endAt = state.t0 + peak + 1800;
    /* 높은 등급은 한 번 더 번쩍 */
    if (cls === 's' || cls === 'u') at(peak + 60, () => { flash = Math.max(flash, 0.5); flashColor = cls === 'u' ? '255,210,240' : '255,240,180'; shake(P * 0.6); });
    raf = requestAnimationFrame(() => frame(state));
    return new Promise((res) => setTimeout(res, peak));
  }

  return { play, FAMILY };
})();
