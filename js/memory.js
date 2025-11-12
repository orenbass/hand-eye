// Spatial Memory Test Module
(function(){
    class MemoryTest {
        constructor(){
            this.gridEl=document.getElementById('memory-grid');
            this.lengthEl=document.getElementById('memory-length');
            this.maxEl=document.getElementById('memory-max');
            this.statsBox=document.getElementById('memory-stats');
            this.size=5; this.sequence=[]; this.userIndex=0; this.currentLength=3; this.maxAchieved=0; this.phase='idle'; this.cells=[]; this.timeoutIds=[];
            this.bind();
        }
        bind(){ const btn=document.getElementById('start-memory-button'); if(btn) btn.addEventListener('click',()=>this.start()); this.renderGrid(); }
        renderGrid(){ if(!this.gridEl) return; this.gridEl.innerHTML=''; this.cells=[]; for(let i=0;i<this.size*this.size;i++){ const div=document.createElement('div'); div.className='memory-cell'; div.dataset.index=i; div.addEventListener('click',()=>this.handleCell(i)); this.gridEl.appendChild(div); this.cells.push(div);} }
        start(){ 
            if(this.phase==='show') return; 
            if (window.enterFullscreenMode) window.enterFullscreenMode();
            this.currentLength=3; this.maxAchieved=0; 
            if(window.testAuth && !window.testAuth.isAdmin()) { this.statsBox.style.display='none'; } else { this.statsBox.style.display='block'; }
            this.runRound(); 
        }
        runRound(){ this.phase='show'; this.sequence=[]; this.userIndex=0; const totalCells=this.size*this.size; while(this.sequence.length<this.currentLength){ const idx=Math.floor(Math.random()*totalCells); if(!this.sequence.includes(idx)) this.sequence.push(idx);} let delay=500; this.sequence.forEach((idx,step)=>{ const id=setTimeout(()=>{ this.highlight(idx); setTimeout(()=>this.unhighlight(idx),500); if(step===this.sequence.length-1){ setTimeout(()=>{ this.phase='input'; },600);} },delay); delay+=900; this.timeoutIds.push(id); }); this.updateStats(); }
        highlight(i){ this.cells[i].classList.add('on'); }
        unhighlight(i){ this.cells[i].classList.remove('on'); }
        handleCell(i){ if(this.phase!=='input') return; const expected=this.sequence[this.userIndex]; if(i===expected){ this.flash(i,'correct'); this.userIndex++; if(this.userIndex===this.sequence.length){ this.maxAchieved=Math.max(this.maxAchieved,this.currentLength); this.currentLength++; setTimeout(()=>this.runRound(),800);} } else { this.flash(i,'wrong'); this.finish(); } this.updateStats(); }
        flash(i,cls){ const cell=this.cells[i]; cell.classList.add(cls); setTimeout(()=>cell.classList.remove(cls),500); }
        finish(){
            this.phase='done'; 
            this.lengthEl.textContent=this.currentLength-1; 
            this.maxEl.textContent=this.maxAchieved; 
            
            if (window.exitFullscreenMode) window.exitFullscreenMode();
            
            // Mark test as completed and show modal
            const finalScore = this.maxAchieved;
            const g = window.getGlobalScale ? window.getGlobalScale() : {min:1, max:7};
            const normalized = Math.min(100, (finalScore / 10) * 100); // Normalize to 0-100
            const scaled = g.min + (normalized / 100) * (g.max - g.min);
            
            if (window.testAuth) {
                window.testAuth.markTestCompleted('memory');
                if(window.testAuth && !window.testAuth.isAdmin()) { /* לא מציג ציון למשתמש רגיל */ } else { /* ניתן היה להציג לוג */ }
                window.testAuth.showTestCompleteModal('memory', scaled.toFixed(2));
            }
        }
        updateStats(){ this.lengthEl.textContent=this.currentLength; this.maxEl.textContent=this.maxAchieved; }
    }
    document.addEventListener('DOMContentLoaded',()=>{ window.memoryTest=new MemoryTest(); });
})();