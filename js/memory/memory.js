// Simon-style Memory Test Module
import { getMemoryConfig } from './memory.config.js';
import { sleep } from './memory.utils.js';
import { computeMemoryRawScore, scaleMemoryScore } from './memory.scoring.js';

(function(){
    const PAD_COLORS = [
        { className: 'memory-color-red', label: '1', aria: 'צבע אדום' },
        { className: 'memory-color-blue', label: '2', aria: 'צבע כחול' },
        { className: 'memory-color-green', label: '3', aria: 'צבע ירוק' },
        { className: 'memory-color-yellow', label: '4', aria: 'צבע צהוב' },
        { className: 'memory-color-purple', label: '5', aria: 'צבע סגול' }
    ];

    class MemoryTest {
        constructor(){
            this.padEl = document.getElementById('memory-grid');
            this.lengthEl = document.getElementById('memory-length');
            this.maxEl = document.getElementById('memory-max');
            this.livesEl = document.getElementById('memory-lives');
            this.messageEl = document.getElementById('memory-message');
            this.statsBox = document.getElementById('memory-stats');
            this.countdownEl = document.getElementById('memory_countdown');
            this.practiceModalEl = null;

            this.nodes = [];
            this.sequence = [];
            this.userIndex = 0;
            this.maxAchieved = 0;
            this.lives = 0;
            this.maxLives = 0;
            this.phase = 'idle';
            this.mode = 'idle';
            this.practiceDone = false;
            this.timeoutIds = [];
            this.cooldownToken = 0;
            this.timerId = null;
            this.countdownTimer = null;
            this.countdownRemaining = 0;
            this.config = null;
            this.timeLimitMs = 0;
            this.retryDelaySec = 10;
            this.startTime = 0;
            this.prePracticeShown = false;

            this.bind();
        }

        bind(){
            const btn = document.getElementById('start-memory-button');
            if(btn) {
                btn.addEventListener('click', ()=> {
                    this.reloadConfig();
                    // Check if practice is enabled in config (default true)
                    const practiceEnabled = this.config.practiceEnabled !== false;
                    if (practiceEnabled && !this.prePracticeShown) {
                        this.prePracticeShown = true;
                        this.showPrePracticeModal(() => this.startPractice());
                    } else {
                        this.startPractice();
                    }
                });
            }
            this.renderPad();
        }

        renderPad(){
            if(!this.padEl) return;
            this.padEl.classList.add('memory-pad');
            this.padEl.innerHTML='';
            this.nodes = [];
            PAD_COLORS.forEach((cfg, idx)=>{
                const btn = document.createElement('button');
                btn.type='button';
                btn.className=`memory-node ${cfg.className}`;
                btn.dataset.index=idx;
                btn.setAttribute('aria-label', cfg.aria || `Pad ${idx+1}`);
                btn.innerHTML=`<span class="memory-node-label">${cfg.label}</span>`;
                btn.addEventListener('click', ()=> this.handleNode(idx));
                this.padEl.appendChild(btn);
                this.nodes.push(btn);
            });
        }

        setPadMode(mode){
            if(!this.padEl) return;
            if(mode){
                this.padEl.setAttribute('data-mode', mode);
            } else {
                this.padEl.removeAttribute('data-mode');
            }
        }

        setBanner(text, mode){
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
                this.countdownEl.textContent = text;
            } else {
                this.countdownEl.style.display='none';
                this.countdownEl.textContent = '';
            }
        }

        clearCountdown(){
            if(this.countdownTimer){
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
            }
        }

        updateStatsVisibility(){
            if(!this.statsBox) return;
            if(this.mode==='real'){
                if(window.testAuth && !window.testAuth.isAdmin()){
                    this.statsBox.style.display='none';
                } else {
                    this.statsBox.style.display='block';
                }
            } else {
                this.statsBox.style.display='none';
            }
        }

        ensurePracticeModal(){
            if(this.practiceModalEl) return this.practiceModalEl;
            const overlay=document.createElement('div');
            overlay.id='memory-practice-modal';
            overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:15000;display:none;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML=`
              <div style="max-width:520px;width:100%;background:#ffffff;color:#0f172a;border-radius:20px;padding:32px;box-shadow:0 25px 55px rgba(15,23,42,0.45);text-align:center;">
                <div style="font-size:2.6rem;margin-bottom:12px">🧠</div>
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
                <div style="font-size:2.6rem;margin-bottom:12px">🧠</div>
                <h2 style="margin:0 0 12px;font-size:1.45rem;">התרגול הסתיים</h2>
                <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
                  בלחיצה על הכפתור הבא <strong>המבחן האמיתי יתחיל מיד</strong>. התוצאה הקרובה תישמר לציון הרשמי, לכן ודא שאתה מוכן לפני שממשיכים.
                </p>
                <button type="button" data-action="confirm" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">הבנתי – להתחיל מבחן אמיתי</button>
            `;
            modal.style.display='flex';
            const confirmBtn=modal.querySelector('[data-action="confirm"]');
            if(confirmBtn){
                confirmBtn.onclick=()=>{
                    // Use config for countdown duration
                    const countdownSec = (this.config && typeof this.config.examCountdownSec === 'number') ? this.config.examCountdownSec : 5;

                    if (countdownSec > 0) {
                        let remaining = countdownSec;
                        contentBox.innerHTML = `
                            <div style="font-size:4rem;margin-bottom:16px;font-weight:800;color:#0ea5e9;line-height:1" id="memory-modal-countdown">${remaining}</div>
                            <h2 style="margin:0 0 8px;font-size:1.5rem;">המבחן מתחיל בעוד...</h2>
                            <p style="color:#64748b;margin:0">נא להתכונן</p>
                        `;
                        
                        const timer = setInterval(() => {
                            remaining--;
                            const el = document.getElementById('memory-modal-countdown');
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
            const contentBox = modal.querySelector('div'); // The inner div
            
            // Save original content to restore later if needed, or just overwrite
            // Since ensurePracticeModal creates a specific structure, we can just overwrite the innerHTML of the content box
            // But wait, ensurePracticeModal returns the overlay. The content box is the first child.
            
            // Actually, let's just overwrite the innerHTML of the content div.
            // The ensurePracticeModal creates: overlay -> div (content)
            
            const originalContent = contentBox.innerHTML;
            
            contentBox.innerHTML = `
                <div style="font-size:2.6rem;margin-bottom:12px">ℹ️</div>
                <h2 style="margin:0 0 12px;font-size:1.45rem;">מתחילים בתרגול</h2>
                <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
                  המבחן הראשון הוא תרגול בלבד ולא יכנס לציון הסופי ומטרתו היא להכיר את המבחן ולהתנסות בו במשך זמן קצר.
                </p>
                <button type="button" data-action="start-practice" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">התחל תרגול</button>
            `;
            
            modal.style.display='flex';
            
            const startBtn=contentBox.querySelector('[data-action="start-practice"]');
            if(startBtn){
                startBtn.onclick=()=>{
                    modal.style.display='none';
                    // Restore original content structure for the "Practice Finished" modal later
                    // Or we can just let showPracticeModal overwrite it again when needed.
                    // showPracticeModal does overwrite it? 
                    // Let's check showPracticeModal in memory.js
                    // It calls ensurePracticeModal which creates it if missing.
                    // But showPracticeModal doesn't seem to set innerHTML every time in the current code?
                    // Wait, let me check the read_file output for memory.js again.
                    if(typeof onStart==='function') onStart();
                };
            }
        }

        start(){
            this.startPractice();
        }

        startPractice(){
            if(this.mode==='real' || this.mode==='countdown' || this.mode==='done') return;
            if(this.mode==='practice' && !this.practiceDone) return;

            if(window.enterFullscreenMode) window.enterFullscreenMode();

            // Re-attach HUDs
            if(window.timerHUD && window.timerHUD.attach) {
                window.timerHUD.attach(document.getElementById('memory-timer-slot'));
            }
            if(window.practiceBanner && window.practiceBanner.attach) {
                window.practiceBanner.attach(document.getElementById('memory-practice-slot'));
            }

            this.mode='practice';
            this.updateLayoutState();
            this.practiceDone = false;
            this.setPadMode('practice');
            this.setBanner('תרגול - הציון לא נשמר', 'practice');
            this.setCountdown(null);
            this.clearCountdown();

            this.clearPendingTimers();
            this.reloadConfig();
            this.cooldownToken++;
            this.phase='idle';
            this.setStatus('מצב תרגול: עקבו אחרי הרצף. הציון לא נשמר.', 'info');

            this.updateStatsVisibility();

            this.startTime = performance.now();
            this.timeLimitMs = this.practiceDurationMs;
            this.startTimer();

            this.beginAttempt();
        }

        _runPracticeStartLogic() {
            // Deprecated - logic moved back to startPractice
        }

        finishPractice(reason, showMessage=true){
            this.clearPendingTimers();
            this.cooldownToken++;
            this.clearCountdown();
            this.setCountdown(null);
            clearInterval(this.timerId);
            this.timerId = null;

            this.phase='practice-complete';
            this.practiceDone = true;
            this.mode='practice';
            this.sequence = [];
            this.userIndex = 0;
            this.updateStats();
            this.setPadMode('practice');
            this.setBanner(null); // Hide banner
            this.updateStatsVisibility();

            if(showMessage){
                this.setStatus('', 'muted');
                this.showPracticeModal(()=>this.startRealTest());
            }
        }

        startRealCountdown(){
            // Deprecated - logic moved to showPracticeModal
            this.startRealTest();
        }

        startRealTest(){
            this.clearPendingTimers();
            this.clearCountdown();

            // Re-attach HUDs
            if(window.timerHUD && window.timerHUD.attach) {
                window.timerHUD.attach(document.getElementById('memory-timer-slot'));
            }
            if(window.practiceBanner && window.practiceBanner.attach) {
                window.practiceBanner.attach(document.getElementById('memory-practice-slot'));
            }

            this.mode='real';
            this.updateLayoutState();
            this.practiceDone = true;
            this.setPadMode('real');
            this.setBanner('מבחן אמיתי - הציון יימדד', 'real');
            this.setCountdown(null);

            if(window.enterFullscreenMode) window.enterFullscreenMode();

            this.reloadConfig();
            this.cooldownToken++;
            this.phase='idle';
            this.setStatus('צפו ברצף והקישו את הצבעים באותו סדר', 'muted');

            this.updateStatsVisibility();

            this.startTime = performance.now();
            this.startTimer();
            this.beginAttempt();
        }

        reloadConfig(){
            this.config = getMemoryConfig();
            this.retryDelaySec = this.config.retryDelaySec || 10;
            this.maxLives = this.config.maxLives || 3;
            this.lives = this.maxLives;
            this.maxAchieved = 0;
            this.sequence = [];
            this.userIndex = 0;
            this.timeLimitMs = (this.config.seconds || 120) * 1000;
            this.practiceDurationMs = this.config.practiceDurationMs || 45000;
            this.examCountdownSec = (typeof this.config.examCountdownSec === 'number') ? this.config.examCountdownSec : 5;
            this.updateStats();
        }

        beginAttempt(){
            this.phase='show';
            this.sequence = [];
            this.userIndex = 0;
            this.generateNextStep();
            this.playSequence();
        }

        generateNextStep(){
            const next = Math.floor(Math.random()*this.nodes.length);
            this.sequence.push(next);
            this.updateStats();
        }

        playSequence(){
            this.clearPendingTimers();
            this.phase='show';
            this.userIndex=0;
            this.setStatus('שימו לב לרצף הצבעים', 'muted');

            let delay = 600;
            this.sequence.forEach(idx=>{
                const showId = setTimeout(()=>{
                    this.flashNode(idx, 'active', 500);
                }, delay);
                this.timeoutIds.push(showId);
                delay += 850;
            });

            const readyId = setTimeout(()=>{
                if(this.phase==='done') return;
                this.phase='input';
                this.setStatus('לחצו לפי הסדר שהופיע', 'pending');
            }, delay + 150);
            this.timeoutIds.push(readyId);
        }

        handleNode(index){
            if(this.phase!=='input') return;
            const expected = this.sequence[this.userIndex];
            if(index===expected){
                this.flashNode(index,'success',320);
                this.userIndex++;
                if(this.userIndex===this.sequence.length){
                    this.maxAchieved = Math.max(this.maxAchieved, this.sequence.length);
                    this.updateStats();
                    this.phase='transition';
                    this.setStatus('מעולה! נוסיף צבע חדש לרצף', 'success');
                    const id=setTimeout(()=>{
                        if(this.phase==='done') return;
                        this.generateNextStep();
                        this.playSequence();
                    }, 900);
                    this.timeoutIds.push(id);
                }
            } else {
                this.flashNode(index,'error',650);
                this.handleFailure();
            }
        }

        async handleFailure(){
            this.clearPendingTimers();
            if(this.phase==='done') return;
            this.phase='cooldown';
            this.lives = Math.max(0, this.lives-1);
            this.updateStats();

            if(this.mode==='practice'){
                if(this.lives>0){
                    this.setStatus(`טעות בתרגול... ניסיון נוסף יתחיל בעוד ${this.retryDelaySec} שניות`, 'error');
                    await this.startCooldown();
                } else {
                    this.finishPractice('lives');
                }
                return;
            }

            if(this.lives>0){
                this.setStatus(`טעות... ניסיון נוסף יתחיל בעוד ${this.retryDelaySec} שניות`, 'error');
                await this.startCooldown();
            } else {
                this.setStatus('לא נותרו ניסיונות. המבחן הסתיים.', 'error');
                setTimeout(()=> this.finish(false), 800);
            }
        }

        async startCooldown(){
            const token = ++this.cooldownToken;
            let remaining = this.retryDelaySec;
            while(remaining>0 && token===this.cooldownToken && this.phase==='cooldown'){
                const label = this.mode==='practice' ? 'בתרגול' : 'במבחן';
                this.setStatus(`ניסיון נוסף ${label} יתחיל בעוד ${remaining} שניות`, 'pending');
                await sleep(1000);
                remaining--;
            }
            if(token!==this.cooldownToken || this.phase==='done') return;
            if(this.phase!=='cooldown') return;
            const readyMsg = this.mode==='practice'
                ? 'הנה הרצף החדש לתרגול – שימו לב!'
                : 'הנה הרצף החדש – שימו לב!';
            this.setStatus(readyMsg, 'muted');
            this.beginAttempt();
        }

        flashNode(index, cls='active', duration=450){
            const node = this.nodes[index];
            if(!node) return;
            node.classList.add(cls);
            const id=setTimeout(()=> node.classList.remove(cls), duration);
            this.timeoutIds.push(id);
        }

        startTimer(){
            clearInterval(this.timerId);
            if(this.mode!=='real' && this.mode!=='practice') return;
            this.timerId=setInterval(()=>{
                if(this.phase==='done') return;
                const elapsed = performance.now() - this.startTime;
                if(elapsed>=this.timeLimitMs){
                    if(this.mode==='practice'){
                        this.setStatus('זמן התרגול הסתיים', 'info');
                        this.finishPractice('time');
                    } else {
                        this.setStatus('הזמן הסתיים', 'error');
                        this.finish(true);
                    }
                }
            }, 300);
        }

        finish(timeExpired){
            if(this.phase==='done') return;
            this.phase='done';
            this.mode='done';
            this.updateLayoutState();
            this.clearPendingTimers();
            this.cooldownToken++;
            clearInterval(this.timerId);
            this.timerId=null;
            this.setCountdown(null);
            this.toggleRealStartButton(false);
            this.setBanner('המבחן האמיתי הסתיים', 'real');
            this.setPadMode('done');
            if(window.exitFullscreenMode) window.exitFullscreenMode();

            this.updateStats();

            const raw = computeMemoryRawScore(this.maxAchieved, this.config.maxSequenceForScale);
            const scaleRange = window.getGlobalScale ? window.getGlobalScale() : { min:1, max:7 };
            const scaled = scaleMemoryScore(raw, scaleRange);

            if(window.testAuth){
                window.testAuth.showTestCompleteModal('memory', scaled.toFixed(2));
            }
            if(window.testsCore){
                window.testsCore.completeTest('memory', raw, scaled, {
                    maxAchieved: this.maxAchieved,
                    timeExpired: !!timeExpired,
                    attemptsUsed: (this.maxLives - this.lives)
                });
            }
        }

        updateLayoutState() {
            const layout = document.getElementById('memory-layout');
            if (layout) {
                layout.setAttribute('data-stage', this.mode);
            }
        }

        toggleRealStartButton(show) {
            // Placeholder to prevent crash if called
        }

        updateStats(){
            if(this.lengthEl) this.lengthEl.textContent = this.sequence.length;
            if(this.maxEl) this.maxEl.textContent = this.maxAchieved;
            if(this.livesEl) this.livesEl.textContent = this.lives;
        }

        clearPendingTimers(){
            this.timeoutIds.forEach(id=> clearTimeout(id));
            this.timeoutIds=[];
            this.nodes.forEach(node=>{
                node.classList.remove('active','success','error');
            });
        }

        setStatus(text, tone='muted'){
            if(!this.messageEl) return;
            this.messageEl.textContent = text;
            this.messageEl.setAttribute('data-tone', tone);
        }
    }

    document.addEventListener('DOMContentLoaded',()=>{
        if(window.testsCore) window.testsCore.registerTest('memory', { title: 'זיכרון צבעים' });
        window.memoryTest = new MemoryTest();
    });
})();