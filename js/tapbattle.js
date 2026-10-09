/* ============================================================
 *  👆 탭 대결 (우리집 학습플래너 · 또박또박 받아쓰기 공용 — 두 앱이 같은 파일을 써요)
 *  - 한 판 = 5초 동안 휴대폰은 화면을 톡톡, 컴퓨터는 스페이스바(또는 클릭)
 *  - 점수 = ⚡카드 기본 파워(등급 10/12/14/17/20 + 강화×2) × 👆탭 수
 *  - 3판 2선승 · 같은 점수면 그 판은 다시 · 두 사람이 각자 자기 차례에 탭해요
 *  - 타격감: 누를 때마다 타격음(Web Audio) · 진동 · 화면 흔들림 · 타격 고리 · 불꽃 · "팡!" · 10번마다 🔥콤보 (빠를수록 세게)
 *  - 대결 기록: matches/{id} { mode:'tap', taps:{uid:[판마다 탭 수]}, rounds:[{ta,tb,sa,sb,w}], winner, status }
 *    (rounds · w 는 users[0] 기준, w: 0=users[0] 승, 1=users[1] 승, -1=비김)
 * ============================================================ */
(function(){
const SECONDS=5, MAX_TAPS=100, WIN=2, MAX_ROUNDS=9;
const CLASS_POWER={n:10, r:12, a:14, s:17, u:20};
const power=c=>(CLASS_POWER[c&&c.cls]||10)+Math.max(0,Math.min(5,Number(c&&c.lv)||0))*2;
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
.tap-stage .tp-count{margin:0;font-weight:900;font-size:min(34vw,170px);line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 6px 0 rgba(0,0,0,.35)}
.tap-stage .tp-count.bump{animation:tpBump .12s ease-out}
@keyframes tpBump{from{transform:scale(1.12)}}
.tap-stage .tp-score{margin:0;font-size:20px;font-weight:800;color:#c7d2fe}
.tap-stage .tp-bar{width:min(80vw,420px);height:12px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden}
.tap-stage .tp-bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#fde047,#f97316);transform-origin:left;transition:transform .1s linear}
.tap-stage .tp-hint{margin:0;font-size:16px;font-weight:800}
.tap-stage .tp-hint kbd{background:#fff;color:#1c1b22;border-radius:6px;padding:1px 8px;font-family:inherit}
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
function thump(n, speed){
  const c=ac(); if(!c) return;
  const t=c.currentTime, g=c.createGain(), o=c.createOscillator();
  const f0=150+Math.min(n,80)*3+speed*6;                           // 누를수록 · 빠를수록 조금씩 높아져요
  o.type="triangle"; o.frequency.setValueAtTime(f0*2.2, t); o.frequency.exponentialRampToValueAtTime(f0*.55, t+.09);
  g.gain.setValueAtTime(.32, t); g.gain.exponentialRampToValueAtTime(.001, t+.12);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t+.13);
  // 짧은 '탁' 소리 (잡음)
  const len=Math.floor(c.sampleRate*.04), buf=c.createBuffer(1,len,c.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);
  const src=c.createBufferSource(), ng=c.createGain(), hp=c.createBiquadFilter();
  hp.type="highpass"; hp.frequency.value=1200; ng.gain.value=.22;
  src.buffer=buf; src.connect(hp).connect(ng).connect(c.destination); src.start(t);
}
function ding(n){
  const c=ac(); if(!c) return;
  const t=c.currentTime;
  [0,.07].forEach((dt,i)=>{ const o=c.createOscillator(), g=c.createGain(); o.type="square";
    o.frequency.setValueAtTime((i? 1320 : 990)*(1+Math.min(n,60)/200), t+dt);
    g.gain.setValueAtTime(.12, t+dt); g.gain.exponentialRampToValueAtTime(.001, t+dt+.16);
    o.connect(g).connect(c.destination); o.start(t+dt); o.stop(t+dt+.17); });
}
// opts: {label, who, power, seconds}
function play(opts){
  ac();                                                           // 버튼을 누른 순간 소리를 켜 둬요 (휴대폰은 터치해야 소리가 나요)
  addCss();
  const sec=(opts&&opts.seconds)||SECONDS, pw=(opts&&opts.power)||10;
  const touch=("ontouchstart" in window) || (navigator.maxTouchPoints>0);
  const el=document.createElement("div");
  el.className="tap-stage";
  el.innerHTML=`<div class="tp-shake"><p class="tp-label">${opts.label||""}</p><p class="tp-who">${opts.who||""}</p>
    <p class="tp-count">3</p><p class="tp-score">준비!</p><div class="tp-bar"><i></i></div>
    <p class="tp-hint">${touch? "👆 화면을 최대한 빨리 톡톡톡!" : "⌨️ <kbd>스페이스바</kbd>를 최대한 빨리! (클릭도 돼요)"}</p></div><div class="tp-ring"></div><div class="tp-flash"></div>`;
  document.body.appendChild(el);
  const cnt=el.querySelector(".tp-count"), score=el.querySelector(".tp-score"), bar=el.querySelector(".tp-bar i");
  requestAnimationFrame(()=>el.classList.add("in"));
  return new Promise(async res=>{
    let n=0, live=false;
    const flash=el.querySelector(".tp-flash"), recent=[];
    const hit=(x,y)=>{
      if(!live) return; n=Math.min(MAX_TAPS, n+1);
      const t=performance.now(); recent.push(t); while(recent.length && t-recent[0]>600) recent.shift();
      const speed=recent.length;                                   // 0.6초 안에 누른 수 → 빠를수록 세게
      cnt.textContent=n; cnt.classList.remove("bump"); void cnt.offsetWidth; cnt.classList.add("bump");
      score.textContent=`⚡${pw} × 👆${n} = ${pw*n}`;
      el.classList.toggle("hot", speed>=5); el.classList.toggle("fire", speed>=8);
      thump(n, speed);
      try{ navigator.vibrate && navigator.vibrate(speed>=8? 18 : 10); }catch(_){}
      const milestone=n%10===0;
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
    const onPtr=e=>{ e.preventDefault(); hit(e.clientX, e.clientY); };
    const onKey=e=>{ if(e.code==="Space"||e.key===" "||e.key==="Enter"){ e.preventDefault(); if(!e.repeat) hit(innerWidth/2+(Math.random()*120-60), innerHeight/2+(Math.random()*120-60)); } };
    el.addEventListener("pointerdown", onPtr);
    window.addEventListener("keydown", onKey, true);
    for(const k of [3,2,1]){ cnt.textContent=k; sfx("click"); await wait(reduce? 80 : 700); }
    cnt.textContent="0"; score.textContent=`⚡${pw} × 👆0`; el.classList.add("go"); live=true; sfx("whoosh");
    const t0=performance.now(), D=sec*1000;
    await new Promise(r=>{ const tick=()=>{ const p=Math.min(1,(performance.now()-t0)/D); bar.style.transform=`scaleX(${1-p})`; if(p>=1) r(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    live=false; el.classList.remove("go");
    el.removeEventListener("pointerdown", onPtr); window.removeEventListener("keydown", onKey, true);
    score.textContent=`끝! ⚡${pw} × 👆${n} = ${pw*n}`; sfx("star");
    await wait(reduce? 80 : 1100);
    el.classList.add("out"); await wait(220); el.remove();
    res(n);
  });
}
// 판 결과 배너 (잠깐 보여 주고 사라져요)
async function banner(html, kind){
  addCss();
  const el=document.createElement("div"); el.className="tap-banner "+(kind||""); el.innerHTML=html;
  document.body.appendChild(el); requestAnimationFrame(()=>el.classList.add("show"));
  await wait(reduce? 80 : 1800); el.classList.remove("show"); await wait(250); el.remove();
}
window.TapBattle={SECONDS, MAX_TAPS, power, resolve, addTaps, startFields, play, banner, clampTaps};
})();
