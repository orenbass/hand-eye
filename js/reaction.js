// Reaction Time Test Module
(function(){
    function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
    function mean(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;}
    function stddev(arr){if(!arr.length) return 0; const m=mean(arr); return Math.sqrt(arr.reduce((s,v)=>(s+(v-m)*(v-m)),0)/arr.length)||0;}
    // הגדרות קושי וצורות
    const SHAPES_BY_DIFF = { easy:['square'], medium:['square','circle'], hard:['square','circle','triangle'] };
    // הסרת שימוש במהירות מבוססת קושי – כל צורה מוצגת פרק זמן קבוע
    const HEB_DIFF_MAP = { 'קל':'easy', 'בינוני':'medium', 'קשה':'hard' };
    const COLORS = ['red','blue','yellow','purple','orange','green','pink','cyan']; // כולל ירוק כמטרה
    const VISIBLE_COLORS = ['#ff3131','#1e88ff','#ffd400','#9d4edd','#ff7f11','#00b341','#ff4fa3','#00d5ff']; // פלטה ברורה
    class ReactionTest {
        constructor(){
            // נתונים חדשים למבחן צורות
            this.difficulty = 'easy';
            this.shapes = SHAPES_BY_DIFF[this.difficulty];
            // תצוגת צורה למשך קבוע (שניות) – ניתן להגדיר ב window.appSettings.reactionShapeDisplaySec
            this.shapeDisplaySec = (window.appSettings && window.appSettings.reactionShapeDisplaySec) ? Math.max(0.2, +window.appSettings.reactionShapeDisplaySec) : 1;
            this.targetGoal = 15; // מספר ריבועים ירוקים למבחן
            this.targetCount = 0;
            this.patternIndex = 0; // אינדקס רצף הופעות (מטרה / מרווח)
            this.patternLength = this.targetGoal*2 - 1; // Target + gaps pattern length
            this.gapRemaining = 0; // כמה צורות מילוי נשארות לפני מטרה הבאה (מינימום 1)
            this.firstShown = false; // דגל לצורה ראשונה
            // הוספת משך מבחן מההגדרות + התאמה אם קצר מדי כדי להכיל 15 מטרות
            this.durationSec = 0; // יוגדר ב-startSeries
            this.startTimeMs = 0;
            this.times = []; this.mistakes = 0; this.missedTargets = 0;
            this.targetActive=false; this.targetClicked=false; this.currentStimStart=0; this.intervalId=null; // מזהה אינטרוול להצגת צורות רציפה
            this.state='idle';
            // אלמנטים קיימים בתצוגה
            this.area=document.getElementById('reaction-area');
            this.statusEl=document.getElementById('reaction-status');
            this.statsBox=document.getElementById('reaction-stats');
            this.attemptEl=document.getElementById('reaction-attempt'); // יציג התקדמות מטרות
            this.lastEl=document.getElementById('reaction-last');
            this.avgEl=document.getElementById('reaction-avg');
            this.stdEl=document.getElementById('reaction-std');
            this.scoreBox=document.getElementById('reaction-score-box');
            this.scoreValue=document.getElementById('reaction-score-value');
            this._onResize=null; // מאזין רסייז לניקוי בסיום
            this._keyHandler = null; // מאזין למקלדת (רווח)
            this.bind();
        }
        bind(){
            const startBtn=document.getElementById('start-reaction-button');
            if(startBtn) startBtn.addEventListener('click',()=>this.startSeries());
            // ביטול שימוש בעכבר – לא מוסיפים מאזין קליקים
            if(this.area){ this.area.style.pointerEvents='none'; }
        }
        isAdmin(){ return window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin(); }
        resolveDifficulty(){
            const cfg = window.getTestConfig? window.getTestConfig('reaction'):null;
            const heb = cfg? cfg.difficulty : 'קל';
            const diff = HEB_DIFF_MAP[heb] || 'easy';
            return diff;
        }
        updateAreaSize(){
            if(!this.area) return;
            // גודל: 80% מרוחב וגובה חלון, מוגבל לתקרה והבטחת יחס
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
            this.area.style.padding='10px'; // מרווח פנימי למניעת הדבקה לשוליים
            this.area.style.overflow='hidden';
            this.area.style.background='rgba(15,23,42,0.85)';
            // מרכוז אנכי באמצעות flex על ההורה אם קיים
            const parent = this.area.parentElement; if(parent){ parent.style.display='flex'; parent.style.alignItems='center'; parent.style.justifyContent='center'; parent.style.minHeight='70vh'; }
        }
        startSeries(){
            if (window.enterFullscreenMode) window.enterFullscreenMode();
            this.difficulty = this.resolveDifficulty();
            this.shapes = SHAPES_BY_DIFF[this.difficulty];
            this.shapeDisplaySec = (window.appSettings && window.appSettings.reactionShapeDisplaySec) ? Math.max(0.2, +window.appSettings.reactionShapeDisplaySec) : 1;
            // משך מבחן מההגדרות
            const cfg = window.getTestConfig? window.getTestConfig('reaction'):null;
            this.durationSec = cfg? Math.max(5, +cfg.seconds||40) : 40;
            // מינימום זמן נדרש להצגת 15 מטרות עם צורת ביניים בין מטרות: (15*2-1)*shapeDisplaySec
            const minRequired = (this.targetGoal*2 - 1) * this.shapeDisplaySec;
            if(this.durationSec < minRequired){
              console.warn('[reaction] duration too short for 15 targets, raising from', this.durationSec, 'to', minRequired.toFixed(2));
              this.durationSec = minRequired; // הבטחת הופעת 15 מטרות
            }
            this.targetCount=0; this.patternIndex=0; this.patternLength=this.targetGoal*2 -1; this.gapRemaining=Math.floor(Math.random()*3)+1; // מבטיח צורת פתיחה מילוי
            this.firstShown=false;
            this.times=[]; this.mistakes=0; this.missedTargets=0; this.targetActive=false; this.targetClicked=false;
            this.state='run';
            this.startTimeMs = performance.now();
            this.updateAreaSize();
            this._onResize=()=>{ if(this.state==='run'){ this.updateAreaSize(); } };
            window.addEventListener('resize', this._onResize);
            this.intervalId && clearInterval(this.intervalId);
            // יצירת מיכל צורות אם לא קיים
            if(this.area && !this.area.querySelector('.shape-stage')){
                const stage=document.createElement('div');
                stage.className='shape-stage';
                stage.style.position='absolute';
                stage.style.inset='0';
                stage.style.pointerEvents='none';
                this.area.appendChild(stage);
            }
            // צורה ראשונה מידית
            this.nextStimulus(true);
            // אינטרוול רציף – כל shapeDisplaySec שניות מופיעה צורה חדשה ללא רווח
            this.intervalId = setInterval(()=>{
                if(this.state==='run') this.nextStimulus(false);
            }, Math.max(50,this.shapeDisplaySec*1000));
            if(this.isAdmin()){
              this.statsBox && (this.statsBox.style.display='block');
              this.scoreBox && (this.scoreBox.style.display='block');
            } else {
              this.statsBox && (this.statsBox.style.display='none');
              this.scoreBox && (this.scoreBox.style.display='none');
            }

            this.area.className='reaction-area';
            if(this.area){ this.area.style.pointerEvents='none'; this.area.style.cursor='none'; }
            // הוספת מאזין מקלדת
            this._keyHandler = (e)=>{ if(e.code==='Space'){ e.preventDefault(); this.handleSpacePress(); } };
            document.addEventListener('keydown', this._keyHandler, {passive:false});
        }
        safeColor(allowGreen){
            // צבע רקע שמחושב + גרסאות אפשריות (כהה / כהה שקוף)
            const areaBg = getComputedStyle(this.area).backgroundColor.toLowerCase();
            const bgVariants = [areaBg,'#0f172a','rgb(15, 23, 42)','rgba(15,23,42,0.85)','rgba(15, 23, 42, 0.85)'];
            let pool = VISIBLE_COLORS.slice();
            if(!allowGreen){ pool = pool.filter(c=> c!=='#00b341' && c!=='green'); }
            // סינון צבעי רקע או שקופים
            pool = pool.filter(c=> !bgVariants.includes(c.toLowerCase()) && c.toLowerCase()!=='transparent');
            // פונקציית ניגודיות בסיסית – נמנעים מצבעים כהים מדי
            function luminance(hex){
                const h = hex.replace('#','');
                if(h.length!==6) return 0.5;
                const r=parseInt(h.substring(0,2),16)/255;
                const g=parseInt(h.substring(2,4),16)/255;
                const b=parseInt(h.substring(4,6),16)/255;
                const a=[r,g,b].map(v=> v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4));
                return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
            }
            const bgLum = luminance('#0f172a');
            pool = pool.filter(c=> luminance(c) > bgLum + 0.1); // שיהיה לפחות קצת בהיר יותר מהרקע
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
            this.renderStimulus(shape,color); // תמיד מציג צורה – אין רווחים
            this.updateStats();
        }
        renderStimulus(shape,color){
            if(!this.area) return;
            this.updateAreaSize(); // עדכון גבולות לפני רינדור
            const stage = this.area.querySelector('.shape-stage');
            if(!stage){ console.warn('[reaction] missing stage'); return; }
            const prev = stage.lastElementChild;
            const size = 110;
            // צבע רקע אזור
            const areaBg = getComputedStyle(this.area).backgroundColor.toLowerCase();
            if(!color || color.toLowerCase()==='transparent' || color.toLowerCase()==='inherit' || color.toLowerCase()===areaBg){
                color=this.safeColor(shape!=='square');
            }
            if(!color){ color='#ff3131'; }
            const padding = parseInt(getComputedStyle(this.area).paddingLeft)||10;
            const innerW = this.area.clientWidth - padding*2;
            const innerH = this.area.clientHeight - padding*2;
            // אלמנט חדש
            const wrapper=document.createElement('div');
            wrapper.className='stim-wrapper';
            wrapper.style.position='absolute';
            wrapper.style.width=size+'px';
            wrapper.style.height=size+'px';
            // בחירת מיקום
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
            // ציור צורה פנימית (כדי שמשולש לא יהיה width/height=0 של wrapper)
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
            // הסרת הקודם אחרי הוספת החדש (למניעת פריים ריק)
            if(prev){ prev.remove(); }
            // Fallback: אם משום מה לא נראה, רנדר ריבוע אדום במרכז
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
        renderFiller(elapsed){
            if((performance.now()-this.startTimeMs)/1000 >= this.durationSec){ this.finish(); return; }
            const shape = this.shapes[Math.floor(Math.random()*this.shapes.length)];
            let color;
            do { color = COLORS[Math.floor(Math.random()*COLORS.length)]; } while(shape==='square' && color==='green');
            this.renderStimulus(shape,color);
        }
        handleSpacePress(){
            if(this.state!=='run'){
                if(this.state==='done'){ this.startSeries(); }
                return;
            }
            if(this.targetActive){
                if(!this.targetClicked){
                    const rt = performance.now()-this.currentStimStart; this.times.push(rt); this.targetClicked=true;
                } else {
                    this.mistakes++;
                }
            } else {
                this.mistakes++;
            }
            this.updateStats();
        }
        handleClick(){ /* מושבת – משתמשים ב-space */ }
        finish(){
            this.state='done';
            if(this.targetActive && !this.targetClicked){ this.missedTargets++; }
            const mistakesTotal = this.mistakes + this.missedTargets;
            const expectedCycles = Math.max(this.patternLength, Math.floor(this.durationSec/this.shapeDisplaySec));
            const penaltyPerMistake = 100 / (expectedCycles*1.1);
            const finalScore = clamp(100 - mistakesTotal*penaltyPerMistake,0,100);
            const g=window.getGlobalScale? window.getGlobalScale():{min:1,max:7}; const scaled = g.min + (finalScore/100)*(g.max-g.min);
            const isAdmin=this.isAdmin();
            if(isAdmin){
              if(this.scoreValue) this.scoreValue.textContent=scaled.toFixed(2);
            }
            if(this.area){ this.area.innerHTML=''; }
            if (window.exitFullscreenMode) window.exitFullscreenMode();
            if (window.testAuth) { window.testAuth.markTestCompleted('reaction'); window.testAuth.showTestCompleteModal('reaction', scaled.toFixed(2)); }
            if(this.intervalId){ clearInterval(this.intervalId); this.intervalId=null; }
            if(this._onResize){ window.removeEventListener('resize', this._onResize); this._onResize=null; }
            if(this._keyHandler){ document.removeEventListener('keydown', this._keyHandler); this._keyHandler=null; }
            if(this.area){ this.area.style.pointerEvents='auto'; this.area.style.cursor='default'; }
        }
        updateStats(){
            if(!this.isAdmin()) return; // לא מעדכן סטטיסטיקות למשתמש רגיל
            if(this.attemptEl) this.attemptEl.textContent=this.targetCount+'/'+this.targetGoal;
            if(this.lastEl) this.lastEl.textContent=this.times.length?this.times[this.times.length-1].toFixed(0):'-';
            const avg=mean(this.times); const sd=stddev(this.times);
            if(this.avgEl) this.avgEl.textContent=this.times.length?avg.toFixed(0):'-';
            if(this.stdEl) this.stdEl.textContent=this.times.length?sd.toFixed(0):'-';
        }
        runLoop(){ /* בוטל – משתמשים באינטרוול רציף ללא רווח */ }
    }
    document.addEventListener('DOMContentLoaded',()=>{ window.reactionTest=new ReactionTest(); });
})();