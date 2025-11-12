// Path Navigation Test (integrated)
(function(){
  const btn=document.getElementById('start-pathnav');
  const canvas=document.getElementById('pathnav-canvas');
  const timeEl=document.getElementById('pathnav-time');
  const scoreEl=document.getElementById('pathnav-score');
  const statsBox=document.getElementById('pathnav-stats');
  if(!btn||!canvas) return;
  const ctx=canvas.getContext('2d');
  
  // Generate random road map image
  function generateRandomRoadMap(width=1200, height=800) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Background - grass/terrain
    const gradient = tempCtx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#8FBC8F');
    gradient.addColorStop(0.5, '#90EE90');
    gradient.addColorStop(1, '#9ACD32');
    tempCtx.fillStyle = gradient;
    tempCtx.fillRect(0, 0, width, height);
    
    // Add some terrain variation
    for(let i = 0; i < 30; i++) {
      tempCtx.fillStyle = `rgba(107, 142, 35, ${Math.random() * 0.3})`;
      tempCtx.beginPath();
      tempCtx.arc(Math.random() * width, Math.random() * height, 
                  20 + Math.random() * 80, 0, Math.PI * 2);
      tempCtx.fill();
    }
    
    // Draw random roads
    tempCtx.strokeStyle = '#696969';
    tempCtx.lineWidth = 40;
    tempCtx.lineCap = 'round';
    tempCtx.lineJoin = 'round';
    
    const numRoads = 3 + Math.floor(Math.random() * 3);
    for(let i = 0; i < numRoads; i++) {
      tempCtx.beginPath();
      const startX = Math.random() * width;
      const startY = Math.random() * height;
      tempCtx.moveTo(startX, startY);
      
      const segments = 3 + Math.floor(Math.random() * 4);
      for(let j = 0; j < segments; j++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        tempCtx.quadraticCurveTo(
          Math.random() * width, Math.random() * height,
          x, y
        );
      }
      tempCtx.stroke();
    }
    
    // Draw road markings
    tempCtx.strokeStyle = '#FFFF00';
    tempCtx.lineWidth = 2;
    tempCtx.setLineDash([15, 10]);
    
    for(let i = 0; i < numRoads; i++) {
      tempCtx.beginPath();
      const startX = Math.random() * width;
      const startY = Math.random() * height;
      tempCtx.moveTo(startX, startY);
      
      const segments = 3 + Math.floor(Math.random() * 4);
      for(let j = 0; j < segments; j++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        tempCtx.quadraticCurveTo(
          Math.random() * width, Math.random() * height,
          x, y
        );
      }
      tempCtx.stroke();
    }
    tempCtx.setLineDash([]);
    
    // Add some buildings/landmarks
    for(let i = 0; i < 8; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const w = 30 + Math.random() * 50;
      const h = 30 + Math.random() * 50;
      
      tempCtx.fillStyle = '#8B4513';
      tempCtx.fillRect(x, y, w, h);
      tempCtx.strokeStyle = '#654321';
      tempCtx.lineWidth = 2;
      tempCtx.strokeRect(x, y, w, h);
      
      // Roof
      tempCtx.fillStyle = '#DC143C';
      tempCtx.beginPath();
      tempCtx.moveTo(x - 5, y);
      tempCtx.lineTo(x + w/2, y - 20);
      tempCtx.lineTo(x + w + 5, y);
      tempCtx.closePath();
      tempCtx.fill();
    }
    
    return tempCanvas.toDataURL('image/png');
  }
  
  // Generate default route points for random map
  function generateDefaultRoute() {
    return [
      {nx: 0.1, ny: 0.1},
      {nx: 0.3, ny: 0.4},
      {nx: 0.5, ny: 0.3},
      {nx: 0.7, ny: 0.6},
      {nx: 0.9, ny: 0.5}
    ];
  }
  
  function safeScale(){ const g=window.getGlobalScale? window.getGlobalScale():{min:1,max:7}; if(!Number.isFinite(g.min)||!Number.isFinite(g.max)||g.min>=g.max) return {min:1,max:7}; return g; }
  function computeSquareSize(){ return Math.min(Math.floor(window.innerHeight*0.8), Math.floor(window.innerWidth*0.9)); }
  function resize(){ 
    const size=computeSquareSize();
    canvas.width=size; canvas.height=size; canvas.style.width=size+'px'; canvas.style.height=size+'px';
    if(canvas.width<50){ setTimeout(resize,120); return; }
    canvas.style.display='block';
  }
  resize();
  window.addEventListener('resize', ()=> running && resize());
  
  let running=false, lastTs=0, timeLeft=0;
  let player, keys={ArrowUp:0,ArrowDown:0,ArrowLeft:0,ArrowRight:0}, trace, img=new Image(), imgReady=false, ptsCanvas=[];
  function scaleScore(r){ const g=safeScale(); return g.min + r*(g.max-g.min); }
  function fmt(sec){ const s=Math.floor(sec%60), m=Math.floor(sec/60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  function fitContain(sw,sh,dw,dh){ const sr=sw/sh, dr=dw/dh; if(sr>dr){ const w=dw,h=w/sr; return {w,h}; } else { const h=dh,w=h*sr; return {w,h}; } }
  function placement(){ const pn=window.getPathNavData(); if(!imgReady) return {ox:0,oy:0,w:canvas.width,h:canvas.height}; const s=fitContain(img.width,img.height, canvas.width, canvas.height); return {ox:(canvas.width-s.w)/2, oy:(canvas.height-s.h)/2, w:s.w, h:s.h}; }
  function distPointToSeg(px,py, ax,ay,bx,by){ const vx=bx-ax, vy=by-ay; const wx=px-ax, wy=py-ay; const c1=vx*wx+vy*wy; if(c1<=0) return Math.hypot(px-ax,py-ay); const c2=vx*vx+vy*vy; if(c2<=c1) return Math.hypot(px-bx,py-by); const t=c1/c2; const qx=ax+t*vx, qy=ay+t*vy; return Math.hypot(px-qx,py-qy);} 
  function distToPolyline(px,py, pts){ let best=1e9; for(let i=0;i<pts.length-1;i++){ const a=pts[i],b=pts[i+1]; const d=distPointToSeg(px,py,a.x,a.y,b.x,b.y); if(d<best) best=d;} return best; }
  function scoreFromDev(avg, plc){ const maxRef=Math.hypot(plc.w, plc.h)/12; const ratio=Math.max(0,1-avg/maxRef); return scaleScore(ratio); }
  function step(ts){ if(!running) return; if(canvas.width<50){ resize(); requestAnimationFrame(step); return; }
    if(!lastTs) lastTs=ts; const dt=Math.min(0.05,(ts-lastTs)/1000); lastTs=ts; timeLeft=Math.max(0,timeLeft-dt); const pn=window.getPathNavData(); const plc=placement();
    ptsCanvas=pn.points.map(p=>({x:plc.ox+p.nx*plc.w, y:plc.oy*p.ny*plc.h})); const endPt=ptsCanvas[ptsCanvas.length-1];
    const sp=player.speed; const ax=(keys.ArrowLeft?-1:0)+(keys.ArrowRight?1:0); const ay=(keys.ArrowUp?-1:0)+(keys.ArrowDown?1:0); player.x+=ax*sp*dt; player.y+=ay*sp*dt; player.x=Math.max(plc.ox,Math.min(plc.ox+plc.w,player.x)); player.y=Math.max(plc.oy,Math.min(plc.oy+plc.h,player.y)); const dev=distToPolyline(player.x,player.y,ptsCanvas); player.accumDev+=dev; player.samples++;
    ctx.clearRect(0,0,canvas.width,canvas.height); if(imgReady) ctx.drawImage(img,plc.ox,plc.oy,plc.w,plc.h); ctx.lineWidth=3; ctx.strokeStyle='rgba(220,220,220,.85)'; ctx.beginPath(); ptsCanvas.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.stroke(); ctx.fillStyle='#10b981'; ctx.beginPath(); if(ptsCanvas[0]) ctx.arc(ptsCanvas[0].x,ptsCanvas[0].y,7,0,Math.PI*2); ctx.fill(); if(endPt){ ctx.fillStyle='#ef4444'; ctx.beginPath(); ctx.arc(endPt.x,endPt.y,7,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='#3b82f6'; ctx.beginPath(); ctx.arc(player.x,player.y,6,0,Math.PI*2); ctx.fill();
    const avgDev=player.accumDev/Math.max(1,player.samples); const sc=scoreFromDev(avgDev, plc); timeEl.textContent=fmt(timeLeft); if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2); }
    const nearFinish=endPt? Math.hypot(player.x-endPt.x, player.y-endPt.y)<18:false; 
    if(timeLeft<=0 || (nearFinish && player.samples>20)){ 
        running=false; 
        if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2)+' (סיום)'; }
        
        if (window.exitFullscreenMode) window.exitFullscreenMode();
        
        // Mark test as completed and show modal
        if (window.testAuth) {
            window.testAuth.markTestCompleted('pathnav');
            window.testAuth.showTestCompleteModal('pathnav', sc.toFixed(2));
        }
        return; 
    }
    requestAnimationFrame(step); }
  function start(){ 
    const cfg=(window.getTestConfig && window.getTestConfig('pathnav'))||{seconds:60,difficulty:'בינוני'}; 
    let pn=window.getPathNavData? window.getPathNavData():{imageDataUrl:'',points:[]}; 
    
    // If no image or route, generate random map
    if(!pn.imageDataUrl || pn.points.length<2){ 
      console.log('[pathnav] No custom map found, generating random road map...');
      pn = {
        imageDataUrl: generateRandomRoadMap(),
        points: generateDefaultRoute(),
        seconds: cfg.seconds
      };
    } 
    
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    resize(); 
    if(window.testAuth && !window.testAuth.isAdmin()) { statsBox.style.display='none'; } else { statsBox.style.display='block'; }
    timeLeft=cfg.seconds; 
    keys={ArrowUp:0,ArrowDown:0,ArrowLeft:0,ArrowRight:0}; 
    player={x:0,y:0,speed: (cfg.difficulty==='קל'?160: cfg.difficulty==='בינוני'?200:240), accumDev:0,samples:0}; 
    running=true; 
    lastTs=0; 
    imgReady=false; 
    console.log('[pathnav] start', {seconds:cfg.seconds, points:pn.points.length}); 
    
    img.onerror = () => {
      running = false;
      if (window.exitFullscreenMode) window.exitFullscreenMode();
      alert('❌ שגיאה בטעינת התמונה\n\nלא ניתן לטעון את תמונת המסלול.');
      
      if (window.testAuth) {
        window.testAuth.markTestCompleted('pathnav');
        window.testAuth.showTestCompleteModal('pathnav', '0.00');
      }
    };
    
    img.onload=()=>{ 
      imgReady=true; 
      const plc=placement(); 
      const pts=pn.points.map(p=>({x:plc.ox+p.nx*plc.w, y:plc.oy*p.ny*plc.h})); 
      if(pts[0]){ 
        player.x=pts[0].x; 
        player.y=pts[0].y; 
      } 
      requestAnimationFrame(step); 
    }; 
    
    img.src=pn.imageDataUrl; 
    setTimeout(resize,80); 
  }
  window.addEventListener('keydown',e=>{ if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){ keys[e.key]=1; e.preventDefault(); }});
  window.addEventListener('keyup',e=>{ if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){ keys[e.key]=0; e.preventDefault(); }});
  btn.addEventListener('click', start);
})();