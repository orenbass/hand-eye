// Supabase data access helpers for the exam app
(function(){
  const logPrefix = '[exam-data]';
  const NORTH_BUCKET = 'northfind';
  const NORTH_TABLE = 'northfind_maps';
  function log(){
    try {
      const args = Array.prototype.slice.call(arguments);
      console.log.apply(console, [logPrefix].concat(args));
    } catch(e){}
  }
  function ensureClient(){
    const client = window.supabaseClient;
    if(!client) throw new Error('Supabase client is not initialized');
    return client;
  }
  function isReady(){ return !!window.supabaseClient; }

  function guessImageExt(mime){
    if(!mime) return 'jpeg';
    if(mime.includes('png')) return 'png';
    if(mime.includes('webp')) return 'webp';
    if(mime.includes('gif')) return 'gif';
    return 'jpeg';
  }

  function dataUrlToBlob(dataUrl){
    if(typeof dataUrl!=='string' || !dataUrl.startsWith('data:')){
      throw new Error('Invalid data URL');
    }
    const parts = dataUrl.split(',');
    if(parts.length<2){ throw new Error('Malformed data URL'); }
    const meta = parts[0];
    const base64 = parts.slice(1).join(',');
    const mimeMatch = meta.match(/data:(.*?);/i);
    const mime = mimeMatch? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(base64);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for(let i=0;i<len;i++){ buffer[i]=binary.charCodeAt(i); }
    return { blob:new Blob([buffer], { type:mime }), mime };
  }

  function buildNorthStoragePath(ext){
    const safeExt = (ext||'jpeg').replace(/[^a-z0-9]/gi,'').toLowerCase() || 'jpeg';
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2,8);
    return `maps/${stamp}-${rand}.${safeExt}`;
  }

  async function fetchLatestRow(){
    const client = ensureClient();
    const { data, error } = await client
      .from('exam_settings')
      .select('id,settings_payload,created_at,updated_at,description,created_by')
      .order('created_at',{ascending:false})
      .limit(1);
    if(error) throw error;
    if(Array.isArray(data) && data.length) return data[0];
    return null;
  }

  async function fetchActiveSettings(){
    if(!isReady()) return null;
    try {
      const row = await fetchLatestRow();
      if(!row) return null;
      if(row && row.settings_payload && !row.payload){
        row.payload = row.settings_payload;
      }
      return row;
    } catch(err){
      console.warn(logPrefix, 'fetchActiveSettings failed', err);
      return null;
    }
  }

  async function saveSettingsBundle(bundle, meta){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const now = new Date().toISOString();
    const cleanBundle = Object.assign({}, bundle || {});
    cleanBundle._meta = Object.assign({}, cleanBundle._meta || {}, {
      savedAt: now,
      savedBy: meta && meta.createdBy ? meta.createdBy : null
    });
    const insertPayload = {
      settings_payload: cleanBundle,
      description: meta && meta.description ? meta.description : 'app sync',
      created_by: meta && meta.createdBy ? meta.createdBy : null
    };
    const { data, error } = await client
      .from('exam_settings')
      .insert([insertPayload])
      .select()
      .single();
    if(error) throw error;
    log('settings saved to Supabase (record', data && data.id, ')');
    return data;
  }

  async function fetchUserByIdentifier(identifier){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const trimmed = (identifier||'').trim();
    if(!trimmed) return null;
    // מחזיר את כל המשתמשים עם אותה תעודת זהות (יכולים להיות מספר רישומים)
    const { data, error } = await client
      .from('exam_users')
      .select('id,first_name,last_name,national_id,entry_pin,tests_completed,all_tests_done,scores,notes,created_at,access_window_start,access_window_end')
      .eq('national_id', trimmed)
      .order('created_at', {ascending: false})
      .limit(1);
    if(error) throw error;
    if(Array.isArray(data) && data.length) return data[0];
    return null;
  }

  // פונקציה חדשה - מחפשת משתמש לפי תעודת זהות וקוד כניסה יחד
  async function fetchUserByCredentials(nationalId, entryPin){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const trimmedId = (nationalId||'').trim();
    const trimmedPin = (entryPin||'').trim();
    if(!trimmedId || !trimmedPin) return null;
    const { data, error } = await client
      .from('exam_users')
      .select('id,first_name,last_name,national_id,entry_pin,tests_completed,all_tests_done,scores,notes,created_at,access_window_start,access_window_end')
      .eq('national_id', trimmedId)
      .eq('entry_pin', trimmedPin)
      .limit(1);
    if(error) throw error;
    if(Array.isArray(data) && data.length) return data[0];
    return null;
  }

  async function fetchAdminByIdentifier(identifier){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const trimmed = (identifier||'').trim();
    if(!trimmed) return null;
    const { data, error } = await client
      .from('exam_admins')
      .select('id,national_id,entry_pin,full_name,created_at')
      .eq('national_id', trimmed)
      .limit(1);
    if(error) throw error;
    if(Array.isArray(data) && data.length) return data[0];
    return null;
  }

  async function fetchUserAttempts(userId){
    if(!isReady()) return [];
    const client = ensureClient();
    if(!userId) return [];
    const { data, error } = await client
      .from('exam_user_attempts')
      .select('id,test_id,raw_score,scaled_score,completed_at,summary,raw_payload,stage,candidate_id')
      .eq('candidate_id', userId)
      .order('completed_at',{ascending:true});
    if(error) throw error;
    return Array.isArray(data)? data: [];
  }

  async function recordAttempt(attempt){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const payload = Object.assign({}, attempt);
    if(!payload.candidate_id || !payload.test_id){
      throw new Error('recordAttempt requires candidate_id and test_id');
    }
    const { data, error } = await client
      .from('exam_user_attempts')
      .insert(payload)
      .select()
      .single();
    if(error) throw error;
    return data;
  }

  async function listUsers(options){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const opts = options || {};
    const limit = opts.limit || 50;
    let query = client
      .from('exam_users')
      .select('id,national_id,first_name,last_name,entry_pin,notes,tests_completed,all_tests_done,scores,created_at,updated_at,access_window_start,access_window_end')
      .order('created_at',{ascending:false})
      .limit(limit);
    if(opts.search){
      const term = `%${opts.search.trim()}%`;
      query = query.or(`national_id.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`);
    }
    if(opts.completion==='done'){
      query = query.eq('all_tests_done', true);
    } else if(opts.completion==='pending'){
      query = query.eq('all_tests_done', false);
    }
    const { data, error } = await query;
    if(error) throw error;
    return Array.isArray(data)? data: [];
  }

  async function createUser(payload){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const body = Object.assign({}, payload||{});
    body.national_id = (body.national_id||'').trim();
    body.first_name = (body.first_name||'').trim();
    body.last_name = (body.last_name||'').trim();
    body.entry_pin = (body.entry_pin||'').trim();
    if(!body.national_id){ throw new Error('חובה להזין תעודת זהות'); }
    if(!body.entry_pin){ throw new Error('הפקת קוד כניסה נדרשת'); }
    if(body.access_window_start === '') body.access_window_start = null;
    if(body.access_window_end === '') body.access_window_end = null;
    const { data, error } = await client
      .from('exam_users')
      .insert([body])
      .select()
      .single();
    if(error) throw error;
    return data;
  }

  async function updateUser(id, changes){
    if(!isReady()) throw new Error('Supabase client missing');
    if(!id) throw new Error('Missing user id');
    const client = ensureClient();
    const body = Object.assign({}, changes||{});
    if(body.national_id) body.national_id = body.national_id.trim();
    if(body.first_name) body.first_name = body.first_name.trim();
    if(body.last_name) body.last_name = body.last_name.trim();
    if(body.entry_pin) body.entry_pin = body.entry_pin.trim();
    if(body.hasOwnProperty('access_window_start') && body.access_window_start === '') body.access_window_start = null;
    if(body.hasOwnProperty('access_window_end') && body.access_window_end === '') body.access_window_end = null;
    const { data, error } = await client
      .from('exam_users')
      .update(body)
      .eq('id', id)
      .select()
      .single();
    if(error) throw error;
    return data;
  }

  async function deleteUser(id){
    if(!isReady()) throw new Error('Supabase client missing');
    if(!id) throw new Error('Missing user id');
    const client = ensureClient();
    const { error } = await client
      .from('exam_users')
      .delete()
      .eq('id', id);
    if(error) throw error;
    return true;
  }

  async function listNorthfindMaps(){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const { data, error } = await client
      .from(NORTH_TABLE)
      .select('id,label,storage_path,width_px,height_px,created_at,created_by')
      .order('created_at',{ascending:false});
    if(error) throw error;
    const bucketRef = window.supabaseClient.storage.from(NORTH_BUCKET);
    return (data||[]).map(row=>{
      const publicUrl = row.storage_path? bucketRef.getPublicUrl(row.storage_path).data.publicUrl : null;
      return {
        id: row.id,
        label: row.label,
        storagePath: row.storage_path,
        width: row.width_px,
        height: row.height_px,
        createdAt: row.created_at,
        createdBy: row.created_by,
        publicUrl
      };
    });
  }

  async function createNorthfindMap(options){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const dataUrl = options && options.dataUrl;
    if(!dataUrl || typeof dataUrl!=='string' || !dataUrl.startsWith('data:')){
      throw new Error('dataUrl is required');
    }
    const { blob, mime } = dataUrlToBlob(dataUrl);
    const ext = guessImageExt(mime);
    const storagePath = buildNorthStoragePath(ext);
    const bucketRef = window.supabaseClient.storage.from(NORTH_BUCKET);
    const { error: uploadErr } = await bucketRef.upload(storagePath, blob, { contentType: mime, upsert: false });
    if(uploadErr) throw uploadErr;
    const payload = {
      label: options.label || options.originalName || 'North map',
      storage_path: storagePath,
      width_px: options.width || null,
      height_px: options.height || null,
      created_by: options.createdBy || null
    };
    const { data, error } = await client
      .from(NORTH_TABLE)
      .insert([payload])
      .select()
      .single();
    if(error) throw error;
    const publicRes = bucketRef.getPublicUrl(storagePath);
    const publicUrl = publicRes && publicRes.data ? publicRes.data.publicUrl : null;
    return Object.assign({}, data, {
      publicUrl,
      storagePath
    });
  }

  async function deleteNorthfindMap(id, storagePath){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    const bucketRef = window.supabaseClient.storage.from(NORTH_BUCKET);
    if(storagePath){
      const { error: removeErr } = await bucketRef.remove([storagePath]);
      if(removeErr && removeErr.message && !/not found/i.test(removeErr.message)){ throw removeErr; }
    }
    if(id){
      const { error } = await client
        .from(NORTH_TABLE)
        .delete()
        .eq('id', id);
      if(error) throw error;
    }
    return true;
  }

  async function saveTestResult(userId, testId, rawScore, scaledScore, extraData){
    if(!isReady()) throw new Error('Supabase client missing');
    const client = ensureClient();
    
    try {
      // חשב אחוז מציון מעודכן (בהנחה שהסקאלה היא 1-7)
      const scaleRange = window.getGlobalScale ? window.getGlobalScale() : {min:1, max:7};
      const scaleSpan = scaleRange.max - scaleRange.min;
      const percent = scaleSpan > 0 ? ((scaledScore - scaleRange.min) / scaleSpan) * 100 : 0;
      
      // הוסף ניסיון חדש
      const { data: attemptData, error: attemptError } = await client
        .from('exam_user_attempts')
        .insert([{
          candidate_id: userId,
          test_id: testId,
          test_label: testId,
          stage: 'exam',
          raw_score: rawScore,
          scaled_score: scaledScore,
          percent: Math.max(0, Math.min(100, percent)),
          summary: extraData || {},
          raw_payload: extraData || {},
          completed_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if(attemptError) throw attemptError;
      log('Test result saved - test:', testId, 'user:', userId, 'score:', scaledScore);
      
      return attemptData;
    } catch(err){
      console.warn(logPrefix, 'saveTestResult failed', err);
      throw err;
    }
  }

  async function markUserTestAsCompleted(userId, testId){
    if(!isReady()) return false;
    const client = ensureClient();
    
    try {
      // קבל את רשומת המשתמש הנוכחית
      const { data: userData, error: fetchErr } = await client
        .from('exam_users')
        .select('id,tests_completed')
        .eq('id', userId)
        .single();
      
      if(fetchErr) {
        console.warn(logPrefix, 'Failed to fetch user for marking test', fetchErr);
        return false;
      }
      
      if(!userData) return false;
      
      // עדכן את רשימת המבחנים שהושלמו - וודא שזה array
      let completedTests = userData.tests_completed || [];
      if(!Array.isArray(completedTests)){
        completedTests = [];
      }
      if(!completedTests.includes(testId)){
        completedTests.push(testId);
      }
      
      const { error: updateErr } = await client
        .from('exam_users')
        .update({ tests_completed: completedTests })
        .eq('id', userId);
      
      if(updateErr) throw updateErr;
      
      log('User test marked as completed - user:', userId, 'test:', testId);
      return true;
    } catch(err){
      console.warn(logPrefix, 'markUserTestAsCompleted failed', err);
      return false;
    }
  }

  async function checkAndUpdateAllTestsDone(userId){
    if(!isReady()) return false;
    const client = ensureClient();
    
    try {
      // קבל את הגדרות המבחנים הנדרשים
      let requiredTests = [];
      try {
        const remoteSettings = await fetchActiveSettings();
        if(remoteSettings && remoteSettings.payload && remoteSettings.payload.settings && Array.isArray(remoteSettings.payload.settings.tests)){
          requiredTests = remoteSettings.payload.settings.tests
            .filter(t => t.include !== false)
            .map(t => t.id);
        }
      } catch(err){
        console.warn(logPrefix, 'Failed to load required tests from settings', err);
        const stored = localStorage.getItem('requiredTests');
        if(stored){
          try {
            requiredTests = JSON.parse(stored);
          } catch(e) {}
        }
      }
      
      if(!requiredTests.length) {
        console.warn(logPrefix, 'No required tests found');
        return false;
      }
      
      const { data: userData, error: fetchErr } = await client
        .from('exam_users')
        .select('id,tests_completed')
        .eq('id', userId)
        .single();
      
      if(fetchErr || !userData) {
        console.warn(logPrefix, 'Failed to fetch user for checking completion', fetchErr);
        return false;
      }
      
      // וודא שזה array
      let completedTests = userData.tests_completed || [];
      if(!Array.isArray(completedTests)){
        completedTests = [];
      }
      
      const allDone = requiredTests.every(testId => completedTests.includes(testId));
      
      log('Checking completion - required:', requiredTests, 'completed:', completedTests, 'allDone:', allDone);
      
      if(allDone) {
        const { error: updateErr } = await client
          .from('exam_users')
          .update({ all_tests_done: true })
          .eq('id', userId);
        
        if(updateErr) throw updateErr;
        log('User marked as completed all required tests - user:', userId);
        return true;
      }
      
      return false;
    } catch(err){
      console.warn(logPrefix, 'checkAndUpdateAllTestsDone failed', err);
      return false;
    }
  }

  window.examData = {
    isReady,
    fetchActiveSettings,
    saveSettingsBundle,
    fetchUserByIdentifier,
    fetchUserByCredentials,
    fetchAdminByIdentifier,
    fetchUserAttempts,
    recordAttempt,
    listUsers,
    createUser,
    updateUser,
    deleteUser,
    listNorthfindMaps,
    createNorthfindMap,
    deleteNorthfindMap,
    saveTestResult,
    markUserTestAsCompleted,
    checkAndUpdateAllTestsDone
  };
})();
