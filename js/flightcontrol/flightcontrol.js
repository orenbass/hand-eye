import { getFlightControlConfig } from './flightcontrol.config.js';
import { computeFlightControlRaw, scaleFlightControl } from './flightcontrol.scoring.js';
import { fmtTime, maxRadius, noiseValue } from './flightcontrol.utils.js';

(function(){
  const btn=document.getElementById('start-flightcontrol');
  const canvas=document.getElementById('flightcontrol-canvas');
  const timeEl=document.getElementById('flightcontrol-time');
  const scoreEl=document.getElementById('flightcontrol-score');
  const statsBox=document.getElementById('flightcontrol-stats');
  const statusEl=document.getElementById('flightcontrol-status');
  const layoutEl=document.getElementById('flightcontrol-layout');
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
  let practiceModalEl=null; let prePracticeShown=false;
  let practiceRunsComplete = 0;

  // Attach HUDs
  if(window.timerHUD && window.timerHUD.attach) {
      window.timerHUD.attach(document.getElementById('flightcontrol-timer-slot'));
  }
  if(window.practiceBanner && window.practiceBanner.attach) {
      window.practiceBanner.attach(document.getElementById('flightcontrol-practice-slot'));
  }

  function ensurePracticeModal(){
    if(practiceModalEl) return practiceModalEl;
    const overlay=document.createElement('div');
    overlay.id='flightcontrol-practice-modal';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:15000;display:none;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML=`<div style="max-width:520px;width:100%;background:#ffffff;color:#0f172a;border-radius:20px;padding:32px;box-shadow:0 25px 55px rgba(15,23,42,0.45);text-align:center;"></div>`;
    document.body.appendChild(overlay);
    practiceModalEl=overlay;
    return overlay;
  }

  function showPrePracticeModal(onStart){
    const modal=ensurePracticeModal();
    const contentBox = modal.querySelector('div');
    contentBox.innerHTML = `
        <div style="font-size:2.6rem;margin-bottom:12px">ℹ️</div>
        <h2 style="margin:0 0 12px;font-size:1.45rem;">מתחילים בתרגול</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
          המבחן הראשון הוא תרגול בלבד ולא יכנס לציון הסופי ומטרתו היא להכיר את המבחן ולהתנסות בו.
        </p>
        <button type="button" data-action="start-practice" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">התחל תרגול</button>
    `;
    modal.style.display='flex';
    const startBtn=contentBox.querySelector('[data-action="start-practice"]');
    if(startBtn){
        startBtn.onclick=()=>{
            modal.style.display='none';
            if(typeof onStart==='function') onStart();
        };
    }
  }

  function showEndPracticeModal(onRealStart){
    const modal = ensurePracticeModal();
    const contentBox = modal.querySelector('div');
    contentBox.innerHTML = `
        <div style="font-size:2.6rem;margin-bottom:12px">✓</div>
        <h2 style="margin:0 0 12px;font-size:1.45rem;">התרגול הסתיים</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
          כעת נעבור למבחן האמיתי. התוצאות יישמרו.
        </p>
        <button type="button" data-action="start-real" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">סיימתי תרגול – להתחיל מבחן אמיתי</button>
    `;
    modal.style.display = 'flex';
    
    const btn = contentBox.querySelector('[data-action="start-real"]');
    btn.onclick = () => {
        const countdownSec = cfg && cfg.examCountdownSec ? cfg.examCountdownSec : 0;
        if(countdownSec > 0){
            let remaining = countdownSec;
            contentBox.innerHTML = `
                <div style="font-size:4rem;margin-bottom:16px;font-weight:800;color:#0ea5e9;line-height:1" id="fc-modal-countdown">${remaining}</div>
                <h2 style="margin:0 0 8px;font-size:1.5rem;">המבחן מתחיל בעוד...</h2>
                <p style="color:#64748b;margin:0">נא להתכונן</p>
            `;
            const timer = setInterval(()=>{
                remaining--;
                const el = document.getElementById('fc-modal-countdown');
                if(el) el.textContent = remaining;
                if(remaining <= 0){
                    clearInterval(timer);
                    modal.style.display = 'none';
                    if(onRealStart) onRealStart();
                }
            }, 1000);
        } else {
            modal.style.display = 'none';
            if(onRealStart) onRealStart();
        }
    };
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

  function startPractice(isNextRun = false){
    if(stage==='real' || stage==='countdown' || stage==='done') return;
    if(stage==='practice' && !practiceDone && !isNextRun) return;
    
    if(!isNextRun) {
        practiceRunsComplete = 0;
    }

    if (window.enterFullscreenMode) window.enterFullscreenMode();
    stage='practice'; practiceDone=false; mode='practice';
    
    if(layoutEl) layoutEl.setAttribute('data-stage', 'practice');

    // Re-attach HUDs
    if(window.timerHUD && window.timerHUD.attach) {
        window.timerHUD.attach(document.getElementById('flightcontrol-timer-slot'));
    }
    if(window.practiceBanner && window.practiceBanner.attach) {
        window.practiceBanner.attach(document.getElementById('flightcontrol-practice-slot'));
    }

    cfg = getFlightControlConfig();
    const totalRuns = (cfg && cfg.practiceRuns) || 1;
    const currentRun = practiceRunsComplete + 1;

    if(window.practiceBanner) {
        window.practiceBanner.show({
            label: 'מצב תרגול',
             description: 'התוצאות אינן נשמרות',
            mode: 'practice'
        });
    }
    if(window.timerHUD) {
        window.timerHUD.show('זמן תרגול', '00:00', 'practice');
    }

    setStatus(`תרגול ${currentRun}/${totalRuns}: שמור את הסמן במרכז בעזרת מקשי החצים`, 'info');
    updateStatsVisibility();
    startRun('practice');
  }

  function finishPractice(options={}){
    const { skipMessage=false, keepFullscreen=true } = options;
    releaseInteractionLock();
    
    practiceRunsComplete++;
    const totalRuns = (cfg && cfg.practiceRuns) || 1;
    
    if(practiceRunsComplete < totalRuns) {
        setStatus(`סבב תרגול ${practiceRunsComplete} הסתיים. מתחיל סבב ${practiceRunsComplete+1}...`, 'info');
        setTimeout(() => {
             startPractice(true);
        }, 1500);
        return;
    }

    stage='practice'; practiceDone=true; mode='idle';
    
    if(!skipMessage){
        showEndPracticeModal(() => startRealCountdown());
    }
    
    updateStatsVisibility();
    if(!keepFullscreen && window.exitFullscreenMode) window.exitFullscreenMode();
  }

  function startRealCountdown(){
    // Deprecated - handled by modal now
    startRealTest();
  }

  function startRealTest(){
    if(countdownTimer) clearInterval(countdownTimer);
    stage='real'; mode='real';
    
    if(layoutEl) layoutEl.setAttribute('data-stage', 'practice');

    // Re-attach HUDs
    if(window.timerHUD && window.timerHUD.attach) {
        window.timerHUD.attach(document.getElementById('flightcontrol-timer-slot'));
    }
    if(window.practiceBanner && window.practiceBanner.attach) {
        window.practiceBanner.attach(document.getElementById('flightcontrol-practice-slot'));
    }

    if(window.practiceBanner) {
        window.practiceBanner.show({
            label: 'מבחן אמת',
            description: 'בהצלחה!',
            mode: 'real'
        });
    }
    if(window.timerHUD) window.timerHUD.hide();
    
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
    
    timeLeft = (targetMode === 'practice' && cfg.practiceSeconds) ? cfg.practiceSeconds : cfg.seconds;
    
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
    const size = Math.floor(Math.min(window.innerWidth * 0.9, window.innerHeight * 0.8));
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
    
    // Update Timer HUD
    if(window.timerHUD) {
        const m = Math.floor(timeLeft / 60);
        const s = Math.floor(timeLeft % 60);
        window.timerHUD.update(`${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
    }

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
      if(!(window.testAuth && window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2)+' (סיום)'; }
      if (window.exitFullscreenMode) window.exitFullscreenMode();
      if(window.testsCore){ window.testsCore.completeTest('flightcontrol', raw, sc, {avgDist:avg, samples}); }
      if (window.testAuth) {
        window.testAuth.showTestCompleteModal('flightcontrol', sc.toFixed(2));
      }
      stage='done'; mode='idle';
      
      if(window.practiceBanner) window.practiceBanner.hide();
      
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

  btn.addEventListener('click', () => {
    if(!prePracticeShown){
        prePracticeShown=true;
        showPrePracticeModal(startPractice);
    } else {
        startPractice();
    }
  });
  document.addEventListener('DOMContentLoaded',()=>{ if(window.testsCore) window.testsCore.registerTest('flightcontrol',{title:'בקרת טיסה'}); });
})();