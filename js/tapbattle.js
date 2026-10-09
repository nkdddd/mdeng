/* ============================================================
 *  👆 탭 대결 (우리집 학습플래너 · 또박또박 받아쓰기 공용 — 두 앱이 같은 파일을 써요)
 *  - 한 판 = 5초 동안 휴대폰은 화면을 톡톡, 컴퓨터는 스페이스바(또는 클릭)
 *  - 점수 = ⚡카드 기본 파워(등급 10/12/14/17/20 + 강화×2) × 👆탭 수
 *  - 3판 2선승 · 같은 점수면 그 판은 다시 · 두 사람이 각자 자기 차례에 탭해요
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
@media (prefers-reduced-motion:reduce){.tap-stage.go .tp-ring{animation:none}}`;
  document.head.appendChild(st);
}
// opts: {label, who, power, seconds}
function play(opts){
  addCss();
  const sec=(opts&&opts.seconds)||SECONDS, pw=(opts&&opts.power)||10;
  const touch=("ontouchstart" in window) || (navigator.maxTouchPoints>0);
  const el=document.createElement("div");
  el.className="tap-stage";
  el.innerHTML=`<p class="tp-label">${opts.label||""}</p><p class="tp-who">${opts.who||""}</p>
    <p class="tp-count">3</p><p class="tp-score">준비!</p><div class="tp-bar"><i></i></div>
    <p class="tp-hint">${touch? "👆 화면을 최대한 빨리 톡톡톡!" : "⌨️ <kbd>스페이스바</kbd>를 최대한 빨리! (클릭도 돼요)"}</p><div class="tp-ring"></div>`;
  document.body.appendChild(el);
  const cnt=el.querySelector(".tp-count"), score=el.querySelector(".tp-score"), bar=el.querySelector(".tp-bar i");
  requestAnimationFrame(()=>el.classList.add("in"));
  return new Promise(async res=>{
    let n=0, live=false;
    const hit=(x,y)=>{
      if(!live) return; n=Math.min(MAX_TAPS, n+1);
      cnt.textContent=n; cnt.classList.remove("bump"); void cnt.offsetWidth; cnt.classList.add("bump");
      score.textContent=`⚡${pw} × 👆${n} = ${pw*n}`;
      if(n%5===0) sfx("pop");
      if(!reduce && x!=null){ const f=document.createElement("span"); f.className="tp-fx"; f.textContent=["✨","💥","⭐","👆"][n%4]; f.style.left=(x-15)+"px"; f.style.top=(y-15)+"px"; el.appendChild(f); setTimeout(()=>f.remove(),600); }
    };
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
