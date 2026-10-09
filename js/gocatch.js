/* ============================================================
 *  🔴 포켓몬 GO처럼 잡기 (우리집 학습플래너 · 또박또박 받아쓰기 공용 — 두 앱이 같은 파일을 써요)
 *  - 볼을 손가락으로 끌었다가 위로 휙! 튕긴 세기 · 방향 그대로 날아가요 (멀어질수록 작아져요)
 *      약하면 앞에 떨어져 데굴, 너무 세면 머리 위로 넘어가요. 컴퓨터는 스페이스바를 누르고 화살표가 포켓몬을 가리킬 때 떼기
 *  - 던지기 전에 볼을 빙글빙글 돌리면 반짝반짝 커브볼! (잘 잡혀요)
 *  - 색 고리 안에 맞히면 Nice → Great → Excellent (고리가 작을수록) — 잡힐 확률이 올라가요
 *  - 탁! 부딪혀 튀어 오른 볼이 열리고, 빨간 빛줄기로 포켓몬을 빨아들여요
 *    → 화면이 볼로 확대돼 하늘에서 풀밭으로 툭 떨어지고 1~3번 흔들 → 딸깍! ⭐ 또는 펑! 튀어나와요
 *  - 사용: const g = GoCatch.create(장면 요소, 설정); const r = await g.start(); // {caught, quality, throws, curve}
 *    설정: art(그림 HTML) · grade(c r l m s) · shiny · ring{thr,speed,acc,sway,swayMs} · color · maxThrows
 *          canThrow() · onThrow() · slow() (고리 느리게, 1=보통) · sfx(이름) · cry() · say(종류)
 *  - 움직임은 transform · opacity만 써요 (휴대폰에서 그림이 깨지지 않게)
 * ============================================================ */
(function(){
const reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait=ms=>new Promise(r=>setTimeout(r, reduce? Math.min(ms,80) : ms));
/* 🎞️ 움직임 엔진: 브라우저 애니메이션(WAAPI) 대신 한 장면씩 style을 직접 바꿔요
   (아이폰 사파리에서 WAAPI 이동이 안 보이던 문제 — 손으로 끌 때처럼 style.transform은 어디서나 보여요) */
const BZ={linear:[0,0,1,1], ease:[.25,.1,.25,1], "ease-in":[.42,0,1,1], "ease-out":[0,0,.58,1], "ease-in-out":[.42,0,.58,1]};
const bez=e=>{ let p=BZ[e||"linear"]; if(!p){ const m=/cubic-bezier\(([^)]+)\)/.exec(e||""); p=m? m[1].split(",").map(Number) : BZ.linear; }
  const [x1,y1,x2,y2]=p; if(x1===y1 && x2===y2) return t=>t;
  const cx=3*x1, bx=3*(x2-x1)-cx, ax=1-cx-bx, cy=3*y1, by=3*(y2-y1)-cy, ay=1-cy-by;
  const X=s=>((ax*s+bx)*s+cx)*s, Y=s=>((ay*s+by)*s+cy)*s;
  return t=>{ let lo=0, hi=1, s=t; for(let i=0;i<22;i++){ const x=X(s); if(Math.abs(x-t)<1e-4) break; if(x<t) lo=s; else hi=s; s=(lo+hi)/2; } return Y(s); }; };
const NUM=/-?\d*\.?\d+/g;
const mix=(a,b,t)=>{ a=String(a); b=String(b); if(a===b) return a;
  const na=a.match(NUM)||[], nb=b.match(NUM)||[], ta=a.replace(NUM,"\u0001"), tb=b.replace(NUM,"\u0001");
  if(ta!==tb) return t<1? a : b;
  let i=0; return ta.replace(/\u0001/g,()=>{ const v=+na[i]+(+nb[i]-+na[i])*t; i++; return String(+v.toFixed(4)); }); };
const RUN=new WeakMap();
function A(el, kf, o){
  o=typeof o==="number"? {duration:o} : (o||{});
  const n=kf.length, ks=kf.map((k,i)=>({...k, offset:k.offset!=null? k.offset : (n<2? 1 : i/(n-1))}));
  const props=[...new Set(ks.flatMap(k=>Object.keys(k).filter(p=>p!=="offset" && p!=="easing")))];
  const before={}; props.forEach(p=>before[p]=el.style[p]);
  const ez=bez(o.easing), segE=ks.map(k=>bez(k.easing)), ms=reduce? 1 : Math.max(1, o.duration||1);
  let done, raf=0, over=false; const finished=new Promise(r=>done=r);
  const paint=g=>{ let i=0; while(i<n-2 && g>ks[i+1].offset) i++;
    const a=ks[i], b=ks[Math.min(i+1,n-1)], span=(b.offset-a.offset)||1, u=segE[i](Math.min(1,Math.max(0,(g-a.offset)/span)));
    props.forEach(p=>{ const va=a[p]!=null? a[p] : before[p], vb=b[p]!=null? b[p] : va; el.style[p]=mix(va, vb, u); }); };
  const end=keep=>{ if(over) return; over=true; cancelAnimationFrame(raf); const set=RUN.get(el); set && set.delete(api);
    if(!keep) props.forEach(p=>el.style[p]=before[p]); done(); };
  const t0=performance.now();
  const step=now=>{ if(over) return; const t=Math.min(1, Math.max(0,(now-t0)/ms)); paint(ez(t)); if(t<1) raf=requestAnimationFrame(step); else end(o.fill==="forwards"); };
  const api={finished, cancel:()=>{ if(over) props.forEach(p=>el.style[p]=before[p]); else end(false); }};   // 끝난 뒤 cancel = 원래대로
  if(!RUN.has(el)) RUN.set(el, new Set()); RUN.get(el).add(api);
  paint(0); raf=requestAnimationFrame(step);
  return api;
}
const stopAll=el=>{ const set=RUN.get(el); if(set) [...set].forEach(a=>a.cancel()); };
let uid=0;
// 입체 몬스터볼 (그라데이션 · 반짝이) — 화면마다 id가 겹치지 않게 새로 만들어요
const ballSVG=()=>{ const k="gqb"+(++uid);
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>
  <radialGradient id="${k}r" cx="36%" cy="28%" r="78%"><stop offset="0" stop-color="#ff7a7a"/><stop offset=".5" stop-color="#e3262c"/><stop offset="1" stop-color="#8f0d12"/></radialGradient>
  <radialGradient id="${k}w" cx="36%" cy="40%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#eceef5"/><stop offset="1" stop-color="#9da3b8"/></radialGradient></defs>
  <circle cx="50" cy="50" r="46" fill="url(#${k}w)"/>
  <g class="gb-top"><path d="M4 50 A46 46 0 0 1 96 50 Z" fill="url(#${k}r)"/><ellipse cx="32" cy="24" rx="13" ry="7" fill="#fff" opacity=".5" transform="rotate(-32 32 24)"/></g>
  <path d="M4 50 H96" stroke="#1d2131" stroke-width="7"/><circle cx="50" cy="50" r="15" fill="#1d2131"/>
  <circle class="gb-btn" cx="50" cy="50" r="9.5" fill="#fff" stroke="#c9cede" stroke-width="2"/>
  <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.6"/></svg>`; };
const BASE={c:.5, r:.4, l:.28, m:.25, s:.22};                 // 맞혔을 때 잡힐 기본 확률
const MULT={none:1, nice:1.3, great:1.7, excellent:2.3};       // 고리 보너스
const CURVE=1.4;                                               // 커브볼 보너스
const WORD={nice:"Nice!", great:"Great!", excellent:"Excellent!"};
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
      <div class="gq-body"><div class="gq-art">${o.art}<div class="gq-tint">${o.art}</div></div></div>
      <div class="gq-ring"><i class="gq-ring-out"></i><i class="gq-ring-goal" style="transform:scale(${thr})"></i><i class="gq-ring-in" style="--rc:${o.color}"></i></div></div>
    <p class="gq-word"></p>
    <i class="gq-fsh"></i><div class="gq-fly">${ballSVG()}</div>
    <div class="gq-home"><div class="gq-arrow"><i></i></div><button class="gq-ball" aria-label="몬스터볼 던지기">${ballSVG()}<i class="gq-spark"></i></button></div>
    <div class="gq-fx"></div>`;
  root.prepend(layer);
  const $=s=>layer.querySelector(s);
  const mon=$(".gq-mon"), body=$(".gq-body"), art=$(".gq-art"), tint=$(".gq-tint"), ringEl=$(".gq-ring"), ringIn=$(".gq-ring-in"), word=$(".gq-word"),
    ball=$(".gq-ball"), ballSvg=ball.querySelector("svg"), arrow=$(".gq-arrow"), fx=$(".gq-fx"), fly=$(".gq-fly"), fsh=$(".gq-fsh"), shadow=$(".gq-shadow");
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
    if(!busy){
      swayT+=dt/(o.slow()||1);
      const w=2*Math.PI*swayT/R.swayMs;
      mon.style.setProperty("--sway", `${(R.sway*.75*mon.offsetWidth*(0.7*Math.sin(w)+0.3*Math.sin(2.3*w+1))).toFixed(1)}px`);
      if(t>hopT && !reduce){ hopT=t+4000+Math.random()*4000; hop(); }
    }
    if(charge){ aimT+=dt; aim=Math.sin(2*Math.PI*aimT/1500); arrow.style.transform=`translateX(-50%) rotate(${(aim*24).toFixed(1)}deg)`; }
    raf=requestAnimationFrame(tick);
  };
  const hop=()=>A(body, [{transform:"translateY(0%) scaleY(1)"},{transform:"translateY(-18%) scaleY(1.04)",offset:.45},{transform:"translateY(0%) scaleY(.96)",offset:.85},{transform:"translateY(0%) scaleY(1)"}],{duration:620,easing:"ease-out"});

  /* ---------- 손에 든 볼: 끌기 · 빙글빙글(커브볼) · 튕겨 던지기 ---------- */
  let drag=null, curve=0;
  const spring=()=>{ A(ball, [{transform:ball.style.transform||"translate(0px, 0px)"},{transform:"translate(0px, 0px)"}],{duration:260,easing:"cubic-bezier(.3,1.6,.5,1)"}); ball.style.transform=""; };
  ball.addEventListener("pointerdown", e=>{
    if(!live||busy) return; e.preventDefault();
    const r=ball.getBoundingClientRect();
    drag={x0:e.clientX, y0:e.clientY, cx:r.left+r.width/2, cy:r.top+r.height/2, a:null, spin:0, pts:[{x:e.clientX,y:e.clientY,t:performance.now()}]};
    try{ ball.setPointerCapture(e.pointerId); }catch(_){}
    ball.classList.add("held"); o.sfx("click");
  });
  ball.addEventListener("pointermove", e=>{
    if(!drag) return;
    const t=performance.now(); drag.pts.push({x:e.clientX,y:e.clientY,t}); while(drag.pts.length>2 && t-drag.pts[0].t>110) drag.pts.shift();
    // 볼 둘레를 빙글빙글 문지르면 볼이 돌아요 → 한 바퀴 반이 넘으면 반짝반짝 커브볼
    const dx=e.clientX-drag.cx, dy=e.clientY-drag.cy;
    if(dx*dx+dy*dy>200){ const a=Math.atan2(dy,dx); if(drag.a!=null){ let d=a-drag.a; if(d>Math.PI) d-=2*Math.PI; if(d<-Math.PI) d+=2*Math.PI; drag.spin+=d; } drag.a=a; }
    ballSvg.style.transform=`rotate(${(drag.spin*57.3*2).toFixed(0)}deg)`;
    if(!curve && Math.abs(drag.spin)>Math.PI*3){ curve=drag.spin>0? 1 : -1; ball.classList.add("curve"); o.sfx("star"); }
    ball.style.transform=`translate(${((e.clientX-drag.x0)*.85).toFixed(0)}px, ${((e.clientY-drag.y0)*.85).toFixed(0)}px)`;
  });
  const release=()=>{
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

  /* ---------- 날아가는 볼 (한 장면씩 직접 그려요) ---------- */
  const box=el=>{ const L=layer.getBoundingClientRect(), r=el.getBoundingClientRect(); return {x:r.left-L.left+r.width/2, y:r.top-L.top+r.height/2, w:r.width, h:r.height}; };
  let B=92;
  const place=p=>{
    fly.style.transform=`translate3d(${(p.x-B/2).toFixed(1)}px, ${(p.y-B/2).toFixed(1)}px, 0) rotate(${(p.r||0).toFixed(0)}deg) scale(${p.s.toFixed(3)})`;
    fly.style.opacity=p.o==null? 1 : p.o;
    if(p.gy!=null){ fsh.style.transform=`translate3d(${(p.x-B/2).toFixed(1)}px, ${(p.gy-B*.14).toFixed(1)}px, 0) scale(${p.s.toFixed(3)})`; fsh.style.opacity=((p.so==null?.5:p.so)*(p.o==null?1:p.o)).toFixed(2); }
    else fsh.style.opacity=0;
  };
  const trail=(p,gold)=>{ const t=document.createElement("i"); t.className="gq-tr"+(gold?" gold":"");
    const sz=Math.max(6, B*p.s*.42); t.style.cssText=`left:${(p.x-sz/2).toFixed(0)}px;top:${(p.y-sz/2).toFixed(0)}px;width:${sz.toFixed(0)}px;height:${sz.toFixed(0)}px`;
    fx.appendChild(t); setTimeout(()=>t.remove(), 520); };
  function move(ms, path, tr){
    return new Promise(res=>{
      const t0=performance.now(); let lt=0; if(reduce) ms=1;
      const step=now=>{ const t=Math.min(1,Math.max(0,(now-t0)/ms)), p=path(t); place(p);
        if(tr && now-lt>24 && t<1){ lt=now; trail(p, tr===2); }
        if(t<1) requestAnimationFrame(step); else res(p); };
      requestAnimationFrame(step);
    });
  }
  const ease={out:t=>1-(1-t)*(1-t), in:t=>t*t};

  async function throwOnce(how){
    busy=true; o.onThrow();
    const S=box(ball), M=box(art), RG=box(ringEl);
    B=S.w; fly.style.width=fly.style.height=B+"px"; fsh.style.width=B+"px"; fsh.style.height=(B*.28)+"px";
    const ringNow=ring, depth=Math.max(80, S.y-M.y), cv=curve; curve=0;
    if(how.auto) how.dir=(M.x-S.x)/(depth*.92);                   // 테스트 · 엔터: 포켓몬 가운데로
    const f=how.power/1.7;                                         // 1 = 알맞은 세기
    const landX=S.x+how.dir*depth*.92;
    const short=f<0.62, long=f>1.85;
    const dxMon=landX-M.x, onBody=!short && !long && Math.abs(dxMon)<=M.w*.40;
    const inRing=onBody && Math.abs(landX-RG.x)<=RG.w/2*ringNow*1.02;
    const quality=!inRing? "none" : ringNow<=thr*0.75? "excellent" : ringNow<=Math.max(thr+0.12,0.5)? "great" : "nice";
    // 손에 든 볼 → 날아가는 볼로 바꿔요
    stopAll(ball); ball.style.transform=""; ballSvg.style.transform=""; ball.classList.remove("curve");
    ball.style.visibility="hidden"; fly.className="gq-fly on"+(cv?" curve":"");
    ringEl.classList.add("hide");
    o.sfx("throw");
    const sEnd=Math.min(.55, Math.max(.26, M.w*.3/B));             // 포켓몬 옆에서 볼 크기
    const persp=u=>1/(1+(1/sEnd-1)*u);                             // 멀어질수록 작아져요
    const feetY=M.y+M.h*.47, groundY=u=>S.y+B*.5+(feetY-S.y-B*.5)*u;
    const sd=dxMon>=0? 1 : -1;
    const spin=(cv? 1440*cv : 900*sd);
    const bow=cv? cv*-depth*.28 : 0;                               // 커브볼은 옆으로 휘었다가 돌아와요
    // 날아가는 길: x는 곧게(+커브), y는 포물선, 크기는 원근
    const arc=(to, uEnd, arcH, ms)=>move(ms, t=>{ const u=t*uEnd;
      return {x:S.x+(to.x-S.x)*t+bow*Math.sin(Math.PI*t), y:S.y+(to.y-S.y)*t-arcH*4*t*(1-t), s:persp(u), r:spin*t, gy:groundY(Math.min(u,1)), so:.45}; }, cv? 2 : 1);

    if(!onBody){
      if(short){
        // 짧게: 앞 풀밭에 떨어져 통통 → 데굴데굴 굴러 사라져요
        const u=Math.max(.22, Math.min(.6, f/0.62*.6)), gy=groundY(u), s0=persp(u), T={x:S.x+(landX-S.x)*u, y:gy-B*s0*.45};
        const end=await arc(T, u, depth*.18, 520);
        o.sfx("miss");
        await move(760, t=>({x:T.x+sd*110*t, y:T.y-26*Math.abs(Math.sin(Math.PI*2*Math.min(1,t*1.4)))*(1-t), s:s0*(1-.15*t), r:end.r+sd*540*t, gy, so:.45, o:t<.6? 1 : 1-(t-.6)/.4}));
        say("앗, 짧았어! 더 세게 휙!", "miss");
      }else if(long){
        // 너무 세게: 포켓몬 머리 위로 휙 넘어가 저 멀리
        const T={x:landX, y:M.y-M.h*.95};
        const end=await arc(T, 1.25, depth*.55, 820);
        o.sfx("miss");
        await move(360, t=>({x:T.x, y:T.y+M.h*.5*ease.in(t), s:end.s*(1-.35*t), r:end.r+200*t, o:1-t}));
        say("앗, 너무 셌어! 살짝만!", "miss");
      }else{
        // 옆으로: 포켓몬 옆을 스쳐 지나가요
        const T={x:landX, y:M.y+M.h*.08};
        const end=await arc(T, 1, depth*.42, 680);
        o.sfx("miss");
        await move(420, t=>({x:T.x+sd*70*t, y:T.y+M.h*.4*ease.in(t), s:end.s*(1-.2*t), r:end.r+260*t, gy:feetY, so:.4, o:1-t}));
        say("앗, 빗나갔다!", "miss");
      }
      if(!reduce) A(body, [{transform:"translate(0%, 0%) rotate(0deg)"},{transform:`translate(${-sd*6}%, -14%) rotate(${-sd*6}deg)`,offset:.4},{transform:"translate(0%, 0%) rotate(0deg)"}],{duration:480,easing:"ease-out"});
      o.say("miss");
      fly.className="gq-fly"; fsh.style.opacity=0;
      await wait(700);
      return {hit:false, quality:"none"};
    }

    // ===== 명중! =====
    const P={x:landX, y:M.y-M.h*.04};
    const hitP=await arc(P, 1, depth*.48, 700);
    o.sfx("hit");
    bonk(P, hitP.s);
    if(!reduce) A(body, [{transform:"scale(1,1)"},{transform:"scale(1.08,.88)",offset:.3},{transform:"scale(.97,1.04)",offset:.65},{transform:"scale(1,1)"}],{duration:300,easing:"ease-out"});
    const q=[quality!=="none"&&WORD[quality], cv&&"커브볼!"].filter(Boolean).join(" ");
    if(q){ say(q, "q "+(quality!=="none"? quality : "curve")); o.say(quality!=="none"? quality : "curve"); }
    // 탁 튀어 올라 공중에서 멈춰요 (돌던 볼이 멈추며 똑바로)
    const P2={x:P.x+(M.x-P.x)*.4, y:M.y-M.h*.62}, sB=hitP.s*1.08, r0=hitP.r%360;
    await move(420, t=>{ const e=ease.out(t); return {x:P.x+(P2.x-P.x)*e, y:P.y+(P2.y-P.y)*e, s:hitP.s+(sB-hitP.s)*e, r:r0*(1-e), gy:feetY, so:.3*(1-t)}; });
    await wait(120);
    // 볼이 열리고 빨간 빛줄기로 쏙!
    fly.classList.add("open"); o.sfx("pop");
    const Mc={x:M.x, y:M.y+M.h*.05}, dx=Mc.x-P2.x, dy=Mc.y-P2.y, len=Math.hypot(dx,dy), ang=(Math.atan2(dy,dx)*57.3-90).toFixed(1);
    const beam=document.createElement("i"); beam.className="gq-beam";
    beam.style.cssText=`left:${P2.x.toFixed(0)}px;top:${P2.y.toFixed(0)}px;height:${len.toFixed(0)}px;width:${Math.max(18,B*sB*.7).toFixed(0)}px`;
    fx.appendChild(beam);
    A(beam, [{transform:`translateX(-50%) rotate(${ang}deg) scaleY(0)`},{transform:`translateX(-50%) rotate(${ang}deg) scaleY(1)`}],{duration:reduce?1:180,easing:"ease-out",fill:"forwards"});
    const glow=document.createElement("i"); glow.className="gq-glow"; glow.style.cssText=`left:${P2.x.toFixed(0)}px;top:${P2.y.toFixed(0)}px`;
    fx.appendChild(glow);
    A(glow, [{transform:"translate(-50%,-50%) scale(.2)",opacity:0},{transform:"translate(-50%,-50%) scale(1)",opacity:1}],{duration:reduce?1:260,easing:"ease-out",fill:"forwards"});
    const tintA=A(tint, [{opacity:0},{opacity:1}],{duration:reduce?1:220,fill:"forwards"});
    await wait(280);
    const mv=`translate(${(P2.x-M.x).toFixed(0)}px, ${(P2.y-M.y).toFixed(0)}px)`;
    art.classList.add("still");
    const suck=A(art, [{transform:"translate(0px, 0px) scale(1, 1)",opacity:1},{transform:"translate(0px, 0px) scale(1.08, .9)",opacity:1,offset:.2},{transform:`${mv} scale(.04, .04)`,opacity:.3}],{duration:reduce?1:520,easing:"cubic-bezier(.6,0,.9,.6)",fill:"forwards"});
    await suck.finished;
    art.style.visibility="hidden"; shadow.classList.add("gone");
    A(beam, [{opacity:1},{opacity:0}],{duration:reduce?1:180,fill:"forwards"});
    fly.classList.remove("open"); o.sfx("click");
    // ===== 볼로 확대! 하늘에서 풀밭으로 떨어져요 =====
    await A(glow, [{transform:"translate(-50%,-50%) scale(1)",opacity:1},{transform:"translate(-50%,-50%) scale(9)",opacity:1}],{duration:reduce?1:300,easing:"ease-in",fill:"forwards"}).finished;
    const Z=zoomIn();
    fly.className="gq-fly"; fsh.style.opacity=0;
    A(glow, [{opacity:1},{opacity:0}],{duration:reduce?1:420,fill:"forwards"});
    setTimeout(()=>{ beam.remove(); glow.remove(); }, 600);
    await Z.drop();
    // 흔들흔들 (1~3번) — 고리 · 커브볼 보너스가 좋을수록 잘 잡혀요
    const chance=Math.min(.97, (BASE[o.grade]||.4)*MULT[quality]*(cv?CURVE:1)*(o.shiny?.9:1));
    const caught=(window.__gqCatch!=null? window.__gqCatch : Math.random())<chance, shakes=caught? 3 : 1+Math.floor(Math.random()*3);
    for(let k=0;k<shakes;k++){ await wait(k? 520 : 420); o.sfx("wobble"); await Z.wobble(k); }
    await wait(480);
    if(caught){
      o.sfx("catch"); await Z.lock();
      return {hit:true, caught:true, quality, curve:!!cv};
    }
    // 펑! 튀어나왔어요 → 원래 화면으로
    o.sfx("pop");
    await Z.burst();
    tintA.cancel(); suck.cancel(); art.style.visibility="";
    setTimeout(()=>art.classList.remove("still"), reduce? 1 : 560);
    A(art, [{transform:"scale(.1)",opacity:0},{transform:"scale(1.12)",opacity:1,offset:.6},{transform:"scale(1)",opacity:1}],{duration:reduce?1:520,easing:"cubic-bezier(.3,1.6,.5,1)"});
    shadow.classList.remove("gone");
    say("앗! 튀어나왔어!", "miss"); o.say("break");
    await wait(1000);
    return {hit:true, caught:false, quality, curve:!!cv};
  }

  /* 탁! 부딪히는 반짝 */
  function bonk(p, s){
    const b=document.createElement("div"); b.className="gq-bonk"; b.style.left=p.x+"px"; b.style.top=p.y+"px"; b.style.setProperty("--k", Math.max(.6, s*1.6).toFixed(2));
    b.innerHTML=`<i class="ring"></i>${[0,45,90,135,180,225,270,315].map(d=>`<span style="--d:${d}deg"></span>`).join("")}`;
    fx.appendChild(b); setTimeout(()=>b.remove(), 700);
  }

  /* 확대 화면: 하늘의 볼 → 풀밭으로 툭 → 흔들 → 딸깍 ⭐ / 펑! */
  function zoomIn(){
    const z=document.createElement("div"); z.className="gq-zoom";
    z.innerHTML=`<div class="gq-zw">${worldHTML()}</div><i class="gq-zsh"></i><div class="gq-zb"><i class="gq-zr"></i><i class="gq-zr r2"></i><div class="gq-zball">${ballSVG()}</div></div>
      <p class="gq-zsay"></p><div class="gq-zfx"></div>`;
    layer.appendChild(z);
    const H=layer.clientHeight, zb=z.querySelector(".gq-zb"), zball=z.querySelector(".gq-zball"), zw=z.querySelector(".gq-zw"), zsh=z.querySelector(".gq-zsh"), zfx=z.querySelector(".gq-zfx"), zsay=z.querySelector(".gq-zsay");
    const zh=zball.offsetHeight, y0=H*.22, y1=H*.6, at=y=>`translate(-50%, ${y.toFixed(0)}px)`;
    zb.style.transform=at(y0); zsh.style.top=(y1+zh*.86).toFixed(0)+"px"; zfx.style.top=(y1+zh*.5).toFixed(0)+"px";
    const d=ms=>reduce? 1 : ms;
    return {
      async drop(){
        await wait(520);                                             // 하늘에서 빛나는 볼 (파란 고리)
        zb.classList.add("fall");
        A(zw, [{transform:"translateY(0%)"},{transform:"translateY(-34%)"}],{duration:d(950),easing:"cubic-bezier(.5,0,.3,1)",fill:"forwards"});
        await A(zb, [
          {transform:at(y0),easing:"cubic-bezier(.5,0,1,.6)"},
          {transform:at(y1),offset:.56,easing:"cubic-bezier(0,.4,.5,1)"},
          {transform:at(y1-H*.08),offset:.72,easing:"cubic-bezier(.5,0,1,.6)"},
          {transform:at(y1),offset:.86,easing:"cubic-bezier(0,.4,.5,1)"},
          {transform:at(y1-H*.02),offset:.93,easing:"ease-in"},
          {transform:at(y1)}],{duration:d(1150),fill:"forwards"}).finished;
        zsh.classList.add("on"); o.sfx("wobble");
      },
      async wobble(k){
        const s=k%2? -1 : 1;
        zball.classList.add("wob");
        await A(zball, [{transform:"translateX(0px) rotate(0deg)"},{transform:`translateX(${-6*s}px) rotate(${-24*s}deg)`,offset:.28},{transform:`translateX(${5*s}px) rotate(${18*s}deg)`,offset:.62},{transform:`translateX(${-2*s}px) rotate(${-6*s}deg)`,offset:.84},{transform:"translateX(0px) rotate(0deg)"}],{duration:d(720),easing:"ease-in-out"}).finished;
        zball.classList.remove("wob");
      },
      lock(){
        zball.classList.add("locked");
        A(zball, [{transform:"scale(1, 1)"},{transform:"scale(1.06, .94)",offset:.3},{transform:"scale(1, 1)"}],{duration:d(320)});
        zfx.innerHTML=`<i class="gq-halo"></i>${[-1,0,1].map(i=>`<b class="gq-star" style="--i:${i}">★</b>`).join("")}`+
          Array.from({length:12},(_,i)=>`<i class="gq-dot" style="--a:${i*30}deg;--c:${["#fde047","#4ade80","#f87171","#60a5fa"][i%4]}"></i>`).join("");
        setTimeout(()=>{ zsay.textContent="신난다~!"; zsay.classList.add("show"); }, reduce? 0 : 500);
        confetti(z);
        return wait(1700);                                           // 별이 다 터질 때까지 보여 줘요
      },
      async burst(){
        zball.classList.add("open");
        zfx.innerHTML=`<i class="gq-rays"></i>`;
        await wait(380);
        await A(z, [{opacity:1},{opacity:0}],{duration:d(320),fill:"forwards"}).finished;
        z.remove();
      },
    };
  }

  // 새 볼이 아래에서 올라와요
  function freshBall(){
    stopAll(ball); ball.style.transform=""; ball.style.visibility=""; ball.className="gq-ball"; ballSvg.style.transform="";
    fly.className="gq-fly"; fsh.style.opacity=0;
    A(ball, [{transform:"translateY(120%) scale(.6)",opacity:0},{transform:"translateY(0%) scale(1)",opacity:1}],{duration:reduce?1:380,easing:"cubic-bezier(.3,1.5,.5,1)"});
    ringEl.classList.remove("hide"); say("");
  }
  function confetti(host){
    if(reduce) return;
    const C=["#fde047","#f97316","#22c55e","#38bdf8","#a78bfa","#f472b6"];
    for(let i=0;i<36;i++){ const s=document.createElement("i"); s.className="gq-conf";
      s.style.left=Math.random()*100+"%"; s.style.background=C[i%C.length];
      s.style.setProperty("--x",((Math.random()-.5)*160).toFixed(0)+"px"); s.style.setProperty("--r",(360+Math.random()*720).toFixed(0)+"deg");
      s.style.animationDelay=(.5+Math.random()*.4).toFixed(2)+"s"; s.style.animationDuration=(1.6+Math.random()*1.1).toFixed(2)+"s"; host.appendChild(s); setTimeout(()=>s.remove(),3600); }
  }

  async function start(){
    o.sfx(o.legend? "star" : "rustle");
    await wait(300);
    mon.classList.add("in"); o.cry();
    await wait(o.introMs!=null? o.introMs : 1400);
    ringEl.classList.add("on"); live=true; raf=requestAnimationFrame(tick);
    let throws=0, best="none", anyCurve=false;
    for(;;){
      const how=await new Promise(r=>{ throwResolve=r; });
      throws++;
      const r=await throwOnce(how);
      if(r.quality!=="none") best=r.quality; if(r.curve) anyCurve=true;
      if(r.caught){ stop(); return {caught:true, quality:r.quality, throws, curve:!!r.curve}; }
      if(throws>=o.maxThrows || !o.canThrow()){
        // 도망가요
        ringEl.classList.add("hide"); say(""); busy=true;
        layer.classList.add("puff");
        await A(body, [{opacity:1, transform:"translate(0px, 0%) scale(1)"},{opacity:1, transform:"translate(0px, -12%) scale(1.05)",offset:.25},{opacity:0, transform:"translate(220px, -8%) scale(.6)"}],{duration:reduce?1:800,easing:"ease-in",fill:"forwards"}).finished;
        stop(); return {caught:false, fled:true, quality:best, throws, curve:anyCurve};
      }
      freshBall(); busy=false;
    }
  }
  function stop(){ live=false; cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey, true); document.removeEventListener("keyup", onKey, true); if(throwResolve) throwResolve=null; }
  return {start, stop, layer, throwNow:how=>fire(how||{power:1.7, auto:true}), get ring(){ return ring; }, get thr(){ return thr; }};
}
window.GoCatch={create, get BALL(){ return ballSVG(); }};
})();
