import { getTargetIdConfig } from './targetid.config.js';
import { computeTargetIdRaw, scaleTargetId } from './targetid.scoring.js';
import { makeRng, spawnTarget, formatClock } from './targetid.utils.js';

(function(){
  const btn=document.getElementById('start-targetid');
  const canvas=document.getElementById('targetid-canvas');
  const timeEl=document.getElementById('targetid-time');
  const scoreEl=document.getElementById('targetid-score');
  const statsBox=document.getElementById('targetid-stats');
  const phaseBanner=document.getElementById('targetid-phase-banner');
  const realStartBtn=document.getElementById('targetid-real-start-button');
  const countdownEl=document.getElementById('targetid-countdown');
  const statusEl=document.getElementById('targetid-status');
  if(!btn||!canvas) return; 
  const ctx=canvas.getContext('2d');

  let running=false,lastTs=0,timeLeft=0; let mouse={x:0,y:0}; let targets=[]; let hits=0,shots=0,wrong=0,lastSpawn=0; let cfg=null; let rng=null;
  let stage='idle'; let practiceDone=false; let countdownTimer=null; let countdownRemaining=0; let mode='idle';

  function applyConfig(){ cfg=getTargetIdConfig(); }

  function startPractice(){
    if(stage==='real' || stage==='countdown' || stage==='done') return;
    if(stage==='practice' && !practiceDone) return;
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    stage='practice'; practiceDone=false; mode='practice';
    setBanner('תרגול - התוצאות אינן נשמרות', 'practice');
    toggleRealStartButton(true,true);
    setCountdown(null); clearCountdown();
    setStatus('תרגול: פגע רק במטרות הירוקות והימנע מהאדומות', 'info');
    updateStatsVisibility();
    startRun('practice');
  }

  function finishPractice(options={}){
    const { skipMessage=false, keepFullscreen=true } = options;
    stage='practice'; practiceDone=true; mode='idle';
    if(!skipMessage){
      setStatus('התרגול הסתיים. לחצו על "סיימתי תרגול – להתחיל מבחן אמיתי" כדי להמשיך.', 'info');
      setBanner('התרגול הסתיים - ניתן להתחיל את המבחן האמיתי', 'practice');
    }
    toggleRealStartButton(true,false);
    setCountdown(null); clearCountdown();
    updateStatsVisibility();
    if(!(window.testAuth && !window.testAuth.isAdmin())) scoreEl.textContent='-';
    if(!keepFullscreen && window.exitFullscreenMode) window.exitFullscreenMode();
  }

  function startRealCountdown(){
    if(stage==='real' || stage==='countdown' || stage==='done') return;
    if(!practiceDone){ setStatus('יש להשלים את התרגול לפני תחילת המבחן.', 'error'); return; }
    stage='countdown'; mode='idle';
    setBanner('ספירה לאחור למבחן האמיתי', 'countdown');
    toggleRealStartButton(true,true);
    countdownRemaining=10;
    const label=countdownRemaining===1?'שנייה':'שניות';
    setCountdown(`המבחן האמיתי יתחיל בעוד ${countdownRemaining} ${label}`);
    setStatus('המבחן האמיתי יתחיל בעוד 10 שניות. התכוננו!', 'pending');
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    clearCountdown();
    countdownTimer=setInterval(()=>{
      countdownRemaining--;
      if(countdownRemaining>0){
        const lbl=countdownRemaining===1?'שנייה':'שניות';
        setCountdown(`המבחן האמיתי יתחיל בעוד ${countdownRemaining} ${lbl}`);
      } else {
        clearCountdown(); setCountdown(null);
        startRealTest();
      }
    },1000);
  }

  function startRealTest(){
    clearCountdown(); setCountdown(null);
    toggleRealStartButton(false);
    stage='real'; mode='real';
    setBanner('מבחן אמיתי - התוצאות נשמרות', 'real');
    setStatus('מבחן אמיתי: פגע רק בירוקים ושמור על דיוק גבוה.', 'info');
    updateStatsVisibility();
    startRun('real');
  }

  function startRun(targetMode='real'){
    if(running) return;
    applyConfig();
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    resize();
    requestAnimationFrame(()=>resize());
    const admin = window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin();
    if(statsBox){ statsBox.style.display = (targetMode==='real' && admin) ? 'block' : 'none'; }
    timeLeft=cfg.seconds; 
    hits=0; 
    shots=0; 
    wrong=0; 
    targets=[]; 
    lastSpawn=0; 
    running=true; 
    lastTs=0; 
    rng=makeRng(987654+Date.now()); 
    canvas.style.cursor='none';
    if(!(window.testAuth && !window.testAuth.isAdmin())) scoreEl.textContent='-';
    mode=targetMode;
    updateStatsVisibility();
    requestAnimationFrame(step); 
  }

  function setBanner(text, tone){
    if(!phaseBanner) return;
    if(!text){
      phaseBanner.style.display='none';
      phaseBanner.textContent='';
      phaseBanner.removeAttribute('data-mode');
      return;
    }
    phaseBanner.style.display='block';
    phaseBanner.textContent=text;
    if(tone) phaseBanner.setAttribute('data-mode', tone);
    else phaseBanner.removeAttribute('data-mode');
  }

  function toggleRealStartButton(show, disabled){
    if(!realStartBtn) return;
    realStartBtn.style.display = show ? 'inline-flex' : 'none';
    realStartBtn.disabled = !!disabled;
  }

  function setCountdown(text){
    if(!countdownEl) return;
    if(text){ countdownEl.style.display='block'; countdownEl.textContent=text; }
    else { countdownEl.style.display='none'; countdownEl.textContent=''; }
  }

  function clearCountdown(){
    if(countdownTimer){ clearInterval(countdownTimer); countdownTimer=null; }
  }

  function setStatus(text, tone='info'){
    if(!statusEl) return;
    statusEl.textContent=text||'';
    statusEl.setAttribute('data-tone', tone);
  }

  function updateStatsVisibility(){
    if(!statsBox) return;
    const admin = window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin();
    if(stage==='real' && admin){ statsBox.style.display='block'; }
    else if(stage==='real' && !admin){ statsBox.style.display='none'; }
    else { statsBox.style.display='none'; }
  }

  function start(){ startRun('real'); }

  function resize(){ 
    const size=Math.floor(window.innerHeight*0.8); 
    canvas.width=size; 
    canvas.height=size; 
    canvas.style.width=size+'px'; 
    canvas.style.height=size+'px'; 
    if(canvas.width<50){ 
      setTimeout(resize,120); 
    } 
  }

  function step(ts){ 
    if(!running) return; 
    if(!lastTs) lastTs=ts; 
    const dt=Math.min(0.05,(ts-lastTs)/1000); 
    lastTs=ts; 
    timeLeft=Math.max(0,timeLeft-dt); 
    timeEl.textContent=formatClock(timeLeft); 
    lastSpawn+=dt; 
    if(lastSpawn>cfg.spawnRate){ 
      lastSpawn=0; 
      targets.push(spawnTarget(rng, canvas, cfg.speed, cfg.goodProb)); 
    }
    targets.forEach(t=>{ 
      t.x+=t.vx*dt; 
      t.y+=t.vy*dt; 
      if(t.x<0||t.x>canvas.width) t.vx*=-1; 
      if(t.y<0||t.y>canvas.height) t.vy*=-1; 
    });
    ctx.clearRect(0,0,canvas.width,canvas.height); 
    ctx.fillStyle='#0b1729'; 
    ctx.fillRect(0,0,canvas.width,canvas.height);
    targets.forEach(t=>{ 
      ctx.beginPath(); 
      ctx.arc(t.x,t.y,t.r,0,Math.PI*2); 
      ctx.fillStyle=t.good? '#22c55e':'#ef4444'; 
      ctx.fill(); 
      ctx.strokeStyle='rgba(255,255,255,.25)'; 
      ctx.stroke(); 
    });
    const raw=computeTargetIdRaw(hits, shots, wrong); 
    const g=window.getGlobalScale? window.getGlobalScale():{min:1,max:7}; 
    const scaled=scaleTargetId(raw,g); 
    if(!(window.testAuth && !window.testAuth.isAdmin())) scoreEl.textContent=scaled.toFixed(2);
    drawCross(); 
    if(timeLeft<=0){ 
      finish(raw,scaled); 
      return; 
    } 
    requestAnimationFrame(step); 
  }

  function finish(raw,scaled){ 
    running=false; 
    canvas.style.cursor='default'; 
    if(mode==='practice'){ 
      finishPractice(); 
      return; 
    }
    if(window.exitFullscreenMode) window.exitFullscreenMode(); 
    if(window.testsCore){ 
      window.testsCore.completeTest('targetid', raw, scaled, {hits,shots,wrong}); 
    }
    if(window.testAuth){
      window.testAuth.showTestCompleteModal('targetid', scaled.toFixed(2));
    }
    stage='done'; mode='idle';
    setBanner('המבחן האמיתי הסתיים', 'done');
    setCountdown(null); toggleRealStartButton(false);
    setStatus('המבחן הסתיים.', 'success');
  }

  function drawCross(){ 
    ctx.save(); 
    ctx.translate(mouse.x,mouse.y); 
    ctx.strokeStyle='#e5e7eb'; 
    ctx.lineWidth=1.5; 
    ctx.beginPath(); 
    ctx.moveTo(-8,0); 
    ctx.lineTo(8,0); 
    ctx.moveTo(0,-8); 
    ctx.lineTo(0,8); 
    ctx.stroke(); 
    ctx.restore(); 
  }

  canvas.addEventListener('mousemove',e=>{ 
    const r=canvas.getBoundingClientRect(); 
    mouse.x=e.clientX-r.left; 
    mouse.y=e.clientY-r.top; 
  });

  canvas.addEventListener('click',()=>{ 
    if(!running) return; 
    shots++; 
    for(let i=targets.length-1;i>=0;i--){ 
      const t=targets[i]; 
      const d=Math.hypot(mouse.x-t.x,mouse.y-t.y); 
      if(d<=t.r+4){ 
        if(t.good) hits++; 
        else wrong++; 
        targets.splice(i,1); 
        break; 
      } 
    } 
  });

  btn.addEventListener('click', startPractice); 
  if(realStartBtn) realStartBtn.addEventListener('click', startRealCountdown);
  document.addEventListener('DOMContentLoaded',()=>{ 
    if(window.testsCore) window.testsCore.registerTest('targetid',{title:'ירי במטרות'}); 
  });
})();