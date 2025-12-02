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
            this.scoreBox=document.getElementById('reaction-score-box');
            this.scoreValue=document.getElementById('reaction-score-value');
            this.phaseBanner=document.getElementById('reaction-phase-banner');
            this.realStartBtn=document.getElementById('reaction-real-start-button');
            this.countdownEl=document.getElementById('reaction-countdown');
            this.stage='idle'; // idle | practice | countdown | real | done
            this.practiceDone=false;
            this.countdownTimer=null;
            this.countdownRemaining=0;
            this.activeMode=null; // practice | real
            this._onResize=null; this._keyHandler=null;
            this.lockToken=null;
            this.bind();
        }
        bind(){
            const startBtn=document.getElementById('start-reaction-button');
            if(startBtn) startBtn.addEventListener('click',()=>this.startPractice());
            if(this.realStartBtn) this.realStartBtn.addEventListener('click',()=>this.startRealCountdown());
            if(this.area){ this.area.style.pointerEvents='none'; }
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
            if(!this.phaseBanner) return;
            if(!text){
                this.phaseBanner.style.display='none';
                this.phaseBanner.textContent='';
                this.phaseBanner.removeAttribute('data-mode');
                return;
            }
            this.phaseBanner.style.display='block';
            this.phaseBanner.textContent=text;
            if(mode){ this.phaseBanner.setAttribute('data-mode',mode); }
            else { this.phaseBanner.removeAttribute('data-mode'); }
        }
        toggleRealStartButton(show, disabled=false){
            if(!this.realStartBtn) return;
            this.realStartBtn.style.display=show?'inline-flex':'none';
            this.realStartBtn.disabled=!!disabled;
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
            if(this._onResize){ window.removeEventListener('resize', this._onResize); this._onResize=null; }
            if(this._keyHandler){ document.removeEventListener('keydown', this._keyHandler); this._keyHandler=null; }
            if(this.area){
                this.area.innerHTML='';
                this.area.style.pointerEvents='auto';
                this.area.style.cursor='default';
            }
            this.releaseInteractionLock();
        }
        startPractice(){
            if(this.stage==='real' || this.stage==='countdown' || this.stage==='done') return;
            if(this.stage==='practice' && !this.practiceDone) return;
            if(window.enterFullscreenMode) window.enterFullscreenMode();
            this.stage='practice';
            this.practiceDone=false;
            this.activeMode='practice';
            this.setBanner('תרגול - התוצאות אינן נשמרות', 'practice');
            this.setCountdown(null);
            this.clearCountdown();
            this.toggleRealStartButton(true, false);
            this.setStatus('תרגול: אגיב לריבועים הירוקים בזמן', 'info');
            this.updateStatsVisibility();
            this.startSeries('practice');
        }
        finishPractice(options={}){
            const { skipMessage=false, keepFullscreen=true } = options;
            this.stage='practice';
            this.practiceDone=true;
            this.activeMode=null;
            if(!skipMessage){
                this.setStatus('התרגול הסתיים. לחצו על "סיימתי תרגול – להתחיל מבחן אמיתי" כדי להמשיך.', 'info');
                this.setBanner('התרגול הסתיים - ניתן להתחיל את המבחן האמיתי', 'practice');
            }
            this.toggleRealStartButton(true,false);
            this.setCountdown(null);
            this.clearCountdown();
            this.updateStatsVisibility();
            if(!keepFullscreen && window.exitFullscreenMode) window.exitFullscreenMode();
        }
        startRealCountdown(){
            if(this.stage==='real' || this.stage==='countdown' || this.stage==='done') return;
            if(!this.practiceDone){
                this.teardownRun();
                this.finishPractice({ skipMessage:true, keepFullscreen:true });
            }
            this.clearCountdown();
            this.stage='countdown';
            this.activeMode=null;
            this.setBanner('ספירה לאחור למבחן האמיתי', 'countdown');
            this.toggleRealStartButton(true, true);
            this.countdownRemaining=10;
            const label=this.countdownRemaining===1?'שנייה':'שניות';
            this.setCountdown(`המבחן האמיתי יתחיל בעוד ${this.countdownRemaining} ${label}`);
            this.setStatus('המבחן האמיתי יתחיל בעוד 10 שניות. התכונן!', 'pending');
            if(window.enterFullscreenMode) window.enterFullscreenMode();
            this.applyInteractionLock('countdown');
            this.countdownTimer=setInterval(()=>{
                this.countdownRemaining--;
                if(this.countdownRemaining>0){
                    const lbl=this.countdownRemaining===1?'שנייה':'שניות';
                    this.setCountdown(`המבחן האמיתי יתחיל בעוד ${this.countdownRemaining} ${lbl}`);
                } else {
                    this.clearCountdown();
                    this.setCountdown(null);
                    this.startRealTest();
                }
            },1000);
        }
        startRealTest(){
            this.clearCountdown();
            this.setCountdown(null);
            this.toggleRealStartButton(false);
            this.stage='real';
            this.activeMode='real';
            this.setBanner('מבחן אמיתי - התוצאות נשמרות', 'real');
            this.setStatus('מבחן אמיתי: אגיב במהירות לריבועים הירוקים', 'info');
            this.updateStatsVisibility();
            this.startSeries('real');
        }
        resetRunState(cfg){
            if(cfg){
                this.difficulty = cfg.difficulty;
                this.shapes = SHAPES_BY_DIFF[this.difficulty];
                this.shapeDisplaySec = cfg.shapeDisplaySec;
                this.durationSec = cfg.durationSec;
                this.targetGoal = cfg.targetGoal;
            }
            this.targetCount = 0;
            this.patternIndex = 0;
            this.patternLength = Math.max(1, (this.targetGoal*2) - 1);
            this.gapRemaining = Math.floor(Math.random()*3)+1;
            this.firstShown = false;
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
            const w = Math.floor(window.innerWidth * 0.8);
            const h = Math.floor(window.innerHeight * 0.8);
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
            const parent = this.area.parentElement; if(parent){ parent.style.display='flex'; parent.style.alignItems='center'; parent.style.justifyContent='center'; parent.style.minHeight='70vh'; }
        }
        startSeries(mode='real'){
            if(mode!=='practice' && mode!=='real') mode='real';
            if (window.enterFullscreenMode) window.enterFullscreenMode();
            // Load fresh config on each start (dynamic admin changes)
            const cfg = getReactionConfig();
            this.difficulty = cfg.difficulty;
            this.shapes = SHAPES_BY_DIFF[this.difficulty];
            this.shapeDisplaySec = cfg.shapeDisplaySec;
            this.durationSec = cfg.durationSec;
            this.targetGoal = cfg.targetGoal;
            this.resetRunState(cfg);
            this.activeMode = mode;
            this.state='run';
            this.stage = mode==='practice' ? 'practice' : 'real';
            this.updateStatsVisibility();
            this.startTimeMs = performance.now();
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
            if(this.targetActive && !this.targetClicked && !initial){ this.missedTargets++; }
            if(elapsed >= this.durationSec && this.targetCount >= this.targetGoal){ this.finish(); return; }
            let shape, color, isTarget=false;
            if(this.targetCount < this.targetGoal){
                if(this.gapRemaining<=0){
                    shape='square'; color='#00b341'; isTarget=true;
                    if(!this.firstShown && this.targetCount===0){ isTarget=false; color=this.safeColor(false); this.gapRemaining=Math.floor(Math.random()*3)+1; }
                    if(isTarget){
                        this.targetCount++; this.currentStimStart=now;
                        this.gapRemaining = Math.floor(Math.random()*3)+1;
                    }
                } else {
                    shape = this.shapes[Math.floor(Math.random()*this.shapes.length)];
                    if(shape==='square'){ color=this.safeColor(false); } else { color=this.safeColor(true); }
                    if(shape==='square' && (color==='#00b341' || color==='green')){ color=this.safeColor(false); }
                    this.gapRemaining--;
                }
            } else {
                shape = this.shapes[Math.floor(Math.random()*this.shapes.length)];
                if(shape==='square'){ color=this.safeColor(false); } else { color=this.safeColor(true); }
                if(shape==='square' && (color==='#00b341' || color==='green')){ color=this.safeColor(false); }
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
            if(this.targetActive){
                if(!this.targetClicked){
                    const rt = performance.now()-this.currentStimStart; this.times.push(rt); this.targetClicked=true;
                } else { this.mistakes++; }
            } else { this.mistakes++; }
            this.updateStats();
        }
        finish(){
            const wasPractice = this.activeMode==='practice';
            this.state='done';
            if(this.targetActive && !this.targetClicked){ this.missedTargets++; }
            this.teardownRun();
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
            this.toggleRealStartButton(false);
            this.setStatus('המבחן הסתיים.', 'success');
        }
        updateStats(){
            if(!this.isAdmin()) return;
            if(this.attemptEl) this.attemptEl.textContent=this.targetCount+'/'+this.targetGoal;
            if(this.lastEl) this.lastEl.textContent=this.times.length?this.times[this.times.length-1].toFixed(0):'-';
            const avg=mean(this.times); const sd=stddev(this.times);
            if(this.avgEl) this.avgEl.textContent=this.times.length?avg.toFixed(0):'-';
            if(this.stdEl) this.stdEl.textContent=this.times.length?sd.toFixed(0):'-';
        }
    }
    document.addEventListener('DOMContentLoaded',()=>{ if(window.testsCore) window.testsCore.registerTest('reaction',{title:'זמן תגובה'}); window.reactionTest=new ReactionTest(); });
})();