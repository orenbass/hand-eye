// Target Identification / Shooting Test (simplified)
(function(){
  const btn=document.getElementById('start-targetid');
  const canvas=document.getElementById('targetid-canvas');
  const timeEl=document.getElementById('targetid-time');
  const scoreEl=document.getElementById('targetid-score');
  const statsBox=document.getElementById('targetid-stats');
  if(!btn||!canvas) return; 
  const ctx=canvas.getContext('2d');

  canvas.style.cursor='none';
  let running=false, lastTs=0, timeLeft=0;
  let mouse={x:0,y:0};
  let targets=[];
  let hits=0, shots=0, wrong=0, lastSpawn=0;
  let spawnRate=1, speed=120;

  function resize(){
    const size = Math.floor(window.innerHeight * 0.8); // 80% height square
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    if(canvas.width < 50){ setTimeout(resize,120); return; }
    canvas.style.display = 'block';
  }

  resize();
  window.addEventListener('resize', resize);

  function fmt(sec){
    const s=Math.floor(sec%60), m=Math.floor(sec/60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function rng(s0){
    let s=s0>>>0;
    return ()=> (s=(s*1664525+1013904223)>>>0)/4294967296;
  }
  const rnd=rng(987654);

  function score(){
    const acc = shots? hits/shots:0;
    const penalty = wrong*0.12;
    const raw=Math.max(0,acc - penalty);
    const g=window.getGlobalScale();
    return g.min + raw*(g.max-g.min);
  }

  function spawn(){
    const good=rnd()<0.65;
    const r=good?12:14;
    const x=rnd()*canvas.width, y=rnd()*canvas.height;
    const ang=rnd()*Math.PI*2;
    const v = speed*(0.7+rnd()*0.6);
    const vx=Math.cos(ang)*v, vy=Math.sin(ang)*v;
    targets.push({x,y,vx,vy,r,good});
  }

  function drawCross(){
    ctx.save();
    ctx.translate(mouse.x,mouse.y);
    ctx.strokeStyle='#e5e7eb';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(-8,0);
    ctx.lineTo(8,0);
    ctx.moveTo(0,-8);
    ctx.lineTo(0,8);
    ctx.stroke();
    ctx.restore();
  }

  function step(ts){
    if(!running) return;
    if(!lastTs) lastTs=ts;
    const dt=Math.min(0.05,(ts-lastTs)/1000);
    lastTs=ts;
    timeLeft=Math.max(0,timeLeft-dt);
    timeEl.textContent=fmt(timeLeft);
    lastSpawn+=dt;
    if(lastSpawn>spawnRate){
      lastSpawn=0;
      spawn();
    }

    targets.forEach(t=>{
      t.x+=t.vx*dt;
      t.y+=t.vy*dt;
      if(t.x<0||t.x>canvas.width) t.vx*=-1;
      if(t.y<0||t.y>canvas.height) t.vy*=-1;
    });

    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0b1729';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    targets.forEach(t=>{
      ctx.beginPath();
      ctx.arc(t.x,t.y,t.r,0,Math.PI*2);
      ctx.fillStyle=t.good? '#22c55e':'#ef4444';
      ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.25)';
      ctx.stroke();
    });

    const sc=score();
    if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2); }
    drawCross();

    if(timeLeft<=0){
      running=false;
      if(!(window.testAuth && !window.testAuth.isAdmin())){ scoreEl.textContent=sc.toFixed(2)+' (סיום)'; }
      canvas.style.cursor='default';
      
      if (window.exitFullscreenMode) window.exitFullscreenMode();
      
      // Mark test as completed and show modal
      if (window.testAuth) {
        window.testAuth.markTestCompleted('targetid');
        window.testAuth.showTestCompleteModal('targetid', sc.toFixed(2));
      }
      return;
    }
    requestAnimationFrame(step);
  }

  function start(){
    const cfg=(window.getTestConfig && window.getTestConfig('targetid'))||{seconds:60,difficulty:'בינוני'};
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    resize();
    requestAnimationFrame(()=>resize());
    if(window.testAuth && !window.testAuth.isAdmin()) { statsBox.style.display='none'; } else { statsBox.style.display='block'; }
    timeLeft=cfg.seconds;
    hits=0;
    shots=0;
    wrong=0;
    targets=[];
    lastSpawn=0;
    running=true;
    lastTs=0;
    speed = cfg.difficulty==='קל'?80: cfg.difficulty==='בינוני'?120:160;
    spawnRate = cfg.difficulty==='קל'?1.2: cfg.difficulty==='בינוני'?0.9:0.7;
    // הצבת הכוונת במרכז בתחילת המבחן
    mouse.x = canvas.width/2;
    mouse.y = canvas.height/2;
    console.log('[targetid] start', {seconds:cfg.seconds, difficulty:cfg.difficulty, canvas:{w:canvas.width,h:canvas.height}});
    requestAnimationFrame(step);
  }

  canvas.addEventListener('mousemove',e=>{
    const r=canvas.getBoundingClientRect();
    mouse.x=e.clientX-r.left;
    mouse.y=e.clientY-r.top;
  });

  canvas.addEventListener('click',()=>{
    if(!running) return;
    shots++;
    for(let i=targets.length-1;i>=0;i--){
      const t=targets[i];
      const d=Math.hypot(mouse.x-t.x, mouse.y-t.y);
      if(d<=t.r+4){
        if(t.good){
          hits++;
        } else {
          wrong++;
        }
        targets.splice(i,1);
        break;
      }
    }
  });

  btn.addEventListener('click', start);
})();