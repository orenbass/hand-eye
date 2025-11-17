// Flight Exam Test - basic skeleton
(function(){
  const startBtn = document.getElementById('start-flightexam');
  const canvas = document.getElementById('flightexam-canvas');
  const statsBox = document.getElementById('flightexam-stats');
  if(!startBtn || !canvas) return;
  const ctx = canvas.getContext('2d');

  // Config (can be overridden later via settings)
  let durationSec = 20; // זמן ברירת מחדל כולל לשלב הדינמי (legacy)
  let pathDisplaySec = 15; // נטען מההגדרות
  let durationFlightSec = 60; // נטען מההגדרות
  let preFlightDelaySec = 10; // נטען מההגדרות
  let stage = 'idle'; // 'idle' | 'path' | 'loading' | 'flight' | 'preflight'
  let pathImg = null; let pathImgReady = false;
  let testImg = null; let testImgReady = false;
  let pathStartTime = 0;
  let flightStartTime = 0;
  let preFlightStartTime = 0;
  let pathPoints = []; // נקודות המסלול (נורמליזציה x,y)
  let pathTotalLen = 0; // אורך כולל למסלול עבור תנועת המטוס
  let pathCum = []; // אורך מצטבר לכל נקודה
  let active = false;
  let startTime = 0;
  let timerId = null;
  let score = 0;
  let planeNX = 0.5, planeNY = 0.5; // מיקום נורמליזציה של המטוס בזמן טיסה
  let planeHeading = 0; // זווית רדיאנים של המטוס בשלב הטיסה (ללא תיקון OFFSET)
  const PLANE_ROT_OFFSET = Math.PI/4; // סיבוב לצד השני (45° שמאלה במקום ימינה)
  const ROT_STEP = Math.PI/36; // 5° לכל לחיצה חץ (שומר עבור לחיצה קצרה / התאמות עתידיות)
  const FORWARD_SPEED = 0.22; // מהירות קדימה בסיסית (יחידות נורמליזציה לשניה)
  // שינוי: המטוס זז קדימה רק כאשר Space לחוץ (במהירות איטית כמו כעת)
  let slowActive = false; // האם Space מוחזק (מאפשר תנועה קדימה איטית)
  // שינוי: סיבוב רציף מואץ בלחיצה ארוכה על החצים
  const ROT_SPEED_BASE = Math.PI/3; // מהירות סיבוב בסיסית ~60°/שניה
  const ROT_SPEED_MAX = Math.PI; // מהירות סיבוב מירבית ~180°/שניה
  const ROT_ACCEL_TIME = 1.5; // זמן שנדרש להגיע למקסימום (שניות) בלחיצה רציפה
  let keyState = {ArrowLeft:false, ArrowRight:false};
  let rotHoldLeft = 0, rotHoldRight = 0; // זמן החזקה מצטבר לחצים
  let lastFrameTime = 0; // חישוב delta זמן
  let sampleAccum = 0; // צבירת זמן לדגימת דיוק
  let userTrack = []; // דגימות נתיב הטיסה: [{x,y,d}]
  const MAX_DIST_FOR_FULL_SCORE = 0.12; // מרחק נורמליזציה שמעליו הציון יורד ל-0
  let lastDrawBox = null; // שמירת תיבת ציור תמונה לחישוב יחס עכבר
  let distSum = 0, distSamples = 0; // לחישוב ציון קרבה למסלול

  let partsRef = []; // REF לחלקים שנשלפו בתחילת המבחן
  let loadingStarted = false; // דגל למניעת מעבר כפול ל-loading
  let reviewStartTime = 0; // זמן התחלת שלב השוואת מסלול
  const REVIEW_AUTO_SEC = 30; // זמן אוטומטי להצגת ההשוואה לפני סיום (הוגדל ל-30 שניות)
  let reviewActive = false; // דגל האם ההשוואה מוצגת
  const END_REACH_RADIUS = 0.02; // רדיוס נורמליזציה להגעה לנקודת הסיום (אדומה)
  let currentPart = 0; // אינדקס חלק נוכחי
  let partScores = []; // ציונים לכל חלק
  let allTracks = []; // שמירת מסלול משתמש לכל חלק

  canvas.classList.add('dynamic-canvas');
  function adjustLayout(){
    const screen=document.getElementById('flightexam-screen');
    if(screen){
      const area=screen.querySelector('.test-area');
      const wrap=screen.querySelector('.unified-canvas-container');
      if(area){ area.style.maxWidth='none'; area.style.width='100%'; }
      if(wrap){ wrap.style.maxWidth='none'; wrap.style.width='100%'; }
    }
  }

  function resize(){
    adjustLayout();
    if(stage==='path' && pathImgReady && pathImg){
      const availW = Math.floor(window.innerWidth * 0.85); // יותר רוחב
      const availH = Math.floor(window.innerHeight * 0.85);
      const imgRatio = pathImg.height / pathImg.width;
      let w = availW;
      let h = Math.round(w * imgRatio);
      if(h > availH){ h = availH; w = Math.round(h / imgRatio); }
      canvas.width = w; canvas.height = h;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    } else {
      const w = Math.floor(window.innerWidth * 0.85);
      const h = Math.floor(window.innerHeight * 0.7);
      canvas.width = w; canvas.height = h;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
  }
  resize();
  window.addEventListener('resize', ()=> active && resize());

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    if(stage==='path' && pathImgReady){
      // ציור תמונת המסלול במרכז (שומר על יחס ממדים)
      const sw=pathImg.width, sh=pathImg.height, dw=canvas.width, dh=canvas.height;
      const sr=sw/sh, dr=dw/dh; let w,h; if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
      const ox=(dw-w)/2, oy=(dh-h)/2;
      ctx.drawImage(pathImg,ox,oy,w,h);
      // הדגשת המסלול (קו עבה + הצללה) ורק נקודות התחלה/סיום
      if(pathPoints && pathPoints.length){
        ctx.save();
        ctx.lineWidth=8;
        ctx.lineJoin='round';
        ctx.lineCap='round';
        ctx.shadowColor='rgba(59,130,246,0.6)';
        ctx.shadowBlur=20;
        ctx.strokeStyle='#3b82f6';
        ctx.beginPath();
        pathPoints.forEach((p,i)=>{ const x=ox+p.x*w; const y=oy+p.y*h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
        ctx.stroke();
        ctx.restore();
        // נקודות התחלה וסיום בלבד
        const startP=pathPoints[0];
        const endP=pathPoints[pathPoints.length-1];
        if(startP){
          const sx=ox+startP.x*w, sy=oy+startP.y*h;
          ctx.beginPath(); ctx.arc(sx,sy,10,0,Math.PI*2); ctx.fillStyle='#10b981'; ctx.fill();
          ctx.lineWidth=3; ctx.strokeStyle='#ffffff'; ctx.stroke();
        }
        if(endP && endP!==startP){
          const ex=ox+endP.x*w, ey=oy+endP.y*h;
          ctx.beginPath(); ctx.arc(ex,ey,10,0,Math.PI*2); ctx.fillStyle='#ef4444'; ctx.fill();
          ctx.lineWidth=3; ctx.strokeStyle='#ffffff'; ctx.stroke();
        }
      }
      // אנימציית מטוס לאורך המסלול
      if(pathPoints && pathPoints.length >= 2 && pathTotalLen > 0){
        const elapsedPath=(Date.now()-pathStartTime)/1000; const travelFrac = Math.min(1, elapsedPath / pathDisplaySec);
        // מציאת מיקום על המסלול לפי אורך מצטבר
        const targetLen = travelFrac * pathTotalLen;
        // חיפוש אינדקס
        let segIndex = 0; while(segIndex < pathCum.length-1 && pathCum[segIndex+1] < targetLen) segIndex++;
        const segStart = pathPoints[segIndex]; const segEnd = pathPoints[Math.min(segIndex+1, pathPoints.length-1)];
        const segLenStart = pathCum[segIndex]; const segLenEnd = pathCum[Math.min(segIndex+1, pathCum.length-1)];
        const segSpan = Math.max(1e-6, segLenEnd - segLenStart);
        const localT = (targetLen - segLenStart)/segSpan;
        const sw=pathImg.width, sh=pathImg.height, dw=canvas.width, dh=canvas.height;
        const sr=sw/sh, dr=dw/dh; let w,h; if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2;
        const x = ox + (segStart.x + (segEnd.x - segStart.x)*localT)*w;
        const y = oy + (segStart.y + (segEnd.y - segStart.y)*localT)*h;
        const dx = (segEnd.x - segStart.x); const dy = (segEnd.y - segStart.y);
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate(angle + PLANE_ROT_OFFSET); // החלת תיקון זווית
        // ציור מטוס כאימוג'י פשוט במקום גרפיקה וקטורית
        ctx.shadowColor='rgba(0,0,0,0.3)';
        ctx.shadowBlur=12;
        const planeSize = Math.max(32, Math.min(72, Math.round(canvas.width*0.05))); // גודל דינמי
        ctx.font = planeSize + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.fillText('✈️',0,0);
        ctx.restore();
      }
      // שכבת טקסט הסבר וזמן שנותר
      const elapsedPath=(Date.now()-pathStartTime)/1000;
      const remain=Math.max(0, pathDisplaySec - elapsedPath);
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.fillRect(ox, oy, w, 42);
      ctx.fillStyle='#ffffff';
      ctx.font='16px system-ui';
      ctx.textAlign='center';
      ctx.fillText('התבונן במסלול (נותרו '+remain.toFixed(1)+' שניות)', ox+w/2, oy+26);
      if(remain<=0){ // סיום צפייה במסלול -> מעבר לשלב התראה לפני מבחן
        if(stage==='path'){ stage='preflight'; preFlightStartTime=Date.now(); }
      }
    } else if(stage==='preflight') {
      // ציור תמונת המסלול קפואה ברקע (אם קיימת) + שכבת התראה
      if(pathImgReady && pathImg){
        const sw=pathImg.width, sh=pathImg.height, dw=canvas.width, dh=canvas.height; const sr=sw/sh, dr=dw/dh; let w,h; if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; } const ox=(dw-w)/2, oy=(dh-h)/2; ctx.drawImage(pathImg,ox,oy,w,h); }
      const elapsedPre=(Date.now()-preFlightStartTime)/1000; const remainPre=Math.max(0, preFlightDelaySec - elapsedPre);
      // שכבת חצי שקופה
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#ffffff'; ctx.textAlign='center';
      ctx.font='28px system-ui'; ctx.fillText('המבחן יתחיל בעוד', canvas.width/2, canvas.height/2 - 40);
      ctx.font='60px system-ui'; ctx.fillStyle='#3b82f6'; ctx.fillText(remainPre.toFixed(0), canvas.width/2, canvas.height/2 + 10);
      ctx.font='20px system-ui'; ctx.fillStyle='#ffffff'; ctx.fillText('הישאר מוכן – בסיום הספירה תתחיל הטיסה', canvas.width/2, canvas.height/2 + 55);
      // פס התקדמות חזותי
      const barW=Math.min(400, canvas.width*0.6); const barH=20; const bx=(canvas.width-barW)/2; const by=canvas.height/2 + 85; const prog=(preFlightDelaySec - remainPre)/preFlightDelaySec; ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.strokeRect(bx,by,barW,barH); ctx.fillStyle='#3b82f6'; ctx.fillRect(bx,by,barW*prog,barH);
      if(remainPre<=0 && !loadingStarted){
        loadingStarted=true; stage='loading'; testImgReady=false; testImg=null;
        const part=partsRef[currentPart];
        if(part && part.testImg){
          testImg=new Image();
          testImg.onload=()=>{ testImgReady=true; resize(); flightStartTime=Date.now(); stage='flight'; startTime=flightStartTime; initPlaneFromPath(); };
          testImg.onerror=()=>{ console.warn('[flightexam] test image failed to load part', currentPart); flightStartTime=Date.now(); stage='flight'; startTime=flightStartTime; initPlaneFromPath(); };
          testImg.src=part.testImg;
        } else {
          flightStartTime=Date.now(); stage='flight'; startTime=flightStartTime; initPlaneFromPath();
        }
      }
    } else if(stage==='loading') {
      // מסך טעינה ביניים עד שהתמונה השנייה מוכנה
      ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#ffffff'; ctx.font='24px system-ui'; ctx.textAlign='center'; ctx.fillText('טוען תמונת מבחן...', canvas.width/2, canvas.height/2);
    } else if(stage==='flight'){
      // לפני ציור - עדכון תנועה רציפה
      const now=performance.now();
      let dt=0; if(lastFrameTime){ dt=(now-lastFrameTime)/1000; } lastFrameTime=now;
      // סיבוב רציף עם האצה
      if(keyState.ArrowLeft){ rotHoldLeft += dt; const rotSpeed = ROT_SPEED_BASE + (ROT_SPEED_MAX-ROT_SPEED_BASE)*Math.min(1, rotHoldLeft/ROT_ACCEL_TIME); planeHeading -= rotSpeed*dt; }
      else { rotHoldLeft = 0; }
      if(keyState.ArrowRight){ rotHoldRight += dt; const rotSpeed = ROT_SPEED_BASE + (ROT_SPEED_MAX-ROT_SPEED_BASE)*Math.min(1, rotHoldRight/ROT_ACCEL_TIME); planeHeading += rotSpeed*dt; }
      else { rotHoldRight = 0; }
      // תנועה קדימה רק כשה-Space לחוץ במהירות איטית
      if(slowActive){
        const moveSpeed = FORWARD_SPEED*0.5; // שמירה על הקצב האיטי שהיה בלחיצה קודם
        planeNX += Math.cos(planeHeading)*moveSpeed*dt;
        planeNY += Math.sin(planeHeading)*moveSpeed*dt;
        planeNX = Math.max(0,Math.min(1,planeNX));
        planeNY = Math.max(0,Math.min(1,planeNY));
      }
      // זיהוי הגעה לנקודת הסיום (אדומה) -> סיום מיידי
      if(stage==='flight' && pathPoints && pathPoints.length>1){
        const endP = pathPoints[pathPoints.length-1];
        const dx = planeNX - endP.x; const dy = planeNY - endP.y;
        if(dx*dx + dy*dy <= END_REACH_RADIUS*END_REACH_RADIUS){
          finish(); // מעבר להשוואה
        }
      }
      // דגימת מרחק כל 100ms
      sampleAccum += dt;
      if(sampleAccum>=0.1){
        sampleAccum=0;
        const d=closestDistanceToPath(planeNX, planeNY);
        userTrack.push({x:planeNX,y:planeNY,d});
        // חישוב דיוק ממוצע חי
        const avgDist = userTrack.reduce((s,p)=>s+p.d,0)/userTrack.length;
        const accuracy = Math.max(0, Math.min(1, 1 - avgDist/MAX_DIST_FOR_FULL_SCORE));
        score = accuracy*100;
      }
      // ציור תמונת המבחן ללא מסלול
      if(testImgReady){
        const sw=testImg.width, sh=testImg.height, dw=canvas.width, dh=canvas.height;
        const sr=sw/sh, dr=dw/dh; let w,h; if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2; lastDrawBox={ox,oy,w,h};
        ctx.drawImage(testImg,ox,oy,w,h);
        // ציור המטוס (אימוג'י) במיקום הנוכחי
        const x=ox+planeNX*w, y=oy+planeNY*h;
        ctx.save(); ctx.translate(x,y); ctx.rotate(planeHeading + PLANE_ROT_OFFSET);
        ctx.shadowColor='rgba(0,0,0,0.3)'; ctx.shadowBlur=12; const planeSize=Math.max(32, Math.min(72, Math.round(canvas.width*0.05)));
        ctx.font=planeSize+'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('✈️',0,0); ctx.restore();
      }
      // ציור נקודות התחלה/סיום על גבי תמונת הטיסה (ללא קו המסלול)
      if(testImgReady && pathPoints && pathPoints.length){
        const startP=pathPoints[0]; const endP=pathPoints[pathPoints.length-1];
        const sw=testImg.width, sh=testImg.height, dw=canvas.width, dh=canvas.height; const sr=sw/sh, dr=dw/dh; let w,h; if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; }
        const ox=(dw-w)/2, oy=(dh-h)/2;
        if(startP){ const sx=ox+startP.x*w, sy=oy+startP.y*h; ctx.beginPath(); ctx.arc(sx,sy,10,0,Math.PI*2); ctx.fillStyle='#10b981'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle='#ffffff'; ctx.stroke(); }
        if(endP && endP!==startP){ const ex=ox+endP.x*w, ey=oy+endP.y*h; ctx.beginPath(); ctx.arc(ex,ey,10,0,Math.PI*2); ctx.fillStyle='#ef4444'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle='#ffffff'; ctx.stroke(); }
      }
      // שכבת מידע זמן + דיוק
      const elapsed=(Date.now()-flightStartTime)/1000; const remain=Math.max(0,durationFlightSec-elapsed);
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,240,54);
      ctx.fillStyle='#fff'; ctx.font='14px system-ui'; ctx.textAlign='left';
      ctx.fillText('זמן טיסה: '+remain.toFixed(1)+'s', 20,32);
      ctx.fillText('דיוק למסלול: '+score.toFixed(1)+'%', 20,50);
      if(remain<=0){ finish(); }
    } else if(stage==='review') {
      // שלב השוואת מסלולים בסיום
      const now=Date.now();
      const elapsedReview=(now-reviewStartTime)/1000;
      // ציור רקע (תמונת מבחן אם קיימת אחרת שחור)
      if(testImgReady){
        const sw=testImg.width, sh=testImg.height, dw=canvas.width, dh=canvas.height; const sr=sw/sh, dr=dw/dh; let w,h; if(sr>dr){ w=dw; h=w/sr; } else { h=dh; w=h*sr; } const ox=(dw-w)/2, oy=(dh-h)/2; ctx.drawImage(testImg,ox,oy,w,h);
        // ציור מסלול מקורי
        if(pathPoints && pathPoints.length){
          ctx.save(); ctx.lineWidth=5; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.strokeStyle='rgba(59,130,246,0.8)'; ctx.shadowColor='rgba(59,130,246,0.4)'; ctx.shadowBlur=15; ctx.beginPath(); pathPoints.forEach((p,i)=>{ const x=ox+p.x*w; const y=oy+p.y*h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); ctx.restore();
        }
        // ציור מסלול משתמש
        if(userTrack && userTrack.length){
          ctx.save(); ctx.lineWidth=4; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.strokeStyle='rgba(239,68,68,0.85)'; ctx.beginPath(); userTrack.forEach((p,i)=>{ const x=ox+p.x*w; const y=oy+p.y*h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); ctx.restore();
        }
        // מקרא
        ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,300,80);
        ctx.fillStyle='#fff'; ctx.font='16px system-ui'; ctx.textAlign='left';
        ctx.fillText('השוואת מסלול סיום', 20,34);
        ctx.fillStyle='#3b82f6'; ctx.fillText('מקור', 20,54);
        ctx.fillStyle='#ef4444'; ctx.fillText('הטיסה שלך', 90,54);
        ctx.fillStyle='#fff'; ctx.font='14px system-ui'; ctx.fillText('יסתיים בעוד '+Math.max(0,(REVIEW_AUTO_SEC-elapsedReview)).toFixed(1)+'s או Enter',20,74);
        // הצגת אינדקס חלק
        ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(canvas.width-180,10,170,48);
        ctx.fillStyle='#fff'; ctx.font='14px system-ui'; ctx.textAlign='center'; ctx.fillText('חלק '+(currentPart+1)+'/'+partsRef.length, canvas.width-95, 38);
      } else {
        ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle='#fff'; ctx.font='20px system-ui'; ctx.textAlign='center'; ctx.fillText('השוואת מסלול נטענת...', canvas.width/2, canvas.height/2);
      }
      if(elapsedReview>=REVIEW_AUTO_SEC){ finalizeReview(); }
    }
    if(active) requestAnimationFrame(draw);
  }

  function formatTime(sec){
    const m = Math.floor(sec/60);
    const s = Math.floor(sec%60);
    return (m<10?'0':'')+m+':' + (s<10?'0':'')+s;
  }

  function closestDistanceToPath(px,py){
    if(!pathPoints || pathPoints.length<2) return 1; let minD=1;
    for(let i=1;i<pathPoints.length;i++){ const a=pathPoints[i-1], b=pathPoints[i]; const dx=b.x-a.x, dy=b.y-a.y; const len2=dx*dx+dy*dy; if(len2===0) continue; let t=((px-a.x)*dx+(py-a.y)*dy)/len2; t=Math.max(0,Math.min(1,t)); const cx=a.x+dx*t, cy=a.y+dy*t; const ddx=px-cx, ddy=py-cy; const d=Math.sqrt(ddx*ddx+ddy*ddy); if(d<minD) minD=d; }
    return minD; // מרחק נורמליזציה (0 מושלם)
  }

  function startTimer(){
    timerId = setInterval(()=>{
      if(stage==='path'){
        const elapsed=(Date.now()-pathStartTime)/1000;
        const remaining=Math.max(0, pathDisplaySec - elapsed);
        const timeEl=document.getElementById('flightexam-time');
        if(timeEl) timeEl.textContent='מסלול '+remaining.toFixed(1)+'s';
        return; // לא מחשב ציון בשלב הצפייה
      } else if(stage==='preflight'){
        const elapsedPre=(Date.now()-preFlightStartTime)/1000;
        const remainingPre=Math.max(0, preFlightDelaySec - elapsedPre);
        const timeEl=document.getElementById('flightexam-time');
        if(timeEl) timeEl.textContent='התחלה '+remainingPre.toFixed(1)+'s';
        // אין סיום כאן – המעבר מנוהל ב-draw
        return;
      } else if(stage==='flight'){
        const elapsed=(Date.now()-flightStartTime)/1000; const remaining=Math.max(0,durationFlightSec-elapsed);
        const timeEl=document.getElementById('flightexam-time'); if(timeEl) timeEl.textContent='טיסה '+remaining.toFixed(1)+'s';
        const scoreEl=document.getElementById('flightexam-score'); if(scoreEl && !(window.testAuth && !window.testAuth.isAdmin())) scoreEl.textContent=score.toFixed(1);
        if(remaining<=0){ finish(); }
      } else {
        // שלבים אחרים – לא עושים כלום
      }
    },250);
  }

  function start(){
    console.log('[flightexam] start invoked');
    adjustLayout();
    if(active) return;
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    partsRef = window.getFlightExamParts? (window.getFlightExamParts()||[]):[];
    currentPart = 0;
    const timing = window.appSettings && window.appSettings.newExamTiming ? window.appSettings.newExamTiming : null;
    if(timing){
      pathDisplaySec = Math.max(1, +timing.pathDisplaySec || pathDisplaySec);
      preFlightDelaySec = Math.max(0, +timing.preFlightDelaySec || preFlightDelaySec);
      durationFlightSec = Math.max(5, +timing.flightDurationSec || durationFlightSec);
      console.log('[flightexam] timing override', {pathDisplaySec, preFlightDelaySec, durationFlightSec});
    }
    console.log('[flightexam] parts count=', partsRef.length);
    partsRef.forEach((p,i)=>{ console.log('[flightexam] part', i, p.name, {hasPath:!!p.pathImg, hasTest:!!p.testImg, points:p.pathPoints? p.pathPoints.length:0}); });
    if(!partsRef.length){ console.warn('[flightexam] no parts defined'); return; }
    // אתחול גלובלי
    active = true; startTime = Date.now(); score = 100; reviewActive=false; loadingStarted=false; userTrack=[];
    const view = document.querySelector('#flightexam-screen .test-view'); if(view) view.style.display='block';
    if(window.testAuth && !window.testAuth.isAdmin()) { statsBox && (statsBox.style.display='none'); } else { statsBox && (statsBox.style.display='block'); }
    loadPart(currentPart); // טעינת חלק ראשון
    resize(); draw(); startTimer();
  }

  function loadPart(index){
    console.log('[flightexam] loadPart', index);
    // איפוס נתונים ספציפיים לחלק (לא מאפס ציוני חוץ מהחלק עצמו)
    userTrack=[]; rotHoldLeft=0; rotHoldRight=0; keyState.ArrowLeft=false; keyState.ArrowRight=false; slowActive=false;
    reviewActive=false; loadingStarted=false; lastFrameTime=0; sampleAccum=0; score=100;
    pathImgReady=false; pathImg=null; testImgReady=false; testImg=null; pathPoints=[]; pathCum=[]; pathTotalLen=0; lastDrawBox=null;
    const part = partsRef[index];
    if(!part){ console.warn('[flightexam] missing part', index); finalizeReview(true); return; }
    // הגדרת נקודות מסלול
    pathPoints = part.pathPoints? part.pathPoints.slice(): [];
    if(pathPoints.length>=2){
      pathCum=[0]; pathTotalLen=0;
      for(let i=1;i<pathPoints.length;i++){ const a=pathPoints[i-1], b=pathPoints[i]; const dx=b.x-a.x, dy=b.y-a.y; const d=Math.sqrt(dx*dx+dy*dy); pathTotalLen+=d; pathCum.push(pathTotalLen);}  
    }
    if(part.pathImg){
      pathImg=new Image();
      pathImg.onload=()=>{ pathImgReady=true; resize(); pathStartTime=Date.now(); stage='path'; };
      pathImg.onerror=()=>{ console.warn('[flightexam] path image failed part', index); pathImgReady=false; pathStartTime=Date.now(); stage='preflight'; preFlightStartTime=Date.now(); };
      pathImg.src=part.pathImg;
      stage='path'; pathStartTime=Date.now();
    } else {
      // ללא תמונת מסלול -> מעבר ישר לטיסה אחרי ספירת preflight אם יש נקודות? נשמור רצף: נגיע ל-preflight קצר או אפס ואז flight
      if(preFlightDelaySec>0){ stage='preflight'; preFlightStartTime=Date.now(); }
      else { stage='flight'; flightStartTime=Date.now(); initPlaneFromPath(); }
    }
  }

  function initPlaneFromPath(){
    if(pathPoints && pathPoints.length>=2){ planeNX=pathPoints[0].x; planeNY=pathPoints[0].y; const a=pathPoints[0], b=pathPoints[1]; planeHeading=Math.atan2(b.y-a.y, b.x-a.x); }
    else { planeNX=0.5; planeNY=0.5; planeHeading=0; }
  }

  function finish(){
    if(stage==='review') return; // מניעת כפילות
    // דגימה סופית של החלק
    if(pathPoints && pathPoints.length){ const dFinal=closestDistanceToPath(planeNX, planeNY); userTrack.push({x:planeNX,y:planeNY,d:dFinal}); }
    let partScore=score;
    if(userTrack.length){ const avgDist=userTrack.reduce((s,p)=>s+p.d,0)/userTrack.length; const accuracy=Math.max(0, Math.min(1, 1 - avgDist/MAX_DIST_FOR_FULL_SCORE)); partScore=accuracy*100; }
    partScores[currentPart]=partScore;
    allTracks[currentPart]=userTrack.slice();
    // תמיד מציגים REVIEW לכל חלק
    score=partScore; stage='review'; reviewStartTime=Date.now(); reviewActive=true;
  }

  function finalizeReview(forceEnd){
    if(!reviewActive && !forceEnd) return;
    reviewActive=false;
    // אם יש עוד חלקים - מעבר לחלק הבא במקום סיום כללי
    if(currentPart < partsRef.length-1){
      currentPart++;
      console.log('[flightexam] advance to part', currentPart);
      loadPart(currentPart);
      return; // לא מחשב ציון סופי עדיין
    }
    // חלק אחרון -> סיום מלא
    active=false; clearInterval(timerId);
    let finalScore=0; let n=0; partScores.forEach(ps=>{ if(typeof ps==='number'){ finalScore+=ps; n++; } });
    if(n>0){ finalScore/=n; }
    score=finalScore;
    const g=window.getGlobalScale? window.getGlobalScale(): {min:1,max:7};
    const scaled=g.min + (Math.min(100,Math.max(0,score))/100)*(g.max-g.min);
    if(window.testAuth){ window.testAuth.markTestCompleted('flightexam'); window.testAuth.showTestCompleteModal('flightexam', scaled.toFixed(2)); }
    if(window.exitFullscreenMode) window.exitFullscreenMode();
  }

  startBtn.addEventListener('click', start);

  // הסרת שליטת עכבר
  canvas.onmousemove=null;

  // מאזיני מקלדת לתנועה רציפה
  document.addEventListener('keydown', e=>{
    if(stage!=='flight' && stage!=='review') return;
    if(stage==='review' && e.code==='Enter'){ e.preventDefault(); finalizeReview(); return; }
    if(stage==='flight'){
      if(e.code==='ArrowLeft'){ keyState.ArrowLeft=true; e.preventDefault(); }
      else if(e.code==='ArrowRight'){ keyState.ArrowRight=true; e.preventDefault(); }
      else if(e.code==='Space'){ slowActive=true; e.preventDefault(); }
      // לחיצה קצרה בלבד (ללא החזקה) עדיין נותנת צעד זווית קטן
      if(e.code==='ArrowLeft' && !keyState.ArrowRight && rotHoldLeft===0){ planeHeading -= ROT_STEP; }
      if(e.code==='ArrowRight' && !keyState.ArrowLeft && rotHoldRight===0){ planeHeading += ROT_STEP; }
    }
  });
  document.addEventListener('keyup', e=>{
    if(e.code==='ArrowLeft'){ keyState.ArrowLeft=false; }
    else if(e.code==='ArrowRight'){ keyState.ArrowRight=false; }
    else if(e.code==='Space'){ slowActive=false; }
  });
})();