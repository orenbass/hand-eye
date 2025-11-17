// North Find Test - rewritten clean implementation
(function(){
  const btn=document.getElementById('start-northfind');
  const canvas=document.getElementById('northfind-canvas');
  const trialEl=document.getElementById('northfind-trial');
  const totalEl=document.getElementById('northfind-total');
  const avgEl=document.getElementById('northfind-avg');
  const statsBox=document.getElementById('northfind-stats');
  if(!btn||!canvas) return; const ctx=canvas.getContext('2d');

  // --- טעינת תמונות מפה מתיקיית assets ---
  const DEFAULT_MAP_IMAGES = [
    'assets/images/northfind/North_snapshot_11-10-2025_22_59_45.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_00_07.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_03_24.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_03_38.jpeg',
    'assets/images/northfind/North_snapshot_11-10-2025_23_04_05.jpeg'
  ];

  // --- map generation (unchanged idea) ---
  function generateRandomMap(width=800,height=800,seed=0){
    const c=document.createElement('canvas'); c.width=width; c.height=height; const g=c.getContext('2d');
    let s=seed>>>0; const rnd=()=> (s=(s*1664525+1013904223)>>>0)/4294967296;
    const palettes=[['#d9e4cc','#c9d8b6','#b5c59a'],['#e2d7c3','#d3c3a5','#bba27c'],['#c8d6e5','#b1c6dc','#9bb4cf']];
    const pal=palettes[Math.floor(rnd()*palettes.length)];
    const grad=g.createLinearGradient(0,0,width,height); grad.addColorStop(0,pal[0]); grad.addColorStop(.5,pal[1]); grad.addColorStop(1,pal[2]); g.fillStyle=grad; g.fillRect(0,0,width,height);
    for(let i=0;i<100;i++){ g.fillStyle=`rgba(0,0,0,${0.05*rnd()})`; g.beginPath(); g.arc(rnd()*width,rnd()*height,20+rnd()*35,0,Math.PI*2); g.fill(); }
    const vCount=3+Math.floor(rnd()*3), hCount=3+Math.floor(rnd()*3), margin=40; const v=[],h=[]; for(let i=0;i<vCount;i++) v.push(margin+rnd()*(width-2*margin)); for(let i=0;i<hCount;i++) h.push(margin+rnd()*(height-2*margin)); v.sort((a,b)=>a-b); h.sort((a,b)=>a-b);
    g.lineCap='round'; v.forEach(x=>{ g.strokeStyle='#5a5a5a'; g.lineWidth=46; g.beginPath(); g.moveTo(x,margin/2); g.lineTo(x,height-margin/2); g.stroke(); }); h.forEach(y=>{ g.strokeStyle='#5a5a5a'; g.lineWidth=46; g.beginPath(); g.moveTo(margin/2,y); g.lineTo(width-margin/2,y); g.stroke(); });
    v.forEach(x=>{ g.strokeStyle='#7a7a7a'; g.lineWidth=40; g.beginPath(); g.moveTo(x,0); g.lineTo(x,height); g.stroke(); }); h.forEach(y=>{ g.strokeStyle='#7a7a7a'; g.lineWidth=40; g.beginPath(); g.moveTo(0,y); g.lineTo(width,y); g.stroke(); });
    g.setLineDash([22,14]); g.strokeStyle='#e9e08a'; g.lineWidth=4; v.forEach(x=>{ if(rnd()<0.6){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,height); g.stroke(); }}); h.forEach(y=>{ if(rnd()<0.6){ g.beginPath(); g.moveTo(0,y); g.lineTo(width,y); g.stroke(); }}); g.setLineDash([]);
    const roofs=['#b33b2e','#c9531f','#885f2d','#5e6d7a','#7d2f47']; for(let i=0;i<30;i++){ const cx=rnd()*width, cy=rnd()*height; if(v.some(x=>Math.abs(x-cx)<30)||h.some(y=>Math.abs(y-cy)<30)) continue; const w=26+rnd()*36,hg=26+rnd()*36; g.fillStyle=roofs[Math.floor(rnd()*roofs.length)]; g.fillRect(cx-w/2,cy-hg/2,w,hg); g.strokeStyle='rgba(255,255,255,.35)'; g.lineWidth=2; g.strokeRect(cx-w/2+2,cy-hg/2+2,w-4,hg-4); }
    const trees=60+Math.floor(rnd()*40); for(let i=0;i<trees;i++){ const tx=rnd()*width, ty=rnd()*height; if(v.some(x=>Math.abs(x-tx)<26)||h.some(y=>Math.abs(y-ty)<26)) continue; g.fillStyle=`hsl(${90+rnd()*40} 45% ${32+rnd()*20}%)`; g.beginPath(); g.arc(tx,ty,6+rnd()*5,0,Math.PI*2); g.fill(); }
    const vg=g.createRadialGradient(width/2,height/2,width*.2,width/2,height/2,width*.55); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.35)'); g.fillStyle=vg; g.fillRect(0,0,width,height); return c.toDataURL('image/png');
  }
  function generateRandomMaps(count=5){ const arr=[]; for(let i=0;i<count;i++) arr.push(generateRandomMap(800,800,i*777)); return arr; }

  // --- config & state ---
  let trials=5, learnSec=10, spinSec=10, answerSec=10, mapImages=[];
  let currentTrial=0, phase='idle', phaseStartTime=0;
  let mapRotation=0, finalRotation=0; // mapRotation animates to finalRotation during spin
  let northPointAngle=0; // angle on map rim the arrow points to (fixed relative to map)
  let answers=[]; let currentMapImg=null, currentMapReady=false; let mapRadius=0;
  let hoveredArrow=null, selectedArrow=null; const NUM_ARROWS=24; let arrowPositions=[];

  function resize(){ const size=Math.floor(window.innerHeight*0.8); canvas.width=size; canvas.height=size; mapRadius=Math.min(canvas.width,canvas.height)*0.35; }
  resize(); window.addEventListener('resize',()=> phase!=='idle' && resize());

  function cfg(){ 
    const c=window.getNorthConfig? window.getNorthConfig():{}; 
    trials=c.trials||5; 
    learnSec=c.learnSec||10; 
    spinSec=c.spinSec||10; 
    answerSec=c.answerSec||10; 
    // טעינת תמונות מתיקיית assets או מ-localStorage (fallback)
    mapImages = Array.isArray(c.mapImages) && c.mapImages.length ? c.mapImages : DEFAULT_MAP_IMAGES;
  }

  function angularError(a,b){ let d=Math.abs(a-b)%(Math.PI*2); if(d>Math.PI) d=(Math.PI*2)-d; return d; }
  function scoreFromError(err){ const deg=err*180/Math.PI, step=360/NUM_ARROWS; let ratio; if(deg<=step/2) ratio=1; else if(deg<=step*1.5) ratio=.85; else if(deg<=step*2.5) ratio=.7; else if(deg<=step*3.5) ratio=.55; else ratio=Math.max(0,1-deg/180)*.5; const g=window.getGlobalScale? window.getGlobalScale():{min:1,max:7}; return (g.min + ratio*(g.max-g.min)); }

  // --- drawing ---
  function drawMap(){ if(!currentMapReady||!currentMapImg) return; ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.beginPath(); ctx.arc(0,0,mapRadius,0,Math.PI*2); ctx.clip(); ctx.rotate(mapRotation); const size=mapRadius*2; ctx.drawImage(currentMapImg,-size/2,-size/2,size,size); ctx.restore(); ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.strokeStyle='#334155'; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(0,0,mapRadius,0,Math.PI*2); ctx.stroke(); ctx.restore(); }

  function drawLearningArrow(){
    // חץ אלגנטי ברור: בסיס מעוגל עם גרדיאנט, גוף דק, חוד משולש מואר וצל עדין
    const a = northPointAngle + mapRotation;
    const cx = canvas.width/2, cy = canvas.height/2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);

    const baseRadius = 18; // בסיס עגול
    const shaftLen = Math.max(56, mapRadius * 0.22);
    const shaftWidth = 7;
    const tipLen = 30;
    const tipWidth = 26;

    // בסיס עיגול עם גרדיאנט רדיאלי
    const radial = ctx.createRadialGradient(0,0,4,0,0,baseRadius);
    radial.addColorStop(0,'#1e3a8a');
    radial.addColorStop(0.55,'#1e3a8a');
    radial.addColorStop(1,'#0a1e33');
    ctx.fillStyle = radial;
    ctx.beginPath(); ctx.arc(0,0,baseRadius,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.stroke();

    // גוף (שטן) דק עם גרדיאנט קווי
    const shaftGrad = ctx.createLinearGradient(-shaftLen/2,0,shaftLen/2,0);
    shaftGrad.addColorStop(0,'#ffffff');
    shaftGrad.addColorStop(1,'#cde3ff');
    ctx.fillStyle = shaftGrad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-shaftLen/2, -shaftWidth/2, shaftLen, shaftWidth, shaftWidth/2)
                  : ctx.rect(-shaftLen/2, -shaftWidth/2, shaftLen, shaftWidth);
    ctx.fill();
    ctx.strokeStyle = '#0f3a6a'; ctx.lineWidth=1.2; ctx.stroke();

    // חוד משולש עם גרדיאנט חזק
    ctx.beginPath();
    ctx.moveTo(shaftLen/2 + tipLen, 0);
    ctx.lineTo(shaftLen/2, tipWidth/2);
    ctx.lineTo(shaftLen/2, -tipWidth/2);
    ctx.closePath();
    const tipGrad = ctx.createLinearGradient(shaftLen/2,0,shaftLen/2 + tipLen,0);
    tipGrad.addColorStop(0,'#ffffff');
    tipGrad.addColorStop(1,'#3b82f6');
    ctx.fillStyle = tipGrad;
    ctx.fill();
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth=2; ctx.stroke();

    // קו דק מרכזי להדגשה
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-shaftLen/2 + 6, 0); ctx.lineTo(shaftLen/2 + tipLen - 4, 0); ctx.stroke();

    // הצללה עדינה מתחת לחוד
    ctx.save(); ctx.translate(shaftLen/2 + tipLen*0.4, tipWidth*0.05); ctx.rotate(0.08); ctx.globalAlpha=0.22;
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(0,0, tipLen*0.55, tipWidth*0.35, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();

    // נקודת מקור קטנה (עיגול פנימי)
    ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(-shaftLen/2+4,0,5,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke();

    ctx.restore();
  }

  function computeArrowPositions(){ arrowPositions=[]; const step=(Math.PI*2)/NUM_ARROWS; const cx=canvas.width/2, cy=canvas.height/2, r=mapRadius+14; for(let i=0;i<NUM_ARROWS;i++){ const ang=i*step; arrowPositions.push({i, x:cx+Math.cos(ang)*r, y:cy+Math.sin(ang)*r, angle:ang}); } }

  function drawSelectionArrows(){ computeArrowPositions(); arrowPositions.forEach(p=>{ const sz=16; let bg='#1e3a8a'; if(selectedArrow===p.i) bg='#facc15'; else if(hoveredArrow===p.i) bg='#10b981'; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.angle); ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(0,0,sz+8,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(-sz*.8,0); ctx.lineTo(sz*.3,0); ctx.stroke(); const tip=sz+4, base=sz*.65; ctx.translate(-tip/2,0); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(tip,0); ctx.lineTo(0,base); ctx.lineTo(0,-base); ctx.closePath(); ctx.fill(); ctx.strokeStyle= selectedArrow===p.i? '#854d0e':'#1e293b'; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); }); }

  function drawTimer(rem,total){
    // טיימר מינימליסטי: ללא מילוי רק רקע כהה שקוף + טבעת התקדמות ירוקה
    const size=84, pad=16, cx=pad+size/2, cy=pad+size/2, ratio=Math.max(0,rem/total);
    ctx.save(); ctx.translate(cx,cy);
    // רקע שקוף כהה עדין
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(0,0,size/2,0,Math.PI*2); ctx.fill();
    // מסגרת חיצונית דקה ניטרלית
    ctx.strokeStyle='rgba(255,255,255,0.28)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,size/2-2,0,Math.PI*2); ctx.stroke();
    // טבעת התקדמות (ירוק בלבד)
    ctx.strokeStyle='#10b981'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.beginPath(); ctx.arc(0,0,size/2-10,-Math.PI/2,-Math.PI/2+2*Math.PI*ratio); ctx.stroke();
    // טקסט זמן
    ctx.fillStyle='#ffffff'; ctx.font='600 17px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(rem.toFixed(1)+'s',0,2);
    ctx.restore();
  }

  function drawBanner(main,sub){ const h=78,w=Math.min(canvas.width*.72,620),x=(canvas.width-w)/2,y=15; ctx.save(); ctx.fillStyle='rgba(59,130,246,0.9)'; if(ctx.roundRect) ctx.roundRect(x,y,w,h,20); else ctx.fillRect(x,y,w,h); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=3; ctx.strokeRect(x,y,w,h); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font='bold 26px system-ui'; ctx.fillText(main,x+w/2,y+h/2-8); if(sub){ ctx.font='15px system-ui'; ctx.fillStyle='rgba(255,255,255,.95)'; ctx.fillText(sub,x+w/2,y+h/2+18); } ctx.restore(); }

  function render(){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#1e293b'; ctx.fillRect(0,0,canvas.width,canvas.height); drawMap(); if(phase==='learn'){ const el=(performance.now()-phaseStartTime)/1000; drawLearningArrow(); drawTimer(Math.max(0,learnSec-el),learnSec); drawBanner('למד את מיקום החץ','בסיום החץ ייעלם והמפה תסתובב'); } else if(phase==='answer'){ const el=(performance.now()-phaseStartTime)/1000; drawSelectionArrows(); drawTimer(Math.max(0,answerSec-el),answerSec); ctx.fillStyle='#fff'; ctx.font='bold 20px system-ui'; ctx.textAlign='center'; ctx.fillText('בחר לאן החץ מצביע', canvas.width/2, canvas.height-40); } }

  // --- phases ---
  function step(){ if(phase==='idle'||phase==='done') return; const elapsed=(performance.now()-phaseStartTime)/1000; if(phase==='learn'){ if(elapsed>=learnSec){ startSpinPhase(); return; } render(); requestAnimationFrame(step); } else if(phase==='spin'){ // ease spin (non-uniform)
      const t=Math.min(1,elapsed/spinSec); // ease out cubic
      mapRotation = finalRotation * (1 - Math.pow(1-t,3));
      if(elapsed>=spinSec){ mapRotation=finalRotation; startAnswerPhase(); return; }
      render(); requestAnimationFrame(step);
    } else if(phase==='answer'){ if(elapsed>=answerSec){ registerAnswer(null,true); return; } render(); requestAnimationFrame(step); } }

  function startLearnPhase(){ phase='learn'; phaseStartTime=performance.now(); mapRotation=0; northPointAngle=Math.random()*Math.PI*2; hoveredArrow=null; selectedArrow=null; render(); requestAnimationFrame(step); }
  function startSpinPhase(){
    phase='spin';
    phaseStartTime=performance.now();
    // סיבוב מהיר יותר ומספר סיבובים מלאים לפני עצירה
    spinSec = 5; // קיצור זמן הסיבוב
    finalRotation = ((3 + Math.random()*2) * 2 * Math.PI) + Math.random()*2*Math.PI; // 3-5 סיבובים מלאים + הטייה רנדומלית לסיום
    render();
    requestAnimationFrame(step);
  }
  function startAnswerPhase(){ phase='answer'; phaseStartTime=performance.now(); hoveredArrow=null; selectedArrow=null; render(); }

  function registerAnswer(userAngle,timeout){ const correct=(northPointAngle+mapRotation)%(Math.PI*2); const err=userAngle==null? Math.PI: angularError(userAngle,correct); const sc=scoreFromError(err); answers[currentTrial]={correctDeg:(correct*180/Math.PI).toFixed(1), chosenDeg:userAngle==null? null:(userAngle*180/Math.PI).toFixed(1), errDeg:(err*180/Math.PI).toFixed(1), score:sc.toFixed(2), timeout:!!timeout}; currentTrial++; if(trialEl) trialEl.textContent=currentTrial; if(currentTrial>=trials) finishSeries(); else setTimeout(()=>startTrial(),600); }

  function loadMapImage(i){ return new Promise((res,rej)=>{ if(!mapImages[i]) return rej('no map'); const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej('img load fail'); img.src=mapImages[i]; }); }
  async function startTrial(){ if(!Array.isArray(mapImages)||!mapImages.length) mapImages=generateRandomMaps(trials); const idx=currentTrial%mapImages.length; try{ currentMapImg=await loadMapImage(idx); currentMapReady=true; startLearnPhase(); }catch(e){ const fallback=generateRandomMaps(1)[0]; currentMapImg=new Image(); currentMapImg.onload=()=>{ currentMapReady=true; startLearnPhase(); }; currentMapImg.src=fallback; } }

  function finishSeries(){ phase='done'; const avg=answers.reduce((s,a)=>s+(+a.score||0),0)/Math.max(1,answers.length); if(!(window.testAuth && !window.testAuth.isAdmin())){ avgEl && (avgEl.textContent=avg.toFixed(2)); } else { avgEl && avgEl.parentElement && (avgEl.parentElement.style.display='none'); } if(window.testAuth){ window.testAuth.markTestCompleted('northfind'); window.testAuth.showTestCompleteModal('northfind', avg.toFixed(2)); } }

  // --- interaction ---
  function mouseMove(e){ if(phase!=='answer') return; const r=canvas.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top; hoveredArrow=null; for(const p of arrowPositions){ if(Math.hypot(mx-p.x,my-p.y)<=24){ hoveredArrow=p.i; break; } } canvas.style.cursor=hoveredArrow!=null? 'pointer':'default'; }
  function click(e){ if(phase!=='answer') return; if(hoveredArrow!=null){ selectedArrow=hoveredArrow; const chosen=arrowPositions.find(a=>a.i===selectedArrow); chosen && registerAnswer(chosen.angle,false); } }

  function start(){ if(phase!=='idle') return; if(window.enterFullscreenMode) window.enterFullscreenMode(); cfg(); answers=[]; currentTrial=0; mapRotation=0; finalRotation=0; selectedArrow=null; hoveredArrow=null; resize(); if(window.testAuth && !window.testAuth.isAdmin()) statsBox && (statsBox.style.display='none'); else statsBox && (statsBox.style.display='block'); totalEl && (totalEl.textContent=trials); startTrial(); }

  btn.addEventListener('click', start); canvas.addEventListener('mousemove', mouseMove); canvas.addEventListener('click', click);
})();