/* ============================================================
 *  🔴 포켓몬 GO처럼 잡기 (우리집 학습플래너 · 또박또박 받아쓰기 공용 — 두 앱이 같은 파일을 써요)
 *  - 볼을 손가락으로 끌었다가 위로 휙! 튕긴 세기 · 방향 그대로 날아가요
 *      약하면 앞에 떨어지고, 너무 세면 뒤로 넘어가요. 컴퓨터는 스페이스바를 누르고 화살표가 포켓몬을 가리킬 때 떼기
 *  - 색 고리 안에 맞히면 Nice → Great → Excellent (고리가 작을수록) — 잡힐 확률이 올라가요
 *  - 맞으면 포켓몬이 빛이 되어 볼 속으로 → 볼이 받침대에 떨어져 1~3번 흔들 → 딸깍! 또는 펑! 튀어나와요
 *  - 사용: const g = GoCatch.create(장면 요소, 설정); const r = await g.start(); // {caught, quality, throws}
 *    설정: art(그림 HTML) · grade(c r l m s) · shiny · ring{thr,speed,acc,sway,swayMs} · color · maxThrows
 *          canThrow() · onThrow() · slow() (고리 느리게, 1=보통) · sfx(이름) · cry() · say(종류)
 * ============================================================ */
(function(){
const reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait=ms=>new Promise(r=>setTimeout(r, reduce? Math.min(ms,80) : ms));
const BALL='<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="b-bot"/><path d="M4 50 A46 46 0 0 1 96 50 Z" class="b-top"/><path d="M4 50 H96" class="b-line"/><circle cx="50" cy="50" r="13" class="b-btn"/><circle cx="50" cy="50" r="6" class="b-dot"/></svg>';
const BASE={c:.5, r:.4, l:.28, m:.25, s:.22};                 // 맞혔을 때 잡힐 기본 확률
const MULT={none:1, nice:1.3, great:1.7, excellent:2.3};       // 고리 보너스
const WORD={nice:"Nice! 좋아!", great:"Great! 잘했어!", excellent:"Excellent! 최고야!"};
const RING_MIN=0.16, SWEEP=1300;

/* 배경 (하늘 · 해 · 구름 · 산 · 언덕 · 풀밭) */
const worldHTML=()=>`<div class="gq-world"><div class="gq-sky"><i class="gq-sun"></i><i class="gq-cloud c1"></i><i class="gq-cloud c2"></i></div>
  <div class="gq-mtn m1"></div><div class="gq-mtn m2"></div><div class="gq-hill h1"></div><div class="gq-hill h2"></div><div class="gq-grass"></div><div class="gq-vig"></div></div>`;

function create(root, o){
  o=Object.assign({grade:"c", ring:{thr:.33, speed:2, acc:0, sway:.3, swayMs:3000}, color:"#4ade80", maxThrows:3,
    canThrow:()=>true, onThrow:()=>{}, slow:()=>1, sfx:()=>{}, cry:()=>{}, say:()=>{}}, o||{});
  const R=o.ring, thr=R.thr-(o.shiny?0.02:0);
  const layer=document.createElement("div");
  layer.className=`gq g${o.grade}${o.shiny?" shiny":""}${o.legend?" legend":""}`;
  layer.innerHTML=`${worldHTML()}
    <div class="gq-mon"><div class="gq-pad"></div><div class="gq-shadow"></div>
      <div class="gq-body"><div class="gq-art">${o.art}</div></div>
      <div class="gq-ring"><i class="gq-ring-out"></i><i class="gq-ring-goal" style="transform:scale(${thr})"></i><i class="gq-ring-in" style="--rc:${o.color}"></i></div></div>
    <p class="gq-word"></p>
    <div class="gq-home"><div class="gq-arrow"><i></i></div><button class="gq-ball" aria-label="몬스터볼 던지기">${BALL}</button></div>
    <div class="gq-fx"></div>`;
  root.prepend(layer);
  const $=s=>layer.querySelector(s);
  const mon=$(".gq-mon"), body=$(".gq-body"), art=$(".gq-art"), ringEl=$(".gq-ring"), ringIn=$(".gq-ring-in"), word=$(".gq-word"), home=$(".gq-home"), ball=$(".gq-ball"), arrow=$(".gq-arrow"), fx=$(".gq-fx");
  let ring=1, dir=-1, raf=0, last=0, swayT=Math.random()*1e4, live=false, busy=false, throwResolve=null;
  let aim=0, aimT=0, charge=0, hopT=performance.now()+3000+Math.random()*3000;
  const say=(html,cls)=>{ word.className="gq-word "+(cls||""); word.innerHTML=html||""; if(html){ void word.offsetWidth; word.classList.add("show"); } };

  /* 고리 · 좌우 흔들림 · 가끔 폴짝 */
  const tick=t=>{
    if(!last) last=t; const dt=Math.min(t-last,50); last=t;
    const half=SWEEP*1.3/R.speed*(o.slow()||1);
    ring+=dir*((1-RING_MIN)*dt/half)*(1+R.acc*(1-ring)*(1-ring));
    if(ring<=RING_MIN){ ring=RING_MIN+(RING_MIN-ring); dir=1; } if(ring>=1){ ring=1-(ring-1); dir=-1; }
    ringIn.style.transform=`scale(${ring})`; ringIn.classList.toggle("good", ring<=thr);
    swayT+=dt/(o.slow()||1);
    const w=2*Math.PI*swayT/R.swayMs;
    mon.style.setProperty("--sway", `${(R.sway*.75*mon.offsetWidth*(0.7*Math.sin(w)+0.3*Math.sin(2.3*w+1))).toFixed(1)}px`);
    if(!busy && t>hopT && !reduce){ hopT=t+4000+Math.random()*4000; body.animate([{transform:"translateY(0)"},{transform:"translateY(-18%) scaleY(1.04)",offset:.45},{transform:"translateY(0) scaleY(.96)",offset:.85},{transform:"translateY(0)"}],{duration:620,easing:"ease-out"}); }
    if(charge){ aimT+=dt; aim=Math.sin(2*Math.PI*aimT/1500); arrow.style.transform=`translateX(-50%) rotate(${(aim*24).toFixed(1)}deg)`; }
    raf=requestAnimationFrame(tick);
  };

  /* ---------- 던지기 손짓 ---------- */
  let drag=null;
  const spring=()=>{ ball.animate([{transform:ball.style.transform||"none"},{transform:"translate(0,0)"}],{duration:260,easing:"cubic-bezier(.3,1.6,.5,1)"}); ball.style.transform=""; };
  ball.addEventListener("pointerdown", e=>{
    if(!live||busy) return; e.preventDefault();
    drag={x0:e.clientX, y0:e.clientY, pts:[{x:e.clientX,y:e.clientY,t:performance.now()}]};
    try{ ball.setPointerCapture(e.pointerId); }catch(_){}
    ball.classList.add("held"); o.sfx("click");
  });
  ball.addEventListener("pointermove", e=>{
    if(!drag) return;
    const t=performance.now(); drag.pts.push({x:e.clientX,y:e.clientY,t}); while(drag.pts.length>2 && t-drag.pts[0].t>110) drag.pts.shift();
    ball.style.transform=`translate(${e.clientX-drag.x0}px, ${e.clientY-drag.y0}px) rotate(${((e.clientX-drag.x0)*.6).toFixed(0)}deg)`;
  });
  const release=e=>{
    if(!drag) return; const d=drag; drag=null; ball.classList.remove("held");
    const p=d.pts, a=p[0], b=p[p.length-1], dt=Math.max(16, b.t-a.t);
    const vx=(b.x-a.x)/dt, vy=(b.y-a.y)/dt;                      // px/ms (위로는 음수)
    if(vy<-0.35 && live && !busy) fire({power:-vy, dir:vx/(-vy)});
    else spring();
  };
  ball.addEventListener("pointerup", release); ball.addEventListener("pointercancel", ()=>{ drag=null; ball.classList.remove("held"); spring(); });
  // ⌨️ 스페이스바: 누르면 볼을 들고 화살표가 흔들려요 → 떼면 그 방향으로 알맞은 세기로
  const onKey=e=>{
    if(!document.body.contains(layer)) return;
    const sp=e.code==="Space"||e.key===" ";
    if(e.type==="keydown"){
      if(e.key==="Enter" && live && !busy){ e.preventDefault(); fire({power:1.7, auto:true}); }
      if(!sp) return; e.preventDefault();
      if(!charge && live && !busy){ charge=1; aimT=Math.random()*1500; ball.classList.add("held"); arrow.classList.add("on"); o.sfx("click"); }
    }else if(sp && charge){
      e.preventDefault(); charge=0; ball.classList.remove("held"); arrow.classList.remove("on");
      if(live && !busy) fire({power:1.55+Math.random()*.35, dir:Math.tan(aim*24/57.3)});
    }
  };
  document.addEventListener("keydown", onKey, true); document.addEventListener("keyup", onKey, true);

  function fire(how){ if(!o.canThrow()){ say("볼이 없어요","miss"); return; } if(throwResolve){ const r=throwResolve; throwResolve=null; r(how); } }

  /* ---------- 날아가는 길 ---------- */
  const center=el=>{ const r=el.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height, r}; };
  function flight(from, to, arcH, s0, s1, ms, spin){
    const K=14, frames=[];
    for(let i=0;i<=K;i++){ const t=i/K, x=from.x+(to.x-from.x)*t, y=from.y+(to.y-from.y)*t-arcH*4*t*(1-t);
      frames.push({transform:`translate(${(x-from.x).toFixed(1)}px, ${(y-from.y).toFixed(1)}px) rotate(${(spin*t).toFixed(0)}deg) scale(${(s0+(s1-s0)*t).toFixed(3)})`}); }
    return ball.animate(frames,{duration:reduce?1:ms, easing:"linear", fill:"forwards"}).finished;
  }
  const at=(dx,dy,rot,sc)=>`translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot}deg) scale(${sc})`;

  async function throwOnce(how){
    busy=true; o.onThrow();
    const S=center(ball), M=center(art), RG=center(ringEl);
    const ringNow=ring, depth=Math.max(80, S.y-M.y);
    if(how.auto) how.dir=(M.x-S.x)/(depth*.92);                   // 테스트 · 엔터: 포켓몬 가운데로
    const f=how.power/1.7;                                         // 1 = 알맞은 세기
    const landX=S.x+how.dir*depth*.92;
    const short=f<0.62, long=f>1.85;
    const dxMon=landX-M.x, onBody=!short && !long && Math.abs(dxMon)<=M.w*.40;
    const inRing=onBody && Math.abs(landX-RG.x)<=RG.w/2*ringNow*1.02;
    const quality=!inRing? "none" : ringNow<=thr*0.75? "excellent" : ringNow<=Math.max(thr+0.12,0.5)? "great" : "nice";
    o.sfx("throw");
    const spin=-(720+Math.random()*360);
    if(!onBody){
      // 빗나감: 짧으면 앞에 떨어져 데굴, 세면 뒤로 넘어가고, 옆이면 지나가요
      const tgtY= short? S.y-depth*Math.max(.25,f/0.62*.6) : long? M.y-M.h*.9 : M.y+M.h*.1;
      const tgt={x:landX, y:tgtY};
      await flight(S, tgt, depth*(short?.25:.5), 1, long?.25:.5, long?720:560, spin);
      o.sfx("miss");
      const dx=tgt.x-S.x, dy=tgt.y-S.y;
      if(long) ball.animate([{transform:at(dx,dy,spin,.25),opacity:1},{transform:at(dx,dy+20,spin-90,.18),opacity:0}],{duration:reduce?1:300,fill:"forwards"});
      else ball.animate([{transform:at(dx,dy,spin,.5),opacity:1},{transform:at(dx+(dxMon>=0?60:-60),dy+30,spin-200,.48),opacity:1,offset:.5},{transform:at(dx+(dxMon>=0?140:-140),dy+50,spin-420,.45),opacity:0}],{duration:reduce?1:700,easing:"ease-out",fill:"forwards"});
      body.animate([{transform:"translateY(0)"},{transform:"translateY(-14%) rotate(-6deg)",offset:.4},{transform:"translateY(0)"}],{duration:reduce?1:480,easing:"ease-out"});
      say(short? "앗, 짧았어! 더 세게 휙!" : long? "앗, 너무 셌어! 살짝만!" : "앗, 빗나갔다!", "miss");
      o.say("miss");
      await wait(900);
      return {hit:false, quality:"none"};
    }
    // 명중: 포켓몬 몸에 맞고 톡 튀어 공중에 멈춰요
    const hitP={x:landX, y:M.y+M.h*.05};
    await flight(S, hitP, depth*.5, 1, .5, 620, spin);
    const hx=hitP.x-S.x, hy=hitP.y-S.y;
    o.sfx("hit");
    if(quality!=="none"){ say(WORD[quality], "q "+quality); o.say(quality); }
    ringEl.classList.add("hit");
    await ball.animate([{transform:at(hx,hy,spin,.5)},{transform:at(hx,hy-M.h*.28,spin-40,.52)}],{duration:reduce?1:260,easing:"ease-out",fill:"forwards"}).finished;
    // 볼이 열리고 포켓몬이 빛이 되어 빨려 들어가요
    ball.classList.add("open");
    layer.classList.add("flash");
    await art.animate([{transform:"scale(1)",filter:"brightness(1)",opacity:1},{transform:"scale(1.06)",filter:"brightness(2.2) saturate(0) sepia(1) saturate(6) hue-rotate(-30deg)",opacity:1,offset:.3},
      {transform:`translate(${(landX-M.x).toFixed(0)}px, ${(-M.h*.33).toFixed(0)}px) scale(.02)`,filter:"brightness(3)",opacity:.2}],{duration:reduce?1:620,easing:"ease-in",fill:"forwards"}).finished;
    art.style.visibility="hidden"; art.getAnimations().forEach(a=>a.cancel());
    ball.classList.remove("open"); layer.classList.remove("flash");
    $(".gq-shadow").classList.add("gone");
    // 받침대 위로 톡 떨어져요
    const pad=$(".gq-pad").getBoundingClientRect();
    const gy=pad.top+pad.height*.45-S.h*.25-S.y;
    await ball.animate([{transform:at(hx,hy-M.h*.28,spin-40,.52)},{transform:at(hx,gy,spin-90,.5),offset:.6},{transform:at(hx,gy-26,spin-90,.5),offset:.8},{transform:at(hx,gy,spin-90,.5)}],{duration:reduce?1:560,easing:"ease-in",fill:"forwards"}).finished;
    o.sfx("wobble");
    // 흔들흔들 (1~3번) — 고리 보너스가 좋을수록 잘 잡혀요
    const chance=Math.min(.97, (BASE[o.grade]||.4)*MULT[quality]*(o.shiny?.9:1));
    const caught=(window.__gqCatch!=null? window.__gqCatch : Math.random())<chance, shakes=caught? 3 : 1+Math.floor(Math.random()*3);
    ball.classList.add("shaking");
    for(let k=0;k<shakes;k++){
      await wait(420); o.sfx("wobble");
      await ball.animate([{transform:at(hx,gy,0,.5)},{transform:at(hx-4,gy,-26,.5),offset:.3},{transform:at(hx+4,gy,22,.5),offset:.7},{transform:at(hx,gy,0,.5)}],{duration:reduce?1:540,easing:"ease-in-out",fill:"forwards"}).finished;
    }
    ball.classList.remove("shaking");
    await wait(320);
    if(caught){
      ball.classList.add("locked"); o.sfx("catch");
      burst(center(ball)); confetti();
      return {hit:true, caught:true, quality};
    }
    // 펑! 튀어나왔어요
    o.sfx("pop"); ball.classList.add("broke"); layer.classList.add("flash");
    art.getAnimations().forEach(a=>a.cancel()); art.style.visibility="";
    art.animate([{transform:"scale(.1)",opacity:0,filter:"brightness(3)"},{transform:"scale(1.1)",opacity:1,filter:"brightness(1.6)",offset:.6},{transform:"scale(1)",opacity:1,filter:"none"}],{duration:reduce?1:520,easing:"cubic-bezier(.3,1.6,.5,1)"});
    $(".gq-shadow").classList.remove("gone");
    say("앗! 튀어나왔어!", "miss"); o.say("break");
    await wait(260); layer.classList.remove("flash"); ball.classList.remove("broke");
    await wait(900);
    return {hit:true, caught:false, quality};
  }
  // 새 볼이 아래에서 올라와요
  function freshBall(){
    ball.getAnimations().forEach(a=>a.cancel()); ball.style.transform=""; ball.className="gq-ball";
    ball.animate([{transform:"translateY(120%) scale(.6)",opacity:0},{transform:"translateY(0) scale(1)",opacity:1}],{duration:reduce?1:380,easing:"cubic-bezier(.3,1.5,.5,1)"});
    ringEl.classList.remove("hit"); say("");
  }
  function burst(c){
    const box=document.createElement("div"); box.className="gq-burst"; box.style.left=c.x+"px"; box.style.top=c.y+"px";
    box.innerHTML=`<i class="wave"></i>${[0,45,90,135,180,225,270,315].map(d=>`<span style="--d:${d}deg"></span>`).join("")}`;
    fx.appendChild(box); setTimeout(()=>box.remove(),1300);
  }
  function confetti(){
    if(reduce) return;
    const C=["#fde047","#f97316","#22c55e","#38bdf8","#a78bfa","#f472b6"];
    for(let i=0;i<36;i++){ const s=document.createElement("i"); s.className="gq-conf";
      s.style.left=Math.random()*100+"%"; s.style.background=C[i%C.length];
      s.style.setProperty("--x",((Math.random()-.5)*160).toFixed(0)+"px"); s.style.setProperty("--r",(360+Math.random()*720).toFixed(0)+"deg");
      s.style.animationDelay=(Math.random()*.35).toFixed(2)+"s"; s.style.animationDuration=(1.6+Math.random()*1.1).toFixed(2)+"s"; fx.appendChild(s); setTimeout(()=>s.remove(),3200); }
  }

  async function start(){
    o.sfx(o.legend? "star" : "rustle");
    await wait(300);
    mon.classList.add("in"); o.cry();
    await wait(o.introMs!=null? o.introMs : 1400);
    ringEl.classList.add("on"); live=true; raf=requestAnimationFrame(tick);
    let throws=0, best="none";
    for(;;){
      const how=await new Promise(r=>{ throwResolve=r; });
      throws++;
      const r=await throwOnce(how);
      if(r.quality!=="none") best=r.quality;
      if(r.caught){ stop(); return {caught:true, quality:r.quality, throws}; }
      if(throws>=o.maxThrows || !o.canThrow()){
        // 도망가요
        ringEl.classList.add("hit"); say(""); busy=true;
        layer.classList.add("puff");
        await body.animate([{opacity:1, transform:"translate(0,0) scale(1)"},{opacity:0, transform:"translate(220px,-8%) scale(.6)"}],{duration:reduce?1:650,easing:"ease-in",fill:"forwards"}).finished;
        stop(); return {caught:false, fled:true, quality:best, throws};
      }
      freshBall(); busy=false;
    }
  }
  function stop(){ live=false; cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey, true); document.removeEventListener("keyup", onKey, true); if(throwResolve) throwResolve=null; }
  return {start, stop, layer, throwNow:how=>fire(how||{power:1.7, auto:true}), get ring(){ return ring; }, get thr(){ return thr; }};
}
window.GoCatch={create, BALL};
})();
