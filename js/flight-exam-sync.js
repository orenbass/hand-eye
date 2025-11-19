// flight-exam-sync.js
// סנכרון חלקי מבחן הטיסה מול דלי Supabase (פורמט תיקיות מספריות: n/n-path.jpeg , n/n-test.jpeg)
(function(){
  const BUCKET = 'flightexam'; // שם הדלי החדש (עדכן אם שונה)
  if(!window.supabaseClient){ console.warn('[flight-sync] Supabase client missing'); }

  const api = {
    loading:false,
    lastLoadCount:0,
    async loadFromDb(cacheBust){
      if(!window.supabaseClient){ alert('Supabase לא מאותחל'); return; }
      if(api.loading) return;
      api.loading=true;
      try {
        const { data, error } = await window.supabaseClient
          .from('flight_exam_parts')
          .select('part_number,name,path_img_path,test_img_path,path_img_w,path_img_h,test_img_w,test_img_h,path_points')
          .order('part_number',{ascending:true});
        if(error){ throw new Error(error.message); }
        const bucketRef = window.supabaseClient.storage.from(BUCKET);
        const parts = (data||[]).map(r=>{
          const pathPublicRaw = bucketRef.getPublicUrl(r.path_img_path).data.publicUrl;
          const testPublicRaw = bucketRef.getPublicUrl(r.test_img_path).data.publicUrl;
          const bust = cacheBust? ('?v=' + Date.now()) : '';
          const pathPublic = pathPublicRaw + bust;
          const testPublic = testPublicRaw + bust;
          return {
            id:'db_'+r.part_number,
            partNumber: r.part_number, // מזהה מספרי לחלק
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
        // שמירה ל-localStorage (שימוש קיים בקוד)
        const flightExamLS = localStorage.getItem('app.flightexam.parts');
        const current = flightExamLS? JSON.parse(flightExamLS): {parts:[]};
        current.parts = parts;
        localStorage.setItem('app.flightexam.parts', JSON.stringify(current));
        api.lastLoadCount = parts.length;
        console.log('[flight-sync] loaded parts from DB:', parts.length);
        if(window.renderNewExamParts) window.renderNewExamParts();
      } catch(e){
        console.error('[flight-sync] load error', e);
        alert('❌ שגיאה בטעינת חלקי טיסה: '+e.message);
      } finally { api.loading=false; }
    },
    async uploadNewPart(part){
      // part: { name, pathImg(dataURL), testImg(dataURL), pathPoints:[] }
      if(!window.supabaseClient){ alert('Supabase לא מאותחל'); return; }
      if(!part || !part.pathImg || !part.testImg){ alert('צריך גם pathImg וגם testImg'); return; }
      try {
        // קביעת part_number הבא
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
        // העלאות
        const okPath = await uploadDataUrl(pathStorage, part.pathImg);
        const okTest = await uploadDataUrl(testStorage, part.testImg);
        if(!okPath || !okTest){ throw new Error('העלאת קבצים נכשלה'); }
        // חישוב ממדים (נשלוף על ידי יצירת Image)
        const dimsPath = await getDimensions(part.pathImg);
        const dimsTest = await getDimensions(part.testImg);
        // הכנסת רשומה
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
      } catch(e){ console.error('[flight-sync] upload error', e); alert('❌ שגיאה בהעלאה: '+e.message); }
    },
    async deletePart(partNumber){
      if(!window.supabaseClient){ alert('Supabase לא מאותחל'); return; }
      const num = parseInt(partNumber);
      if(isNaN(num)){ alert('מספר לא תקין'); return; }
      if(!confirm('למחוק חלק '+num+' (קבצים + רשומה)?')) return;
      try {
        // שליפת רשומה לבדיקה מסלולי קבצים
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
        // מחיקת רשומה
        const { error:delErr } = await window.supabaseClient
          .from('flight_exam_parts')
          .delete()
          .eq('part_number', num);
        if(delErr){ throw new Error(delErr.message); }
        // מחיקת קבצים
        if(paths.length){
          const { error:remErr } = await window.supabaseClient.storage.from(BUCKET).remove(paths);
          if(remErr){ throw new Error(remErr.message); }
        }
        console.log('[flight-sync] deleted part', num);
        await api.loadFromDb();
        alert('✓ חלק '+num+' נמחק');
      } catch(e){ console.error('[flight-sync] delete error', e); alert('❌ שגיאת מחיקה: '+e.message); }
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
      const blob = dataUrlToBlob(dataUrl);
      const { error } = await window.supabaseClient.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert:false });
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
    const arr=dataUrl.split(',');
    const mime=arr[0].match(/:(.*?);/)[1];
    const bstr=atob(arr[1]);
    let n=bstr.length; const u8=new Uint8Array(n);
    while(n--) u8[n]=bstr.charCodeAt(n);
    return new Blob([u8],{type:mime});
  }
  function getDimensions(dataUrl){
    return new Promise(res=>{
      const im=new Image();
      im.onload=()=> res({w:im.width,h:im.height});
      im.onerror=()=> res({w:0,h:0});
      im.src=dataUrl;
    });
  }

  // אינטגרציה: טעינה אוטומטית כאשר נכנסים לטאב flightexam בהגדרות
  document.addEventListener('click', e=>{
    const btn=e.target.closest('.admin-tab-btn[data-admin-tab="flightexam"]');
    if(btn){ setTimeout(()=> api.loadFromDb(), 150); }
  });
  // אם כבר פעיל הטאב בהתחלה
  setTimeout(()=>{
    const activeTab=document.querySelector('.admin-tab-btn.active[data-admin-tab="flightexam"]');
    if(activeTab) api.loadFromDb();
  },600);

  window.flightExamSync = api;
  // רענון גלובלי מהיר לפני התחלת מבחן אם רוצים תמונות מעודכנות
  window.refreshFlightExamPartsFromDb = function(){ return api.loadFromDb(true); };
})();