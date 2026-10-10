/* ============================================================
 *  👆 탭 대결 (우리집 학습플래너 · 또박또박 받아쓰기 공용 — 두 앱이 같은 파일을 써요)
 *  - 한 판 = 5초 동안 휴대폰은 화면을 톡톡, 컴퓨터는 Esc를 뺀 아무 키나 두 손으로 번갈아 (클릭도 돼요)
 *    스페이스바 하나만 누르면 휴대폰 두 엄지보다 느려서 대부분의 키를 인정해요.
 *    단, 0.05초 안에 같이 눌린 키는 한 번만 · 꾹 누르기(자동 반복)는 안 세요
 *  - 세는 법: 👆 휴대폰 터치 한 번 = 0.75번 (여러 손가락으로 아주 빨라서) · ⌨️ 키보드 한 번 = 4번 · 🖱️ 마우스 한 번 = 1번 · 상한 없음
 *  - 🃏 2판은 '카드 짝 맞추기': 포켓몬 카드 9장(4쌍 + ⭐ 1장)을 1.5초 보여 주고 덮어요 → 2장씩 뒤집어 짝 찾기. 틀리면 바로 끝
 *    값 = 찾은 짝 × 10 + (4쌍 다 찾으면 남은 시간 보너스, 20초 - 걸린 초) → 점수 = ⚡카드 힘 × 값
 *  - 🧠 3판부터는 '화살표 기억 대결' (DDR처럼): 화살표 10개를 한 번 보여 주면 외웠다가 그대로 눌러요. 처음 틀릴 때까지 맞힌 수가 점수
 *    점수 = ⚡카드 힘 × 맞힌 화살표 수 (휴대폰은 화면 버튼, 컴퓨터는 방향키 · WASD → 입력 방법 차이 없음)
 *  - 점수 = ⚡카드 파워(등급 10/12/14/17/20 + 강화×2 + 🐾짝꿍 포켓몬) × 👆탭 수
 *  - 🐾 짝꿍 포켓몬: 카드와 맞는 포켓몬만 함께 출전 — 같은 포켓몬 ⚡+4 · 같은 진화 가족 ⚡+2
 *    카드 걸기 대결이면 짝꿍도 함께 걸어요 (이기면 상대 짝꿍 한 마리를 받고, 지면 내 짝꿍 한 마리가 가요)
 *    pick 기록: {…카드, pk:포켓몬 이름, pm:'same'|'family'}
 *  - 3판 2선승 · 같은 점수면 그 판은 다시 · 두 사람이 각자 자기 차례에 탭해요
 *  - 타격감: 누를 때마다 타격음(Web Audio) · 진동 · 화면 흔들림 · 타격 고리 · 불꽃 · "팡!" · 10번마다 🔥콤보 (빠를수록 세게)
 *  - 대결 기록: matches/{id} { mode:'tap', taps:{uid:[판마다 탭 수]}, rounds:[{ta,tb,sa,sb,w}], winner, status }
 *    (rounds · w 는 users[0] 기준, w: 0=users[0] 승, 1=users[1] 승, -1=비김)
 * ============================================================ */
(function(){
const SECONDS=5, MAX_TAPS=9999, WIN=2, MAX_ROUNDS=9;   // 탭 수 상한은 없어요 (9999는 잘못된 기록만 막는 값)
const TOUCH_W=.75;                // 👆 휴대폰 터치는 여러 손가락으로 아주 빨라서 한 번 = 0.75번 (40번 → 30번)
const KEY_W=4;                    // ⌨️ 키보드는 한 번 = 4번 (휴대폰 · 마우스보다 많이 느려서)
const MOUSE_W=1;                  // 🖱️ 마우스 클릭은 한 번 = 1번
const CLASS_POWER={n:10, r:12, a:14, s:17, u:20};
const PARTNER={same:4, family:2};
const power=c=>(CLASS_POWER[c&&c.cls]||10)+Math.max(0,Math.min(5,Number(c&&c.lv)||0))*2+(c&&c.pk? PARTNER[c.pm]||0 : 0);
const basePower=c=>power(c&&{cls:c.cls, lv:c.lv});

/* ----- 🐾 짝꿍 포켓몬 (도감 window.POKEDEX: [이름, 이모지, 타입, 번호, 분류, 등급, 진화 전 모습]) ----- */
let ROOT=null, NAMES=null;
function dexIndex(){
  if(ROOT && NAMES.length) return;
  const from={}; ROOT={}; NAMES=[];
  (window.POKEDEX||[]).forEach(p=>{ from[p[0]]=p[6]||""; NAMES.push(p[0]); });
  NAMES.sort((a,b)=>b.length-a.length);                                    // 긴 이름부터 (예: '리자몽'보다 '메가리자몽')
  NAMES.forEach(n=>{ let k=n, g=0; while(from[k] && from[from[k]]!==undefined && g++<6) k=from[k]; ROOT[n]=k; });
}
const rootOf=n=>{ dexIndex(); return ROOT[n]||n; };
// 카드가 어떤 포켓몬 카드인지: 카드 기록의 포켓몬 이름 → 없으면 카드 이름에 들어 있는 도감 이름
function cardPoke(c){
  dexIndex(); if(!c) return "";
  if(c.poke && ROOT[c.poke]) return c.poke;
  const nm=String(c.name||""); return NAMES.find(n=>nm.includes(n)) || c.poke || "";
}
// 이 카드와 함께 나갈 수 있는 내 포켓몬 (잡은 수가 1마리 이상): 같은 포켓몬 먼저, 그다음 진화 가족
function partners(c, catches){
  const poke=cardPoke(c); if(!poke) return [];
  const r=rootOf(poke), out=[];
  Object.keys(catches||{}).forEach(n=>{ if(!((catches[n]||0)>0)) return;
    if(n===poke) out.push({name:n, m:"same", n:catches[n]}); else if(rootOf(n)===r) out.push({name:n, m:"family", n:catches[n]}); });
  return out.sort((a,b)=>(a.m==="same"? 0 : 1)-(b.m==="same"? 0 : 1) || a.name.localeCompare(b.name));
}
// 봇 짝꿍: 봇 카드와 맞는 포켓몬 (같은 포켓몬이거나 진화 가족 중 하나)
function botPartner(c){
  dexIndex(); const poke=cardPoke(c); if(!poke) return null;
  const fam=NAMES.filter(n=>n!==poke && rootOf(n)===rootOf(poke));
  if(fam.length && Math.random()<.5) return {name:fam[Math.floor(Math.random()*fam.length)], m:"family"};
  return {name:poke, m:"same"};
}
const partnerTag=c=>c&&c.pk? `🐾 ${c.pk} ⚡+${PARTNER[c.pm]||0}` : "";
const clampTaps=n=>Math.max(0, Math.min(MAX_TAPS, Math.round(Number(n)||0)));

// 두 사람의 탭 기록 → 판 결과 · 승자 (두 앱 · 두 기기가 똑같이 계산)
function resolve(users, picks, taps){
  const A=picks[users[0]], B=picks[users[1]], ta=(taps||{})[users[0]]||[], tb=(taps||{})[users[1]]||[];
  const rounds=[]; let wa=0, wb=0;
  for(let i=0; i<Math.min(ta.length, tb.length) && wa<WIN && wb<WIN && rounds.length<MAX_ROUNDS; i++){
    const x=clampTaps(ta[i]), y=clampTaps(tb[i]), sa=power(A)*x, sb=power(B)*y;
    const w= sa===sb? -1 : sa>sb? 0 : 1;
    if(w===0) wa++; else if(w===1) wb++;
    rounds.push({ta:x, tb:y, sa, sb, w});
  }
  const over= wa>=WIN || wb>=WIN || rounds.length>=MAX_ROUNDS;
  return {rounds, wa, wb, done:over, winner: over? (wa>=wb? users[0] : users[1]) : null};
}
// 탭 기록 한 판 더하기 → 문서에 쓸 값 (트랜잭션 안에서 써요). round: 0부터, 이미 낸 판이면 null
function addTaps(d, uid, round, n){
  if(!d || d.status!=="roll" || d.mode!=="tap") return null;
  const taps={...(d.taps||{})}, mine=[...(taps[uid]||[])];
  if(mine.length!==round) return null;
  mine.push(clampTaps(n)); taps[uid]=mine;
  const r=resolve(d.users, d.picks||{}, taps);
  const upd={taps, rounds:r.rounds, updatedAt:Date.now()};
  if(r.done){ upd.status="done"; upd.winner=r.winner; }
  return upd;
}
// 두 카드가 모이면 탭 대결 시작
const startFields=()=>({status:"roll", mode:"tap", taps:{}, rounds:[], rolled:{}});

/* ----- 👆 탭 무대 (전체 화면) → 탭 수 Promise ----- */
const reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const sfx=k=>{ try{ window.SFX && SFX.play(k); }catch(_){} };
let css=false;
function addCss(){
  if(css) return; css=true;
  const st=document.createElement("style");
  st.textContent=`
.tap-stage{position:fixed;inset:0;z-index:95;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:radial-gradient(circle at 50% 45%,#312e81,#0b1026 70%);color:#fff;user-select:none;-webkit-user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;opacity:0;transition:opacity .2s;padding:20px;text-align:center}
.tap-stage.in{opacity:1}.tap-stage.out{opacity:0}
.tap-stage .tp-label{margin:0;font-weight:900;font-size:22px;color:#fde68a}
.tap-stage .tp-who{margin:0;font-size:15px;opacity:.85}
.tap-stage .tp-count{margin:0;font-weight:900;font-size:min(24vw,140px);line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 6px 0 rgba(0,0,0,.35)}
.tap-stage .tp-count.bump{animation:tpBump .12s ease-out}
@keyframes tpBump{from{transform:scale(1.12)}}
.tap-stage .tp-score{margin:0;font-size:24px;font-weight:900;color:#c7d2fe}
.tap-stage .tp-unit{margin:-6px 0 0;font-size:14px;font-weight:800;color:#fde68a;opacity:.9}
.tap-stage .tp-bar{width:min(80vw,420px);height:12px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden}
.tap-stage .tp-bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#fde047,#f97316);transform-origin:left;transition:transform .1s linear}
.tap-stage .tp-hint{margin:0;font-size:16px;font-weight:800}
.tap-stage .tp-hint kbd{background:#fff;color:#1c1b22;border-radius:6px;padding:1px 8px;font-family:inherit}
.mem-stage .tp-shake{display:flex;flex-direction:column;align-items:center;gap:8px}
.mem-stage .tp-shake,.mem-stage .mem-pad,.mem-stage .mem-btn{pointer-events:auto}
.mem-say{margin:0;font-size:19px;font-weight:900;color:#fde68a;min-height:1.4em}
.mem-show{width:min(40vw,170px);height:min(40vw,170px);border-radius:24px;background:rgba(255,255,255,.08);display:grid;place-items:center}
.mem-arrow{font-size:min(28vw,120px);line-height:1;opacity:0;transform:scale(.6);transition:opacity .08s,transform .12s}
.mem-arrow.show{opacity:1;transform:scale(1)}
.mem-dots{display:flex;gap:6px;min-height:14px;flex-wrap:wrap;justify-content:center}.mem-dots i{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.25)}.mem-dots i.ok{background:#4ade80}
.mem-pad{display:grid;grid-template-areas:". u ." "l . r" ". d .";grid-template-columns:repeat(3,min(22vw,92px));grid-template-rows:repeat(3,min(22vw,92px));gap:6px;margin-top:4px}
.mem-btn{border:0;border-radius:18px;background:#fff;font-size:min(10vw,44px);box-shadow:0 6px 0 #94a3b8;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .06s,box-shadow .06s,background .1s}
.mem-btn[data-d=U]{grid-area:u}.mem-btn[data-d=L]{grid-area:l}.mem-btn[data-d=R]{grid-area:r}.mem-btn[data-d=D]{grid-area:d}
.mem-btn.on{transform:translateY(5px);box-shadow:0 1px 0 #94a3b8;background:#bbf7d0}.mem-btn.demo{background:#fde68a}.mem-btn.bad{background:#fecaca}.mem-btn.hint{background:#bbf7d0;outline:4px solid #4ade80}
.mem-stage.watch .mem-btn{pointer-events:none;opacity:.85}
.pair-grid{display:grid;grid-template-columns:repeat(3,min(24vw,100px));gap:8px}
.pair-card{position:relative;aspect-ratio:3/4;border:0;border-radius:14px;background:#fff;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;box-shadow:0 5px 0 #94a3b8;font-size:min(10vw,44px);padding:0;transition:transform .15s,background .15s}
.pair-card .pc-back,.pair-card .pc-face{position:absolute;inset:0;display:grid;place-items:center}
.pair-card .pc-face{opacity:0}.pair-card .pc-back{background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:14px;color:#fff;font-size:.8em}
.pair-card.open .pc-face{opacity:1}
.pair-card .pc-face img{width:88%;height:88%;object-fit:contain;image-rendering:pixelated;position:relative;z-index:1}
.pair-card .pc-face{flex-direction:column}.pair-card .pc-emo{position:absolute;inset:0;display:grid;place-items:center}.pair-card .pc-face img+.pc-emo{display:none}
.pair-card .pc-name{position:absolute;left:0;right:0;bottom:3px;font-size:10px;font-weight:800;color:#475569;z-index:2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 3px}.pair-card.open .pc-back{opacity:0}.pair-card.open{transform:rotateY(0) scale(1.03)}
.pair-card.got{background:#bbf7d0}.pair-card.bad{background:#fecaca;animation:tpBump .2s}
.pair-stage .pair-grid,.pair-stage .pair-card{pointer-events:auto}
.tap-stage .tp-keys{display:flex;gap:min(6vw,28px);margin-top:4px}
.tap-stage .tp-key{width:min(16vw,76px);height:min(16vw,76px);border-radius:14px;background:#fff;color:#1c1b22;font-weight:900;font-size:min(8vw,38px);display:grid;place-items:center;box-shadow:0 6px 0 #94a3b8;transition:transform .05s,box-shadow .05s}
.tap-stage .tp-key small{display:block;font-size:11px;font-weight:800;color:#64748b;margin-top:-6px}
.tap-stage .tp-key.down{transform:translateY(5px);box-shadow:0 1px 0 #94a3b8;background:#fde68a}
.tap-stage .tp-ring{position:absolute;left:50%;top:50%;width:min(70vw,360px);height:min(70vw,360px);margin:calc(min(70vw,360px)/-2) 0 0 calc(min(70vw,360px)/-2);border-radius:50%;border:4px solid rgba(253,224,71,.5);pointer-events:none;opacity:0}
.tap-stage.go .tp-ring{animation:tpRing .9s ease-out infinite}
@keyframes tpRing{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.25);opacity:0}}
.tap-stage .tp-fx{position:absolute;pointer-events:none;font-size:30px;animation:tpFx .6s ease-out forwards}
@keyframes tpFx{to{transform:translateY(-60px) scale(1.4);opacity:0}}
.tap-banner{position:fixed;left:50%;top:50%;z-index:96;transform:translate(-50%,-50%) scale(.7);opacity:0;transition:opacity .2s,transform .35s cubic-bezier(.3,1.6,.5,1);display:flex;flex-direction:column;align-items:center;gap:6px;background:rgba(11,16,38,.94);color:#fff;border-radius:22px;padding:18px 22px;min-width:min(86vw,360px);text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.tap-banner.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
.tap-banner b{font-size:22px}.tap-banner.win b{color:#fde047}.tap-banner.lose b{color:#cbd5e1}
.tap-banner small{font-size:15px;opacity:.9}
.tap-stage .tp-shake{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;pointer-events:none}
.tap-stage.shk .tp-shake{animation:tpShake .14s linear}
@keyframes tpShake{0%{transform:translate(0,0)}25%{transform:translate(var(--sx),var(--sy)) rotate(var(--sr))}50%{transform:translate(calc(var(--sx)*-.8),calc(var(--sy)*-.6))}75%{transform:translate(calc(var(--sx)*.4),calc(var(--sy)*.5))}100%{transform:translate(0,0)}}
.tap-stage .tp-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.tap-stage .tp-flash.on{animation:tpFlash .12s ease-out}
@keyframes tpFlash{from{opacity:.14}to{opacity:0}}
.tap-stage .tp-hit{position:absolute;width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;pointer-events:none;border:5px solid #fde047;box-shadow:0 0 18px #f97316,inset 0 0 12px #fde047;animation:tpHit .32s ease-out forwards}
@keyframes tpHit{from{transform:scale(.2);opacity:1}to{transform:scale(1.6);opacity:0}}
.tap-stage .tp-spark{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#fde047;box-shadow:0 0 8px #f97316;pointer-events:none;animation:tpSpark .38s ease-out forwards}
@keyframes tpSpark{to{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}
.tap-stage .tp-pow{position:absolute;pointer-events:none;font-weight:900;font-size:26px;color:#fff;-webkit-text-stroke:2px #b91c1c;text-shadow:0 3px 0 #7f1d1d;animation:tpPow .45s ease-out forwards;white-space:nowrap}
@keyframes tpPow{0%{transform:translate(-50%,-50%) scale(.4) rotate(var(--r));opacity:1}60%{transform:translate(-50%,-90%) scale(1.15) rotate(var(--r))}100%{transform:translate(-50%,-120%) scale(1) rotate(var(--r));opacity:0}}
.tap-stage .tp-combo{position:absolute;left:50%;top:22%;transform:translate(-50%,0);font-weight:900;font-size:44px;color:#fde047;text-shadow:0 4px 0 #b45309,0 0 24px #f97316;pointer-events:none;animation:tpCombo .7s cubic-bezier(.3,1.6,.5,1) forwards}
@keyframes tpCombo{0%{transform:translate(-50%,10px) scale(.3);opacity:0}30%{transform:translate(-50%,0) scale(1.25);opacity:1}100%{transform:translate(-50%,-30px) scale(1);opacity:0}}
.tap-stage .tp-count{transition:color .1s}
.tap-stage.hot .tp-count{color:#fde047}.tap-stage.fire .tp-count{color:#fb923c;text-shadow:0 6px 0 rgba(0,0,0,.35),0 0 30px #f97316}
@media (prefers-reduced-motion:reduce){.tap-stage.go .tp-ring,.tap-stage.shk .tp-shake{animation:none}}`;
  document.head.appendChild(st);
}
/* 🔊 타격음 (Web Audio로 바로 만들어요 — 파일 없이) */
let actx=null;
function ac(){ try{ if(!actx) actx=new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==="suspended") actx.resume(); }catch(_){ actx=null; } return actx; }
/* 🥊 타격음: 실제 펀치처럼 세 겹 — ① 묵직한 '쿵'(낮은 음이 확 떨어짐 + 살짝 찌그러뜨려 펀치감)
   ② 살에 맞는 '착'(가운데 음역 잡음) ③ 맨 앞의 '딱'(아주 짧은 높은 잡음). 칠 때마다 조금씩 달라서 기계음 같지 않아요.
   빠르게 칠수록 · 10번마다 더 세게. 모든 소리는 압축기를 거쳐 크게 들려도 찢어지지 않아요 */
let NOISE=null, BUS=null, CLIP=null;
function bus(c){
  if(BUS && BUS.context===c) return BUS;
  const comp=c.createDynamicsCompressor();
  comp.threshold.value=-14; comp.knee.value=8; comp.ratio.value=5; comp.attack.value=.002; comp.release.value=.12;
  const out=c.createGain(); out.gain.value=.9; comp.connect(out).connect(c.destination);
  BUS=comp; return comp;
}
function noiseBuf(c){
  if(NOISE && NOISE.sampleRate===c.sampleRate) return NOISE;
  const len=Math.floor(c.sampleRate*.4), b=c.createBuffer(1,len,c.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  return NOISE=b;
}
function clipCurve(){
  if(CLIP) return CLIP;
  const n=1024; CLIP=new Float32Array(n);
  for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; CLIP[i]=Math.tanh(x*2.4)/Math.tanh(2.4); }
  return CLIP;
}
const jit=(a=.08)=>1+(Math.random()*2-1)*a;
function noiseHit(c, dest, t, {type, f, q, gain, dur, off}){
  const src=c.createBufferSource(), fl=c.createBiquadFilter(), g=c.createGain();
  src.buffer=noiseBuf(c); fl.type=type; fl.frequency.value=f; if(q) fl.Q.value=q;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t+.0015); g.gain.exponentialRampToValueAtTime(.0008, t+dur);
  src.connect(fl).connect(g).connect(dest); src.start(t, off!=null? off : Math.random()*.3, dur+.02);
}
// 한 번 치는 소리 (c: 오디오, dest: 보낼 곳, t: 시각, k: 세기 0.6~1.4)
function punch(c, dest, t, k){
  // ① 쿵: 사인파가 150Hz쯤에서 45Hz로 뚝 떨어지며 사라져요 (+ 살짝 찌그러뜨림)
  const o=c.createOscillator(), og=c.createGain(), sh=c.createWaveShaper();
  sh.curve=clipCurve(); o.type="sine";
  const f0=150*jit(.1);
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0*.3, t+.12);
  og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(1.1*k, t+.002); og.gain.exponentialRampToValueAtTime(.001, t+.24);
  o.connect(sh).connect(og).connect(dest); o.start(t); o.stop(t+.26);
  // ①' 몸통 울림: 조금 높은 음 하나 더 (주먹이 꽉 찬 느낌)
  const o2=c.createOscillator(), g2=c.createGain();
  o2.type="triangle"; o2.frequency.setValueAtTime(f0*2.1, t); o2.frequency.exponentialRampToValueAtTime(f0*.9, t+.06);
  g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(.35*k, t+.002); g2.gain.exponentialRampToValueAtTime(.001, t+.09);
  o2.connect(g2).connect(dest); o2.start(t); o2.stop(t+.1);
  // ② 착: 가운데 음역 잡음 (살에 맞는 소리) + 낮은 '퍽'
  noiseHit(c, dest, t, {type:"bandpass", f:1700*jit(.2), q:1.1, gain:.9*k, dur:.07});
  noiseHit(c, dest, t, {type:"lowpass", f:700*jit(.15), gain:.7*k, dur:.11});
  // ③ 딱: 아주 짧은 높은 잡음 (맞는 순간)
  noiseHit(c, dest, t, {type:"highpass", f:3800, gain:.45*k, dur:.012});
}
function thump(n, speed){
  const c=ac(); if(!c) return;
  const k=Math.min(1.4, .72+Math.min(speed,10)*.05+(n%10===0? .25 : 0));
  punch(c, bus(c), c.currentTime+.001, k);
}
// 미리 듣기용: 오프라인으로 펀치 소리를 만들어요 (테스트 · 확인용)
function renderPunches(times, ks){
  const Ctx=window.OfflineAudioContext||window.webkitOfflineAudioContext, end=times[times.length-1]+.5;
  const c=new Ctx(1, Math.ceil(44100*end), 44100);
  const comp=c.createDynamicsCompressor(); comp.threshold.value=-14; comp.knee.value=8; comp.ratio.value=5; comp.attack.value=.002; comp.release.value=.12;
  const out=c.createGain(); out.gain.value=.9; comp.connect(out).connect(c.destination);
  NOISE=null; times.forEach((t,i)=>punch(c, comp, t, ks[i]));
  return c.startRendering().then(b=>{ NOISE=null; return b; });
}
function ding(n){
  const c=ac(); if(!c) return;
  const t=c.currentTime;
  [0,.07].forEach((dt,i)=>{ const o=c.createOscillator(), g=c.createGain(); o.type="square";
    o.frequency.setValueAtTime((i? 1320 : 990)*(1+Math.min(n,60)/200), t+dt);
    g.gain.setValueAtTime(.12, t+dt); g.gain.exponentialRampToValueAtTime(.001, t+dt+.16);
    o.connect(g).connect(c.destination); o.start(t+dt); o.stop(t+dt+.17); });
}
// 판 종류: 1 · 2판은 👆 탭, 3판부터(결승 · 다시 하는 판)는 🧠 화살표 기억
const roundMode=i=>i===1? "pairs" : i>=2? "memory" : "tap";          // 1판 👆 탭 · 2판 🃏 카드 짝 · 3판부터 🧠 화살표 기억
const MODE_ICON={tap:"👆", pairs:"🃏", memory:"🧠"};
// opts: {label, who, power, seconds, mode}
function play(opts){
  if(opts && opts.mode==="memory") return memory(opts);
  if(opts && opts.mode==="pairs") return pairs(opts);
  ac();                                                           // 버튼을 누른 순간 소리를 켜 둬요 (휴대폰은 터치해야 소리가 나요)
  addCss();
  const sec=(opts&&opts.seconds)||SECONDS, pw=(opts&&opts.power)||10;
  const touch=("ontouchstart" in window) || (navigator.maxTouchPoints>0);
  const el=document.createElement("div");
  el.className="tap-stage";
  el.innerHTML=`<div class="tp-shake"><p class="tp-label">${opts.label||""}</p><p class="tp-who">${opts.who||""}</p>
    <p class="tp-count">3</p><p class="tp-unit"></p><p class="tp-score">준비!</p><div class="tp-bar"><i></i></div>
    <p class="tp-hint">${touch? "👆 화면을 최대한 빨리 톡톡톡!" : "⌨️ 아무 키나 두 손으로 번갈아 빠르게! <small>(Esc 빼고 · 키보드는 한 번에 4번!)</small>"}</p>
    ${touch? "" : `<div class="tp-keys"><div class="tp-key" data-k="L">F<small>왼손</small></div><div class="tp-key" data-k="M">␣<small>가운데</small></div><div class="tp-key" data-k="R">J<small>오른손</small></div></div>`}</div><div class="tp-ring"></div><div class="tp-flash"></div>`;
  document.body.appendChild(el);
  const cnt=el.querySelector(".tp-count"), score=el.querySelector(".tp-score"), unit=el.querySelector(".tp-unit"), bar=el.querySelector(".tp-bar i");
  requestAnimationFrame(()=>el.classList.add("in"));
  return new Promise(async res=>{
    let n=0, live=false;
    const flash=el.querySelector(".tp-flash"), recent=[];
    let tN=0, kN=0, mN=0, nextM=10;                                   // 👆 터치 · ⌨️ 키보드 · 🖱️ 마우스 수                                                  // 👆 터치 수 · ⌨️🖱️ 키보드 · 마우스 수
    const hit=(x,y,kind)=>{
      if(!live) return;
      if(kind==="touch") tN++; else if(kind==="key") kN++; else mN++;
      n=Math.min(MAX_TAPS, Math.round(tN*TOUCH_W+kN*KEY_W+mN*MOUSE_W));
      unit.textContent=`점수 (⚡카드 힘 × 👆탭 수)`+[tN? ` · 👆 ${tN}번 ×0.75` : "", kN? ` · ⌨️ ${kN}번 ×4` : "", mN? ` · 🖱️ ${mN}번` : ""].join("");
      const t=performance.now(); recent.push(t); while(recent.length && t-recent[0]>600) recent.shift();
      const speed=recent.length;                                   // 0.6초 안에 누른 수 → 빠를수록 세게
      cnt.textContent=pw*n; cnt.classList.remove("bump"); void cnt.offsetWidth; cnt.classList.add("bump");
      score.textContent=`⚡${pw} × 👆${n}`;
      el.classList.toggle("hot", speed>=5); el.classList.toggle("fire", speed>=8);
      thump(n, speed);
      try{ navigator.vibrate && navigator.vibrate(speed>=8? 18 : 10); }catch(_){}
      const milestone=n>=nextM; if(milestone) nextM=(Math.floor(n/10)+1)*10;   // 10 · 20 · 30… 넘을 때마다 한 번
      if(milestone){ ding(n); combo(n); }
      if(reduce) return;
      // 💥 화면 흔들림 (빠를수록 크게)
      const a=Math.min(14, 3+speed*1.3)*(milestone?1.6:1);
      el.style.setProperty("--sx", ((Math.random()<.5?-1:1)*a).toFixed(1)+"px");
      el.style.setProperty("--sy", ((Math.random()<.5?-1:1)*a*.6).toFixed(1)+"px");
      el.style.setProperty("--sr", ((Math.random()-.5)*a*.25).toFixed(1)+"deg");
      el.classList.remove("shk"); void el.offsetWidth; el.classList.add("shk");
      flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
      if(x==null) return;
      // 타격 고리 · 불꽃 · 의성어
      const ring=document.createElement("i"); ring.className="tp-hit"; ring.style.left=x+"px"; ring.style.top=y+"px"; el.appendChild(ring); setTimeout(()=>ring.remove(),340);
      for(let k=0;k<6;k++){ const sp=document.createElement("i"); sp.className="tp-spark"; const ang=Math.random()*Math.PI*2, d=40+Math.random()*50;
        sp.style.left=x+"px"; sp.style.top=y+"px"; sp.style.setProperty("--dx",(Math.cos(ang)*d).toFixed(0)+"px"); sp.style.setProperty("--dy",(Math.sin(ang)*d).toFixed(0)+"px"); el.appendChild(sp); setTimeout(()=>sp.remove(),400); }
      if(n%3===0 || speed>=8){ const w=document.createElement("span"); w.className="tp-pow"; w.textContent=["팡!","쾅!","퍽!","빡!","POW!","탁!"][Math.floor(Math.random()*6)];
        w.style.left=x+"px"; w.style.top=y+"px"; w.style.setProperty("--r",((Math.random()-.5)*30).toFixed(0)+"deg"); el.appendChild(w); setTimeout(()=>w.remove(),460); }
    };
    const combo=k=>{ if(reduce) return; const c=document.createElement("div"); c.className="tp-combo"; c.textContent=`🔥 ${k}!`; el.appendChild(c); setTimeout(()=>c.remove(),720); };
    const onPtr=e=>{ e.preventDefault(); hit(e.clientX, e.clientY, e.pointerType==="touch" || e.pointerType==="pen"? "touch" : "mouse"); };
    // ⌨️ Esc를 뺀 대부분의 키 = 한 번 탭 (Shift · Ctrl · Alt · Cmd · CapsLock · Tab · F1~F12는 빼요)
    //    꾹 누르고 있기(자동 반복)는 안 세고, 0.05초 안에 같이 눌린 키는 한 번만 세요 (여러 손가락으로 문질러도 최대 1초에 20번)
    const SKIP=/^(Escape|Shift|Control|Alt|Meta|OS|CapsLock|Tab|ContextMenu|Fn|F\d{1,2}|AudioVolume.*|MediaPlay.*|Unidentified)/;
    const LEFTK=/^(Key[QWERTASDFGZXCVB]|Digit[1-5]|Backquote)$/;
    let lastKey=0;
    const press=side=>{ const k=el.querySelector(`.tp-key[data-k="${side}"]`); if(!k) return; k.classList.add("down"); setTimeout(()=>k.classList.remove("down"), 70); };
    const onKey=e=>{
      const name=e.code||e.key||"";
      if(!name || SKIP.test(name) || SKIP.test(e.key||"")) return;
      if(e.ctrlKey || e.metaKey || e.altKey) return;                 // 단축키(새로고침 등)는 그대로
      e.preventDefault(); if(e.repeat) return;
      const t=performance.now(); if(t-lastKey<50) return; lastKey=t;
      const side= LEFTK.test(e.code)? "L" : (e.code==="Space"||e.key===" ")? "M" : "R";
      press(side);
      const x= side==="L"? innerWidth*.28 : side==="R"? innerWidth*.72 : innerWidth/2;
      hit(x+(Math.random()*80-40), innerHeight/2+(Math.random()*120-60), "key");
    };
    el.addEventListener("pointerdown", onPtr);
    window.addEventListener("keydown", onKey, true);
    for(const k of [3,2,1]){ cnt.textContent=k; sfx("click"); await wait(reduce? 80 : 700); }
    cnt.textContent="0"; unit.textContent="점수 (⚡카드 힘 × 👆탭 수)"; score.textContent=`⚡${pw} × 👆0`; el.classList.add("go"); live=true; sfx("whoosh");
    const t0=performance.now(), D=sec*1000;
    await new Promise(r=>{ const tick=()=>{ const p=Math.min(1,(performance.now()-t0)/D); bar.style.transform=`scaleX(${1-p})`; if(p>=1) r(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    live=false; el.classList.remove("go");
    el.removeEventListener("pointerdown", onPtr); window.removeEventListener("keydown", onKey, true);
    score.textContent=`끝! ⚡${pw} × 👆${n} = ${pw*n}점`; sfx("star");
    await wait(reduce? 80 : 1100);
    el.classList.add("out"); await wait(220); el.remove();
    res(n);
  });
}
/* ----- 🧠 화살표 기억 대결 (DDR처럼 · 한 번에 끝) → 맞힌 화살표 수 Promise -----
   무작위 화살표 10개를 한 번만 하나씩 보여 줘요 → 같은 순서로 누르기
   처음 틀리거나 5초 동안 안 누르면 끝. 점수 = 처음 틀리기 전까지 맞힌 수 (0~10) */
const MEM_LEN=10;                 // 🧠 기억 대결 화살표 수
const DIRS=["U","R","D","L"], ARROW={U:"⬆️",R:"➡️",D:"⬇️",L:"⬅️"}, TONE={U:660,R:784,D:523,L:587};
const KEYDIR={ArrowUp:"U",ArrowRight:"R",ArrowDown:"D",ArrowLeft:"L",KeyW:"U",KeyD:"R",KeyS:"D",KeyA:"L"};
function tone(dir, bad){
  const c=ac(); if(!c) return;
  const t=c.currentTime, o=c.createOscillator(), g=c.createGain();
  o.type=bad? "sawtooth" : "triangle"; o.frequency.setValueAtTime(bad? 110 : TONE[dir], t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(bad? .3 : .25, t+.01); g.gain.exponentialRampToValueAtTime(.001, t+(bad? .45 : .22));
  o.connect(g).connect(bus(c)); o.start(t); o.stop(t+.5);
}
function memory(opts){
  ac(); addCss();
  const pw=(opts&&opts.power)||10, LEN=MEM_LEN, IDLE=5000;
  const el=document.createElement("div");
  el.className="tap-stage mem-stage";
  el.innerHTML=`<div class="tp-shake"><p class="tp-label">${opts.label||""} · 🧠 기억 대결</p><p class="tp-who">${opts.who||""}</p>
    <p class="mem-say">화살표 순서를 기억했다가 똑같이 눌러요!</p>
    <div class="mem-show"><span class="mem-arrow"></span></div><div class="mem-dots"></div>
    <p class="tp-score">⚡${pw} × 🧠0 = 0점</p>
    <div class="mem-pad">${["U","L","R","D"].map(d=>`<button class="mem-btn" data-d="${d}" aria-label="${ARROW[d]}">${ARROW[d]}</button>`).join("")}</div>
    <p class="tp-hint">${("ontouchstart" in window)||navigator.maxTouchPoints>0? "👆 화살표 버튼을 순서대로!" : "⌨️ 방향키(또는 W A S D)로 순서대로!"}</p></div>`;
  document.body.appendChild(el);
  const say=el.querySelector(".mem-say"), arrow=el.querySelector(".mem-arrow"), dots=el.querySelector(".mem-dots"), score=el.querySelector(".tp-score");
  requestAnimationFrame(()=>el.classList.add("in"));
  return new Promise(async res=>{
    let got=0, seq=[], pos=0, accept=false, idleT=0, done=false;
    const btn=d=>el.querySelector(`.mem-btn[data-d="${d}"]`);
    const flashBtn=(d,cls)=>{ const b=btn(d); if(!b) return; b.classList.add(cls||"on"); setTimeout(()=>b.classList.remove(cls||"on"), 180); };
    const paintDots=()=>{ dots.innerHTML=seq.map((_,i)=>`<i class="${i<pos? "ok" : ""}"></i>`).join(""); };
    const paintScore=()=>{ score.textContent=`⚡${pw} × 🧠${got} = ${pw*got}점`; };
    const finish=async why=>{
      if(done) return; done=true; accept=false; clearTimeout(idleT);
      window.removeEventListener("keydown", onKey, true);
      say.textContent= why==="bad"? `앗, 틀렸어! 🧠 ${got}개 기억!` : why==="idle"? `시간이 다 됐어! 🧠 ${got}개 기억!` : `와, ${LEN}개 다 기억했어! 🧠 ${got}개!`;
      score.textContent=`끝! ⚡${pw} × 🧠${got} = ${pw*got}점`; sfx("star");
      await wait(reduce? 80 : 1400);
      el.classList.add("out"); await wait(220); el.remove(); res(got);
    };
    const idle=()=>{ clearTimeout(idleT); idleT=setTimeout(()=>finish("idle"), IDLE); };
    const input=d=>{
      if(!accept || done) return;
      if(d!==seq[pos]){ tone(d, true); flashBtn(d,"bad"); flashBtn(seq[pos],"hint"); try{ navigator.vibrate && navigator.vibrate([40,40,40]); }catch(_){} return finish("bad"); }
      tone(d); flashBtn(d); pos++; got++; paintDots(); paintScore(); idle();
      try{ navigator.vibrate && navigator.vibrate(12); }catch(_){}
      if(pos>=seq.length) return finish("all");                     // 다 맞혔어요!
    };
    const onKey=e=>{ const d=KEYDIR[e.code]; if(!d) return; e.preventDefault(); if(e.repeat) return; input(d); };
    el.querySelectorAll(".mem-btn").forEach(b=>b.addEventListener("pointerdown", e=>{ e.preventDefault(); input(b.dataset.d); }));
    window.addEventListener("keydown", onKey, true);
    // 한 줄 보여 주기 → 입력 받기
    const round=async len=>{
      seq=Array.from({length:len},()=>DIRS[Math.floor(Math.random()*4)]); pos=0; paintDots();
      el.dataset.seq=seq.join("");                                   // 테스트용
      say.textContent=`👀 ${len}개를 잘 봐! 한 번만 보여 줘요`; el.classList.add("watch");
      await wait(reduce? 60 : 700);
      const on=330, off=115;                                        // 1.3배 빠르게: 10개 ≈ 4.5초
      for(const d of seq){ if(done) return; arrow.textContent=ARROW[d]; arrow.className="mem-arrow show"; tone(d); flashBtn(d,"demo");
        await wait(reduce? 30 : on); arrow.className="mem-arrow"; await wait(reduce? 20 : off); }
      arrow.textContent=""; el.classList.remove("watch");
      say.textContent="👉 이제 똑같이 눌러!"; accept=true; idle();
    };
    say.textContent="준비!"; await wait(reduce? 60 : 900);
    round(LEN);
  });
}
/* ----- 🃏 카드 짝 맞추기 → 값(찾은 짝 × 10 + 시간 보너스) Promise -----
   포켓몬 카드 9장(4쌍 + 짝 없는 ⭐)을 1.5초 보여 주고 덮어요 → 2장씩 뒤집기: 같으면 짝, 다르면 바로 끝 (그때까지 찾은 짝만)
   4쌍을 다 찾으면 빨리 찾을수록 보너스 (20초 - 걸린 초). 20초가 지나거나 5초 동안 안 누르면 끝
   컴퓨터는 숫자 1~9(키패드 배치)로도 뒤집어요 */
const PAIR_FACES=["⚡","🔥","💧","🌱","❄️","🌙","🍄","🐉","🌈","🎵","🍎","🦋"], PAIR_N=4, PAIR_TIME=20, PAIR_PEEK=1500;
// 카드 그림: 도감 1~3세대(1~386번) 포켓몬 중 무작위 4마리 (그림을 못 받으면 이모지로)
const POKE_IMG=no=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${no}.png`;
const loadImg=(src,ms)=>new Promise(r=>{ const im=new Image(); let ok=false; im.onload=()=>{ ok=true; r(true); }; im.onerror=()=>r(false); im.referrerPolicy="no-referrer"; im.src=src; setTimeout(()=>{ if(!ok) r(false); }, ms); });
function pairs(opts){
  ac(); addCss();
  const pw=(opts&&opts.power)||10, IDLE=5000;
  const dex=(window.POKEDEX||[]).filter(p=>p[3]>=1 && p[3]<=386);
  const pick= dex.length>=PAIR_N? [...dex].sort(()=>Math.random()-.5).slice(0,PAIR_N).map(p=>({k:String(p[3]), name:p[0], emo:p[1], img:POKE_IMG(p[3])}))
    : [...PAIR_FACES].sort(()=>Math.random()-.5).slice(0,PAIR_N).map(e=>({k:e, name:e, emo:e, img:""}));
  const byK=Object.fromEntries(pick.map(p=>[p.k,p]));
  const faces=[...pick.map(p=>p.k), ...pick.map(p=>p.k), "⭐"].sort(()=>Math.random()-.5);
  const faceHTML=k=>{ const p=byK[k]; if(!p) return "⭐";
    return p.img? `<img src="${p.img}" alt="${p.name}" referrerpolicy="no-referrer" draggable="false" onerror="this.remove()"><span class="pc-emo">${p.emo}</span><small class="pc-name">${p.name}</small>` : p.emo; };
  const el=document.createElement("div");
  el.className="tap-stage mem-stage pair-stage";
  el.dataset.faces=faces.join(",");                                   // 테스트용
  el.innerHTML=`<div class="tp-shake"><p class="tp-label">${opts.label||""} · 🃏 카드 짝 맞추기</p><p class="tp-who">${opts.who||""}</p>
    <p class="mem-say">포켓몬 카드를 섞는 중…</p>
    <div class="pair-grid">${faces.map((f,i)=>`<button class="pair-card" data-i="${i}"><span class="pc-back">🎴</span><span class="pc-face">${faceHTML(f)}</span></button>`).join("")}</div>
    <p class="tp-score">⚡${pw} × 🃏0 = 0점</p><div class="tp-bar"><i></i></div>
    <p class="tp-hint">${("ontouchstart" in window)||navigator.maxTouchPoints>0? "👆 카드 두 장씩 뒤집어 짝을 찾아요 · 틀리면 끝!" : "🖱️ 클릭 또는 숫자 1~9 · 틀리면 끝!"}</p></div>`;
  document.body.appendChild(el);
  const say=el.querySelector(".mem-say"), score=el.querySelector(".tp-score"), bar=el.querySelector(".tp-bar i"), cards=[...el.querySelectorAll(".pair-card")];
  requestAnimationFrame(()=>el.classList.add("in"));
  return new Promise(async res=>{
    let found=0, first=null, live=false, done=false, t0=0, idleT=0, raf=0, busy=false;
    const value=all=>found*10+(all? Math.max(0, PAIR_TIME-Math.floor((performance.now()-t0)/1000)) : 0);
    const paint=all=>{ const v=value(all); score.textContent=`⚡${pw} × 🃏${v} = ${pw*v}점 (짝 ${found}개${all? ` + 시간 ${v-found*10}` : ""})`; };
    const finish=async why=>{
      if(done) return; done=true; live=false; clearTimeout(idleT); cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      const all=why==="all", v=value(all);
      if(why!=="all") cards.forEach(c=>c.classList.add("open"));          // 끝나면 다 보여 줘요
      say.textContent= all? `와, 4쌍 다 찾았어! 🃏 ${v}` : why==="bad"? `앗, 틀렸어! 짝 ${found}개 🃏 ${v}` : `시간이 다 됐어! 짝 ${found}개 🃏 ${v}`;
      score.textContent=`끝! ⚡${pw} × 🃏${v} = ${pw*v}점`; sfx("star");
      await wait(reduce? 80 : 1600);
      el.classList.add("out"); await wait(220); el.remove(); res(v);
    };
    const idle=()=>{ clearTimeout(idleT); idleT=setTimeout(()=>finish("idle"), IDLE); };
    const flip=async i=>{
      if(!live || busy || done) return;
      const c=cards[i]; if(!c || c.classList.contains("open")) return;
      c.classList.add("open"); idle();
      if(faces[i]==="⭐"){ tone("U"); return; }                           // ⭐은 짝이 없어요 (그냥 열려 있어요)
      if(first==null){ first=i; tone("R"); return; }
      const a=first; first=null;
      if(faces[a]===faces[i]){
        found++; cards[a].classList.add("got"); c.classList.add("got"); tone("U"); try{ navigator.vibrate && navigator.vibrate(15); }catch(_){}
        paint(found>=PAIR_N); if(found>=PAIR_N) return finish("all");
      }else{
        busy=true; tone("D", true); cards[a].classList.add("bad"); c.classList.add("bad"); try{ navigator.vibrate && navigator.vibrate([40,40,40]); }catch(_){}
        await wait(reduce? 60 : 500); return finish("bad");
      }
    };
    const KEYPAD={Numpad7:0,Numpad8:1,Numpad9:2,Numpad4:3,Numpad5:4,Numpad6:5,Numpad1:6,Numpad2:7,Numpad3:8,Digit1:0,Digit2:1,Digit3:2,Digit4:3,Digit5:4,Digit6:5,Digit7:6,Digit8:7,Digit9:8};
    const onKey=e=>{ const i=KEYPAD[e.code]; if(i==null) return; e.preventDefault(); if(e.repeat) return; flip(i); };
    cards.forEach(c=>c.addEventListener("pointerdown", e=>{ e.preventDefault(); flip(+c.dataset.i); }));
    window.addEventListener("keydown", onKey, true);
    await Promise.all([wait(reduce? 60 : 900), ...pick.filter(p=>p.img).map(p=>loadImg(p.img, 2500))]);   // 그림을 먼저 받아 둬요
    say.textContent="👀 1.5초만 보여 줘요! 잘 봐!"; await wait(reduce? 60 : 500);
    cards.forEach(c=>c.classList.add("open","peek")); sfx("whoosh");
    await wait(PAIR_PEEK);                                                // 👀 1.5초!
    cards.forEach(c=>c.classList.remove("open","peek"));
    say.textContent="👉 짝을 찾아! 틀리면 끝!"; live=true; t0=performance.now(); idle(); paint(false);
    const D=PAIR_TIME*1000, tick=()=>{ if(done) return; const p=Math.min(1,(performance.now()-t0)/D); bar.style.transform=`scaleX(${1-p})`; if(p>=1) return finish("time"); raf=requestAnimationFrame(tick); };
    raf=requestAnimationFrame(tick);
  });
}
// 판 결과 배너 (잠깐 보여 주고 사라져요)
async function banner(html, kind){
  addCss();
  const el=document.createElement("div"); el.className="tap-banner "+(kind||""); el.innerHTML=html;
  document.body.appendChild(el); requestAnimationFrame(()=>el.classList.add("show"));
  await wait(reduce? 80 : 1800); el.classList.remove("show"); await wait(250); el.remove();
}
window.TapBattle={renderPunches, roundMode, MODE_ICON, memory, MEM_LEN, pairs, PAIR_N, PAIR_TIME, SECONDS, MAX_TAPS, TOUCH_W, KEY_W, MOUSE_W, PARTNER, power, basePower, resolve, addTaps, startFields, play, banner, clampTaps, cardPoke, partners, botPartner, partnerTag, rootOf};
})();
