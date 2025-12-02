// orientation.datasource.js
// Supabase only - no fallback to local assets
let supabaseOrientationSets = null;
let supabaseLoading = false;

export function invalidateOrientationCache(){
  supabaseOrientationSets = null;
}

export async function fetchOrientationFromSupabase(options = {}){
  const { forceReload = false, cacheBust = true } = options || {};
  if(!window.supabaseClient) {
    throw new Error('לא ניתן להתחבר למסד הנתונים. ודא שהשרת זמין.');
  }
  if(forceReload){
    supabaseOrientationSets = null;
  }
  if(supabaseOrientationSets && !forceReload) return supabaseOrientationSets;
  if(supabaseLoading) return null;
  supabaseLoading = true;
  const bustSuffix = cacheBust ? (`?v=${Date.now()}`) : '';
  try {
    const { data, error } = await window.supabaseClient
      .from('orientation_images')
      .select('*')
      .order('test_number', { ascending: true });
    if(error){ 
      console.error('[orientation] DB error', error); 
      throw new Error('שגיאה בטעינת תמונות התמצאות מהשרת: ' + error.message);
    }
    const byTest = new Map();
    for(const row of data){
      if(!byTest.has(row.test_number)){
        byTest.set(row.test_number, { test_number: row.test_number, topRow: null, orientationRows: [] });
      }
      const bucketEntry = byTest.get(row.test_number);
      if(row.view_type === 'top'){
        bucketEntry.topRow = row;
      } else if(row.view_type === 'orientation'){
        bucketEntry.orientationRows.push(row);
      }
    }
    const bucketRef = window.supabaseClient.storage.from('orientation');
    const assembled = [];
    for(const set of byTest.values()){
      if(!set.topRow || !set.orientationRows.length) continue;
      const topPublic = bucketRef.getPublicUrl(set.topRow.storage_path);
      const topUrl = topPublic && topPublic.data && topPublic.data.publicUrl
        ? topPublic.data.publicUrl + bustSuffix
        : '';
      const viewRows = set.orientationRows.map(row => {
        const viewPublic = bucketRef.getPublicUrl(row.storage_path);
        const viewUrl = viewPublic && viewPublic.data && viewPublic.data.publicUrl
          ? viewPublic.data.publicUrl + bustSuffix
          : '';
        return Object.assign({}, row, { signed_url: viewUrl });
      }).filter(row => !!row.signed_url);
      if(!topUrl || !viewRows.length) continue;
      assembled.push({
        test_number: set.test_number,
        topRow: Object.assign({}, set.topRow, { signed_url: topUrl }),
        orientationRows: viewRows
      });
    }
    if(!assembled.length){
      throw new Error('לא נמצאו תמונות מבחן התמצאות בשרת.');
    }
    supabaseOrientationSets = assembled;
    console.log('[orientation] Loaded', assembled.length, 'test sets from Supabase');
    return supabaseOrientationSets;
  } catch(e){
    console.error('[orientation] Exception', e);
    throw e;
  } finally {
    supabaseLoading = false;
  }
}
