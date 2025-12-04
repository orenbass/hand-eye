// Reaction Time Test Module
(function(){
    function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
    function mean(arr){return arr.reduce((a,b)=>a+b,0)/arr.length;}
    function stddev(arr){const m=mean(arr);return Math.sqrt(arr.reduce((s,v)=>s+(v-m)*(v-m),0)/arr.length||0);}    
    class ReactionTest {
        constructor(){
            this.attempts=0;this.maxAttempts=8;this.times=[];this.falseStarts=0;this.state='idle';
            this.startTime=0;this.timeoutId=null;
            this.area=document.getElementById('reaction-area');
            this.statusEl=document.getElementById('reaction-status');
            this.statsBox=document.getElementById('reaction-stats');
            this.attemptEl=document.getElementById('reaction-attempt');
            this.lastEl=document.getElementById('reaction-last');
            this.avgEl=document.getElementById('reaction-avg');
            this.stdEl=document.getElementById('reaction-std');
            this.bind();
        }
        bind(){
            const startBtn=document.getElementById('start-reaction-button');
            if(startBtn) startBtn.addEventListener('click',()=>this.startSeries());
            if(this.area) this.area.addEventListener('click',()=>this.handleClick());
        }
        startSeries(){
            if(this.state==='waiting'||this.state==='ready')return;
            if (window.enterFullscreenMode) window.enterFullscreenMode();
            this.attempts=0;this.times=[];this.falseStarts=0;this.state='idle';
            if(window.testAuth && !window.testAuth.isAdmin()) { this.statsBox.style.display='none'; } else { this.statsBox.style.display='block'; }
            this.nextAttempt();
        }
        nextAttempt(){
            if(this.attempts>=this.maxAttempts){this.finish();return;}
            this.attempts++;this.updateStats();this.state='waiting';
            this.area.className='reaction-area waiting';
            this.statusEl.textContent='המתן...';
            const delay=800+Math.random()*1700;
            clearTimeout(this.timeoutId);
            this.timeoutId=setTimeout(()=>{this.state='ready';this.startTime=performance.now();this.area.className='reaction-area ready';this.statusEl.textContent='לחץ עכשיו!';},delay);
        }
        handleClick(){
            if(this.state==='waiting'){
                this.falseStarts++;this.updateStats();this.statusEl.textContent='זינוק שווא';this.area.className='reaction-area false';
                clearTimeout(this.timeoutId);setTimeout(()=>this.nextAttempt(),700);
            } else if(this.state==='ready') {
                const rt=performance.now()-this.startTime;this.times.push(rt);this.updateStats();this.statusEl.textContent=rt.toFixed(0)+' ms';
                this.area.className='reaction-area result';setTimeout(()=>this.nextAttempt(),700);
            } else if(this.state==='done'){this.startSeries();}
        }
        finish(){
            const avg=mean(this.times)||0; const sd=stddev(this.times)||0;
            const avgComponent=100-((avg-150)/200)*60; const sdComponent=40-(sd/avg)*40; const falseComponent=30-this.falseStarts*5;
            const raw=avgComponent+sdComponent+falseComponent; const finalScore=clamp((raw/170)*100,0,100);
            const g=window.getGlobalScale? window.getGlobalScale():{min:1,max:7}; const scaled = g.min + (finalScore/100)*(g.max-g.min);
            this.statusEl.textContent='סיום'; if(!(window.testAuth && !window.testAuth.isAdmin())){ /* לא מציג ציון למשתמש רגיל */ } else { this.statusEl.textContent='סיום | ציון: '+scaled.toFixed(2); }
            this.area.className='reaction-area done';
            this.state='done';
            
            if (window.exitFullscreenMode) window.exitFullscreenMode();
            
            // Mark test as completed and show modal
            if (window.testAuth) {
                window.testAuth.markTestCompleted('reaction');
                window.testAuth.showTestCompleteModal('reaction', scaled.toFixed(2));
            }
        }
        updateStats(){
            this.attemptEl.textContent=this.attempts+'/'+this.maxAttempts;
            this.lastEl.textContent=this.times.length?this.times[this.times.length-1].toFixed(0):'-';
            const avg=mean(this.times)||0; const sd=stddev(this.times)||0;
            this.avgEl.textContent=this.times.length?avg.toFixed(0):'-';
            this.stdEl.textContent=this.times.length?sd.toFixed(0):'-';
        }
    }
    document.addEventListener('DOMContentLoaded',()=>{ window.reactionTest=new ReactionTest(); });
})();