import { getTrackingConfig } from './tracking.config.js';
import { clamp, randomAngleVelocity, normalizeVelocity, insideCircle } from './tracking.utils.js';
import { computeTrackingScores } from './tracking.scoring.js';

// Tracking / Sustained Attention Test Module (refactored)
(function(){
    class TrackingTest {
        constructor(){
            this.canvas=document.getElementById('tracking-canvas');
            this.ctx=this.canvas?this.canvas.getContext('2d'):null;
            this.inEl=document.getElementById('tracking-in');
            this.outsEl=document.getElementById('tracking-outs');
            this.scoreEl=document.getElementById('tracking-score');
            this.statsBox=document.getElementById('tracking-stats');
            this.statusEl=document.getElementById('tracking-status');
            this.numberBoxEl=null;
            // dynamic config
            this.config=null; this.duration=30000; this.numberTimeout=2000; this.speed=200; this.radiusFactor=0.055;
            // runtime state
            this.startTime=0; this.lastTime=0; this.inTime=0; this.outs=0; this.running=false; this.lastInside=false; this.animId=null;
            this.target={x:100,y:100,r:45,vx:0,vy:0,speed:200};
            // numbers
            this.currentNumber=1; this.previousNumber=0; this.numberStartTime=0; this.totalNumbers=0; this.correctClicks=0; this.wrongClicks=0; this.missedNumbers=0; this.numberHistory=[]; this.lastKeyFeedback=null;
            this.stage='idle'; this.practiceDone=false; this.countdownTimer=null; this.countdownRemaining=0; this.mode=null;
            this.lockToken=null;
            this.practiceModalEl=null;
            this.prePracticeShown=false;
            this.practiceRunsComplete=0;
            
            // Attach HUDs
            if(window.timerHUD && window.timerHUD.attach) {
                window.timerHUD.attach(document.getElementById('tracking-timer-slot'));
            }
            if(window.practiceBanner && window.practiceBanner.attach) {
                window.practiceBanner.attach(document.getElementById('tracking-practice-slot'));
            }

            this.updateLayoutState();
            this.resize();
            this.bind();
        }
        updateLayoutState() {
            const layout = document.getElementById('tracking-layout');
            if (layout) {
                // Map internal stage/mode to CSS data-stage
                // stage can be 'idle', 'practice', 'real', 'done'
                let cssStage = this.stage;
                if (this.mode === 'practice') cssStage = 'practice';
                if (this.mode === 'real') cssStage = 'real';
                if (this.stage === 'done') cssStage = 'done';
                
                layout.setAttribute('data-stage', cssStage);
            }
        }
        ensurePracticeModal(){
            if(this.practiceModalEl) return this.practiceModalEl;
            const overlay=document.createElement('div');
            overlay.id='tracking-practice-modal';
            overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:15000;display:none;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML=`<div style="max-width:520px;width:100%;background:#ffffff;color:#0f172a;border-radius:20px;padding:32px;box-shadow:0 25px 55px rgba(15,23,42,0.45);text-align:center;"></div>`;
            document.body.appendChild(overlay);
            this.practiceModalEl=overlay;
            return overlay;
        }
        showPrePracticeModal(onStart){
            const modal=this.ensurePracticeModal();
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
        showEndPracticeModal(onRealStart){
            const modal = this.ensurePracticeModal();
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
                const countdownSec = this.config && this.config.examCountdownSec ? this.config.examCountdownSec : 0;
                if(countdownSec > 0){
                    let remaining = countdownSec;
                    contentBox.innerHTML = `
                        <div style="font-size:4rem;margin-bottom:16px;font-weight:800;color:#0ea5e9;line-height:1" id="trk-modal-countdown">${remaining}</div>
                        <h2 style="margin:0 0 8px;font-size:1.5rem;">המבחן מתחיל בעוד...</h2>
                        <p style="color:#64748b;margin:0">נא להתכונן</p>
                    `;
                    const timer = setInterval(()=>{
                        remaining--;
                        const el = document.getElementById('trk-modal-countdown');
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
        reloadConfig(modeOverride){
            const cfg=getTrackingConfig();
            this.config=cfg;
            const currentMode = modeOverride || this.mode || 'real';
            this.duration = (currentMode === 'practice' ? cfg.practiceSeconds : cfg.seconds) * 1000;
            this.speed = cfg.speed;
            this.radiusFactor = cfg.radiusFactor;
            this.numberTimeout = cfg.numberTimeoutSec * 1000;
            this.target.speed = this.speed;
        }
        createNumberBox(){
            const container = this.canvas && this.canvas.parentElement;
            if(!container) return;
            if(this.numberBoxEl) this.numberBoxEl.remove();
            const box=document.createElement('div');
            box.style.cssText=`position:absolute;left:-260px;top:50%;transform:translateY(-50%);width:220px;height:220px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;box-shadow:0 15px 40px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:100;`;
            const num=document.createElement('div'); num.id='tracking-number-display'; num.style.cssText='font-size:140px;font-weight:800;color:#fff;text-shadow:0 4px 12px rgba(0,0,0,0.4);user-select:none;'; num.textContent='1';
            box.appendChild(num); container.appendChild(box); this.numberBoxEl=box;
        }
        updateNumberDisplay(){
            if(!this.running) return; const display=document.getElementById('tracking-number-display'); if(!display||!this.numberBoxEl) return; display.textContent=this.currentNumber;
            display.style.transform='scale(1.15)'; setTimeout(()=>{ if(this.running && display) display.style.transform='scale(1)'; },150);
            if(this.lastKeyFeedback && performance.now()-this.lastKeyFeedback.time<400){ const color=this.lastKeyFeedback.correct? '#10b981':'#ef4444'; this.numberBoxEl.style.background=color; setTimeout(()=>{ if(this.running && this.numberBoxEl) this.numberBoxEl.style.background='linear-gradient(135deg,#667eea 0%,#764ba2 100%)'; },300); }
        }
        handleNumberKey(key){ if(!this.running) return; const pressed=parseInt(key); if(isNaN(pressed)||pressed<1||pressed>4) return; const now=performance.now(); const rt=now-this.numberStartTime; if(pressed===this.currentNumber){ this.correctClicks++; this.numberHistory.push({number:this.currentNumber,correct:true,time:rt}); this.lastKeyFeedback={correct:true,time:now}; this.nextNumber(); } else { this.wrongClicks++; this.numberHistory.push({number:this.currentNumber,correct:false,time:rt}); this.lastKeyFeedback={correct:false,time:now}; } this.updateNumberDisplay(); }
        nextNumber(){ let next; do{ next=Math.floor(Math.random()*4)+1; }while(next===this.previousNumber); this.previousNumber=this.currentNumber; this.currentNumber=next; this.numberStartTime=performance.now(); this.updateNumberDisplay(); }
        checkNumberTimeout(){ if(!this.running) return; const elapsed=performance.now()-this.numberStartTime; if(elapsed>=this.numberTimeout){ this.missedNumbers++; this.numberHistory.push({number:this.currentNumber,correct:false,time:this.numberTimeout,missed:true}); this.nextNumber(); } }
        initTargetVelocity(){ const v=randomAngleVelocity(this.speed); this.target.vx=v.vx; this.target.vy=v.vy; }
        resize(){ 
            if(!this.canvas) return; 
            
            // Calculate available space based on the main panel to avoid overlapping header/footer
            const mainPanel = document.querySelector('.tracking-main-panel');
            let availableHeight = window.innerHeight * 0.75;
            let availableWidth = window.innerWidth * 0.9;

            if (mainPanel) {
                const rect = mainPanel.getBoundingClientRect();
                if (rect.height > 100) {
                    availableHeight = rect.height - 40; // padding
                    availableWidth = rect.width - 40;
                }
            }

            const size=Math.floor(Math.min(availableWidth, availableHeight)); 
            this.canvas.width=size; this.canvas.height=size; this.canvas.style.width=size+'px'; this.canvas.style.height=size+'px'; 
            const minDim=size; this.target.r=Math.max(30, Math.min(60, Math.round(minDim * this.radiusFactor))); 
            if(!this.running){ this.target.x=this.canvas.width/2; this.target.y=this.canvas.height/2; } 
        }
        bind(){
            const btn=document.getElementById('start-tracking-button');
            if(btn) btn.addEventListener('click',()=> {
                if(!this.prePracticeShown){
                    this.prePracticeShown=true;
                    this.showPrePracticeModal(()=>this.startPractice());
                } else {
                    this.startPractice();
                }
            });
            if(this.canvas) this.canvas.addEventListener('mousemove',e=>this.handleMove(e));
            window.addEventListener('resize',()=>{ if(!this.running) this.resize(); });
            document.addEventListener('keydown',e=>{ if(!this.running) return; if(['1','2','3','4'].includes(e.key)){ e.preventDefault(); this.handleNumberKey(e.key); } });
        }
        getInteractionOptions(mode){
            return {
                allowedKeys:['digit1','digit2','digit3','digit4','numpad1','numpad2','numpad3','numpad4'],
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
        setStatus(text, tone='info'){
            if(!this.statusEl) return;
            this.statusEl.textContent=text||'';
            this.statusEl.setAttribute('data-tone', tone);
        }
        updateStatsVisibility(){
            if(!this.statsBox) return;
            const admin = window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin();
            if(this.stage==='real' && admin){
                this.statsBox.style.display='block';
            } else if(this.stage==='real' && !admin){
                this.statsBox.style.display='none';
            } else {
                this.statsBox.style.display='none';
            }
        }
        teardownRun(){
            cancelAnimationFrame(this.animId);
            this.animId=null;
            this.running=false;
            this.releaseInteractionLock();
            if(this.numberBoxEl){ this.numberBoxEl.remove(); this.numberBoxEl=null; }
        }
        startPractice(){
            if(this.stage==='real' || this.stage==='countdown' || this.stage==='done') return;
            // if(this.stage==='practice' && !this.practiceDone) return;
            if(window.enterFullscreenMode) window.enterFullscreenMode();

            // Re-attach HUDs
            if(window.timerHUD && window.timerHUD.attach) {
                window.timerHUD.attach(document.getElementById('tracking-timer-slot'));
            }
            if(window.practiceBanner && window.practiceBanner.attach) {
                window.practiceBanner.attach(document.getElementById('tracking-practice-slot'));
            }

            this.stage='practice';
            this.practiceDone=false;
            this.mode='practice';
            this.updateLayoutState();
            
            const totalRuns = this.config && this.config.practiceRuns ? this.config.practiceRuns : 1;
            const currentRun = this.practiceRunsComplete + 1;

            if(window.practiceBanner) {
                window.practiceBanner.show({
                    label: 'מצב תרגול',
                    description: 'התוצאות אינן נשמרות'
                });
            }
            if(window.timerHUD) {
                window.timerHUD.show('זמן תרגול', '00:00', 'practice');
            }

            this.setStatus('תרגול: שמור את הסמן בתוך העיגול והקלד את המספרים', 'info');
            this.updateStatsVisibility();
            this.startRun('practice');
        }
        finishPractice(options={}){
            const { skipMessage=false, keepFullscreen=true } = options;
            this.stage='practice';
            this.practiceDone=true;
            this.mode=null;
            this.updateLayoutState();
            this.practiceRunsComplete++;
            
            const totalRuns = this.config && this.config.practiceRuns ? this.config.practiceRuns : 1;
            
            if(this.practiceRunsComplete < totalRuns){
                this.setStatus(`תרגול ${this.practiceRunsComplete} מתוך ${totalRuns} הסתיים. מתחיל תרגול נוסף...`, 'success');
                setTimeout(()=> this.startPractice(), 2000);
                return;
            }

            if(!skipMessage){
                this.showEndPracticeModal(() => this.startRealCountdown());
            }
            
            this.updateStatsVisibility();
            if(!keepFullscreen && window.exitFullscreenMode) window.exitFullscreenMode();
        }
        startRealCountdown(){
            // Deprecated - handled by modal now, but kept for fallback
            this.startRealTest();
        }
        startRealTest(){
            if(this.countdownTimer) clearInterval(this.countdownTimer);
            this.stage='real';
            this.mode='real';
            this.updateLayoutState();
            
            // Re-attach HUDs
            if(window.timerHUD && window.timerHUD.attach) {
                window.timerHUD.attach(null); // Detach timer for real test
                window.timerHUD.hide();
            }
            if(window.practiceBanner && window.practiceBanner.attach) {
                window.practiceBanner.attach(document.getElementById('tracking-practice-slot'));
                window.practiceBanner.show({
                    label: 'מבחן אמיתי',
                    description: 'התוצאות נשמרות',
                    mode: 'real'
                });
            }

            // if(window.practiceBanner) window.practiceBanner.hide(); // Removed to keep banner visible
            this.setStatus('מבחן אמיתי: שמור את הסמן והקלד במדויק', 'info');
            this.updateStatsVisibility();
            this.startRun('real');
        }
        startRun(mode='real'){
            if(this.running) return;
            this.reloadConfig(mode);
            if (window.enterFullscreenMode) window.enterFullscreenMode();
            this.resize();
            requestAnimationFrame(()=>this.resize());
            this.resetState();
            this.createNumberBox();
            this.initTargetVelocity();
            this.running=true;
            this.mode=mode;
            this.applyInteractionLock(mode);
            this.stage = mode==='practice' ? 'practice' : 'real';
            this.updateStatsVisibility();
            const admin = window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin();
            if(this.statsBox){
                this.statsBox.style.display = (this.stage==='real' && admin) ? 'block' : 'none';
            }
            this.startTime=performance.now();
            this.lastTime=this.startTime;
            this.numberStartTime=this.startTime;
            this.totalNumbers=Math.floor((this.duration/1000)/(this.numberTimeout/1000));
            this.loop();
        }
        start(){ this.startRun('real'); }
        resetState(){ this.inTime=0; this.outs=0; this.lastInside=false; this.currentNumber=1; this.previousNumber=0; this.correctClicks=0; this.wrongClicks=0; this.missedNumbers=0; this.numberHistory=[]; this.lastKeyFeedback=null; if(this.numberBoxEl){ this.numberBoxEl.remove(); this.numberBoxEl=null; } }
        loop(){ 
            if(!this.running) return; 
            const now=performance.now(); 
            const dt=(now-this.lastTime)/1000; 
            this.lastTime=now; 
            
            // Update Timer HUD
            const elapsed = now - this.startTime;
            const remaining = Math.max(0, (this.duration - elapsed) / 1000);
            if(window.timerHUD && this.mode === 'practice') {
                const m = Math.floor(remaining / 60);
                const s = Math.floor(remaining % 60);
                window.timerHUD.update(`${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
            }

            this.target.x+=this.target.vx*dt; 
            this.target.y+=this.target.vy*dt; 
            if(this.target.x<this.target.r || this.target.x>this.canvas.width-this.target.r){ this.target.vx*=-1; this.target.x=clamp(this.target.x, this.target.r, this.canvas.width-this.target.r); } 
            if(this.target.y<this.target.r || this.target.y>this.canvas.height-this.target.r){ this.target.vy*=-1; this.target.y=clamp(this.target.y, this.target.r, this.canvas.height-this.target.r); } 
            normalizeVelocity(this.target, this.speed); 
            this.draw(); 
            if(this.lastInside) this.inTime+=dt; 
            this.checkNumberTimeout(); 
            this.updateStats(now); 
            if(now-this.startTime>=this.duration){ this.finish(); return; } 
            this.animId=requestAnimationFrame(()=>this.loop()); 
        }
        handleMove(e){ if(!this.running) return; const rect=this.canvas.getBoundingClientRect(); const x=(e.clientX-rect.left)*(this.canvas.width/rect.width); const y=(e.clientY-rect.top)*(this.canvas.height/rect.height); const inside=insideCircle(x,y,this.target.x,this.target.y,this.target.r); if(inside!==this.lastInside){ if(this.lastInside&&!inside) this.outs++; this.lastInside=inside; } }
        draw(){ if(!this.ctx) return; this.ctx.fillStyle='#0f172a'; this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height); this.ctx.beginPath(); this.ctx.arc(this.target.x,this.target.y,this.target.r,0,Math.PI*2); this.ctx.fillStyle='#4CAF50'; this.ctx.fill(); this.ctx.lineWidth=4; this.ctx.strokeStyle=this.lastInside?'#00bcd4':'#f44336'; this.ctx.stroke(); }
        updateStats(now){ const elapsed=(now-this.startTime)/1000; const scaleRange=window.getGlobalScale? window.getGlobalScale(): {min:1,max:7}; const scores=computeTrackingScores({ inTimeSec:this.inTime, totalElapsedSec:elapsed, outs:this.outs, correct:this.correctClicks, wrong:this.wrongClicks, missed:this.missedNumbers }, scaleRange); this.inEl.textContent=scores.insidePercent.toFixed(1)+'%'; this.outsEl.textContent=this.outs; if(!(window.testAuth && !window.testAuth.isAdmin())){ this.scoreEl.textContent=`${scores.finalRaw.toFixed(0)} (מעקב:${scores.trackingScore.toFixed(0)} | מספרים:${scores.clickAccuracy.toFixed(0)})`; } }
        finish(){
            const wasPractice = this.mode==='practice';
            this.teardownRun();
            const scaleRange=window.getGlobalScale? window.getGlobalScale(): {min:1,max:7};
            const scores=computeTrackingScores({ inTimeSec:this.inTime, totalElapsedSec:this.duration/1000, outs:this.outs, correct:this.correctClicks, wrong:this.wrongClicks, missed:this.missedNumbers }, scaleRange);
            if(wasPractice){
                this.finishPractice();
                return;
            }
            this.stage='done';
            this.updateLayoutState();
            if (window.exitFullscreenMode) window.exitFullscreenMode();
            if(window.testsCore){ window.testsCore.completeTest('tracking', scores.finalRaw, scores.scaled, {outs:this.outs, correct:this.correctClicks, wrong:this.wrongClicks, missed:this.missedNumbers}); }
                if(window.testAuth){ window.testAuth.showTestCompleteModal('tracking', scores.scaled.toFixed(2)); }
            
            if(window.practiceBanner) window.practiceBanner.hide();
            this.setStatus('המבחן הסתיים.', 'success');
        }
    }
    document.addEventListener('DOMContentLoaded',()=>{ if(window.testsCore) window.testsCore.registerTest('tracking',{title:'מעקב וקשב'}); window.trackingTest=new TrackingTest(); });
})();