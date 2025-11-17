// Tracking / Sustained Attention Test Module with Number Typing
(function(){
    function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
    class TrackingTest {
        constructor(){
            this.canvas=document.getElementById('tracking-canvas');
            this.ctx=this.canvas?this.canvas.getContext('2d'):null;
            this.inEl=document.getElementById('tracking-in');
            this.outsEl=document.getElementById('tracking-outs');
            this.scoreEl=document.getElementById('tracking-score');
            this.statsBox=document.getElementById('tracking-stats');
            
            // Number display box - external DOM element
            this.numberBoxEl=null;
            
            this.duration=30000;
            this.startTime=0;
            this.lastTime=0;
            this.inTime=0;
            this.outs=0;
            this.running=false;
            this.lastInside=false;
            this.animId=null;
            this.target={x:100,y:100,r:45,vx:0,vy:0,speed:200}; // מהירות קבועה
            
            // Number typing tracking
            this.currentNumber=1;
            this.previousNumber=0; // למניעת חזרה
            this.numberStartTime=0;
            this.numberTimeout=2000; // 2 שניות לכל מספר
            this.totalNumbers=0;
            this.correctClicks=0;
            this.wrongClicks=0;
            this.missedNumbers=0;
            this.numberHistory=[];
            this.lastKeyFeedback=null; // {correct: boolean, time: timestamp}
            
            this.resize();
            this.bind();
        }
        
        createNumberBox(){
            // יצירת תיבת מספרים חיצונית הרחק מהקנבס
            const container = this.canvas.parentElement;
            if(!container) return;
            
            // הסרת תיבה קיימת אם יש
            if(this.numberBoxEl) this.numberBoxEl.remove();
            
            this.numberBoxEl = document.createElement('div');
            this.numberBoxEl.style.cssText = `
                position: absolute;
                left: -260px;
                top: 50%;
                transform: translateY(-50%);
                width: 220px;
                height: 220px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 20px;
                box-shadow: 0 15px 40px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100;
            `;
            
            // תצוגת המספר בלבד - גדול ובולט
            const numberDisplay = document.createElement('div');
            numberDisplay.id = 'tracking-number-display';
            numberDisplay.style.cssText = `
                font-size: 140px;
                font-weight: 800;
                color: white;
                text-shadow: 0 4px 12px rgba(0,0,0,0.4);
                user-select: none;
            `;
            numberDisplay.textContent = '1';
            
            this.numberBoxEl.appendChild(numberDisplay);
            container.appendChild(this.numberBoxEl);
        }
        
        updateNumberDisplay(){
            if(!this.running) return; // בדיקה שהמבחן עדיין רץ
            const display = document.getElementById('tracking-number-display');
            if(!display || !this.numberBoxEl) return; // בדיקה גם לתיבת המספרים
            
            display.textContent = this.currentNumber;
            
            // אנימציה קצרה למספר חדש
            display.style.transform = 'scale(1.15)';
            setTimeout(()=> {
                if(!this.running) return; // בדיקה שהמבחן עדיין רץ
                if(display && display.style) display.style.transform = 'scale(1)';
            }, 150);
            
            // פידבק צבע על לחיצה
            if(this.lastKeyFeedback && (performance.now() - this.lastKeyFeedback.time < 400)){
                const color = this.lastKeyFeedback.correct ? '#10b981' : '#ef4444';
                if(this.numberBoxEl && this.numberBoxEl.style) {
                    this.numberBoxEl.style.background = color;
                    setTimeout(()=>{
                        if(!this.running) return; // בדיקה שהמבחן עדיין רץ
                        if(this.numberBoxEl && this.numberBoxEl.style) {
                            this.numberBoxEl.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                        }
                    }, 300);
                }
            }
        }
        
        handleNumberKey(key){
            if(!this.running) return;
            
            const pressedNumber = parseInt(key);
            if(isNaN(pressedNumber) || pressedNumber < 1 || pressedNumber > 4) return;
            
            const now = performance.now();
            const reactionTime = now - this.numberStartTime;
            
            if(pressedNumber === this.currentNumber){
                // לחיצה נכונה
                this.correctClicks++;
                this.numberHistory.push({number:this.currentNumber, correct:true, time:reactionTime});
                this.lastKeyFeedback = {correct: true, time: now};
                this.nextNumber();
            } else {
                // לחיצה שגויה
                this.wrongClicks++;
                this.numberHistory.push({number:this.currentNumber, correct:false, time:reactionTime});
                this.lastKeyFeedback = {correct: false, time: now};
            }
            
            this.updateNumberDisplay();
        }
        
        nextNumber(){
            // מספר רנדומלי בין 1 ל-4 - ללא חזרה על הקודם
            let nextNum;
            do {
                nextNum = Math.floor(Math.random() * 4) + 1;
            } while (nextNum === this.previousNumber);
            
            this.previousNumber = this.currentNumber;
            this.currentNumber = nextNum;
            this.numberStartTime = performance.now();
            this.updateNumberDisplay();
        }
        
        checkNumberTimeout(){
            if(!this.running) return;
            
            const now = performance.now();
            const elapsed = now - this.numberStartTime;
            
            // אם עברו 2 שניות ולא לחצו - החלף מספר
            if(elapsed >= this.numberTimeout){
                this.missedNumbers++;
                this.numberHistory.push({number:this.currentNumber, correct:false, time:this.numberTimeout, missed:true});
                this.nextNumber();
            }
        }
        
        initTargetVelocity(){
            // אתחול כיוון רנדומלי עם מהירות קבועה
            const angle = Math.random() * Math.PI * 2;
            this.target.vx = Math.cos(angle) * this.target.speed;
            this.target.vy = Math.sin(angle) * this.target.speed;
        }
        
        resize(){
            if(!this.canvas) return;
            // קנבס ריבועי סטנדרטי
            const size = Math.floor(window.innerHeight * 0.8);
            this.canvas.width = size;
            this.canvas.height = size;
            this.canvas.style.width = size + 'px';
            this.canvas.style.height = size + 'px';
            this.canvas.style.display = 'block';
            
            const minDim = size;
            this.target.r = Math.max(30, Math.min(60, Math.round(minDim * 0.055)));
            
            if(!this.running){
                this.target.x = this.canvas.width / 2;
                this.target.y = this.canvas.height / 2;
            }
        }
        
        bind(){
            const btn=document.getElementById('start-tracking-button');
            if(btn) btn.addEventListener('click',()=>this.start());
            if(this.canvas) this.canvas.addEventListener('mousemove',e=>this.handleMove(e));
            window.addEventListener('resize', ()=>{ if(!this.running) this.resize(); });
            
            // מאזין למקלדת
            document.addEventListener('keydown', (e)=>{
                if(!this.running) return;
                if(['1','2','3','4'].includes(e.key)){
                    e.preventDefault();
                    this.handleNumberKey(e.key);
                }
            });
        }
        
        start(){
            if(this.running) return;
            
            const cfg = window.getTestConfig ? window.getTestConfig('tracking') : null;
            if(cfg) this.duration = (cfg.seconds || 30) * 1000;
            
            this.totalNumbers = Math.floor(this.duration / (this.numberTimeout / 1000));
            
            if (window.enterFullscreenMode) window.enterFullscreenMode();
            this.resize();
            requestAnimationFrame(()=>this.resize());
            this.reset();
            this.createNumberBox();
            this.initTargetVelocity(); // אתחול מהירות קבועה
            
            if(window.testAuth && !window.testAuth.isAdmin()) { 
                this.statsBox.style.display='none'; 
            } else { 
                this.statsBox.style.display='block'; 
            }
            
            this.running=true;
            this.startTime=performance.now();
            this.lastTime=this.startTime;
            this.numberStartTime=this.startTime;
            
            console.log('[tracking] start', {
                duration:this.duration/1000, 
                radius:this.target.r, 
                speed:this.target.speed,
                canvas:{w:this.canvas.width,h:this.canvas.height},
                totalNumbers: this.totalNumbers,
                numberTimeout: this.numberTimeout/1000
            });
            
            this.loop();
        }
        
        reset(){
            this.inTime=0;
            this.outs=0;
            this.lastInside=false;
            this.currentNumber=1;
            this.previousNumber=0;
            this.correctClicks=0;
            this.wrongClicks=0;
            this.missedNumbers=0;
            this.numberHistory=[];
            this.lastKeyFeedback=null;
            
            if(this.running){
                this.running=false;
                cancelAnimationFrame(this.animId);
            }
            
            if(this.numberBoxEl) {
                this.numberBoxEl.remove();
                this.numberBoxEl = null;
            }
        }
        
        loop(){
            if(!this.running) return;
            const now=performance.now();
            const dt=(now-this.lastTime)/1000;
            this.lastTime=now;
            
            // תנועה במהירות קבועה
            this.target.x += this.target.vx * dt;
            this.target.y += this.target.vy * dt;
            
            // החזרה מהקירות - שמירה על מהירות קבועה
            if(this.target.x < this.target.r || this.target.x > this.canvas.width - this.target.r) {
                this.target.vx *= -1;
                this.target.x = clamp(this.target.x, this.target.r, this.canvas.width - this.target.r);
            }
            if(this.target.y < this.target.r || this.target.y > this.canvas.height - this.target.r) {
                this.target.vy *= -1;
                this.target.y = clamp(this.target.y, this.target.r, this.canvas.height - this.target.r);
            }
            
            // נרמול מהירות למקרה של סטיות (שמירה על מהירות קבועה)
            const currentSpeed = Math.sqrt(this.target.vx**2 + this.target.vy**2);
            if(Math.abs(currentSpeed - this.target.speed) > 1) {
                const factor = this.target.speed / currentSpeed;
                this.target.vx *= factor;
                this.target.vy *= factor;
            }
            
            this.draw();
            
            if(this.lastInside) this.inTime+=dt;
            
            // בדיקת timeout למספר
            this.checkNumberTimeout();
            
            this.updateStats(now);
            
            if(now-this.startTime>=this.duration){
                this.finish();
                return;
            }
            this.animId=requestAnimationFrame(()=>this.loop());
        }
        
        handleMove(e){
            if(!this.running) return;
            const rect=this.canvas.getBoundingClientRect();
            const x=(e.clientX-rect.left)*(this.canvas.width/rect.width);
            const y=(e.clientY-rect.top)*(this.canvas.height/rect.height);
            const dx=x-this.target.x;
            const dy=y-this.target.y;
            const inside=(dx*dx+dy*dy)<=this.target.r*this.target.r;
            if(inside!==this.lastInside){
                if(this.lastInside&&!inside) this.outs++;
                this.lastInside=inside;
            }
        }
        
        draw(){
            // רקע כהה
            this.ctx.fillStyle='#0f172a';
            this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
            
            // ציור העיגול הנע במרכז
            this.ctx.beginPath();
            this.ctx.arc(this.target.x,this.target.y,this.target.r,0,Math.PI*2);
            this.ctx.fillStyle='#4CAF50';
            this.ctx.fill();
            this.ctx.lineWidth=4;
            this.ctx.strokeStyle=this.lastInside?'#00bcd4':'#f44336';
            this.ctx.stroke();
        }
        
        updateStats(now){
            const elapsed=(now-this.startTime)/1000;
            const insidePercent=(this.inTime/elapsed)*100;
            
            // חישוב ציון מעקב (50%)
            const trackingScore = clamp(insidePercent - this.outs * 2, 0, 100);
            
            // חישוב ציון לחיצות מספרים (50%)
            const totalAttempts = this.correctClicks + this.wrongClicks + this.missedNumbers;
            const clickAccuracy = totalAttempts > 0 ? (this.correctClicks / totalAttempts) * 100 : 100;
            
            // ציון משוקלל סופי
            const finalScore = (trackingScore * 0.5) + (clickAccuracy * 0.5);
            
            this.inEl.textContent=insidePercent.toFixed(1)+'%';
            this.outsEl.textContent=this.outs;
            
            if(!(window.testAuth && !window.testAuth.isAdmin())){ 
                this.scoreEl.textContent=finalScore.toFixed(0) + ` (מעקב:${trackingScore.toFixed(0)} | מספרים:${clickAccuracy.toFixed(0)})`; 
            }
        }
        
        finish(){
            this.running=false;
            cancelAnimationFrame(this.animId);
            
            if (window.exitFullscreenMode) window.exitFullscreenMode();
            
            const elapsed = this.duration / 1000;
            const insidePercent = (this.inTime / elapsed) * 100;
            
            // חישוב ציון מעקב (50%)
            const trackingScore = clamp(insidePercent - this.outs * 2, 0, 100);
            
            // חישוב ציון לחיצות מספרים (50%)
            const totalAttempts = this.correctClicks + this.wrongClicks + this.missedNumbers;
            const clickAccuracy = totalAttempts > 0 ? (this.correctClicks / totalAttempts) * 100 : 100;
            
            // ציון משוקלל סופי
            const finalScore = (trackingScore * 0.5) + (clickAccuracy * 0.5);
            
            console.log('[tracking] finish', {
                tracking: {insidePercent, outs:this.outs, score:trackingScore},
                numbers: {correct:this.correctClicks, wrong:this.wrongClicks, missed:this.missedNumbers, accuracy:clickAccuracy},
                finalScore
            });
            
            const g = window.getGlobalScale ? window.getGlobalScale() : {min:1, max:7};
            const scaled = g.min + (finalScore / 100) * (g.max - g.min);
            
            // הסרת תיבת המספרים
            if(this.numberBoxEl) {
                this.numberBoxEl.remove();
                this.numberBoxEl = null;
            }
            
            // Mark test as completed and show modal
            if (window.testAuth) {
                window.testAuth.markTestCompleted('tracking');
                window.testAuth.showTestCompleteModal('tracking', scaled.toFixed(2));
            }
        }
    }
    document.addEventListener('DOMContentLoaded',()=>{ window.trackingTest=new TrackingTest(); });
})();