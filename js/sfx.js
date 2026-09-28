/* 또박또박 받아쓰기 — 효과음 (파일 없이 Web Audio로 만들어요)
 * 삑 하는 기계음 대신, 실제 물건 소리처럼 들리게 여러 겹으로 만들어요.
 *   · 실로폰·종: 배음(1 · 2.76 · 5.4배 …)을 겹쳐 두드린 소리처럼
 *   · 바스락·휙·찢는 소리: 잡음을 필터로 깎고 크기를 흔들어서
 *   · 모든 소리는 작은 방 울림(리버브)과 압축기를 거쳐 부드럽게
 * 쓰는 법: SFX.play('ok'), SFX.noise(...), SFX.tone(...) */
window.SFX = (() => {
  let ac = null, bus = null, wet = null;
  const rand = (a, b) => a + Math.random() * (b - a);

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      /* 너무 큰 소리만 둥글게 눌러요 (압축기는 짧은 소리를 너무 작게 만들어서 안 써요) */
      const clip = ac.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2); }
      clip.curve = curve;
      const comp = ac.createGain();
      comp.gain.value = 0.8;
      comp.connect(clip).connect(ac.destination);
      bus = ac.createGain();
      bus.connect(comp);
      /* 작은 방 울림: 점점 작아지는 잡음으로 만든 잔향 */
      const len = Math.floor(ac.sampleRate * 1.2);
      const ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      const verb = ac.createConvolver();
      verb.buffer = ir;
      wet = ac.createGain();
      wet.gain.value = 0.22;
      wet.connect(verb).connect(comp);
    }
    if (ac.state !== 'running') ac.resume().catch(() => {}); /* 'suspended'·'interrupted'(아이폰 전화 등) 모두 */
    return ac;
  }
  /* 소리 하나를 버스(+울림)에 연결 */
  function out(node, reverb = 1) {
    node.connect(bus);
    if (reverb) { const s = ac.createGain(); s.gain.value = reverb; node.connect(s).connect(wet); }
  }
  function env(g, t, peak, attack, decay) {
    g.gain.value = 0.0001; /* 시작 전에도 조용히 (기본값 1이면 첫 샘플이 '딱' 튀어요) */
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  let noiseBuf = null;
  function noiseSrc() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  /* 잡음 소리: 필터 주파수가 from → to로 움직여요 */
  function noise(dur, { type = 'lowpass', from = 2000, to = 400, gain = 0.3, q = 1, delay = 0, attack = 0.01, reverb = 1 } = {}) {
    ctx();
    const t = ac.currentTime + delay;
    const src = noiseSrc();
    const f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ac.createGain();
    env(g, t, gain, attack, dur);
    src.connect(f).connect(g);
    out(g, reverb);
    src.start(t, Math.random()); src.stop(t + attack + dur + 0.05);
  }
  /* 음 하나: 파형·음높이 변화(glide)·크기 */
  function note(freq, { wave = 'sine', gain = 0.15, attack = 0.005, decay = 0.3, delay = 0, glide = 0, glideTime = 0.08, vibrato = 0, reverb = 1, lp = 0 } = {}) {
    ctx();
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + glideTime);
    if (vibrato) {
      const v = ac.createOscillator(), vg = ac.createGain();
      v.frequency.value = 7; vg.gain.value = vibrato;
      v.connect(vg).connect(o.frequency);
      v.start(t); v.stop(t + attack + decay + 0.1);
    }
    const g = ac.createGain();
    env(g, t, gain, attack, decay);
    let last = o;
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); last = f; }
    last.connect(g);
    out(g, reverb);
    o.start(t); o.stop(t + attack + decay + 0.1);
  }
  /* 실로폰·종: 두드린 금속/나무의 배음을 겹쳐요 */
  function bell(freq, { gain = 0.14, delay = 0, decay = 0.9, kind = 'glock' } = {}) {
    const partials = kind === 'marimba'
      ? [[1, 1, 1], [3.99, 0.18, 0.25], [10.1, 0.05, 0.08]]
      : [[1, 1, 1], [2.76, 0.4, 0.55], [5.4, 0.22, 0.3], [8.93, 0.1, 0.18]];
    partials.forEach(([m, a, d]) => note(freq * m, { gain: gain * a, decay: decay * d, delay, attack: 0.002 }));
    noise(0.02, { type: 'highpass', from: 6000, to: 5000, gain: gain * 0.25, delay, reverb: 0.3 }); /* 채로 친 순간 */
  }
  /* 여러 음을 차례로 */
  function tone(freqs, { wave = 'sine', gain = 0.12, step = 0.07, len = 0.25, delay = 0 } = {}) {
    freqs.forEach((f, i) => note(f, { wave, gain, decay: len, delay: delay + i * step, lp: wave === 'sine' ? 0 : 3000 }));
  }
  /* 바스락: 짧은 잡음 조각을 여러 번 */
  function crackle(dur, { from = 3000, to = 6000, gain = 0.2, bits = 14, delay = 0 } = {}) {
    for (let i = 0; i < bits; i++) {
      const d = delay + rand(0, dur);
      noise(rand(0.02, 0.06), { type: 'bandpass', from: rand(from, to), to: rand(from, to), q: 1.2, gain: gain * rand(0.4, 1), delay: d, attack: 0.003, reverb: 0.4 });
    }
  }

  /* 물방울 똑: 음이 빠르게 올라가는 짧은 소리 */
  function drop(freq, delay = 0) { note(freq, { glide: freq * 2.3, glideTime: 0.04, gain: 0.12, decay: 0.07, delay, reverb: 0.5 }); }

  const C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093, A5 = 880;
  const SOUNDS = {
    /* 버튼·글자 조각: 동그란 물방울 톡 */
    pop: () => { note(420, { glide: 980, glideTime: 0.05, gain: 0.16, decay: 0.09, reverb: 0.3 }); noise(0.015, { type: 'bandpass', from: 2500, to: 2000, q: 2, gain: 0.05, reverb: 0 }); },
    /* 나무 딱 */
    click: () => { note(1650, { gain: 0.08, decay: 0.035, reverb: 0.2 }); note(620, { gain: 0.1, decay: 0.06, reverb: 0.2 }); noise(0.03, { type: 'bandpass', from: 2200, to: 1800, q: 3, gain: 0.12, attack: 0.001, reverb: 0.2 }); },
    /* 정답: 실로폰 딩동 */
    ok: () => { bell(C6, { kind: 'marimba', gain: 0.16 }); bell(G6, { kind: 'marimba', gain: 0.16, delay: 0.11 }); },
    /* 오답: 부드러운 뿅~ (무섭지 않게) */
    no: () => { note(330, { wave: 'triangle', glide: 210, glideTime: 0.35, gain: 0.14, decay: 0.4, vibrato: 6, lp: 1200 }); note(160, { gain: 0.1, decay: 0.12, reverb: 0.2 }); },
    /* 별·축하: 반짝이는 글로켄슈필 + 반짝 가루 */
    star: () => { [C6, E6, G6, C7].forEach((f, i) => bell(f, { gain: 0.06, delay: i * 0.07, decay: 1.1 })); noise(0.8, { type: 'highpass', from: 7000, to: 9000, gain: 0.04, delay: 0.1, attack: 0.1 }); },
    /* 휙 */
    whoosh: () => noise(0.45, { type: 'bandpass', from: 300, to: 3200, q: 1.5, gain: 0.55, attack: 0.15, reverb: 0.4 }),
    /* 몬스터볼 던지기: 휙 + 빙글빙글 */
    throw: () => { noise(0.55, { type: 'bandpass', from: 250, to: 2600, q: 2, gain: 0.8, attack: 0.12, reverb: 0.4 }); for (let i = 0; i < 4; i++) noise(0.06, { type: 'bandpass', from: 1400, to: 900, q: 4, gain: 0.2, delay: 0.12 + i * 0.1, reverb: 0 }); },
    /* 볼이 포켓몬에 맞음: 퐁 + 빛 */
    hit: () => { note(700, { glide: 1400, glideTime: 0.12, gain: 0.14, decay: 0.2 }); noise(0.35, { type: 'highpass', from: 4000, to: 8000, gain: 0.07, attack: 0.02 }); },
    /* 흔들흔들: 플라스틱 볼이 바닥에서 덜컥 */
    wobble: () => { noise(0.05, { type: 'bandpass', from: 900, to: 700, q: 3, gain: 0.22, attack: 0.002, reverb: 0.3 }); note(140, { gain: 0.12, decay: 0.08, reverb: 0.2 }); noise(0.04, { type: 'bandpass', from: 1300, to: 1100, q: 3, gain: 0.12, attack: 0.002, delay: 0.14, reverb: 0.3 }); },
    /* 잡았다: 딸깍 잠김 + 팡파르 */
    catch: () => {
      noise(0.012, { type: 'highpass', from: 5000, to: 4000, gain: 0.25, attack: 0.001, reverb: 0.2 });
      note(2400, { gain: 0.06, decay: 0.05, reverb: 0.2 });
      [[523, 0.15], [659, 0.3], [784, 0.45], [1047, 0.6]].forEach(([f, d], i) => {
        const len = i === 3 ? 0.9 : 0.18;
        note(f, { wave: 'sawtooth', gain: 0.06, attack: 0.02, decay: len, delay: d, lp: 2200, vibrato: i === 3 ? 4 : 0 });
        note(f * 2, { wave: 'triangle', gain: 0.03, attack: 0.02, decay: len, delay: d });
      });
      bell(C7, { gain: 0.06, delay: 0.6, decay: 1.2 });
    },
    /* 놓쳤다: 통 튀고 휘익 */
    miss: () => { note(300, { glide: 120, glideTime: 0.2, gain: 0.15, decay: 0.25 }); noise(0.5, { type: 'bandpass', from: 2400, to: 300, q: 1.5, gain: 0.25, delay: 0.15, attack: 0.05 }); },
    /* 풀숲 바스락 */
    rustle: () => { crackle(0.9, { from: 2500, to: 6500, gain: 0.22, bits: 22 }); noise(0.9, { type: 'bandpass', from: 1500, to: 3500, q: 0.8, gain: 0.06, attack: 0.2 }); },
    /* 카드팩 찢기: 비닐 부스럭 */
    crinkle: () => crackle(0.25, { from: 3000, to: 8000, gain: 0.2, bits: 10 }),
    /* 카드팩 쫙 */
    tear: () => { crackle(0.35, { from: 2000, to: 7000, gain: 0.3, bits: 26 }); noise(0.35, { type: 'bandpass', from: 1500, to: 5000, q: 0.7, gain: 0.2, attack: 0.02, reverb: 0.3 }); },
    /* 진화: 신비롭게 올라가는 소리 */
    /* 🎲 손 안에서 달그락달그락 */
    diceShake: () => { for (let i = 0; i < 9; i++) { const d = i * 0.055 + rand(0, 0.02); noise(0.035, { type: 'bandpass', from: rand(1800, 3200), to: rand(1500, 2600), q: 5, gain: 0.45, delay: d, attack: 0.002, reverb: 0.2 }); note(rand(900, 1300), { gain: 0.08, decay: 0.03, delay: d, reverb: 0 }); } },
    /* 데굴데굴: 바닥에 탁·탁·탁 부딪히며 굴러가요 (at: 부딪히는 시각들) */
    diceRoll: (at = [0.18, 0.46, 0.7, 0.88, 1.02, 1.12]) => at.forEach((d, i) => {
      const k = 1 - i / at.length;
      noise(0.05, { type: 'bandpass', from: 1400, to: 700, q: 2.5, gain: 0.3 * k + 0.08, delay: d, attack: 0.002, reverb: 0.35 });
      note(210 + rand(-20, 20), { gain: 0.16 * k + 0.05, decay: 0.07, delay: d, reverb: 0.3 });
      noise(0.09, { type: 'bandpass', from: 3500, to: 2000, q: 1.5, gain: 0.06 * k, delay: d + 0.02, reverb: 0 }); /* 굴러가는 사각사각 */
    }),
    /* 탁! 멈춤 + 반짝 */
    diceLand: () => { note(95, { glide: 60, glideTime: 0.12, gain: 0.3, decay: 0.2, reverb: 0.4 }); noise(0.06, { type: 'lowpass', from: 900, to: 200, gain: 0.35, attack: 0.002 }); bell(1568, { gain: 0.07, delay: 0.12, decay: 0.8 }); },
    /* 큰 숫자(6) 나왔을 때 */
    diceBig: () => { [1047, 1319, 1568, 2093, 2637].forEach((f, i) => bell(f, { gain: 0.07, delay: i * 0.05, decay: 1 })); },
    /* 한 판 이김 · 짐 */
    roundWin: () => { [[784, 0], [988, 0.1], [1319, 0.2]].forEach(([f, d]) => { note(f, { wave: 'square', gain: 0.05, decay: 0.16, delay: d, lp: 3000 }); bell(f * 2, { gain: 0.04, delay: d, decay: 0.4 }); }); },
    roundLose: () => { note(392, { wave: 'triangle', glide: 262, glideTime: 0.3, gain: 0.14, decay: 0.35, lp: 1500 }); noise(0.15, { type: 'lowpass', from: 500, to: 150, gain: 0.12, delay: 0.05 }); },
    /* 두근두근 북소리 (마지막 판 전에) */
    drumroll: () => { for (let i = 0; i < 22; i++) noise(0.05, { type: 'bandpass', from: 1800, to: 1200, q: 1, gain: 0.08 + i * 0.008, delay: i * 0.045, attack: 0.002, reverb: 0.2 }); },
    /* 🏆 승리 팡파르: 빰빠밤~ + 심벌 */
    victory: () => {
      const seq = [[523, 0, 0.14], [523, 0.16, 0.14], [523, 0.32, 0.14], [659, 0.5, 0.5], [784, 1.05, 0.2], [659, 1.28, 0.16], [784, 1.46, 0.9]];
      seq.forEach(([f, d, len]) => { note(f, { wave: 'sawtooth', gain: 0.06, attack: 0.02, decay: len, delay: d, lp: 2600, vibrato: len > 0.5 ? 5 : 0 }); note(f * 1.5, { wave: 'triangle', gain: 0.03, attack: 0.02, decay: len, delay: d }); });
      [0.5, 1.46].forEach((d) => { noise(1.2, { type: 'highpass', from: 5000, to: 7000, gain: 0.12, delay: d, attack: 0.005 }); note(80, { gain: 0.25, decay: 0.3, delay: d }); });
      [2093, 2637, 3136].forEach((f, i) => bell(f, { gain: 0.05, delay: 1.5 + i * 0.08, decay: 1.4 }));
    },
    /* 😢 슬픈 트롬본: 와-와-와-와아~ */
    defeat: () => {
      [[392, 0], [370, 0.45], [349, 0.9]].forEach(([f, d]) => note(f, { wave: 'sawtooth', gain: 0.13, attack: 0.04, decay: 0.38, delay: d, lp: 1100 }));
      note(330, { wave: 'sawtooth', glide: 300, glideTime: 1.1, gain: 0.13, attack: 0.04, decay: 1.2, delay: 1.35, lp: 1000, vibrato: 7 });
    },
    evolve: () => { for (let i = 0; i < 10; i++) bell(A5 * Math.pow(2, i / 6), { gain: 0.08, delay: i * 0.13, decay: 0.8 }); noise(1.4, { type: 'bandpass', from: 400, to: 5000, q: 2, gain: 0.1, attack: 0.6 }); },
  };

  /* 📱 아이폰·아이패드: 첫 터치 때 소리 장치를 깨워요.
   *  · 무음 스위치를 켜 둬도 효과음이 나오게 'playback' 모드로 (iOS 17 이상은 audioSession, 그 전은 조용한 소리 한 번)
   *  · 소리 장치는 사용자가 누른 순간에만 켤 수 있어요 */
  const SILENT = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';
  let unlocked = false;
  function unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 지원 안 함 */ }
    try {
      ctx();
      const b = ac.createBuffer(1, 1, 22050), src = ac.createBufferSource();
      src.buffer = b; src.connect(ac.destination); src.start(0);
    } catch (e) { /* 소리 없이 */ }
    if (!unlocked) {
      unlocked = true;
      try { const a = new Audio(SILENT); a.setAttribute('playsinline', ''); a.volume = 0.01; a.play().catch(() => {}); } catch (e) { /* 무시 */ }
    }
  }
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (!ac || ac.state !== 'running' || !unlocked) unlock(); }, { capture: true, passive: true }));

  function play(kind, arg) {
    try {
      if (!SOUNDS[kind]) return;
      SOUNDS[kind](arg);
    } catch (e) { /* 소리 없이 진행 */ }
  }
  return { play, noise: (...a) => { try { noise(...a); } catch (e) { /* 소리 없이 */ } }, tone: (...a) => { try { tone(...a); } catch (e) { /* 소리 없이 */ } }, bell: (...a) => { try { bell(...a); } catch (e) { /* 소리 없이 */ } }, crackle: (...a) => { try { crackle(...a); } catch (e) { /* 소리 없이 */ } }, drop: (...a) => { try { drop(...a); } catch (e) { /* 소리 없이 */ } } };
})();
