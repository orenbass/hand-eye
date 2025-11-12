// Tracking / Sustained Attention Test Module
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
            this.duration=30000;
            this.startTime=0;
            this.lastTime=0;
            this.inTime=0;
            this.outs=0;
            this.running=false;
            this.lastInside=false;
            this.animId=null;
            this.target={x:100,y:100,r:45,vx:180,vy:130};
            this.resize();
            this.bind();
        }
        resize(){
            if(!this.canvas) return;
            const size = Math.floor(window.innerHeight * 0.8); // square side based on 80% viewport height
            this.canvas.width = size;
            this.canvas.height = size;
            this.canvas.style.width = size + 'px';
            this.canvas.style.height = size + 'px';
            this.canvas.style.display = 'block';
            // target radius proportional to square size
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
        }
        start(){
            if(this.running) return;
            if (window.enterFullscreenMode) window.enterFullscreenMode();
            this.resize();
            requestAnimationFrame(()=>this.resize());
            this.reset();
            if(window.testAuth && !window.testAuth.isAdmin()) { this.statsBox.style.display='none'; } else { this.statsBox.style.display='block'; }
            this.running=true;
            this.startTime=performance.now();
            this.lastTime=this.startTime;
            console.log('[tracking] start', {duration:this.duration/1000, radius:this.target.r, canvas:{w:this.canvas.width,h:this.canvas.height}});
            this.loop();
        }
        reset(){
            this.inTime=0;
            this.outs=0;
            this.lastInside=false;
            if(this.running){
                this.running=false;
                cancelAnimationFrame(this.animId);
            }
        }
        loop(){
            if(!this.running) return;
            const now=performance.now();
            const dt=(now-this.lastTime)/1000;
            this.lastTime=now;
            this.target.x+=this.target.vx*dt;
            this.target.y+=this.target.vy*dt;
            if(this.target.x<this.target.r||this.target.x>this.canvas.width-this.target.r) this.target.vx*=-1;
            if(this.target.y<this.target.r||this.target.y>this.canvas.height-this.target.r) this.target.vy*=-1;
            this.target.vx+=(Math.random()-0.5)*40;
            this.target.vy+=(Math.random()-0.5)*40;
            this.target.vx=clamp(this.target.vx,-300,300);
            this.target.vy=clamp(this.target.vy,-300,300);
            this.draw();
            if(this.lastInside) this.inTime+=dt;
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
            this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
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
            const score=clamp(insidePercent-this.outs*2,0,100);
            this.inEl.textContent=insidePercent.toFixed(1)+'%';
            this.outsEl.textContent=this.outs;
            if(!(window.testAuth && !window.testAuth.isAdmin())){ this.scoreEl.textContent=score.toFixed(0); }
        }
        finish(){
            this.running=false;
            cancelAnimationFrame(this.animId);
            
            if (window.exitFullscreenMode) window.exitFullscreenMode();
            
            const elapsed = this.duration / 1000;
            const insidePercent = (this.inTime / elapsed) * 100;
            const score = clamp(insidePercent - this.outs * 2, 0, 100);
            const g = window.getGlobalScale ? window.getGlobalScale() : {min:1, max:7};
            const scaled = g.min + (score / 100) * (g.max - g.min);
            if(!(window.testAuth && !window.testAuth.isAdmin())){ /* הצגת ציון רק לאדמין */ }
            
            // Mark test as completed and show modal
            if (window.testAuth) {
                window.testAuth.markTestCompleted('tracking');
                window.testAuth.showTestCompleteModal('tracking', scaled.toFixed(2));
            }
        }
    }
    document.addEventListener('DOMContentLoaded',()=>{ window.trackingTest=new TrackingTest(); });
})();