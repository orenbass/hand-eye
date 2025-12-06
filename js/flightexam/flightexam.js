import { getFlightExamConfig } from './flightexam.config.js';
import { computeFlightExamRaw, scaleFlightExam } from './flightexam.scoring.js';
import { computePathLength, preloadPart, warmNext as warmNextPart, getPreloadedImages, resetPreloads } from './flightexam.path.js';

(function(){
  const startBtn = document.getElementById('start-flightexam');
  const canvas = document.getElementById('flightexam-canvas');
  const statsBox = document.getElementById('flightexam-stats');
  if(!startBtn || !canvas) return;
  const ctx = canvas.getContext('2d');

  let cfg = null;
  let pathDisplaySec = 15, durationFlightSec = 60, preFlightDelaySec = 10;
  let stage = 'idle';
  let pathImg = null, pathImgReady = false;
  let testImg = null, testImgReady = false;
  let pathStartTime = 0, flightStartTime = 0, preFlightStartTime = 0;
  let pathPoints = [], pathTotalLen = 0, pathCum = [];
  let active = false, startTime = 0, timerId = null, score = 0;
  let planeNX = 0.5, planeNY = 0.5, planeHeading = -Math.PI/2;
  const FORWARD_SPEED = 0.16;
  let slowActive = false;
  const ROT_SPEED_BASE = Math.PI/3, ROT_SPEED_MAX = Math.PI, ROT_ACCEL_TIME = 1.5;
  let keyState = {ArrowLeft:false, ArrowRight:false};
  let rotHoldLeft = 0, rotHoldRight = 0, lastFrameTime = 0, sampleAccum = 0;
  let userTrack = [];
  let corridorHalfWidth = 0.12;
  let corridorPenaltyWidth = 0.24;
  let lastDrawBox = null;
  let partsRef = [], loadingStarted = false, reviewStartTime = 0;
  let REVIEW_AUTO_SEC = 30, reviewActive = false;
  let END_REACH_RADIUS = 0.02;
  let currentPart = 0, partScores = [], allTracks = [];
  let globalRefreshing = false;
  let practiceIndex = -1;
  let practiceModalEl = null;
  let prePracticeShown = false;

  // Removed enforcePracticeParts function as it is handled by flightexam-sync.js

  function isPracticePart(index){
    return !!(partsRef && partsRef[index] && partsRef[index].isPractice);
  }

  function hasNonPracticeParts(list){
    return Array.isArray(list) && list.some(part=>part && !part.isPractice);
  }

  function ensurePracticeModal(){
    if(practiceModalEl) return practiceModalEl;
    const overlay = document.createElement('div');
    overlay.id = 'flightexam-practice-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:15000;display:none;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div class="flightexam-modal-content" style="max-width:520px;width:100%;background:#ffffff;color:#0f172a;border-radius:20px;padding:32px;box-shadow:0 25px 55px rgba(15,23,42,0.45);text-align:center;">
        <!-- Content injected dynamically -->
      </div>`;
    document.body.appendChild(overlay);
    practiceModalEl = overlay;
    return overlay;
  }

  function showPrePracticeModal(onStart){
    const modal = ensurePracticeModal();
    const contentBox = modal.querySelector('.flightexam-modal-content');
    
    contentBox.innerHTML = `
        <div style="font-size:2.6rem;margin-bottom:12px">ℹ️</div>
        <h2 style="margin:0 0 12px;font-size:1.45rem;">תרגול ניסיון לפני המבחן האמיתי</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
         לפניך שלב תרגול לניסיון בלבד. מטרתו לאפשר היכרות והתנסות קצרה עם התרגיל.
לאחר סיום התרגול יתחיל המבחן האמיתי, ובסופו יחושב הציון.
        </p>
        <button type="button" data-action="start-practice" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">התחל תרגול</button>
    `;
    
    modal.style.display = 'flex';
    
    const startBtn = contentBox.querySelector('[data-action="start-practice"]');
    if (startBtn) {
      startBtn.onclick = () => {
        modal.style.display = 'none';
        if (typeof onStart === 'function') onStart();
      };
    }
  }

  function showPracticeTransitionPrompt(onContinue){
    const modal = ensurePracticeModal();
    const contentBox = modal.querySelector('.flightexam-modal-content');
    
    contentBox.innerHTML = `
        <div style="font-size:2.5rem;margin-bottom:12px">✈️</div>
        <h2 style="margin:0 0 12px;font-size:1.45rem;">התרגול הסתיים</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
          בלחיצה על  <strong>הבנתי- להתחיל את המבחן האמיתי</strong>. יתחיל המבחן האמיתי מיד. הציון הבא ייחשב כציון הרשמי.
ודא שאתה מוכן לפני המעבר למבחן.
        </p>
        <button type="button" data-action="confirm" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">הבנתי – להתחיל מבחן אמיתי</button>
    `;

    modal.style.display = 'flex';
    
    const confirmBtn = contentBox.querySelector('[data-action="confirm"]');
    if(confirmBtn){
      confirmBtn.onclick = ()=>{
        const countdownSec = cfg && typeof cfg.examCountdownSec === 'number' ? cfg.examCountdownSec : 5;
        
        if (countdownSec > 0) {
            // Countdown State inside modal
            let remaining = countdownSec;
            contentBox.innerHTML = `
                <div style="font-size:4rem;margin-bottom:16px;font-weight:800;color:#0ea5e9;line-height:1" id="fe-modal-countdown">${remaining}</div>
                <h2 style="margin:0 0 8px;font-size:1.5rem;">המבחן מתחיל בעוד...</h2>
                <p style="color:#64748b;margin:0">נא להתכונן</p>
            `;
            
            const timer = setInterval(() => {
                remaining--;
                const el = document.getElementById('fe-modal-countdown');
                if(el) el.textContent = remaining;
                
                if (remaining <= 0) {
                    clearInterval(timer);
                    modal.style.display = 'none';
                    if (typeof onContinue === 'function') onContinue();
                }
            }, 1000);
        } else {
            modal.style.display = 'none';
            if (typeof onContinue === 'function') onContinue();
        }
      };
    }
  }

  let hudSnapshot = { label: '', value: '', mode: '' };
  let lastStageHint = '';

  function attachHeaderHUDs(){
    if(window.practiceBanner && typeof window.practiceBanner.attach === 'function'){
      const practiceSlot = document.getElementById('flightexam-practice-slot');
      window.practiceBanner.attach(practiceSlot || null);
    }
    if(window.timerHUD && typeof window.timerHUD.attach === 'function'){
      const timerSlot = document.getElementById('flightexam-timer-slot');
      window.timerHUD.attach(timerSlot || null);
    }
  }

  function updatePracticeUiState(){
    const layout = document.getElementById('flightexam-layout');
    const practiceActive = isPracticePart(currentPart);
    if(layout){
      layout.setAttribute('data-stage', practiceActive ? 'practice' : 'exam');
    }
    if(window.practiceBanner){
      if(practiceActive){
        window.practiceBanner.show({
        label: 'מצב תרגול',
        description: 'התוצאות אינן נשמרות',
        });
      } else {
        window.practiceBanner.hide();
      }
    }
  }

  function formatHudSeconds(seconds){
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(total / 60).toString().padStart(2, '0');
    const secs = (total % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  }

  function showHud(label, seconds, mode){
    if(!window.timerHUD) return;
    const value = typeof seconds === 'string' ? seconds : formatHudSeconds(seconds);
    if(hudSnapshot.label === label && hudSnapshot.value === value && hudSnapshot.mode === mode){
      return;
    }
    hudSnapshot = { label, value, mode };
    window.timerHUD.show(label, value, mode);
  }

  function hideHud(){
    if(!window.timerHUD) return;
    if(!hudSnapshot.label && !hudSnapshot.value && !hudSnapshot.mode) return;
    window.timerHUD.hide();
    hudSnapshot = { label: '', value: '', mode: '' };
  }

  function setStageMessage(message){
    const stageEl = document.getElementById('flightexam-stage-text');
    const nextMessage = message || '';
    if(stageEl && nextMessage !== lastStageHint){
      stageEl.textContent = nextMessage;
      lastStageHint = nextMessage;
    }
  }

  const planeIcon = new Image();
  let planeIconLoaded = false;
  planeIcon.onload = () => { planeIconLoaded = true; };
  planeIcon.onerror = (err) => {
    planeIconLoaded = false;
    console.warn('[flightexam] plane icon failed to load', err);
  };
  planeIcon.src = 'assets/images/flightexam/plane.svg?v=1';
  
  // PATH stage animation variables
  let lastTrailSampleDistance = 0;
  const TRAIL_SAMPLE_STEP = 0.004; // normalized path length step for sampling trail points
  let pathAnimTrail = []; // Stores normalized coordinates along the animated trail

  canvas.classList.add('dynamic-canvas');

  function isAdminMode(){
    return !!(window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin());
  }

  function computePlaneSize(drawWidth, drawHeight){
    const refWidth = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : (drawWidth || 0);
    const refHeight = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : (drawHeight || 0);
    const fallback = drawWidth && drawHeight ? Math.min(drawWidth, drawHeight) : 600;
    const baseRef = Math.max(1, Math.min(refWidth || fallback, refHeight || fallback));
    const base = Math.round(baseRef * 0.05);
    return Math.max(24, Math.min(64, base));
  }

  function drawPlane(ctxRef, x, y, size, headingRad){
    const ctxTarget = ctxRef || ctx;
    const drawSize = size || 48;
    const angle = (headingRad || 0) + Math.PI / 2; // Align upward-facing SVG with heading
    const half = drawSize / 2;
    ctxTarget.save();
    ctxTarget.translate(x, y);
    ctxTarget.rotate(angle);

    // Halo for contrast on similar backgrounds
    const haloRadius = drawSize * 0.9;
    ctxTarget.shadowColor = 'transparent';
    ctxTarget.shadowBlur = 0;
    const haloGradient = ctxTarget.createRadialGradient(0, 0, drawSize * 0.18, 0, 0, haloRadius);
    haloGradient.addColorStop(0, 'rgba(255,255,255,0.7)');
    haloGradient.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    haloGradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctxTarget.fillStyle = haloGradient;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, haloRadius, 0, Math.PI * 2);
    ctxTarget.fill();

    ctxTarget.shadowColor = 'rgba(15,23,42,0.45)';
    ctxTarget.shadowBlur = Math.max(6, drawSize * 0.25);
    if(planeIconLoaded){
      ctxTarget.drawImage(planeIcon, -half, -half, drawSize, drawSize);
    } else {
      ctxTarget.font = drawSize + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctxTarget.textAlign = 'center';
      ctxTarget.textBaseline = 'middle';
      ctxTarget.fillText('✈️', 0, 0);
    }
    ctxTarget.restore();
  }

  function tracePath(ctxRef, ox, oy, w, h){
    const ctxTarget = ctxRef || ctx;
    ctxTarget.beginPath();
    for(let i=0;i<pathPoints.length;i++){
      const pt = pathPoints[i];
      const px = ox + pt.x * w;
      const py = oy + pt.y * h;
      if(i===0){ ctxTarget.moveTo(px, py); }
      else { ctxTarget.lineTo(px, py); }
    }
  }

  function drawCorridorBand(ctxRef, ox, oy, w, h, options={}){
    if(!pathPoints || pathPoints.length < 2) return;
    const ctxTarget = ctxRef || ctx;
    const pxPerUnit = Math.max(1, Math.sqrt((w * w + h * h) / 2));
    const corridorTotalPx = Math.max(4, corridorHalfWidth * 2 * pxPerUnit);
    const edgePx = Math.max(2, corridorTotalPx * 0.18);
    const centerPx = Math.max(2, corridorTotalPx * 0.25);
    ctxTarget.save();
    ctxTarget.lineCap = 'round';
    ctxTarget.lineJoin = 'round';
    if(typeof options.alpha === 'number'){ ctxTarget.globalAlpha = options.alpha; }
    const bandColor = options.bandColor || 'rgba(191, 219, 254, 0.35)';
    const edgeColor = options.edgeColor || 'rgba(96, 165, 250, 0.65)';
    const centerColor = options.centerColor || 'rgba(37, 99, 235, 0.85)';

    ctxTarget.strokeStyle = bandColor;
    ctxTarget.lineWidth = corridorTotalPx;
    tracePath(ctxTarget, ox, oy, w, h);
    ctxTarget.stroke();

    ctxTarget.strokeStyle = edgeColor;
    ctxTarget.lineWidth = edgePx;
    tracePath(ctxTarget, ox, oy, w, h);
    ctxTarget.stroke();

    if(options.showCenterline !== false){
      ctxTarget.strokeStyle = centerColor;
      ctxTarget.lineWidth = centerPx;
      tracePath(ctxTarget, ox, oy, w, h);
      ctxTarget.stroke();
    }

    ctxTarget.restore();
  }

  function projectOnCurrentPath(nx, ny){
    if(!pathPoints || pathPoints.length < 2){
      return { distance: 1, progress: 0, point: { x: nx, y: ny }, segment: 0, t: 0 };
    }
    let bestDist = Infinity;
    let bestIdx = 0;
    let bestT = 0;
    let bestPoint = { x: nx, y: ny };
    for(let i = 1; i < pathPoints.length; i++){
      const a = pathPoints[i-1];
      const b = pathPoints[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx*dx + dy*dy;
      if(len2 === 0) continue;
      let t = ((nx - a.x)*dx + (ny - a.y)*dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      const ddx = nx - cx;
      const ddy = ny - cy;
      const dist = Math.sqrt(ddx*ddx + ddy*ddy);
      if(dist < bestDist){
        bestDist = dist;
        bestIdx = i - 1;
        bestT = t;
        bestPoint = { x: cx, y: cy };
      }
    }
    let progress = 0;
    if(pathTotalLen > 0 && pathCum.length > 1){
      const base = pathCum[bestIdx] || 0;
      const next = pathCum[bestIdx + 1] !== undefined ? pathCum[bestIdx + 1] : base;
      const segLen = Math.max(0, next - base);
      const along = base + segLen * bestT;
      progress = Math.max(0, Math.min(1, along / pathTotalLen));
    }
    return { distance: bestDist, progress, point: bestPoint, segment: bestIdx, t: bestT };
  }

  function getPathPointAtDistance(distance){
    if(!pathPoints || pathPoints.length < 2 || pathTotalLen <= 0){
      const fallback = pathPoints && pathPoints.length ? pathPoints[0] : {x:0.5, y:0.5};
      return { x: fallback.x, y: fallback.y };
    }
    const clamped = Math.max(0, Math.min(distance, pathTotalLen));
    for(let i = 1; i < pathPoints.length; i++){
      const segStart = pathCum[i-1];
      const segEnd = pathCum[i];
      if(clamped <= segEnd || i === pathPoints.length - 1){
        const segLen = Math.max(segEnd - segStart, 1e-6);
        const t = Math.max(0, Math.min(1, (clamped - segStart) / segLen));
        const a = pathPoints[i-1];
        const b = pathPoints[i];
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t
        };
      }
    }
    return pathPoints[pathPoints.length - 1];
  }

  function tryAppendTrail(distanceNorm, point){
    if(!point) return;
    if(!pathAnimTrail.length){
      pathAnimTrail.push({ x: point.x, y: point.y });
      lastTrailSampleDistance = distanceNorm;
      return;
    }
    if(distanceNorm - lastTrailSampleDistance >= TRAIL_SAMPLE_STEP){
      pathAnimTrail.push({ x: point.x, y: point.y });
      lastTrailSampleDistance = distanceNorm;
    }
  }

  function computePathHeading(distance){
    if(!pathPoints || pathPoints.length < 2 || pathTotalLen <= 0){
      return -Math.PI / 2; // Upward default
    }
    const curr = getPathPointAtDistance(distance);
    const delta = Math.max(pathTotalLen * 0.01, 1e-3);
    const ahead = getPathPointAtDistance(Math.min(distance + delta, pathTotalLen));
    const dx = ahead.x - curr.x;
    const dy = ahead.y - curr.y;
    if(Math.abs(dx) < 1e-5 && Math.abs(dy) < 1e-5){
      return -Math.PI / 2;
    }
    return Math.atan2(dy, dx);
  }

  function adjustLayout(){
    const screen=document.getElementById('flightexam-screen');
    if(screen){
      const area=screen.querySelector('.test-area');
      const wrap=screen.querySelector('.unified-canvas-container');
      if(area){ area.style.maxWidth='none'; area.style.width='100%'; }
      if(wrap){ wrap.style.maxWidth='none'; wrap.style.width='100%'; }
    }
  }

  function getCanvasHostSize(){
    const host = canvas.closest('.unified-canvas-container');
    if(host){
      const styles = window.getComputedStyle(host);
      const padX = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const padY = parseFloat(styles.paddingTop || '0') + parseFloat(styles.paddingBottom || '0');
      const width = Math.max(0, host.clientWidth - padX);
      const height = Math.max(0, host.clientHeight - padY);
      if(width > 0 && height > 0){
        return {
          width: Math.floor(width),
          height: Math.floor(height)
        };
      }
    }
    return {
      width: Math.floor(window.innerWidth * 0.85),
      height: Math.floor(window.innerHeight * 0.7)
    };
  }

  function applyCanvasSize(width, height){
    const w = Math.max(200, Math.floor(width || 0));
    const h = Math.max(200, Math.floor(height || 0));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function resize(){
    adjustLayout();
    const hostSize = getCanvasHostSize();
    if(stage==='path' && pathImgReady && pathImg){
      const imgRatio = pathImg.height / pathImg.width;
      let w = hostSize.width;
      let h = Math.round(w * imgRatio);
      if(h > hostSize.height){
        h = hostSize.height;
        w = Math.round(h / imgRatio);
      }
      applyCanvasSize(w, h);
    } else {
      applyCanvasSize(hostSize.width, hostSize.height);
    }
  }

  resize();
  window.addEventListener('resize', ()=> active && resize());

  async function start(){
    console.log('[flightexam] start invoked');
    adjustLayout();
    if(active) return;
    
    // Download settings from server first
    if(startBtn) {
      const originalText = startBtn.textContent;
      startBtn.disabled = true;
      startBtn.textContent = 'טוען הגדרות...';
      try {
        if(window.refreshTestSettings) {
          await window.refreshTestSettings('flightexam', { force: true });
        }
      } catch(e) {
        console.warn('[flightexam] Failed to refresh settings:', e);
      }
      startBtn.disabled = false;
      startBtn.textContent = originalText;
    }
    
    prePracticeShown = false; // Reset for new session
    if(window.enterFullscreenMode) window.enterFullscreenMode();
    
    cfg = getFlightExamConfig();
    pathDisplaySec = cfg.pathDisplaySec;
    preFlightDelaySec = cfg.preFlightDelaySec;
    durationFlightSec = cfg.flightDurationSec;
    REVIEW_AUTO_SEC = cfg.REVIEW_AUTO_SEC;
    END_REACH_RADIUS = cfg.END_REACH_RADIUS;
    corridorHalfWidth = (typeof cfg.CORRIDOR_HALF_WIDTH === 'number' ? cfg.CORRIDOR_HALF_WIDTH : (cfg.MAX_DIST_FOR_FULL_SCORE || corridorHalfWidth));
    corridorPenaltyWidth = (typeof cfg.CORRIDOR_PENALTY_WIDTH === 'number' ? cfg.CORRIDOR_PENALTY_WIDTH : corridorHalfWidth * 2);
    corridorHalfWidth = Math.max(0.02, corridorHalfWidth);
    corridorPenaltyWidth = Math.max(corridorHalfWidth + 0.01, corridorPenaltyWidth);

    active = true; 
    stage='preload-first';
    const view = document.querySelector('#flightexam-screen .test-view'); 
    if(view) view.style.display='block';
    attachHeaderHUDs();
    hideHud();
    if(window.practiceBanner) window.practiceBanner.hide();
    setStageMessage('מכין את חלקי מבחן הטיסה...');
    if(window.testAuth && !window.testAuth.isAdmin()) { 
      statsBox && (statsBox.style.display='none'); 
    } else { 
      statsBox && (statsBox.style.display='block'); 
    }
    resize(); 
    draw();

    try {
      if(window.refreshFlightExamPartsFromDb){
        globalRefreshing = true;
        await window.refreshFlightExamPartsFromDb();
        globalRefreshing = false;
      }
      
      partsRef = window.getFlightExamParts? (window.getFlightExamParts()||[]):[];
      
      // Sort and limit practice parts based on configuration
      const practiceParts = partsRef.filter(p => p.isPractice);
      const examParts = partsRef.filter(p => !p.isPractice);
      // Default to 1 if not specified, but allow 0 if explicitly set to 0 (though unlikely for practice)
      const maxPractice = (cfg && typeof cfg.practiceRuns === 'number') ? cfg.practiceRuns : 1;
      const finalPracticeParts = practiceParts.slice(0, maxPractice);
      
      // Limit exam parts
      const maxExam = (cfg && typeof cfg.examRuns === 'number') ? cfg.examRuns : 1;
      const finalExamParts = examParts.slice(0, maxExam);

      // Reassemble: Selected Practice Parts -> Exam Parts
      partsRef = [...finalPracticeParts, ...finalExamParts];

      practiceIndex = partsRef.findIndex(p => p.isPractice);
      currentPart = 0;
      updatePracticeUiState();

      console.log('[flightexam] parts count=', partsRef.length, 'practiceIndex=', practiceIndex, 'maxPractice=', maxPractice);
      if(!partsRef.length){ 
        throw new Error('לא נמצאו חלקי מבחן טיסה. ודא שהתמונות הועלו לשרת.');
      }
      if(practiceIndex !== -1 && !hasNonPracticeParts(partsRef)){
        throw new Error('נדרש לפחות חלק מבחן אמיתי אחד בנוסף לחלק התרגול בבסיס הנתונים.');
      }

      if(practiceIndex !== -1 && !prePracticeShown){
        prePracticeShown = true;
        await new Promise(resolve => showPrePracticeModal(resolve));
      }

      await preloadPart(partsRef, 0);

      loadingStarted=false; 
      userTrack=[]; 
      reviewActive=false; 
      score=100;
      loadPart(0);
      startTimer();
    } catch(e) {
      console.error('[flightexam] Start failed', e);
      active = false;
      stage = 'error';
      hideHud();
      if(window.practiceBanner) window.practiceBanner.hide();
      setStageMessage('שגיאה בטעינת מבחן הטיסה.');
      showError(e.message || 'שגיאה לא ידועה בטעינת מבחן הטיסה מהשרת.');
    }
  }

  function showError(message){
    hideHud();
    if(window.practiceBanner) window.practiceBanner.hide();
    setStageMessage('אירעה שגיאה בטעינת מבחן הטיסה.');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    
    ctx.fillStyle='#ef4444';
    ctx.font='60px system-ui';
    ctx.textAlign='center';
    ctx.fillText('⚠️', canvas.width/2, canvas.height/2 - 80);
    
    ctx.fillStyle='#ef4444';
    ctx.font='28px system-ui';
    ctx.fillText('שגיאה בטעינת המבחן', canvas.width/2, canvas.height/2 - 20);
    
    ctx.fillStyle='#94a3b8';
    ctx.font='18px system-ui';
    const lines = message.split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width/2, canvas.height/2 + 20 + (i * 30));
    });
    
    ctx.fillStyle='#3b82f6';
    ctx.fillRect(canvas.width/2 - 80, canvas.height/2 + 80, 160, 50);
    ctx.fillStyle='#ffffff';
    ctx.font='18px system-ui';
    ctx.fillText('נסה שוב', canvas.width/2, canvas.height/2 + 110);
    
    canvas.style.cursor = 'pointer';
    const clickHandler = () => {
      canvas.removeEventListener('click', clickHandler);
      canvas.style.cursor = 'default';
      location.reload();
    };
    canvas.addEventListener('click', clickHandler);
  }

  function loadPart(index){
    const practicePart = isPracticePart(index);
    console.log('[flightexam] loadPart START', index, practicePart? '(practice)': '');
    userTrack=[]; rotHoldLeft=0; rotHoldRight=0; 
    keyState.ArrowLeft=false; keyState.ArrowRight=false; slowActive=false;
    reviewActive=false; loadingStarted=false; lastFrameTime=0; sampleAccum=0; score=100;
    pathImgReady=false; pathImg=null; testImgReady=false; testImg=null; 
    pathPoints=[]; pathCum=[]; pathTotalLen=0; lastDrawBox=null;
    lastTrailSampleDistance = 0;
    pathAnimTrail = [];
    
    const part = partsRef[index];
    if(!part){ 
      console.warn('[flightexam] missing part', index); 
      finalizeReview(true); 
      return; 
    }

    if(practicePart && cfg && cfg.practiceDurationSec){
      durationFlightSec = cfg.practiceDurationSec;
    } else {
      durationFlightSec = cfg.flightDurationSec;
    }
    
    console.log('[flightexam] Part loaded:', {
      test_number: part.test_number,
      hasPathImg: !!part.pathImg,
      hasTestImg: !!part.testImg,
      pathPointsCount: part.pathPoints?.length || 0,
      isPractice: practicePart
    });

    updatePracticeUiState();
    setStageMessage(practicePart
      ? 'חלק תרגול – המסלול יוצג מיד. אל תיגע במקלדת עד לסיום הספירה.'
      : 'חלק מבחן – המסלול יוצג מיד. התבונן בלבד עד לסיום הספירה.');
    
    pathPoints = part.pathPoints? part.pathPoints.slice(): [];
    pathTotalLen = computePathLength(pathPoints);
    
    if(pathPoints.length>=2){ 
      pathCum=[0]; 
      let total=0;
      for(let i=1;i<pathPoints.length;i++){ 
        const a=pathPoints[i-1], b=pathPoints[i]; 
        const dx=b.x-a.x, dy=b.y-a.y; 
        const d=Math.sqrt(dx*dx+dy*dy); 
        total+=d; 
        pathCum.push(total);
      } 
    }

    const preloadRef = getPreloadedImages(index);
    console.log('[flightexam] Preload status:', {
      hasPreloadRef: !!preloadRef,
      hasPathImgObj: !!(preloadRef?.pathImgObj),
      hasTestImgObj: !!(preloadRef?.testImgObj)
    });
    
    if(preloadRef && preloadRef.pathImgObj){ 
      pathImg = preloadRef.pathImgObj; 
      pathImgReady = pathImg.complete; 
      console.log('[flightexam] pathImg from preload, ready:', pathImgReady);
    }
    if(preloadRef && preloadRef.testImgObj){ 
      testImg = preloadRef.testImgObj; 
      testImgReady = testImg.complete; 
      console.log('[flightexam] testImg from preload, ready:', testImgReady);
    }
    
    if(!pathImg && part.pathImg){ 
      console.log('[flightexam] Loading pathImg manually:', part.pathImg);
      pathImg=new Image(); 
      pathImg.onload=()=>{ 
        pathImgReady=true; 
        console.log('[flightexam] pathImg loaded successfully');
      }; 
      pathImg.onerror=(e)=>{ 
        pathImgReady=false; 
        console.error('[flightexam] pathImg load error:', e);
      }; 
      pathImg.src=part.pathImg; 
    }
    if(!testImg && part.testImg){ 
      console.log('[flightexam] Loading testImg manually:', part.testImg);
      testImg=new Image(); 
      testImg.onload=()=>{ 
        testImgReady=true; 
        console.log('[flightexam] testImg loaded successfully');
      }; 
      testImg.onerror=(e)=>{ 
        testImgReady=false; 
        console.error('[flightexam] testImg load error:', e);
      }; 
      testImg.src=part.testImg; 
    }
    
    if(pathImg){ 
      console.log('[flightexam] Starting PATH display stage');
      stage='path'; 
      pathStartTime=Date.now(); 
      resize(); 
    } else { 
      console.log('[flightexam] No pathImg, going to preflight/flight');
      stage = preFlightDelaySec>0? 'preflight':'flight'; 
      if(stage==='flight'){ 
        flightStartTime=Date.now(); 
        initPlaneFromPath(); 
      } 
    }
    warmNextPart(partsRef, index);
    console.log('[flightexam] loadPart DONE, stage=', stage);
  }

  function initPlaneFromPath(){
    if(pathPoints && pathPoints.length>=2){ 
      planeNX=pathPoints[0].x; 
      planeNY=pathPoints[0].y; 
      const a=pathPoints[0], b=pathPoints[1]; 
      planeHeading=Math.atan2(b.y-a.y, b.x-a.x); 
    } else { 
      planeNX=0.5; 
      planeNY=0.5; 
      planeHeading=-Math.PI/2; 
    }
  }

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    const practiceActive = isPracticePart(currentPart);
    let hudUsed = false;
    
    if(stage==='preload-first'){
      // Animated loading screen
      ctx.fillStyle='#ffffff'; 
      ctx.font='bold 28px system-ui'; 
      ctx.textAlign='center';
      ctx.fillText(globalRefreshing? 'מרענן חלקים מהשרת...' : 'טוען תמונות ראשונות...', canvas.width/2, canvas.height/2 - 50);
      setStageMessage('טוען חלקי מבחן הטיסה...');
      
      ctx.font='16px system-ui'; 
      ctx.fillStyle='#94a3b8'; 
      ctx.fillText('אנא המתן, התמונות נטענות מהשרת', canvas.width/2, canvas.height/2 - 10);
      
      // Animated spinner
      ctx.save(); 
      ctx.translate(canvas.width/2, canvas.height/2 + 50); 
      ctx.rotate((Date.now() % 2000) / 2000 * Math.PI * 2); 
      ctx.strokeStyle='#3b82f6'; 
      ctx.lineWidth=8; 
      ctx.lineCap='round';
      ctx.beginPath(); 
      ctx.arc(0, 0, 35, 0, Math.PI * 1.5); 
      ctx.stroke(); 
      ctx.restore();
      
      // Progress indicator
      ctx.fillStyle='#60a5fa'; 
      ctx.font='14px system-ui';
      ctx.fillText('נטען חלק 1...', canvas.width/2, canvas.height/2 + 120);
      
    } else if(stage==='path'){
      // Display path learning image with animated plane and side timer
      if(pathImgReady && pathImg){
        const sw=pathImg.width, sh=pathImg.height, dw=canvas.width, dh=canvas.height;
        const sr=sw/sh, dr=dw/dh; 
        let w,h; 
        if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2;
        
        // Draw the path image
        ctx.drawImage(pathImg, ox, oy, w, h);

        // Corridor overlay (admin preview only)
        if(isAdminMode()){
          drawCorridorBand(ctx, ox, oy, w, h, { alpha: 0.85 });
        }
        
        // Draw start and end markers
        if(pathPoints && pathPoints.length > 0){
          const startP = pathPoints[0];
          const endP = pathPoints[pathPoints.length - 1];
          
          // Start marker (green)
          ctx.beginPath();
          ctx.arc(ox + startP.x * w, oy + startP.y * h, 12, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          
          // End marker (red)
          if(endP !== startP){
            ctx.beginPath();
            ctx.arc(ox + endP.x * w, oy + endP.y * h, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          }
        }
        
        // Check timer and auto-advance
        const elapsed = (Date.now() - pathStartTime) / 1000;
        const remaining = Math.max(0, pathDisplaySec - elapsed);
        hudUsed = true;
        const hudMode = practiceActive ? 'practice' : 'observe';
        showHud('לימוד מסלול', remaining, hudMode);
        setStageMessage(practiceActive
          ? 'תרגל את המסלול – אל תיגע במקלדת בזמן הלמידה.'
          : 'למד את המסלול – אל תבצע פעולות עד לסיום הספירה.');
        
        // Animated plane demonstration
        if(pathPoints && pathPoints.length > 1 && pathTotalLen > 0){
          const totalDuration = Math.max(pathDisplaySec, 1);
          const distanceAlong = Math.min(pathTotalLen, (elapsed / totalDuration) * pathTotalLen);
          const normDistance = pathTotalLen > 0 ? distanceAlong / pathTotalLen : 0;
          const pathPoint = getPathPointAtDistance(distanceAlong);
          const pathHeading = computePathHeading(distanceAlong);
          tryAppendTrail(normDistance, pathPoint);

          // Draw the trail (path that plane already covered)
          if(pathAnimTrail.length > 1){
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(ox + pathAnimTrail[0].x * w, oy + pathAnimTrail[0].y * h);
            for(let i = 1; i < pathAnimTrail.length; i++){
              ctx.lineTo(ox + pathAnimTrail[i].x * w, oy + pathAnimTrail[i].y * h);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          const planeSize = computePlaneSize(canvas.width, canvas.height);
          drawPlane(ctx, ox + pathPoint.x * w, oy + pathPoint.y * h, planeSize, pathHeading);
          if(distanceAlong >= pathTotalLen){
            const lastPoint = pathPoints[pathPoints.length - 1];
            const trailLast = pathAnimTrail[pathAnimTrail.length - 1];
            const samePoint = trailLast && Math.abs(trailLast.x - lastPoint.x) < 1e-4 && Math.abs(trailLast.y - lastPoint.y) < 1e-4;
            if(!samePoint){
              pathAnimTrail.push({ x: lastPoint.x, y: lastPoint.y });
            }
          }
        }
        
        if(remaining <= 0){
          console.log('[flightexam] PATH time expired, moving to preflight');
          stage = 'preflight';
          preFlightStartTime = Date.now();
        }
      } else {
        // Loading path image
        ctx.fillStyle='#ffffff'; 
        ctx.font='22px system-ui'; 
        ctx.textAlign='center';
        ctx.fillText('טוען תמונת מסלול...', canvas.width/2, canvas.height/2);
        
        ctx.save(); 
        ctx.translate(canvas.width/2, canvas.height/2 + 50); 
        ctx.rotate((Date.now() % 2000) / 2000 * Math.PI * 2); 
        ctx.strokeStyle='#3b82f6'; 
        ctx.lineWidth=6; 
        ctx.beginPath(); 
        ctx.arc(0, 0, 30, 0, Math.PI * 1.5); 
        ctx.stroke(); 
        ctx.restore();
      }
      
    } else if(stage==='preflight'){
      // Pre-flight countdown - show map and plane with overlay message
      const elapsed = (Date.now() - preFlightStartTime) / 1000;
      const remaining = Math.max(0, preFlightDelaySec - elapsed);
      hudUsed = true;
      showHud('ספירת התחלה', remaining, 'answer');
      setStageMessage(practiceActive
        ? 'ספירת התחלה לתרגול – הכן את הידיים על החיצים ורווח.'
        : 'ספירת התחלה למבחן – הכן את הידיים על החיצים ורווח.');
      
      // Draw the path image as background
      if(pathImgReady && pathImg){
        const sw=pathImg.width, sh=pathImg.height, dw=canvas.width, dh=canvas.height;
        const sr=sw/sh, dr=dw/dh; 
        let w,h; 
        if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2;
        
        // Draw the path image
        ctx.drawImage(pathImg, ox, oy, w, h);
        
        // Draw start and end markers
        if(pathPoints && pathPoints.length > 0){
          const startP = pathPoints[0];
          const endP = pathPoints[pathPoints.length - 1];
          
          // Start marker (green)
          ctx.beginPath();
          ctx.arc(ox + startP.x * w, oy + startP.y * h, 12, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          
          // End marker (red)
          if(endP !== startP){
            ctx.beginPath();
            ctx.arc(ox + endP.x * w, oy + endP.y * h, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          }
        }
        
        // Draw the complete trail from learning stage
        if(pathAnimTrail.length > 1){
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(ox + pathAnimTrail[0].x * w, oy + pathAnimTrail[0].y * h);
          for(let i = 1; i < pathAnimTrail.length; i++){
            ctx.lineTo(ox + pathAnimTrail[i].x * w, oy + pathAnimTrail[i].y * h);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        
        // Draw the plane at end position
        if(pathPoints && pathPoints.length > 1){
          const lastPoint = pathPoints[pathPoints.length - 1];
          const secondLastPoint = pathPoints[pathPoints.length - 2];
          const preflightHeading = Math.atan2(lastPoint.y - secondLastPoint.y, lastPoint.x - secondLastPoint.x);
          const planeSize = computePlaneSize(canvas.width, canvas.height);
          drawPlane(ctx, ox + lastPoint.x * w, oy + lastPoint.y * h, planeSize, preflightHeading);
        }
      }
      
      // Semi-transparent overlay for countdown message
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(0, canvas.height/2 - 150, canvas.width, 300);
      
      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('התכונן לטיסה!', canvas.width/2, canvas.height/2 - 80);
      
      // Instructions
      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px system-ui';
      ctx.fillText('המבחן עומד להתחיל בעוד:', canvas.width/2, canvas.height/2 - 30);
      
      // Countdown timer - large and prominent
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 72px system-ui';
      ctx.fillText(Math.ceil(remaining).toString(), canvas.width/2, canvas.height/2 + 30);
      
      // Control instructions
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '16px system-ui';
      ctx.fillText('חץ שמאל/ימין = סיבוב | רווח = תנועה קדימה', canvas.width/2, canvas.height/2 + 100);
      
      if(remaining <= 0){
        console.log('[flightexam] PREFLIGHT time expired, waiting for start');
        stage = 'waiting_for_start';
        initPlaneFromPath();
      }
    } else if(stage==='waiting_for_start'){
      // Draw test image (flight view)
      if(testImgReady){
        const sw=testImg.width, sh=testImg.height, dw=canvas.width, dh=canvas.height;
        const sr=sw/sh, dr=dw/dh; 
        let w,h; 
        if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2; 
        ctx.drawImage(testImg,ox,oy,w,h);
        
        // Draw start/end markers
        if(pathPoints && pathPoints.length){
          const startP=pathPoints[0]; 
          const endP=pathPoints[pathPoints.length-1];
          if(startP){ 
            const sx=ox+startP.x*w, sy=oy+startP.y*h; 
            ctx.beginPath(); ctx.arc(sx,sy,10,0,Math.PI*2); ctx.fillStyle='#10b981'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle='#ffffff'; ctx.stroke(); 
          }
          if(endP && endP!==startP){ 
            const ex=ox+endP.x*w, ey=oy+endP.y*h; 
            ctx.beginPath(); ctx.arc(ex,ey,10,0,Math.PI*2); ctx.fillStyle='#ef4444'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle='#ffffff'; ctx.stroke(); 
          }
        }

        // Draw plane at start
        const planeSize = computePlaneSize(canvas.width, canvas.height);
        drawPlane(ctx, ox + planeNX * w, oy + planeNY * h, planeSize, planeHeading);
      }

      // Overlay
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.fillRect(0, canvas.height/2 - 60, canvas.width, 120);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('לחץ על רווח כדי להתחיל', canvas.width/2, canvas.height/2 + 10);

      setStageMessage('המבחן מוכן - לחץ על רווח כדי להמריא.');

      if(slowActive){ // Space pressed
        console.log('[flightexam] Space pressed, starting flight');
        stage = 'flight';
        flightStartTime = Date.now();
      }
    } else if(stage==='flight'){
      const now=performance.now();
      let dt=0; 
      if(lastFrameTime){ dt=(now-lastFrameTime)/1000; } 
      lastFrameTime=now;
      
      if(keyState.ArrowLeft){ 
        rotHoldLeft += dt; 
        const rotSpeed = ROT_SPEED_BASE + (ROT_SPEED_MAX-ROT_SPEED_BASE)*Math.min(1, rotHoldLeft/ROT_ACCEL_TIME); 
        planeHeading -= rotSpeed*dt; 
      } else { 
        rotHoldLeft = 0; 
      }
      
      if(keyState.ArrowRight){ 
        rotHoldRight += dt; 
        const rotSpeed = ROT_SPEED_BASE + (ROT_SPEED_MAX-ROT_SPEED_BASE)*Math.min(1, rotHoldRight/ROT_ACCEL_TIME); 
        planeHeading += rotSpeed*dt; 
      } else { 
        rotHoldRight = 0; 
      }
      
      if(slowActive){
        const moveSpeed = FORWARD_SPEED;
        planeNX += Math.cos(planeHeading) * moveSpeed * dt;
        planeNY += Math.sin(planeHeading) * moveSpeed * dt;
        planeNX = Math.max(0, Math.min(1, planeNX));
        planeNY = Math.max(0, Math.min(1, planeNY));
      }
      
      if(stage==='flight' && pathPoints && pathPoints.length>1){
        const endP = pathPoints[pathPoints.length-1];
        const dx = planeNX - endP.x; 
        const dy = planeNY - endP.y;
        // Increased hit area for end point (3x radius)
        const hitRadius = END_REACH_RADIUS * 3;
        if(dx*dx + dy*dy <= hitRadius*hitRadius){
          finish();
        }
      }
      
      sampleAccum += dt;
      if(sampleAccum>=0.1){
        sampleAccum=0;
        const projection = projectOnCurrentPath(planeNX, planeNY);
        const d = projection.distance;
        const outside = Math.max(0, d - corridorHalfWidth);
        const ratio = corridorPenaltyWidth > corridorHalfWidth ? Math.min(1, outside / (corridorPenaltyWidth - corridorHalfWidth)) : (outside > 0 ? 1 : 0);
        const progress = projection.progress;
        userTrack.push({x:planeNX,y:planeNY,d,outside,ratio,progress});
        const raw = computeFlightExamRaw(userTrack, corridorHalfWidth, corridorPenaltyWidth);
        score = raw;
      }
      
      if(testImgReady){
        const sw=testImg.width, sh=testImg.height, dw=canvas.width, dh=canvas.height;
        const sr=sw/sh, dr=dw/dh; 
        let w,h; 
        if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2; 
        lastDrawBox={ox,oy,w,h};
        ctx.drawImage(testImg,ox,oy,w,h);
        
        const x=ox+planeNX*w, y=oy+planeNY*h;
        const planeSize = computePlaneSize(canvas.width, canvas.height);
        drawPlane(ctx, x, y, planeSize, planeHeading);
      }
      
      if(testImgReady && pathPoints && pathPoints.length){
        const startP=pathPoints[0]; 
        const endP=pathPoints[pathPoints.length-1];
        const sw=testImg.width, sh=testImg.height, dw=canvas.width, dh=canvas.height; 
        const sr=sw/sh, dr=dw/dh; 
        let w,h; 
        if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2;
        
        if(startP){ 
          const sx=ox+startP.x*w, sy=oy+startP.y*h; 
          ctx.beginPath(); 
          ctx.arc(sx,sy,10,0,Math.PI*2); 
          ctx.fillStyle='#10b981'; 
          ctx.fill(); 
          ctx.lineWidth=3; 
          ctx.strokeStyle='#ffffff'; 
          ctx.stroke(); 
        }
        if(endP && endP!==startP){ 
          const ex=ox+endP.x*w, ey=oy+endP.y*h; 
          ctx.beginPath(); 
          ctx.arc(ex,ey,10,0,Math.PI*2); 
          ctx.fillStyle='#ef4444'; 
          ctx.fill(); 
          ctx.lineWidth=3; 
          ctx.strokeStyle='#ffffff'; 
          ctx.stroke(); 
        }
      }
      
      const elapsed=(Date.now()-flightStartTime)/1000; 
      const remain=Math.max(0,durationFlightSec-elapsed);
      hudUsed = true;
      showHud('זמן טיסה', remain, 'exam');
      setStageMessage(practiceActive
        ? 'טיסה לדוגמה – סובב בחיצים והחזק רווח כדי לעקוב אחרי המסלול.'
        : 'טיסת מבחן – סובב בחיצים והחזק רווח, נסה לשמור על המסלול.');
      const adminView = isAdminMode();
      if(adminView){
        ctx.fillStyle='rgba(0,0,0,0.65)';
        ctx.fillRect(10,10,220,40);
        ctx.fillStyle='#fff';
        ctx.font='14px system-ui';
        ctx.textAlign='left';
        ctx.fillText('דיוק למסלול: '+score.toFixed(1)+'%', 20,35);
      }

      if(remain<=0){ finish(); }
    } else if(stage==='review'){
      // Review stage - compare user path vs original path
      console.log('[flightexam] Drawing REVIEW stage');
      setStageMessage(practiceActive
        ? 'סקירת תרגול – כחול: מסלול מקורי, לבן: הנתיב שלך. לחץ Enter להמשך.'
        : 'סקירת מבחן – כחול: מסלול מקורי, לבן: הנתיב שלך. לחץ Enter להמשך.');
      
      if(testImgReady && testImg && pathImgReady && pathImg){
        const sw=testImg.width, sh=testImg.height, dw=canvas.width, dh=canvas.height;
        const sr=sw/sh, dr=dw/dh; 
        let w,h; 
        if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2;
        
        // Draw test image as background
        ctx.drawImage(testImg, ox, oy, w, h);

        if(isAdminMode()){
          drawCorridorBand(ctx, ox, oy, w, h, { alpha: 0.35, showCenterline: false });
        }
        
        // Draw original path in blue
        if(pathPoints && pathPoints.length > 1){
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(ox + pathPoints[0].x * w, oy + pathPoints[0].y * h);
          for(let i = 1; i < pathPoints.length; i++){
            ctx.lineTo(ox + pathPoints[i].x * w, oy + pathPoints[i].y * h);
          }
          ctx.stroke();
        }
        
        // Draw user path in green
        const userPath = allTracks[currentPart] || userTrack;
        if(userPath && userPath.length > 1){
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(ox + userPath[0].x * w, oy + userPath[0].y * h);
          for(let i = 1; i < userPath.length; i++){
            ctx.lineTo(ox + userPath[i].x * w, oy + userPath[i].y * h);
          }
          ctx.stroke();
        }
        
        // Start/End markers
        if(pathPoints && pathPoints.length){
          const startP = pathPoints[0];
          const endP = pathPoints[pathPoints.length - 1];
          
          ctx.beginPath();
          ctx.arc(ox + startP.x * w, oy + startP.y * h, 12, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          
          if(endP !== startP){
            ctx.beginPath();
            ctx.arc(ox + endP.x * w, oy + endP.y * h, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          }
        }
        
        // Top banner with score
        const storedScore = partScores[currentPart];
        const partScore = typeof storedScore === 'number'? storedScore : score;
        const practiceReview = isPracticePart(currentPart);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
        ctx.fillRect(0, 0, canvas.width, 100);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(practiceReview? 'השוואת מסלול תרגול' : 'השוואת מסלול', canvas.width / 2, 35);
        
        ctx.font = '18px system-ui';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('כחול = מסלול מקורי | ירוק = המסלול שלך', canvas.width / 2, 65);
        
        const adminView = isAdminMode();
        if(adminView){
          ctx.font = 'bold 20px system-ui';
          ctx.fillStyle = practiceReview? '#facc15' : '#60a5fa';
          const label = practiceReview? 'דיוק תרגול (לא משוקלל): ' : 'דיוק: ';
          ctx.fillText(`${label}${partScore.toFixed(1)}%`, canvas.width / 2, 90);
        }
        
        // Bottom instructions
        const elapsed = (Date.now() - reviewStartTime) / 1000;
        const holdDuration = practiceReview ? Math.max(30, REVIEW_AUTO_SEC) : REVIEW_AUTO_SEC;
        const remaining = Math.max(0, holdDuration - elapsed);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, canvas.height - 70, canvas.width, 70);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px system-ui';
        ctx.textAlign = 'center';
        
        if(practiceReview){
          ctx.fillText('המסלול שלך מוצג למשך 30 שניות להשוואה. לחץ Enter לעבור מיד למבחן האמיתי.', canvas.width / 2, canvas.height - 35);
          if(remaining <= 0){
            console.log('[flightexam] Practice review time elapsed – opening transition');
            finalizeReview();
          }
        } else if(currentPart < partsRef.length - 1){
          ctx.fillText(`מעבר לחלק הבא בעוד ${remaining.toFixed(1)} שניות | לחץ Enter לדלג`, canvas.width / 2, canvas.height - 35);
          if(remaining <= 0){
            console.log('[flightexam] REVIEW time expired, advancing');
            finalizeReview();
          }
        } else {
          ctx.fillText(`סיום המבחן בעוד ${remaining.toFixed(1)} שניות | לחץ Enter לסיים עכשיו`, canvas.width / 2, canvas.height - 35);
          if(remaining <= 0){
            console.log('[flightexam] REVIEW time expired, finishing');
            finalizeReview();
          }
        }
      } else {
        // Loading review images
        ctx.fillStyle = '#ffffff';
        ctx.font = '22px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('מכין השוואה...', canvas.width / 2, canvas.height / 2);
      }
    }
    if(!hudUsed){
      hideHud();
    }
    if(active) requestAnimationFrame(draw);
  }

  function startTimer(){
    timerId = setInterval(()=>{
      if(stage==='flight'){
        const elapsed=(Date.now()-flightStartTime)/1000; 
        const remaining=Math.max(0,durationFlightSec-elapsed);
        const timeEl=document.getElementById('flightexam-time'); 
        if(timeEl) timeEl.textContent='טיסה '+remaining.toFixed(1)+'s';
        const scoreEl=document.getElementById('flightexam-score'); 
        if(scoreEl && !(window.testAuth && !window.testAuth.isAdmin())) 
          scoreEl.textContent=score.toFixed(1);
        if(remaining<=0){ finish(); }
      }
    },250);
  }

  function finish(){
    if(stage==='review') return;
    const practicePart = isPracticePart(currentPart);
    if(pathPoints && pathPoints.length){ 
      const projection = projectOnCurrentPath(planeNX, planeNY);
      const dFinal = projection.distance;
      const outside = Math.max(0, dFinal - corridorHalfWidth);
      const ratio = corridorPenaltyWidth > corridorHalfWidth ? Math.min(1, outside / (corridorPenaltyWidth - corridorHalfWidth)) : (outside > 0 ? 1 : 0);
      userTrack.push({x:planeNX,y:planeNY,d:dFinal,outside,ratio,progress:projection.progress}); 
    }
    
    const partScore = computeFlightExamRaw(userTrack, corridorHalfWidth, corridorPenaltyWidth);
    partScores[currentPart]=practicePart? null : partScore; 
    allTracks[currentPart]=userTrack.slice();
    score=partScore; 
    stage='review'; 
    reviewStartTime=Date.now(); 
    reviewActive=true;
    warmNextPart(partsRef, currentPart);
  }

  function finalizeReview(forceEnd){
    if(!reviewActive && !forceEnd) return;
    reviewActive=false;
    const currentIsPractice = isPracticePart(currentPart);
    const nextPartIndex = currentPart + 1;
    const nextPart = partsRef[nextPartIndex];
    const nextIsPractice = nextPart && nextPart.isPractice;
    
    if(currentIsPractice && nextIsPractice){
      // Practice -> Practice: Continue automatically with short delay
      setStageMessage('חלק תרגול הושלם. עובר לחלק הבא...');
      setTimeout(()=>{
        currentPart++;
        updatePracticeUiState();
        loadPart(currentPart);
      }, 1500);
      return;
    }

    if(currentIsPractice && !nextIsPractice && nextPart){
      // Practice -> Exam: Show transition prompt
      showPracticeTransitionPrompt(()=>{
        currentPart++;
        updatePracticeUiState();
        loadPart(currentPart);
      });
      return;
    }

    if(currentPart < partsRef.length-1){
      currentPart++;
      console.log('[flightexam] advance to part', currentPart);
      updatePracticeUiState();
      loadPart(currentPart);
      return;
    }
    
    active=false; 
    clearInterval(timerId);
    hideHud();
    if(window.practiceBanner) window.practiceBanner.hide();
    setStageMessage('מבחן הטסה הסתיים.');
    
    let finalScore=0; 
    let n=0; 
    partScores.forEach(ps=>{ 
      if(typeof ps==='number'){ 
        finalScore+=ps; 
        n++; 
      } 
    });
    if(n>0){ finalScore/=n; }
    
    score=finalScore;
    const g=window.getGlobalScale? window.getGlobalScale(): {min:1,max:7};
    const scaled=scaleFlightExam(score, g);
    
    if(window.testsCore){ 
      window.testsCore.completeTest('flightexam', score, scaled, {parts:partScores.length}); 
    }
    if(window.testAuth){ 
      window.testAuth.showTestCompleteModal('flightexam', scaled.toFixed(2)); 
    }
    if(window.exitFullscreenMode) window.exitFullscreenMode();
  }

  startBtn.addEventListener('click', start);

  document.addEventListener('keydown', e=>{
    if(stage!=='flight' && stage!=='review' && stage!=='waiting_for_start') return;
    if(stage==='review' && e.code==='Enter'){ 
      e.preventDefault(); 
      finalizeReview(); 
      return; 
    }
    if(stage==='flight' || stage==='waiting_for_start'){
      if(e.code==='ArrowLeft'){ 
        keyState.ArrowLeft=true; 
        e.preventDefault(); 
      } else if(e.code==='ArrowRight'){ 
        keyState.ArrowRight=true; 
        e.preventDefault(); 
      } else if(e.code==='Space'){ 
        slowActive=true; 
        e.preventDefault(); 
      }
    }
  });
  
  document.addEventListener('keyup', e=>{
    if(e.code==='ArrowLeft'){ 
      keyState.ArrowLeft=false; 
    } else if(e.code==='ArrowRight'){ 
      keyState.ArrowRight=false; 
    } else if(e.code==='Space'){ 
      slowActive=false; 
    }
  });

  document.addEventListener('DOMContentLoaded',()=>{ 
    if(window.testsCore) 
      window.testsCore.registerTest('flightexam',{title:'מבחן טיסה'}); 
  });
})();