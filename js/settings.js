// Settings & Admin Panel Module
(function(){
  const LS_KEY='app.settings.v1';
  const LS_PATHNAV='app.pathnav';
  const LS_NORTH='app.northfind';
  const DEFAULT_SETTINGS={
    candidateId:'',
    scaleMin:1,
    scaleMax:7,
    tests:[
      {id:'eyehand', name:'תיאום עין-יד', include:true, seconds:30, difficulty:'בינוני'},
      {id:'reaction', name:'זמן תגובה', include:true, seconds:40, difficulty:'בינוני'},
      {id:'memory', name:'זיכרון מרחבי', include:true, seconds:60, difficulty:'בינוני'},
      {id:'tracking', name:'מעקב וקשב', include:true, seconds:30, difficulty:'בינוני'},
      {id:'pathnav', name:'ניווט נתיב', include:true, seconds:60, difficulty:'בינוני'},
      {id:'northfind', name:'מציאת הצפון', include:true, seconds:45, difficulty:'בינוני'},
      {id:'flightcontrol', name:'בקרת טיסה', include:true, seconds:60, difficulty:'בינוני'},
      {id:'targetid', name:'ירי במטרות', include:true, seconds:60, difficulty:'בינוני'}
    ]
  };
  const DEFAULT_PATHNAV={ imageDataUrl:'', points:[], seconds:60 };
  const DEFAULT_NORTH={ trials:5, showNorthSec:3, spinSec:6, answerSec:10, mapImages:[] };
  
  function load(k,def){ try{ const s=localStorage.getItem(k); return s? JSON.parse(s): JSON.parse(JSON.stringify(def)); }catch(e){ return JSON.parse(JSON.stringify(def)); } }
  function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  
  let settings=load(LS_KEY, DEFAULT_SETTINGS);
  let pathNav=load(LS_PATHNAV, DEFAULT_PATHNAV);
  let north=load(LS_NORTH, DEFAULT_NORTH);
  
  window.appSettings = settings;
  window.getTestConfig = id => settings.tests.find(t=>t.id===id) || null;
  window.getGlobalScale = ()=> ({min:settings.scaleMin, max:settings.scaleMax});
  window.getNorthConfig = ()=> load(LS_NORTH, DEFAULT_NORTH);
  window.getPathNavData = ()=> load(LS_PATHNAV, DEFAULT_PATHNAV);

  const adminBtn=document.getElementById('admin-button');
  const adminScreen=document.getElementById('admin-screen');
  const adminLock=document.getElementById('admin-lock');
  const adminSettingsBox=document.getElementById('admin-settings');

  // Build modern admin UI
  function buildAdminUI(){
    if(!adminSettingsBox) return;
    adminSettingsBox.innerHTML = `
      <div class="admin-settings">
        <!-- General Settings -->
        <div class="settings-section section-general">
          <h3>הגדרות כלליות</h3>
          <div class="form-grid">
            <div class="form-group">
              <label for="cfgCandidate">מזהה נבחן</label>
              <input id="cfgCandidate" type="text" maxlength="16" placeholder="הזן מספר מזהה">
              <span class="form-hint">מזהה ייחודי לנבחן במערכת</span>
            </div>
            <div class="form-group">
              <label>סקאלת ציון גלובלית</label>
              <div class="scale-inputs">
                <input id="cfgScaleMin" type="number" min="1" max="99" value="1" placeholder="מינ׳">
                <span>עד</span>
                <input id="cfgScaleMax" type="number" min="2" max="100" value="7" placeholder="מקס׳">
              </div>
              <span class="form-hint">טווח הציונים עבור כל המבחנים</span>
            </div>
          </div>
        </div>

        <!-- Tests Configuration -->
        <div class="settings-section section-tests">
          <h3>הגדרות מבחנים</h3>
          <table class="tests-table">
            <thead>
              <tr>
                <th>שם המבחן</th>
                <th style="text-align:center">כלול</th>
                <th>זמן (שניות)</th>
                <th>רמת קושי</th>
                <th style="text-align:center">מזהה</th>
              </tr>
            </thead>
            <tbody id="testsConfig"></tbody>
          </table>
        </div>

        <!-- Path Navigation -->
        <div class="settings-section section-pathnav">
          <h3>ניווט נתיב - העלאת מסלול</h3>
          <div class="form-group">
            <label for="routeImgInput">העלאת תמונת מסלול</label>
            <input id="routeImgInput" type="file" accept="image/*">
            <span class="form-hint">בחר תמונה שתשמש כרקע למסלול הניווט</span>
          </div>
          <div class="route-preview-container">
            <div class="route-preview-hint">לחיצה מוסיפה נקודה | Backspace מוחקת</div>
            <canvas id="routePreview"></canvas>
          </div>
          <div class="route-actions">
            <button id="btnRouteClear" class="btn-danger">נקה מסלול</button>
            <button id="btnRouteSave" class="save-settings-btn">שמור מסלול</button>
          </div>
          <span id="routeStatus" class="route-status">טרם הוגדר מסלול</span>
        </div>

        <!-- North Find -->
        <div class="settings-section section-north">
          <h3>מציאת הצפון - הגדרות מפות</h3>
          <div class="form-grid">
            <div class="form-group">
              <label for="northTrials">מספר ניסיונות</label>
              <input id="northTrials" type="number" min="1" max="20" value="5">
              <span class="form-hint">מספר הסיבובים במבחן</span>
            </div>
            <div class="form-group">
              <label for="northShowNorth">זמן הצגת צפון (שניות)</label>
              <input id="northShowNorth" type="number" min="1" max="10" value="3">
              <span class="form-hint">כמה זמן להציג את חץ הצפון</span>
            </div>
            <div class="form-group">
              <label for="northSpin">משך סיבוב (שניות)</label>
              <input id="northSpin" type="number" min="3" max="30" value="6">
              <span class="form-hint">כמה זמן המפה מסתובבת</span>
            </div>
            <div class="form-group">
              <label for="northAnswer">זמן תגובה (שניות)</label>
              <input id="northAnswer" type="number" min="3" max="60" value="10">
              <span class="form-hint">זמן לבחירת מיקום הצפון</span>
            </div>
          </div>
          
          <div class="form-group" style="margin-top:20px">
            <label for="northMapsInput">העלאת תמונות מפות</label>
            <input id="northMapsInput" type="file" accept="image/*" multiple>
            <span class="form-hint">בחר מספר תמונות מפה (בכל ניסיון תוצג מפה אחרת)</span>
          </div>
          
          <div id="northMapsPreview" class="maps-preview-grid" style="margin-top:15px"></div>
          
          <div class="route-actions" style="margin-top:15px">
            <button id="btnNorthClear" class="btn-danger">נקה כל המפות</button>
            <button id="btnNorthSave" class="save-settings-btn">שמור הגדרות צפון</button>
          </div>
          <span id="northStatus" class="route-status">טרם הועלו מפות</span>
        </div>

        <!-- Save Section -->
        <div class="save-settings-section">
          <h4>💾 שמירת הגדרות</h4>
          <p>לחץ לשמירה קבועה של כל ההגדרות</p>
          <button id="saveSettings" class="save-settings-btn">שמור את כל ההגדרות</button>
        </div>
      </div>
    `;
  }

  function rebuildTestsConfig(){
    const tbody = document.getElementById('testsConfig');
    if(!tbody) return;
    tbody.innerHTML='';
    settings.tests.forEach((t,i)=>{
      const row=document.createElement('tr');
      row.className='test-row';
      row.innerHTML=`
        <td>${t.name}</td>
        <td style="text-align:center"><input type="checkbox" data-i="${i}" class="t-include" ${t.include? 'checked':''}></td>
        <td><input type="number" min="5" max="600" value="${t.seconds}" data-i="${i}" class="t-seconds"></td>
        <td>
          <select data-i="${i}" class="t-diff">
            <option ${t.difficulty==='קל'? 'selected':''}>קל</option>
            <option ${t.difficulty==='בינוני'? 'selected':''}>בינוני</option>
            <option ${t.difficulty==='קשה'? 'selected':''}>קשה</option>
          </select>
        </td>
        <td style="text-align:center"><span class="pill-small">${t.id}</span></td>
      `;
      tbody.appendChild(row);
    });
    
    document.querySelectorAll('.t-include').forEach(el=> el.onchange=()=>{ const i=+el.dataset.i; settings.tests[i].include=el.checked; });
    document.querySelectorAll('.t-seconds').forEach(el=> el.oninput=()=>{ const i=+el.dataset.i; const v=Math.max(5,Math.min(600,+el.value||60)); settings.tests[i].seconds=v; });
    document.querySelectorAll('.t-diff').forEach(el=> el.onchange=()=>{ const i=+el.dataset.i; settings.tests[i].difficulty=el.value; });
  }

  function syncGeneralFields(){
    const candidateEl=document.getElementById('cfgCandidate');
    const scaleMinEl=document.getElementById('cfgScaleMin');
    const scaleMaxEl=document.getElementById('cfgScaleMax');
    if(candidateEl) candidateEl.value=settings.candidateId;
    if(scaleMinEl) scaleMinEl.value=settings.scaleMin;
    if(scaleMaxEl) scaleMaxEl.value=settings.scaleMax;
    
    if(candidateEl) candidateEl.oninput=()=>{ settings.candidateId=candidateEl.value.trim(); };
    if(scaleMinEl) scaleMinEl.oninput=()=>{ settings.scaleMin=Math.max(1, +scaleMinEl.value||1); if(settings.scaleMin>=settings.scaleMax){ settings.scaleMax=settings.scaleMin+1; if(scaleMaxEl) scaleMaxEl.value=settings.scaleMax; } };
    if(scaleMaxEl) scaleMaxEl.oninput=()=>{ settings.scaleMax=Math.max(settings.scaleMin+1, +scaleMaxEl.value||7); scaleMaxEl.value=settings.scaleMax; };
  }

  // PathNav preview logic
  function setupPathNav(){
    const routeImgInput=document.getElementById('routeImgInput');
    const routePreview=document.getElementById('routePreview');
    const btnRouteClear=document.getElementById('btnRouteClear');
    const btnRouteSave=document.getElementById('btnRouteSave');
    const routeStatus=document.getElementById('routeStatus');
    if(!routePreview) return;
    
    const ctx=routePreview.getContext('2d');
    let previewImg=new Image();
    let previewReady=false;
    
    function setPreviewSize(){
      routePreview.width=routePreview.clientWidth;
      routePreview.height=200;
    }
    
    function fitContain(sw,sh,dw,dh){
      const sr=sw/sh, dr=dw/dh;
      if(sr>dr){ const w=dw,h=Math.floor(dw/sr); return {w,h}; }
      else { const h=dh,w=Math.floor(h*sr); return {w,h}; }
    }
    
    function drawPreview(){
      setPreviewSize();
      ctx.clearRect(0,0,routePreview.width,routePreview.height);
      if(previewReady){
        const s=fitContain(previewImg.width,previewImg.height, routePreview.width,routePreview.height);
        const ox=(routePreview.width-s.w)/2, oy=(routePreview.height-s.h)/2;
        ctx.drawImage(previewImg,ox,oy,s.w,s.h);
        const pts=pathNav.points;
        if(pts.length){
          ctx.lineWidth=2;
          ctx.strokeStyle='rgba(59, 130, 246, 0.9)';
          ctx.beginPath();
          pts.forEach((p,i)=>{
            const x=ox+p.nx*s.w;
            const y=oy+p.ny*s.h;
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
          });
          ctx.stroke();
          pts.forEach((p,i)=>{
            const x=ox+p.nx*s.w, y=oy+p.ny*s.h;
            ctx.beginPath();
            ctx.arc(x,y,6,0,Math.PI*2);
            ctx.fillStyle=i===0? '#10b981' : (i===pts.length-1? '#ef4444':'#f59e0b');
            ctx.fill();
          });
        }
      } else {
        ctx.fillStyle='var(--text-secondary)';
        ctx.font='14px system-ui';
        ctx.textAlign='center';
        ctx.fillText('בחר תמונה למסלול',routePreview.width/2,routePreview.height/2);
      }
    }
    
    function updateRouteStatus(){
      if(!routeStatus) return;
      const n=pathNav.points.length;
      if(!pathNav.imageDataUrl){
        routeStatus.textContent='לא נבחרה תמונה';
        routeStatus.classList.remove('ready');
      } else if(n<2){
        routeStatus.textContent='הוסף נקודות (דרוש לפחות התחלה + סיום)';
        routeStatus.classList.remove('ready');
      } else {
        routeStatus.textContent=`✓ מסלול מוכן (${n} נקודות)`;
        routeStatus.classList.add('ready');
      }
    }
    
    function loadPreview(){
      if(pathNav.imageDataUrl){
        previewImg.onload=()=>{ previewReady=true; drawPreview(); };
        previewImg.src=pathNav.imageDataUrl;
      } else {
        previewReady=false;
        drawPreview();
      }
      updateRouteStatus();
    }
    
    if(routeImgInput) routeImgInput.onchange=async e=>{
      const f=e.target.files&&e.target.files[0];
      if(!f) return;
      const dataUrl=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(f); });
      pathNav.imageDataUrl=dataUrl; save(LS_PATHNAV,pathNav); // שמירה אוטומטית
      loadPreview();
    };
    
    if(routePreview) routePreview.addEventListener('click', e=>{
      if(!previewReady||!pathNav.imageDataUrl) return;
      const r=routePreview.getBoundingClientRect();
      const x=e.clientX-r.left, y=e.clientY-r.top;
      const s=fitContain(previewImg.width,previewImg.height, routePreview.width,routePreview.height);
      const ox=(routePreview.width-s.w)/2, oy=(routePreview.height-s.h)/2;
      if(x<ox||x>ox+s.w||y<oy||y>oy+s.h) return;
      const nx=(x-ox)/s.w, ny=(y-oy)/s.h;
      pathNav.points.push({nx,ny});
      save(LS_PATHNAV,pathNav); // שמירה אוטומטית לנקודה חדשה
      drawPreview();
      updateRouteStatus();
    });
    
    document.addEventListener('keydown', e=>{
      if(e.key==='Backspace' && adminScreen.classList.contains('active')){
        if(pathNav.points.length){
          pathNav.points.pop();
          drawPreview();
          updateRouteStatus();
        }
      }
    });
    
    if(btnRouteClear) btnRouteClear.onclick=()=>{
      pathNav.points=[];
      save(LS_PATHNAV,pathNav);
      drawPreview();
      updateRouteStatus();
    };
    
    if(btnRouteSave) btnRouteSave.onclick=()=>{
      save(LS_PATHNAV,pathNav);
      updateRouteStatus();
      alert('✓ מסלול נשמר בהצלחה');
    };
    
    loadPreview();
  }

  // North settings with map images upload
  function setupNorth(){
    const northTrialsEl=document.getElementById('northTrials');
    const northShowNorthEl=document.getElementById('northShowNorth');
    const northSpinEl=document.getElementById('northSpin');
    const northAnswerEl=document.getElementById('northAnswer');
    const northMapsInput=document.getElementById('northMapsInput');
    const northMapsPreview=document.getElementById('northMapsPreview');
    const btnNorthClear=document.getElementById('btnNorthClear');
    const btnNorthSave=document.getElementById('btnNorthSave');
    const northStatus=document.getElementById('northStatus');
    
    function syncNorth(){
      if(northTrialsEl) northTrialsEl.value=north.trials;
      if(northShowNorthEl) northShowNorthEl.value=north.showNorthSec;
      if(northSpinEl) northSpinEl.value=north.spinSec;
      if(northAnswerEl) northAnswerEl.value=north.answerSec;
      renderMapsPreviews();
      updateNorthStatus();
    }
    
    function renderMapsPreviews(){
      if(!northMapsPreview) return;
      northMapsPreview.innerHTML='';
      
      if(!north.mapImages || north.mapImages.length===0){
        northMapsPreview.innerHTML='<p style="color:var(--text-secondary);text-align:center;padding:20px">טרם הועלו תמונות מפה</p>';
        return;
      }
      
      north.mapImages.forEach((imgData, index)=>{
        const card=document.createElement('div');
        card.className='map-preview-card';
        card.innerHTML=`
          <img src="${imgData}" alt="Map ${index+1}">
          <div class="map-preview-info">
            <span>מפה #${index+1}</span>
            <button class="btn-remove-map" data-index="${index}">×</button>
          </div>
        `;
        northMapsPreview.appendChild(card);
      });
      
      // Add remove handlers
      document.querySelectorAll('.btn-remove-map').forEach(btn=>{
        btn.onclick=()=>{
          const idx=parseInt(btn.dataset.index);
          north.mapImages.splice(idx,1);
          renderMapsPreviews();
          updateNorthStatus();
        };
      });
    }
    
    function updateNorthStatus(){
      if(!northStatus) return;
      const n=north.mapImages? north.mapImages.length : 0;
      if(n===0){
        northStatus.textContent='לא הועלו מפות';
        northStatus.classList.remove('ready');
      } else {
        northStatus.textContent=`✓ ${n} מפות מוכנות`;
        northStatus.classList.add('ready');
      }
    }
    
    syncNorth();
    
    // Input handlers
    if(northTrialsEl) northTrialsEl.oninput=()=>{
      north.trials=Math.max(1,Math.min(20,+northTrialsEl.value||5));
    };
    if(northShowNorthEl) northShowNorthEl.oninput=()=>{
      north.showNorthSec=Math.max(1,Math.min(10,+northShowNorthEl.value||3));
    };
    if(northSpinEl) northSpinEl.oninput=()=>{
      north.spinSec=Math.max(3,Math.min(30,+northSpinEl.value||6));
    };
    if(northAnswerEl) northAnswerEl.oninput=()=>{
      north.answerSec=Math.max(3,Math.min(60,+northAnswerEl.value||10));
    };
    
    // Upload multiple maps
    if(northMapsInput) northMapsInput.onchange=async e=>{
      const files=e.target.files;
      if(!files || files.length===0) return;
      
      // Convert all files to data URLs
      const promises=[];
      for(let i=0; i<files.length; i++){
        promises.push(new Promise((resolve,reject)=>{
          const fr=new FileReader();
          fr.onload=()=>resolve(fr.result);
          fr.onerror=reject;
          fr.readAsDataURL(files[i]);
        }));
      }
      
      try {
        const dataUrls=await Promise.all(promises);
        if(!north.mapImages) north.mapImages=[];
        north.mapImages.push(...dataUrls);
        save(LS_NORTH,north);
        renderMapsPreviews();
        updateNorthStatus();
        northMapsInput.value=''; // Reset input
      } catch(err){
        alert('שגיאה בטעינת תמונות: '+err);
      }
    };
    
    // Clear all maps
    if(btnNorthClear) btnNorthClear.onclick=()=>{
      if(confirm('האם אתה בטוח שברצונך למחוק את כל המפות?')){
        north.mapImages=[];
        renderMapsPreviews();
        updateNorthStatus();
      }
    };
    
    // Save north config
    if(btnNorthSave) btnNorthSave.onclick=()=>{
      save(LS_NORTH,north);
      updateNorthStatus();
      alert('✓ הגדרות מציאת הצפון נשמרו בהצלחה');
    };
  }

  // Save all
  function setupSave(){
    const saveBtn=document.getElementById('saveSettings');
    if(saveBtn) saveBtn.onclick=()=>{
      save(LS_KEY, settings);
      save(LS_NORTH,north);
      save(LS_PATHNAV,pathNav);
      applyNavVisibility();
      alert('✅ כל ההגדרות נשמרו בהצלחה!');
    };
  }

  // Password lock
  let adminUnlocked=false;
  function showAdmin(){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    adminScreen.classList.add('active');
  }
  
  if(adminBtn) adminBtn.onclick=()=>{
    if(!adminUnlocked){
      const pass=prompt('🔐 הזן סיסמת מנהל:');
      if(pass==='malkin'){
        adminUnlocked=true;
        adminLock.style.display='none';
        adminSettingsBox.style.display='flex';
        buildAdminUI();
        rebuildTestsConfig();
        syncGeneralFields();
        setupPathNav();
        setupNorth();
        setupSave();
      } else {
        adminLock.style.display='block';
        adminSettingsBox.style.display='none';
        return;
      }
    }
    showAdmin();
  };

  // Navigation visibility based on include
  function applyNavVisibility(){
    document.querySelectorAll('#test-selector .nav-btn').forEach(btn=>{
      const id=btn.getAttribute('data-test');
      const cfg=getTestConfig(id);
      if(cfg && !cfg.include) btn.style.display='none';
      else btn.style.display='';
    });
  }
  
  applyNavVisibility();

  window.refreshSettingsUI = function(){
    settings=load(LS_KEY, DEFAULT_SETTINGS);
    buildAdminUI();
    rebuildTestsConfig();
    applyNavVisibility();
  };
})();
