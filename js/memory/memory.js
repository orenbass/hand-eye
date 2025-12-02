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
            this.phaseBanner = document.getElementById('memory-phase-banner');
            this.realStartBtn = document.getElementById('memory-real-start-button');
            this.countdownEl = document.getElementById('memory-countdown');

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

            this.bind();
        }

        bind(){
            const btn = document.getElementById('start-memory-button');
            if(btn) btn.addEventListener('click', ()=> this.startPractice());
            if(this.realStartBtn) this.realStartBtn.addEventListener('click', ()=> this.startRealCountdown());
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
            if(!this.phaseBanner) return;
            if(!text){
                this.phaseBanner.style.display='none';
                this.phaseBanner.textContent='';
                this.phaseBanner.removeAttribute('data-mode');
                return;
            }
            this.phaseBanner.style.display='block';
            this.phaseBanner.textContent = text;
            if(mode){
                this.phaseBanner.setAttribute('data-mode', mode);
            } else {
                this.phaseBanner.removeAttribute('data-mode');
            }
        }

        toggleRealStartButton(show, disabled=false){
            if(!this.realStartBtn) return;
            this.realStartBtn.style.display = show ? 'inline-flex' : 'none';
            this.realStartBtn.disabled = !!disabled;
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

        start(){
            this.startPractice();
        }

        startPractice(){
            if(this.mode==='real' || this.mode==='countdown' || this.mode==='done') return;
            if(this.mode==='practice' && !this.practiceDone) return;

            if(window.enterFullscreenMode) window.enterFullscreenMode();

            this.mode='practice';
            this.practiceDone = false;
            this.setPadMode('practice');
            this.setBanner('תרגול - הציון לא נשמר', 'practice');
            this.toggleRealStartButton(true, false);
            this.setCountdown(null);
            this.clearCountdown();

            this.clearPendingTimers();
            this.reloadConfig();
            this.cooldownToken++;
            this.phase='idle';
            this.setStatus('מצב תרגול: עקבו אחרי הרצף. הציון לא נשמר.', 'info');

            this.updateStatsVisibility();

            this.startTime = 0;
            clearInterval(this.timerId);
            this.timerId = null;

            this.beginAttempt();
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
            this.toggleRealStartButton(true, false);
            this.setBanner('התרגול הסתיים - ניתן להתחיל את המבחן האמיתי', 'practice');
            this.updateStatsVisibility();

            if(showMessage){
                const msg = reason==='lives'
                    ? 'התרגול הסתיים. לחצו על "סיימתי תרגול – להתחיל מבחן אמיתי" כשתהיו מוכנים.'
                    : 'התרגול הסתיים. ניתן להמשיך למבחן האמיתי כשתהיו מוכנים.';
                this.setStatus(msg, 'info');
            }
        }

        startRealCountdown(){
            if(this.mode==='real' || this.mode==='countdown' || this.mode==='done') return;

            if(!this.practiceDone){
                this.finishPractice('manual', false);
            } else {
                this.clearPendingTimers();
                this.cooldownToken++;
            }

            this.mode='countdown';
            this.phase='countdown';
            this.setPadMode('countdown');
            this.setBanner('ספירה לאחור למבחן האמיתי', 'countdown');
            this.toggleRealStartButton(true, true);
            this.countdownRemaining = 10;
            const initialLabel = this.countdownRemaining === 1 ? 'שנייה' : 'שניות';
            this.setCountdown(`המבחן האמיתי יתחיל בעוד ${this.countdownRemaining} ${initialLabel}`);
            this.setStatus('המבחן האמיתי יתחיל בעוד 10 שניות. התכוננו!', 'pending');

            this.clearCountdown();
            this.countdownTimer = setInterval(()=>{
                this.countdownRemaining--;
                if(this.countdownRemaining>0){
                    const label = this.countdownRemaining === 1 ? 'שנייה' : 'שניות';
                    this.setCountdown(`המבחן האמיתי יתחיל בעוד ${this.countdownRemaining} ${label}`);
                } else {
                    this.clearCountdown();
                    this.setCountdown(null);
                    this.startRealTest();
                }
            }, 1000);
        }

        startRealTest(){
            this.clearPendingTimers();
            this.clearCountdown();

            this.mode='real';
            this.practiceDone = true;
            this.setPadMode('real');
            this.setBanner('מבחן אמיתי - הציון יימדד', 'real');
            this.toggleRealStartButton(false);
            this.setCountdown(null);

            if(window.enterFullscreenMode) window.enterFullscreenMode();

            this.reloadConfig();
            this.cooldownToken++;
            this.phase='idle';
            this.setStatus('צפו ברצף והקישו את הצבעים באותו סדר');

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
            if(this.mode!=='real') return;
            this.timerId=setInterval(()=>{
                if(this.phase==='done') return;
                const elapsed = performance.now() - this.startTime;
                if(elapsed>=this.timeLimitMs){
                    this.setStatus('הזמן הסתיים', 'error');
                    this.finish(true);
                }
            }, 300);
        }

        finish(timeExpired){
            if(this.phase==='done') return;
            this.phase='done';
            this.mode='done';
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