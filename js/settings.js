// Settings & Admin Panel Module
(function(){
    const LS_KEY='app.settings.v1';
    const LS_NORTH='app.northfind';
    const LS_FLIGHTEXAM='app.flightexam.parts'; // שם חדש למבחן הטסה
    const LS_NEWEXAM_OLD='app.newexam.parts'; // תאימות לאחור
    const LS_ORIENTATION='app.orientation'; // הוספת localStorage למבחן התמצאות
    const DEFAULT_SETTINGS_JSON_PATH='assets/config/exam-settings-export.json';
    const DEFAULT_SETTINGS={
      candidateId:'',
      scaleMin:1,
      scaleMax:7,
      reactionShapeDisplaySec:1, // משך הופעת כל צורה במבחן תגובה (שניות)
      tests:[
        {id:'eyehand', name:'תיאום עין-יד', include:true, seconds:30, difficulty:'בינוני'},
        {id:'reaction', name:'זמן תגובה', include:true, seconds:40, difficulty:'בינוני'},
        {id:'memory', name:'זיכרון צבעים', include:true, seconds:60, difficulty:'בינוני'},
        {id:'tracking', name:'מעקב וקשב', include:true, seconds:30, difficulty:'בינוני'},
        {id:'northfind', name:'מציאת הצפון', include:true, seconds:45, difficulty:'בינוני'},
        {id:'flightcontrol', name:'בקרת טיסה', include:true, seconds:60, difficulty:'בינוני'},
        {id:'targetid', name:'ירי במטרות', include:true, seconds:60, difficulty:'בינוני'},
        {id:'flightexam', name:'מבחן הטסה', include:true, seconds:20, difficulty:'בינוני'},
        {id:'orientation', name:'התמצאות וכיוונים', include:true, seconds:360, difficulty:'בינוני'} // מבחן חדש
      ]
    };
    if(!DEFAULT_SETTINGS.newExamTiming){ DEFAULT_SETTINGS.newExamTiming={ pathDisplaySec:15, preFlightDelaySec:10, flightDurationSec:60 }; }
    const DEFAULT_NORTH={ trials:5, showNorthSec:3, spinSec:6, answerSec:10, mapImages:[], mapEntries:[] };
    const DEFAULT_FLIGHTEXAM={ parts:[] }; // שם חדש
    const DEFAULT_ORIENTATION={
      maxQuestions:10,
      timeLimitMin:6,
      showCompass:true,
      questionSets:[]
    };

    function sanitizeOrientationConfig(raw){
      const base={
        maxQuestions:DEFAULT_ORIENTATION.maxQuestions,
        timeLimitMin:DEFAULT_ORIENTATION.timeLimitMin,
        showCompass:DEFAULT_ORIENTATION.showCompass,
        questionSets:[]
      };
      const incoming = raw && typeof raw==='object'? raw : {};
      const result = Object.assign({}, base, incoming);
      if(!Array.isArray(result.questionSets)){ result.questionSets=[]; }
      return result;
    }

    function overwriteOrMerge(target, source){
      if(!target || !source || typeof source!=='object') return target;
      const isPlain = obj => Object.prototype.toString.call(obj)==='[object Object]';
      Object.keys(source).forEach(key=>{
        const value=source[key];
        if(Array.isArray(value)){
          target[key]=value.map(item=> isPlain(item)||Array.isArray(item)? JSON.parse(JSON.stringify(item)) : item);
        } else if(isPlain(value)){
          if(!isPlain(target[key])) target[key]={};
          overwriteOrMerge(target[key], value);
        } else {
          target[key]=value;
        }
      });
      return target;
    }

    function applyExternalConfig(exported, doForce){
      if(!exported) return;
      const isBundle = exported && typeof exported==='object' && (
        exported.settings || exported.north || exported.flightExam || exported.orientation || exported.newExam
      );
      const incomingSettings = isBundle? exported.settings : exported;
      const incomingNorth = isBundle? exported.north : null;
      const incomingFlight = isBundle? (exported.flightExam || exported.newExam) : null;
      const incomingOrientation = isBundle? exported.orientation : null;

      if(incomingSettings){
        settings = doForce? deepClone(incomingSettings) : overwriteOrMerge(settings, incomingSettings);
      }
      if(incomingNorth){
        north = doForce? deepClone(incomingNorth) : overwriteOrMerge(north, incomingNorth);
      }
      if(incomingFlight){
        flightExam = doForce? deepClone(incomingFlight) : overwriteOrMerge(flightExam, incomingFlight);
      }
      if(incomingOrientation){
        orientation = doForce? sanitizeOrientationConfig(deepClone(incomingOrientation)) : sanitizeOrientationConfig(overwriteOrMerge(orientation, incomingOrientation));
        save(LS_ORIENTATION, orientation);
      }
      if(!incomingNorth && exported && exported.north){
        north = doForce? deepClone(exported.north) : overwriteOrMerge(north, exported.north);
      }

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
      applyNavVisibility();
      if(typeof window.refreshSettingsUI==='function'){ window.refreshSettingsUI(); }
      buildTestSelectorUI();
      if(window._settingsReadyResolve){ window._settingsReadyResolve(); }
    }

    window.adminApplyExternalConfig = function(force=false){
      fetch(DEFAULT_SETTINGS_JSON_PATH, {cache:'no-store'}).then(r=>r.json()).then(json=>{
        applyExternalConfig(json, true);
        alert('✓ קובץ הקונפיג נטען (דריסה מלאה של הגדרות מקומיות)');
      }).catch(e=>{ console.error(e); alert('❌ לא נמצא קובץ קונפיג'); });
    };

    async function autoLoadDefaultFlightExamParts(){
      console.log('[flightexam] auto-load from assets disabled - using Supabase only');
      return;
    }

    (function fetchExternalDefaults(){
      fetch(DEFAULT_SETTINGS_JSON_PATH, {cache:'no-store'}).then(r=>{
        if(!r.ok) throw new Error('not found'); return r.json();
      }).then(json=>{
        window.EMBEDDED_DEFAULT_EXPORT = window.EMBEDDED_DEFAULT_EXPORT || json;
        const hasLocalSettings = !!localStorage.getItem(LS_KEY);
        const hasLocalOrient = !!localStorage.getItem(LS_ORIENTATION);
        const hasLocalFlight = !!localStorage.getItem(LS_FLIGHTEXAM);
        const hasLocalNorth = !!localStorage.getItem(LS_NORTH);

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
    function deepClone(value){ try{ return JSON.parse(JSON.stringify(value)); }catch(e){ return value; } }
    // דחיסת dataURL גדולה (הקטנת ממדים + המרת JPEG)
    async function compressDataUrl(dataUrl, maxW=1280, maxH=1280, quality=0.82){ return new Promise(res=>{ try{ const img=new Image(); img.onload=()=>{ let {width:w,height:h}=img; const scale=Math.min(1, maxW/w, maxH/h); if(scale<1){ w=Math.round(w*scale); h=Math.round(h*scale); } const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); g.drawImage(img,0,0,w,h); let out=c.toDataURL('image/jpeg', quality); // אם עדיין גדול מאוד נסה איכות נמוכה יותר
            if(out.length>dataUrl.length && quality>0.5){ out=c.toDataURL('image/jpeg', 0.7); }
            res(out); }; img.onerror=()=>{ res(dataUrl); }; img.src=dataUrl; }catch(e){ res(dataUrl); } }); }
    async function saveNewExamParts(){ // דחיסת תמונות גדולות לפני שמירה
      let changed=false; for(const p of flightExam.parts){ if(p.pathImg && p.pathImg.length>650000){ console.log('[flightexam] compress path', p.name, 'len', p.pathImg.length); p.pathImg= await compressDataUrl(p.pathImg); changed=true; } if(p.testImg && p.testImg.length>650000){ console.log('[flightexam] compress test', p.name, 'len', p.testImg.length); p.testImg= await compressDataUrl(p.testImg); changed=true; } }
      try{ localStorage.setItem(LS_FLIGHTEXAM, JSON.stringify(flightExam)); }catch(err){ if(err.name==='QuotaExceededError'){ console.warn('[flightexam] quota still exceeded after compression, removing largest images'); // הסר תמונות גדולות עד שנכנס
          const sorted=[]; flightExam.parts.forEach(p=>{ if(p.pathImg) sorted.push({p, key:'pathImg', size:p.pathImg.length}); if(p.testImg) sorted.push({p, key:'testImg', size:p.testImg.length}); }); sorted.sort((a,b)=>b.size-a.size); while(sorted.length){ const rem=sorted.shift(); console.warn('[flightexam] removing image', rem.p.name, rem.key, 'size', rem.size); rem.p[rem.key]=''; rem.p[rem.key==='pathImg'?'pathW':'testW']=0; rem.p[rem.key==='pathImg'?'pathH':'testH']=0; try{ localStorage.setItem(LS_FLIGHTEXAM, JSON.stringify(flightExam)); console.log('[flightexam] saved after removals'); alert('חלק מהתמונות הוסרו עקב חוסר מקום.'); break; }catch(e2){ continue; } } } else { console.error('[flightexam] save error', err); } }
      if(changed) console.log('[flightexam] compression pass complete'); }
    
    function saveOrientationConfig(){
      save(LS_ORIENTATION, orientation);
    }
  
    // Helper: המרת File ל-dataURL (מבטיח Promise)
    function fileToDataUrl(file){
      return new Promise((resolve,reject)=>{ if(!file){ return reject('no file'); } const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=()=>reject(fr.error||'read error'); try{ fr.readAsDataURL(file); }catch(e){ reject(e); } });
    }
  
    let settings=load(LS_KEY, DEFAULT_SETTINGS);
    if(!settings.newExamTiming){ settings.newExamTiming={ pathDisplaySec:15, preFlightDelaySec:10, flightDurationSec:60 }; }
    let north=load(LS_NORTH, DEFAULT_NORTH);
    let flightExam=load(LS_FLIGHTEXAM, load(LS_NEWEXAM_OLD, DEFAULT_FLIGHTEXAM));
    const orientationRaw=load(LS_ORIENTATION, DEFAULT_ORIENTATION);
    let orientation=sanitizeOrientationConfig(orientationRaw);
    if(orientationRaw && orientationRaw.questionSets){
      save(LS_ORIENTATION, orientation);
    }
    
    window.appSettings = settings;
    window.getTestConfig = id => settings.tests.find(t=>t.id===id) || null;
    window.getGlobalScale = ()=> ({min:settings.scaleMin, max:settings.scaleMax});
    window.getNorthConfig = ()=> load(LS_NORTH, DEFAULT_NORTH);
    window.getFlightExamParts = ()=> load(LS_FLIGHTEXAM, load(LS_NEWEXAM_OLD, DEFAULT_FLIGHTEXAM)).parts;
    window.getNewExamParts = window.getFlightExamParts; // Alias תאימות
    window.getOrientationConfig = ()=> sanitizeOrientationConfig(load(LS_ORIENTATION, DEFAULT_ORIENTATION));

    function buildSettingsBundle(){
      return {
        settings: deepClone(settings),
        north: deepClone(north),
        flightExam: deepClone(flightExam),
        orientation: deepClone(orientation)
      };
    }

    async function syncSettingsToSupabase(statusEl){
      if(!window.examData || typeof window.examData.saveSettingsBundle!=='function') return;
      const ready = (typeof window.examData.isReady==='function')? window.examData.isReady(): true;
      if(!ready){
        if(statusEl){ statusEl.textContent='נשמר מקומית (ללא חיבור)'; statusEl.style.color='#fbbf24'; }
        return;
      }
      if(statusEl){ statusEl.textContent='מעלה ל-Supabase...'; statusEl.style.color='#94a3b8'; }
      try{
        const metaUser = window.testAuth && typeof window.testAuth.getCurrentUser==='function' ? window.testAuth.getCurrentUser() : 'admin-panel';
        await window.examData.saveSettingsBundle(buildSettingsBundle(), { createdBy: metaUser });
        if(statusEl){ statusEl.textContent='✓ נשמר ב-Supabase '+new Date().toLocaleTimeString(); statusEl.style.color='#10b981'; }
      } catch(err){
        console.warn('[settings] syncSettingsToSupabase failed', err);
        if(statusEl){ statusEl.textContent='❌ שמירה מרוחקת נכשלה'; statusEl.style.color='#ef4444'; }
      }
    }

    async function hydrateSettingsFromSupabase(){
      if(!window.examData || typeof window.examData.fetchActiveSettings!=='function') return;
      if(typeof window.examData.isReady==='function' && !window.examData.isReady()) return;
      try{
        const remote = await window.examData.fetchActiveSettings();
        if(remote && remote.payload){
          applyExternalConfig(remote.payload, true);
          const statusEl = document.getElementById('saveStatus');
          if(statusEl){
            const ts = remote.created_at ? new Date(remote.created_at).toLocaleString('he-IL') : '';
            statusEl.textContent = ts ? 'נטען מ-Supabase ('+ts+')' : 'נטען מ-Supabase';
            statusEl.style.color = '#0ea5e9';
          }
          console.log('[settings] remote settings applied from Supabase record', remote.id);
        }
      } catch(err){
        console.warn('[settings] hydrateSettingsFromSupabase failed', err);
      }
    }

    function scheduleHydrateFromSupabase(retries){
      if(!window.examData){
        if(retries>0){ setTimeout(()=>scheduleHydrateFromSupabase(retries-1), 1500); }
        return;
      }
      const readyFn = (typeof window.examData.isReady==='function')? window.examData.isReady: ()=>true;
      if(readyFn()){ hydrateSettingsFromSupabase(); return; }
      if(retries>0){ setTimeout(()=>scheduleHydrateFromSupabase(retries-1), 1500); }
    }
  
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
            <div class="admin-save-bar" role="region" aria-label="ניהול ושמירה">
              <div class="save-bar-title">💾 ניהול ושמירה</div>
              <button id="saveSettings" class="save-settings-btn save-bar-btn" type="button">שמור את כל ההגדרות</button>
              <button id="exportSettings" class="save-settings-btn save-bar-btn" type="button">⬇ הורד הגדרות (JSON)</button>
              <button id="exportSettingsZip" class="save-settings-btn save-bar-btn" type="button">🗜 הורד ZIP</button>
              <button id="importSettingsFile" class="save-settings-btn save-bar-btn" type="button">📂 טען קובץ הגדרות</button>
              <span id="saveStatus" class="save-status" aria-live="polite"></span>
            </div>
            <div class="admin-layout-grid">
              <aside class="admin-tabs-bar" role="tablist">
                <button class="admin-tab-btn" data-admin-tab="general">כללי</button>
                <button class="admin-tab-btn" data-admin-tab="users">ניהול משתמשים</button>
                <button class="admin-tab-btn" data-admin-tab="eyehand">תיאום עין-יד</button>
                <button class="admin-tab-btn" data-admin-tab="reaction">זמן תגובה</button>
                <button class="admin-tab-btn" data-admin-tab="memory">זיכרון צבעים</button>
                <button class="admin-tab-btn" data-admin-tab="tracking">מעקב וקשב</button>
                <button class="admin-tab-btn" data-admin-tab="northfind">מציאת הצפון</button>
                <button class="admin-tab-btn" data-admin-tab="flightcontrol">בקרת טיסה</button>
                <button class="admin-tab-btn" data-admin-tab="targetid">ירי במטרות</button>
                <button class="admin-tab-btn" data-admin-tab="orientation">התמצאות</button>
                <button class="admin-tab-btn" data-admin-tab="flightexam">מבחן הטסה</button>
              </aside>
              <div class="admin-content-panel">
          <!-- General Settings -->
          <div class="settings-section section-general" data-tab-section="general">
            <h3>הגדרות כלליות</h3>
            <div class="form-grid">
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

          <!-- User Management Tab -->
          <div class="settings-section section-users" data-tab-section="users" style="display:none">
            <h3>ניהול מועמדים</h3>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:18px">עבודה מול טבלת <code>exam_users</code> ב-Supabase – ניתן לחפש לפי תעודת זהות או שם, לעדכן פרטי מועמד ולסמן השלמת כלל המבחנים.</p>
            <div class="user-mgmt" style="display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px;align-items:flex-start;flex-wrap:wrap;">
              <div class="user-mgmt-list" style="border:2px solid var(--border-color);border-radius:14px;padding:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm);min-width:0;">
                <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;align-items:center;">
                  <input id="userSearchInput" type="search" placeholder="חיפוש לפי תעודת זהות או שם" style="flex:1;padding:10px 12px;border:2px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);min-width:220px;">
                  <select id="userCompletionFilter" style="padding:10px;border:2px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);min-width:150px;">
                    <option value="all">כל המשתמשים</option>
                    <option value="pending">בתהליך</option>
                    <option value="done">סיימו הכל</option>
                  </select>
                  <button id="userRefreshBtn" class="btn btn-secondary" style="padding:10px 18px;font-size:0.85rem;border-radius:10px;">↻ רענן</button>
                </div>
                <div class="user-list-wrapper" style="overflow:auto;max-height:420px;border:2px dashed var(--border-color);border-radius:12px;">
                  <table style="width:100%;border-collapse:collapse;font-size:0.85rem;min-width:520px;">
                    <thead style="background:var(--bg-tertiary);position:sticky;top:0;z-index:2;">
                      <tr>
                        <th style="text-align:right;padding:10px 12px;font-weight:600;color:var(--text-secondary);">שם המועמד</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">תעודת זהות</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">קוד כניסה</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">סטטוס מבחנים</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">עודכן</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">פעולות</th>
                      </tr>
                    </thead>
                    <tbody id="userListBody"></tbody>
                  </table>
                  <div id="userListLoading" style="padding:16px;text-align:center;font-size:0.85rem;color:var(--text-secondary);display:none;">טוען נתונים...</div>
                  <div id="userListEmptyState" style="padding:20px;text-align:center;font-size:0.85rem;color:var(--text-secondary);display:none;">אין משתמשים להצגה</div>
                  <div id="userListError" style="padding:16px;text-align:center;font-size:0.85rem;color:#fb7185;display:none;"></div>
                </div>
              </div>
              <div class="user-mgmt-form" style="border:2px solid var(--border-color);border-radius:14px;padding:18px;background:var(--bg-secondary);box-shadow:var(--shadow-sm);min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                  <h4 id="userFormTitle" style="margin:0;font-size:1rem;">הוסף מועמד חדש</h4>
                  <span id="userFormMode" class="pill-small" style="background:var(--bg-tertiary);color:var(--text-secondary);">מצב יצירה</span>
                </div>
                <div class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
                  <div class="form-group" style="margin:0;">
                    <label for="userFirstName">שם פרטי</label>
                    <input id="userFirstName" type="text" placeholder="לדוגמה: דנה" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;">
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label for="userLastName">שם משפחה</label>
                    <input id="userLastName" type="text" placeholder="לדוגמה: כהן" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;">
                  </div>
                </div>
                <div class="form-group">
                  <label for="userNationalId">תעודת זהות (חובה)</label>
                  <input id="userNationalId" type="text" placeholder="לדוגמה: 123456789" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;">
                  <span class="form-hint" style="font-size:0.75rem;color:var(--text-secondary);">זהו המפתח בעזרתו מאתרים את המועמד</span>
                </div>
                <div class="form-group">
                  <label for="userNotes">הערות פנימיות</label>
                  <textarea id="userNotes" rows="3" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;resize:vertical;" placeholder="פרטים נוספים, סטטוס מבחנים וכו'."></textarea>
                </div>
                <div class="form-group" style="margin-bottom:10px;">
                  <label for="userEntryPin">קוד כניסה (4 ספרות)</label>
                  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <input id="userEntryPin" type="text" readonly style="flex:1;min-width:120px;padding:12px;border:2px solid var(--border-color);border-radius:10px;background:var(--bg-primary);font-weight:600;text-align:center;letter-spacing:0.2em;">
                    <button id="userPinRegenBtn" type="button" class="btn btn-secondary" style="padding:10px 16px;border-radius:10px;">הפק קוד חדש</button>
                  </div>
                  <span class="form-hint" style="font-size:0.75rem;color:var(--text-secondary);">שמור את הקוד והזכר לנבחן להזין אותו יחד עם תעודת הזהות בכניסה</span>
                </div>
                <label style="display:flex;align-items:center;gap:10px;margin:6px 0 4px;font-weight:600;color:var(--text-primary);">
                  <input type="checkbox" id="userAllDone" style="width:auto;">
                  כל המבחנים הושלמו בהצלחה
                </label>
                <div id="userTestsMeta" style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">לא בוצעו ניסיונות עדיין</div>
                <div id="userFormStatus" style="font-size:0.8rem;color:var(--text-secondary);min-height:18px;margin-top:6px;"></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
                  <button id="userSaveBtn" type="button" class="btn" style="background:#10b981;color:#fff;padding:10px 18px;border-radius:10px;">💾 שמור מועמד</button>
                  <button id="userResetBtn" type="button" class="btn btn-secondary" style="padding:10px 18px;border-radius:10px;">איפוס טופס</button>
                  <button id="userDeleteBtn" type="button" class="btn" style="background:#ef4444;color:#fff;padding:10px 18px;border-radius:10px;display:none;">🗑️ מחק מועמד</button>
                </div>
              </div>
            </div>
          </div>
  
          <!-- Eye-Hand Test Settings -->
          <div class="settings-section section-eyehand" data-tab-section="eyehand" style="display:none">
            <h3>מבחן תיאום עין-יד</h3>
            <div class="form-grid">
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
                <input id="cfgReactionShapeSec" type="number" min="0.2" max="10" step="0.1" value="1">
                <span class="form-hint">כל צורה מוחלפת ברגע שנגמר הזמן</span>
              </div>
            </div>
          </div>
  
          <!-- Memory Test Settings -->
          <div class="settings-section section-memory" data-tab-section="memory" style="display:none">
            <h3>מבחן זיכרון צבעים</h3>
            <div class="form-grid">
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
            <div class="north-upload-card">
              <div class="north-upload-actions">
                <button id="northImagesUploadBtn" type="button" class="btn btn-secondary" style="padding:10px 18px;border-radius:10px;">⬆ העלה מפות</button>
                <button id="northImagesClearBtn" type="button" class="btn" style="padding:10px 18px;border-radius:10px;background:#ef4444;color:#fff;">🗑️ מחק את כל המפות</button>
                <input id="northImagesInput" type="file" accept="image/*" multiple style="display:none">
                <span id="northUploadStatus" class="north-upload-status">אין מפות מותאמות כרגע</span>
              </div>
              <p class="north-upload-hint">ניתן להעלות מספר תמונות מפה (JPEG/PNG). התמונות נשמרות מקומית ומסונכרנות עם Supabase בעת שמירת הגדרות.</p>
              <div id="northfindImagesPreview" class="north-images-grid"></div>
            </div>
            <div class="north-actions">
              <button id="btnNorthSave" class="save-settings-btn">שמור הגדרות צפון</button>
            </div>
            <span id="northStatus" class="route-status" style="margin-top:10px">טרם הועלו מפות</span>
          </div>
  
          <!-- Orientation Test Settings -->
          <div class="settings-section section-orientation" data-tab-section="orientation" style="display:none">
            <h3>מבחן התמצאות וכיוונים</h3>
            <div class="form-grid">
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
                <label for="orientShowCompass">
                  <input type="checkbox" id="orientShowCompass" style="width:auto;margin-left:8px" checked>
                  הצג שושנת רוחות
                </label>
                <span class="form-hint">הצגת מצפן על תמונת המבט על</span>
              </div>
            </div>
  
            <h4 style="margin-top:30px;margin-bottom:16px">ניהול תמונות דרך Supabase</h4>
            <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:18px">
              המערכת טוענת את כל השאלות ישירות מבסיס הנתונים. ניתן להעלות כאן קבוצה חדשה שתשמר מיד ב-Supabase.
            </p>

            <button id="btnOpenOrientationUpload" class="btn" style="background:#2563eb;color:#fff;padding:10px 22px;border-radius:10px;font-weight:600;box-shadow:0 6px 18px rgba(37,99,235,0.25);">
              ⬆ פתח חלון העלאה חדש
            </button>
            <span id="orientationUploadStatus" style="display:block;margin-top:12px;font-size:0.82rem;color:var(--text-secondary);">
              הקבוצות מנוהלות דרך Supabase. ניתן להעלות קבוצה חדשה באמצעות החלון היעודי.
            </span>
            <div style="margin-top:16px;background:rgba(37,99,235,0.08);border:1px dashed rgba(37,99,235,0.35);border-radius:12px;padding:14px;color:var(--text-secondary);font-size:0.8rem;">
              💡 לאחר ההעלאה, הקבוצה תופיע בטבלה למטה. מומלץ להכין מראש קובץ TOP וכמה תמונות כיוון בפורמט JPG/PNG.
            </div>

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

            <h4 style="margin-top:40px;margin-bottom:14px;color:var(--accent-primary)">ניהול חלקי מבחן ב-Supabase</h4>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px">
              טעינה אוטומטית של כל החלקים מהטבלה flight_exam_parts. כל חלק כולל תמונת מסלול, תמונת מבחן ונקודות מסלול.
            </p>
            
            <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center;background:var(--bg-tertiary);padding:14px;border-radius:12px;border:2px solid var(--border-color);">
              <button id="btnAddNewFlightPartToDb" class="btn" style="background:#10b981;color:#fff;padding:10px 20px;font-size:0.9rem;border:none;border-radius:10px;cursor:pointer;font-weight:600;box-shadow:0 4px 12px rgba(16,185,129,0.3);transition:all 0.2s;">
                ➕ הוסף חלק חדש לבסיס
              </button>
              <button id="btnReloadFlightExamDb" class="btn btn-secondary" style="padding:10px 18px;font-size:0.85rem;border-radius:10px;">
                ↻ רענן רשימה
              </button>
              <span id="flightExamDbStatus" style="font-size:0.8rem;color:var(--text-secondary);margin-right:auto;">ממתין לטעינה...</span>
            </div>
            
            <div id="flightExamDbPreview" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;min-height:100px;"></div>
          </div>
        </div>
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
        const secondsEl = document.getElementById(t.id+'Seconds');
        const difficultyEl = document.getElementById(t.id+'Difficulty');
        
        if(secondsEl) { secondsEl.value = t.seconds; secondsEl.oninput=()=>{ t.seconds=Math.max(5,Math.min(600,+secondsEl.value||30)); secondsEl.value=t.seconds; }; }
        if(difficultyEl) { difficultyEl.value = t.difficulty; difficultyEl.onchange=()=>{ t.difficulty=difficultyEl.value; }; }
      });
    }
  
    function syncGeneralFields(){
      const scaleMinEl=document.getElementById('cfgScaleMin');
      const scaleMaxEl=document.getElementById('cfgScaleMax');
      const reactionShapeSecEl=document.getElementById('cfgReactionShapeSec');
      if(scaleMinEl) scaleMinEl.value=settings.scaleMin;
      if(scaleMaxEl) scaleMaxEl.value=settings.scaleMax;
      if(reactionShapeSecEl) reactionShapeSecEl.value=settings.reactionShapeDisplaySec;
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
  
    // North settings - uploadable maps
    function setupNorth(){
      const northTrialsEl=document.getElementById('northTrials');
      const northShowNorthEl=document.getElementById('northShowNorth');
      const northSpinEl=document.getElementById('northSpin');
      const northAnswerEl=document.getElementById('northAnswer');
      const northStatus=document.getElementById('northStatus');
      const northUploadBtn=document.getElementById('northImagesUploadBtn');
      const northUploadInput=document.getElementById('northImagesInput');
      const northUploadStatus=document.getElementById('northUploadStatus');
      const northClearBtn=document.getElementById('northImagesClearBtn');
      let mapEntries=[];
      const SUPABASE_RETRY_MS=1400;
      
      function syncNorth(){
        if(northTrialsEl) northTrialsEl.value=north.trials;
        if(northShowNorthEl) northShowNorthEl.value=north.showNorthSec;
        if(northSpinEl) northSpinEl.value=north.spinSec;
        if(northAnswerEl) northAnswerEl.value=north.answerSec;
        updateNorthStatus();
      }

      function normalizeEntry(entry, idx){
        if(!entry) return null;
        if(typeof entry==='string'){
          return {
            id:null,
            storagePath:null,
            publicUrl:entry,
            width:null,
            height:null,
            label:`מפה ${idx+1}`,
            createdAt:null,
            createdBy:null
          };
        }
        const obj=Object.assign({}, entry);
        obj.id = obj.id || null;
        obj.storagePath = obj.storagePath || obj.storage_path || null;
        obj.publicUrl = obj.publicUrl || obj.url || obj.src || obj.link || obj.storagePath || '';
        obj.label = obj.label || obj.name || obj.originalName || `מפה ${idx+1}`;
        obj.width = obj.width || obj.width_px || null;
        obj.height = obj.height || obj.height_px || null;
        obj.createdAt = obj.createdAt || obj.created_at || null;
        obj.createdBy = obj.createdBy || obj.created_by || null;
        return obj;
      }

      function loadStoredEntries(){
        if(Array.isArray(north.mapEntries) && north.mapEntries.length){
          mapEntries = north.mapEntries.map(normalizeEntry).filter(Boolean);
        } else if(Array.isArray(north.mapImages) && north.mapImages.length){
          mapEntries = north.mapImages.map((src,idx)=> normalizeEntry(src, idx)).filter(Boolean);
        } else {
          mapEntries = [];
        }
        persistEntries(false);
      }

      function persistEntries(saveNow=true){
        const cleaned = mapEntries.map(entry=>({
          id: entry.id || null,
          storagePath: entry.storagePath || null,
          publicUrl: entry.publicUrl || '',
          width: entry.width || null,
          height: entry.height || null,
          label: entry.label || '',
          createdAt: entry.createdAt || null,
          createdBy: entry.createdBy || null
        }));
        north.mapEntries = cleaned;
        north.mapImages = cleaned.map(entry=> entry.publicUrl).filter(Boolean);
        if(saveNow){ save(LS_NORTH,north); }
      }

      function supabaseReady(){
        return window.examData && typeof window.examData.isReady==='function' && window.examData.isReady();
      }

      function updateNorthStatus(){
        if(!northStatus) return;
        const count = mapEntries.length;
        if(count){
          const remoteCount = mapEntries.filter(entry=> !!entry.id).length;
          const label = remoteCount===count? 'נשמרו ב-Supabase' : remoteCount>0? `(${remoteCount} נשמרו בשרת)` : '(מקומיות בלבד)';
          northStatus.textContent=`✓ ${count} מפות זמינות ${label}`;
          northStatus.classList.add('ready');
          northStatus.classList.remove('empty');
        } else {
          northStatus.textContent='⚠ אין מפות מותאמות – יופקו מפות רנדומליות במבחן';
          northStatus.classList.add('empty');
        }
      }
      
      function updateUploadStatus(text,tone='muted'){
        if(!northUploadStatus) return;
        northUploadStatus.textContent=text;
        const palette={success:'#10b981',error:'#ef4444',pending:'#fbbf24',muted:'var(--text-secondary)'};
        northUploadStatus.style.color=palette[tone] || palette.muted;
      }
      
      function buildNorthfindPreview(){
        const holder = document.getElementById('northfindImagesPreview');
        if(!holder) return;
        if(!mapEntries.length){
          holder.innerHTML = `<div class="north-preview-empty">לא הועלו מפות – המערכת תייצר מפות רנדומליות.</div>`;
          updateUploadStatus('אין מפות מותאמות כרגע','muted');
          return;
        }
        holder.innerHTML = mapEntries.map((entry, idx)=>{
          const sizeLabel = entry.width && entry.height? `${entry.width}×${entry.height}px` : '';
          const badge = entry.id? '<span class="north-thumb-badge">Supabase</span>' : '<span class="north-thumb-badge north-thumb-badge--local">Local</span>';
          const safeSrc = entry.publicUrl || '';
          return `
            <div class="north-thumb" data-idx="${idx}" tabindex="0">
              <img src="${safeSrc}" alt="מפת מציאת צפון ${idx+1}">
              <button type="button" class="north-thumb-remove" data-idx="${idx}" title="מחק מפה">✕</button>
              <div class="north-thumb-footer">
                <div class="north-thumb-footer-main">${entry.label || ('מפה '+(idx+1))}</div>
                <div class="north-thumb-footer-meta">
                  ${sizeLabel? `<span>${sizeLabel}</span>`:''}
                  ${badge}
                </div>
              </div>
            </div>
          `;
        }).join('');
        holder.querySelectorAll('.north-thumb-remove').forEach(btn=>{
          btn.onclick=()=>{
            const i=Number(btn.dataset.idx);
            if(Number.isNaN(i)) return;
            deleteEntry(i);
          };
        });
        holder.querySelectorAll('.north-thumb').forEach(card=>{
          const openPreview=()=>{
            const idx=Number(card.dataset.idx);
            const entry=mapEntries[idx];
            if(Number.isNaN(idx) || !entry || !entry.publicUrl) return;
            openNorthImagePreview(entry.publicUrl, entry.label || (idx+1));
          };
          card.ondblclick=openPreview;
          card.onkeydown=e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openPreview(); } };
        });
      }

      async function deleteEntry(idx){
        const entry = mapEntries[idx];
        if(!entry) return;
        const removeLocal = ()=>{
          mapEntries.splice(idx,1);
          persistEntries(true);
          buildNorthfindPreview();
          updateNorthStatus();
        };
        if(entry.id && supabaseReady() && window.examData && typeof window.examData.deleteNorthfindMap==='function'){
          updateUploadStatus('מוחק מפה מהשרת...','pending');
          try{
            await window.examData.deleteNorthfindMap(entry.id, entry.storagePath);
            removeLocal();
            updateUploadStatus('המפה נמחקה מהשרת','success');
          }catch(err){
            console.error('[north] delete error', err);
            updateUploadStatus('מחיקה מהשרת נכשלה – נסה שוב', 'error');
          }
        } else {
          removeLocal();
          updateUploadStatus('המפה הוסרה מקומית בלבד','muted');
        }
      }

      async function clearAllEntries(){
        if(!mapEntries.length) return;
        if(!confirm('למחוק את כל מפות מציאת הצפון?')) return;
        const toRemove = mapEntries.filter(entry=> entry.id);
        mapEntries = [];
        persistEntries(true);
        buildNorthfindPreview();
        updateNorthStatus();
        if(toRemove.length && supabaseReady() && window.examData && typeof window.examData.deleteNorthfindMap==='function'){
          updateUploadStatus('מוחק את כל המפות מהשרת...','pending');
          try{
            await Promise.allSettled(toRemove.map(entry=> window.examData.deleteNorthfindMap(entry.id, entry.storagePath)));
            updateUploadStatus('כל המפות הוסרו מהשרת','success');
          }catch(err){
            console.error('[north] bulk delete error', err);
            updateUploadStatus('חלק מהמפות לא הוסרו מהשרת','error');
          }
        } else {
          updateUploadStatus('כל המפות הוסרו מקומית','muted');
        }
      }

      async function getImageDimensions(dataUrl){
        return new Promise((resolve,reject)=>{
          const img=new Image();
          img.onload=()=> resolve({ width:img.width, height:img.height });
          img.onerror=()=> reject(new Error('שגיאה בטעינת התמונה'));
          img.src=dataUrl;
        });
      }

      async function uploadNorthMaps(files){
        if(!files.length) return;
        if(!window.examData || typeof window.examData.createNorthfindMap!=='function'){
          updateUploadStatus('מודול Supabase לא זמין – לא ניתן להעלות כעת','error');
          return;
        }
        if(!supabaseReady()){
          updateUploadStatus('Supabase לא מחובר – נסה שוב לאחר ההתחברות','error');
          return;
        }
        northUploadBtn && (northUploadBtn.disabled=true);
        updateUploadStatus('מעלה מפות ל-Supabase...','pending');
        let uploaded=0;
        for(const file of files){
          try{
            let dataUrl = await fileToDataUrl(file);
            if(dataUrl.length>650000){
              dataUrl = await compressDataUrl(dataUrl, 1200, 1200, 0.82);
            }
            const dims = await getImageDimensions(dataUrl);
            const createdBy = window.testAuth && typeof window.testAuth.getCurrentUser==='function' ? window.testAuth.getCurrentUser() : 'admin-panel';
            const row = await window.examData.createNorthfindMap({
              dataUrl,
              width:dims.width,
              height:dims.height,
              originalName:file.name,
              createdBy
            });
            const entry = normalizeEntry({
              id: row.id,
              storagePath: row.storage_path || row.storagePath,
              publicUrl: row.publicUrl || row.public_url,
              width: row.width_px || row.width,
              height: row.height_px || row.height,
              label: row.label || file.name,
              createdAt: row.created_at,
              createdBy: row.created_by || createdBy
            }, mapEntries.length);
            if(entry){ mapEntries.push(entry); uploaded++; }
          }catch(err){
            console.error('[north] upload failed', err);
            updateUploadStatus('שגיאה בהעלאת מפה: '+(err && err.message? err.message:'שגיאה לא ידועה'), 'error');
          }
        }
        persistEntries(true);
        buildNorthfindPreview();
        updateNorthStatus();
        if(uploaded){ updateUploadStatus(`✓ הועלו ${uploaded} מפות ל-Supabase`, 'success'); }
        northUploadBtn && (northUploadBtn.disabled=false);
      }

      async function refreshNorthFromSupabase(options={}){
        const attempts = typeof options.attempts==='number'? options.attempts : 4;
        if(!window.examData || typeof window.examData.listNorthfindMaps!=='function'){
          if(!options.silent){ updateUploadStatus('מודול Supabase לא זמין – מוצגות מפות מקומיות','error'); }
          return;
        }
        if(!supabaseReady()){
          if(attempts>0){
            setTimeout(()=> refreshNorthFromSupabase(Object.assign({}, options, { attempts: attempts-1 })), SUPABASE_RETRY_MS);
          } else if(!options.silent){
            updateUploadStatus('Supabase לא מחובר – מוצגות מפות מקומיות', 'error');
          }
          return;
        }
        try{
          updateUploadStatus('טוען מפות מ-Supabase...','pending');
          const rows = await window.examData.listNorthfindMaps();
          mapEntries = (rows||[]).map((row, idx)=> normalizeEntry({
            id: row.id,
            storagePath: row.storagePath || row.storage_path,
            publicUrl: row.publicUrl,
            width: row.width,
            height: row.height,
            label: row.label,
            createdAt: row.createdAt,
            createdBy: row.createdBy
          }, idx)).filter(Boolean);
          persistEntries(true);
          buildNorthfindPreview();
          updateNorthStatus();
          if(rows && rows.length){
            updateUploadStatus(`נטענו ${rows.length} מפות מ-Supabase`, 'success');
          } else {
            updateUploadStatus('אין מפות שמורות ב-Supabase כרגע','muted');
          }
        }catch(err){
          console.error('[north] remote load failed', err);
          if(!options.silent){ updateUploadStatus('שגיאה בטעינת Supabase – מוצגות מפות מקומיות','error'); }
        }
      }

      loadStoredEntries();
      buildNorthfindPreview();
      syncNorth();

      if(northUploadBtn && northUploadInput){
        northUploadBtn.onclick=()=> northUploadInput.click();
      }

      if(northClearBtn){
        northClearBtn.onclick=clearAllEntries;
      }

      if(northUploadInput){
        northUploadInput.onchange = async e=>{
          const files=Array.from(e.target.files||[]);
          if(!files.length) return;
          await uploadNorthMaps(files);
          e.target.value='';
        };
      }
      
      function openNorthImagePreview(src, label){
        if(!src) return;
        const existing=document.getElementById('north-image-lightbox');
        if(existing) existing.remove();
        const overlay=document.createElement('div');
        overlay.id='north-image-lightbox';
        overlay.className='north-lightbox';
        overlay.innerHTML=`
          <div class="north-lightbox-inner">
            <button type="button" class="north-lightbox-close" title="סגור">×</button>
            <img src="${src}" alt="תצוגת מפה ${label||''}">
          </div>
        `;
        const remove=()=> overlay.remove();
        overlay.addEventListener('click',e=>{ if(e.target===overlay) remove(); });
        overlay.querySelector('.north-lightbox-close').onclick=remove;
        document.addEventListener('keydown', function handleEsc(ev){
          if(ev.key==='Escape'){ remove(); document.removeEventListener('keydown', handleEsc); }
        });
        document.body.appendChild(overlay);
      }

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
      
      refreshNorthFromSupabase({ silent:true, attempts:4 });

      // Save north config
      const btnNorthSave=document.getElementById('btnNorthSave');
      if(btnNorthSave) btnNorthSave.onclick=async ()=>{
        persistEntries(true);
        updateNorthStatus();
        updateUploadStatus('שולח ל-Supabase...','pending');
        try{
          await syncSettingsToSupabase(document.getElementById('saveStatus'));
          updateUploadStatus('✓ המפות יועדכנו בסינכרון הבא','success');
        }catch(err){
          updateUploadStatus('שמירה מקומית הצליחה – המרוחקת נכשלה','error');
        }
        alert('✓ הגדרות מציאת הצפון נשמרו בהצלחה');
      };
    }
  
    // New Exam Parts
    let renderNewExamPartsRef = null; // מצביע גלובלי לפונקציית רענון חלקי המבחן החדש
    
    // Orientation Question Sets
    function setupOrientation(){
      const uploadTrigger=document.getElementById('btnOpenOrientationUpload');
      const uploadStatusEl=document.getElementById('orientationUploadStatus');
      const maxQuestionsEl = document.getElementById('orientMaxQuestions');
      const showCompassEl = document.getElementById('orientShowCompass');

      function setUploadStatus(text, tone='muted'){
        if(!uploadStatusEl) return;
        uploadStatusEl.textContent=text;
        let color='#94a3b8';
        if(tone==='error') color='#ef4444';
        else if(tone==='success') color='#10b981';
        else if(tone==='pending') color='#fbbf24';
        uploadStatusEl.style.color=color;
      }

      function syncOrientationFields(){
        if(maxQuestionsEl) {
          maxQuestionsEl.value = orientation.maxQuestions || 10;
          maxQuestionsEl.oninput = ()=>{ orientation.maxQuestions = Math.max(1, Math.min(50, +maxQuestionsEl.value || 10)); };
        }
        if(showCompassEl) {
          showCompassEl.checked = orientation.showCompass !== false;
          showCompassEl.onchange = ()=>{ orientation.showCompass = showCompassEl.checked; };
        }
      }

      async function fileToOptimizedDataUrl(file){
        const dataUrl = await fileToDataUrl(file);
        if(!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
        return dataUrl.length>700000? await compressDataUrl(dataUrl, 1280, 1280, 0.8) : dataUrl;
      }

      function openUploadModal(){
        if(!window.supabaseClient){
          alert('❌ Supabase לא מאותחל ולכן לא ניתן לבצע העלאה כרגע');
          return;
        }
        if(!window.orientationSync || typeof window.orientationSync.syncNewSets!=='function'){
          alert('❌ מודול סנכרון ההתמצאות אינו טעון');
          return;
        }

        if(document.getElementById('orientation-upload-modal')) return;
        const overlay=document.createElement('div');
        overlay.id='orientation-upload-modal';
        overlay.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(8,15,35,0.86);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
        const dialog=document.createElement('div');
        dialog.style.cssText='width:100%;max-width:720px;background:var(--bg-primary);border-radius:18px;box-shadow:0 30px 80px rgba(15,23,42,0.55);overflow:hidden;display:flex;flex-direction:column;';
        dialog.innerHTML=`
          <div style="padding:22px 28px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;background:var(--bg-secondary);">
            <div style="display:flex;flex-direction:column;gap:6px;">
              <h2 style="margin:0;font-size:1.4rem;color:var(--text-primary);">העלאת קבוצת התמצאות חדשה</h2>
              <p style="margin:0;font-size:0.85rem;color:var(--text-secondary);">בחרו תמונת TOP ולפחות מבט כיוון אחד. הקבצים יועלו ישירות ל-Supabase.</p>
            </div>
            <button id="orientModalClose" style="background:transparent;border:none;font-size:2.2rem;color:var(--text-secondary);cursor:pointer;line-height:1;">×</button>
          </div>
          <div style="padding:26px;display:flex;flex-direction:column;gap:22px;max-height:70vh;overflow-y:auto;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;">
              <div style="display:flex;flex-direction:column;gap:8px;">
                <label for="orientModalTop" style="font-weight:600;color:var(--text-primary);">🔝 תמונת מבט על</label>
                <input id="orientModalTop" type="file" accept="image/*" style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);">
                <span style="font-size:0.75rem;color:var(--text-secondary);">חובה. יש לוודא שהצפון כלפי מעלה.</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <label for="orientModalN2S" style="font-weight:600;color:var(--text-primary);">🧭 מצפון לדרום (N2S)</label>
                <input id="orientModalN2S" type="file" accept="image/*" style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);">
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <label for="orientModalS2N" style="font-weight:600;color:var(--text-primary);">🧭 מדרום לצפון (S2N)</label>
                <input id="orientModalS2N" type="file" accept="image/*" style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);">
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <label for="orientModalE2W" style="font-weight:600;color:var(--text-primary);">🧭 ממזרח למערב (E2W)</label>
                <input id="orientModalE2W" type="file" accept="image/*" style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);">
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <label for="orientModalW2E" style="font-weight:600;color:var(--text-primary);">🧭 ממערב למזרח (W2E)</label>
                <input id="orientModalW2E" type="file" accept="image/*" style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);">
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
              <div style="font-size:0.8rem;color:var(--text-secondary);">פורמטים נתמכים: JPG, PNG. מומלץ עד 3MB לקובץ – התמונות ידחסו אוטומטית בעת הצורך.</div>
              <span id="orientModalStatus" style="font-size:0.8rem;color:#94a3b8;">בחרו קבצים ולחצו על "שמירת קבוצה".</span>
            </div>
          </div>
          <div style="padding:22px 26px;border-top:1px solid var(--border-color);background:var(--bg-secondary);display:flex;justify-content:flex-end;gap:12px;">
            <button id="orientModalCancel" class="btn btn-secondary" style="min-width:120px;">ביטול</button>
            <button id="orientModalSubmit" class="btn" style="background:#10b981;color:#fff;min-width:190px;font-weight:600;">שמירת קבוצה ל-Supabase</button>
          </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const topInput=dialog.querySelector('#orientModalTop');
        const viewInputs={
          N2S: dialog.querySelector('#orientModalN2S'),
          S2N: dialog.querySelector('#orientModalS2N'),
          E2W: dialog.querySelector('#orientModalE2W'),
          W2E: dialog.querySelector('#orientModalW2E')
        };
        const closeBtn=dialog.querySelector('#orientModalClose');
        const cancelBtn=dialog.querySelector('#orientModalCancel');
        const uploadBtn=dialog.querySelector('#orientModalSubmit');
        const modalStatus=dialog.querySelector('#orientModalStatus');

        function setModalStatus(text, tone='muted'){
          if(!modalStatus) return;
          let color='#94a3b8';
          if(tone==='error') color='#ef4444';
          else if(tone==='success') color='#10b981';
          else if(tone==='pending') color='#fbbf24';
          modalStatus.textContent=text;
          modalStatus.style.color=color;
        }

        function closeModal(){
          overlay.remove();
          document.removeEventListener('keydown', escHandler);
        }

        function escHandler(ev){ if(ev.key==='Escape') closeModal(); }
        document.addEventListener('keydown', escHandler);

        overlay.addEventListener('click', ev=>{ if(ev.target===overlay) closeModal(); });
        if(closeBtn) closeBtn.onclick=closeModal;
        if(cancelBtn) cancelBtn.onclick=closeModal;

        if(uploadBtn){
          const defaultLabel=uploadBtn.textContent;
          uploadBtn.onclick=async ()=>{
            const topFile = topInput && topInput.files && topInput.files[0];
            if(!topFile){
              setModalStatus('יש לבחור תמונת מבט על.', 'error');
              return;
            }
            const viewFiles=[];
            Object.entries(viewInputs).forEach(([code,input])=>{
              const file=input && input.files && input.files[0];
              if(file) viewFiles.push({code, file});
            });
            if(viewFiles.length===0){
              setModalStatus('יש לבחור לפחות מבט כיוון אחד.', 'error');
              return;
            }
            uploadBtn.disabled=true;
            uploadBtn.textContent='⏳ מעלה...';
            setModalStatus('מעלה לסביבת Supabase...', 'pending');
            setUploadStatus('מעלה קבוצה חדשה ל-Supabase...', 'pending');
            try {
              const topData=await fileToOptimizedDataUrl(topFile);
              const viewImages=[];
              for(const entry of viewFiles){
                const url=await fileToOptimizedDataUrl(entry.file);
                viewImages.push({ url, orient: entry.code });
              }
              const payload=[{ id:'upload_'+Date.now(), name:'קבוצת מבחן חדשה', topImage:topData, viewImages }];
              await window.orientationSync.syncNewSets(payload);
              setModalStatus('✓ הועלה בהצלחה. החלון ייסגר מיד.', 'success');
              setUploadStatus('✓ הקבוצה הועלתה ל-Supabase', 'success');
              if(typeof loadOrientationDbPreview==='function'){ loadOrientationDbPreview(true); }
              setTimeout(closeModal, 600);
            } catch(err){
              console.error('[orientation-upload] upload failed', err);
              setModalStatus('❌ שגיאה בהעלאה: '+(err && err.message? err.message: err), 'error');
              setUploadStatus('❌ שגיאה בהעלאת הקבוצה', 'error');
            } finally {
              uploadBtn.disabled=false;
              uploadBtn.textContent=defaultLabel;
            }
          };
        }
      }

      if(uploadTrigger){
        uploadTrigger.onclick=openUploadModal;
      }

      syncOrientationFields();
      setUploadStatus('הקבוצות מנוהלות דרך Supabase. ניתן להעלות קבוצה חדשה באמצעות החלון היעודי.');
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
          const isPractice = idx===0;
          const practiceBadge = isPractice? '<span style="padding:6px 10px;border-radius:999px;background:#facc15;color:#1f2937;font-size:0.7rem;font-weight:700">תרגול חובה</span>' : '';
          const removeBtn = isPractice? '' : `<button class="btn-remove-map" data-remove="${idx}" style="background:#ef4444;color:#fff;border:none;width:34px;height:34px;border-radius:10px;font-size:20px;line-height:1">×</button>`;
          const practiceNote = isPractice? '<div style="margin:0 0 12px;font-size:0.8rem;color:#f97316;font-weight:600">חלק זה מוצג ראשון בבסיס הנתונים וישמש כתרגול ללא ניקוד. לא ניתן להסיר אותו.</div>' : '';
          const card=document.createElement('div');
          card.style.border='2px solid var(--border-color)';
          card.style.borderRadius='14px';
          card.style.padding='16px';
          card.style.background='var(--bg-secondary)';
          card.style.boxShadow='var(--shadow-sm)';
          card.innerHTML=`
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <input type="text" class="nx-name" data-i="${idx}" value="${p.name}" style="flex:1;padding:10px;border:2px solid var(--border-color);border-radius:8px;margin-left:10px" placeholder="שם החלק">
              <div style="display:flex;gap:8px;align-items:center">
                ${practiceBadge}
                <button class="nx-edit-path-btn btn btn-secondary" data-i="${idx}" style="padding:8px 14px;font-size:0.75rem">✏ מסלול</button>
                ${removeBtn}
              </div>
            </div>
            ${practiceNote}
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
  
    function openNewExamPathEditor(target, options){
      const cfg = options || {};
      const directPart = target && typeof target==='object' && !Array.isArray(target);
      const partIndex = directPart? -1 : Number(target);
      const part = directPart? target : flightExam.parts[partIndex];
      if(!part){ alert('החלק לא נמצא לעריכת נקודות'); return; }
      if(!part.pathImg){ alert('יש לבחור / להעלות תמונת מסלול קודם'); return; }
      const onSaveCallback = typeof cfg.onSave==='function'? cfg.onSave : null;
      const afterSaveCallback = typeof cfg.onAfterSave==='function'? cfg.onAfterSave : null;
      const suppressAlert = !!cfg.suppressSuccessAlert;
      const modal=document.getElementById('flightexam-path-editor-modal');
      const nameSpan=document.getElementById('nxEditorPartName');
      const canvas=document.getElementById('nxEditorCanvas');
      const status=document.getElementById('nxEditorStatus');
      const btnClose=document.getElementById('nxEditorClose');
      const btnSave=document.getElementById('nxEditorSave');
      const btnClear=document.getElementById('nxEditorClear');
      const btnReset=document.getElementById('nxEditorReset');
      if(!modal||!canvas) return;
      nameSpan.textContent=part.name || 'חלק ללא שם';
      modal.style.display='flex';
      let img=new Image(); let imgReady=false; let points=[...part.pathPoints];
      function fitContain(sw,sh,dw,dh){ const sr=sw/sh, dr=dw/dh; if(sr>dr){ const w=dw, h=w/sr; return {w,h}; } else { const h=dh, w=h*sr; return {w,h}; } }
      function resize(){ const w=Math.min(1000, window.innerWidth*0.8); const h=Math.min(700, window.innerHeight*0.6); canvas.width=w; canvas.height=h; draw(); }
      function draw(){ const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,canvas.width,canvas.height); if(imgReady){ const box=fitContain(img.width,img.height,canvas.width,canvas.height); const ox=(canvas.width-box.w)/2, oy=(canvas.height-box.h)/2; ctx.drawImage(img,ox,oy,box.w,box.h); if(points.length){ ctx.lineWidth=3; ctx.strokeStyle='#3b82f6'; ctx.beginPath(); points.forEach((p,i)=>{ const x=ox+p.x*box.w; const y=oy+p.y*box.h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); points.forEach((p,i)=>{ const x=ox+p.x*box.w; const y=oy+p.y*box.h; ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.fillStyle=i===0? '#10b981': (i===points.length-1?'#ef4444':'#f59e0b'); ctx.fill(); }); } }
        status.textContent=points.length? 'נקודות: '+points.length : 'אין נקודות'; }
      function canvasClick(e){ if(!imgReady) return; const rect=canvas.getBoundingClientRect(); const cx=e.clientX-rect.left; const cy=e.clientY-rect.top; const box=fitContain(img.width,img.height,canvas.width,canvas.height); const ox=(canvas.width-box.w)/2, oy=(canvas.height-box.h)/2; if(cx<ox||cx>ox+box.w||cy<oy||cy>oy+box.h) return; const nx=(cx-ox)/box.w, ny=(cy-oy)/box.h; points.push({x:nx,y:ny}); status.textContent='נקודות: '+points.length; draw(); }
      function removeLast(){ if(points.length){ points.pop(); status.textContent=points.length? 'נקודות: '+points.length : 'אין נקודות'; draw(); } }
      function resetAll(){ if(points.length && confirm('לאפס את כל הנקודות?')){ points=[]; status.textContent='אין נקודות'; draw(); } }
      function savePoints(){
        const nextPoints=[...points];
        part.pathPoints=nextPoints;
        const defaultSave=()=> saveNewExamParts().then(()=>{
          if(window.flightExamSync && part.partNumber){
            window.flightExamSync.updatePartPoints(part.partNumber, part.pathPoints);
          }
          if(renderNewExamPartsRef) renderNewExamPartsRef();
        });
        const handlerPromise = onSaveCallback? Promise.resolve(onSaveCallback(nextPoints, part)) : defaultSave();
        handlerPromise.then(()=>{
          if(!suppressAlert){
            const msg = cfg.successMessage || ('✓ נשמרו '+nextPoints.length+' נקודות');
            alert(msg);
          }
          if(afterSaveCallback){ afterSaveCallback(nextPoints, part); }
        }).catch(err=>{
          console.error('[flight-path-editor] save error', err);
          alert('❌ שגיאה בשמירת הנקודות: '+(err && err.message? err.message: err));
        });
      }
      img.onload=()=>{ imgReady=true; resize(); };
      img.crossOrigin='anonymous';
      img.src=part.pathImg;
      window.addEventListener('resize', resize);
      canvas.addEventListener('click', canvasClick);
      document.addEventListener('keydown', keyHandler);
      btnClear.onclick=removeLast; btnReset.onclick=resetAll; btnSave.onclick=savePoints; btnClose.onclick=closeEditor;
      function keyHandler(ev){ if(ev.key==='Backspace'){ ev.preventDefault(); removeLast(); } }
      function closeEditor(){ modal.style.display='none'; canvas.removeEventListener('click', canvasClick); document.removeEventListener('keydown', keyHandler); window.removeEventListener('resize', resize); }
    }
    window.openNewExamPathEditor = openNewExamPathEditor;
    window.openFlightPathEditor = function(part){
      if(!part){ alert('חלק לא זמין לעריכת נקודות'); return; }
      openNewExamPathEditor(part, {
        onSave: (points)=>{
          if(window.flightExamSync && typeof window.flightExamSync.updatePartPoints==='function' && part.partNumber){
            return window.flightExamSync.updatePartPoints(part.partNumber, points).then(()=>{
              if(typeof window.refreshFlightExamPartsFromDb==='function'){
                return window.refreshFlightExamPartsFromDb();
              }
            });
          }
          return Promise.resolve();
        },
        onAfterSave: ()=>{
          if(typeof window.loadFlightExamDbPreview==='function'){
            window.loadFlightExamDbPreview(true);
          }
        },
        successMessage: '✓ עודכנו נקודות המסלול בשרת',
        suppressSuccessAlert: false
      });
    };
  
    function verifyImage(dataUrl){
      // תיקון done.true -> done=true
      return new Promise(res=>{ if(!dataUrl){ return res(false); } const im=new Image(); let done=false; const t=setTimeout(()=>{ if(!done){ done=true; res(false); } },4000); im.onload=()=>{ if(!done){ done=true; clearTimeout(t); res(true); } }; im.onerror=()=>{ if(!done){ done=true; clearTimeout(t); res(false); } }; im.src=dataUrl + (dataUrl.startsWith('data:')? '' : (dataUrl.includes('?')? '&':'?')+'v=' + Date.now()); });
    }
  
    function setupSave(){
      const saveBtn=document.getElementById('saveSettings');
      const exportBtn=document.getElementById('exportSettings');
      const exportZipBtn=document.getElementById('exportSettingsZip');
      const importBtn=document.getElementById('importSettingsFile');
      const saveStatusEl=document.getElementById('saveStatus');
      if(saveBtn) saveBtn.onclick=async ()=>{
        console.log('[settings] validating images before save...');
        let northOk = true; if(north.mapImages && north.mapImages.length){ for(const m of north.mapImages){ const ok=await verifyImage(m); if(!ok){ northOk=false; break; } } }
        let newExamOk = true; for(const p of flightExam.parts){ if(p.pathImg){ const ok=await verifyImage(p.pathImg); if(!ok){ newExamOk=false; break; } } if(newExamOk && p.testImg){ const ok2=await verifyImage(p.testImg); if(!ok2){ newExamOk=false; break; } } if(newExamOk && p.pathImg && p.testImg && (p.pathW!==p.testW || p.pathH!==p.testH)){ alert('חלק "'+p.name+'" גדלי התמונות לא תואמים ולכן לא נשמר'); newExamOk=false; break; } }
        if(!northOk || !newExamOk){ alert('❌ שגיאה בולידציית תמונות'); return; }
        save(LS_KEY, settings);
        save(LS_NORTH,north);
        saveOrientationConfig();
        saveNewExamParts();
        applyNavVisibility();
        buildTestSelectorUI();
        if(saveStatusEl){ saveStatusEl.textContent='נשמר מקומית...'; saveStatusEl.style.color='#94a3b8'; }
        await syncSettingsToSupabase(saveStatusEl);
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

    function setupUserManagement(){
      const section=document.querySelector('[data-tab-section="users"]');
      if(!section) return;
      const searchInput=section.querySelector('#userSearchInput');
      const completionFilter=section.querySelector('#userCompletionFilter');
      const refreshBtn=section.querySelector('#userRefreshBtn');
      const listBody=section.querySelector('#userListBody');
      const loadingEl=section.querySelector('#userListLoading');
      const emptyEl=section.querySelector('#userListEmptyState');
      const errorEl=section.querySelector('#userListError');
      const firstNameInput=section.querySelector('#userFirstName');
      const lastNameInput=section.querySelector('#userLastName');
      const nationalIdInput=section.querySelector('#userNationalId');
      const notesInput=section.querySelector('#userNotes');
      const pinInput=section.querySelector('#userEntryPin');
      const pinRegenBtn=section.querySelector('#userPinRegenBtn');
      const allDoneInput=section.querySelector('#userAllDone');
      const testsMetaEl=section.querySelector('#userTestsMeta');
      const saveBtn=section.querySelector('#userSaveBtn');
      const resetBtn=section.querySelector('#userResetBtn');
      const deleteBtn=section.querySelector('#userDeleteBtn');
      const formStatus=section.querySelector('#userFormStatus');
      const formTitle=section.querySelector('#userFormTitle');
      const formMode=section.querySelector('#userFormMode');
      if(!listBody || !nationalIdInput) return;

      let usersCache=[];
      let currentEdit=null;
      let searchValue='';
      let completionValue='all';
      let debounceTimer=null;
      let pendingPin='';

      function generateEntryPin(){
        return String(Math.floor(Math.random()*10000)).padStart(4,'0');
      }
      function normalizePin(value){
        const str = String(value||'').trim();
        return /^\d{1,4}$/.test(str)? str.padStart(4,'0') : '';
      }
      function isPinInUse(pin, excludeId){
        const normalized=normalizePin(pin);
        if(!normalized) return false;
        return usersCache.some(user=>{
          if(excludeId && String(user.id)===String(excludeId)) return false;
          return normalizePin(user.entry_pin)===normalized;
        });
      }
      function pickUniquePin(seed){
        let candidate = normalizePin(seed) || generateEntryPin();
        const excludeId = currentEdit && currentEdit.id ? String(currentEdit.id) : null;
        let guard=0;
        while(isPinInUse(candidate, excludeId) && guard<50){
          candidate = generateEntryPin();
          guard++;
        }
        if(isPinInUse(candidate, excludeId)){
          setFormStatus('לא נמצא קוד ייחודי – נסה שוב', 'error');
        }
        return candidate;
      }
      function setPin(value){
        const orig=normalizePin(value);
        const unique=pickUniquePin(value);
        pendingPin = unique;
        if(pinInput) pinInput.value=pendingPin;
        if(orig && orig!==unique){
          setFormStatus('קוד הכניסה כבר היה בשימוש – הופק קוד חדש '+unique, 'muted');
        }
      }
      function regenPin(){
        setPin(generateEntryPin());
        setFormStatus('נוצר קוד חדש '+pendingPin, 'muted');
      }
      function escapeHtml(value){
        if(value===null||value===undefined) return '';
        return String(value).replace(/[&<>"']/g, c=>({
          '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        })[c]);
      }
      function formatDate(iso){
        if(!iso) return '-';
        try{
          return new Date(iso).toLocaleDateString('he-IL', {hour:'2-digit', minute:'2-digit'});
        }catch(e){ return iso; }
      }
      function normalizeTestsCompleted(value){
        if(Array.isArray(value)) return value.filter(Boolean);
        if(value && typeof value==='object'){
          return Object.keys(value).filter(key=>value[key]);
        }
        if(typeof value==='string'){
          return value.split(',').map(v=>v.trim()).filter(Boolean);
        }
        return [];
      }
      function getDisplayName(user){
        const first=(user.first_name||'').trim();
        const last=(user.last_name||'').trim();
        const combined=`${first} ${last}`.trim();
        return combined || 'ללא שם';
      }
      function describeCompletion(user){
        const finished=!!user.all_tests_done;
        const completed=normalizeTestsCompleted(user.tests_completed);
        if(finished) return { text:'כל המבחנים הושלמו', style:'background:#10b981;color:#fff;' };
        if(completed.length) return { text:`${completed.length} מבחנים הושלמו`, style:'background:#fde68a;color:#78350f;' };
        return { text:'טרם בוצעו מבחנים', style:'background:#cbd5f5;color:#1f2937;' };
      }
      function describeTestsMeta(user){
        const completed=normalizeTestsCompleted(user.tests_completed);
        const scores=user && typeof user.scores==='object' ? Object.keys(user.scores||{}) : [];
        if(!completed.length && !scores.length) return 'לא בוצעו ניסיונות עדיין';
        const parts=[];
        if(completed.length){ parts.push(`${completed.length} מבחנים סומנו כהושלמו`); }
        if(scores.length){ parts.push(`קיימים ציונים ל-${scores.length} מבחנים`); }
        return parts.join(' | ');
      }
      function setLoading(state){
        if(loadingEl) loadingEl.style.display=state? 'block':'none';
        if(state && emptyEl) emptyEl.style.display='none';
      }
      function setEmpty(state){
        if(emptyEl) emptyEl.style.display=state? 'block':'none';
      }
      function setError(text){
        if(!errorEl) return;
        errorEl.textContent=text||'';
        errorEl.style.display=text? 'block':'none';
      }
      function setFormStatus(text, tone){
        if(!formStatus) return;
        const colors={ success:'#10b981', error:'#ef4444', muted:'#94a3b8' };
        formStatus.textContent=text||'';
        formStatus.style.color=colors[tone] || colors.muted;
      }
      function updateFormMode(){
        if(!formTitle || !formMode) return;
        if(currentEdit){
          formTitle.textContent='עריכת מועמד';
          formMode.textContent='מצב עריכה';
          formMode.style.background='#fee2e2';
          formMode.style.color='#991b1b';
          if(deleteBtn) deleteBtn.style.display='inline-flex';
        } else {
          formTitle.textContent='הוסף מועמד חדש';
          formMode.textContent='מצב יצירה';
          formMode.style.background='var(--bg-tertiary)';
          formMode.style.color='var(--text-secondary)';
          if(deleteBtn) deleteBtn.style.display='none';
        }
      }
      function clearForm(){
        currentEdit=null;
        firstNameInput && (firstNameInput.value='');
        lastNameInput && (lastNameInput.value='');
        nationalIdInput.value='';
        if(notesInput) notesInput.value='';
        if(allDoneInput) allDoneInput.checked=false;
        if(testsMetaEl) testsMetaEl.textContent='לא בוצעו ניסיונות עדיין';
        setPin(generateEntryPin());
        updateFormMode();
      }
      function populateForm(user){
        currentEdit=user;
        firstNameInput && (firstNameInput.value=user.first_name||'');
        lastNameInput && (lastNameInput.value=user.last_name||'');
        nationalIdInput.value=user.national_id||'';
        if(notesInput) notesInput.value=user.notes||'';
        if(allDoneInput) allDoneInput.checked=!!user.all_tests_done;
        if(testsMetaEl) testsMetaEl.textContent=describeTestsMeta(user);
        setPin(user.entry_pin||'');
        updateFormMode();
      }
      function renderRows(rows){
        usersCache=Array.isArray(rows)? rows: [];
        if(!listBody) return;
        if(!usersCache.length){
          listBody.innerHTML='';
          setEmpty(true);
          return;
        }
        setEmpty(false);
        listBody.innerHTML=usersCache.map(user=>{
          const completion=describeCompletion(user);
          return `
            <tr data-user-id="${escapeHtml(user.id)}">
              <td style="padding:10px 12px;">
                <div style="font-weight:600;font-size:0.95rem;color:var(--text-primary);">${escapeHtml(getDisplayName(user))}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(user.notes||'')}</div>
              </td>
              <td style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-primary);">${escapeHtml(user.national_id||'-')}</td>
              <td style="text-align:center;padding:10px 12px;font-family:'Courier New',monospace;font-weight:600;letter-spacing:0.2em;">${escapeHtml((user.entry_pin||'').padStart(4,'0'))}</td>
              <td style="text-align:center;padding:10px 12px;">
                <span class="pill-small" style="${completion.style}">${completion.text}</span>
              </td>
              <td style="text-align:center;padding:10px 12px;font-size:0.75rem;color:var(--text-secondary);">${formatDate(user.updated_at||user.created_at)}</td>
              <td style="text-align:center;padding:10px 12px;">
                <button class="btn btn-secondary" data-action="edit" data-id="${escapeHtml(user.id)}" style="padding:6px 12px;font-size:0.75rem;border-radius:8px;">ערוך</button>
              </td>
            </tr>`;
        }).join('');
      }
      async function loadUsers(){
        if(!window.examData || typeof window.examData.listUsers!=='function'){
          setError('מודול הנתונים אינו זמין');
          return;
        }
        if(typeof window.examData.isReady==='function' && !window.examData.isReady()){
          setError('ממתין לחיבור ל-Supabase...');
          setEmpty(true);
          return;
        }
        setError('');
        setLoading(true);
        try{
          const rows=await window.examData.listUsers({ search:searchValue, completion:completionValue });
          renderRows(rows);
        }catch(err){
          console.warn('[settings] loadUsers failed', err);
          setError('שגיאה בטעינת מועמדים: '+(err && err.message? err.message:''));
          renderRows([]);
        }finally{
          setLoading(false);
        }
      }
      async function handleSave(){
        const payload={
          national_id:(nationalIdInput.value||'').trim(),
          first_name:firstNameInput? (firstNameInput.value||'').trim() : '',
          last_name:lastNameInput? (lastNameInput.value||'').trim() : '',
          notes:notesInput? (notesInput.value||'').trim() : '',
          all_tests_done:allDoneInput? !!allDoneInput.checked : false,
          entry_pin:pendingPin
        };
        if(!payload.national_id){
          setFormStatus('חובה להזין תעודת זהות', 'error');
          nationalIdInput.focus();
          return;
        }
        if(isPinInUse(payload.entry_pin, currentEdit && currentEdit.id)){
          setFormStatus('קוד הכניסה כבר בשימוש – הפק קוד חדש לפני שמירה', 'error');
          return;
        }
        if(!window.examData){
          setFormStatus('מודול הנתונים אינו זמין', 'error');
          return;
        }
        setFormStatus('שומר מועמד...', 'muted');
        if(saveBtn) saveBtn.disabled=true;
        try{
          if(currentEdit){
            await window.examData.updateUser(currentEdit.id, payload);
            setFormStatus('✓ פרטי המועמד עודכנו', 'success');
          } else {
            await window.examData.createUser(payload);
            setFormStatus('✓ המועמד נוצר בהצלחה', 'success');
          }
          clearForm();
          await loadUsers();
        }catch(err){
          console.warn('[settings] save user failed', err);
          if(err && (err.code==='23505' || (err.message && err.message.includes('entry_pin')))){
            setFormStatus('קוד הכניסה כבר בשימוש – נסה להפיק קוד חדש ולשמור שוב', 'error');
          } else {
            setFormStatus('❌ '+(err && err.message? err.message:'שמירה נכשלה'), 'error');
          }
        }finally{
          if(saveBtn) saveBtn.disabled=false;
        }
      }
      async function handleDelete(){
        if(!currentEdit) return;
        if(!window.examData){ setFormStatus('מודול הנתונים אינו זמין', 'error'); return; }
        const confirmed = confirm('האם למחוק את המועמד "'+getDisplayName(currentEdit)+'"? הפעולה בלתי הפיכה.');
        if(!confirmed) return;
        setFormStatus('מוחק מועמד...', 'muted');
        if(deleteBtn) deleteBtn.disabled=true;
        try{
          await window.examData.deleteUser(currentEdit.id);
          setFormStatus('✓ המועמד נמחק', 'success');
          clearForm();
          await loadUsers();
        }catch(err){
          console.warn('[settings] delete user failed', err);
          setFormStatus('❌ '+(err && err.message? err.message:'מחיקה נכשלה'), 'error');
        }finally{
          if(deleteBtn) deleteBtn.disabled=false;
        }
      }

      if(listBody){
        listBody.addEventListener('click', ev=>{
          const btn=ev.target.closest('button[data-action]');
          if(!btn) return;
          const id=btn.getAttribute('data-id');
          if(btn.dataset.action==='edit' && id){
            const user=usersCache.find(u=>String(u.id)===String(id));
            if(user){
              populateForm(user);
              setFormStatus('בעריכת מועמד קיים', 'muted');
            }
          }
        });
      }
      if(searchInput){
        searchInput.value='';
        searchInput.oninput=()=>{
          searchValue=searchInput.value.trim();
          if(debounceTimer) clearTimeout(debounceTimer);
          debounceTimer=setTimeout(()=> loadUsers(), 300);
        };
      }
      if(completionFilter){
        completionFilter.value='all';
        completionFilter.onchange=()=>{
          completionValue=completionFilter.value||'all';
          loadUsers();
        };
      }
      if(refreshBtn) refreshBtn.onclick=()=> loadUsers();
      if(resetBtn) resetBtn.onclick=()=>{ clearForm(); setFormStatus('הטופס אופס', 'muted'); };
      if(saveBtn) saveBtn.onclick=handleSave;
        if(deleteBtn) deleteBtn.onclick=handleDelete;
        if(pinRegenBtn) pinRegenBtn.onclick=regenPin;

      updateFormMode();
      clearForm();
      setEmpty(true);
      window.refreshExamUsersList = loadUsers;
      loadUsers();
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
          setupUserManagement();
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
      orientation=sanitizeOrientationConfig(load(LS_ORIENTATION, DEFAULT_ORIENTATION));
      buildAdminUI();
      rebuildTestsConfig();
      setupUserManagement();
      applyNavVisibility();
      syncNewExamTiming();
      syncGeneralFields(); // ensure new field updates
      buildTestSelectorUI();
    };
    
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
            card.dataset.testNumber = g.num;
            card.style.cssText='border:2px solid var(--border-color);border-radius:14px;padding:14px;background:var(--bg-secondary);display:flex;flex-direction:column;gap:12px;position:relative;transition:all 0.2s ease;box-shadow:var(--shadow-sm);';
            
            const title = document.createElement('div');
            title.style.cssText='font-weight:700;font-size:1rem;display:flex;justify-content:space-between;align-items:center;padding-left:100px;color:var(--text-primary);';
            title.innerHTML = `<span>📍 מבחן ${g.num}</span><span style="font-size:0.75rem;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">${g.views.length} מבטים</span>`;
            card.appendChild(title);
            
            // כפתורי פעולה
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText='position:absolute;top:10px;left:10px;display:flex;gap:8px;z-index:10;';
            
            const editBtn = document.createElement('button');
            editBtn.innerHTML='✏️<br><span style="font-size:0.65rem">ערוך</span>';
            editBtn.title='ערוך קבוצה';
            editBtn.style.cssText='background:#3b82f6;color:#fff;border:none;padding:8px 12px;font-size:1rem;border-radius:8px;cursor:pointer;transition:all 0.15s;line-height:1.2;display:flex;flex-direction:column;align-items:center;box-shadow:0 2px 8px rgba(59,130,246,0.3);';
            editBtn.onmouseenter=()=>editBtn.style.background='#2563eb';
            editBtn.onmouseleave=()=>editBtn.style.background='#3b82f6';
            editBtn.onclick=()=> {
              if(window.orientationSync && typeof window.orientationSync.editTestGroup==='function'){
                window.orientationSync.editTestGroup(g.num);
              } else {
                alert('מודול עריכה לא זמין');
              }
            };
            actionsDiv.appendChild(editBtn);
            
            const delBtn = document.createElement('button');
            delBtn.innerHTML='🗑️<br><span style="font-size:0.65rem">מחק</span>';
            delBtn.title='מחק קבוצה';
            delBtn.style.cssText='background:#ef4444;color:#fff;border:none;padding:8px 12px;font-size:1rem;border-radius:8px;cursor:pointer;transition:all 0.15s;line-height:1.2;display:flex;flex-direction:column;align-items:center;box-shadow:0 2px 8px rgba(239,68,68,0.3);';
            delBtn.onmouseenter=()=>delBtn.style.background='#dc2626';
            delBtn.onmouseleave=()=>delBtn.style.background='#ef4444';
            delBtn.onclick=()=> {
              if(window.orientationSync && typeof window.orientationSync.deleteTestGroup==='function'){
                window.orientationSync.deleteTestGroup(g.num);
              } else {
                alert('מודול מחיקה לא זמין');
              }
            };
            actionsDiv.appendChild(delBtn);
            
            card.appendChild(actionsDiv);
            
            // Top image - גדול יותר
            if(g.top){
              const topUrl = bucket.getPublicUrl(g.top.storage_path).data.publicUrl;
              const wrap = document.createElement('div');
              wrap.style.cssText='position:relative;height:180px;border:2px solid var(--border-color);border-radius:10px;overflow:hidden;cursor:zoom-in;background:#0f172a;transition:border-color 0.2s;';
              wrap.onmouseenter=()=>wrap.style.borderColor='var(--accent-primary)';
              wrap.onmouseleave=()=>wrap.style.borderColor='var(--border-color)';
              wrap.innerHTML = `<img draggable="false" data-full="${topUrl}" alt="top" src="${topUrl}" style="width:100%;height:100%;object-fit:cover;">`+
                `<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top, rgba(0,0,0,0.85), transparent);color:#fff;font-size:0.75rem;font-weight:600;padding:8px;text-align:center;letter-spacing:1px;">🔝 מבט על</div>`;
              card.appendChild(wrap);
            }
            // Views grid - גדול יותר ומסודר
            const viewsGrid = document.createElement('div');
            viewsGrid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:10px;';
            g.views.forEach(v=>{
              const viewUrl = bucket.getPublicUrl(v.storage_path).data.publicUrl;
              const cell = document.createElement('div');
              cell.style.cssText='position:relative;height:90px;border:2px solid var(--border-color);border-radius:8px;overflow:hidden;cursor:zoom-in;background:#0f172a;transition:all 0.2s;';
              cell.onmouseenter=()=>{cell.style.borderColor='var(--accent-primary)';cell.style.transform='scale(1.05)';};
              cell.onmouseleave=()=>{cell.style.borderColor='var(--border-color)';cell.style.transform='scale(1)';};
              cell.innerHTML = `<img draggable="false" data-full="${viewUrl}" alt="${v.code}" src="${viewUrl}" style="width:100%;height:100%;object-fit:cover">`+
                `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.75);color:#fff;font-size:0.7rem;font-weight:600;padding:4px;text-align:center;letter-spacing:0.5px;">${v.code}</div>`;
              viewsGrid.appendChild(cell);
            });
            card.appendChild(viewsGrid);
            frag.appendChild(card);
          });
          holder.appendChild(frag);
          status.textContent='✅ טעון: '+groups.size+' קבוצות מהשרת';
          status.style.color='#10b981';
          attachOrientationDbPreviewEvents();
        }).catch(e=>{ status.textContent='❌ שגיאה: '+e.message; status.style.color='#ef4444'; });
    }

    // === Supabase Flight Exam DB Preview ===
    function loadFlightExamDbPreview(force){
      const holder = document.getElementById('flightExamDbPreview');
      const status = document.getElementById('flightExamDbStatus');
      if(!holder || !status) return;
      if(force){ holder.innerHTML=''; }
      status.textContent='טוען מהשרת...';
      if(!window.supabaseClient){
        status.textContent='Supabase לא מאותחל';
        return;
      }
      if(!window.flightExamSync || !window.flightExamSync.loadFromDb){
        status.textContent='מודול סנכרון לא נטען';
        return;
      }
      
      window.flightExamSync.loadFromDb(true).then(parts=>{
        if(!parts || !parts.length){
          status.textContent='אין חלקים בשרת';
          holder.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-secondary);font-size:0.95rem;background:var(--bg-tertiary);border-radius:12px;border:2px dashed var(--border-color);">📭 לא נמצאו חלקי מבחן טיסה בבסיס הנתונים</div>';
          return;
        }
        
        holder.innerHTML='';
        const frag = document.createDocumentFragment();
        
        parts.forEach(part=>{
          const card = document.createElement('div');
          card.className='flight-db-card';
          card.dataset.partNumber = part.partNumber;
          card.style.cssText='border:2px solid var(--border-color);border-radius:14px;padding:16px;background:var(--bg-secondary);display:flex;flex-direction:column;gap:14px;position:relative;transition:all 0.2s ease;box-shadow:var(--shadow-sm);';
          
          const title = document.createElement('div');
          title.style.cssText='font-weight:700;font-size:1rem;display:flex;justify-content:space-between;align-items:center;padding-left:110px;color:var(--text-primary);';
          title.innerHTML = `<span>✈️ ${part.name}</span><span style="font-size:0.75rem;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">חלק #${part.partNumber}</span>`;
          card.appendChild(title);
          
          // כפתורי פעולה
          const actionsDiv = document.createElement('div');
          actionsDiv.style.cssText='position:absolute;top:12px;left:12px;display:flex;gap:8px;z-index:10;';
          
          const editBtn = document.createElement('button');
          editBtn.innerHTML='✏️<br><span style="font-size:0.65rem">ערוך</span>';
          editBtn.title='ערוך חלק';
          editBtn.style.cssText='background:#3b82f6;color:#fff;border:none;padding:8px 12px;font-size:1rem;border-radius:8px;cursor:pointer;transition:all 0.15s;line-height:1.2;display:flex;flex-direction:column;align-items:center;box-shadow:0 2px 8px rgba(59,130,246,0.3);';
          editBtn.onmouseenter=()=>editBtn.style.background='#2563eb';
          editBtn.onmouseleave=()=>editBtn.style.background='#3b82f6';
          editBtn.onclick=()=> {
            if(window.flightExamSync && typeof window.flightExamSync.editPart==='function'){
              window.flightExamSync.editPart(part.partNumber);
            } else {
              alert('מודול עריכה לא זמין');
            }
          };
          actionsDiv.appendChild(editBtn);
          
          const delBtn = document.createElement('button');
          delBtn.innerHTML='🗑️<br><span style="font-size:0.65rem">מחק</span>';
          delBtn.title='מחק חלק';
          delBtn.style.cssText='background:#ef4444;color:#fff;border:none;padding:8px 12px;font-size:1rem;border-radius:8px;cursor:pointer;transition:all 0.15s;line-height:1.2;display:flex;flex-direction:column;align-items:center;box-shadow:0 2px 8px rgba(239,68,68,0.3);';
          delBtn.onmouseenter=()=>delBtn.style.background='#dc2626';
          delBtn.onmouseleave=()=>delBtn.style.background='#ef4444';
          delBtn.onclick=()=> {
            if(window.flightExamSync && typeof window.flightExamSync.deletePart==='function'){
              window.flightExamSync.deletePart(part.partNumber);
            } else {
              alert('מודול מחיקה לא זמין');
            }
          };
          actionsDiv.appendChild(delBtn);
          
          card.appendChild(actionsDiv);
          
          // תמונות - גדולות יותר
          const imagesGrid = document.createElement('div');
          imagesGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:14px;';
          
          // Path image
          const pathWrap = document.createElement('div');
          pathWrap.style.cssText='display:flex;flex-direction:column;gap:6px;';
          pathWrap.innerHTML = `
            <label style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);display:flex;align-items:center;gap:6px;">🗺️ תמונת מסלול</label>
            <div style="position:relative;height:160px;border:2px solid var(--border-color);border-radius:10px;overflow:hidden;cursor:zoom-in;background:#0f172a;transition:border-color 0.2s;" class="img-preview-hover">
              <img draggable="false" data-full="${part.pathImg}" src="${part.pathImg}" style="width:100%;height:100%;object-fit:cover">
              <div style="position:absolute;bottom:3px;left:3px;right:3px;background:rgba(0,0,0,0.75);color:#fff;font-size:0.65rem;padding:4px 6px;border-radius:6px;font-weight:600;">${part.pathW}×${part.pathH} px</div>
            </div>
          `;
          imagesGrid.appendChild(pathWrap);
          
          // Test image
          const testWrap = document.createElement('div');
          testWrap.style.cssText='display:flex;flex-direction:column;gap:6px;';
          testWrap.innerHTML = `
            <label style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);display:flex;align-items:center;gap:6px;">🎯 תמונת מבחן</label>
            <div style="position:relative;height:160px;border:2px solid var(--border-color);border-radius:10px;overflow:hidden;cursor:zoom-in;background:#0f172a;transition:border-color 0.2s;" class="img-preview-hover">
              <img draggable="false" data-full="${part.testImg}" src="${part.testImg}" style="width:100%;height:100%;object-fit:cover">
              <div style="position:absolute;bottom:3px;left:3px;right:3px;background:rgba(0,0,0,0.75);color:#fff;font-size:0.65rem;padding:4px 6px;border-radius:6px;font-weight:600;">${part.testW}×${part.testH} px</div>
            </div>
          `;
          imagesGrid.appendChild(testWrap);
          
          card.appendChild(imagesGrid);
          
          // מידע נוסף
          const info = document.createElement('div');
          info.style.cssText='font-size:0.75rem;color:var(--text-secondary);display:flex;justify-content:space-between;background:var(--bg-tertiary);padding:8px 12px;border-radius:8px;';
          info.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">📍 נקודות מסלול: <strong style="color:var(--accent-primary)">${part.pathPoints?.length || 0}</strong></span><span style="color:#10b981;font-weight:600;">✅ נטען מהשרת</span>`;
          card.appendChild(info);
          
          frag.appendChild(card);
        });
        
        holder.appendChild(frag);
        status.textContent='✅ טעון: '+parts.length+' חלקים מהשרת';
        status.style.color='#10b981';
        attachFlightExamDbPreviewEvents();
      }).catch(err=>{
        console.error('[flightexam-preview] load error', err);
        status.textContent='❌ שגיאה: '+err.message;
        status.style.color='#ef4444';
      });
    }
    window.loadFlightExamDbPreview = loadFlightExamDbPreview;

    function attachFlightExamDbPreviewEvents(){
      const holder = document.getElementById('flightExamDbPreview');
      if(!holder) return;
      holder.querySelectorAll('img[data-full]').forEach(img=>{
        img.ondblclick = ()=> openPreviewModal(img.getAttribute('data-full'), 'תמונת מבחן טיסה');
      });
      holder.querySelectorAll('.img-preview-hover').forEach(div=>{
        div.onmouseenter=()=>div.style.borderColor='var(--accent-primary)';
        div.onmouseleave=()=>div.style.borderColor='var(--border-color)';
      });
      const reloadBtn = document.getElementById('btnReloadFlightExamDb');
      if(reloadBtn){ reloadBtn.onclick=()=> loadFlightExamDbPreview(true); }
      // הזרקת סטייל משופר
      if(!document.getElementById('flightExamDbPreviewStyles')){
        const st=document.createElement('style');
        st.id='flightExamDbPreviewStyles';
        st.textContent=`.flight-db-card:hover{box-shadow:0 6px 20px rgba(59,130,246,0.2);transform:translateY(-2px);border-color:var(--accent-primary);}`;
        document.head.appendChild(st);
      }
    }

    function attachOrientationDbPreviewEvents(){
      const holder = document.getElementById('orientationDbPreview');
      if(!holder) return;
      holder.querySelectorAll('img[data-full]').forEach(img=>{
        img.ondblclick = ()=> openPreviewModal(img.getAttribute('data-full'), 'תמונת התמצאות');
      });
      const reloadBtn = document.getElementById('btnReloadOrientationDb');
      if(reloadBtn){ reloadBtn.onclick=()=> loadOrientationDbPreview(true); }
      // הזרקת סטייל משופר
      if(!document.getElementById('orientDbPreviewStyles')){
        const st=document.createElement('style');
        st.id='orientDbPreviewStyles';
        st.textContent=`.orient-db-card:hover{box-shadow:0 6px 20px rgba(59,130,246,0.2);transform:translateY(-2px);border-color:var(--accent-primary);}`;
        document.head.appendChild(st);
      }
    }

    // פונקציה להצגת תמונה במסך מלא - עיצוב משופר
    function openPreviewModal(imageUrl, title){
      if(!imageUrl) return;
      
      // יצירת מודל זמני
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.96);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);animation:fadeIn 0.2s ease;';
      
      const titleBar = document.createElement('div');
      titleBar.style.cssText = 'position:absolute;top:0;left:0;right:0;background:linear-gradient(to bottom, rgba(0,0,0,0.9), transparent);color:#fff;padding:20px 24px;font-size:1.2rem;font-weight:700;display:flex;justify-content:space-between;align-items:center;';
      titleBar.innerHTML = `<span style="display:flex;align-items:center;gap:10px;">🖼️ ${title || 'תמונה'}</span><button style="background:rgba(239,68,68,0.9);border:none;color:#fff;font-size:1.8rem;cursor:pointer;padding:8px 16px;line-height:1;border-radius:10px;transition:all 0.2s;font-weight:700;">✕</button>`;
      
      const img = document.createElement('img');
      img.src = imageUrl;
      img.style.cssText = 'max-width:92%;max-height:88%;object-fit:contain;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.7);animation:zoomIn 0.3s ease;';
      
      const hint = document.createElement('div');
      hint.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.7);font-size:0.85rem;background:rgba(0,0,0,0.6);padding:8px 16px;border-radius:8px;backdrop-filter:blur(4px);';
      hint.textContent = '💡 לחץ בכל מקום או ESC לסגירה | גלגל עכבר לזום';
      
      const closeBtn = titleBar.querySelector('button');
      closeBtn.onmouseenter=()=>closeBtn.style.background='#dc2626';
      closeBtn.onmouseleave=()=>closeBtn.style.background='rgba(239,68,68,0.9)';
      const close = ()=> {modal.style.animation='fadeOut 0.15s ease';setTimeout(()=>modal.remove(),150);};
      closeBtn.onclick = close;
      modal.onclick = e=> { if(e.target === modal || e.target === img) close(); };
      document.addEventListener('keydown', function escHandler(e){ if(e.key === 'Escape'){ close(); document.removeEventListener('keydown', escHandler); } });
      
      // הוספת זום בגלגלת
      let scale = 1;
      img.addEventListener('wheel', e => {
        e.preventDefault();
        scale += e.deltaY > 0 ? -0.1 : 0.1;
        scale = Math.max(0.5, Math.min(3, scale));
        img.style.transform = `scale(${scale})`;
      });
      
      modal.appendChild(titleBar);
      modal.appendChild(img);
      modal.appendChild(hint);
      document.body.appendChild(modal);
      
      // הוספת אנימציות CSS
      if(!document.getElementById('previewModalAnimations')){
        const style = document.createElement('style');
        style.id='previewModalAnimations';
        style.textContent=`
          @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }
          @keyframes fadeOut { from{opacity:1;} to{opacity:0;} }
          @keyframes zoomIn { from{opacity:0;transform:scale(0.9);} to{opacity:1;transform:scale(1);} }
        `;
        document.head.appendChild(style);
      }
    }

    // === Supabase Orientation DB Preview ===
    document.addEventListener('click', e=>{
      const btn = e.target.closest('.admin-tab-btn[data-admin-tab="orientation"]');
      if(btn){ setTimeout(()=> loadOrientationDbPreview(false), 50); }
    });

    // === Supabase Flight Exam DB Preview ===
    document.addEventListener('click', e=>{
      const btn = e.target.closest('.admin-tab-btn[data-admin-tab="flightexam"]');
      if(btn){ setTimeout(()=> loadFlightExamDbPreview(false), 50); }
    });

    // === Admin Users Tab ===
    document.addEventListener('click', e=>{
      const btn = e.target.closest('.admin-tab-btn[data-admin-tab="users"]');
      if(btn && typeof window.refreshExamUsersList==='function'){
        setTimeout(()=> window.refreshExamUsersList(), 50);
      }
    });

    // === כפתור הוספת חלק חדש ישירות ל-Supabase ===
    document.addEventListener('click', e=>{
      const btn = e.target.closest('#btnAddNewFlightPartToDb');
      if(btn){
        openAddNewFlightPartModal();
      }
    });

    function openAddNewFlightPartModal(){
      if(!window.supabaseClient){
        alert('❌ Supabase לא מאותחל - לא ניתן להוסיף חלקים');
        return;
      }

      const modal = document.createElement('div');
      modal.id = 'add-flight-part-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;animation:fadeIn 0.2s ease;';
      
      const box = document.createElement('div');
      box.style.cssText = 'background:var(--bg-primary);border-radius:16px;padding:28px;max-width:1000px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 80px rgba(0,0,0,0.7);animation:zoomIn 0.3s ease;';
      
      let pathImgData = null;
      let testImgData = null;
      let pathPoints = [];
      
      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid var(--border-color);">
          <h2 style="margin:0;font-size:1.6rem;color:var(--accent-primary);font-weight:700;display:flex;align-items:center;gap:12px;">
            ✈️ הוסף חלק מבחן טיסה חדש
          </h2>
          <button id="closeAddModal" style="background:transparent;border:none;font-size:2.5rem;color:var(--text-secondary);cursor:pointer;padding:0;line-height:1;transition:color 0.2s;" 
            onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-secondary)'">×</button>
        </div>
        
        <div style="display:grid;gap:24px;">
          <!-- שם החלק -->
          <div style="background:var(--bg-secondary);padding:18px;border-radius:12px;border:2px solid var(--border-color);">
            <label style="display:block;font-weight:700;margin-bottom:10px;font-size:1rem;color:var(--text-primary);">📝 שם החלק</label>
            <input type="text" id="newPartName" placeholder="לדוגמה: חלק 1 - מסלול פשוט" 
              style="width:100%;padding:14px;border:2px solid var(--border-color);border-radius:10px;font-size:1rem;background:var(--bg-primary);color:var(--text-primary);">
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:6px;">💡 בחר שם תיאורי שיעזור לזהות את החלק</div>
          </div>
          
          <!-- תמונות -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <!-- תמונת מסלול -->
            <div style="background:var(--bg-secondary);padding:18px;border-radius:12px;border:2px solid var(--border-color);">
              <label style="font-weight:700;font-size:1rem;display:block;margin-bottom:12px;color:var(--text-primary);">🗺️ תמונת מסלול</label>
              <div id="pathPreviewAdd" style="position:relative;height:220px;border:3px dashed var(--border-color);border-radius:12px;overflow:hidden;background:#0f172a;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">
                <div style="text-align:center;color:var(--text-secondary);">
                  <div style="font-size:3rem;margin-bottom:10px;">📷</div>
                  <div style="font-size:0.9rem;">לחץ למטה להעלאת תמונה</div>
                </div>
              </div>
              <button id="selectPathBtn" style="width:100%;margin-top:12px;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:0.95rem;font-weight:600;transition:background 0.2s;"
                onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">📁 בחר תמונת מסלול</button>
              <input type="file" id="pathFileInputAdd" accept="image/*" style="display:none;">
              <div id="pathStatus" style="margin-top:8px;font-size:0.75rem;color:var(--text-secondary);text-align:center;"></div>
            </div>
            
            <!-- תמונת מבחן -->
            <div style="background:var(--bg-secondary);padding:18px;border-radius:12px;border:2px solid var(--border-color);">
              <label style="font-weight:700;font-size:1rem;display:block;margin-bottom:12px;color:var(--text-primary);">🎯 תמונת מבחן</label>
              <div id="testPreviewAdd" style="position:relative;height:220px;border:3px dashed var(--border-color);border-radius:12px;overflow:hidden;background:#0f172a;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">
                <div style="text-align:center;color:var(--text-secondary);">
                  <div style="font-size:3rem;margin-bottom:10px;">📷</div>
                  <div style="font-size:0.9rem;">לחץ למטה להעלאת תמונה</div>
                </div>
              </div>
              <button id="selectTestBtn" style="width:100%;margin-top:12px;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:0.95rem;font-weight:600;transition:background 0.2s;"
                onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">📁 בחר תמונת מבחן</button>
              <input type="file" id="testFileInputAdd" accept="image/*" style="display:none;">
              <div id="testStatus" style="margin-top:8px;font-size:0.75rem;color:var(--text-secondary);text-align:center;"></div>
            </div>
          </div>

          <!-- מידע על נקודות מסלול -->
          <div style="background:#1e293b;padding:16px;border-radius:10px;border:2px solid #334155;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:1.2rem;">📍</span>
              <span style="font-weight:600;color:var(--text-primary);">נקודות מסלול</span>
              <span id="pointsCount" style="margin-right:auto;color:#10b981;font-weight:700;">0 נקודות</span>
            </div>
            <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.6;">
              💡 לאחר העלאת תמונת המסלול, תוכל להגדיר נקודות מסלול באמצעות העורך הגרפי. 
              ניתן להוסיף נקודות גם אחרי יצירת החלק.
            </div>
          </div>
          
          <!-- כפתורי פעולה -->
          <div style="display:flex;gap:14px;margin-top:20px;padding-top:24px;border-top:3px solid var(--border-color);">
            <button id="saveNewPartBtn" style="flex:1;padding:16px;background:#10b981;color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:1.1rem;font-weight:700;transition:all 0.2s;box-shadow:0 4px 12px rgba(16,185,129,0.3);"
              onmouseover="this.style.background='#059669';this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(16,185,129,0.4)'" 
              onmouseout="this.style.background='#10b981';this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(16,185,129,0.3)'">
              💾 העלה והוסף לבסיס
            </button>
            <button id="cancelAddBtn" style="flex:0.5;padding:16px;background:var(--bg-tertiary);color:var(--text-primary);border:2px solid var(--border-color);border-radius:12px;cursor:pointer;font-size:1rem;font-weight:600;transition:all 0.2s;"
              onmouseover="this.style.borderColor='var(--accent-primary)'" onmouseout="this.style.borderColor='var(--border-color)'">
              ביטול
            </button>
          </div>
        </div>
      `;
      
      modal.appendChild(box);
      document.body.appendChild(modal);
      
      // Event handlers
      const closeModal = () => {
        modal.style.animation = 'fadeOut 0.15s ease';
        setTimeout(() => modal.remove(), 150);
      };
      
      document.getElementById('closeAddModal').onclick = closeModal;
      document.getElementById('cancelAddBtn').onclick = closeModal;
      
      // בחירת תמונת מסלול
      document.getElementById('selectPathBtn').onclick = () => {
        document.getElementById('pathFileInputAdd').click();
      };
      
      document.getElementById('pathFileInputAdd').onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if(!file) return;
        
        document.getElementById('pathStatus').textContent = '⏳ טוען תמונה...';
        
        const reader = new FileReader();
        reader.onload = (ev) => {
          pathImgData = ev.target.result;
          const preview = document.getElementById('pathPreviewAdd');
          const img = new Image();
          img.onload = () => {
            preview.style.borderColor = '#10b981';
            preview.innerHTML = `
              <img src="${pathImgData}" style="width:100%;height:100%;object-fit:cover;">
              <div style="position:absolute;bottom:6px;left:6px;right:6px;background:rgba(0,0,0,0.85);color:#fff;font-size:0.8rem;padding:6px 10px;border-radius:8px;text-align:center;font-weight:600;">
                ${img.width} × ${img.height} px
              </div>
            `;
            document.getElementById('pathStatus').innerHTML = '<span style="color:#10b981;">✅ תמונה נטענה</span>';
          };
          img.onerror = () => {
            document.getElementById('pathStatus').innerHTML = '<span style="color:#ef4444;">❌ שגיאה בטעינה</span>';
          };
          img.src = pathImgData;
        };
        reader.onerror = () => {
          document.getElementById('pathStatus').innerHTML = '<span style="color:#ef4444;">❌ שגיאה בקריאת קובץ</span>';
        };
        reader.readAsDataURL(file);
      };
      
      // בחירת תמונת מבחן
      document.getElementById('selectTestBtn').onclick = () => {
        document.getElementById('testFileInputAdd').click();
      };
      
      document.getElementById('testFileInputAdd').onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if(!file) return;
        
        document.getElementById('testStatus').textContent = '⏳ טוען תמונה...';
        
        const reader = new FileReader();
        reader.onload = (ev) => {
          testImgData = ev.target.result;
          const preview = document.getElementById('testPreviewAdd');
          const img = new Image();
          img.onload = () => {
            preview.style.borderColor = '#10b981';
            preview.innerHTML = `
              <img src="${testImgData}" style="width:100%;height:100%;object-fit:cover;">
              <div style="position:absolute;bottom:6px;left:6px;right:6px;background:rgba(0,0,0,0.85);color:#fff;font-size:0.8rem;padding:6px 10px;border-radius:8px;text-align:center;font-weight:600;">
                ${img.width} × ${img.height} px
              </div>
            `;
            document.getElementById('testStatus').innerHTML = '<span style="color:#10b981;">✅ תמונה נטענה</span>';
          };
          img.onerror = () => {
            document.getElementById('testStatus').innerHTML = '<span style="color:#ef4444;">❌ שגיאה בטעינה</span>';
          };
          img.src = testImgData;
        };
        reader.onerror = () => {
          document.getElementById('testStatus').innerHTML = '<span style="color:#ef4444;">❌ שגיאה בקריאת קובץ</span>';
        };
        reader.readAsDataURL(file);
      };
      
      // שמירה והעלאה
      document.getElementById('saveNewPartBtn').onclick = async () => {
        const name = document.getElementById('newPartName').value.trim();
        
        // ולידציה
        if(!name){
          alert('❌ יש להזין שם לחלק');
          document.getElementById('newPartName').focus();
          return;
        }
        
        if(!pathImgData){
          alert('❌ יש להעלות תמונת מסלול');
          return;
        }
        
        if(!testImgData){
          alert('❌ יש להעלות תמונת מבחן');
          return;
        }
        
        // בדיקת התאמת גדלים
        const pathImg = new Image();
        const testImg = new Image();
        
        await new Promise(resolve => {
          pathImg.onload = () => {
            testImg.onload = () => {
              if(pathImg.width !== testImg.width || pathImg.height !== testImg.height){
                alert(`❌ גדלי התמונות לא תואמים!\n\nמסלול: ${pathImg.width}×${pathImg.height}\nמבחן: ${testImg.width}×${testImg.height}\n\nשתי התמונות חייבות להיות באותו גודל בדיוק.`);
                resolve(false);
              } else {
                resolve(true);
              }
            };
            testImg.src = testImgData;
          };
          pathImg.src = pathImgData;
        }).then(async (isValid) => {
          if(!isValid) return;
          
          // העלאה
          try {
            const btn = document.getElementById('saveNewPartBtn');
            btn.disabled = true;
            btn.innerHTML = '⏳ מעלה ושומר...';
            
            if(!window.flightExamSync || !window.flightExamSync.uploadNewPart){
              throw new Error('מודול הסנכרון לא זמין');
            }
            
            await window.flightExamSync.uploadNewPart({
              name: name,
              pathImg: pathImgData,
              testImg: testImgData,
              pathPoints: pathPoints
            });
            
            closeModal();
            
            // רענון התצוגה
            if(window.loadFlightExamDbPreview){
              setTimeout(() => window.loadFlightExamDbPreview(true), 300);
            }
            
          } catch(e){
            console.error('[add-flight-part] error', e);
            alert('❌ שגיאה בהעלאה: ' + e.message);
            const btn = document.getElementById('saveNewPartBtn');
            btn.disabled = false;
            btn.innerHTML = '💾 העלה והוסף לבסיס';
          }
        });
      };
      
      // סגירה על ESC
      const escHandler = (e) => {
        if(e.key === 'Escape'){
          closeModal();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    }

    // אם כבר אותחל הממשק ו-Supabase קיים נטען מיד (למקרה שהטאב פעיל כברירת מחדל)
    if(window.supabaseClient){ 
      setTimeout(()=>{ 
        const orientTab=document.querySelector('.admin-tab-btn[data-admin-tab="orientation"]'); 
        if(orientTab && orientTab.classList.contains('active')) loadOrientationDbPreview(false); 
        const flightTab=document.querySelector('.admin-tab-btn[data-admin-tab="flightexam"]'); 
        if(flightTab && flightTab.classList.contains('active')) loadFlightExamDbPreview(false); 
      },400); 
    }

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
    scheduleHydrateFromSupabase(5);
  })();
