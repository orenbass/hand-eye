// Reaction Time Test Module (refactored to use modular helpers)
import { clamp, mean, stddev } from './reaction.utils.js';
import { getReactionConfig } from './reaction.config.js';
import { computeReactionRawScore, scaleReactionScore } from './reaction.scoring.js';

(function(){
    // הגדרות קושי וצורות
    const SHAPES_BY_DIFF = { easy:['square'], medium:['square','circle'], hard:['square','circle','triangle'] };
    const VISIBLE_COLORS = ['#ff3131','#1e88ff','#ffd400','#9d4edd','#ff7f11','#00b341','#ff4fa3','#00d5ff'];
    class ReactionTest {
        constructor(){
            const cfg = getReactionConfig();
            this.difficulty = cfg.difficulty;
            this.shapes = SHAPES_BY_DIFF[this.difficulty];
            this.shapeDisplaySec = cfg.shapeDisplaySec;
            this.targetGoal = cfg.targetGoal;
            this.durationSec = cfg.durationSec; // set later again on start to recalc if changed dynamically
            this.targetCount = 0;
            this.patternIndex = 0;
            this.patternLength = this.targetGoal*2 - 1;
            this.gapRemaining = 0;
            this.firstShown = false;
            this.startTimeMs = 0;
            this.times = []; this.mistakes = 0; this.missedTargets = 0;
            this.targetActive=false; this.targetClicked=false; this.currentStimStart=0; this.intervalId=null;
            this.state='idle';
            // DOM refs
            this.area=document.getElementById('reaction-area');
            this.statusEl=document.getElementById('reaction-status');
            this.statsBox=document.getElementById('reaction-stats');
            this.attemptEl=document.getElementById('reaction-attempt');
            this.lastEl=document.getElementById('reaction-last');
            this.avgEl=document.getElementById('reaction-avg');
            this.stdEl=document.getElementById('reaction-std');
            this.mistakesEl=document.getElementById('reaction-mistakes');
            this.missedEl=document.getElementById('reaction-missed');
            this.timerEl=document.getElementById('reaction-timer');
            this.scoreBox=document.getElementById('reaction-score-box');
            this.scoreValue=document.getElementById('reaction-score-value');
            this.countdownEl=document.getElementById('reaction-countdown');
            this.stage='idle'; // idle | practice | countdown | real | done
            this.practiceDone=false;
            this.countdownTimer=null;
            this.countdownRemaining=0;
            this.activeMode=null; // practice | real
            this._onResize=null; this._keyHandler=null;
            this.lockToken=null;
            this.practiceModalEl=null;
            this.prePracticeShown=false;
            this.bind();
        }
        bind(){
            const startBtn=document.getElementById('start-reaction-button');
            if(startBtn) {
                startBtn.addEventListener('click', async ()=> {
                    // Show loading state
                    const originalText = startBtn.textContent;
                    startBtn.disabled = true;
                    startBtn.textContent = 'טוען הגדרות...';
                    
                    // Fetch test-specific settings from server
                    if(window.refreshTestSettings){
                        try {
                            console.log('[reaction] 🔄 מוריד הגדרות ספציפיות למבחן זמן תגובה...');
                            const fetchPromise = window.refreshTestSettings('reaction', { force: true });
                            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 5000));
                            const result = await Promise.race([fetchPromise, timeoutPromise]);
                            if(result && result.applied){
                                console.log('[reaction] ✅ הגדרות ספציפיות הורדו בהצלחה', result.payload);
                            } else if(result && result.timeout){
                                console.warn('[reaction] ⏱️ Timeout - משתמש בהגדרות מקומיות');
                            } else if(result && result.reason){
                                console.log('[reaction] ℹ️ לא נמצאו הגדרות ספציפיות:', result.reason);
                            }
                        } catch(e){
                            console.warn('[reaction] ❌ שגיאה בהורדת הגדרות ספציפיות', e);
                        }
                    } else {
                        console.log('[reaction] ⚠️ פונקציית refreshTestSettings לא זמינה');
                    }
                    
                    // Restore button
                    startBtn.disabled = false;
                    startBtn.textContent = originalText;
                    
                    // Load config to check practiceEnabled
                    const cfg = getReactionConfig();
                    const practiceEnabled = cfg.practiceEnabled !== false;
                    if (practiceEnabled && !this.prePracticeShown) {
                        this.prePracticeShown = true;
                        this.showPrePracticeModal(() => this.startPractice());
                    } else {
                        this.startPractice();
                    }
                });
            }
            if(this.area){ this.area.style.pointerEvents='none'; }

            // Attach HUDs to slots
            const practiceSlot = document.getElementById('reaction-practice-slot');
            if(practiceSlot && window.practiceBanner){
                window.practiceBanner.attach(practiceSlot);
            }
            const timerSlot = document.getElementById('reaction-timer-slot');
            if(timerSlot && window.timerHUD){
                window.timerHUD.attach(timerSlot);
            }
        }
        refreshDOM(){
            this.area=document.getElementById('reaction-area');
            this.statusEl=document.getElementById('reaction-status');
            this.statsBox=document.getElementById('reaction-stats');
            this.attemptEl=document.getElementById('reaction-attempt');
            this.lastEl=document.getElementById('reaction-last');
            this.avgEl=document.getElementById('reaction-avg');
            this.stdEl=document.getElementById('reaction-std');
            this.mistakesEl=document.getElementById('reaction-mistakes');
            this.missedEl=document.getElementById('reaction-missed');
            this.timerEl=document.getElementById('reaction-timer');
            this.scoreBox=document.getElementById('reaction-score-box');
            this.scoreValue=document.getElementById('reaction-score-value');
            this.countdownEl=document.getElementById('reaction-countdown');
        }
        attachHUDs(){
            const practiceSlot = document.getElementById('reaction-practice-slot');
            if(practiceSlot && window.practiceBanner){
                window.practiceBanner.attach(practiceSlot);
            }
            const timerSlot = document.getElementById('reaction-timer-slot');
            if(timerSlot && window.timerHUD){
                window.timerHUD.attach(timerSlot);
            }
        }
        ensurePracticeModal(){
            if(this.practiceModalEl) return this.practiceModalEl;
            const overlay=document.createElement('div');
            overlay.id='reaction-practice-modal';
            overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:15000;display:none;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML=`
              <div style="max-width:520px;width:100%;background:#ffffff;color:#0f172a;border-radius:20px;padding:32px;box-shadow:0 25px 55px rgba(15,23,42,0.45);text-align:center;">
                <div style="font-size:2.6rem;margin-bottom:12px">⚡</div>
                <h2 style="margin:0 0 12px;font-size:1.45rem;">התרגול הסתיים</h2>
                <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
                  בלחיצה על הכפתור הבא <strong>המבחן האמיתי יתחיל מיד</strong>. התוצאה הקרובה תישמר לציון הרשמי, לכן ודא שאתה מוכן לפני שממשיכים.
                </p>
                <button type="button" data-action="confirm" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">הבנתי – להתחיל מבחן אמיתי</button>
              </div>`;
            document.body.appendChild(overlay);
            this.practiceModalEl=overlay;
            return overlay;
        }
        showPracticeModal(onContinue){
            const modal=this.ensurePracticeModal();
            const contentBox = modal.querySelector('div');
            contentBox.innerHTML = `
                <div style="font-size:2.6rem;margin-bottom:12px">⚡</div>
        <h2 style="margin:0 0 12px;font-size:1.45rem;">התרגול הסתיים</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
          בלחיצה על  <strong>הבנתי- להתחיל את המבחן האמיתי</strong>. יתחיל המבחן האמיתי מיד. הציון הבא ייחשב כציון הרשמי.
ודא שאתה מוכן לפני המעבר למבחן.
        </p>
        <button type="button" data-action="confirm" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">הבנתי – להתחיל מבחן אמיתי</button>
    `;
            modal.style.display='flex';
            const confirmBtn=modal.querySelector('[data-action="confirm"]');
            if(confirmBtn){
                confirmBtn.onclick=()=>{
                    // Use config for countdown duration
                    const cfg = getReactionConfig();
                    const countdownSec = (typeof cfg.examCountdownSec === 'number') ? cfg.examCountdownSec : 5;

                    if (countdownSec > 0) {
                        let remaining = countdownSec;
                        contentBox.innerHTML = `
                            <div style="font-size:4rem;margin-bottom:16px;font-weight:800;color:#0ea5e9;line-height:1" id="reaction-modal-countdown">${remaining}</div>
                            <h2 style="margin:0 0 8px;font-size:1.5rem;">המבחן מתחיל בעוד...</h2>
                            <p style="color:#64748b;margin:0">נא להתכונן</p>
                        `;
                        
                        const timer = setInterval(() => {
                            remaining--;
                            const el = document.getElementById('reaction-modal-countdown');
                            if(el) el.textContent = remaining;
                            
                            if (remaining <= 0) {
                                clearInterval(timer);
                                modal.style.display = 'none';
                                if(typeof onContinue==='function') onContinue();
                            }
                        }, 1000);
                    } else {
                        modal.style.display='none';
                        if(typeof onContinue==='function') onContinue();
                    }
                };
            }
        }
        showPrePracticeModal(onStart){
            const modal=this.ensurePracticeModal();
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
        getInteractionOptions(mode){
            return {
                allowedKeys:['space'],
                allowedMouseButtons:[0],
                allowWheel:false,
                allowContextMenu:false,
                allowTouchScroll:false,
                allowSelection:false
            };
        }
        applyInteractionLock(mode){
            if(window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin()) return;
            if(!(window.testsCore && window.testsCore.lockInteractions)) return;
            const opts=this.getInteractionOptions(mode);
            if(!opts) return;
            if(this.lockToken){
                window.testsCore.updateInteractionLock(this.lockToken, opts);
            } else {
                this.lockToken=window.testsCore.lockInteractions(opts);
            }
        }
        releaseInteractionLock(){
            if(this.lockToken && window.testsCore && window.testsCore.unlockInteractions){
                window.testsCore.unlockInteractions(this.lockToken);
                this.lockToken=null;
            }
        }
        setBanner(text,mode){
            // Use global practice banner for consistent UI
            if(!window.practiceBanner) return;
            if(!text){
                window.practiceBanner.hide();
                return;
            }
            const labels = {
                'practice': 'מצב תרגול',
                'countdown': 'ספירה לאחור',
                'real': 'מבחן אמיתי',
                'done': 'הסתיים'
            };
            const descriptions = {
                'practice': 'התוצאות אינן נשמרות',
                'countdown': 'המבחן האמיתי עומד להתחיל',
                'real': 'התוצאות נשמרות',
                'done': ''
            };
            window.practiceBanner.show({
                label: labels[mode] || text,
                description: descriptions[mode] || '',
                mode: mode || 'practice'
            });
        }
        setCountdown(text){
            if(!this.countdownEl) return;
            if(text){
                this.countdownEl.style.display='block';
                this.countdownEl.textContent=text;
            } else {
                this.countdownEl.style.display='none';
                this.countdownEl.textContent='';
            }
        }
        clearCountdown(){
            if(this.countdownTimer){
                clearInterval(this.countdownTimer);
                this.countdownTimer=null;
            }
        }
        setStatus(text, tone='info'){
            if(!this.statusEl) return;
            this.statusEl.textContent=text||'';
            this.statusEl.setAttribute('data-tone', tone);
        }
        updateStatsVisibility(){
            if(!this.statsBox) return;
            const admin = this.isAdmin();
            if(this.stage==='real' && admin){
                this.statsBox.style.display='block';
                if(this.scoreBox) this.scoreBox.style.display='block';
            } else if(this.stage==='real' && !admin){
                this.statsBox.style.display='none';
                if(this.scoreBox) this.scoreBox.style.display='none';
            } else {
                this.statsBox.style.display='none';
                if(this.scoreBox) this.scoreBox.style.display='none';
            }
        }
        teardownRun(){
            if(this.intervalId){ clearInterval(this.intervalId); this.intervalId=null; }
            if(window.timerHUD) window.timerHUD.hide();
            if(this._onResize){ window.removeEventListener('resize', this._onResize); this._onResize=null; }
            if(this._keyHandler){ document.removeEventListener('keydown', this._keyHandler); this._keyHandler=null; }
            if(this.area){
                this.area.innerHTML='';
                this.area.style.pointerEvents='auto';
                this.area.style.cursor='default';
            }
            this.releaseInteractionLock();
        }
        updateStageAttribute(){
            const wrapper = document.querySelector('.reaction-layout-wrapper');
            if(wrapper){
                wrapper.setAttribute('data-stage', this.stage);
            }
        }
        startPractice(){
            if(this.stage==='real' || this.stage==='countdown' || this.stage==='done') return;
            if(this.stage==='practice' && !this.practiceDone) return;
            
            this.refreshDOM();
            this.attachHUDs();

            if(window.enterFullscreenMode) window.enterFullscreenMode();
            this.stage='practice';
            this.updateStageAttribute();
            this.practiceDone=false;
            this.activeMode='practice';
            this.setBanner('תרגול - התוצאות אינן נשמרות', 'practice');
            this.setCountdown(null);
            this.clearCountdown();
            this.setStatus('יש להגיב לריבועים הירוקים בלחיצה על מקש הרווח', 'muted');
            this.updateStatsVisibility();
            this.startSeries('practice');
        }

        _runPracticeStartLogic() {
            // Deprecated - logic moved back to startPractice
        }
        finishPractice(options={}){
            const { skipMessage=false, keepFullscreen=true } = options;
            this.stage='practice';
            this.updateStageAttribute();
            this.practiceDone=true;
            this.activeMode=null;
            this.setCountdown(null);
            this.clearCountdown();
            this.updateStatsVisibility();
            this.setBanner(null); // Hide banner
            if(!keepFullscreen && window.exitFullscreenMode) window.exitFullscreenMode();
            // Show practice end modal
            if(!skipMessage){
                this.setStatus('', 'muted');
                // Direct to startRealTest after modal countdown
                this.showPracticeModal(()=>this.startRealTest());
            }
        }
        startRealCountdown(){
            // Deprecated - logic moved to showPracticeModal
            this.startRealTest();
        }
        startRealTest(){
            this.refreshDOM();
            this.attachHUDs();
            this.clearCountdown();
            this.setCountdown(null);
            this.stage='real';
            this.updateStageAttribute();
            this.activeMode='real';
            this.setBanner('מבחן אמיתי - התוצאות נשמרות', 'real');
            this.setStatus('יש להגיב לריבועים הירוקים בלחיצה על מקש הרווח', 'muted');
            this.updateStatsVisibility();
            this.startSeries('real');
        }
        resetRunState(cfg){
            if(cfg){
                this.difficulty = cfg.difficulty;
                this.shapes = SHAPES_BY_DIFF[this.difficulty];
                this.shapeDisplaySec = cfg.shapeDisplaySec;
                // לא לדרוס durationSec כאן - זה נקבע ב-startSeries לפי mode
                this.targetGoal = cfg.targetGoal;
            }
            this.targetCount = 0;
            this.patternIndex = 0;
            this.patternLength = Math.max(1, (this.targetGoal*2) - 1);
            this.gapRemaining = Math.floor(Math.random()*3)+1;
            this.firstShown = false;
            this.consecutiveTargets = 0; // מונה ריבועים ירוקים רצופים
            this.stimulusCount = 0; // מונה כל הצורות שהוצגו
            this.times = [];
            this.mistakes = 0;
            this.missedTargets = 0;
            this.targetActive = false;
            this.targetClicked = false;
            this.state = 'idle';
            if(this.attemptEl) this.attemptEl.textContent='0/'+this.targetGoal;
            if(this.lastEl) this.lastEl.textContent='-';
            if(this.avgEl) this.avgEl.textContent='-';
            if(this.stdEl) this.stdEl.textContent='-';
            if(this.scoreValue) this.scoreValue.textContent='-';
        }
        isAdmin(){ return window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin(); }
        updateAreaSize(){
            if(!this.area) return;
            
            // Calculate available space based on the wrapper to avoid feedback loops
            const wrapper = document.querySelector('.reaction-layout-wrapper');
            let w, h;

            if (wrapper) {
                const header = wrapper.querySelector('.orientation-header-row');
                const footer = wrapper.querySelector('.orientation-footer-row');
                
                let availW = wrapper.clientWidth;
                let availH = wrapper.clientHeight;
                
                if(header) availH -= header.offsetHeight;
                if(footer) availH -= footer.offsetHeight;
                
                // Use 95% of available space
                w = Math.floor(availW * 0.95);
                h = Math.floor(availH * 0.95);
            } else {
                // Fallback if wrapper not found
                w = Math.floor(window.innerWidth * 0.9);
                h = Math.floor(window.innerHeight * 0.7);
            }

            this.area.style.width = w + 'px';
            this.area.style.height = h + 'px';
            this.area.style.maxWidth = w + 'px';
            this.area.style.maxHeight = h + 'px';
            this.area.style.margin = '0 auto';
            this.area.style.position='relative';
            this.area.style.boxSizing='border-box';
            this.area.style.border='3px solid var(--accent-primary)';
            this.area.style.borderRadius='16px';
            this.area.style.padding='10px';
            this.area.style.overflow='hidden';
            this.area.style.background='rgba(15,23,42,0.85)';
        }
        startSeries(mode='real'){
            if(mode!=='practice' && mode!=='real') mode='real';
            if (window.enterFullscreenMode) window.enterFullscreenMode();
            // Load fresh config on each start (dynamic admin changes)
            const cfg = getReactionConfig();
            console.log('[reaction] startSeries mode:', mode, 'cfg:', JSON.stringify(cfg));
            this.difficulty = cfg.difficulty;
            this.shapes = SHAPES_BY_DIFF[this.difficulty];
            this.shapeDisplaySec = cfg.shapeDisplaySec;
            // קביעת זמן לפי מצב - תרגול או מבחן אמיתי
            if(mode === 'practice'){
                // בתרגול: השתמש ב-practiceDurationMs אם קיים, אחרת fallback ל-20 שניות
                this.durationSec = (cfg.practiceDurationMs && cfg.practiceDurationMs > 0) 
                    ? cfg.practiceDurationMs / 1000 
                    : 20;
            } else {
                this.durationSec = cfg.durationSec;
            }
            console.log('[reaction] durationSec set to:', this.durationSec, 'for mode:', mode);
            this.targetGoal = cfg.targetGoal;
            this.resetRunState(cfg);
            this.activeMode = mode;
            this.state='run';
            this.stage = mode==='practice' ? 'practice' : 'real';
            this.updateStatsVisibility();
            this.startTimeMs = performance.now();
            
            if(window.timerHUD){
                if(mode === 'real'){
                    window.timerHUD.hide();
                } else {
                    window.timerHUD.show('זמן נותר', '00:00', mode);
                }
            }

            this.updateAreaSize();
            this._onResize=()=>{ if(this.state==='run'){ this.updateAreaSize(); } };
            window.addEventListener('resize', this._onResize);
            this.intervalId && clearInterval(this.intervalId);
            if(this.area && !this.area.querySelector('.shape-stage')){
                const stage=document.createElement('div');
                stage.className='shape-stage';
                stage.style.position='absolute';
                stage.style.inset='0';
                stage.style.pointerEvents='none';
                this.area.appendChild(stage);
            }
            this.applyInteractionLock(mode);
            this.nextStimulus(true);
                        this.intervalId = setInterval(()=>{ if(this.state==='run') this.nextStimulus(false); }, Math.max(50,this.shapeDisplaySec*1000));
            this.area.className='reaction-area';
            if(this.area){ this.area.style.pointerEvents='none'; this.area.style.cursor='none'; }
            this._keyHandler = (e)=>{ if(e.code==='Space'){ e.preventDefault(); this.handleSpacePress(); } };
            document.addEventListener('keydown', this._keyHandler, {passive:false});
        }
        safeColor(allowGreen){
            if(!this.area) return '#ff3131';
            const areaBg = getComputedStyle(this.area).backgroundColor.toLowerCase();
            const bgVariants = [areaBg,'#0f172a','rgb(15, 23, 42)','rgba(15,23,42,0.85)','rgba(15, 23, 42, 0.85)'];
            let pool = VISIBLE_COLORS.slice();
            if(!allowGreen){ pool = pool.filter(c=> c!=='#00b341' && c!=='green'); }
            pool = pool.filter(c=> !bgVariants.includes(c.toLowerCase()) && c.toLowerCase()!=='transparent');
            function luminance(hex){
                const h = hex.replace('#',''); if(h.length!==6) return 0.5;
                const r=parseInt(h.substring(0,2),16)/255;
                const g=parseInt(h.substring(2,4),16)/255;
                const b=parseInt(h.substring(4,6),16)/255;
                const a=[r,g,b].map(v=> v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4));
                return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
            }
            const bgLum = luminance('#0f172a');
            pool = pool.filter(c=> luminance(c) > bgLum + 0.1);
            if(!pool.length){ pool=['#ff3131','#ffd400']; }
            return pool[Math.floor(Math.random()*pool.length)];
        }
        nextStimulus(initial){
            if(this.state!=='run') return;
            const now = performance.now();
            const elapsed = (now-this.startTimeMs)/1000;

            if(window.timerHUD && this.activeMode !== 'real'){
                const remaining = Math.max(0, this.durationSec - elapsed);
                const m = Math.floor(remaining / 60).toString().padStart(2, '0');
                const s = Math.floor(remaining % 60).toString().padStart(2, '0');
                window.timerHUD.update(`${m}:${s}`);
            }

            if(this.targetActive && !this.targetClicked && !initial){ this.missedTargets++; }
            // סיום: אם הזמן נגמר או הגענו ליעד
            if(elapsed >= this.durationSec || this.targetCount >= this.targetGoal){ this.finish(); return; }
            
            this.stimulusCount++;
            let shape, color, isTarget=false;
            
            if(this.targetCount < this.targetGoal){
                const isHardMode = this.difficulty === 'hard';
                
                // חישוב פיזור ריבועים ירוקים לאורך כל המבחן
                const totalStimuli = Math.floor(this.durationSec / this.shapeDisplaySec);
                const remainingTargets = this.targetGoal - this.targetCount;
                const remainingStimuli = Math.max(1, totalStimuli - this.stimulusCount);
                
                // הסתברות דינמית - מתאימה את עצמה כדי לפזר את המטרות
                const baseChance = remainingTargets / remainingStimuli;
                
                // בדיקה אם חייבים להציג מטרה (אחרת לא נספיק)
                const mustShowTarget = remainingTargets >= remainingStimuli;
                
                // בדיקה אם אסור להציג מטרה (יותר מ-2 רצופים)
                const tooManyConsecutive = this.consecutiveTargets >= 2;
                
                // הצורה הראשונה לעולם לא מטרה
                if(!this.firstShown && this.targetCount === 0){
                    shape = this.shapes[Math.floor(Math.random() * this.shapes.length)];
                    color = this.safeColor(false);
                    this.firstShown = true;
                    this.consecutiveTargets = 0;
                } 
                // אם יש כבר 2 רצופים - חייבים הפסקה
                else if(tooManyConsecutive){
                    if(isHardMode && Math.random() < 0.5){
                        // במצב קשה: 50% סיכוי לצורה ירוקה שאינה ריבוע (מבלבל)
                        const nonSquareShapes = this.shapes.filter(s => s !== 'square');
                        shape = nonSquareShapes.length > 0 
                            ? nonSquareShapes[Math.floor(Math.random() * nonSquareShapes.length)]
                            : 'circle';
                        color = '#00b341'; // ירוק אבל לא ריבוע!
                    } else {
                        shape = this.shapes[Math.floor(Math.random() * this.shapes.length)];
                        if(shape === 'square'){ 
                            color = this.safeColor(false); 
                        } else { 
                            color = this.safeColor(true); 
                        }
                    }
                    this.consecutiveTargets = 0;
                }
                // אם חייבים להציג מטרה כדי להספיק
                else if(mustShowTarget){
                    shape = 'square'; 
                    color = '#00b341'; 
                    isTarget = true;
                    this.targetCount++; 
                    this.currentStimStart = now;
                    this.consecutiveTargets++;
                }
                // החלטה רגילה לפי הסתברות
                else {
                    // התאמת הסתברות עם קצת אקראיות
                    const adjustedChance = Math.min(0.6, Math.max(0.15, baseChance + (Math.random() - 0.5) * 0.1));
                    
                    if(Math.random() < adjustedChance){
                        // מטרה - ריבוע ירוק
                        shape = 'square'; 
                        color = '#00b341'; 
                        isTarget = true;
                        this.targetCount++; 
                        this.currentStimStart = now;
                        this.consecutiveTargets++;
                    } else {
                        // לא מטרה
                        if(isHardMode && Math.random() < 0.4){
                            // במצב קשה: 40% סיכוי לצורה ירוקה שאינה ריבוע
                            const nonSquareShapes = this.shapes.filter(s => s !== 'square');
                            shape = nonSquareShapes.length > 0 
                                ? nonSquareShapes[Math.floor(Math.random() * nonSquareShapes.length)]
                                : 'circle';
                            color = '#00b341'; // ירוק אבל לא ריבוע!
                        } else {
                            shape = this.shapes[Math.floor(Math.random() * this.shapes.length)];
                            if(shape === 'square'){ 
                                color = this.safeColor(false); 
                            } else { 
                                color = this.safeColor(true); 
                            }
                        }
                        this.consecutiveTargets = 0;
                    }
                }
            } else {
                // כבר הגענו ליעד - רק צורות שאינן מטרות
                shape = this.shapes[Math.floor(Math.random() * this.shapes.length)];
                if(shape === 'square'){ 
                    color = this.safeColor(false); 
                } else { 
                    color = this.safeColor(true); 
                }
                if(shape === 'square' && (color === '#00b341' || color === 'green')){ 
                    color = this.safeColor(false); 
                }
                this.consecutiveTargets = 0;
            }
            this.firstShown=true;
            this.targetActive = isTarget;
            this.targetClicked = false;
            this.renderStimulus(shape,color);
            this.updateStats();
        }
        renderStimulus(shape,color){
            if(!this.area) return;
            this.updateAreaSize();
            const stage = this.area.querySelector('.shape-stage');
            if(!stage){ console.warn('[reaction] missing stage'); return; }
            const prev = stage.lastElementChild;
            const size = 110;
            const areaBg = getComputedStyle(this.area).backgroundColor.toLowerCase();
            if(!color || color.toLowerCase()==='transparent' || color.toLowerCase()==='inherit' || color.toLowerCase()===areaBg){
                color=this.safeColor(shape!=='square');
            }
            if(!color){ color='#ff3131'; }
            const padding = parseInt(getComputedStyle(this.area).paddingLeft)||10;
            const innerW = this.area.clientWidth - padding*2;
            const innerH = this.area.clientHeight - padding*2;
            const wrapper=document.createElement('div');
            wrapper.className='stim-wrapper';
            wrapper.style.position='absolute';
            wrapper.style.width=size+'px';
            wrapper.style.height=size+'px';
            let shapeW=size, shapeH=size;
            if(shape==='triangle'){ shapeW=size; shapeH=size; }
            if(this.difficulty==='hard'){
                const maxX=Math.max(0, innerW-shapeW);
                const maxY=Math.max(0, innerH-shapeH);
                const x=Math.random()*maxX;
                const y=Math.random()*maxY;
                wrapper.style.left=(x+padding)+'px';
                wrapper.style.top=(y+padding)+'px';
            } else {
                wrapper.style.left=(padding + (innerW-shapeW)/2)+'px';
                wrapper.style.top=(padding + (innerH-shapeH)/2)+'px';
            }
            let el=document.createElement('div');
            el.setAttribute('data-shape',shape);
            el.style.width='100%';
            el.style.height='100%';
            if(shape==='square'){ el.style.background=color; el.style.borderRadius='8px'; }
            else if(shape==='circle'){ el.style.background=color; el.style.borderRadius='50%'; }
            else if(shape==='triangle'){
                el.style.width='0'; el.style.height='0'; el.style.margin='0 auto';
                el.style.borderLeft=(size/2)+'px solid transparent';
                el.style.borderRight=(size/2)+'px solid transparent';
                el.style.borderBottom=size+'px solid '+color;
            }
            el.style.boxShadow='0 0 14px rgba(0,0,0,0.35)';
            wrapper.appendChild(el);
            stage.appendChild(wrapper);
            if(prev){ prev.remove(); }
            requestAnimationFrame(()=>{
                const br=wrapper.getBoundingClientRect();
                if(br.width<5 || br.height<5){
                    console.warn('[reaction] fallback render');
                    stage.innerHTML='';
                    const fb=document.createElement('div');
                    fb.style.position='absolute';
                    fb.style.left=(padding + (innerW-size)/2)+'px';
                    fb.style.top=(padding + (innerH-size)/2)+'px';
                    fb.style.width=size+'px'; fb.style.height=size+'px';
                    fb.style.background='#ff3131'; fb.style.borderRadius='10px';
                    fb.style.boxShadow='0 0 14px rgba(0,0,0,0.35)';
                    stage.appendChild(fb);
                }
            });
            if(window.DEBUG_REACTION){ console.log('[reaction] render', {shape,color,innerW,innerH}); }
        }
        handleSpacePress(){
            if(this.state!=='run') return;
            const isCorrect = this.targetActive && !this.targetClicked;
            
            if(this.targetActive){
                if(!this.targetClicked){
                    const rt = performance.now()-this.currentStimStart; this.times.push(rt); this.targetClicked=true;
                } else { this.mistakes++; }
            } else { this.mistakes++; }
            
            // חיווי ויזואלי רק במצב תרגול
            if(this.activeMode === 'practice' && this.area){
                this.flashBorder(isCorrect ? '#00b341' : '#ef4444');
            }
            
            this.updateStats();
        }
        
        // הבהוב מסגרת לחיווי
        flashBorder(color){
            if(!this.area) return;
            const originalBorder = this.area.style.border;
            this.area.style.border = `4px solid ${color}`;
            this.area.style.boxShadow = `0 0 20px ${color}, inset 0 0 10px ${color}40`;
            setTimeout(() => {
                if(this.area){
                    this.area.style.border = originalBorder || '3px solid var(--accent-primary)';
                    this.area.style.boxShadow = '';
                }
            }, 300);
        }
        
        finish(){
            const wasPractice = this.activeMode==='practice';
            this.state='done';
            if(this.targetActive && !this.targetClicked){ this.missedTargets++; }
            this.teardownRun();
            if(window.timerHUD) window.timerHUD.hide();
            if(wasPractice){
                this.finishPractice();
                return;
            }
            this.stage='done';
            const rawScore = computeReactionRawScore(this.mistakes, this.missedTargets, this.patternLength, this.durationSec, this.shapeDisplaySec, this.targetGoal);
            const scaleRange = window.getGlobalScale ? window.getGlobalScale() : {min:1,max:7};
            const scaled = scaleReactionScore(rawScore, scaleRange);
            if(window.testsCore){ window.testsCore.completeTest('reaction', rawScore, scaled, {mistakes:this.mistakes, missed:this.missedTargets}); }
            if(this.isAdmin() && this.scoreValue){ this.scoreValue.textContent=scaled.toFixed(2); }
            if (window.exitFullscreenMode) window.exitFullscreenMode();
            if (window.testAuth) { window.testAuth.showTestCompleteModal('reaction', scaled.toFixed(2)); }
            this.setBanner('המבחן האמיתי הסתיים', 'done');
            this.setCountdown(null);
            this.updateStageAttribute();
            this.setStatus('המבחן הסתיים.', 'success');
        }
        updateStats(){
            if(!this.isAdmin()) return;
            if(this.attemptEl) this.attemptEl.textContent=this.targetCount+'/'+this.targetGoal;
            if(this.mistakesEl) this.mistakesEl.textContent=this.mistakes;
            if(this.missedEl) this.missedEl.textContent=this.missedTargets;
            if(this.lastEl) this.lastEl.textContent=this.times.length?this.times[this.times.length-1].toFixed(0)+'ms':'-';
            const avg=mean(this.times); const sd=stddev(this.times);
            if(this.avgEl) this.avgEl.textContent=this.times.length?avg.toFixed(0)+'ms':'-';
            if(this.stdEl) this.stdEl.textContent=this.times.length?sd.toFixed(0)+'ms':'-';
            // עדכון זמן
            if(this.timerEl && this.state === 'run'){
                const elapsed = (performance.now() - this.startTimeMs) / 1000;
                const remaining = Math.max(0, this.durationSec - elapsed);
                const m = Math.floor(remaining / 60).toString().padStart(2, '0');
                const s = Math.floor(remaining % 60).toString().padStart(2, '0');
                this.timerEl.textContent = `${m}:${s}`;
            }
        }
    }
    document.addEventListener('DOMContentLoaded',()=>{ if(window.testsCore) window.testsCore.registerTest('reaction',{title:'זמן תגובה'}); window.reactionTest=new ReactionTest(); });
})();