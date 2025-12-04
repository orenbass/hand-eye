// Flight Control Test (simplified)
(function(){
  const btn=document.getElementById('start-flightcontrol');
  const canvas=document.getElementById('flightcontrol-canvas');
  const timeEl=document.getElementById('flightcontrol-time');
  const scoreEl=document.getElementById('flightcontrol-score');
  const statsBox=document.getElementById('flightcontrol-stats');
  if(!btn||!canvas) return; 
  const ctx=canvas.getContext('2d');
  
  let running=false, lastTs=0, timeLeft=0;
  let cursor={x:0,y:0};
  let keys={};
  let accum=0, samples=0;
  let CX=0, CY=0;

  function safeScale(){
    const g=window.getGlobalScale? window.getGlobalScale():{min:1,max:7};
    if(!Number.isFinite(g.min)||!Number.isFinite(g.max)||g.min>=g.max){
      return {min:1,max:7};
    }
    return g;
  }

  function resize(){
    const size = Math.floor(window.innerHeight * 0.8); // 80% מגובה המסך
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    if(canvas.width < 50){ setTimeout(resize,120); return; }
    canvas.style.display='block';
    CX = size/2;
    CY = size/2;
  }

  resize();
  window.addEventListener('resize', resize);

  function fmt(sec){
    const s=Math.floor(sec%60), m=Math.floor(sec/60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function settingsMaxRadius(){
    return Math.min(canvas.width,canvas.height)/2.6;
  }

  function scoreFromDist(d){
    const g=safeScale();
    const max=settingsMaxRadius();
    const ratio=Math.max(0,1-d/max);
    const raw = g.min + Math.pow(ratio,2.2)*(g.max-g.min);
    return Number.isFinite(raw)? raw: g.min;
  }

  function noise(t,diff){
    const f= diff==='קל'?0.8: diff==='בינוני'?1.0:1.25;
    return {
      x:(Math.sin(t*1.7)+Math.sin(t*2.3+1))*24*f,
      y:(Math.cos(t*1.3)+Math.sin(t*2.7+2))*24*f
    };
  }

  function step(ts){
    if(!running) return;
    if(!lastTs) lastTs=ts;
    const dt=Math.min(0.05,(ts-lastTs)/1000);
    lastTs=ts;
    timeLeft=Math.max(0,timeLeft-dt);
    timeEl.textContent=fmt(timeLeft);

    const cfg=window.getTestConfig('flightcontrol');
    const d=cfg.difficulty;
    const n=noise(performance.now()/1000,d);
    const speed = d==='קל'?160: d==='בינוני'?200:240;

    cursor.x += n.x*dt + ((keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0))*speed*dt;
    cursor.y += n.y*dt + ((keys.ArrowDown?1:0)-(keys.ArrowUp?1:0))*speed*dt;
    cursor.x=Math.max(0,Math.min(canvas.width,cursor.x));
    cursor.y=Math.max(0,Math.min(canvas.height,cursor.y));

    const dist=Math.hypot(cursor.x-CX,cursor.y-CY);
    accum+=dist;
    samples++;
    const avg=accum/Math.max(1,samples);
    const sc=scoreFromDist(avg);
    if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2); }

    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0b1729';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#93a8c7';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(CX,CY,28,0,Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(CX-40,CY);
    ctx.lineTo(CX+40,CY);
    ctx.moveTo(CX,CY-40);
    ctx.lineTo(CX,CY+40);
    ctx.stroke();
    ctx.fillStyle='#22c55e';
    ctx.beginPath();
    ctx.arc(cursor.x,cursor.y,6,0,Math.PI*2);
    ctx.fill();

    if(timeLeft<=0){
      running=false;
      if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2)+' (סיום)'; }
      
      if (window.exitFullscreenMode) window.exitFullscreenMode();
      
      // Mark test as completed and show modal
      if (window.testAuth) {
        window.testAuth.markTestCompleted('flightcontrol');
        window.testAuth.showTestCompleteModal('flightcontrol', sc.toFixed(2));
      }
      return;
    }
    requestAnimationFrame(step);
  }

  function start(){
    const cfg=(window.getTestConfig && window.getTestConfig('flightcontrol'))||{seconds:60,difficulty:'בינוני'};
    if(!cfg.seconds || !Number.isFinite(cfg.seconds)) cfg.seconds=60;
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    resize();
    requestAnimationFrame(()=>resize());
    if(window.testAuth && !window.testAuth.isAdmin()) { statsBox.style.display='none'; } else { statsBox.style.display='block'; }
    timeLeft=cfg.seconds;
    lastTs=0;
    accum=0; samples=0;
    cursor.x = canvas.width/2; // מרכז ריבוע
    cursor.y = canvas.height/2; // מרכז ריבוע
    running=true;
    console.log('[flightcontrol] start', {seconds:cfg.seconds, difficulty:cfg.difficulty, canvas:{w:canvas.width,h:canvas.height}});
    requestAnimationFrame(step);
  }

  window.addEventListener('keydown',e=>{
    if(e.key in keys || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
      keys[e.key]=true;
      e.preventDefault();
    }
  });

  window.addEventListener('keyup',e=>{
    if(e.key in keys || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
      keys[e.key]=false;
      e.preventDefault();
    }
  });

  btn.addEventListener('click', start);
})();