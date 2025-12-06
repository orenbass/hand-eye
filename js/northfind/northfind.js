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
  const statusEl=document.getElementById('northfind-status');
  const layoutEl=document.getElementById('northfind-layout');
  const canvasContainer = canvas ? canvas.parentElement : null;
  if(!btn||!canvas) return; const ctx=canvas.getContext('2d');
  
  // הפוך את מיכל הקאנבס לשקוף
  if(canvasContainer){
    canvasContainer.style.background = 'transparent';
    canvasContainer.style.boxShadow = 'none';
    canvasContainer.style.border = 'none';
  }

  const DEFAULT_MAP_IMAGES = [
    'assets/images/northfind/North_snapshot_11-10-2025_22_59_45.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_00_07.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_03_24.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_03_38.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_04_05.jpeg'
  ];

  // Format seconds to MM:SS
  function formatTime(secs) {
    const s = Math.max(0, Math.round(secs));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  let cfg=null, trials=5, learnSec=10, spinSec=6, answerSec=10, numArrows=24, mapImages=[];
  let distractorCount=6, colorVariation=0.25; // הגדרות קושי
  let distractors=[]; // אלמנטים מסיחים
  let currentTrial=0, phase='idle', phaseStartTime=0;
  let mapRotation=0, finalRotation=0;
  let northPointAngle=0;
  let answers=[]; let currentMapImg=null, currentMapReady=false; let mapRadius=0;
  let hoveredArrow=null, selectedArrow=null; let arrowPositions=[];
  let stage='idle'; let practiceDone=false; let countdownTimer=null; let countdownRemaining=0; let seriesMode=null;
  let interactionLockToken=null; let trialTimeout=null;
  let practiceModalEl=null; let prePracticeShown=false;
  let practiceRunsComplete = 0;

  // Attach HUDs
  if(window.timerHUD && window.timerHUD.attach) {
      window.timerHUD.attach(document.getElementById('northfind-timer-slot'));
  }
  if(window.practiceBanner && window.practiceBanner.attach) {
      window.practiceBanner.attach(document.getElementById('northfind-practice-slot'));
  }

  function ensurePracticeModal(){
    if(practiceModalEl) return practiceModalEl;
    const overlay=document.createElement('div');
    overlay.id='northfind-practice-modal';
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
        <h2 style="margin:0 0 12px;font-size:1.45rem;">תרגול ניסיון לפני המבחן האמיתי</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
          לפניך שלב תרגול לניסיון בלבד. מטרתו לאפשר היכרות והתנסות קצרה עם התרגיל.
לאחר סיום התרגול יתחיל המבחן האמיתי, ובסופו יחושב הציון.
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
          בלחיצה על  <strong>הבנתי- להתחיל את המבחן האמיתי</strong>. יתחיל המבחן האמיתי מיד. הציון הבא ייחשב כציון הרשמי.
ודא שאתה מוכן לפני המעבר למבחן.
        </p>
        <button type="button" data-action="start-real" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">הבנתי – להתחיל מבחן אמיתי</button>
    `;
    modal.style.display = 'flex';
    
    const btn = contentBox.querySelector('[data-action="start-real"]');
    btn.onclick = () => {
        const countdownSec = cfg && cfg.examCountdownSec ? cfg.examCountdownSec : 0;
        if(countdownSec > 0){
            let remaining = countdownSec;
            contentBox.innerHTML = `
                <div style="font-size:4rem;margin-bottom:16px;font-weight:800;color:#0ea5e9;line-height:1" id="nf-modal-countdown">${remaining}</div>
                <h2 style="margin:0 0 8px;font-size:1.5rem;">המבחן מתחיל בעוד...</h2>
                <p style="color:#64748b;margin:0">נא להתכונן</p>
            `;
            const timer = setInterval(()=>{
                remaining--;
                const el = document.getElementById('nf-modal-countdown');
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

  function startPractice(isNextRun = false){
    if(stage==='real' || stage==='countdown' || stage==='done') return;
    if(stage==='practice' && !practiceDone && !isNextRun) return;
    
    if(!isNextRun) {
        practiceRunsComplete = 0;
    }

    if(window.enterFullscreenMode) window.enterFullscreenMode();
    stage='practice'; practiceDone=false; seriesMode='practice';
    
    if(layoutEl) layoutEl.setAttribute('data-stage', 'practice');

    // Re-attach HUDs
    if(window.timerHUD && window.timerHUD.attach) {
        window.timerHUD.attach(document.getElementById('northfind-timer-slot'));
    }
    if(window.practiceBanner && window.practiceBanner.attach) {
        window.practiceBanner.attach(document.getElementById('northfind-practice-slot'));
    }

    loadConfig();
    
    // בתרגול: practiceRuns קובע את מספר הסבבים (כל סבב = צפיה + סיבוב + ניחוש)
    const practiceTrials = (cfg && cfg.practiceRuns) || 1;
    trials = practiceTrials; // דריסת trials לתרגול
    
    if(window.practiceBanner) {
        window.practiceBanner.show({
            label: 'מצב תרגול',
            description: 'התוצאות אינן נשמרות',
            mode: 'practice'
        });
    }
    if(window.timerHUD) {
        window.timerHUD.show('זמן', formatTime(answerSec), 'practice');
    }

    setStatus(`תרגול: ${practiceTrials} סבבים - למד את כיוון החץ ובחר את הצפון`, 'info');
    updateStatsVisibility();
    phase='idle';
    startSeriesDirect();
  }

  // התחלת סדרה ישירה (ללא קריאה ל-loadConfig שוב)
  function startSeriesDirect(){
    if(phase!=='idle') return;
    if(trialTimeout){ clearTimeout(trialTimeout); trialTimeout=null; }
    updateStatsVisibility();
    if(window.enterFullscreenMode) window.enterFullscreenMode();
    applyInteractionLock(seriesMode);
    answers=[];
    currentTrial=0;
    mapRotation=0; finalRotation=0;
    selectedArrow=null; hoveredArrow=null;
    resize();
    if(window.testAuth && !window.testAuth.isAdmin()) statsBox && (statsBox.style.display = 'none');
    else statsBox && (statsBox.style.display = stage==='real' ? 'block' : 'none');
    if(trialEl) trialEl.textContent='0';
    if(totalEl) totalEl.textContent=trials;
    startTrial();
  }

  function finishPractice(options={}){
    const { skipMessage=false, keepFullscreen=true } = options;
    if(trialTimeout){ clearTimeout(trialTimeout); trialTimeout=null; }

    // התרגול הסתיים - כל הסבבים הושלמו (מספר הסבבים נקבע ב-practiceRuns)
    stage='practice'; practiceDone=true; seriesMode=null; phase='idle';
    releaseInteractionLock();
    
    if(!skipMessage){
        showEndPracticeModal(() => startRealCountdown());
    }
    
    updateStatsVisibility();
    if(trialEl) trialEl.textContent='0';
    if(avgEl) avgEl.textContent='-';
    if(!keepFullscreen && window.exitFullscreenMode) window.exitFullscreenMode();
  }

  function startRealCountdown(){
    // Deprecated - handled by modal now
    startRealTest();
  }

  function startRealTest(){
    if(countdownTimer) clearInterval(countdownTimer);
    stage='real'; seriesMode='real';
    
    if(layoutEl) layoutEl.setAttribute('data-stage', 'practice');

    // Re-attach HUDs
    if(window.timerHUD && window.timerHUD.attach) {
        window.timerHUD.attach(document.getElementById('northfind-timer-slot'));
    }
    if(window.practiceBanner && window.practiceBanner.attach) {
        window.practiceBanner.attach(document.getElementById('northfind-practice-slot'));
    }

    // טען מחדש הגדרות ווודא שמשתמשים ב-trials של המבחן (לא של התרגול)
    loadConfig();
    // במבחן: trials קובע את מספר הסבבים
    console.log('[northfind] מבחן אמת - trials:', trials, 'learnSec:', learnSec, 'spinSec:', spinSec, 'answerSec:', answerSec);

    if(window.practiceBanner) {
        window.practiceBanner.show({
            label: 'מבחן אמת',
            description: 'בהצלחה!',
            mode: 'real'
        });
    }
    if(window.timerHUD) {
        window.timerHUD.show('זמן מענה', formatTime(answerSec), 'real');
    }
    
    setStatus('למד את כיוון החץ ובחר במדויק את הצפון', 'info');
    updateStatsVisibility();
    phase='idle';
    startSeriesDirect();
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

  function resize(){ 
    // חישוב גובה זמין בין הבאנרים למעלה לפוטר למטה
    const headerRow = document.querySelector('#northfind-screen .orientation-header-row');
    const footerRow = document.querySelector('#northfind-screen .orientation-footer-row');
    
    // גובה האלמנטים העליונים והתחתונים
    const headerHeight = headerRow ? headerRow.offsetHeight : 80;
    const footerHeight = footerRow ? footerRow.offsetHeight : 100;
    const padding = 40; // מרווח בטיחות
    
    // הגובה הזמין לקאנבס
    const availableHeight = window.innerHeight - headerHeight - footerHeight - padding;
    const availableWidth = window.innerWidth - 40; // מרווח מהצדדים
    
    // הקאנבס יהיה ריבועי - לפי המימד הקטן יותר
    const size = Math.floor(Math.min(availableWidth, availableHeight));
    
    canvas.width = size; 
    canvas.height = size; 
    canvas.style.width = size + 'px'; 
    canvas.style.height = size + 'px'; 
    canvas.style.background = 'transparent';
    
    // המפה קטנה יותר כדי לתת מקום לחיצים מסביב (החיצים בערך 30px מסביב)
    mapRadius = Math.min(canvas.width, canvas.height) * 0.38; 
    
    console.log('[northfind] resize - availableHeight:', availableHeight, 'size:', size, 'mapRadius:', mapRadius);
  }
  resize(); window.addEventListener('resize',()=> phase!=='idle' && resize());

  function loadConfig(){ 
    cfg = getNorthfindConfig();
    trials=cfg.trials; 
    learnSec=cfg.learnSec; 
    spinSec=cfg.spinSec; 
    answerSec=cfg.answerSec; 
    numArrows=cfg.numArrows;
    distractorCount = cfg.distractorCount || 6;
    colorVariation = cfg.colorVariation || 0.25;
    mapImages = Array.isArray(cfg.mapImages) && cfg.mapImages.length ? cfg.mapImages : DEFAULT_MAP_IMAGES;
    console.log('[northfind] loadConfig - difficulty:', cfg.difficulty, 'distractorCount:', distractorCount, 'spinSec:', spinSec);
  }

  // אין צורך באלמנטים נוספים - המפה עצמה כוללת את כל הבתים והעצים
  function generateDistractors(){
    distractors = [];
    // המפה כבר מכילה את כל האלמנטים הנדרשים
  }

  // אין ציור נוסף - המפה מספיקה
  function drawDistractors(){
    // לא מציירים כלום נוסף על המפה
  }

  function drawMap(){ 
    if(!currentMapReady||!currentMapImg) return; 
    ctx.save(); 
    ctx.translate(canvas.width/2,canvas.height/2); 
    ctx.beginPath(); 
    ctx.arc(0,0,mapRadius,0,Math.PI*2); 
    ctx.clip(); 
    ctx.rotate(mapRotation); 
    const size=mapRadius*2; 
    ctx.drawImage(currentMapImg,-size/2,-size/2,size,size); 
    ctx.restore(); 
    
    // ציור אלמנטים מסיחים על המפה
    drawDistractors();
    
    // מסגרת המפה
    ctx.save(); 
    ctx.translate(canvas.width/2,canvas.height/2); 
    ctx.strokeStyle='#334155'; 
    ctx.lineWidth=6; 
    ctx.beginPath(); 
    ctx.arc(0,0,mapRadius,0,Math.PI*2); 
    ctx.stroke(); 
    ctx.restore(); 
  }

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

  function render(){ 
      // רקע שקוף - רק מנקים
      ctx.clearRect(0,0,canvas.width,canvas.height); 
      drawMap(); 
      
      if(phase==='learn'){ 
          const el=(performance.now()-phaseStartTime)/1000; 
          drawLearningArrow(); 
          
          // Update HUD
          if(window.timerHUD) {
              const rem = Math.max(0, learnSec - el);
              window.timerHUD.update(formatTime(rem));
          }
      } else if(phase==='answer'){ 
          const el=(performance.now()-phaseStartTime)/1000; 
          drawSelectionArrows(); 
          
          // Update HUD
          if(window.timerHUD) {
              const rem = Math.max(0, answerSec - el);
              window.timerHUD.update(formatTime(rem));
          }
      } 
  }

  function step(){ if(phase==='idle'||phase==='done') return; const elapsed=(performance.now()-phaseStartTime)/1000; if(phase==='learn'){ if(elapsed>=learnSec){ startSpinPhase(); return; } render(); requestAnimationFrame(step); } else if(phase==='spin'){ const t=Math.min(1,elapsed/spinSec); mapRotation = finalRotation * (1 - Math.pow(1-t,3)); if(elapsed>=spinSec){ mapRotation=finalRotation; startAnswerPhase(); return; } render(); requestAnimationFrame(step); } else if(phase==='answer'){ if(elapsed>=answerSec){ registerAnswer(null,true); return; } render(); requestAnimationFrame(step); } }

  function startLearnPhase(){ 
    phase='learn'; 
    phaseStartTime=performance.now(); 
    mapRotation=0; 
    // בוחרים זווית שמתאימה בדיוק לאחד מהחצים לבחירה
    // כך שתהיה תשובה אחת נכונה מוחלטת
    const arrowStep = (Math.PI * 2) / numArrows;
    const randomArrowIndex = Math.floor(Math.random() * numArrows);
    northPointAngle = randomArrowIndex * arrowStep;
    
    hoveredArrow=null; 
    selectedArrow=null; 
    // יצירת אלמנטים מסיחים חדשים לכל סבב
    generateDistractors();
    // הצג timer עם זמן צפייה
    if(window.timerHUD) {
        window.timerHUD.show('זמן צפייה', formatTime(learnSec), stage==='practice' ? 'practice' : 'real');
    }
    render(); 
    requestAnimationFrame(step); 
  }
  function startSpinPhase(){ 
    phase='spin'; 
    phaseStartTime=performance.now(); 
    
    // חישוב סיבוב שיגרום לתשובה הנכונה להיות בדיוק על אחד מהחצים
    // התשובה הנכונה אחרי סיבוב היא: (northPointAngle + finalRotation) % (2π)
    // צריך שזה יהיה כפולה של arrowStep
    const arrowStep = (Math.PI * 2) / numArrows;
    
    // בוחרים חץ יעד אקראי (לאן התשובה הנכונה תהיה)
    const targetArrowIndex = Math.floor(Math.random() * numArrows);
    const targetAngle = targetArrowIndex * arrowStep;
    
    // מחשבים כמה סיבוב צריך כדי להגיע לחץ היעד
    // targetAngle = (northPointAngle + rotation) % (2π)
    // rotation = targetAngle - northPointAngle
    let neededRotation = targetAngle - northPointAngle;
    
    // מוסיפים סיבובים שלמים (3-5 סיבובים) כדי שיראה דרמטי
    const fullRotations = (3 + Math.floor(Math.random() * 3)) * 2 * Math.PI;
    finalRotation = fullRotations + neededRotation;
    
    // וידוא שהסיבוב חיובי
    if(finalRotation < fullRotations) {
      finalRotation += 2 * Math.PI;
    }
    
    // הסתר timer בזמן הסיבוב
    if(window.timerHUD) {
        window.timerHUD.show('סיבוב...', '', stage==='practice' ? 'practice' : 'real');
    }
    render(); 
    requestAnimationFrame(step); 
  }
  function startAnswerPhase(){ 
    phase='answer'; 
    phaseStartTime=performance.now(); 
    hoveredArrow=null;
    // הצג הוראה בסטטוס למטה
    setStatus('בחר לאן החץ מצביע', 'info'); 
    selectedArrow=null; 
    // הצג את ה-timer עם זמן מענה
    if(window.timerHUD) {
        window.timerHUD.show('זמן מענה', formatTime(answerSec), stage==='practice' ? 'practice' : 'real');
    }
    render(); 
    requestAnimationFrame(step);
  }

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
    // יצירת מפות עם מספר האלמנטים לפי רמת הקושי
    if(!Array.isArray(mapImages)||!mapImages.length) mapImages=generateRandomMaps(trials, distractorCount); 
    const idx=currentTrial%mapImages.length; 
    try{ 
      currentMapImg=await loadMapImage(mapImages, idx); 
      currentMapReady=true; 
      startLearnPhase(); 
    }catch(e){ 
      const fallback=generateRandomMaps(1, distractorCount)[0]; 
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
    
    if(window.practiceBanner) window.practiceBanner.hide();
    
    setStatus('המבחן הסתיים.', 'success');
    releaseInteractionLock();
  }

  function mouseMove(e){ if(phase!=='answer') return; const r=canvas.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top; hoveredArrow=null; for(const p of arrowPositions){ if(Math.hypot(mx-p.x,my-p.y)<=24){ hoveredArrow=p.i; break; } } canvas.style.cursor=hoveredArrow!=null? 'pointer':'default'; }
  function click(e){ if(phase!=='answer') return; if(hoveredArrow!=null){ selectedArrow=hoveredArrow; const chosen=arrowPositions.find(a=>a.i===selectedArrow); chosen && registerAnswer(chosen.angle,false); } }

  function start(){ if(phase!=='idle') return; if(window.enterFullscreenMode) window.enterFullscreenMode(); loadConfig(); answers=[]; currentTrial=0; mapRotation=0; finalRotation=0; selectedArrow=null; hoveredArrow=null; resize(); if(window.testAuth && !window.testAuth.isAdmin()) statsBox && (statsBox.style.display='none'); else statsBox && (statsBox.style.display='block'); totalEl && (totalEl.textContent=trials); startTrial(); }

  btn.addEventListener('click', async () => {
    // Show loading state
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'טוען הגדרות...';
    
    // Fetch test-specific settings from server
    if(window.refreshTestSettings){
        try {
            console.log('[northfind] 🔄 מוריד הגדרות ספציפיות למבחן מציאת הצפון...');
            const fetchPromise = window.refreshTestSettings('northfind', { force: true });
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 5000));
            const result = await Promise.race([fetchPromise, timeoutPromise]);
            if(result && result.applied){
                console.log('[northfind] ✅ הגדרות ספציפיות הורדו בהצלחה', result.payload);
            } else if(result && result.timeout){
                console.warn('[northfind] ⏱️ Timeout - משתמש בהגדרות מקומיות');
            } else if(result && result.reason){
                console.log('[northfind] ℹ️ לא נמצאו הגדרות ספציפיות:', result.reason);
            }
        } catch(e){
            console.warn('[northfind] ❌ שגיאה בהורדת הגדרות ספציפיות', e);
        }
    } else {
        console.log('[northfind] ⚠️ פונקציית refreshTestSettings לא זמינה');
    }
    
    // Restore button
    btn.disabled = false;
    btn.textContent = originalText;
    
    if(!prePracticeShown){
        prePracticeShown=true;
        showPrePracticeModal(startPractice);
    } else {
        startPractice();
    }
  });
  canvas.addEventListener('mousemove', mouseMove); canvas.addEventListener('click', click);
  document.addEventListener('DOMContentLoaded',()=>{ if(window.testsCore) window.testsCore.registerTest('northfind',{title:'מציאת הצפון'}); });
})();