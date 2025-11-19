// orientation-sync.js
// סנכרון קבוצות מבחן התמצאות מול Supabase Storage + DB
(function(){
  if(!window.supabaseClient){ console.warn('[orientation-sync] Supabase client missing'); }
  const BUCKET = 'orientation';

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
        const existingNums = (rootList||[]).filter(i=> !i.id && /^\d+$/.test(i.name)).map(i=> parseInt(i.name));
        const maxExisting = existingNums.length? Math.max(...existingNums) : 0;

        let nextNumber = maxExisting + 1; // מספר התיקייה הבאה האפשרית

        // שליפת רשומות DB כדי להימנע מהעלאה כפולה של מה שכבר הוזן
        const { data: rows, error: rowsErr } = await window.supabaseClient
          .from('orientation_images')
          .select('storage_path');
        if(rowsErr){ throw new Error('שגיאת DB בשליפה: '+rowsErr.message); }
        const existingPaths = new Set((rows||[]).map(r=> r.storage_path));

        let uploaded = 0, skipped = 0, createdRows = 0, setsProcessed=0;

        for(const set of questionSets){
          // heuristic: אם לקבוצה יש שדות meta שמכילים כבר נתיב storage (נזהה לפי סימן '/' ו-lowercase top) נניח שהיא קיימת
          const isAlreadyInBucket = (set.topImage && !set.topImage.startsWith('data:')) || (set.viewImages||[]).some(v=> v.url && !v.url.startsWith('data:'));
          if(isAlreadyInBucket){ skipped++; continue; }
          // אין תמונות -> דלג
          if(!set.topImage && !(set.viewImages&&set.viewImages.length)){ skipped++; continue; }

          const folderNum = nextNumber; // מקצים מספר חדש לכל קבוצה שלא קיימת
          nextNumber++;

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
                if(insertOk) createdRows++; uploaded++;
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
                if(insertOk) createdRows++; uploaded++;
              }
            } else skipped++;
          }
          setsProcessed++;
        }

        api.lastResult = { uploaded, skipped, createdRows, setsProcessed };
        alert(`✓ סנכרון הסתיים\nהועלו ${uploaded} קבצים\nנוצרו ${createdRows} רשומות DB\nדלגו על ${skipped} (כבר קיימים או לא נתונים)`);
        // רענון תצוגת DB בטאב התמצאות אם פתוח
        if(typeof window.loadOrientationDbPreview==='function'){ window.loadOrientationDbPreview(true); }
      } catch(e){
        console.error('[orientation-sync] sync error', e);
        alert('❌ שגיאה בסנכרון: '+ e.message);
      } finally {
        api.syncing = false;
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
  function injectDeleteButtons(){
    const holder = document.getElementById('orientationDbPreview');
    if(!holder) return;
    holder.querySelectorAll('.orient-db-card').forEach(card=>{
      if(card.querySelector('.orient-del-btn')) return; // כבר קיים
      const num = card.dataset.testNumber;
      const btn = document.createElement('button');
      btn.textContent='מחיקה';
      btn.className='orient-del-btn';
      btn.style.cssText='position:absolute;top:8px;right:8px;background:#ef4444;color:#fff;border:none;padding:4px 8px;font-size:0.65rem;border-radius:6px;cursor:pointer;';
      btn.onclick=()=> api.deleteTestGroup(num);
      card.appendChild(btn);
    });
  }

  // האזנה לרענון התצוגה להזרקת כפתורי מחיקה
  document.addEventListener('click', e=>{
    const tabBtn = e.target.closest('.admin-tab-btn[data-admin-tab="orientation"]');
    if(tabBtn){ setTimeout(injectDeleteButtons, 500); }
  });
  window.addEventListener('settings-updated', ()=> setTimeout(injectDeleteButtons, 600));

  // חשיפה גלובלית
  window.orientationSync = api;
})();