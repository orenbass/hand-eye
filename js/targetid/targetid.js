import { getTargetIdConfig } from './targetid.config.js';
import { computeTargetIdRaw, scaleTargetId } from './targetid.scoring.js';
import { makeRng, spawnTarget } from './targetid.utils.js';

(function(){
  // DOM Elements
  const canvas = document.getElementById('targetid-canvas');
  const startBtn = document.getElementById('start-targetid');
  const statusEl = document.getElementById('targetid-status');
  const scoreEl = document.getElementById('targetid-score');
  const timeEl = document.getElementById('targetid-time');
  const statsBox = document.getElementById('targetid-stats');
  const layoutEl = document.getElementById('targetid-layout');
  
  // State
  let ctx = null;
  let running = false;
  let lastTs = 0;
  let timeLeft = 0;
  let mouse = { x: 0, y: 0 };
  let targets = [];
  let hits = 0;
  let shots = 0;
  let wrong = 0;
  let lastSpawn = 0;
  let cfg = null;
  let rng = null;
  let mode = 'idle'; // 'idle', 'practice', 'real'
  let practiceDone = false;
  let prePracticeShown = false;
  
  // HUD Components
  // We use global singletons window.timerHUD and window.practiceBanner

  function init(){
    if(!canvas) return;
    ctx = canvas.getContext('2d');
    
    // Attach HUDs to our slots
    if(window.timerHUD && window.timerHUD.attach) {
      window.timerHUD.attach(document.getElementById('targetid-timer-slot'));
    }
    if(window.practiceBanner && window.practiceBanner.attach) {
      window.practiceBanner.attach(document.getElementById('targetid-practice-slot'));
    }

    // Event Listeners
    if(startBtn) {
      startBtn.addEventListener('click', handleStartClick);
    }
    
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    window.addEventListener('resize', resize);
    
    // Register test
    if(window.testsCore) {
      window.testsCore.registerTest('targetid', { title: 'ירי במטרות' });
    }
  }

  async function handleStartClick() {
    // Download settings from server first
    if(startBtn) {
      const originalText = startBtn.textContent;
      startBtn.disabled = true;
      startBtn.textContent = 'טוען הגדרות...';
      try {
        if(window.refreshTestSettings) {
          await window.refreshTestSettings('targetid', { force: true });
        }
      } catch(e) {
        console.warn('Failed to refresh targetid settings:', e);
      }
      startBtn.disabled = false;
      startBtn.textContent = originalText;
    }
    
    if(!prePracticeShown) {
      prePracticeShown = true;
      showPrePracticeModal(startPractice);
    } else {
      startPractice();
    }
  }

  function ensurePracticeModal(){
    let modal = document.getElementById('targetid-practice-modal');
    if(modal) return modal;
    
    modal = document.createElement('div');
    modal.id = 'targetid-practice-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:15000;display:none;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `<div style="max-width:520px;width:100%;background:#ffffff;color:#0f172a;border-radius:20px;padding:32px;box-shadow:0 25px 55px rgba(15,23,42,0.45);text-align:center;"></div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function showPrePracticeModal(onStart){
    const modal = ensurePracticeModal();
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
    modal.style.display = 'flex';
    
    const btn = contentBox.querySelector('[data-action="start-practice"]');
    btn.onclick = () => {
      modal.style.display = 'none';
      if(onStart) onStart();
    };
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
      const countdownSec = cfg && typeof cfg.examCountdownSec !== 'undefined' ? cfg.examCountdownSec : 5;
      if(countdownSec > 0){
          let remaining = countdownSec;
          contentBox.innerHTML = `
              <div style="font-size:4rem;margin-bottom:16px;font-weight:800;color:#0ea5e9;line-height:1" id="tid-modal-countdown">${remaining}</div>
              <h2 style="margin:0 0 8px;font-size:1.5rem;">המבחן מתחיל בעוד...</h2>
              <p style="color:#64748b;margin:0">נא להתכונן</p>
          `;
          const timer = setInterval(()=>{
              remaining--;
              const el = document.getElementById('tid-modal-countdown');
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

  function startPractice() {
    if(running) return;
    
    cfg = getTargetIdConfig();
    mode = 'practice';
    practiceDone = false;
    
    if(window.enterFullscreenMode) window.enterFullscreenMode();
    
    // Ensure layout allows practice slot visibility
    if(layoutEl) layoutEl.setAttribute('data-stage', 'practice');

    // Re-attach HUDs
    if(window.timerHUD && window.timerHUD.attach) {
      window.timerHUD.attach(document.getElementById('targetid-timer-slot'));
    }
    if(window.practiceBanner && window.practiceBanner.attach) {
      window.practiceBanner.attach(document.getElementById('targetid-practice-slot'));
    }

    // Setup HUD
    if(window.practiceBanner) {
      window.practiceBanner.show({
        label: 'מצב תרגול',
        description: 'התוצאות אינן נשמרות',
        mode: 'practice'
      });
    }
    if(window.timerHUD) {
      window.timerHUD.show('זמן תרגול', formatTime(cfg.practiceSeconds), 'practice');
    }
    
    setStatus('תרגול: פגע רק במטרות הירוקות והימנע מהאדומות');
    
    startRun(cfg.practiceSeconds);
  }

  function startRealCountdown() {
    // Deprecated - handled by modal now
    startRealTest();
  }

  function startRealTest() {
    mode = 'real';
    cfg = getTargetIdConfig();
    
    // Ensure layout allows banner slot visibility (we reuse practice slot for real banner)
    if(layoutEl) layoutEl.setAttribute('data-stage', 'practice');

    // Re-attach HUDs
    if(window.timerHUD && window.timerHUD.attach) {
      window.timerHUD.attach(document.getElementById('targetid-timer-slot'));
    }
    if(window.practiceBanner && window.practiceBanner.attach) {
      window.practiceBanner.attach(document.getElementById('targetid-practice-slot'));
    }

    if(window.practiceBanner) {
      window.practiceBanner.show({
        label: 'מבחן אמת',
        description: 'בהצלחה!',
        mode: 'real'
      });
    }
    // Hide timer in real test as requested ("display ONLY the banner")
    if(window.timerHUD) {
      window.timerHUD.hide();
    }

    setStatus('מבחן אמיתי: פגע רק בירוקים ושמור על דיוק גבוה.');
    
    startRun(cfg.seconds);
  }

  function startRun(duration) {
    timeLeft = duration;
    hits = 0;
    shots = 0;
    wrong = 0;
    targets = [];
    lastSpawn = 0;
    running = true;
    lastTs = 0;
    rng = makeRng(987654 + Date.now());
    
    canvas.style.cursor = 'none';
    resize();
    
    // Update stats visibility
    const isAdmin = window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin();
    if(statsBox) statsBox.style.display = (mode === 'real' && isAdmin) ? 'block' : 'none';
    if(scoreEl) scoreEl.textContent = '-';
    
    requestAnimationFrame(step);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }

  function step(ts) {
    if(!running) return;
    if(!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    
    timeLeft = Math.max(0, timeLeft - dt);
    
    // Update Timer HUD
    if(window.timerHUD) {
      window.timerHUD.update(formatTime(Math.ceil(timeLeft)));
    }
    if(timeEl) {
      timeEl.textContent = formatTime(Math.ceil(timeLeft));
    }

    // Spawn targets
    lastSpawn += dt;
    if(lastSpawn > cfg.spawnRate) {
      lastSpawn = 0;
      targets.push(spawnTarget(rng, canvas, cfg.speed, cfg.goodProb));
    }
    
    // Update targets
    targets.forEach(t => {
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if(t.x < 0 || t.x > canvas.width) t.vx *= -1;
      if(t.y < 0 || t.y > canvas.height) t.vy *= -1;
    });
    
    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b1729';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    targets.forEach(t => {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = t.good ? '#22c55e' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.stroke();
    });
    
    drawCross();
    
    // Update Score (Admin only or internal)
    const raw = computeTargetIdRaw(hits, shots, wrong);
    const g = window.getGlobalScale ? window.getGlobalScale() : { min: 1, max: 7 };
    const scaled = scaleTargetId(raw, g);
    
    if(statsBox && statsBox.style.display !== 'none' && scoreEl) {
      scoreEl.textContent = scaled.toFixed(2);
    }

    if(timeLeft <= 0) {
      finish(raw, scaled);
      return;
    }
    
    requestAnimationFrame(step);
  }

  function finish(raw, scaled) {
    running = false;
    canvas.style.cursor = 'default';
    
    if(mode === 'practice') {
      practiceDone = true;
      showEndPracticeModal(startRealCountdown);
      return;
    }
    
    // Real test finished
    if(window.exitFullscreenMode) window.exitFullscreenMode();
    
    if(window.testsCore) {
      window.testsCore.completeTest('targetid', raw, scaled, { hits, shots, wrong });
    }
    
    if(window.testAuth) {
      window.testAuth.showTestCompleteModal('targetid', scaled.toFixed(2));
    }
    
    mode = 'idle';
    setStatus('המבחן הסתיים.', 'success');
  }

  function drawCross() {
    ctx.save();
    ctx.translate(mouse.x, mouse.y);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
  }

  function handleMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }

  function handleClick() {
    if(!running) return;
    shots++;
    
    for(let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      const d = Math.hypot(mouse.x - t.x, mouse.y - t.y);
      if(d <= t.r + 4) {
        if(t.good) hits++;
        else wrong++;
        targets.splice(i, 1);
        break;
      }
    }
  }

  function resize() {
    if(!canvas) return;
    // Use 80% of height or width, whichever fits better, but keep it square
    const size = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.75);
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
  }

  function setStatus(text, tone='info') {
    if(!statusEl) return;
    statusEl.textContent = text;
    statusEl.setAttribute('data-tone', tone);
  }

  // Initialize on load
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();