import { getFlightControlConfig } from './flightcontrol.config.js';
import { computeFlightControlRaw, scaleFlightControl } from './flightcontrol.scoring.js';
import { fmtTime, maxRadius, noiseValue } from './flightcontrol.utils.js';

(function(){
  const btn=document.getElementById('start-flightcontrol');
  const canvas=document.getElementById('flightcontrol-canvas');
  const timeEl=document.getElementById('flightcontrol-time');
  const scoreEl=document.getElementById('flightcontrol-score');
  const statsBox=document.getElementById('flightcontrol-stats');
  const phaseBanner=document.getElementById('flightcontrol-phase-banner');
  const realStartBtn=document.getElementById('flightcontrol-real-start-button');
  const countdownEl=document.getElementById('flightcontrol-countdown');
  const statusEl=document.getElementById('flightcontrol-status');
  if(!btn||!canvas) return; 
  const ctx=canvas.getContext('2d');
  
  let running=false, lastTs=0, timeLeft=0;
  let cursor={x:0,y:0};
  let keys={};
  let accum=0, samples=0;
  let CX=0, CY=0;
  let cfg=null;
  let stage='idle'; let practiceDone=false; let countdownTimer=null; let countdownRemaining=0; let mode='idle';
  let interactionLockToken=null;

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
    if(text){
      countdownEl.style.display='block';
      countdownEl.textContent=text;
    } else {
      countdownEl.style.display='none';
      countdownEl.textContent='';
    }
  }

  function clearCountdown(){
    if(countdownTimer){ clearInterval(countdownTimer); countdownTimer=null; }
  }

  function setStatus(text, tone='info'){
    if(!statusEl) return;
    statusEl.textContent=text||'';
    statusEl.setAttribute('data-tone', tone);
  }

  function getInteractionOptions(mode){
    return {
      allowedKeys:['arrowup','arrowdown','arrowleft','arrowright'],
      allowedMouseButtons:[0],
      allowWheel:false,
      allowContextMenu:false,
      allowTouchScroll:false,
      allowSelection:false
    };
  }

  function applyInteractionLock(mode){
    if(window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin()) return;
    if(!(window.testsCore && window.testsCore.lockInteractions)) return;
    const opts = getInteractionOptions(mode);
    if(interactionLockToken){
      window.testsCore.updateInteractionLock(interactionLockToken, opts);
    } else {
      interactionLockToken = window.testsCore.lockInteractions(opts);
    }
  }

  function releaseInteractionLock(){
    if(interactionLockToken && window.testsCore && window.testsCore.unlockInteractions){
      window.testsCore.unlockInteractions(interactionLockToken);
      interactionLockToken=null;
    }
  }

  function updateStatsVisibility(){
    if(!statsBox) return;
    const admin = window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin();
    if(stage==='real' && admin){ statsBox.style.display='block'; }
    else if(stage==='real' && !admin){ statsBox.style.display='none'; }
    else { statsBox.style.display='none'; }
  }

  function startPractice(){
    if(stage==='real' || stage==='countdown' || stage==='done') return;
    if(stage==='practice' && !practiceDone) return;
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    stage='practice'; practiceDone=false; mode='practice';
    setBanner('תרגול - התוצאות אינן נשמרות', 'practice');
    toggleRealStartButton(true,false);
    setCountdown(null); clearCountdown();
    setStatus('תרגול: שמור את הסמן במרכז בעזרת מקשי החצים', 'info');
    updateStatsVisibility();
    startRun('practice');
  }

  function finishPractice(options={}){
    const { skipMessage=false, keepFullscreen=true } = options;
    releaseInteractionLock();
    stage='practice'; practiceDone=true; mode='idle';
    if(!skipMessage){
      setStatus('התרגול הסתיים. לחצו על "סיימתי תרגול – להתחיל מבחן אמיתי" כדי להמשיך.', 'info');
      setBanner('התרגול הסתיים - ניתן להתחיל את המבחן האמיתי', 'practice');
    }
    toggleRealStartButton(true,false);
    setCountdown(null); clearCountdown();
    updateStatsVisibility();
    if(!keepFullscreen && window.exitFullscreenMode) window.exitFullscreenMode();
  }

  function startRealCountdown(){
    if(stage==='real' || stage==='countdown' || stage==='done') return;
    if(!practiceDone){
      running=false;
      finishPractice({ skipMessage:true, keepFullscreen:true });
    }
    stage='countdown'; mode='idle';
    setBanner('ספירה לאחור למבחן האמיתי', 'countdown');
    toggleRealStartButton(true,true);
    countdownRemaining=10;
    const label=countdownRemaining===1?'שנייה':'שניות';
    setCountdown(`המבחן האמיתי יתחיל בעוד ${countdownRemaining} ${label}`);
    setStatus('המבחן האמיתי יתחיל בעוד 10 שניות. התכוננו!', 'pending');
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    clearCountdown();
    applyInteractionLock('countdown');
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
    setStatus('מבחן אמיתי: שמור את הסמן קרוב ככל האפשר למרכז.', 'info');
    updateStatsVisibility();
    startRun('real');
  }

  function startRun(targetMode='real'){
    if(running) return;
    cfg = getFlightControlConfig();
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    resize();
    requestAnimationFrame(()=>resize());
    const admin = window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin();
    if(statsBox){ statsBox.style.display = (targetMode==='real' && admin) ? 'block' : 'none'; }
    timeLeft=cfg.seconds;
    lastTs=0;
    accum=0; samples=0;
    cursor.x = canvas.width/2;
    cursor.y = canvas.height/2;
    if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent='-'; }
    mode=targetMode;
    applyInteractionLock(targetMode);
    running=true;
    requestAnimationFrame(step);
  }

  function resize(){
    const size = Math.floor(window.innerHeight * 0.8);
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    if(canvas.width < 50){ setTimeout(resize,120); return; }
    canvas.style.display='block';
    CX = size/2;
    CY = size/2;
  }

  resize();
  window.addEventListener('resize', resize);

  function step(ts){
    if(!running) return;
    if(!lastTs) lastTs=ts;
    const dt=Math.min(0.05,(ts-lastTs)/1000);
    lastTs=ts;
    timeLeft=Math.max(0,timeLeft-dt);
    timeEl.textContent=fmtTime(timeLeft);

    const n=noiseValue(performance.now()/1000, cfg.difficulty);

    cursor.x += n.x*dt + ((keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0))*cfg.speed*dt;
    cursor.y += n.y*dt + ((keys.ArrowDown?1:0)-(keys.ArrowUp?1:0))*cfg.speed*dt;
    cursor.x=Math.max(0,Math.min(canvas.width,cursor.x));
    cursor.y=Math.max(0,Math.min(canvas.height,cursor.y));

    const dist=Math.hypot(cursor.x-CX,cursor.y-CY);
    accum+=dist;
    samples++;
    const avg=accum/Math.max(1,samples);
    const maxR = maxRadius(canvas);
    const raw = computeFlightControlRaw(avg, maxR);
    const g=window.getGlobalScale? window.getGlobalScale():{min:1,max:7};
    const sc=scaleFlightControl(raw, g);
    if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2); }

    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0b1729';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#93a8c7';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(CX,CY,28,0,Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(CX-40,CY);
    ctx.lineTo(CX+40,CY);
    ctx.moveTo(CX,CY-40);
    ctx.lineTo(CX,CY+40);
    ctx.stroke();
    ctx.fillStyle='#22c55e';
    ctx.beginPath();
    ctx.arc(cursor.x,cursor.y,6,0,Math.PI*2);
    ctx.fill();

    if(timeLeft<=0){
      running=false;
      if(mode==='practice'){
        finishPractice();
        return;
      }
      if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2)+' (סיום)'; }
      if (window.exitFullscreenMode) window.exitFullscreenMode();
      if(window.testsCore){ window.testsCore.completeTest('flightcontrol', raw, sc, {avgDist:avg, samples}); }
      if (window.testAuth) {
        window.testAuth.showTestCompleteModal('flightcontrol', sc.toFixed(2));
      }
      stage='done'; mode='idle';
      setBanner('המבחן האמיתי הסתיים', 'done');
      setCountdown(null); toggleRealStartButton(false);
      setStatus('המבחן הסתיים.', 'success');
      return;
    }
    requestAnimationFrame(step);
  }

  function start(){ startRun('real'); }

  window.addEventListener('keydown',e=>{
    if(e.key in keys || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
      keys[e.key]=true;
      e.preventDefault();
    }
  });

  window.addEventListener('keyup',e=>{
    if(e.key in keys || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
      keys[e.key]=false;
      e.preventDefault();
    }
  });

  btn.addEventListener('click', startPractice);
  if(realStartBtn) realStartBtn.addEventListener('click', startRealCountdown);
  document.addEventListener('DOMContentLoaded',()=>{ if(window.testsCore) window.testsCore.registerTest('flightcontrol',{title:'בקרת טיסה'}); });
})();