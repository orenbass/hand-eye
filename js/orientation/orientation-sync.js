// orientation-sync.js
// סנכרון קבוצות מבחן התמצאות מול Supabase Storage + DB
(function(){
  if(!window.supabaseClient){ console.warn('[orientation-sync] Supabase client missing'); }
  const BUCKET = 'orientation';
  const ORIENTATION_CODES = ['N2S','S2N','E2W','W2E'];
  const ORIENTATION_LABELS = {
    N2S: 'מצפון לדרום',
    S2N: 'מדרום לצפון',
    E2W: 'ממזרח למערב',
    W2E: 'ממערב למזרח'
  };

  // אובייקט גלובלי לחשיפה
  const api = {
    syncing: false,
    lastResult: null,
    // סנכרון קבוצות חדשות: מעלה תמונות שאינן כבר בדלי ויוצר רשומות
    async syncNewSets(questionSets){
      if(!window.supabaseClient){ alert('Supabase לא מאותחל'); return; }
      if(api.syncing){ alert('סנכרון כבר רץ...'); return; }
      api.syncing = true;
      try {
        // שליפת כל התיקיות הקיימות בדלי כדי לקבוע מספר קבוצות חדש
        const { data: rootList, error: rootErr } = await window.supabaseClient.storage.from(BUCKET).list('', { limit: 200 });
        if(rootErr){ throw new Error('שגיאה בשליפת תיקיות קיימות: '+rootErr.message); }
        const existingNums = (rootList||[])
          .filter(i=> !i.id && /^\d+$/.test(i.name))
          .map(i=> parseInt(i.name, 10));
        const usedNumbers = new Set(existingNums);
        const allocatedNumbers = new Set();

        const pickNextNumber = ()=>{
          let candidate = 1;
          while(usedNumbers.has(candidate) || allocatedNumbers.has(candidate)){ candidate++; }
          allocatedNumbers.add(candidate);
          return candidate;
        };

        // שליפת רשומות DB כדי להימנע מהעלאה כפולה של מה שכבר הוזן
        const { data: rows, error: rowsErr } = await window.supabaseClient
          .from('orientation_images')
          .select('storage_path,test_number');
        if(rowsErr){ throw new Error('שגיאת DB בשליפה: '+rowsErr.message); }
        const existingPaths = new Set();
        if(Array.isArray(rows)){
          for(const r of rows){
            if(r && r.storage_path){ existingPaths.add(r.storage_path); }
            if(r && typeof r.test_number==='number' && !Number.isNaN(r.test_number)){ usedNumbers.add(r.test_number); }
          }
        }

        let uploaded = 0, skipped = 0, createdRows = 0, setsProcessed=0;
        const newGroupNumbers = [];

        for(const set of questionSets){
          // heuristic: אם לקבוצה יש שדות meta שמכילים כבר נתיב storage (נזהה לפי סימן '/' ו-lowercase top) נניח שהיא קיימת
          const isAlreadyInBucket = (set.topImage && !set.topImage.startsWith('data:')) || (set.viewImages||[]).some(v=> v.url && !v.url.startsWith('data:'));
          if(isAlreadyInBucket){ skipped++; continue; }
          // אין תמונות -> דלג
          if(!set.topImage && !(set.viewImages&&set.viewImages.length)){ skipped++; continue; }

          const folderNum = pickNextNumber();
          let groupHasChanges = false;

          // העלאת top
          if(set.topImage && set.topImage.startsWith('data:')){
            const ext = guessExt(set.topImage) || 'jpeg';
            const filename = `${folderNum}/${folderNum}-top.${ext}`;
            if(!existingPaths.has(filename)){
              const ok = await uploadDataUrl(filename, set.topImage);
              if(ok){
                const insertOk = await insertRow({
                  test_number: folderNum,
                  view_type: 'top',
                  code: 'top',
                  from_dir: null,
                  to_dir: null,
                  storage_path: filename,
                  original_name: `${folderNum}-top`
                });
                if(insertOk){
                  existingPaths.add(filename);
                  usedNumbers.add(folderNum);
                  createdRows++;
                  uploaded++;
                  groupHasChanges = true;
                }
              }
            } else skipped++;
          }

          // העלאת view images
          for(const v of (set.viewImages||[])){
            if(!v.url || !v.orient) continue;
            if(!v.url.startsWith('data:')){ skipped++; continue; }
            const ext = guessExt(v.url) || 'jpeg';
            const code = v.orient.toUpperCase();
            if(!/^([NSEW]2[NSEW])$/.test(code)){ console.warn('[orientation-sync] כיוון לא תקין', code); continue; }
            const [from_dir,to_dir] = code.split('2');
            if(from_dir===to_dir){ console.warn('[orientation-sync] כיוון זהה לא חוקי', code); continue; }
            const filename = `${folderNum}/${folderNum}-${code}.${ext}`;
            if(!existingPaths.has(filename)){
              const ok = await uploadDataUrl(filename, v.url);
              if(ok){
                const insertOk = await insertRow({
                  test_number: folderNum,
                  view_type: 'orientation',
                  code,
                  from_dir,
                  to_dir,
                  storage_path: filename,
                  original_name: `${folderNum}-${code}`
                });
                if(insertOk){
                  existingPaths.add(filename);
                  usedNumbers.add(folderNum);
                  createdRows++;
                  uploaded++;
                  groupHasChanges = true;
                }
              }
            } else skipped++;
          }
          if(groupHasChanges){ newGroupNumbers.push(folderNum); }
          setsProcessed++;
        }

        api.lastResult = { uploaded, skipped, createdRows, setsProcessed, newGroupNumbers };
        const groupsMsg = newGroupNumbers.length ? `\nקבוצות חדשות: ${newGroupNumbers.join(', ')}` : '';
        alert(`✓ סנכרון הסתיים\nהועלו ${uploaded} קבצים\nנוצרו ${createdRows} רשומות DB\nדלגו על ${skipped} (כבר קיימים או לא נתונים)${groupsMsg}`);
        // רענון תצוגת DB בטאב התמצאות אם פתוח
        if(typeof window.loadOrientationDbPreview==='function'){ window.loadOrientationDbPreview(true); }
      } catch(e){
        console.error('[orientation-sync] sync error', e);
        alert('❌ שגיאה בסנכרון: '+ e.message);
      } finally {
        api.syncing = false;
      }
    },
    async editTestGroup(testNumber){
      if(!window.supabaseClient){ alert('Supabase לא מאותחל'); return; }
      const num = parseInt(testNumber);
      if(isNaN(num)){ alert('מספר מבחן לא תקין'); return; }
      
      try {
        // שליפת כל הרשומות של הקבוצה
        const { data: rows, error } = await window.supabaseClient
          .from('orientation_images')
          .select('*')
          .eq('test_number', num)
          .order('view_type', {ascending: false}); // top ראשון
        
        if(error){ throw new Error('שגיאת DB: '+error.message); }
        if(!rows || !rows.length){ throw new Error('קבוצה לא נמצאה'); }
        
        const bucketRef = window.supabaseClient.storage.from(BUCKET);
        
        // ארגון הנתונים
        let topImage = null;
        const viewImages = [];
        
        for(const row of rows){
          const publicUrl = bucketRef.getPublicUrl(row.storage_path).data.publicUrl;
          
          if(row.view_type === 'top'){
            topImage = {
              url: publicUrl,
              storagePath: row.storage_path,
              id: row.id
            };
          } else if(row.view_type === 'orientation'){
            viewImages.push({
              url: publicUrl,
              orient: row.code,
              fromDir: row.from_dir,
              toDir: row.to_dir,
              storagePath: row.storage_path,
              id: row.id
            });
          }
        }
        
        // פתיחת מודאל עריכה
        openOrientationEditModal({
          testNumber: num,
          topImage,
          viewImages
        });
      } catch(e){
        console.error('[orientation-sync] edit error', e);
        alert('❌ שגיאה בטעינת קבוצה לעריכה: '+e.message);
      }
    },
    async updateTestGroup(testNumber, updates){
      if(!window.supabaseClient){ alert('Supabase לא מאותחל'); return; }
      
      try {
        // עדכון תמונת top אם שונתה
        if(updates.newTopImage && updates.newTopImage.startsWith('data:')){
          const ext = guessExt(updates.newTopImage) || 'jpeg';
          const filename = `${testNumber}/${testNumber}-top.${ext}`;
          
          // מחיקת הקובץ הישן
          if(updates.oldTopStoragePath){
            await window.supabaseClient.storage.from(BUCKET).remove([updates.oldTopStoragePath]);
          }
          
          // העלאת הקובץ החדש
          const ok = await uploadDataUrl(filename, updates.newTopImage);
          if(!ok){ throw new Error('העלאת תמונת TOP נכשלה'); }
          
          // עדכון הרשומה
          const { error } = await window.supabaseClient
            .from('orientation_images')
            .update({ storage_path: filename })
            .eq('id', updates.topImageId);
          
          if(error){ throw new Error('עדכון רשומת TOP נכשל: '+error.message); }
        }
        
        // עדכון תמונות view שהשתנו
        if(updates.updatedViews && updates.updatedViews.length){
          for(const view of updates.updatedViews){
            if(!view.newImage || !view.newImage.startsWith('data:')) continue;
            
            const ext = guessExt(view.newImage) || 'jpeg';
            const filename = `${testNumber}/${testNumber}-${view.code}.${ext}`;
            
            // מחיקת הקובץ הישן
            if(view.oldStoragePath){
              await window.supabaseClient.storage.from(BUCKET).remove([view.oldStoragePath]);
            }
            
            // העלאת הקובץ החדש
            const ok = await uploadDataUrl(filename, view.newImage);
            if(!ok){ throw new Error('העלאת תמונה נכשלה: '+view.code); }
            
            // עדכון הרשומה
            const { error } = await window.supabaseClient
              .from('orientation_images')
              .update({ storage_path: filename })
              .eq('id', view.id);
            
            if(error){ throw new Error('עדכון רשומה נכשל: '+error.message); }
          }
        }

        if(Array.isArray(updates.removedViews) && updates.removedViews.length){
          const paths = updates.removedViews.map(v => v && v.storagePath).filter(Boolean);
          if(paths.length){
            const { error: removeErr } = await window.supabaseClient.storage.from(BUCKET).remove(paths);
            if(removeErr && !(removeErr.message && /not\s+found/i.test(removeErr.message))){
              throw new Error('מחיקת קבצי כיוון נכשלה: '+removeErr.message);
            }
          }
          const ids = updates.removedViews.map(v => v && v.id).filter(Boolean);
          if(ids.length){
            const { error: deleteErr } = await window.supabaseClient
              .from('orientation_images')
              .delete()
              .in('id', ids);
            if(deleteErr){ throw new Error('מחיקת רשומות כיוון נכשלה: '+deleteErr.message); }
          }
        }

        if(Array.isArray(updates.addedViews) && updates.addedViews.length){
          for(const view of updates.addedViews){
            if(!view || !view.code || !view.newImage || !view.newImage.startsWith('data:')) continue;
            const code = view.code.toUpperCase();
            const ext = guessExt(view.newImage) || 'jpeg';
            const filename = `${testNumber}/${testNumber}-${code}.${ext}`;
            const uploadOk = await uploadDataUrl(filename, view.newImage);
            if(!uploadOk){ throw new Error('העלאת כיוון חדש נכשלה: '+code); }
            const parts = code.split('2');
            const fromDir = parts[0] || null;
            const toDir = parts[1] || null;
            const inserted = await insertRow({
              test_number: testNumber,
              view_type: 'orientation',
              code,
              from_dir: fromDir,
              to_dir: toDir,
              storage_path: filename,
              original_name: `${testNumber}-${code}`
            });
            if(!inserted){ throw new Error('שמירת כיוון חדש נכשלה: '+code); }
          }
        }
        
        alert(`✓ קבוצה ${testNumber} עודכנה בהצלחה`);
        if(typeof window.loadOrientationDbPreview==='function'){ 
          window.loadOrientationDbPreview(true); 
        }
      } catch(e){
        console.error('[orientation-sync] update error', e);
        throw e;
      }
    },
    async deleteTestGroup(testNumber){
      if(!window.supabaseClient){ alert('Supabase לא מאותחל'); return; }
      const num = parseInt(testNumber);
      if(isNaN(num)){ alert('מספר מבחן לא תקין'); return; }
      if(!confirm(`מחיקת כל התמונות והרשומות של מבחן ${num}?`)) return;
      try {
        // שליפת כל הרשומות למבחן זה
        const { data: rows, error } = await window.supabaseClient
          .from('orientation_images')
          .select('id,storage_path')
          .eq('test_number', num);
        if(error){ throw new Error('שגיאת DB בשליפה: '+error.message); }
        // מחיקת רשומות
        if(rows && rows.length){
          const ids = rows.map(r=> r.id);
          const { error: delErr } = await window.supabaseClient
            .from('orientation_images')
            .delete()
            .in('id', ids);
          if(delErr){ throw new Error('שגיאת מחיקת רשומות: '+delErr.message); }
        }
        // מחיקת קבצים מהתיקייה (אי אפשר למחוק תיקייה ריקה ישירות; נשתמש remove עם רשימת קבצים)
        const paths = rows.map(r=> r.storage_path);
        if(paths.length){
          const { error: remErr } = await window.supabaseClient
            .storage
            .from(BUCKET)
            .remove(paths);
          if(remErr){ throw new Error('שגיאת מחיקת קבצים: '+remErr.message); }
        }
        alert(`✓ נמחק מבחן ${num} (קבצים + רשומות)`);
        if(typeof window.loadOrientationDbPreview==='function'){ window.loadOrientationDbPreview(true); }
      } catch(e){
        console.error('[orientation-sync] delete error', e);
        alert('❌ שגיאת מחיקה: '+e.message);
      }
    }
  };

  // עזר: העלאת dataURL לנתיב בדלי
  async function uploadDataUrl(path, dataUrl){
    try {
      const blob = dataUrlToBlob(dataUrl);
      const { error } = await window.supabaseClient
        .storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if(error){ console.error('[orientation-sync] upload error', path, error.message); return false; }
      return true;
    } catch(e){ console.error('[orientation-sync] upload exception', e); return false; }
  }

  function dataUrlToBlob(dataUrl){
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while(n--){ u8[n] = bstr.charCodeAt(n); }
    return new Blob([u8], { type: mime });
  }

  function guessExt(dataUrl){
    if(!dataUrl.startsWith('data:')) return null;
    if(dataUrl.includes('image/png')) return 'png';
    if(dataUrl.includes('image/webp')) return 'webp';
    if(dataUrl.includes('image/gif')) return 'gif';
    return 'jpeg';
  }

  async function insertRow(row){
    const { error } = await window.supabaseClient
      .from('orientation_images')
      .insert(row);
    if(error){ console.error('[orientation-sync] DB insert error', row.storage_path, error.message); return false; }
    return true;
  }

  // הוספת כפתור מחיקה לכרטיסי ה-DB אחרי טעינה
  function injectDeleteButtons(){}

  // האזנה לרענון התצוגה להזרקת כפתורי מחיקה
  document.addEventListener('click', e=>{
    const tabBtn = e.target.closest('.admin-tab-btn[data-admin-tab="orientation"]');
    if(tabBtn){ setTimeout(injectDeleteButtons, 500); }
  });
  window.addEventListener('settings-updated', ()=> setTimeout(injectDeleteButtons, 600));

  // חשיפה גלובלית
  window.orientationSync = api;

  function openOrientationEditModal(group){
    // יצירת מודאל עריכה
    const modal = document.createElement('div');
    modal.id = 'orientation-edit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-primary);border-radius:16px;padding:24px;max-width:1100px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);';
    
    let newTopImage = null;
    const updatedViews = [];
    const addedViews = [];
    const removedViews = [];
    const existingCodes = new Set((group.viewImages||[]).map(v=> (v.orient||'').toUpperCase()));
    
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--border-color);">
        <h2 style="margin:0;font-size:1.4rem;color:var(--accent-primary);">✏️ עריכת קבוצת התמצאות #${group.testNumber}</h2>
        <button id="closeOrientEditModal" style="background:transparent;border:none;font-size:2rem;color:var(--text-secondary);cursor:pointer;padding:0;line-height:1;">×</button>
      </div>
      
      <div style="display:grid;gap:24px;">
        <!-- תמונת TOP -->
        ${group.topImage ? `
        <div>
          <label style="display:block;font-weight:600;margin-bottom:10px;font-size:1rem;color:var(--accent-primary);">🔝 תמונת TOP</label>
          <div style="display:flex;gap:16px;align-items:center;">
            <div id="topPreview" style="position:relative;width:300px;height:200px;border:2px solid var(--border-color);border-radius:12px;overflow:hidden;background:#0f172a;flex-shrink:0;">
              <img src="${group.topImage.url}" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <button id="changeTopBtn" style="padding:12px 20px;background:#3b82f6;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:0.95rem;font-weight:600;">📷 החלף תמונה</button>
            <input type="file" id="topFileInput" accept="image/*" style="display:none;">
          </div>
        </div>
        ` : ''}
        
        <!-- תמונות View -->
        <div>
          <label style="display:block;font-weight:600;margin-bottom:12px;font-size:1rem;color:var(--accent-primary);">🧭 תמונות כיוון <span id="orientViewCountLabel">(${group.viewImages.length})</span></label>
          <div id="viewsGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));gap:16px;">
            ${group.viewImages.map((v, idx) => `
              <div class="view-card" data-view-idx="${idx}" style="border:2px solid var(--border-color);border-radius:12px;padding:12px;background:var(--bg-secondary);">
                <div style="font-weight:600;font-size:0.9rem;margin-bottom:8px;color:var(--text-primary);text-align:center;">${v.orient}</div>
                <div class="view-preview-${idx}" style="position:relative;height:140px;border:2px solid var(--border-color);border-radius:8px;overflow:hidden;background:#0f172a;margin-bottom:10px;">
                  <img src="${v.url}" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <button class="change-view-btn" data-view-idx="${idx}" style="width:100%;padding:8px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.85rem;">📷 החלף</button>
                <input type="file" class="view-file-input-${idx}" accept="image/*" style="display:none;">
                <button class="remove-view-btn" data-view-idx="${idx}" style="width:100%;margin-top:8px;padding:8px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;">🗑️ הסר כיוון</button>
              </div>
            `).join('')}
          </div>
          <div id="addOrientBlock" style="margin-top:18px;border:2px dashed var(--border-color);border-radius:12px;padding:16px;background:var(--bg-tertiary);">
            <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
              <span style="font-weight:600;color:var(--text-primary);">➕ הוסף כיוון חדש</span>
              <select id="orientAddSelect" style="min-width:160px;padding:10px;border-radius:8px;border:2px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);"></select>
              <button id="orientAddChooseBtn" style="padding:10px 18px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.85rem;">📁 בחר תמונה</button>
              <span id="orientAddHint" style="font-size:0.75rem;color:var(--text-secondary);">בחר כיוון ולאחר מכן העלה תמונה.</span>
            </div>
            <input type="file" id="orientAddFile" accept="image/*" style="display:none;">
          </div>
        </div>
        
        <!-- כפתורי פעולה -->
        <div style="display:flex;gap:12px;margin-top:8px;padding-top:20px;border-top:2px solid var(--border-color);">
          <button id="saveOrientEditBtn" style="flex:1;padding:16px;background:#10b981;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1.05rem;font-weight:600;">💾 שמור שינויים</button>
          <button id="cancelOrientEditBtn" style="flex:1;padding:16px;background:var(--bg-tertiary);color:var(--text-primary);border:2px solid var(--border-color);border-radius:10px;cursor:pointer;font-size:1.05rem;">ביטול</button>
        </div>
      </div>
    `;
    
    modal.appendChild(box);
    document.body.appendChild(modal);

    const viewsGrid = box.querySelector('#viewsGrid');
    const addSelect = box.querySelector('#orientAddSelect');
    const addFileInput = box.querySelector('#orientAddFile');
    const addBtn = box.querySelector('#orientAddChooseBtn');
    const addHint = box.querySelector('#orientAddHint');
    const viewCountLabel = box.querySelector('#orientViewCountLabel');

    function setAddHint(text, tone='muted'){
      if(!addHint) return;
      let color = '#94a3b8';
      if(tone==='error') color='#ef4444';
      else if(tone==='success') color='#10b981';
      else if(tone==='pending') color='#fbbf24';
      addHint.textContent=text;
      addHint.style.color=color;
    }

    function updateViewCount(){
      if(!viewCountLabel) return;
      const total = group.viewImages.length - removedViews.length + addedViews.length;
      viewCountLabel.textContent = `(${Math.max(0,total)})`;
    }

    function getAvailableCodes(){
      return ORIENTATION_CODES.filter(code=> !existingCodes.has(code) && !addedViews.some(v=> v.code===code));
    }

    function refreshAddOptions(){
      if(!addSelect || !addBtn) return;
      const options = getAvailableCodes();
      if(!options.length){
        addSelect.innerHTML = '<option value="">אין כיוונים זמינים</option>';
        addSelect.disabled = true;
        addBtn.disabled = true;
        setAddHint('כל הכיוונים זמינים כבר בקבוצה זו.', 'muted');
        return;
      }
      const currentValue = addSelect.value;
      addSelect.innerHTML = ['<option value="">בחר כיוון...</option>'].concat(options.map(code=>`<option value="${code}">${code} — ${ORIENTATION_LABELS[code]||code}</option>`)).join('');
      if(options.includes(currentValue)){
        addSelect.value = currentValue;
      } else {
        addSelect.value = '';
      }
      addSelect.disabled = false;
      addBtn.disabled = addSelect.value === '';
      if(addSelect.value===''){
        setAddHint('בחר כיוון ולאחר מכן העלה תמונה.', 'muted');
      }
    }

    function renderAddedViews(){
      if(!viewsGrid) return;
      viewsGrid.querySelectorAll('[data-new-view="true"]').forEach(el=> el.remove());
      addedViews.forEach((view, idx)=>{
        const card = document.createElement('div');
        card.dataset.newView = 'true';
        card.dataset.newIdx = String(idx);
        card.style.cssText='border:2px solid var(--accent-primary);border-radius:12px;padding:12px;background:var(--bg-secondary);box-shadow:0 0 0 2px rgba(16,185,129,0.4) inset;';
        card.innerHTML = `
          <div style="font-weight:700;font-size:0.9rem;margin-bottom:8px;color:var(--accent-primary);text-align:center;">${view.code} · ${ORIENTATION_LABELS[view.code]||view.code}</div>
          <div style="position:relative;height:140px;border:2px solid var(--accent-primary);border-radius:8px;overflow:hidden;background:#0f172a;margin-bottom:10px;">
            <img src="${view.newImage}" style="width:100%;height:100%;object-fit:cover;">
            <div style="position:absolute;top:4px;right:4px;background:rgba(16,185,129,0.9);color:#fff;font-size:0.65rem;padding:3px 6px;border-radius:6px;font-weight:600;">חדש</div>
          </div>
          <button class="remove-new-view-btn" data-remove-idx="${idx}" style="width:100%;padding:8px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;">🗑️ הסר כיוון</button>
        `;
        viewsGrid.appendChild(card);
      });
      viewsGrid.querySelectorAll('.remove-new-view-btn').forEach(btn=>{
        btn.onclick = ()=>{
          const removeIdx = parseInt(btn.getAttribute('data-remove-idx'), 10);
          if(!Number.isNaN(removeIdx)){
            addedViews.splice(removeIdx,1);
            renderAddedViews();
            refreshAddOptions();
            setAddHint('כיוון הוסר. ניתן לבחור כיוון אחר.', 'muted');
          }
        };
      });
      updateViewCount();
    }

    if(addSelect && addBtn){
      refreshAddOptions();
      addSelect.onchange = ()=>{
        addBtn.disabled = addSelect.value === '';
        if(addSelect.value){
          setAddHint(`בחר תמונה לכיוון ${addSelect.value}.`, 'muted');
        }
      };
      addBtn.onclick = ()=>{
        if(addBtn.disabled) return;
        addFileInput && addFileInput.click();
      };
    }

    if(addFileInput){
      addFileInput.onchange = e=>{
        const file = e.target.files && e.target.files[0];
        if(!file){ return; }
        const code = addSelect ? addSelect.value : '';
        if(!code){
          setAddHint('יש לבחור כיוון לפני העלאת תמונה.', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = ev=>{
          const dataUrl = ev.target && ev.target.result;
          if(!dataUrl || typeof dataUrl !== 'string'){
            setAddHint('שגיאה בקריאת הקובץ.', 'error');
            return;
          }
          addedViews.push({ code, newImage: dataUrl });
          renderAddedViews();
          refreshAddOptions();
          setAddHint(`כיוון ${code} הוכן. שמור את השינויים להשלמה.`, 'success');
        };
        reader.onerror = ()=> setAddHint('שגיאה בקריאת הקובץ.', 'error');
        reader.readAsDataURL(file);
        e.target.value='';
      };
    }

    renderAddedViews();
    
    // Event handlers
    const closeModal = () => modal.remove();
    
    document.getElementById('closeOrientEditModal').onclick = closeModal;
    document.getElementById('cancelOrientEditBtn').onclick = closeModal;
    
    // החלפת תמונת TOP
    if(group.topImage){
      document.getElementById('changeTopBtn').onclick = () => {
        document.getElementById('topFileInput').click();
      };
      
      document.getElementById('topFileInput').onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if(!file) return;
        
        const reader = new FileReader();
        reader.onload = (ev) => {
          newTopImage = ev.target.result;
          const preview = document.getElementById('topPreview');
          preview.innerHTML = `
            <img src="${newTopImage}" style="width:100%;height:100%;object-fit:cover;">
            <div style="position:absolute;top:4px;right:4px;background:rgba(16,185,129,0.9);color:#fff;font-size:0.7rem;padding:4px 8px;border-radius:6px;font-weight:600;">חדש ✓</div>
          `;
        };
        reader.readAsDataURL(file);
      };
    }
    
    // החלפת תמונות view
    box.querySelectorAll('.change-view-btn').forEach(btn => {
      if(!btn.dataset.originalLabel){ btn.dataset.originalLabel = btn.textContent || '📷 החלף'; }
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.viewIdx);
        const input = box.querySelector(`.view-file-input-${idx}`);
        if(!input) return;
        input.click();
        
        input.onchange = (e) => {
          const file = e.target.files && e.target.files[0];
          if(!file) return;
          
          const reader = new FileReader();
          reader.onload = (ev) => {
            const newImage = ev.target.result;
            const view = group.viewImages[idx];
            
            // עדכון המערך
            const existingIdx = updatedViews.findIndex(v => v.id === view.id);
            if(existingIdx >= 0){
              updatedViews[existingIdx].newImage = newImage;
            } else {
              updatedViews.push({
                id: view.id,
                code: view.orient,
                oldStoragePath: view.storagePath,
                newImage
              });
            }
            
            // עדכון תצוגה
            const preview = box.querySelector(`.view-preview-${idx}`);
            if(!preview) return;
            preview.innerHTML = `
              <img src="${newImage}" style="width:100%;height:100%;object-fit:cover;">
              <div style="position:absolute;top:4px;right:4px;background:rgba(16,185,129,0.9);color:#fff;font-size:0.65rem;padding:3px 6px;border-radius:4px;font-weight:600;">חדש ✓</div>
            `;
          };
          reader.readAsDataURL(file);
        };
      };
    });

    box.querySelectorAll('.remove-view-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.viewIdx, 10);
        if(Number.isNaN(idx)) return;
        const view = group.viewImages[idx];
        if(!view) return;
        const card = btn.closest('.view-card');
        const code = (view.orient || '').toUpperCase();
        if(!card) return;
        const removalIdx = removedViews.findIndex(v => v.id === view.id);
        if(removalIdx === -1){
          removedViews.push({ id: view.id, storagePath: view.storagePath });
          existingCodes.delete(code);
          const changeBtn = card.querySelector('.change-view-btn');
          if(changeBtn){
            changeBtn.disabled = true;
            changeBtn.style.opacity = '0.55';
            changeBtn.textContent = 'יימחק בשמירה';
          }
          card.dataset.removed = 'true';
          card.style.opacity = '0.4';
          card.style.filter = 'grayscale(80%)';
          card.style.position = 'relative';
          let badge = card.querySelector('.orient-remove-badge');
          if(!badge){
            badge = document.createElement('div');
            badge.className = 'orient-remove-badge';
            badge.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(239,68,68,0.95);color:#fff;font-size:0.7rem;padding:4px 8px;border-radius:6px;font-weight:700;box-shadow:0 4px 12px rgba(239,68,68,0.3);';
            card.appendChild(badge);
          }
          badge.textContent = 'יימחק בשמירה';
          badge.style.display = 'block';
          const pendingIdx = updatedViews.findIndex(v => v.id === view.id);
          if(pendingIdx >= 0){
            card.__pendingUpdate = updatedViews.splice(pendingIdx, 1)[0];
          }
          btn.textContent = '↩️ בטל מחיקה';
          btn.style.background = '#475569';
          btn.dataset.state = 'removed';
          setAddHint('כיוון יסומן למחיקה. ניתן להוסיף או לבחור כיוון חדש.', 'pending');
        } else {
          removedViews.splice(removalIdx,1);
          existingCodes.add(code);
          const changeBtn = card.querySelector('.change-view-btn');
          if(changeBtn){
            changeBtn.disabled = false;
            changeBtn.style.opacity = '';
            changeBtn.textContent = changeBtn.dataset.originalLabel || '📷 החלף';
          }
          card.dataset.removed = 'false';
          card.style.opacity = '';
          card.style.filter = '';
          const badge = card.querySelector('.orient-remove-badge');
          if(badge){ badge.style.display = 'none'; }
          if(card.__pendingUpdate){
            updatedViews.push(card.__pendingUpdate);
            delete card.__pendingUpdate;
          }
          btn.textContent = '🗑️ הסר כיוון';
          btn.style.background = '#ef4444';
          btn.dataset.state = 'active';
          setAddHint('כיוון שוחזר. אפשר להמשיך לערוך או למחוק מחדש.', 'muted');
        }
        refreshAddOptions();
        updateViewCount();
        const remaining = group.viewImages.length - removedViews.length + addedViews.length;
        if(remaining <= 0){
          setAddHint('קבוצה חייבת לכלול לפחות כיוון אחד. הוסף כיוון חדש לפני שמירה.', 'error');
        }
      };
    });
    
    // שמירת שינויים
    document.getElementById('saveOrientEditBtn').onclick = async () => {
      const saveBtn = document.getElementById('saveOrientEditBtn');
      if(!newTopImage && !updatedViews.length && !addedViews.length && !removedViews.length){
        alert('לא בוצעו שינויים');
        return;
      }
      
      const updates = {
        updatedViews,
        addedViews,
        removedViews
      };

      const resultingViews = group.viewImages.length - removedViews.length + addedViews.length;
      if(resultingViews <= 0){
        alert('קבוצה חייבת לכלול לפחות כיוון אחד. הוסף כיוון חדש או בטל מחיקה לפני שמירה.');
        return;
      }
      
      if(newTopImage){
        updates.newTopImage = newTopImage;
        updates.oldTopStoragePath = group.topImage.storagePath;
        updates.topImageId = group.topImage.id;
      }
      
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ שומר...';
        
        await api.updateTestGroup(group.testNumber, updates);
        closeModal();
      } catch(e){
        alert('❌ שגיאה בשמירה: ' + e.message);
        if(saveBtn){
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 שמור שינויים';
        }
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
})();