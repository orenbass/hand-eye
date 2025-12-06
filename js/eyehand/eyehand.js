import { getEyeHandConfig } from './eyehand.config.js';
import { computeEyeHandScores } from './eyehand.scoring.js';
import { drawFullPath, flattenPathSamples, drawTrailSegment } from './eyehand.render.js';

// Eye-Hand Coordination Test Module - cleaned & formatted
class EyeHandTest {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.path = [];
    this.pathWidth = 20;
    this.wallWidth = 5;
    this.testDuration = 30000;
    this.testActive = false;
    this.testStarted = false;
    this.startTime = 0;
    this.currentProgress = 0;
    this.penalties = 0;
    this.isMouseDown = false;
    this.lastPosition = null;
    this.timerInterval = null;
    this.pathSeed = Date.now();
    this.lastPenaltyTime = 0;
    this.penaltyThreshold = 150;
    this.wasOutsidePath = false;
    this.isTouchingWall = false;
    this.trailWidth = 3;
    this.maskCanvas = null;
    this.maskCtx = null;
    this.samplePoints = [];
    this.lastInsideIndex = 0;
    this.maxIndexJump = 30;
    this.lastOutsidePenaltyTime = 0;
    this.outsidePenaltyCooldown = 300;
    this.mouseUpPenaltyGiven = false;
    this.finishTolerance = 0.995;
    this.totalPathLength = 0;
    this.insideLength = 0;
    this.wallLength = 0;
    this.outsideLength = 0;
    this.liftCount = 0;
    this.wallFactor = 1.5;
    this.outsideFactor = 3;
    this.liftFactor = 2;
    this.endPoint = null;
    this.config = null; // new: dynamic config cache
    this.mode = 'practice';
    this.practiceEnabled = true;
    this.practiceRunsRequired = 1;
    this.practiceRunsComplete = 0;
    this.practiceDurationMs = 15000;
    this.examCountdownSec = 5;
    this.activeDurationMs = 30000;
    this.countdownInterval = null;
    this.countdownRemaining = 0;
    this.canvasListenersBound = false;
    this.shell = null;
    this.footerNoteEl = null;
    this.practiceSlotEl = null;
    this.timerSlotEl = null;
    this.countdownEl = null;
    this.instructionsOverlay = null;
    this.instructionsToggle = null;
    this.practiceModalEl = null;
    this.hudSnapshot = { label: '', value: '', mode: '' };
    this.canvasResizeHandler = null;
    this.timerRunning = false;
    this.canvasSized = false;
    this.prePracticeShown = false;
  }

  init() {
    this.cacheDomRefs();
    this.setupEventListeners();
  }

  setupEventListeners() {
    const startButton = document.getElementById('start-button');
    const retryButton = document.getElementById('retry-button');
    const newPathButton = document.getElementById('new-path-button');
    if (startButton) {
      startButton.addEventListener('click', () => this.handleStartButtonClick(startButton));
    }
    if (retryButton) retryButton.addEventListener('click', () => this.retryTest());
    if (newPathButton) newPathButton.addEventListener('click', () => this.newPathTest());
    if (this.instructionsToggle) this.instructionsToggle.addEventListener('click', () => this.toggleInstructionsOverlay());
    if (this.instructionsOverlay) {
      this.instructionsOverlay.addEventListener('click', (ev) => {
        if (ev.target === this.instructionsOverlay) this.closeInstructionsOverlay();
      });
    }
  }

  async handleStartButtonClick(btn) {
    if (this.busyStarting) return;
    this.busyStarting = true;

    const originalText = btn ? btn.textContent : 'התחל מבחן';
    let loadingOverlay = null;

    try {
      // Show loading state on button
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'טוען הגדרות...';
      }

      // Show loading overlay after 300ms if still loading
      const overlayTimer = setTimeout(() => {
        loadingOverlay = this.showLoadingOverlay('טוען הגדרות עדכניות מהשרת...');
      }, 300);

      // Fetch test-specific settings from server with timeout
      if (window.refreshTestSettings) {
        console.log('[eyehand] 🔄 מוריד הגדרות ספציפיות למבחן תיאום עין-יד...');
        try {
          const fetchPromise = window.refreshTestSettings('eyehand', { force: true });
          const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 5000));
          const result = await Promise.race([fetchPromise, timeoutPromise]);

          if (result && result.timeout) {
            console.warn('[eyehand] ⏱️ Timeout - משתמש בהגדרות מקומיות');
          } else if (result && result.applied) {
            console.log('[eyehand] ✅ הגדרות ספציפיות הורדו בהצלחה!', result.payload);
          } else if (result && result.reason) {
            console.log('[eyehand] ℹ️ לא נמצאו הגדרות ספציפיות:', result.reason);
          }
        } catch (e) {
          console.warn('[eyehand] ❌ שגיאה בהורדת הגדרות ספציפיות:', e);
        }
      } else {
        console.log('[eyehand] ⚠️ פונקציית refreshTestSettings לא זמינה');
      }

      clearTimeout(overlayTimer);

      // Reload config and start test
      console.log('[eyehand] 🔧 טוען קונפיגורציה למבחן...');
      this.reloadConfig();
      console.log('[eyehand] ✅ קונפיגורציה נטענה:', {
        difficulty: this.config?.difficulty,
        durationMs: this.config?.durationMs || this.testDuration,
        practiceEnabled: this.practiceEnabled,
        practiceRuns: this.practiceRunsRequired
      });

      if (this.practiceEnabled && !this.prePracticeShown) {
        this.prePracticeShown = true;
        this.showPrePracticeModal(() => this.showTestScreen());
      } else {
        this.showTestScreen();
      }
    } catch (err) {
      console.error('[eyehand] Error starting test', err);
      this.showTestScreen();
    } finally {
      this.busyStarting = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      if (loadingOverlay) {
        this.hideLoadingOverlay(loadingOverlay);
      }
    }
  }

  showLoadingOverlay(message) {
    const overlay = document.createElement('div');
    overlay.className = 'eyehand-loading-overlay';
    overlay.innerHTML = `
      <div class="eyehand-loading-content">
        <div class="eyehand-spinner"></div>
        <p>${message || 'טוען...'}</p>
      </div>
    `;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;
    const content = overlay.querySelector('.eyehand-loading-content');
    if (content) {
      content.style.cssText = `
        background: var(--bg-secondary, #1e293b);
        padding: 32px 48px;
        border-radius: 16px;
        text-align: center;
        color: var(--text-primary, #fff);
        font-size: 1.1rem;
      `;
    }
    const spinner = overlay.querySelector('.eyehand-spinner');
    if (spinner) {
      spinner.style.cssText = `
        width: 48px;
        height: 48px;
        border: 4px solid rgba(255,255,255,0.2);
        border-top-color: #3b82f6;
        border-radius: 50%;
        margin: 0 auto 16px;
        animation: eyehand-spin 1s linear infinite;
      `;
    }
    // Add spinner animation if not exists
    if (!document.getElementById('eyehand-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'eyehand-spinner-style';
      style.textContent = '@keyframes eyehand-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
    return overlay;
  }

  hideLoadingOverlay(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  cacheDomRefs() {
    this.shell = document.getElementById('eyehand-shell');
    this.footerNoteEl = document.getElementById('eyehand-footer-note');
    this.practiceSlotEl = document.getElementById('eyehand-practice-slot');
    this.timerSlotEl = document.getElementById('eyehand-timer-slot');
    this.countdownEl = document.getElementById('eyehand-countdown');
    this.instructionsOverlay = document.getElementById('eyehand-instructions-overlay');
    this.instructionsToggle = document.getElementById('eyehand-instructions-toggle');
  }

  bindCanvasResizeHandler(){
    if (this.canvasResizeHandler) window.removeEventListener('resize', this.canvasResizeHandler);
    this.canvasResizeHandler = () => this.sizeCanvasToWrapper();
    window.addEventListener('resize', this.canvasResizeHandler);
  }

  detachCanvasResizeHandler(){
    if (!this.canvasResizeHandler) return;
    window.removeEventListener('resize', this.canvasResizeHandler);
    this.canvasResizeHandler = null;
  }

  sizeCanvasToWrapper(forceIntrinsic = false){
    if (!this.canvas) return;
    const wrapper = this.canvas.closest('.eyehand-canvas-wrapper');
    let wrapperWidth = wrapper ? wrapper.clientWidth : window.innerWidth * 0.9;
    if (wrapper) {
      const styles = window.getComputedStyle(wrapper);
      const paddingX = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      wrapperWidth = Math.max(320, wrapperWidth - paddingX);
    }
    const availableWidth = Math.min(wrapperWidth, window.innerWidth * 0.92, 1320);
    const aspect = 16 / 9;
    let width = Math.floor(availableWidth);
    let height = Math.floor(width / aspect);
    const maxHeight = Math.max(320, Math.min(window.innerHeight - 320, 760));
    if (height > maxHeight) {
      height = maxHeight;
      width = Math.floor(height * aspect);
    }
    const setIntrinsic = forceIntrinsic || !this.canvasSized;
    if (setIntrinsic) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.ctx) this.ctx.imageSmoothingEnabled = true;
      if (this.maskCanvas) {
        this.maskCanvas.width = width;
        this.maskCanvas.height = height;
        this.maskCtx = this.maskCanvas.getContext('2d');
      }
      this.canvasSized = true;
    }
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  attachHudWidgets(){
    if (window.practiceBanner && typeof window.practiceBanner.attach === 'function') {
      window.practiceBanner.attach(this.practiceSlotEl || null);
    }
    if (window.timerHUD && typeof window.timerHUD.attach === 'function') {
      window.timerHUD.attach(this.timerSlotEl || null);
    }
  }

  releaseHudWidgets(){
    if (window.practiceBanner && typeof window.practiceBanner.attach === 'function') {
      window.practiceBanner.attach(null);
      window.practiceBanner.hide();
    }
    if (window.timerHUD && typeof window.timerHUD.attach === 'function') {
      window.timerHUD.attach(null);
      window.timerHUD.hide();
    }
    this.hudSnapshot = { label: '', value: '', mode: '' };
  }

  prepareInstructionsOverlay() {
    // משתמש במערכת האחידה מ-instructions.js
    // לא צריך לעשות כלום כאן - ה-instructions.js מטפל בזה
  }

  openInstructionsOverlay() {
    if(typeof window.openInstructionsOverlay === 'function'){
      window.openInstructionsOverlay('test-screen');
    }
  }

  closeInstructionsOverlay() {
    if(typeof window.closeInstructionsOverlay === 'function'){
      window.closeInstructionsOverlay('test-screen');
    }
  }

  toggleInstructionsOverlay() {
    const section = document.getElementById('test-screen');
    if(!section) return;
    const overlay = section.querySelector('.unified-instructions-overlay');
    if(overlay && overlay.style.display === 'block'){
      this.closeInstructionsOverlay();
    } else {
      this.openInstructionsOverlay();
    }
  }

  showTestScreen() {
    this.switchScreen('test-screen');
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    this.enterFullscreen();
    setTimeout(() => {
      this.setupCanvas();
      this.setupCanvasListeners();
      this.bindCanvasResizeHandler();
      this.prepareInstructionsOverlay();
      this.reloadConfig();
      this.attachHudWidgets();
      this.resetRunState();
      this.enterPracticeStage();
    }, 100);
  }

  reloadConfig(){
    this.config = getEyeHandConfig();
    this.pathWidth = this.config.pathWidth;
    this.wallWidth = this.config.wallWidth;
    this.wallFactor = this.config.wallFactor;
    this.outsideFactor = this.config.outsideFactor;
    this.liftFactor = this.config.liftFactor;
    this.testDuration = this.config.durationMs;
    this.practiceEnabled = this.config.practiceEnabled !== false;
    this.practiceRunsRequired = this.practiceEnabled ? (this.config.practiceRuns || 1) : 0;
    this.practiceDurationMs = this.config.practiceDurationMs || Math.min(this.testDuration, 15000);
    this.examCountdownSec = typeof this.config.examCountdownSec === 'number' ? this.config.examCountdownSec : 5;
    this.activeDurationMs = this.testDuration;
  }

  resetRunState(){
    this.practiceRunsComplete = 0;
    this.mode = this.practiceEnabled ? 'practice' : 'exam';
    this.resetMetricsForRun();
    this.clearCountdown();
    this.updateTimerDisplays((this.practiceEnabled ? this.practiceDurationMs : this.testDuration) / 1000);
    this.toggleStartPrompt(true);
    this.updateStageUi();
  }

  resetMetricsForRun(){
    this.testActive = false;
    this.testStarted = false;
    this.timerRunning = false;
    this.currentProgress = 0;
    this.penalties = 0;
    this.isMouseDown = false;
    this.lastPosition = null;
    this.isTouchingWall = false;
    this.lastInsideIndex = 0;
    this.insideLength = 0;
    this.wallLength = 0;
    this.outsideLength = 0;
    this.liftCount = 0;
    this.totalPathLength = 0;
    this.mouseUpPenaltyGiven = false;
    this.lastPenaltyTime = 0;
    this.wasOutsidePath = false;
    this.lastOutsidePenaltyTime = 0;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.startTime = 0;
    this.updateStats();
  }

  updateTimerDisplays(seconds){
    const numeric = typeof seconds === 'number' ? seconds : parseFloat(seconds);
    this.updateHudTimer(numeric);
  }

  updateHudTimer(seconds){
    if (!window.timerHUD) return;
    const stage = (this.mode === 'practice' && this.practiceEnabled) ? 'practice' : 'exam';
    const label = stage === 'practice' ? 'זמן תרגול' : 'זמן מבחן';
    const valueStr = Number.isFinite(seconds) ? this.formatHudValue(seconds) : '--:--';
    if (
      this.hudSnapshot.label === label &&
      this.hudSnapshot.value === valueStr &&
      this.hudSnapshot.mode === stage
    ) {
      return;
    }
    window.timerHUD.show(label, valueStr, stage);
    this.hudSnapshot = { label, value: valueStr, mode: stage };
  }

  formatHudValue(seconds){
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = String(Math.floor(total / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');
    return `${minutes}:${secs}`;
  }

  toggleStartPrompt(show){
    const sp = document.getElementById('start-prompt');
    if (sp) sp.style.display = show ? 'block' : 'none';
  }

  enterPracticeStage(){
    if (!this.practiceEnabled) {
      this.mode = 'exam';
      this.updateStageUi('המבחן האמיתי יתחיל מיד');
      this.startRun('exam');
      return;
    }
    this.mode = 'practice';
    this.updateStageUi();
    this.startRun('practice');
  }

  updateStageUi(statusOverride){
    const stage = this.mode === 'practice' ? 'practice' : 'exam';
    if (this.shell) this.shell.setAttribute('data-stage', stage);
    const practiceTotal = Math.max(1, this.practiceRunsRequired || 1);
    const defaultStatus = this.mode === 'practice'
      ? `תרגול ${Math.min(this.practiceRunsComplete + 1, practiceTotal)} מתוך ${practiceTotal} – השליטה במסלול אינה נשמרת לציון.`
      : (this.testActive ? 'המבחן האמיתי פעיל – השאר במרכז הרצועה הלבנה.' : 'המבחן האמיתי יתחיל מיד כאשר תלחץ על נקודת ההתחלה.');
    const message = statusOverride || defaultStatus;
    if (this.footerNoteEl) this.footerNoteEl.textContent = message;
    this.updatePracticeBanner();
  }

  updatePracticeBanner(){
    if (!window.practiceBanner) return;
    if (this.mode === 'practice' && this.practiceEnabled) {
      window.practiceBanner.show({
       label: 'מצב תרגול',
       description: 'התוצאות אינן נשמרות',
       mode: 'practice'
      });
    } else {
      window.practiceBanner.show({
        label: 'מבחן אמיתי',
        description: this.testActive
          ? 'הציון נשמר – הישאר בתוך הרצועה הלבנה.'
          : 'המבחן האמיתי עומד להתחיל – מיקום יד יציב.',
        mode: 'real'
      });
    }
  }

  clearCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.countdownEl) {
      this.countdownEl.style.display = 'none';
      this.countdownEl.textContent = '';
    }
  }

  startRun(mode = 'exam'){
    this.clearCountdown();
    this.mode = mode === 'practice' && this.practiceEnabled ? 'practice' : 'exam';
    this.resetMetricsForRun();
    this.testActive = true;
    this.testStarted = false;
    this.timerRunning = false;
    this.startTime = 0;
    this.pathSeed = Date.now();
    this.sizeCanvasToWrapper(true);
    this.generatePath();
    this.drawPath();
    this.activeDurationMs = this.mode === 'practice' ? this.practiceDurationMs : this.testDuration;
    this.updateTimerDisplays(this.activeDurationMs / 1000);
    this.updateStageUi();
    this.toggleStartPrompt(true);
  }

  handlePracticeFinish(){
    this.practiceRunsComplete += 1;
    this.testStarted = false;
    this.isMouseDown = false;
    this.lastPosition = null;
    const practiceTotal = Math.max(1, this.practiceRunsRequired || 1);
    if (this.practiceRunsComplete < practiceTotal) {
      this.updateStageUi(`תרגול ${this.practiceRunsComplete}/${practiceTotal} הושלם - תרגול נוסף יתחיל מיד`);
      setTimeout(() => this.startRun('practice'), 1500);
      return;
    }
    this.mode = 'exam';
    this.updateStageUi('התרגול הסתיים - המבחן האמיתי יתחיל לאחר האישור שלך.');
    this.showPracticeModal(() => this.startRun('exam'));
  }

  ensurePracticeModal(){
    if (this.practiceModalEl) return this.practiceModalEl;
    const overlay = document.createElement('div');
    overlay.id = 'eyehand-practice-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:15000;display:none;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div class="eyehand-modal-content" style="max-width:520px;width:100%;background:#ffffff;color:#0f172a;border-radius:20px;padding:32px;box-shadow:0 25px 55px rgba(15,23,42,0.45);text-align:center;">
        <!-- Content injected dynamically -->
      </div>`;
    document.body.appendChild(overlay);
    this.practiceModalEl = overlay;
    return overlay;
  }

  showPracticeModal(onContinue){
    const modal = this.ensurePracticeModal();
    const contentBox = modal.querySelector('.eyehand-modal-content');
    
    // Initial State
    contentBox.innerHTML = `
        <div style="font-size:2.6rem;margin-bottom:12px">🎯</div>
        <h2 style="margin:0 0 12px;font-size:1.45rem;">התרגול הסתיים</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
          בלחיצה על  <strong>הבנתי- להתחיל את המבחן האמיתי</strong>. יתחיל המבחן האמיתי מיד. הציון הבא ייחשב כציון הרשמי.
ודא שאתה מוכן לפני המעבר למבחן.
        </p>
        <button type="button" data-action="confirm" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">הבנתי – להתחיל מבחן אמיתי</button>
    `;
    
    modal.style.display = 'flex';
    
    const confirmBtn = contentBox.querySelector('[data-action="confirm"]');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        if (this.examCountdownSec > 0) {
            // Countdown State inside modal
            let remaining = this.examCountdownSec;
            contentBox.innerHTML = `
                <div style="font-size:4rem;margin-bottom:16px;font-weight:800;color:#0ea5e9;line-height:1" id="eh-modal-countdown">${remaining}</div>
                <h2 style="margin:0 0 8px;font-size:1.5rem;">המבחן מתחיל בעוד...</h2>
                <p style="color:#64748b;margin:0">נא להתכונן</p>
            `;
            
            const timer = setInterval(() => {
                remaining--;
                const el = document.getElementById('eh-modal-countdown');
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

  showPrePracticeModal(onStart){
    const modal = this.ensurePracticeModal();
    const contentBox = modal.querySelector('.eyehand-modal-content');
    
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

  enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.log('Fullscreen request failed:', err));
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
  }

  exitFullscreen() {
    if (window.exitFullscreenMode) window.exitFullscreenMode();
    if (document.exitFullscreen) document.exitFullscreen().catch(err => console.log('Exit fullscreen failed:', err));
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }

  setupCanvas() {
    this.canvas = document.getElementById('test-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.sizeCanvasToWrapper(true);
    this.ctx.imageSmoothingEnabled = true;
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = this.canvas.width;
    this.maskCanvas.height = this.canvas.height;
    this.maskCtx = this.maskCanvas.getContext('2d');
  }

  generatePath() {
    if (!this.canvas) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    if (this.mode === 'practice') {
      this.path = this.buildPracticePath(width, height);
    } else {
      // Check for custom path from settings
      const customPath = window.getEyehandCustomPath ? window.getEyehandCustomPath() : null;
      if (customPath && customPath.length > 5) {
        this.path = this.buildCustomPath(customPath, width, height);
      } else {
        this.path = this.buildExamPath(width, height);
      }
    }
    this.flattenPath(); // keep path structure
  }

  buildCustomPath(customPoints, canvasWidth, canvasHeight) {
    // Custom points are stored relative to 800x450 canvas, scale to current canvas
    const scaleX = canvasWidth / 800;
    const scaleY = canvasHeight / 450;
    
    const scaledPoints = customPoints.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY
    }));
    
    // Return as simple line segments (no bezier needed for hand-drawn paths)
    return scaledPoints;
  }

  buildPracticePath(width, height) {
    const margin = 80;
    const startX = margin;
    const endX = width - margin;
    const y = height / 2;
    const segment = (endX - startX) / 4;
    return [
      { x: startX, y: y - 50 },
      { x: startX + segment, y: y + 50 },
      { x: startX + segment * 2, y: y - 50 },
      { x: startX + segment * 3, y: y + 50 },
      { x: endX, y: y - 50 }
    ];
  }

  buildExamPath(width, height) {
    const marginX = 60;
    const points = [
      // Shape 1: Elephant Trunk
      { x: marginX, y: height * 0.3 },
      { x: width * 0.15, y: height * 0.8 },
      { x: width * 0.25, y: height * 0.25 },

      // Shape 2: Keyhole
      { x: width * 0.35, y: height * 0.8 },
      { x: width * 0.45, y: height * 0.2 },

      // Shape 3: Chair/Star
      { x: width * 0.55, y: height * 0.85 },
      { x: width * 0.6, y: height * 0.15 },
      { x: width * 0.7, y: height * 0.8 },

      // Shape 4: Zig-Zag
      { x: width * 0.78, y: height * 0.2 },
      { x: width * 0.85, y: height * 0.85 },
      { x: width - marginX, y: height * 0.3 }
    ];

    const guides = [
      // Shape 1
      { t1: 0.4, t2: 0.8, vert1: 150, vert2: -180, horiz1: 20, horiz2: -30 },
      { t1: 0.2, t2: 0.6, vert1: -200, vert2: 150, horiz1: 30, horiz2: -20 },
      // Shape 2
      { t1: 0.5, t2: 0.5, vert1: 100, vert2: -220, horiz1: 0, horiz2: 0 },
      { t1: 0.4, t2: 0.8, vert1: -180, vert2: 180, horiz1: 10, horiz2: -10 },
      // Shape 3
      { t1: 0.5, t2: 0.5, vert1: 120, vert2: -200, horiz1: 0, horiz2: 0 },
      { t1: 0.3, t2: 0.7, vert1: -150, vert2: 150, horiz1: 20, horiz2: -20 },
      { t1: 0.5, t2: 0.5, vert1: 180, vert2: -120, horiz1: 0, horiz2: 0 },
      // Shape 4
      { t1: 0.4, t2: 0.6, vert1: -200, vert2: 200, horiz1: 0, horiz2: 0 },
      { t1: 0.5, t2: 0.5, vert1: 220, vert2: -220, horiz1: 0, horiz2: 0 },
      { t1: 0.3, t2: 0.7, vert1: -180, vert2: 100, horiz1: -15, horiz2: 10 }
    ];

    return this.buildCurvyPath(points, guides);
  }

  createControlPoint(base, dx, dy, t, verticalOffset = 0, horizontalOffset = 0) {
    const rawX = base.x + dx * t + horizontalOffset;
    const rawY = base.y + dy * t + verticalOffset;
    const width = this.canvas ? this.canvas.width : 0;
    const height = this.canvas ? this.canvas.height : 0;
    const margin = 50;
    const clampAxis = (value, dimension) => {
      if (!dimension) return value;
      const limit = Math.max(dimension - margin, margin);
      return Math.min(Math.max(margin, value), limit);
    };
    return {
      x: clampAxis(rawX, width),
      y: clampAxis(rawY, height)
    };
  }

  buildCurvyPath(points = [], guides = []) {
    if (!points.length) return [];
    const path = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const target = points[i];
      if (guides.length > 0 && guides[i-1]) {
        const dx = target.x - prev.x;
        const dy = target.y - prev.y;
        const guide = guides[i - 1] || {};
        const t1 = typeof guide.t1 === 'number' ? guide.t1 : 0.35;
        const t2 = typeof guide.t2 === 'number' ? guide.t2 : 0.65;
        const vert1 = typeof guide.vert1 === 'number' ? guide.vert1 : 0;
        const vert2 = typeof guide.vert2 === 'number' ? guide.vert2 : -(vert1 || 0) * 0.8;
        const horiz1 = typeof guide.horiz1 === 'number' ? guide.horiz1 : 0;
        const horiz2 = typeof guide.horiz2 === 'number' ? guide.horiz2 : -(horiz1 || 0) * 0.5;
        const cp1 = this.createControlPoint(prev, dx, dy, t1, vert1, horiz1);
        const cp2 = this.createControlPoint(prev, dx, dy, t2, vert2, horiz2);
        path.push({ type: 'bezier', cp1, cp2, end: { x: target.x, y: target.y } });
      } else {
        path.push({ x: target.x, y: target.y });
      }
    }
    return path;
  }

  seededRandom(seed) {
    let value = seed;
    return function () {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  drawPath() {
    // Replace inline drawing with render helper
    if(!this.ctx || !this.maskCtx) return;
    const res = drawFullPath({ ctx:this.ctx, maskCtx:this.maskCtx, path:this.path, pathWidth:this.pathWidth, wallWidth:this.wallWidth });
    this.endPoint = res.endPoint;
    // regenerate samples after drawing
    const samplesInfo = flattenPathSamples(this.path);
    this.samplePoints = samplesInfo.points;
    this.totalPathLength = samplesInfo.totalLength;
  }

  flattenPath(){ /* deprecated original sampler kept minimal for compatibility */ }

  isInsidePathPixel(x, y) {
    if (!this.maskCtx) return false;
    if (x < 0 || x >= this.maskCanvas.width || y < 0 || y >= this.maskCanvas.height) return false;
    const pixel = this.maskCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return pixel[0] >= 245 && pixel[1] >= 245 && pixel[2] >= 245;
  }

  getNearestPathIndex(pos) {
    if (!this.isInsidePathPixel(pos.x, pos.y)) return null;
    const searchRadius = 400;
    let bestIdx = null;
    let bestDist = Infinity;
    const startIdx = Math.max(0, this.lastInsideIndex - 50);
    const endIdx = Math.min(this.samplePoints.length - 1, this.lastInsideIndex + 800);
    for (let i = startIdx; i <= endIdx; i++) {
      const pt = this.samplePoints[i];
      const dx = pt.x - pos.x;
      const dy = pt.y - pos.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestDist > searchRadius * searchRadius) return null;
    return bestIdx;
  }

  updateProgressAccurate(pos) {
    const idx = this.getNearestPathIndex(pos);
    if (idx === null) return;
    if (idx > this.lastInsideIndex + this.maxIndexJump) {
      this.addPenalty(3, 'קפיצה קדימה לא חוקית');
      return;
    }
    if (idx > this.lastInsideIndex) {
      this.lastInsideIndex = idx;
      const percent = (this.lastInsideIndex / (this.samplePoints.length - 1)) * 100;
      this.currentProgress = Math.min(100, percent);
      this.updateStats();
    }
  }

  setupCanvasListeners() {
    if (!this.canvas || this.canvasListenersBound) return;
    this.canvas.addEventListener('mousedown', e => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', e => this.handleMouseUp(e));
    this.canvas.addEventListener('mousemove', e => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvasListenersBound = true;
  }

  handleMouseDown(e) {
    if (!this.testActive) return;
    const pos = this.getMousePos(e);
    if (!this.testStarted) {
      const start = this.path[0];
      if (!start) return;
      const dist = Math.hypot(pos.x - start.x, pos.y - start.y);
      if (dist > 20) return;
      this.testStarted = true;
      this.armTimer();
      this.toggleStartPrompt(false);
    }
    this.isMouseDown = true;
    this.lastPosition = pos;
    this.mouseUpPenaltyGiven = false;
  }

  handleMouseUp() {
    if (this.testActive && this.currentProgress < 100) {
      this.liftCount++;
      this.updateStats();
    }
    this.isMouseDown = false;
    this.lastPosition = null;
    this.isTouchingWall = false;
  }

  handleMouseLeave() {
    if (this.testActive && this.isMouseDown) {
      this.addPenalty(2, 'יציאה מהקנבס');
    }
    this.isMouseDown = false;
    this.isTouchingWall = false;
  }

  handleMouseMove(e) {
    if (!this.testActive || !this.isMouseDown) return;
    const pos = this.getMousePos(e);
    // finish detection
    if (this.endPoint) {
      const distEnd = Math.hypot(pos.x - this.endPoint.x, pos.y - this.endPoint.y);
      if (distEnd <= 20) {
        this.currentProgress = 100;
        this.updateStats();
        this.endTest();
        return;
      }
    }
    if (!this.lastPosition) {
      this.lastPosition = pos;
      return;
    }
    const from = this.lastPosition;
    const to = pos;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    if (segmentLength === 0) return;
    const SUB_SAMPLES = 20;
    let prevPoint = from;
    for (let i = 1; i <= SUB_SAMPLES; i++) {
      const t = i / SUB_SAMPLES;
      const cx = from.x + dx * t;
      const cy = from.y + dy * t;
      const cls = this.classifyPixel(cx, cy);
      const ddx = cx - prevPoint.x;
      const ddy = cy - prevPoint.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d > 0.0001) {
        if (cls === 'inside') this.insideLength += d;
        else if (cls === 'wall') this.wallLength += d;
        else if (cls === 'outside') this.outsideLength += d;
      }
      prevPoint = { x: cx, y: cy };
    }
    const insidePercent = (this.insideLength / this.totalPathLength) * 100;
    this.currentProgress = Math.min(100, insidePercent);
    if (this.currentProgress >= 99.5) {
      this.currentProgress = 100;
      this.updateStats();
      this.endTest();
    } else {
      this.updateStats();
    }
    // Replace this.drawTrail with helper
    this.drawTrail(this.lastPosition, pos);
    this.lastPosition = pos;
  }

  classifyPixel(x, y) {
    if (this.isInsidePathPixel(x, y)) return 'inside';
    if (this.isWallPixel(x, y)) return 'wall';
    return 'outside';
  }

  isWallPixel(x, y) {
    if (!this.maskCtx) return false;
    if (x < 0 || x >= this.maskCanvas.width || y < 0 || y >= this.maskCanvas.height) return false;
    const pixel = this.maskCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return pixel[0] >= 110 && pixel[0] <= 125 && pixel[1] >= 110 && pixel[1] <= 125 && pixel[2] >= 110 && pixel[2] <= 125;
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  drawTrail(from,to){ drawTrailSegment(this.ctx, from, to, this.trailWidth); }

  addPenalty(points = 1, reason = '') {
    // deprecated placeholder
    console.log('(deprecated addPenalty) ' + points + ': ' + reason);
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      const remaining = Math.max(0, this.activeDurationMs - elapsed);
      this.updateTimerDisplays(remaining / 1000);
      if (remaining <= 0) this.endTest();
    }, 100);
    this.timerRunning = true;
  }

  armTimer(){
    if (this.timerRunning) return;
    this.startTime = Date.now();
    this.startTimer();
  }

  endTest() {
    if (!this.testActive) return;
    this.testActive = false;
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerRunning = false;
    if (this.mode === 'practice') {
      this.handlePracticeFinish();
      return;
    }
    this.showResults();
  }

  updateStats() {
    const scaleRange = window.getGlobalScale ? window.getGlobalScale() : {min:1,max:7};
    const scores = computeEyeHandScores({
      insideLength:this.insideLength,
      wallLength:this.wallLength,
      outsideLength:this.outsideLength,
      totalPathLength:this.totalPathLength,
      liftCount:this.liftCount,
      wallFactor:this.wallFactor,
      outsideFactor:this.outsideFactor,
      liftFactor:this.liftFactor
    }, scaleRange);
    this.currentProgress = Math.min(100, scores.insidePercent);
    this.penalties = Math.max(0, Math.floor(scores.wallPenaltyPercent + scores.outsidePenaltyPercent + scores.liftPenaltyPercent));
    const progressEl=document.getElementById('progress'); if(progressEl) progressEl.textContent=Math.floor(this.currentProgress)+'%';
    const penaltiesEl=document.getElementById('penalties'); if(penaltiesEl) penaltiesEl.textContent=this.penalties;
    const scoreEl=document.getElementById('current-score'); if(scoreEl && !(window.testAuth && !window.testAuth.isAdmin())) scoreEl.textContent=scores.scaled.toFixed(2);
  }

  showResults() {
    this.clearCountdown();
    this.detachCanvasResizeHandler();
    this.releaseHudWidgets();
    const scaleRange = window.getGlobalScale ? window.getGlobalScale() : {min:1,max:7};
    const scores = computeEyeHandScores({
      insideLength:this.insideLength,
      wallLength:this.wallLength,
      outsideLength:this.outsideLength,
      totalPathLength:this.totalPathLength,
      liftCount:this.liftCount,
      wallFactor:this.wallFactor,
      outsideFactor:this.outsideFactor,
      liftFactor:this.liftFactor
    }, scaleRange);
    // send to central registry
    if(window.testsCore){ window.testsCore.completeTest('eyehand', scores.finalRaw, scores.scaled, {lifts:this.liftCount, wallPercent:scores.wallPercent, outsidePercent:scores.outsidePercent}); }
    const elapsed = this.startTime ? (Date.now()-this.startTime)/1000 : (this.activeDurationMs/1000);
    if(window.testAuth){ window.testAuth.showTestCompleteModal('eyehand', scores.scaled.toFixed(2)); }
    if(window.testAuth && !window.testAuth.isAdmin()){
      const fs=document.querySelector('#results-screen .final-score-box'); if(fs) fs.style.display='none';
      const rd=document.querySelector('#results-screen .results-details'); if(rd) rd.style.display='none';
    } else {
      const finalScoreEl=document.getElementById('final-score'); if(finalScoreEl) finalScoreEl.textContent=scores.scaled.toFixed(2);
      const resultProgressEl=document.getElementById('result-progress'); if(resultProgressEl) resultProgressEl.textContent=Math.floor(scores.insidePercent)+'%';
      const resultPenaltiesEl=document.getElementById('result-penalties'); if(resultPenaltiesEl) resultPenaltiesEl.textContent=Math.floor(scores.wallPenaltyPercent + scores.outsidePenaltyPercent + scores.liftPenaltyPercent);
      const resultTimeEl=document.getElementById('result-time'); if(resultTimeEl) resultTimeEl.textContent=elapsed.toFixed(1)+' שניות';
      const finalRaw=scores.finalRaw; let rating='';
      if(finalRaw>=90) rating='🏆 מצוין'; else if(finalRaw>=75) rating='⭐ טוב מאוד'; else if(finalRaw>=60) rating='👍 טוב'; else if(finalRaw>=45) rating='✓ בסדר'; else rating='💪 נסה שוב';
      const ratingEl=document.getElementById('result-rating'); if(ratingEl) ratingEl.textContent=rating;
    }
    this.exitFullscreen();
    this.switchScreen('results-screen');
  }

  retryTest() {
    this.resetTest();
    this.showTestScreen();
  }

  newPathTest() {
    this.pathSeed = Date.now();
    this.resetTest();
    this.showTestScreen();
  }

  resetTest(){
    // after reset re-load config to apply updated admin values
    this.reloadConfig();
    this.resetRunState();
    const progressEl = document.getElementById('progress'); if (progressEl) progressEl.textContent = '0%';
    const penaltiesEl = document.getElementById('penalties'); if (penaltiesEl) penaltiesEl.textContent = '0';
    const scoreEl = document.getElementById('current-score'); if (scoreEl) scoreEl.textContent = '0';
  }

  switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  if(window.testsCore) window.testsCore.registerTest('eyehand',{title:'תיאום עין-יד'});
  window.eyeHandTest = new EyeHandTest();
  window.eyeHandTest.init();
});