// Settings & Admin Panel Module
(function(){
    const LS_KEY='app.settings.v1';
    const LS_NORTH='app.northfind';
    const LS_FLIGHTEXAM='app.flightexam.parts'; // שם חדש למבחן הטסה
    const LS_NEWEXAM_OLD='app.newexam.parts'; // תאימות לאחור
    const LS_ORIENTATION='app.orientation'; // הוספת localStorage למבחן התמצאות
    const DEFAULT_SETTINGS={
      candidateId:'',
      scaleMin:1,
      scaleMax:7,
      reactionShapeDisplaySec:1, // משך הופעת כל צורה במבחן תגובה (שניות)
      tests:[
        {id:'eyehand', name:'תיאום עין-יד', include:true, seconds:30, difficulty:'בינוני'},
        {id:'reaction', name:'זמן תגובה', include:true, seconds:40, difficulty:'בינוני'},
        {id:'memory', name:'זיכרון מרחבי', include:true, seconds:60, difficulty:'בינוני'},
        {id:'tracking', name:'מעקב וקשב', include:true, seconds:30, difficulty:'בינוני'},
        {id:'northfind', name:'מציאת הצפון', include:true, seconds:45, difficulty:'בינוני'},
        {id:'flightcontrol', name:'בקרת טיסה', include:true, seconds:60, difficulty:'בינוני'},
        {id:'targetid', name:'ירי במטרות', include:true, seconds:60, difficulty:'בינוני'},
        {id:'flightexam', name:'מבחן הטסה', include:true, seconds:20, difficulty:'בינוני'},
        {id:'orientation', name:'התמצאות וכיוונים', include:true, seconds:360, difficulty:'בינוני'} // מבחן חדש
      ]
    };
    if(!DEFAULT_SETTINGS.newExamTiming){ DEFAULT_SETTINGS.newExamTiming={ pathDisplaySec:15, preFlightDelaySec:10, flightDurationSec:60 }; }
    const DEFAULT_NORTH={ trials:5, showNorthSec:3, spinSec:6, answerSec:10, mapImages:[] };
    const DEFAULT_FLIGHTEXAM={ parts:[] }; // שם חדש
    const DEFAULT_ORIENTATION={ 
      maxQuestions: 10,
      timeLimitMin: 6,
      scoreScale: 7,
      showCompass: true,
      displayTimeSec: 10,
      questionText: 'ציין מאיזה כיוון לאיזה כיוון זווית הצילום',
      questionSets: [] // array of {id, name, topImage, viewImages:[{url, orient}]}
    };
    // --- Embedded / External default settings support ---
    // Place pasted exported JSON into window.EMBEDDED_DEFAULT_EXPORT = { ... } before this file loads
    window.EMBEDDED_DEFAULT_EXPORT = window.EMBEDDED_DEFAULT_EXPORT || null;
    const DEFAULT_SETTINGS_JSON_PATH = 'assets/config/exam-settings-export.json';
    function deepMerge(base, extra){
      if(!extra || typeof extra!=='object') return base;
      Object.keys(extra).forEach(k=>{
        const v = extra[k];
        if(Array.isArray(v)) base[k] = v.map(x=> (typeof x==='object' && x? JSON.parse(JSON.stringify(x)): x));
        else if(v && typeof v==='object'){
          if(!base[k] || typeof base[k]!=='object') base[k] = {};
          deepMerge(base[k], v);
        } else base[k] = v;
      });
      return base;
    }
    function applyEmbeddedDefaultsIfNeeded(exported){
      if(!exported) return;
      try {
        const hasSettingsLS = !!localStorage.getItem(LS_KEY);
        const hasOrientLS = !!localStorage.getItem(LS_ORIENTATION);
        const hasFlightLS = !!localStorage.getItem(LS_FLIGHTEXAM);
        const hasNorthLS  = !!localStorage.getItem(LS_NORTH);
        if(!hasSettingsLS && exported.settings) deepMerge(DEFAULT_SETTINGS, exported.settings);
        if(!hasOrientLS && exported.orientation) deepMerge(DEFAULT_ORIENTATION, exported.orientation);
        if(!hasFlightLS && exported.flightExam) deepMerge(DEFAULT_FLIGHTEXAM, exported.flightExam);
        if(!hasNorthLS && exported.north) deepMerge(DEFAULT_NORTH, exported.north);
        if(!hasSettingsLS || !hasOrientLS || !hasFlightLS || !hasNorthLS){
          // Persist merged defaults immediately so שאר המודולים יקבלו אותם
          if(!hasSettingsLS && exported.settings) localStorage.setItem(LS_KEY, JSON.stringify(DEFAULT_SETTINGS));
          if(!hasOrientLS && exported.orientation) localStorage.setItem(LS_ORIENTATION, JSON.stringify(DEFAULT_ORIENTATION));
          if(!hasFlightLS && exported.flightExam) localStorage.setItem(LS_FLIGHTEXAM, JSON.stringify(DEFAULT_FLIGHTEXAM));
          if(!hasNorthLS && exported.north) localStorage.setItem(LS_NORTH, JSON.stringify(DEFAULT_NORTH));
          console.log('[defaults] applied embedded defaults');
        }
      } catch(e){ console.warn('[defaults] apply error', e); }
    }
    window.ALWAYS_APPLY_EXPORT = window.ALWAYS_APPLY_EXPORT || false; // אם true יאולץ החלת הקובץ בכל טעינה
    function applyExternalConfig(exported, force){
      if(!exported) return;
      const doForce = force || exported.forceApply || window.ALWAYS_APPLY_EXPORT;
      console.log('[defaults] applyExternalConfig force=', doForce);
      // אם force: מחליפים ישירות את המבנים; אחרת רק מוסיפים ערכים חסרים
      function overwriteOrMerge(target, source){
        if(!source) return;
        Object.keys(source).forEach(k=>{
          const sv = source[k];
          const tv = target[k];
          if(Array.isArray(sv)){
            if(doForce) target[k] = JSON.parse(JSON.stringify(sv));
            else if(!tv || !Array.isArray(tv) || tv.length===0) target[k] = JSON.parse(JSON.stringify(sv));
            else if(k==='parts' && target===flightExam && !doForce){
              // מיזוג נקודות למסלולי מבחן הטסה קיימים: אם קיימים חלקים ללא pathPoints ונמצאו בקובץ
              const byId = {}; sv.forEach(p=>{ if(p.id) byId[p.id]=p; });
              target[k].forEach(tp=>{
                const sp = byId[tp.id];
                if(sp && sp.pathPoints && sp.pathPoints.length && (!tp.pathPoints || tp.pathPoints.length===0)){
                  tp.pathPoints = JSON.parse(JSON.stringify(sp.pathPoints));
                  console.log('[defaults] merged pathPoints into part', tp.id);
                }
              });
            }
          } else if(sv && typeof sv==='object'){
            if(!tv || typeof tv!=='object') target[k] = {}; overwriteOrMerge(target[k], sv);
          } else {
            if(doForce || tv===undefined || tv===null) target[k] = sv;
          }
        });
      }
      if(exported.settings) overwriteOrMerge(settings, exported.settings);
      if(exported.orientation) overwriteOrMerge(orientation, exported.orientation);
      if(exported.flightExam) overwriteOrMerge(flightExam, exported.flightExam);
      if(exported.north) overwriteOrMerge(north, exported.north);
      if(doForce){
        save(LS_KEY, settings);
        save(LS_ORIENTATION, orientation);
        save(LS_FLIGHTEXAM, flightExam);
        save(LS_NORTH, north);
        console.log('[defaults] forced export applied & saved');
      } else {
        console.log('[defaults] non-forced export merged (only empty fields + pathPoints)');
        // שמירה חלקית במקרה שנוספו pathPoints
        save(LS_FLIGHTEXAM, flightExam);
      }
      window.appSettings = settings;
      if(window.loadOrientationSets && orientation.questionSets){ window.loadOrientationSets(orientation.questionSets); }
      applyNavVisibility();
      if(typeof window.refreshSettingsUI==='function'){ window.refreshSettingsUI(); }
      buildTestSelectorUI();
      if(window._settingsReadyResolve){ window._settingsReadyResolve(); }
    }
    window.adminApplyExternalConfig = function(force=false){
      fetch(DEFAULT_SETTINGS_JSON_PATH, {cache:'no-store'}).then(r=>r.json()).then(json=>{
        applyExternalConfig(json, true); // תמיד בכפייה כשמנהל קורא לזה
        alert('✓ קובץ הקונפיג נטען (דריסה מלאה של הגדרות מקומיות)');
      }).catch(e=>{ console.error(e); alert('❌ לא נמצא קובץ קונפיג'); });
    };
    async function autoLoadDefaultFlightExamParts(){
      if(flightExam.parts && flightExam.parts.length) return; // already have parts
      console.log('[flightexam] attempting auto-load from assets/images/flightexam ...');
      const loaded=[];
      async function imgExists(url){ return new Promise(r=>{ const im=new Image(); im.onload=()=>r(true); im.onerror=()=>r(false); im.src=url; }); }
      for(let i=1;i<=200;i++){ // upper bound
        const pathImg = `assets/images/flightexam/viewOnly/${i}.jpeg`;
        const testImg = `assets/images/flightexam/test/${i}.jpeg`;
        const okPath = await imgExists(pathImg);
        const okTest = await imgExists(testImg);
        if(!okPath && !okTest){ if(i>8) break; else continue; }
        if(okPath && okTest){
          loaded.push({ id:'auto_'+i, name:'חלק '+i, pathImg, testImg, pathW:0, pathH:0, testW:0, testH:0, pathPoints:[] });
        }
      }
      if(loaded.length){
        flightExam.parts = loaded;
        save(LS_FLIGHTEXAM, flightExam);
        console.log('[flightexam] auto-loaded', loaded.length, 'parts');
      } else {
        console.log('[flightexam] no asset parts found');
      }
    }
    (function fetchExternalDefaults(){
      fetch(DEFAULT_SETTINGS_JSON_PATH, {cache:'no-store'}).then(r=>{
        if(!r.ok) throw new Error('not found'); return r.json();
      }).then(json=>{
        window.EMBEDDED_DEFAULT_EXPORT = window.EMBEDDED_DEFAULT_EXPORT || json;
        // רק אם אין localStorage נחיל את הקונפיג
        const hasLocalSettings = !!localStorage.getItem(LS_KEY);
        const hasLocalOrient = !!localStorage.getItem(LS_ORIENTATION);
        const hasLocalFlight = !!localStorage.getItem(LS_FLIGHTEXAM);
        const hasLocalNorth = !!localStorage.getItem(LS_NORTH);
        
        // החלה רק אם אין הגדרות מקומיות
        if(!hasLocalSettings && !hasLocalOrient && !hasLocalFlight && !hasLocalNorth){
          console.log('[defaults] no local settings found, applying config file');
          applyExternalConfig(json, false);
        } else {
          console.log('[defaults] local settings exist, skipping config file');
        }
        autoLoadDefaultFlightExamParts();
        if(window._settingsReadyResolve){ window._settingsReadyResolve(); }
      }).catch(()=>{ 
        console.log('[defaults] no config file, using code defaults');
        autoLoadDefaultFlightExamParts(); 
        if(window._settingsReadyResolve){ window._settingsReadyResolve(); }
      });
    })();
    
    function load(k,def){ try{ const s=localStorage.getItem(k); return s? JSON.parse(s): JSON.parse(JSON.stringify(def)); }catch(e){ return JSON.parse(JSON.stringify(def)); } }
    function save(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(err){ if(err && err.name==='QuotaExceededError'){ console.warn('[storage] quota exceeded for key', k); alert('⚠ שטח האחסון מלא – נסיון דחיסה יתבצע.'); } else { console.error('[storage] error saving', k, err); } } }
    // דחיסת dataURL גדולה (הקטנת ממדים + המרת JPEG)
    async function compressDataUrl(dataUrl, maxW=1280, maxH=1280, quality=0.82){ return new Promise(res=>{ try{ const img=new Image(); img.onload=()=>{ let {width:w,height:h}=img; const scale=Math.min(1, maxW/w, maxH/h); if(scale<1){ w=Math.round(w*scale); h=Math.round(h*scale); } const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); g.drawImage(img,0,0,w,h); let out=c.toDataURL('image/jpeg', quality); // אם עדיין גדול מאוד נסה איכות נמוכה יותר
            if(out.length>dataUrl.length && quality>0.5){ out=c.toDataURL('image/jpeg', 0.7); }
            res(out); }; img.onerror=()=>{ res(dataUrl); }; img.src=dataUrl; }catch(e){ res(dataUrl); } }); }
    async function saveNewExamParts(){ // דחיסת תמונות גדולות לפני שמירה
      let changed=false; for(const p of flightExam.parts){ if(p.pathImg && p.pathImg.length>650000){ console.log('[flightexam] compress path', p.name, 'len', p.pathImg.length); p.pathImg= await compressDataUrl(p.pathImg); changed=true; } if(p.testImg && p.testImg.length>650000){ console.log('[flightexam] compress test', p.name, 'len', p.testImg.length); p.testImg= await compressDataUrl(p.testImg); changed=true; } }
      try{ localStorage.setItem(LS_FLIGHTEXAM, JSON.stringify(flightExam)); }catch(err){ if(err.name==='QuotaExceededError'){ console.warn('[flightexam] quota still exceeded after compression, removing largest images'); // הסר תמונות גדולות עד שנכנס
          const sorted=[]; flightExam.parts.forEach(p=>{ if(p.pathImg) sorted.push({p, key:'pathImg', size:p.pathImg.length}); if(p.testImg) sorted.push({p, key:'testImg', size:p.testImg.length}); }); sorted.sort((a,b)=>b.size-a.size); while(sorted.length){ const rem=sorted.shift(); console.warn('[flightexam] removing image', rem.p.name, rem.key, 'size', rem.size); rem.p[rem.key]=''; rem.p[rem.key==='pathImg'?'pathW':'testW']=0; rem.p[rem.key==='pathImg'?'pathH':'testH']=0; try{ localStorage.setItem(LS_FLIGHTEXAM, JSON.stringify(flightExam)); console.log('[flightexam] saved after removals'); alert('חלק מהתמונות הוסרו עקב חוסר מקום.'); break; }catch(e2){ continue; } } } else { console.error('[flightexam] save error', err); } }
      if(changed) console.log('[flightexam] compression pass complete'); }
    
    // דחיסה ושמירה של תמונות מבחן התמצאות
    async function saveOrientationSets(){
      let changed = false;
      console.log('[orientation] compressing images before save...');
      
      for(const set of orientation.questionSets || []){
        // דילוג על נתיבי קבצים (לא dataURL)
        if(set.topImage && set.topImage.startsWith('data:') && set.topImage.length > 500000){
          console.log('[orientation] compress top', set.name, 'len', set.topImage.length);
          set.topImage = await compressDataUrl(set.topImage, 1024, 1024, 0.75);
          changed = true;
        }
        
        // Compress view images if too large
        if(set.viewImages && set.viewImages.length){
          for(const view of set.viewImages){
            if(view.url && view.url.startsWith('data:') && view.url.length > 500000){
              console.log('[orientation] compress view', set.name, view.orient, 'len', view.url.length);
              view.url = await compressDataUrl(view.url, 1024, 1024, 0.75);
              changed = true;
            }
          }
        }
      }
      
      try{
        localStorage.setItem(LS_ORIENTATION, JSON.stringify(orientation));
        console.log('[orientation] saved successfully');
      } catch(err){
        if(err.name === 'QuotaExceededError'){
          console.warn('[orientation] quota still exceeded after compression, trying aggressive compression');
          
          // Aggressive compression pass
          for(const set of orientation.questionSets || []){
            if(set.topImage && set.topImage.length > 300000){
              console.log('[orientation] aggressive compress top', set.name);
              set.topImage = await compressDataUrl(set.topImage, 800, 800, 0.6);
            }
            if(set.viewImages){
              for(const view of set.viewImages){
                if(view.url && view.url.length > 300000){
                  console.log('[orientation] aggressive compress view', set.name, view.orient);
                  view.url = await compressDataUrl(view.url, 800, 800, 0.6);
                }
              }
            }
          }
          
          // Try saving again
          try{
            localStorage.setItem(LS_ORIENTATION, JSON.stringify(orientation));
            console.log('[orientation] saved after aggressive compression');
            alert('⚠ התמונות דוחסו בצורה אגרסיבית כדי לחסוך מקום');
          } catch(err2){
            console.error('[orientation] still failed, removing largest images');
            
            // Last resort: remove largest images
            const allImages = [];
            orientation.questionSets.forEach((set, setIdx) => {
              if(set.topImage){
                allImages.push({set, setIdx, type: 'top', size: set.topImage.length});
              }
              if(set.viewImages){
                set.viewImages.forEach((view, viewIdx) => {
                  if(view.url){
                    allImages.push({set, setIdx, type: 'view', viewIdx, size: view.url.length});
                  }
                });
              }
            });
            
            allImages.sort((a,b) => b.size - a.size);
            
            while(allImages.length){
              const rem = allImages.shift();
              if(rem.type === 'top'){
                console.warn('[orientation] removing top image from', rem.set.name, 'size', rem.size);
                rem.set.topImage = '';
              } else {
                console.warn('[orientation] removing view image from', rem.set.name, 'size', rem.size);
                rem.set.viewImages.splice(rem.viewIdx, 1);
              }
              
              try{
                localStorage.setItem(LS_ORIENTATION, JSON.stringify(orientation));
                console.log('[orientation] saved after removing images');
                alert('⚠ חלק מהתמונות הוסרו עקב חוסר מקום. נסה להעלות תמונות קטנות יותר.');
                break;
              } catch(e3){
                continue;
              }
            }
          }
        } else {
          console.error('[orientation] save error', err);
          alert('❌ שגיאה בשמירת קבוצות התמצאות: ' + err.message);
        }
      }
      
      if(changed) console.log('[orientation] compression pass complete');
    }
  
    // Helper: המרת File ל-dataURL (מבטיח Promise)
    function fileToDataUrl(file){
      return new Promise((resolve,reject)=>{ if(!file){ return reject('no file'); } const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=()=>reject(fr.error||'read error'); try{ fr.readAsDataURL(file); }catch(e){ reject(e); } });
    }
  
    let settings=load(LS_KEY, DEFAULT_SETTINGS);
    if(!settings.newExamTiming){ settings.newExamTiming={ pathDisplaySec:15, preFlightDelaySec:10, flightDurationSec:60 }; }
    let north=load(LS_NORTH, DEFAULT_NORTH);
    let flightExam=load(LS_FLIGHTEXAM, load(LS_NEWEXAM_OLD, DEFAULT_FLIGHTEXAM));
    let orientation=load(LS_ORIENTATION, DEFAULT_ORIENTATION);
    
    window.appSettings = settings;
    window.getTestConfig = id => settings.tests.find(t=>t.id===id) || null;
    window.getGlobalScale = ()=> ({min:settings.scaleMin, max:settings.scaleMax});
    window.getNorthConfig = ()=> load(LS_NORTH, DEFAULT_NORTH);
    window.getFlightExamParts = ()=> load(LS_FLIGHTEXAM, load(LS_NEWEXAM_OLD, DEFAULT_FLIGHTEXAM)).parts;
    window.getNewExamParts = window.getFlightExamParts; // Alias תאימות
    window.getOrientationConfig = ()=> load(LS_ORIENTATION, DEFAULT_ORIENTATION);
  
    const adminBtn=document.getElementById('admin-button');
    const adminScreen=document.getElementById('admin-screen');
    const adminLock=document.getElementById('admin-lock');
    const adminSettingsBox=document.getElementById('admin-settings');
  
    // Build modern admin UI
    function buildAdminUI(){
        if(!adminSettingsBox) return;
  
        // הזרקת סטייל חד־פעמית לסרגל השמירה (אם טרם קיים)
        if(!document.getElementById('adminSaveBarStyles')){
          const st=document.createElement('style');
          st.id='adminSaveBarStyles';
          st.textContent = `
            .admin-save-bar .save-bar-btn,
            .admin-save-bar .save-settings-btn {
              background: var(--bg-tertiary);
              color: var(--text-primary);
              border: 1px solid var(--border-color);
              padding: 8px 14px;
              border-radius: 8px;
              font-size: 0.8rem;
              cursor: pointer;
              transition: background .15s, color .15s, border-color .15s;
            }
            .admin-save-bar .save-bar-btn:hover,
            .admin-save-bar .save-settings-btn:hover {
              background: var(--bg-hover);
              color: var(--accent-primary);
              border-color: var(--accent-primary);
            }
            .admin-save-bar .save-bar-btn:active,
            .admin-save-bar .save-settings-btn:active {
              background: var(--bg-active);
            }
          `;
          document.head.appendChild(st);
        }
  
        adminSettingsBox.innerHTML = `
          <div class="admin-settings">
            <div class="admin-save-bar" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px;padding:10px 14px;border:2px solid var(--border-color);border-radius:12px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)">
              <div style="font-weight:600;font-size:0.95rem;display:flex;align-items:center;gap:6px">💾 ניהול ושמירה</div>
              <button id="saveSettings" class="save-settings-btn save-bar-btn" style="margin:0">שמור את כל ההגדרות</button>
              <button id="exportSettings" class="save-settings-btn save-bar-btn" style="margin:0">⬇ הורד הגדרות (JSON)</button>
              <button id="exportSettingsZip" class="save-settings-btn save-bar-btn" style="margin:0">🗜 הורד ZIP</button>
              <button id="importSettingsFile" class="save-settings-btn save-bar-btn" style="margin:0">📂 טען קובץ הגדרות</button>
              <span id="saveStatus" style="margin-right:auto;font-size:0.75rem;color:var(--text-secondary)"></span>
            </div>
            <div class="admin-tabs-bar">
              <button class="admin-tab-btn" data-admin-tab="general">כללי</button>
              <button class="admin-tab-btn" data-admin-tab="eyehand">תיאום עין-יד</button>
              <button class="admin-tab-btn" data-admin-tab="reaction">זמן תגובה</button>
              <button class="admin-tab-btn" data-admin-tab="memory">זיכרון מרחבי</button>
              <button class="admin-tab-btn" data-admin-tab="tracking">מעקב וקשב</button>
              <button class="admin-tab-btn" data-admin-tab="northfind">מציאת הצפון</button>
              <button class="admin-tab-btn" data-admin-tab="flightcontrol">בקרת טיסה</button>
              <button class="admin-tab-btn" data-admin-tab="targetid">ירי במטרות</button>
              <button class="admin-tab-btn" data-admin-tab="orientation">התמצאות</button>
              <button class="admin-tab-btn" data-admin-tab="flightexam">מבחן הטסה</button>
            </div>
  
          <!-- General Settings -->
          <div class="settings-section section-general" data-tab-section="general">
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
            
            <h4 style="margin-top:30px;margin-bottom:16px;color:var(--accent-primary)">סדר וכלילת מבחנים</h4>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">גרור שורה לשינוי סדר המבחנים. ההגדרות המפורטות של כל מבחן נמצאות בטאב הייעודי שלו.</p>
            <table class="tests-table">
              <thead>
                <tr>
                  <th>שם המבחן</th>
                  <th style="text-align:center">כלול במערכת</th>
                  <th style="text-align:center">מזהה</th>
                </tr>
              </thead>
              <tbody id="testsOrderConfig"></tbody>
            </table>
          </div>
  
          <!-- Eye-Hand Test Settings -->
          <div class="settings-section section-eyehand" data-tab-section="eyehand" style="display:none">
            <h3>מבחן תיאום עין-יד</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="eyehandInclude">
                  <input type="checkbox" id="eyehandInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</span>
              </div>
              <div class="form-group">
                <label for="eyehandSeconds">משך המבחן (שניות)</label>
                <input id="eyehandSeconds" type="number" min="5" max="600" value="30">
                <span class="form-hint">זמן שיינתן לנבחן להשלמת המסלול</span>
              </div>
              <div class="form-group">
                <label for="eyehandDifficulty">רמת קושי</label>
                <select id="eyehandDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על רוחב המסלול ומורכבותו</span>
              </div>
            </div>
          </div>
  
          <!-- Reaction Test Settings -->
          <div class="settings-section section-reaction" data-tab-section="reaction" style="display:none">
            <h3>מבחן זמן תגובה</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="reactionInclude">
                  <input type="checkbox" id="reactionInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</</span>
              </div>
              <div class="form-group">
                <label for="reactionSeconds">משך המבחן (שניות)</label>
                <input id="reactionSeconds" type="number" min="5" max="600" value="40">
                <span class="form-hint">זמן כולל למבחן</span>
              </div>
              <div class="form-group">
                <label for="reactionDifficulty">רמת קושי</label>
                <select id="reactionDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מהירות ומורכבות הצורות</span>
              </div>
              <div class="form-group">
                <label for="cfgReactionShapeSec">משך הופעת צורה (שניות)</label>
                <input id="cfgReactionShapeSec" type="number" min="0.2" step="0.1" max="10" value="1">
                <span class="form-hint">כל צורה מוחלפת מיד בסיום הזמן</span>
              </div>
            </div>
          </div>
  
          <!-- Memory Test Settings -->
          <div class="settings-section section-memory" data-tab-section="memory" style="display:none">
            <h3>מבחן זיכרון מרחבי</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="memoryInclude">
                  <input type="checkbox" id="memoryInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</span>
              </div>
              <div class="form-group">
                <label for="memorySeconds">משך המבחן (שניות)</label>
                <input id="memorySeconds" type="number" min="5" max="600" value="60">
                <span class="form-hint">זמן מקסימלי למבחן</span>
              </div>
              <div class="form-group">
                <label for="memoryDifficulty">רמת קושי</label>
                <select id="memoryDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על אורך הרצפים</span>
              </div>
            </div>
          </div>
  
          <!-- Tracking Test Settings -->
          <div class="settings-section section-tracking" data-tab-section="tracking" style="display:none">
            <h3>מבחן מעקב וקשב</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="trackingInclude">
                  <input type="checkbox" id="trackingInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</span>
              </div>
              <div class="form-group">
                <label for="trackingSeconds">משך המבחן (שניות)</label>
                <input id="trackingSeconds" type="number" min="5" max="600" value="30">
                <span class="form-hint">זמן המבחן</span>
              </div>
              <div class="form-group">
                <label for="trackingDifficulty">רמת קושי</label>
                <select id="trackingDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מהירות תנועת היעד</span>
              </div>
            </div>
          </div>
  
          <!-- North Find Test Settings -->
          <div class="settings-section section-northfind" data-tab-section="northfind" style="display:none">
            <h3>מבחן מציאת הצפון</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="northfindInclude">
                  <input type="checkbox" id="northfindInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</span>
              </div>
              <div class="form-group">
                <label for="northfindSeconds">משך המבחן (שניות)</label>
                <input id="northfindSeconds" type="number" min="5" max="600" value="45">
                <span class="form-hint">זמן כולל למבחן (כל הניסיונות)</span>
              </div>
              <div class="form-group">
                <label for="northfindDifficulty">רמת קושי</label>
                <select id="northfindDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מהירות הסיבוב</span>
              </div>
            </div>
            <h4 style="margin-top:30px;margin-bottom:16px">הגדרות מפורטות</h4>
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
            <div style="margin-top:15px;display:flex;gap:10px">
              <button id="btnNorthSave" class="save-settings-btn">שמור הגדרות צפון</button>
            </div>
            <span id="northStatus" class="route-status" style="margin-top:10px">טרם הועלו מפות</span>
            <div id="northfindImagesPreview" style="display:grid;gap:12px;margin-top:20px"></div>
          </div>
  
          <!-- Orientation Test Settings -->
          <div class="settings-section section-orientation" data-tab-section="orientation" style="display:none">
            <h3>מבחן התמצאות וכיוונים</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="orientationInclude">
                  <input type="checkbox" id="orientationInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</span>
              </div>
              <div class="form-group">
                <label for="orientationSeconds">זמן כולל למבחן (שניות)</label>
                <input id="orientationSeconds" type="number" min="60" max="3600" value="360">
                <span class="form-hint">זמן כולל לכל המבחן (ברירת מחדל: 6 דקות)</span>
              </div>
              <div class="form-group">
                <label for="orientationDifficulty">רמת קושי</label>
                <select id="orientationDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מספר אפשרויות בשאלות</span>
              </div>
            </div>
            
            <h4 style="margin-top:30px;margin-bottom:16px">הגדרות מתקדמות</h4>
            <div class="form-grid">
              <div class="form-group">
                <label for="orientMaxQuestions">מספר שאלות מקסימלי</label>
                <input id="orientMaxQuestions" type="number" min="1" max="50" value="10">
                <span class="form-hint">כמות השאלות שיופיעו במבחן</span>
              </div>
              <div class="form-group">
                <label for="orientScoreScale">סקאלת ציון</label>
                <input id="orientScoreScale" type="number" min="1" max="100" value="7">
                <span class="form-hint">ציון מקסימלי למבחן</span>
              </div>
              <div class="form-group">
                <label for="orientShowCompass">
                  <input type="checkbox" id="orientShowCompass" style="width:auto;margin-left:8px" checked>
                  הצג שושנת רוחות
                </label>
                <span class="form-hint">הצגת מצפן על תמונת המבט על</span>
              </div>
            </div>
  
            <h4 style="margin-top:30px;margin-bottom:16px">ניהול קבוצות שאלות</h4>
            <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:12px">
              כל קבוצה מכילה תמונת "מבט על" ומספר תמונות מבט מכיוונים שונים.
              המערכת תבחר באופן אקראי שאלות מהקבוצות הקיימות.
            </p>
            
            <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
              <button id="btnAddOrientationSet" class="btn btn-secondary">➕ הוסף קבוצת שאלות</button>
              <button id="btnBulkUpload" class="btn" style="background:#8b5cf6;color:#fff">📁 העלה תיקייה (קבצים מרובים)</button>
            </div>
            
            <div style="background:var(--bg-tertiary);border:2px solid var(--border-color);border-radius:10px;padding:12px;margin-bottom:16px;font-size:0.85rem">
              <strong>📋 פורמט שמות קבצים:</strong><br>
              <code style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;margin:4px 2px;display:inline-block">1-TOP.jpg</code> = קבוצה 1, מבט על<br>
              <code style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;margin:4px 2px;display:inline-block">1-E2W.jpg</code> = קבוצה 1, מזרח למערב<br>
              <code style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;margin:4px 2px;display:inline-block">2-N2S.png</code> = קבוצה 2, צפון לדרום<br>
              <code style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;margin:4px 2px;display:inline-block">2-S2N.jpg</code> = קבוצה 2, דרום לצפון<br>
              <code style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;margin:4px 2px;display:inline-block">2-W2E.jpg</code> = קבוצה 2, מערב למזרח<br>
              <span style="color:var(--text-secondary);font-size:0.8rem">קבצים שלא מתאימים לפורמט ידלגו אוטומטית</span>
            </div>
            
            <div id="orientationSetsContainer" style="display:grid;gap:18px"></div>
            <button id="btnSaveOrientationSets" class="save-settings-btn" style="margin-top:20px">שמור קבוצות</button>
            <span id="orientationStatus" class="route-status" style="margin-top:10px">אין קבוצות מוגדרות</span>

            <h4 style="margin-top:40px;margin-bottom:14px">תמונות קיימות בבסיס (Supabase)</h4>
            <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 10px">טעינה אוטומטית של כל התמונות מהטבלה orientation_images וקיבוץ לפי מספר מבחן. לחיצה כפולה על תמונה לפתיחה מלאה.</p>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <button id="btnReloadOrientationDb" class="btn btn-secondary" style="padding:6px 14px;font-size:0.75rem">↻ רענן</button>
              <span id="orientationDbStatus" style="font-size:0.75rem;color:var(--text-secondary)">ממתין לטעינה...</span>
            </div>
            <div id="orientationDbPreview" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;min-height:60px"></div>
          </div>
  
          <!-- Flight Control Test Settings -->
          <div class="settings-section section-flightcontrol" data-tab-section="flightcontrol" style="display:none">
            <h3>מבחן בקרת טיסה</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="flightcontrolInclude">
                  <input type="checkbox" id="flightcontrolInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</span>
              </div>
              <div class="form-group">
                <label for="flightcontrolSeconds">משך המבחן (שניות)</label>
                <input id="flightcontrolSeconds" type="number" min="5" max="600" value="60">
                <span class="form-hint">זמן המבחן</span>
              </div>
              <div class="form-group">
                <label for="flightcontrolDifficulty">רמת קושי</label>
                <select id="flightcontrolDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על עוצמת ההפרעות</span>
              </div>
            </div>
          </div>
  
          <!-- Target ID Test Settings -->
          <div class="settings-section section-targetid" data-tab-section="targetid" style="display:none">
            <h3>מבחן ירי במטרות</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="targetidInclude">
                  <input type="checkbox" id="targetidInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</span>
              </div>
              <div class="form-group">
                <label for="targetidSeconds">משך המבחן (שניות)</label>
                <input id="targetidSeconds" type="number" min="5" max="600" value="60">
                <span class="form-hint">זמן המבחן</span>
              </div>
              <div class="form-group">
                <label for="targetidDifficulty">רמת קושי</label>
                <select id="targetidDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מהירות ומספר המטרות</span>
              </div>
            </div>
          </div>
  
          <!-- Flight Exam Test Settings -->
          <div class="settings-section section-flightexam" data-tab-section="flightexam" style="display:none">
            <h3>מבחן הטסה</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="flightexamInclude">
                  <input type="checkbox" id="flightexamInclude" style="width:auto;margin-left:8px">
                  כלול במערכת
                </label>
                <span class="form-hint">האם המבחן יופיע בתפריט</span>
              </div>
              <div class="form-group">
                <label for="flightexamSeconds">משך כל חלק (שניות)</label>
                <input id="flightexamSeconds" type="number" min="5" max="600" value="20">
                <span class="form-hint">זמן ברירת מחדל לחלק</span>
              </div>
              <div class="form-group">
                <label for="flightexamDifficulty">רמת קושי</label>
                <select id="flightexamDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על רגישות הדיוק</span>
              </div>
            </div>
            
            <h4 style="margin-top:30px;margin-bottom:16px">זמני שלבי המבחן</h4>
            <div class="form-grid">
              <div class="form-group">
                <label for="flightExamPathTime">זמן צפייה במסלול (שניות)</label>
                <input id="flightExamPathTime" type="number" min="3" max="300" value="15">
                <span class="form-hint">משך הצגת המסלול לפני ספירה</span>
              </div>
              <div class="form-group">
                <label for="flightExamPreDelay">ספירת ביניים (שניות)</label>
                <input id="flightExamPreDelay" type="number" min="0" max="120" value="10">
                <span class="form-hint">ספירה לאחר תנועת המטוס על המסלול</span>
              </div>
              <div class="form-group">
                <label for="flightExamFlightDur">זמן טיסה (שניות)</label>
                <input id="flightExamFlightDur" type="number" min="5" max="600" value="60">
                <span class="form-hint">הזמן שבו הנבחן מזיז את המטוס</span>
              </div>
            </div>
  
            <h4 style="margin-top:30px;margin-bottom:16px">חלקי המבחן</h4>
            <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:12px">הוסף חלקים ללא הגבלה. בכל חלק: העלאת שתי תמונות (מסלול / מבחן).</p>
            <button id="btnAddFlightExamPart" class="btn btn-secondary" style="margin-bottom:16px">➕ הוסף חלק</button>
            <div id="flightExamPartsContainer" style="display:grid;gap:18px"></div>
            <button id="btnSaveFlightExamParts" class="save-settings-btn" style="margin-top:20px">שמור חלקים</button>
            <span id="flightExamStatus" class="route-status" style="margin-top:10px">אין חלקים מוגדרים</span>
          </div>
        </div>
      `;
      
      // הפעלת טאבים
      const btns = adminSettingsBox.querySelectorAll('.admin-tab-btn');
      const sections = adminSettingsBox.querySelectorAll('[data-tab-section]');
      btns.forEach(b=>{ 
        b.onclick=()=>{ 
          const tab=b.getAttribute('data-admin-tab'); 
          btns.forEach(x=>x.classList.remove('active')); 
          b.classList.add('active'); 
          sections.forEach(sec=>{ 
            const secTab = sec.getAttribute('data-tab-section');
            sec.style.display = (secTab===tab || (tab==='general' && secTab==='general')) ? '' : 'none'; 
          }); 
        }; 
      });
      
      // סימון ברירת מחדל לטאב כללי
      const first=adminSettingsBox.querySelector('.admin-tab-btn[data-admin-tab="general"]'); 
      if(first) first.click();
    }
  
    function rebuildTestsConfig(){
      // רשימת סדר מבחנים פשוטה ללא עריכת זמנים ורמות קושי
      const tbody = document.getElementById('testsOrderConfig');
      if(!tbody) return;
      tbody.innerHTML='';
      settings.tests.forEach((t,i)=>{
        const row=document.createElement('tr');
        row.className='test-row';
        row.draggable=true;
        row.dataset.index=i;
        row.innerHTML=`
          <td><span class="drag-handle" title="גרור לסידור">↕</span> ${t.name}</td>
          <td style="text-align:center"><input type="checkbox" data-i="${i}" class="t-include" ${t.include? 'checked':''}></td>
          <td style="text-align:center"><span class="pill-small">${t.id}</span></td>
        `;
        tbody.appendChild(row);
      });
      
      document.querySelectorAll('.t-include').forEach(el=> el.onchange=()=>{ const i=+el.dataset.i; settings.tests[i].include=el.checked; buildTestSelectorUI(); });
      
      // Drag & Drop
      let dragIndex=null;
      tbody.querySelectorAll('.test-row').forEach(r=>{
        r.addEventListener('dragstart', e=>{ dragIndex=+r.dataset.index; r.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
        r.addEventListener('dragend', ()=>{ r.classList.remove('dragging'); dragIndex=null; tbody.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target')); });
        r.addEventListener('dragover', e=>{ e.preventDefault(); if(r.dataset.index!=dragIndex){ r.classList.add('drop-target'); } });
        r.addEventListener('dragleave', ()=>{ r.classList.remove('drop-target'); });
        r.addEventListener('drop', e=>{ 
          e.preventDefault(); 
          const targetIndex=+r.dataset.index; 
          if(dragIndex===null||dragIndex===targetIndex) return;
          const moved=settings.tests.splice(dragIndex,1)[0]; 
          settings.tests.splice(targetIndex,0,moved); 
          rebuildTestsConfig();
          syncAllTestFields(); // רענון כל השדות
          buildTestSelectorUI();
        });
      });
    }
  
    function syncAllTestFields(){
      // סנכרון כל שדות המבחנים מהמערך למסכים הייעודיים
      settings.tests.forEach(t=>{
        const includeEl = document.getElementById(t.id+'Include');
        const secondsEl = document.getElementById(t.id+'Seconds');
        const difficultyEl = document.getElementById(t.id+'Difficulty');
        
        if(includeEl) { includeEl.checked = t.include; includeEl.onchange=()=>{ t.include=includeEl.checked; buildTestSelectorUI(); }; }
        if(secondsEl) { secondsEl.value = t.seconds; secondsEl.oninput=()=>{ t.seconds=Math.max(5,Math.min(600,+secondsEl.value||30)); secondsEl.value=t.seconds; }; }
        if(difficultyEl) { difficultyEl.value = t.difficulty; difficultyEl.onchange=()=>{ t.difficulty=difficultyEl.value; }; }
      });
    }
  
    function syncGeneralFields(){
      const candidateEl=document.getElementById('cfgCandidate');
      const scaleMinEl=document.getElementById('cfgScaleMin');
      const scaleMaxEl=document.getElementById('cfgScaleMax');
      const reactionShapeSecEl=document.getElementById('cfgReactionShapeSec');
      if(candidateEl) candidateEl.value=settings.candidateId;
      if(scaleMinEl) scaleMinEl.value=settings.scaleMin;
      if(scaleMaxEl) scaleMaxEl.value=settings.scaleMax;
      if(reactionShapeSecEl) reactionShapeSecEl.value=settings.reactionShapeDisplaySec;
      if(candidateEl) candidateEl.oninput=()=>{ settings.candidateId=candidateEl.value.trim(); };
      if(scaleMinEl) scaleMinEl.oninput=()=>{ settings.scaleMin=Math.max(1, +scaleMinEl.value||1); if(settings.scaleMin>=settings.scaleMax){ settings.scaleMax=settings.scaleMin+1; if(scaleMaxEl) scaleMaxEl.value=settings.scaleMax; } };
      if(scaleMaxEl) scaleMaxEl.oninput=()=>{ settings.scaleMax=Math.max(settings.scaleMin+1, +scaleMaxEl.value||7); scaleMaxEl.value=settings.scaleMax; };
      if(reactionShapeSecEl){ reactionShapeSecEl.oninput=()=>{ settings.reactionShapeDisplaySec=Math.max(0.2, Math.min(10, +reactionShapeSecEl.value||1)); reactionShapeSecEl.value=settings.reactionShapeDisplaySec; }; }
    }
  
    function syncNewExamTiming(){
      const pathTime=document.getElementById('flightExamPathTime');
      const preDelay=document.getElementById('flightExamPreDelay');
      const flightDur=document.getElementById('flightExamFlightDur');
      if(!pathTime||!preDelay||!flightDur) return;
      pathTime.value=settings.newExamTiming.pathDisplaySec;
      preDelay.value=settings.newExamTiming.preFlightDelaySec;
      flightDur.value=settings.newExamTiming.flightDurationSec;
      pathTime.oninput=()=>{ settings.newExamTiming.pathDisplaySec=Math.max(3,Math.min(300,+pathTime.value||15)); pathTime.value=settings.newExamTiming.pathDisplaySec; };
      preDelay.oninput=()=>{ settings.newExamTiming.preFlightDelaySec=Math.max(0,Math.min(120,+preDelay.value||10)); preDelay.value=settings.newExamTiming.preFlightDelaySec; };
      flightDur.oninput=()=>{ settings.newExamTiming.flightDurationSec=Math.max(5,Math.min(600,+flightDur.value||60)); flightDur.value=settings.newExamTiming.flightDurationSec; };
    }
  
    // North settings - READ ONLY (images are in assets folder)
    function setupNorth(){
      const northTrialsEl=document.getElementById('northTrials');
      const northShowNorthEl=document.getElementById('northShowNorth');
      const northSpinEl=document.getElementById('northSpin');
      const northAnswerEl=document.getElementById('northAnswer');
      const northStatus=document.getElementById('northStatus');
      
      function syncNorth(){
        if(northTrialsEl) northTrialsEl.value=north.trials;
        if(northShowNorthEl) northShowNorthEl.value=north.showNorthSec;
        if(northSpinEl) northSpinEl.value=north.spinSec;
        if(northAnswerEl) northAnswerEl.value=north.answerSec;
        updateNorthStatus();
      }
      
      function updateNorthStatus(){
        if(!northStatus) return;
        northStatus.textContent='✓ תמונות נטענות אוטומטית מתיקיית assets/images/northfind';
        northStatus.classList.add('ready');
      }
      
      function buildNorthfindPreview(){
        const holder = document.getElementById('northfindImagesPreview');
        if(!holder) return;
        const files = [
          'North_snapshot_11-10-2025_22_59_45.jpeg',
          'North_snapshot_11-10-2025_23_00_07.jpeg',
          'North_snapshot_11-10-2025_23_03_24.jpeg',
          'North_snapshot_11-10-2025_23_03_38.jpeg',
          'North_snapshot_11-10-2025_23_04_05.jpeg'
        ];
        holder.innerHTML = files.map(f=>`
          <div style="position:relative;border:2px solid var(--border-color);border-radius:8px;overflow:hidden;background:#0f172a">
            <img src="assets/images/northfind/${f}" style="width:100%;height:100px;object-fit:cover" onerror="this.parentNode.style.display='none'">
          </div>
        `).join('');
      }
      buildNorthfindPreview();
      
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
      
      // Save north config
      const btnNorthSave=document.getElementById('btnNorthSave');
      if(btnNorthSave) btnNorthSave.onclick=()=>{
        save(LS_NORTH,north);
        updateNorthStatus();
        alert('✓ הגדרות מציאת הצפון נשמרו בהצלחה');
      };
    }
  
    // New Exam Parts
    let renderNewExamPartsRef = null; // מצביע גלובלי לפונקציית רענון חלקי המבחן החדש
    
    // Orientation Question Sets
    function setupOrientation(){
      const container = document.getElementById('orientationSetsContainer');
      const addBtn = document.getElementById('btnAddOrientationSet');
      const saveBtn = document.getElementById('btnSaveOrientationSets');
      const statusEl = document.getElementById('orientationStatus');
      
      const maxQuestionsEl = document.getElementById('orientMaxQuestions');
      const scoreScaleEl = document.getElementById('orientScoreScale');
      const showCompassEl = document.getElementById('orientShowCompass');
      
      if(!container) return;
      
      // Parse filename to extract group number and orientation
      // Expected format: "1-E2W.jpg" or "2-TOP.png"
      function parseFilename(filename) {
        const cleaned = filename.replace(/\.(jpg|jpeg|png|gif|bmp|webp)$/i, '');
        const match = cleaned.match(/^(\d+)-(TOP|N2S|S2N|E2W|W2E)$/i);
        if (!match) return null;
        return {
          groupNum: parseInt(match[1]),
          tag: match[2].toUpperCase()
        };
      }
      
      // Bulk upload handler
      async function handleBulkUpload(files) {
        if (!files || files.length === 0) return;
        
        const grouped = {}; // {groupNum: {top: dataURL, views: [{url, orient}]}}
        let processed = 0;
        let skipped = 0;
        
        for (const file of files) {
          const parsed = parseFilename(file.name);
          if (!parsed) {
            console.warn('[orientation] skipped file (invalid format):', file.name);
            skipped++;
            continue;
          }
          
          const { groupNum, tag } = parsed;
          
          try {
            const dataUrl = await fileToDataUrl(file);
            
            if (!grouped[groupNum]) {
              grouped[groupNum] = { top: '', views: [] };
            }
            
            if (tag === 'TOP') {
              grouped[groupNum].top = dataUrl;
            } else if (['N2S', 'S2N', 'E2W', 'W2E'].includes(tag)) {
              grouped[groupNum].views.push({ url: dataUrl, orient: tag });
            }
            
            processed++;
          } catch (err) {
            console.error('[orientation] error reading file:', file.name, err);
            skipped++;
          }
        }
        
        // Convert to question sets
        const newSets = [];
        Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b)).forEach(groupNum => {
          const data = grouped[groupNum];
          if (data.top || data.views.length > 0) {
            newSets.push({
              id: 'set_' + Date.now() + '_' + groupNum,
              name: 'קבוצה ' + groupNum,
              topImage: data.top || '',
              viewImages: data.views
            });
          }
        });
        
        if (newSets.length > 0) {
          if (!orientation.questionSets) orientation.questionSets = [];
          
          const action = confirm(
            `נמצאו ${newSets.length} קבוצות (${processed} קבצים).\n` +
            `דלגו על ${skipped} קבצים.\n\n` +
            `האם להוסיף לקבוצות הקיימות?\n` +
            `(Cancel = החלף את כל הקבוצות)`
          );
          
          if (action) {
            // Append to existing
            orientation.questionSets.push(...newSets);
          } else {
            // Replace all
            orientation.questionSets = newSets;
          }
          
          renderSets();
          updateStatus();
          
          alert(
            `✓ הועלו ${newSets.length} קבוצות בהצלחה!\n` +
            `עיבדנו ${processed} קבצים, דילגנו על ${skipped}.\n\n` +
            `אל תשכח ללחוץ "שמור קבוצות" למטה!`
          );
        } else {
          alert(`לא נמצאו קבצים תקינים.\n\nצריך קבצים בפורמט:\n1-TOP.jpg\n1-E2W.jpg\n2-N2S.png\nוכו'`);
        }
      }
      
      // Sync advanced fields
      function syncOrientationFields(){
        if(maxQuestionsEl) {
          maxQuestionsEl.value = orientation.maxQuestions || 10;
          maxQuestionsEl.oninput = ()=>{ orientation.maxQuestions = Math.max(1, Math.min(50, +maxQuestionsEl.value || 10)); };
        }
        if(scoreScaleEl) {
          scoreScaleEl.value = orientation.scoreScale || 7;
          scoreScaleEl.oninput = ()=>{ orientation.scoreScale = Math.max(1, Math.min(100, +scoreScaleEl.value || 7)); };
        }
        if(showCompassEl) {
          showCompassEl.checked = orientation.showCompass !== false;
          showCompassEl.onchange = ()=>{ orientation.showCompass = showCompassEl.checked; };
        }
      }
      
      function updateStatus(){
        if(!statusEl) return;
        const n = orientation.questionSets ? orientation.questionSets.length : 0;
        if(n === 0) {
          statusEl.textContent = 'אין קבוצות מוגדרות';
          statusEl.classList.remove('ready');
        } else {
          statusEl.textContent = `✓ ${n} קבוצות שאלות`;
          statusEl.classList.add('ready');
        }
      }
      
      function createSet(){
        return {
          id: 'set_' + Date.now(),
          name: 'קבוצה חדשה',
          topImage: '',
          viewImages: [] // [{url: dataURL, orient: 'N2S'}]
        };
      }
      
      function renderSets(){
        if(!orientation.questionSets) orientation.questionSets = [];
        container.innerHTML = '';
        
        orientation.questionSets.forEach((set, idx) => {
          const card = document.createElement('div');
          card.style.border = '2px solid var(--border-color)';
          card.style.borderRadius = '14px';
          card.style.padding = '16px';
          card.style.background = 'var(--bg-secondary)';
          card.style.boxShadow = 'var(--shadow-sm)';
          
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <input type="text" class="orient-set-name" data-i="${idx}" value="${set.name}" 
                style="flex:1;padding:10px;border:2px solid var(--border-color);border-radius:8px;margin-left:10px" 
                placeholder="שם הקבוצה">
              <button class="btn-remove-set" data-i="${idx}" 
                style="background:#ef4444;color:#fff;border:none;width:34px;height:34px;border-radius:10px;font-size:20px;line-height:1">×</button>
            </div>
            
            <div style="display:grid;gap:16px">
              <!-- Top Image -->
              <div>
                <label style="font-weight:600;display:block;margin-bottom:8px">תמונת מבט על (הצפון למעלה)</label>
                <div class="preview-box" style="height:160px;border:2px dashed var(--border-color);border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg-tertiary)">
                  ${set.topImage ? `<img src="${set.topImage}" style="width:100%;height:100%;object-fit:cover">` : '<span style="color:var(--text-secondary);font-size:12px">אין תמונה</span>'}
                </div>
                ${set.topImage ? 
                  `<div style="display:flex;gap:8px;margin-top:8px">
                    <span style="font-size:11px;color:#10b981">✓ תמונה נקבעה</span>
                    <button class="btn-change-top" data-i="${idx}" style="padding:4px 10px;font-size:11px;border:1px solid #0284c7;border-radius:6px;background:#0ea5e9;color:#fff;cursor:pointer">החלף</button>
                    <button class="btn-remove-top" data-i="${idx}" style="padding:4px 10px;font-size:11px;border:1px solid #dc2626;border-radius:6px;background:#ef4444;color:#fff;cursor:pointer">הסר</button>
                  </div>
                  <input type="file" accept="image/*" class="orient-top-img" data-i="${idx}" style="display:none">` : 
                  `<input type="file" accept="image/*" class="orient-top-img" data-i="${idx}" style="margin-top:8px">`
                }
              </div>
              
              <!-- View Images -->
              <div>
                <label style="font-weight:600;display:block;margin-bottom:8px">תמונות מבט מכיוונים (${set.viewImages.length})</label>
                <div class="view-images-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-bottom:12px">
                  ${set.viewImages.map((view, vIdx) => `
                    <div style="position:relative;border:2px solid var(--border-color);border-radius:8px;overflow:hidden">
                      <img src="${view.url}" style="width:100%;height:100px;object-fit:cover">
                      <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:white;padding:4px;font-size:11px;text-align:center">
                        ${view.orient || 'לא מוגדר'}
                      </div>
                      <button class="btn-remove-view" data-set="${idx}" data-view="${vIdx}" 
                        style="position:absolute;top:4px;left:4px;background:#ef4444;color:#fff;border:none;width:24px;height:24px;border-radius:6px;font-size:16px;line-height:1;cursor:pointer">×</button>
                    </div>
                  `).join('')}
                </div>
                <button class="btn-add-view" data-i="${idx}" 
                  style="padding:8px 16px;background:#10b981;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem">
                  ➕ הוסף תמונת מבט
                </button>
              </div>
            </div>
          `;
          
          container.appendChild(card);
        });
        
        // Bind events
        container.querySelectorAll('.orient-set-name').forEach(inp => {
          inp.oninput = ()=>{ 
            const i = +inp.dataset.i; 
            orientation.questionSets[i].name = inp.value.trim() || 'קבוצה ' + (i+1); 
          };
        });
        
        container.querySelectorAll('.orient-top-img').forEach(inp => {
          inp.onchange = async e => {
            const f = e.target.files && e.target.files[0];
            if(!f) return;
            const i = +inp.dataset.i;
            const data = await fileToDataUrl(f);
            orientation.questionSets[i].topImage = data;
            renderSets();
            updateStatus();
          };
        });
        
        container.querySelectorAll('.btn-change-top').forEach(btn => {
          btn.onclick = ()=> {
            const i = +btn.dataset.i;
            const hidden = container.querySelector(`.orient-top-img[data-i='${i}']`);
            hidden && hidden.click();
          };
        });
        
        container.querySelectorAll('.btn-remove-top').forEach(btn => {
          btn.onclick = ()=> {
            const i = +btn.dataset.i;
            orientation.questionSets[i].topImage='';
            renderSets();
            updateStatus();
          };
        });
        
        container.querySelectorAll('.btn-add-view').forEach(btn => {
          btn.onclick = async ()=> {
            const i = +btn.dataset.i;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async e => {
              const f = e.target.files && e.target.files[0];
              if(!f) return;
              
              // Ask for orientation
              const orient = prompt('הזן כיוון (N2S / S2N / E2W / W2E):', 'N2S');
              if(!orient || !['N2S', 'S2N', 'E2W', 'W2E'].includes(orient.toUpperCase())) {
                alert('כיוון לא תקין. נדרש אחד מהבאים: N2S, S2N, E2W, W2E');
                return;
              }
              
              const data = await fileToDataUrl(f);
              if(!orientation.questionSets[i].viewImages) orientation.questionSets[i].viewImages = [];
              orientation.questionSets[i].viewImages.push({
                url: data,
                orient: orient.toUpperCase()
              });
              renderSets();
              updateStatus();
            };
            input.click();
          };
        });
        
        container.querySelectorAll('.btn-remove-view').forEach(btn => {
          btn.onclick = ()=> {
            const setIdx = +btn.dataset.set;
            const viewIdx = +btn.dataset.view;
            orientation.questionSets[setIdx].viewImages.splice(viewIdx, 1);
            renderSets();
            updateStatus();
          };
        });
        
        container.querySelectorAll('.btn-remove-set').forEach(btn => {
          btn.onclick = ()=> {
            const i = +btn.dataset.i;
            if(confirm('האם אתה בטוח שברצונך למחוק קבוצה זו?')) {
              orientation.questionSets.splice(i, 1);
              renderSets();
              updateStatus();
            }
          };
        });
        
        updateStatus();
      }
      
      async function autoLoadDefaultOrientationSets(){
        if(orientation.questionSets && orientation.questionSets.length) return; // כבר קיימים
        console.log('[orientation] attempting to auto-load default sets from assets...');
        const directions = ['N2S','S2N','E2W','W2E'];
        const loaded = [];
        async function imgExists(url){ return new Promise(r=>{ const im=new Image(); im.onload=()=>r(true); im.onerror=()=>r(false); im.src=url; }); }
        for(let i=1;i<=20;i++){ // נסיון עד 20 סטים
          const setName = `תרגיל כיוונים ${i}`;
          const topPath = `assets/images/orientation/${setName}/${i}-TOP.jpeg`;
          const okTop = await imgExists(topPath);
            if(!okTop){ if(i>8) break; else continue; }
          const views = [];
          for(const d of directions){
            const p = `assets/images/orientation/${setName}/${i}-${d}.jpeg`;
            const ok = await imgExists(p);
            if(ok) views.push({url:p, orient:d});
          }
          loaded.push({
            id: 'default_'+i,
            name: setName,
            topImage: topPath,
            viewImages: views
          });
        }
        if(loaded.length){
          orientation.questionSets = loaded;
          console.log('[orientation] auto-loaded', loaded.length, 'sets');
          renderSets();
          updateStatus();
          if(window.loadOrientationSets){
            window.loadOrientationSets(orientation.questionSets);
          }
        }
      }
      // קריאה אוטומטית לטעינת סטים אם אין ב-LS
      autoLoadDefaultOrientationSets();
      
      syncOrientationFields();
      renderSets();
      
      if(addBtn) addBtn.onclick = ()=> {
        if(!orientation.questionSets) orientation.questionSets = [];
        orientation.questionSets.push(createSet());
        renderSets();
      };
      
      if(saveBtn) saveBtn.onclick = ()=> {
        saveOrientationSets();
        if(window.loadOrientationSets) {
          window.loadOrientationSets(orientation.questionSets || []);
        }
        updateStatus();
        alert('✓ קבוצות שאלות התמצאות נשמרו בהצלחה');
        // התחלת סנכרון העלאת קבוצות חדשות ל-Supabase
        if(window.orientationSync && typeof window.orientationSync.syncNewSets==='function'){
          window.orientationSync.syncNewSets(orientation.questionSets || []);
        }
      };
  
      // Bulk upload button
      const bulkUploadBtn = document.getElementById('btnBulkUpload');
      if (bulkUploadBtn) {
        bulkUploadBtn.onclick = () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.multiple = true;
          input.webkitdirectory = true; // מאפשר בחירת תיקייה שלמה
          input.directory = true; // תמיכה נוספת בדפדפנים
          input.onchange = async (e) => {
            const files = e.target.files;
            await handleBulkUpload(files);
          };
          input.click();
        };
      }
    }
  
    function setupNewExamParts(){
      const container=document.getElementById('flightExamPartsContainer');
      const addBtn=document.getElementById('btnAddFlightExamPart');
      const saveBtn=document.getElementById('btnSaveFlightExamParts');
      const statusEl=document.getElementById('flightExamStatus');
      if(!container) return;
  
      function updateStatus(){
        if(!statusEl) return;
        const n=flightExam.parts.length;
        if(n===0){ statusEl.textContent='אין חלקים מוגדרים'; statusEl.classList.remove('ready'); }
        else { statusEl.textContent='✓ '+n+' חלקים'; statusEl.classList.add('ready'); }
      }
  
      function createPart(id){
        return { id, name:'חלק '+(id), pathImg:'', pathW:0, pathH:0, testImg:'', testW:0, testH:0, pathPoints:[] };
      }
  
      function renderParts(){
        container.innerHTML='';
        flightExam.parts.forEach((p,idx)=>{
          const card=document.createElement('div');
          card.style.border='2px solid var(--border-color)';
          card.style.borderRadius='14px';
          card.style.padding='16px';
          card.style.background='var(--bg-secondary)';
          card.style.boxShadow='var(--shadow-sm)';
          card.innerHTML=`
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <input type="text" class="nx-name" data-i="${idx}" value="${p.name}" style="flex:1;padding:10px;border:2px solid var(--border-color);border-radius:8px;margin-left:10px" placeholder="שם החלק">
              <div style="display:flex;gap:8px">
                <button class="nx-edit-path-btn btn btn-secondary" data-i="${idx}" style="padding:8px 14px;font-size:0.75rem">✏ מסלול</button>
                <button class="btn-remove-map" data-remove="${idx}" style="background:#ef4444;color:#fff;border:none;width:34px;height:34px;border-radius:10px;font-size:20px;line-height:1">×</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
              <div style="display:flex;flex-direction:column;gap:8px">
                <label style="font-weight:600">תמונת מסלול</label>
                <div class="preview-box" style="height:160px;border:2px dashed var(--border-color);border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg-tertiary)">
                  ${p.pathImg? `<img src="${p.pathImg}" style="width:100%;height:100%;object-fit:cover">` : '<span style="color:var(--text-secondary);font-size:12px">אין תמונה</span>'}
                </div>
                ${p.pathImg? `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#10b981">✓ נקבעה תמונת מסלול <button type="button" class="btn-change-path" data-i="${idx}" style="padding:4px 10px;font-size:11px;border:1px solid #0284c7;border-radius:6px;background:#0ea5e9;color:#fff;cursor:pointer">החלף</button><button type="button" class="btn-remove-path" data-i="${idx}" style="padding:4px 10px;font-size:11px;border:1px solid #dc2626;border-radius:6px;background:#ef4444;color:#fff;cursor:pointer">הסר</button></div><input type="file" accept="image/*" class="nx-path" data-i="${idx}" style="display:none">` : `<input type="file" accept="image/*" class="nx-path" data-i="${idx}">`}
              </div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <label style="font-weight:600">תמונת מבחן</label>
                <div class="preview-box" style="height:160px;border:2px dashed var(--border-color);border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg-tertiary)">
                  ${p.testImg? `<img src="${p.testImg}" style="width:100%;height:100%;object-fit:cover">` : '<span style="color:var(--text-secondary);font-size:12px">אין תמונה</span>'}
                </div>
                ${p.testImg? `<div class="test-fixed" style="display:flex;align-items:center;gap:8px;font-size:11px;color:#0284c7">✓ נקבעה תמונת מבחן <button type="button" class="btn-change-test" data-i="${idx}" style="padding:4px 10px;font-size:11px;border:1px solid #0284c7;border-radius:6px;background:#0ea5e9;color:#fff;cursor:pointer">החלף</button><button type="button" class="btn-remove-test" data-i="${idx}" style="padding:4px 10px;font-size:11px;border:1px solid #dc2626;border-radius:6px;background:#ef4444;color:#fff;cursor:pointer">הסר</button></div><input type="file" accept="image/*" class="nx-test" data-i="${idx}" style="display:none">` : `<input type="file" accept="image/*" class="nx-test" data-i="${idx}">`}
              </div>
            </div>
            <div style="margin-top:6px;font-size:0.75rem;color:#64748b">נקודות: ${p.pathPoints.length}</div>
            <div class="upload-row" style="margin-top:10px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn-upload-flight" data-i="${idx}" style="padding:8px 16px;font-size:0.75rem;border-radius:8px;border:1px solid #2563eb;background:#3b82f6;color:#fff;cursor:pointer">⬆ העלה ל-Supabase</button>
              <span class="upload-status" data-i="${idx}" style="font-size:0.7rem;color:#94a3b8"></span>
            </div>
          `;
          container.appendChild(card);
        });
        container.querySelectorAll('.nx-name').forEach(inp=>{
          inp.oninput=()=>{ const i=+inp.dataset.i; flightExam.parts[i].name=inp.value.trim()||('חלק '+(i+1)); };
        });
        container.querySelectorAll('.nx-path').forEach(inp=>{
          inp.onchange=async e=>{ const f=e.target.files && e.target.files[0]; if(!f) return; const i=+inp.dataset.i; const data=await fileToDataUrl(f); const img=new Image(); const part=flightExam.parts[i]; part._loadingPath=true; img.onload=()=>{ part._loadingPath=false; const w=img.width, h=img.height; if(part.testImg && part.testW && part.testH && (part.testW!==w || part.testH!==h)){ alert('⚠ גדלים לא תואמים: המסלול חייב להיות '+part.testW+'x'+part.testH); return; } part.pathImg=data; part.pathW=w; part.pathH=h; saveNewExamParts(); console.log('[flightexam] path image saved', part.name, w+'x'+h); renderParts(); updateStatus(); setTimeout(()=>openNewExamPathEditor(i),120); }; img.onerror=()=>{ part._loadingPath=false; alert('❌ שגיאה בטעינת תמונת מסלול'); }; img.src=data; };
        });
        container.querySelectorAll('.nx-test').forEach(inp=>{
          inp.onchange=async e=>{ const f=e.target.files && e.target.files[0]; if(!f) return; const i=+inp.dataset.i; const data=await fileToDataUrl(f); const img=new Image(); const part=flightExam.parts[i]; part._loadingTest=true; img.onload=()=>{ part._loadingTest=false; const w=img.width, h=img.height; if(part.pathImg && part.pathW && part.pathH && (part.pathW!==w || part.pathH!==h)){ alert('⚠ גדלים לא תואמים: תמונת מבחן חייבת להיות '+part.pathW+'x'+part.pathH); return; } part.testImg=data; part.testW=w; part.testH=h; saveNewExamParts(); console.log('[flightexam] test image saved', part.name, w+'x'+h); renderParts(); updateStatus(); }; img.onerror=()=>{ part._loadingTest=false; alert('❌ שגיאה בטעינת תמונת מבחן'); }; img.src=data; };
        });
        container.querySelectorAll('.nx-edit-path-btn').forEach(btn=>{
          btn.onclick=()=>{ const i=+btn.dataset.i; openNewExamPathEditor(i); };
        });
        container.querySelectorAll('[data-remove]').forEach(btn=>{
          btn.onclick=()=>{ const i=+btn.dataset.remove; flightExam.parts.splice(i,1); renderParts(); updateStatus(); };
        });
        container.querySelectorAll('.btn-change-test').forEach(btn=>{ 
          btn.onclick=()=>{ const i=+btn.dataset.i; const hidden=container.querySelector(`.nx-test[data-i='${i}']`); hidden && hidden.click(); }; 
        });
        container.querySelectorAll('.btn-change-path').forEach(btn=>{ 
          btn.onclick=()=>{ const i=+btn.dataset.i; const hidden=container.querySelector(`.nx-path[data-i='${i}']`); hidden && hidden.click(); }; 
        });
        container.querySelectorAll('.btn-remove-path').forEach(btn=>{ 
          btn.onclick=()=>{ const i=+btn.dataset.i; const part=flightExam.parts[i]; part.pathImg=''; part.pathW=0; part.pathH=0; part.pathPoints=[]; saveNewExamParts(); renderParts(); updateStatus(); }; 
        });
        container.querySelectorAll('.btn-remove-test').forEach(btn=>{ 
          btn.onclick=()=>{ const i=+btn.dataset.i; const part=flightExam.parts[i]; part.testImg=''; part.testW=0; part.testH=0; saveNewExamParts(); renderParts(); updateStatus(); }; 
        });
        container.querySelectorAll('.btn-upload-flight').forEach(btn=>{
          btn.onclick=()=>{
            const i=+btn.dataset.i; const part=flightExam.parts[i];
            const status=container.querySelector('.upload-status[data-i="'+i+'"]');
            if(part._uploaded){ status.textContent='כבר הועלה'; return; }
            if(!part.pathImg || !part.testImg){ alert('חובה להגדיר תמונת מסלול ותמונת מבחן'); return; }
            if(!part.pathPoints || part.pathPoints.length<2){ alert('חובה להגדיר לפחות שתי נקודות במסלול'); return; }
            if(!window.flightExamSync || !window.flightExamSync.uploadNewPart){ alert('מודול סנכרון לא נטען'); return; }
            status.textContent='מעלה...'; btn.disabled=true;
            window.flightExamSync.uploadNewPart({
              name: part.name,
              pathImg: part.pathImg,
              testImg: part.testImg,
              pathPoints: part.pathPoints
            }).then(()=>{
              part._uploaded=true; status.textContent='✓ הועלה'; btn.disabled=true;
            }).catch(err=>{
              console.warn('upload error', err); status.textContent='שגיאה'; btn.disabled=false;
            });
          };
          const i=+btn.dataset.i; const part=flightExam.parts[i];
          if(part._uploaded){ btn.disabled=true; const status=container.querySelector('.upload-status[data-i="'+i+'"]'); if(status) status.textContent='✓ הועלה'; }
          else if(!part.pathImg || !part.testImg || !part.pathPoints || part.pathPoints.length<2){ btn.disabled=true; const status=container.querySelector('.upload-status[data-i="'+i+'"]'); if(status) status.textContent='חסר נתונים'; }
        });
        updateStatus();
      }
      renderNewExamPartsRef = renderParts;
      window.renderNewExamParts = renderParts;
      if(addBtn) addBtn.onclick=()=>{ const id='p'+Date.now(); flightExam.parts.push(createPart(id)); renderParts(); };
      if(saveBtn) saveBtn.onclick=()=>{ 
        for(const p of flightExam.parts){ if(p.pathImg && p.testImg){ if(p.pathW!==p.testW || p.pathH!==p.testH){ alert('חלק "'+p.name+'" לא נשמר: גדלי התמונות אינם זהים'); return; } } }
        saveNewExamParts(); updateStatus(); alert('✓ חלקי מבחן הטסה נשמרו'); };
      autoLoadDefaultFlightExamParts();
      renderParts();
    }
  
    function openNewExamPathEditor(index){
      const part=flightExam.parts[index]; if(!part||!part.pathImg){ alert('יש לבחור / להעלות תמונת מסלול קודם'); return; }
      const modal=document.getElementById('flightexam-path-editor-modal');
      const nameSpan=document.getElementById('nxEditorPartName');
      const canvas=document.getElementById('nxEditorCanvas');
      const status=document.getElementById('nxEditorStatus');
      const btnClose=document.getElementById('nxEditorClose');
      const btnSave=document.getElementById('nxEditorSave');
      const btnClear=document.getElementById('nxEditorClear');
      const btnReset=document.getElementById('nxEditorReset');
      if(!modal||!canvas) return;
      nameSpan.textContent=part.name;
      modal.style.display='flex';
      let img=new Image(); let imgReady=false; let points=[...part.pathPoints];
      function fitContain(sw,sh,dw,dh){ const sr=sw/sh, dr=dw/dh; if(sr>dr){ const w=dw, h=w/sr; return {w,h}; } else { const h=dh, w=h*sr; return {w,h}; } }
      function resize(){ const w=Math.min(1000, window.innerWidth*0.8); const h=Math.min(700, window.innerHeight*0.6); canvas.width=w; canvas.height=h; draw(); }
      function draw(){ const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,canvas.width,canvas.height); if(imgReady){ const box=fitContain(img.width,img.height,canvas.width,canvas.height); const ox=(canvas.width-box.w)/2, oy=(canvas.height-box.h)/2; ctx.drawImage(img,ox,oy,box.w,box.h); if(points.length){ ctx.lineWidth=3; ctx.strokeStyle='#3b82f6'; ctx.beginPath(); points.forEach((p,i)=>{ const x=ox+p.x*box.w; const y=oy+p.y*box.h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); points.forEach((p,i)=>{ const x=ox+p.x*box.w; const y=oy+p.y*box.h; ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.fillStyle=i===0? '#10b981': (i===points.length-1?'#ef4444':'#f59e0b'); ctx.fill(); }); } }
        status.textContent=points.length? 'נקודות: '+points.length : 'אין נקודות'; }
      function canvasClick(e){ if(!imgReady) return; const rect=canvas.getBoundingClientRect(); const cx=e.clientX-rect.left; const cy=e.clientY-rect.top; const box=fitContain(img.width,img.height,canvas.width,canvas.height); const ox=(canvas.width-box.w)/2, oy=(canvas.height-box.h)/2; if(cx<ox||cx>ox+box.w||cy<oy||cy>oy+box.h) return; const nx=(cx-ox)/box.w, ny=(cy-oy)/box.h; points.push({x:nx,y:ny}); status.textContent='נקודות: '+points.length; draw(); }
      function removeLast(){ if(points.length){ points.pop(); status.textContent=points.length? 'נקודות: '+points.length : 'אין נקודות'; draw(); } }
      function resetAll(){ if(points.length && confirm('לאפס את כל הנקודות?')){ points=[]; status.textContent='אין נקודות'; draw(); } }
      function savePoints(){ part.pathPoints=[...points]; saveNewExamParts().then(()=>{ if(window.flightExamSync && part.partNumber){ window.flightExamSync.updatePartPoints(part.partNumber, part.pathPoints); } if(renderNewExamPartsRef) renderNewExamPartsRef(); alert('✓ נשמרו '+points.length+' נקודות'); }); }
      img.onload=()=>{ imgReady=true; resize(); }; img.src=part.pathImg;
      window.addEventListener('resize', resize);
      canvas.addEventListener('click', canvasClick);
      document.addEventListener('keydown', keyHandler);
      btnClear.onclick=removeLast; btnReset.onclick=resetAll; btnSave.onclick=savePoints; btnClose.onclick=closeEditor;
      function keyHandler(ev){ if(ev.key==='Backspace'){ ev.preventDefault(); removeLast(); } }
      function closeEditor(){ modal.style.display='none'; canvas.removeEventListener('click', canvasClick); document.removeEventListener('keydown', keyHandler); window.removeEventListener('resize', resize); }
    }
  
    function verifyImage(dataUrl){
      // תיקון done.true -> done=true
      return new Promise(res=>{ if(!dataUrl){ return res(false); } const im=new Image(); let done=false; const t=setTimeout(()=>{ if(!done){ done=true; res(false); } },4000); im.onload=()=>{ if(!done){ done=true; clearTimeout(t); res(true); } }; im.onerror=()=>{ if(!done){ done=true; clearTimeout(t); res(false); } }; im.src=dataUrl + (dataUrl.startsWith('data:')? '' : (dataUrl.includes('?')? '&':'?')+'v=' + Date.now()); });
    }
  
    function setupSave(){
      const saveBtn=document.getElementById('saveSettings');
      const exportBtn=document.getElementById('exportSettings');
      const exportZipBtn=document.getElementById('exportSettingsZip');
      const importBtn=document.getElementById('importSettingsFile');
      if(saveBtn) saveBtn.onclick=async ()=>{
        console.log('[settings] validating images before save...');
        let northOk = true; if(north.mapImages && north.mapImages.length){ for(const m of north.mapImages){ const ok=await verifyImage(m); if(!ok){ northOk=false; break; } } }
        let newExamOk = true; for(const p of flightExam.parts){ if(p.pathImg){ const ok=await verifyImage(p.pathImg); if(!ok){ newExamOk=false; break; } } if(newExamOk && p.testImg){ const ok2=await verifyImage(p.testImg); if(!ok2){ newExamOk=false; break; } } if(newExamOk && p.pathImg && p.testImg && (p.pathW!==p.testW || p.pathH!==p.testH)){ alert('חלק "'+p.name+'" גדלי התמונות לא תואמים ולכן לא נשמר'); newExamOk=false; break; } }
        if(!northOk || !newExamOk){ alert('❌ שגיאה בולידציית תמונות'); return; }
        save(LS_KEY, settings);
        save(LS_NORTH,north);
        saveOrientationSets();
        saveNewExamParts();
        // Load orientation sets to test module
        if(window.loadOrientationSets) {
          window.loadOrientationSets(orientation.questionSets || []);
        }
        applyNavVisibility();
        buildTestSelectorUI();
        alert('✅ כל ההגדרות נשמרו בהצלחה!');
      };
      if(exportBtn) exportBtn.onclick=()=>{ exportAllSettings(); };
      if(exportZipBtn) exportZipBtn.onclick=()=>{ exportSettingsZip(); };
      if(importBtn) importBtn.onclick=()=>{
        const input=document.createElement('input');
        input.type='file';
        input.accept='application/json';
        input.onchange=()=>{
          const file=input.files && input.files[0];
            if(!file) return;
          const fr=new FileReader();
          fr.onload=()=>{
            try{
              const json=JSON.parse(fr.result);
              applyExternalConfig(json, true); // כפייה מלאה - דריסת הגדרות מקומיות
              alert('✓ קובץ הגדרות נטען והוחל (דורס הגדרות מקומיות)');
            }catch(e){ alert('❌ קובץ לא תקין'); }
          };
          fr.onerror=()=> alert('❌ שגיאה בקריאת הקובץ');
          fr.readAsText(file);
        };
        input.click();
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
        if(pass==='1234'){
          adminUnlocked=true;
          adminLock.style.display='none';
          adminSettingsBox.style.display='flex';
          buildAdminUI();
          rebuildTestsConfig();
          syncGeneralFields();
          syncAllTestFields(); // סנכרון כל המבחנים
          setupNorth();
          setupOrientation();
          setupNewExamParts();
          syncNewExamTiming();
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
      flightExam=load(LS_FLIGHTEXAM, load(LS_NEWEXAM_OLD, DEFAULT_FLIGHTEXAM));
      orientation=load(LS_ORIENTATION, DEFAULT_ORIENTATION);
      buildAdminUI();
      rebuildTestsConfig();
      applyNavVisibility();
      syncNewExamTiming();
      syncGeneralFields(); // ensure new field updates
      buildTestSelectorUI();
    };
    
    // Load orientation data on init
    if(window.loadOrientationSets && orientation.questionSets) {
      window.loadOrientationSets(orientation.questionSets);
    }

    // Export all settings as JSON (including images as dataURL or asset paths)
    function exportAllSettings(){
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        north,
        flightExam,
        orientation
      };
      try {
        const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'exam-settings-export.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        console.log('[export] settings JSON downloaded');
      } catch(e){ console.error('[export] failed', e); alert('❌ כשל ביצוא JSON'); }
    }
    // Export ZIP with images separated (tries to load JSZip dynamically)
    function exportSettingsZip(){
      function ensureJSZip(){ return new Promise((res,rej)=>{ if(window.JSZip) return res(window.JSZip); const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; s.onload=()=> window.JSZip? res(window.JSZip): rej('JSZip load fail'); s.onerror=()=>rej('script error'); document.head.appendChild(s); }); }
      ensureJSZip().then(JSZip=>{
        const zip = new JSZip();
        // Write JSON meta
        const meta = { version:1, exportedAt:new Date().toISOString() };
        zip.file('meta.json', JSON.stringify(meta,null,2));
        zip.file('settings.json', JSON.stringify(settings,null,2));
        zip.file('north.json', JSON.stringify(north,null,2));
        zip.file('orientation.json', JSON.stringify(orientation,null,2));
        // Flight exam parts & images
        const partsFolder = zip.folder('flightexam');
        partsFolder.file('parts.json', JSON.stringify(flightExam.parts,null,2));
        flightExam.parts.forEach((p,i)=>{
          if(p.pathImg && p.pathImg.startsWith('data:')){
            const b64 = p.pathImg.split(',')[1];
            partsFolder.file(`path_${i+1}.jpeg`, b64, {base64:true});
          }
          if(p.testImg && p.testImg.startsWith('data:')){
            const b64 = p.testImg.split(',')[1];
            partsFolder.file(`test_${i+1}.jpeg`, b64, {base64:true});
          }
        });
        // Orientation images
        const orientFolder = zip.folder('orientation');
        (orientation.questionSets||[]).forEach((set, si)=>{
          const setFolder = orientFolder.folder(`set_${si+1}`);
          setFolder.file('info.json', JSON.stringify({id:set.id,name:set.name},null,2));
          if(set.topImage && set.topImage.startsWith('data:')){
            setFolder.file('top.jpeg', set.topImage.split(',')[1], {base64:true});
          }
          (set.viewImages||[]).forEach((v,vi)=>{
            if(v.url && v.url.startsWith('data:')){
              setFolder.file(`view_${vi+1}_${v.orient}.jpeg`, v.url.split(',')[1], {base64:true});
            }
          });
        });
        // Generate & download
        zip.generateAsync({type:'blob'}).then(blob=>{
          const a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          a.download='exam-settings-export.zip';
          document.body.appendChild(a); a.click();
          setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
          console.log('[export] ZIP downloaded');
        }).catch(err=>{ console.error('[export] zip error', err); alert('❌ כשל ביצירת ZIP'); });
      }).catch(err=>{ console.error('[export] JSZip load failed', err); alert('❌ לא ניתן לטעון JSZip'); });
    }
    window.exportAllSettings = exportAllSettings;
    window.exportSettingsZip = exportSettingsZip;

    // === Supabase Orientation DB Preview ===
    function loadOrientationDbPreview(force){
      const holder = document.getElementById('orientationDbPreview');
      const status = document.getElementById('orientationDbStatus');
      if(!holder || !status) return;
      if(force){ holder.innerHTML=''; }
      status.textContent='טוען...';
      if(!window.supabaseClient){
        status.textContent='Supabase לא מאותחל';
        return;
      }
      window.supabaseClient
        .from('orientation_images')
        .select('id,test_number,view_type,code,storage_path')
        .order('test_number',{ascending:true})
        .then(async ({data,error})=>{
          if(error){ status.textContent='שגיאה: '+error.message; return; }
          if(!data || !data.length){ status.textContent='אין רשומות בטבלה'; holder.innerHTML=''; return; }
          // קיבוץ לפי test_number
          const groups = new Map();
          data.forEach(r=>{
            if(!groups.has(r.test_number)) groups.set(r.test_number,{ top:null, views:[], num:r.test_number });
            const g=groups.get(r.test_number);
            if(r.view_type==='top') g.top=r; else g.views.push(r);
          });
          const bucket = window.supabaseClient.storage.from('orientation');
          holder.innerHTML='';
          const frag = document.createDocumentFragment();
          groups.forEach(g=>{
            const card = document.createElement('div');
            card.className='orient-db-card';
            card.dataset.testNumber = g.num; // הוספת מזהה מבחן לכרטיס למחיקה עתידית
            card.style.cssText='border:2px solid var(--border-color);border-radius:12px;padding:10px;background:var(--bg-secondary);display:flex;flex-direction:column;gap:8px;position:relative;';
            const title = document.createElement('div');
            title.style.cssText='font-weight:600;font-size:0.85rem;display:flex;justify-content:space-between;align-items:center';
            title.innerHTML = `<span>מבחן ${g.num}</span><span style="font-size:0.7rem;color:var(--text-secondary)">${g.views.length} מבטים</span>`;
            card.appendChild(title);
            // Top image
            if(g.top){
              const topUrl = bucket.getPublicUrl(g.top.storage_path).data.publicUrl;
              const wrap = document.createElement('div');
              wrap.style.cssText='position:relative;height:110px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;';
              wrap.innerHTML = `<img draggable="false" data-full="${topUrl}" alt="top" src="${topUrl}" style="width:100%;height:100%;object-fit:cover;filter:brightness(0.92)">`+
                `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:#fff;font-size:0.65rem;padding:2px 4px;text-align:center">TOP</div>`;
              card.appendChild(wrap);
            }
            // Views grid
            const viewsGrid = document.createElement('div');
            viewsGrid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:6px;';
            g.views.forEach(v=>{
              const viewUrl = bucket.getPublicUrl(v.storage_path).data.publicUrl;
              const cell = document.createElement('div');
              cell.style.cssText='position:relative;height:60px;border:1px solid var(--border-color);border-radius:6px;overflow:hidden;cursor:zoom-in;background:#0f172a;';
              cell.innerHTML = `<img draggable="false" data-full="${viewUrl}" alt="${v.code}" src="${viewUrl}" style="width:100%;height:100%;object-fit:cover">`+
                `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:#fff;font-size:0.55rem;padding:1px;text-align:center">${v.code}</div>`;
              viewsGrid.appendChild(cell);
            });
            card.appendChild(viewsGrid);
            frag.appendChild(card);
          });
          holder.appendChild(frag);
          status.textContent='טעון: '+groups.size+' קבוצות';
          attachOrientationDbPreviewEvents();
        }).catch(e=>{ status.textContent='שגיאה: '+e.message; });
    }
    // חשיפת הפונקציה לגלובל לשימוש orientation-sync
    window.loadOrientationDbPreview = loadOrientationDbPreview;

    function attachOrientationDbPreviewEvents(){
      const holder = document.getElementById('orientationDbPreview');
      if(!holder) return;
      holder.querySelectorAll('img[data-full]').forEach(img=>{
        img.ondblclick = ()=> openPreviewModal(img.getAttribute('data-full'), img.getAttribute('alt'));
      });
      const reloadBtn = document.getElementById('btnReloadOrientationDb');
      if(reloadBtn){ reloadBtn.onclick=()=> loadOrientationDbPreview(true); }
      // הזרקת סטייל פעם אחת
      if(!document.getElementById('orientationDbPreviewStyles')){
        const st=document.createElement('style');
        st.id='orientationDbPreviewStyles';
        st.textContent=`.orient-db-card:hover{box-shadow:0 0 0 2px var(--accent-primary) inset;}`;
        document.head.appendChild(st);
      }
    }

    function openPreviewModal(url, label){
      const modal = document.createElement('div');
      modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10000;display:flex;align-items:center;justify-content:center;padding:30px;';
      modal.innerHTML = `<div style="max-width:90%;max-height:90%;position:relative;display:flex;flex-direction:column;">\n        <img src="${url}" alt="${label}" style="max-width:100%;max-height:80vh;object-fit:contain;border:4px solid #1e293b;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.6)">\n        <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;color:#fff">\n          <span>${label||''}</span>\n          <button id="closeOrientPreview" style="padding:6px 14px;background:#ef4444;border:none;border-radius:8px;color:#fff;cursor:pointer">סגור ✕</button>\n        </div>\n      </div>`;
      document.body.appendChild(modal);
      function close(){ modal.remove(); }
      modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
      document.getElementById('closeOrientPreview').onclick=close;
      document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown', esc);} });
    }

    // עדכון: טעינת תצוגת התמונות כאשר טאב התמצאות נבחר
    document.addEventListener('click', e=>{
      const btn = e.target.closest('.admin-tab-btn[data-admin-tab="orientation"]');
      if(btn){ setTimeout(()=> loadOrientationDbPreview(false), 50); }
    });

    // אם כבר אותחל הממשק ו-Supabase קיים נטען מיד (למקרה שהטאב פעיל כברירת מחדל)
    if(window.supabaseClient){ setTimeout(()=>{ const orientTab=document.querySelector('.admin-tab-btn[data-admin-tab="orientation"]'); if(orientTab && orientTab.classList.contains('active')) loadOrientationDbPreview(false); },400); }

    // Promise גלובלי המאפשר למודולים להמתין לסיום טעינת קובץ ברירת המחדל
    window.settingsReady = new Promise(res=>{ window._settingsReadyResolve = res; });

    function buildTestSelectorUI(){
      const sel = document.getElementById('test-selector');
      if(!sel) return;
      sel.innerHTML='';
      // בנייה מחדש לפי הסדר והכללת המבחנים
      settings.tests.filter(t=>t.include).forEach((t,i)=>{
        const btn=document.createElement('button');
        btn.className='nav-btn';
        btn.dataset.test=t.id;
        btn.textContent=t.name;
        // נעילת מבחנים אחרי הראשון למשתמש רגיל (אם testAuth לא admin)
        if(i>0 && window.testAuth && !window.testAuth.isAdmin()) btn.disabled=true;
        sel.appendChild(btn);
      });
      // הפעלה מחדש של הניווט אם פונקציה קיימת
      if(window.initDynamicNav) window.initDynamicNav();
      window.dispatchEvent(new CustomEvent('settings-updated'));
    }
    buildTestSelectorUI();
  })();
