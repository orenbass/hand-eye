import { getNorthfindConfig } from './northfind.config.js';
import { angularError, scoreFromError } from './northfind.scoring.js';
import { generateRandomMap, generateRandomMaps, loadMapImage } from './northfind.utils.js';

(function(){
  const btn=document.getElementById('start-northfind');
  const canvas=document.getElementById('northfind-canvas');
  const trialEl=document.getElementById('northfind-trial');
  const totalEl=document.getElementById('northfind-total');
  const avgEl=document.getElementById('northfind-avg');
  const statsBox=document.getElementById('northfind-stats');
  const phaseBanner=document.getElementById('northfind-phase-banner');
  const realStartBtn=document.getElementById('northfind-real-start-button');
  const countdownEl=document.getElementById('northfind-countdown');
  const statusEl=document.getElementById('northfind-status');
  if(!btn||!canvas) return; const ctx=canvas.getContext('2d');

  const DEFAULT_MAP_IMAGES = [
    'assets/images/northfind/North_snapshot_11-10-2025_22_59_45.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_00_07.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_03_24.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_03_38.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_04_05.jpeg'
  ];

  let cfg=null, trials=5, learnSec=10, spinSec=6, answerSec=10, numArrows=24, mapImages=[];
  let currentTrial=0, phase='idle', phaseStartTime=0;
  let mapRotation=0, finalRotation=0;
  let northPointAngle=0;
  let answers=[]; let currentMapImg=null, currentMapReady=false; let mapRadius=0;
  let hoveredArrow=null, selectedArrow=null; let arrowPositions=[];
  let stage='idle'; let practiceDone=false; let countdownTimer=null; let countdownRemaining=0; let seriesMode=null;
  let interactionLockToken=null; let trialTimeout=null;

  function setBanner(text, mode){
    if(!phaseBanner) return;
    if(!text){
      phaseBanner.style.display='none';
      phaseBanner.textContent='';
      phaseBanner.removeAttribute('data-mode');
      return;
    }
    phaseBanner.style.display='block';
    phaseBanner.textContent=text;
    if(mode) phaseBanner.setAttribute('data-mode', mode);
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
    statusEl.textContent = text || '';
    statusEl.setAttribute('data-tone', tone);
  }

  function getInteractionOptions(mode){
    return {
      allowedKeys: [],
      allowedMouseButtons: [0],
      allowWheel: false,
      allowContextMenu: false,
      allowTouchScroll: false,
      allowSelection: false
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
      interactionLockToken = null;
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
    if(window.enterFullscreenMode) window.enterFullscreenMode();
    stage='practice'; practiceDone=false; seriesMode='practice';
    setBanner('תרגול - התוצאות אינן נשמרות', 'practice');
    toggleRealStartButton(true,false);
    setCountdown(null); clearCountdown();
    setStatus('תרגול: למד את כיוון החץ ובחר את הצפון', 'info');
    updateStatsVisibility();
    phase='idle';
    startSeries('practice');
  }

  function finishPractice(options={}){
    const { skipMessage=false, keepFullscreen=true } = options;
    if(trialTimeout){ clearTimeout(trialTimeout); trialTimeout=null; }
    stage='practice'; practiceDone=true; seriesMode=null; phase='idle';
    releaseInteractionLock();
    if(!skipMessage){
      setStatus('התרגול הסתיים. לחצו על "סיימתי תרגול – להתחיל מבחן אמיתי" כדי להמשיך.', 'info');
      setBanner('התרגול הסתיים - ניתן להתחיל את המבחן האמיתי', 'practice');
    }
    toggleRealStartButton(true,false);
    setCountdown(null); clearCountdown();
    updateStatsVisibility();
    if(trialEl) trialEl.textContent='0';
    if(avgEl) avgEl.textContent='-';
    if(!keepFullscreen && window.exitFullscreenMode) window.exitFullscreenMode();
  }

  function startRealCountdown(){
    if(stage==='real' || stage==='countdown' || stage==='done') return;
    if(!practiceDone){
      finishPractice({ skipMessage:true, keepFullscreen:true });
    }
    stage='countdown'; seriesMode=null;
    setBanner('ספירה לאחור למבחן האמיתי', 'countdown');
    toggleRealStartButton(true,true);
    countdownRemaining=10;
    const label=countdownRemaining===1?'שנייה':'שניות';
    setCountdown(`המבחן האמיתי יתחיל בעוד ${countdownRemaining} ${label}`);
    setStatus('המבחן האמיתי יתחיל בעוד 10 שניות. התכוננו!', 'pending');
    if(window.enterFullscreenMode) window.enterFullscreenMode();
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
    stage='real'; seriesMode='real';
    setBanner('מבחן אמיתי - התוצאות נשמרות', 'real');
    setStatus('מבחן אמיתי: למד את החץ ובחר במדויק את הצפון.', 'info');
    updateStatsVisibility();
    phase='idle';
    startSeries('real');
  }

  function startSeries(mode){
    if(phase!=='idle') return;
    if(trialTimeout){ clearTimeout(trialTimeout); trialTimeout=null; }
    seriesMode=mode;
    stage = mode==='practice' ? 'practice' : 'real';
    updateStatsVisibility();
    if(window.enterFullscreenMode) window.enterFullscreenMode();
    applyInteractionLock(mode);
    loadConfig();
    answers=[];
    currentTrial=0;
    mapRotation=0; finalRotation=0;
    selectedArrow=null; hoveredArrow=null;
    resize();
    if(window.testAuth && !window.testAuth.isAdmin()) statsBox && (statsBox.style.display = stage==='real' ? 'none' : 'none');
    else statsBox && (statsBox.style.display = stage==='real' ? 'block' : 'none');
    if(trialEl) trialEl.textContent='0';
    if(totalEl) totalEl.textContent=trials;
    startTrial();
  }

  function resize(){ const size=Math.floor(window.innerHeight*0.8); canvas.width=size; canvas.height=size; mapRadius=Math.min(canvas.width,canvas.height)*0.35; }
  resize(); window.addEventListener('resize',()=> phase!=='idle' && resize());

  function loadConfig(){ 
    cfg = getNorthfindConfig();
    trials=cfg.trials; 
    learnSec=cfg.learnSec; 
    spinSec=cfg.spinSec; 
    answerSec=cfg.answerSec; 
    numArrows=cfg.numArrows;
    mapImages = Array.isArray(cfg.mapImages) && cfg.mapImages.length ? cfg.mapImages : DEFAULT_MAP_IMAGES;
  }

  function drawMap(){ if(!currentMapReady||!currentMapImg) return; ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.beginPath(); ctx.arc(0,0,mapRadius,0,Math.PI*2); ctx.clip(); ctx.rotate(mapRotation); const size=mapRadius*2; ctx.drawImage(currentMapImg,-size/2,-size/2,size,size); ctx.restore(); ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.strokeStyle='#334155'; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(0,0,mapRadius,0,Math.PI*2); ctx.stroke(); ctx.restore(); }

  function drawLearningArrow(){
    const a = northPointAngle + mapRotation;
    const cx = canvas.width/2, cy = canvas.height/2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    const baseRadius = 18;
    const shaftLen = Math.max(56, mapRadius * 0.22);
    const shaftWidth = 7;
    const tipLen = 30;
    const tipWidth = 26;
    const radial = ctx.createRadialGradient(0,0,4,0,0,baseRadius);
    radial.addColorStop(0,'#1e3a8a');
    radial.addColorStop(0.55,'#1e3a8a');
    radial.addColorStop(1,'#0a1e33');
    ctx.fillStyle = radial;
    ctx.beginPath(); ctx.arc(0,0,baseRadius,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.stroke();
    const shaftGrad = ctx.createLinearGradient(-shaftLen/2,0,shaftLen/2,0);
    shaftGrad.addColorStop(0,'#ffffff');
    shaftGrad.addColorStop(1,'#cde3ff');
    ctx.fillStyle = shaftGrad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-shaftLen/2, -shaftWidth/2, shaftLen, shaftWidth, shaftWidth/2)
                  : ctx.rect(-shaftLen/2, -shaftWidth/2, shaftLen, shaftWidth);
    ctx.fill();
    ctx.strokeStyle = '#0f3a6a'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(shaftLen/2 + tipLen, 0);
    ctx.lineTo(shaftLen/2, tipWidth/2);
    ctx.lineTo(shaftLen/2, -tipWidth/2);
    ctx.closePath();
    const tipGrad = ctx.createLinearGradient(shaftLen/2,0,shaftLen/2 + tipLen,0);
    tipGrad.addColorStop(0,'#ffffff');
    tipGrad.addColorStop(1,'#3b82f6');
    ctx.fillStyle = tipGrad;
    ctx.fill();
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-shaftLen/2 + 6, 0); ctx.lineTo(shaftLen/2 + tipLen - 4, 0); ctx.stroke();
    ctx.save(); ctx.translate(shaftLen/2 + tipLen*0.4, tipWidth*0.05); ctx.rotate(0.08); ctx.globalAlpha=0.22;
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(0,0, tipLen*0.55, tipWidth*0.35, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(-shaftLen/2+4,0,5,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke();
    ctx.restore();
  }

  function computeArrowPositions(){ arrowPositions=[]; const step=(Math.PI*2)/numArrows; const cx=canvas.width/2, cy=canvas.height/2, r=mapRadius+14; for(let i=0;i<numArrows;i++){ const ang=i*step; arrowPositions.push({i, x:cx+Math.cos(ang)*r, y:cy+Math.sin(ang)*r, angle:ang}); } }

  function drawSelectionArrows(){ computeArrowPositions(); arrowPositions.forEach(p=>{ const sz=16; let bg='#1e3a8a'; if(selectedArrow===p.i) bg='#facc15'; else if(hoveredArrow===p.i) bg='#10b981'; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.angle); ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(0,0,sz+8,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(-sz*.8,0); ctx.lineTo(sz*.3,0); ctx.stroke(); const tip=sz+4, base=sz*.65; ctx.translate(-tip/2,0); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(tip,0); ctx.lineTo(0,base); ctx.lineTo(0,-base); ctx.closePath(); ctx.fill(); ctx.strokeStyle= selectedArrow===p.i? '#854d0e':'#1e293b'; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); }); }

  function drawTimer(rem,total){
    const size=84, pad=16, cx=pad+size/2, cy=pad+size/2, ratio=Math.max(0,rem/total);
    ctx.save(); ctx.translate(cx,cy);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(0,0,size/2,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.28)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,size/2-2,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='#10b981'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.beginPath(); ctx.arc(0,0,size/2-10,-Math.PI/2,-Math.PI/2+2*Math.PI*ratio); ctx.stroke();
    ctx.fillStyle='#ffffff'; ctx.font='600 17px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(rem.toFixed(1)+'s',0,2);
    ctx.restore();
  }

  function drawBanner(main,sub){ const h=78,w=Math.min(canvas.width*.72,620),x=(canvas.width-w)/2,y=15; ctx.save(); ctx.fillStyle='rgba(59,130,246,0.9)'; if(ctx.roundRect) ctx.roundRect(x,y,w,h,20); else ctx.fillRect(x,y,w,h); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=3; ctx.strokeRect(x,y,w,h); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font='bold 26px system-ui'; ctx.fillText(main,x+w/2,y+h/2-8); if(sub){ ctx.font='15px system-ui'; ctx.fillStyle='rgba(255,255,255,.95)'; ctx.fillText(sub,x+w/2,y+h/2+18); } ctx.restore(); }

  function render(){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#1e293b'; ctx.fillRect(0,0,canvas.width,canvas.height); drawMap(); if(phase==='learn'){ const el=(performance.now()-phaseStartTime)/1000; drawLearningArrow(); drawTimer(Math.max(0,learnSec-el),learnSec); drawBanner('למד את מיקום החץ','בסיום החץ ייעלם והמפה תסתובב'); } else if(phase==='answer'){ const el=(performance.now()-phaseStartTime)/1000; drawSelectionArrows(); drawTimer(Math.max(0,answerSec-el),answerSec); ctx.fillStyle='#fff'; ctx.font='bold 20px system-ui'; ctx.textAlign='center'; ctx.fillText('בחר לאן החץ מצביע', canvas.width/2, canvas.height-40); } }

  function step(){ if(phase==='idle'||phase==='done') return; const elapsed=(performance.now()-phaseStartTime)/1000; if(phase==='learn'){ if(elapsed>=learnSec){ startSpinPhase(); return; } render(); requestAnimationFrame(step); } else if(phase==='spin'){ const t=Math.min(1,elapsed/spinSec); mapRotation = finalRotation * (1 - Math.pow(1-t,3)); if(elapsed>=spinSec){ mapRotation=finalRotation; startAnswerPhase(); return; } render(); requestAnimationFrame(step); } else if(phase==='answer'){ if(elapsed>=answerSec){ registerAnswer(null,true); return; } render(); requestAnimationFrame(step); } }

  function startLearnPhase(){ phase='learn'; phaseStartTime=performance.now(); mapRotation=0; northPointAngle=Math.random()*Math.PI*2; hoveredArrow=null; selectedArrow=null; render(); requestAnimationFrame(step); }
  function startSpinPhase(){ phase='spin'; phaseStartTime=performance.now(); spinSec = 5; finalRotation = ((3 + Math.random()*2) * 2 * Math.PI) + Math.random()*2*Math.PI; render(); requestAnimationFrame(step); }
  function startAnswerPhase(){ phase='answer'; phaseStartTime=performance.now(); hoveredArrow=null; selectedArrow=null; render(); }

  function registerAnswer(userAngle,timeout){ 
    const correct=(northPointAngle+mapRotation)%(Math.PI*2); 
    const err=userAngle==null? Math.PI: angularError(userAngle,correct); 
    const g=window.getGlobalScale? window.getGlobalScale():{min:1,max:7};
    const sc=scoreFromError(err, numArrows, g); 
    answers[currentTrial]={correctDeg:(correct*180/Math.PI).toFixed(1), chosenDeg:userAngle==null? null:(userAngle*180/Math.PI).toFixed(1), errDeg:(err*180/Math.PI).toFixed(1), score:sc.toFixed(2), timeout:!!timeout}; 
    currentTrial++; 
    if(trialEl) trialEl.textContent=currentTrial; 
    if(currentTrial>=trials) finishSeries(); 
    else {
      if(trialTimeout){ clearTimeout(trialTimeout); }
      trialTimeout = setTimeout(()=>startTrial(),600);
    }
  }

  async function startTrial(){ 
    if(trialTimeout){ clearTimeout(trialTimeout); trialTimeout=null; }
    if(!Array.isArray(mapImages)||!mapImages.length) mapImages=generateRandomMaps(trials); 
    const idx=currentTrial%mapImages.length; 
    try{ 
      currentMapImg=await loadMapImage(mapImages, idx); 
      currentMapReady=true; 
      startLearnPhase(); 
    }catch(e){ 
      const fallback=generateRandomMaps(1)[0]; 
      currentMapImg=new Image(); 
      currentMapImg.onload=()=>{ currentMapReady=true; startLearnPhase(); }; 
      currentMapImg.src=fallback; 
    } 
  }

  function finishSeries(){
    const avg=answers.reduce((s,a)=>s+(+a.score||0),0)/Math.max(1,answers.length);
    if(seriesMode==='practice'){
      finishPractice();
      return;
    }
    phase='done'; stage='done'; seriesMode=null;
    if(!(window.testAuth && !window.testAuth.isAdmin())){ avgEl && (avgEl.textContent=avg.toFixed(2)); }
    else { avgEl && avgEl.parentElement && (avgEl.parentElement.style.display='none'); }
    const g = window.getGlobalScale? window.getGlobalScale(): {min:1,max:7};
    const rawPercent = ((avg - g.min)/(g.max-g.min))*100;
    if(window.testsCore){ window.testsCore.completeTest('northfind', rawPercent, avg, {trials:answers.length}); }
    if(window.testAuth){ window.testAuth.showTestCompleteModal('northfind', avg.toFixed(2)); }
    setBanner('המבחן האמיתי הסתיים', 'done');
    setCountdown(null); toggleRealStartButton(false);
    setStatus('המבחן הסתיים.', 'success');
    releaseInteractionLock();
  }

  function mouseMove(e){ if(phase!=='answer') return; const r=canvas.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top; hoveredArrow=null; for(const p of arrowPositions){ if(Math.hypot(mx-p.x,my-p.y)<=24){ hoveredArrow=p.i; break; } } canvas.style.cursor=hoveredArrow!=null? 'pointer':'default'; }
  function click(e){ if(phase!=='answer') return; if(hoveredArrow!=null){ selectedArrow=hoveredArrow; const chosen=arrowPositions.find(a=>a.i===selectedArrow); chosen && registerAnswer(chosen.angle,false); } }

  function start(){ if(phase!=='idle') return; if(window.enterFullscreenMode) window.enterFullscreenMode(); loadConfig(); answers=[]; currentTrial=0; mapRotation=0; finalRotation=0; selectedArrow=null; hoveredArrow=null; resize(); if(window.testAuth && !window.testAuth.isAdmin()) statsBox && (statsBox.style.display='none'); else statsBox && (statsBox.style.display='block'); totalEl && (totalEl.textContent=trials); startTrial(); }

  btn.addEventListener('click', startPractice);
  if(realStartBtn) realStartBtn.addEventListener('click', startRealCountdown);
  canvas.addEventListener('mousemove', mouseMove); canvas.addEventListener('click', click);
  document.addEventListener('DOMContentLoaded',()=>{ if(window.testsCore) window.testsCore.registerTest('northfind',{title:'מציאת הצפון'}); });
})();