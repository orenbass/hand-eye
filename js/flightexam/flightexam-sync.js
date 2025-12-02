// flight-exam-sync.js
// סנכרון חלקי מבחן הטיסה מול דלי Supabase - SERVER ONLY
(function(){
  const BUCKET = 'flightexam';
  if(!window.supabaseClient){ console.error('[flight-sync] Supabase client missing - cannot proceed'); }

  function markPracticePart(parts){
    if(!Array.isArray(parts)) return [];
    parts.forEach((part, idx)=>{
      if(!part) return;
      const isPractice = idx === 0;
      part.isPractice = isPractice;
      part.partType = isPractice? 'practice':'exam';
    });
    return parts;
  }

  const api = {
    loading:false,
    lastLoadCount:0,
    async loadFromDb(cacheBust){
      if(!window.supabaseClient){ 
        throw new Error('Supabase לא מאותחל - לא ניתן לטעון תמונות מבחן');
      }
      if(api.loading) return;
      api.loading=true;
      try {
        const { data, error } = await window.supabaseClient
          .from('flight_exam_parts')
          .select('part_number,name,path_img_path,test_img_path,path_img_w,path_img_h,test_img_w,test_img_h,path_points')
          .order('part_number',{ascending:true});
        if(error){ throw new Error('שגיאה בטעינת חלקי מבחן הטיסה: ' + error.message); }
        if(!data || !data.length){
          throw new Error('לא נמצאו חלקי מבחן טיסה בשרת.');
        }
        const bucketRef = window.supabaseClient.storage.from(BUCKET);
        const parts = data.map(r=>{
          const pathPublicRaw = bucketRef.getPublicUrl(r.path_img_path).data.publicUrl;
          const testPublicRaw = bucketRef.getPublicUrl(r.test_img_path).data.publicUrl;
          const bust = cacheBust? ('?v=' + Date.now()) : '';
          const pathPublic = pathPublicRaw + bust;
          const testPublic = testPublicRaw + bust;
          return {
            id:'db_'+r.part_number,
            partNumber: r.part_number,
            name:r.name || ('חלק '+r.part_number),
            pathImg:pathPublic,
            testImg:testPublic,
            pathW:r.path_img_w||0,
            pathH:r.path_img_h||0,
            testW:r.test_img_w||0,
            testH:r.test_img_h||0,
            pathPoints:Array.isArray(r.path_points)? r.path_points : (r.path_points || [])
          };
        });
        // שמירה ל-localStorage
        const normalized = markPracticePart(parts.slice());
        const current = {parts: normalized};
        localStorage.setItem('app.flightexam.parts', JSON.stringify(current));
        api.lastLoadCount = normalized.length;
        console.log('[flight-sync] loaded parts from DB:', normalized.length);
        if(window.renderNewExamParts) window.renderNewExamParts();
        return normalized;
      } catch(e){
        console.error('[flight-sync] load error', e);
        throw e;
      } finally { 
        api.loading=false; 
      }
    },
    async uploadNewPart(part){
      if(!window.supabaseClient){ throw new Error('Supabase לא מאותחל'); }
      if(!part || !part.pathImg || !part.testImg){ throw new Error('צריך גם pathImg וגם testImg'); }
      try {
        const { data:maxData, error:maxErr } = await window.supabaseClient
          .from('flight_exam_parts')
          .select('part_number')
          .order('part_number',{ascending:false})
          .limit(1);
        if(maxErr){ throw new Error(maxErr.message); }
        const nextNum = (maxData && maxData.length? maxData[0].part_number: 0) + 1;
        const pathExt = guessExt(part.pathImg) || 'jpeg';
        const testExt = guessExt(part.testImg) || 'jpeg';
        const pathStorage = `${nextNum}/${nextNum}-path.${pathExt}`;
        const testStorage = `${nextNum}/${nextNum}-test.${testExt}`;
        const okPath = await uploadDataUrl(pathStorage, part.pathImg);
        const okTest = await uploadDataUrl(testStorage, part.testImg);
        if(!okPath || !okTest){ throw new Error('העלאת קבצים נכשלה'); }
        const dimsPath = await getDimensions(part.pathImg);
        const dimsTest = await getDimensions(part.testImg);
        const row = {
          part_number: nextNum,
          name: part.name || ('חלק '+nextNum),
          path_img_path: pathStorage,
          test_img_path: testStorage,
          path_img_w: dimsPath.w,
          path_img_h: dimsPath.h,
          test_img_w: dimsTest.w,
          test_img_h: dimsTest.h,
          path_points: Array.isArray(part.pathPoints)? part.pathPoints : []
        };
        const { error:insErr } = await window.supabaseClient.from('flight_exam_parts').insert(row);
        if(insErr){ throw new Error(insErr.message); }
        console.log('[flight-sync] uploaded new part', nextNum);
        await api.loadFromDb();
        alert('✓ חלק '+nextNum+' הועלה ונשמר');
      } catch(e){ console.error('[flight-sync] upload error', e); throw e; }
    },
    async editPart(partNumber){
      if(!window.supabaseClient){ throw new Error('Supabase לא מאותחל'); }
      const num = parseInt(partNumber);
      if(isNaN(num)){ throw new Error('מספר לא תקין'); }
      
      try {
        // שליפת החלק הקיים
        const { data, error } = await window.supabaseClient
          .from('flight_exam_parts')
          .select('*')
          .eq('part_number', num)
          .limit(1);
        
        if(error){ throw new Error(error.message); }
        if(!data || !data.length){ throw new Error('חלק לא נמצא'); }
        
        const part = data[0];
        const bucketRef = window.supabaseClient.storage.from(BUCKET);
        const pathUrl = bucketRef.getPublicUrl(part.path_img_path).data.publicUrl;
        const testUrl = bucketRef.getPublicUrl(part.test_img_path).data.publicUrl;
        
        // פתיחת מודאל עריכה
        openEditModal({
          partNumber: part.part_number,
          name: part.name,
          pathImg: pathUrl,
          testImg: testUrl,
          pathW: part.path_img_w,
          pathH: part.path_img_h,
          testW: part.test_img_w,
          testH: part.test_img_h,
          pathPoints: part.path_points || [],
          pathImgPath: part.path_img_path,
          testImgPath: part.test_img_path
        });
      } catch(e){ 
        console.error('[flight-sync] edit error', e); 
        alert('❌ שגיאה בטעינת חלק לעריכה: ' + e.message);
      }
    },
    async updatePart(partNumber, updates){
      if(!window.supabaseClient){ throw new Error('Supabase לא מאותחל'); }
      
      try {
        const updateData = {};
        
        // עדכון שם
        if(updates.name !== undefined){
          updateData.name = updates.name;
        }
        
        // עדכון תמונת מסלול אם שונתה
        if(updates.newPathImg && updates.newPathImg.startsWith('data:')){
          const pathExt = guessExt(updates.newPathImg) || 'jpeg';
          const pathStorage = `${partNumber}/${partNumber}-path.${pathExt}`;
          
          // מחיקת הקובץ הישן
          if(updates.oldPathImgPath){
            await window.supabaseClient.storage.from(BUCKET).remove([updates.oldPathImgPath]);
          }
          
          // העלאת הקובץ החדש
          const okPath = await uploadDataUrl(pathStorage, updates.newPathImg);
          if(!okPath){ throw new Error('העלאת תמונת מסלול נכשלה'); }
          
          const dimsPath = await getDimensions(updates.newPathImg);
          updateData.path_img_path = pathStorage;
          updateData.path_img_w = dimsPath.w;
          updateData.path_img_h = dimsPath.h;
        }
        
        // עדכון תמונת מבחן אם שונתה
        if(updates.newTestImg && updates.newTestImg.startsWith('data:')){
          const testExt = guessExt(updates.newTestImg) || 'jpeg';
          const testStorage = `${partNumber}/${partNumber}-test.${testExt}`;
          
          // מחיקת הקובץ הישן
          if(updates.oldTestImgPath){
            await window.supabaseClient.storage.from(BUCKET).remove([updates.oldTestImgPath]);
          }
          
          // העלאת הקובץ החדש
          const okTest = await uploadDataUrl(testStorage, updates.newTestImg);
          if(!okTest){ throw new Error('העלאת תמונת מבחן נכשלה'); }
          
          const dimsTest = await getDimensions(updates.newTestImg);
          updateData.test_img_path = testStorage;
          updateData.test_img_w = dimsTest.w;
          updateData.test_img_h = dimsTest.h;
        }
        
        // עדכון נקודות מסלול
        if(updates.pathPoints !== undefined){
          updateData.path_points = updates.pathPoints;
        }
        
        // ביצוע העדכון
        const { error } = await window.supabaseClient
          .from('flight_exam_parts')
          .update(updateData)
          .eq('part_number', partNumber);
        
        if(error){ throw new Error(error.message); }
        
        console.log('[flight-sync] updated part', partNumber);
        await api.loadFromDb(true);
        alert('✓ חלק '+partNumber+' עודכן בהצלחה');
      } catch(e){ 
        console.error('[flight-sync] update error', e); 
        throw e; 
      }
    },
    async deletePart(partNumber){
      if(!window.supabaseClient){ throw new Error('Supabase לא מאותחל'); }
      const num = parseInt(partNumber);
      if(isNaN(num)){ throw new Error('מספר לא תקין'); }
      if(!confirm('למחוק חלק '+num+' (קבצים + רשומה)?')) return;
      try {
        const { data, error } = await window.supabaseClient
          .from('flight_exam_parts')
          .select('path_img_path,test_img_path')
          .eq('part_number', num)
          .limit(1);
        if(error){ throw new Error(error.message); }
        const paths = [];
        if(data && data.length){
          if(data[0].path_img_path) paths.push(data[0].path_img_path);
          if(data[0].test_img_path) paths.push(data[0].test_img_path);
        }
        const { error:delErr } = await window.supabaseClient
          .from('flight_exam_parts')
          .delete()
          .eq('part_number', num);
        if(delErr){ throw new Error(delErr.message); }
        if(paths.length){
          const { error:remErr } = await window.supabaseClient.storage.from(BUCKET).remove(paths);
          if(remErr){ console.warn('[flight-sync] file removal warning', remErr); }
        }
        console.log('[flight-sync] deleted part', num);
        await api.loadFromDb();
        alert('✓ חלק '+num+' נמחק');
      } catch(e){ console.error('[flight-sync] delete error', e); throw e; }
    },
    async updatePartPoints(partNumber, points){
      if(!window.supabaseClient){ return; }
      try {
        await window.supabaseClient
          .from('flight_exam_parts')
          .update({ path_points: points })
          .eq('part_number', partNumber);
        console.log('[flight-sync] updated path_points for part', partNumber, points.length);
      } catch(e){ console.warn('[flight-sync] updatePartPoints error', e); }
    }
  };

  async function uploadDataUrl(path, dataUrl){
    try {
      let blob;
      if(dataUrl && dataUrl.startsWith('data:')){
        blob = dataUrlToBlob(dataUrl);
      } else if(dataUrl){
        try {
          const resp = await fetch(dataUrl, {cache:'no-store'});
          if(!resp.ok) throw new Error('fetch failed '+resp.status);
          blob = await resp.blob();
          console.log('[flight-sync] fetched remote URL as blob', path, blob.type, blob.size);
        } catch(e){
          console.warn('[flight-sync] remote fetch failed for', path, e.message);
          return false;
        }
      } else {
        console.warn('[flight-sync] empty dataUrl for', path);
        return false;
      }
      if(!blob){ console.warn('[flight-sync] no blob produced for', path); return false; }
      const { error } = await window.supabaseClient.storage.from(BUCKET).upload(path, blob, { contentType: blob.type||'image/jpeg', upsert:false });
      if(error){ console.error('[flight-sync] upload error', path, error.message); return false; }
      return true;
    } catch(e){ console.error('[flight-sync] upload exception', e); return false; }
  }
  function guessExt(dataUrl){
    if(!dataUrl.startsWith('data:')) return null;
    if(dataUrl.includes('image/png')) return 'png';
    if(dataUrl.includes('image/webp')) return 'webp';
    if(dataUrl.includes('image/gif')) return 'gif';
    return 'jpeg';
  }
  function dataUrlToBlob(dataUrl){
    try {
      const arr=dataUrl.split(',');
      if(arr.length<2){ console.warn('[flight-sync] invalid dataURL (no comma)', dataUrl.slice(0,40)+'...'); return null; }
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch? mimeMatch[1]: 'image/jpeg';
      const bstr=atob(arr[1]);
      let n=bstr.length; const u8=new Uint8Array(n);
      while(n--) u8[n]=bstr.charCodeAt(n);
      return new Blob([u8],{type:mime});
    } catch(err){ console.warn('[flight-sync] dataUrlToBlob failed', err); return null; }
  }
  function getDimensions(dataUrl){
    return new Promise(res=>{
      const im=new Image();
      im.onload=()=> res({w:im.width,h:im.height});
      im.onerror=()=> res({w:0,h:0});
      im.src=dataUrl;
    });
  }

  function openEditModal(part){
    // יצירת מודאל עריכה
    const modal = document.createElement('div');
    modal.id = 'flight-edit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-primary);border-radius:16px;padding:24px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);';
    
    let newPathImg = null;
    let newTestImg = null;
    
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--border-color);">
        <h2 style="margin:0;font-size:1.4rem;color:var(--accent-primary);">✏️ עריכת חלק מבחן טיסה #${part.partNumber}</h2>
        <button id="closeEditModal" style="background:transparent;border:none;font-size:2rem;color:var(--text-secondary);cursor:pointer;padding:0;line-height:1;">×</button>
      </div>
      
      <div style="display:grid;gap:20px;">
        <!-- שם החלק -->
        <div>
          <label style="display:block;font-weight:600;margin-bottom:8px;font-size:0.95rem;">שם החלק</label>
          <input type="text" id="editPartName" value="${part.name}" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:8px;font-size:1rem;">
        </div>
        
        <!-- תמונות -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <!-- תמונת מסלול -->
          <div style="display:flex;flex-direction:column;gap:10px;">
            <label style="font-weight:600;font-size:0.95rem;">תמונת מסלול</label>
            <div id="pathPreview" style="position:relative;height:200px;border:2px solid var(--border-color);border-radius:12px;overflow:hidden;background:#0f172a;">
              <img src="${part.pathImg}" style="width:100%;height:100%;object-fit:cover;">
              <div style="position:absolute;bottom:4px;left:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.75rem;padding:4px 8px;border-radius:6px;text-align:center;">${part.pathW}×${part.pathH}</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button id="changePathBtn" style="flex:1;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">📷 החלף תמונה</button>
              <button id="editPathPointsBtn" style="flex:1;padding:10px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">📍 ערוך נקודות (${part.pathPoints.length})</button>
            </div>
            <input type="file" id="pathFileInput" accept="image/*" style="display:none;">
          </div>
          
          <!-- תמונת מבחן -->
          <div style="display:flex;flex-direction:column;gap:10px;">
            <label style="font-weight:600;font-size:0.95rem;">תמונת מבחן</label>
            <div id="testPreview" style="position:relative;height:200px;border:2px solid var(--border-color);border-radius:12px;overflow:hidden;background:#0f172a;">
              <img src="${part.testImg}" style="width:100%;height:100%;object-fit:cover;">
              <div style="position:absolute;bottom:4px;left:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.75rem;padding:4px 8px;border-radius:6px;text-align:center;">${part.testW}×${part.testH}</div>
            </div>
            <button id="changeTestBtn" style="padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">📷 החלף תמונה</button>
            <input type="file" id="testFileInput" accept="image/*" style="display:none;">
          </div>
        </div>
        
        <!-- כפתורי פעולה -->
        <div style="display:flex;gap:12px;margin-top:16px;padding-top:16px;border-top:2px solid var(--border-color);">
          <button id="saveEditBtn" style="flex:1;padding:14px;background:#10b981;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1rem;font-weight:600;">💾 שמור שינויים</button>
          <button id="cancelEditBtn" style="flex:1;padding:14px;background:var(--bg-tertiary);color:var(--text-primary);border:2px solid var(--border-color);border-radius:10px;cursor:pointer;font-size:1rem;">ביטול</button>
        </div>
      </div>
    `;
    
    modal.appendChild(box);
    document.body.appendChild(modal);
    
    // Event handlers
    const closeModal = () => modal.remove();
    
    document.getElementById('closeEditModal').onclick = closeModal;
    document.getElementById('cancelEditBtn').onclick = closeModal;
    
    // החלפת תמונת מסלול
    document.getElementById('changePathBtn').onclick = () => {
      document.getElementById('pathFileInput').click();
    };
    
    document.getElementById('pathFileInput').onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      
      const reader = new FileReader();
      reader.onload = (ev) => {
        newPathImg = ev.target.result;
        const preview = document.getElementById('pathPreview');
        const img = new Image();
        img.onload = () => {
          preview.innerHTML = `
            <img src="${newPathImg}" style="width:100%;height:100%;object-fit:cover;">
            <div style="position:absolute;bottom:4px;left:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.75rem;padding:4px 8px;border-radius:6px;text-align:center;">${img.width}×${img.height} (חדש)</div>
          `;
        };
        img.src = newPathImg;
      };
      reader.readAsDataURL(file);
    };
    
    // החלפת תמונת מבחן
    document.getElementById('changeTestBtn').onclick = () => {
      document.getElementById('testFileInput').click();
    };
    
    document.getElementById('testFileInput').onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      
      const reader = new FileReader();
      reader.onload = (ev) => {
        newTestImg = ev.target.result;
        const preview = document.getElementById('testPreview');
        const img = new Image();
        img.onload = () => {
          preview.innerHTML = `
            <img src="${newTestImg}" style="width:100%;height:100%;object-fit:cover;">
            <div style="position:absolute;bottom:4px;left:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.75rem;padding:4px 8px;border-radius:6px;text-align:center;">${img.width}×${img.height} (חדש)</div>
          `;
        };
        img.src = newTestImg;
      };
      reader.readAsDataURL(file);
    };
    
    // עריכת נקודות מסלול
    document.getElementById('editPathPointsBtn').onclick = () => {
      closeModal();
      if(typeof window.openFlightPathEditor === 'function'){
        window.openFlightPathEditor(part);
        return;
      }
      invokeFlightPathEditor(part, true);
    };
    
    // שמירת שינויים
    document.getElementById('saveEditBtn').onclick = async () => {
      const newName = document.getElementById('editPartName').value.trim();
      
      if(!newName){
        alert('יש להזין שם לחלק');
        return;
      }
      
      const updates = {
        name: newName,
        oldPathImgPath: part.pathImgPath,
        oldTestImgPath: part.testImgPath
      };
      
      if(newPathImg){
        updates.newPathImg = newPathImg;
      }
      
      if(newTestImg){
        updates.newTestImg = newTestImg;
      }
      
      try {
        document.getElementById('saveEditBtn').disabled = true;
        document.getElementById('saveEditBtn').textContent = '⏳ שומר...';
        
        await api.updatePart(part.partNumber, updates);
        closeModal();
      } catch(e){
        alert('❌ שגיאה בשמירה: ' + e.message);
        document.getElementById('saveEditBtn').disabled = false;
        document.getElementById('saveEditBtn').textContent = '💾 שמור שינויים';
      }
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

  document.addEventListener('click', e=>{
    const btn=e.target.closest('.admin-tab-btn[data-admin-tab="flightexam"]');
    if(btn){ setTimeout(()=> api.loadFromDb().catch(err => alert('❌ '+err.message)), 150); }
  });
  setTimeout(()=>{
    const activeTab=document.querySelector('.admin-tab-btn.active[data-admin-tab="flightexam"]');
    if(activeTab) api.loadFromDb().catch(err => console.error('[flight-sync]', err));
  },600);

  function invokeFlightPathEditor(part, showAlertIfMissing){
    const tryLaunch = () => {
      if(typeof window.openNewExamPathEditor === 'function'){
        window.openNewExamPathEditor(part, {
          onSave: (points)=>{
            if(typeof api.updatePartPoints === 'function' && part.partNumber){
              return api.updatePartPoints(part.partNumber, points).then(()=>{
                if(typeof window.refreshFlightExamPartsFromDb === 'function'){
                  return window.refreshFlightExamPartsFromDb();
                }
              });
            }
            return Promise.resolve();
          },
          onAfterSave: ()=>{
            if(typeof window.loadFlightExamDbPreview === 'function'){
              window.loadFlightExamDbPreview(true);
            }
          },
          successMessage: '✓ עודכנו נקודות המסלול בשרת'
        });
        return true;
      }
      return false;
    };

    if(tryLaunch()) return;

    const waitForSettings = window.settingsReady && typeof window.settingsReady.then === 'function'
      ? window.settingsReady
      : null;

    if(waitForSettings){
      waitForSettings.then(()=>{
        if(!tryLaunch() && showAlertIfMissing){
          alert('עורך הנקודות לא זמין');
        }
      }).catch(()=>{
        if(showAlertIfMissing){ alert('עורך הנקודות לא זמין'); }
      });
      return;
    }

    if(showAlertIfMissing){
      alert('עורך הנקודות לא זמין');
    }
  }

  if(typeof window.openFlightPathEditor !== 'function'){
    window.openFlightPathEditor = (part)=> invokeFlightPathEditor(part, true);
  }

  window.flightExamSync = api;
  window.refreshFlightExamPartsFromDb = function(){ return api.loadFromDb(true); };
  
  // פונקציה לקבלת חלקים מה-localStorage
  window.getFlightExamParts = function() {
    try {
      const stored = localStorage.getItem('app.flightexam.parts');
      if (!stored) {
        console.warn('[flight-sync] No parts in localStorage');
        return [];
      }
      const parsed = JSON.parse(stored);
      return markPracticePart((parsed.parts || []).slice());
    } catch (e) {
      console.error('[flight-sync] Error reading parts from localStorage', e);
      return [];
    }
  };
})();