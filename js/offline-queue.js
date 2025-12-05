// offline-queue.js
// Offline-first queue for test results to Supabase
(function(){
  const QUEUE_KEY = 'app.offline_queue';
  let queue = [];
  let processing = false;

  function loadQueue(){
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if(raw) queue = JSON.parse(raw) || [];
    } catch(e){ queue = []; }
  }

  function saveQueue(){
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch(e){ console.warn('[offline-queue] save failed', e); }
  }

  function enqueue(testId, payload){
    queue.push({ testId, payload, ts: Date.now(), id: Math.random().toString(36) });
    saveQueue();
    tryFlush();
  }

  async function tryFlush(){
    if(processing || !queue.length) return;
    if(!navigator.onLine) return;
    if(!window.supabaseClient) return;
    if(!window.examData || typeof window.examData.recordAttempt!=='function' || (typeof window.examData.isReady==='function' && !window.examData.isReady())){
      console.warn('[offline-queue] examData not ready, deferring flush');
      return;
    }
    processing = true;
    while(queue.length > 0){
      const item = queue[0];
      try {
        const payload = item && item.payload ? item.payload : null;
        if(!payload || !payload.candidate_id || !payload.test_id || !payload.completed_at){
          console.warn('[offline-queue] skipping legacy payload', item);
          queue.shift();
          saveQueue();
          continue;
        }
          // Send to Supabase
        const { error } = await window.supabaseClient.from('exam_user_attempts').insert([payload]);
        if(error) throw error;
        queue.shift(); // success
        saveQueue();
      } catch(e){
        const msg = e && e.message ? e.message : 'unknown error';
        const details = e && e.details ? e.details : null;
        const hint = e && e.hint ? e.hint : null;
        console.warn('[offline-queue] flush failed:', msg, details || '', hint || '', 'payload=', item && item.payload);
        break; // stop on first failure
      }
    }
    processing = false;
  }

  window.addEventListener('online', tryFlush);

  function handleTestCompleted(payload){
    if(!payload) return;
    const authApi = window.testAuth || null;
    const userId = authApi && typeof authApi.getCurrentUserUuid==='function' ? authApi.getCurrentUserUuid() : null;
    if(!userId){
      console.warn('[offline-queue] missing user uuid for test result, skipping persistence');
      return;
    }
    const identifier = authApi && typeof authApi.getCurrentUser==='function' ? authApi.getCurrentUser() : null;
    const extraData = Object.assign({}, payload.extra || {});
    extraData._client = {
      identifier,
      queuedAt: new Date().toISOString(),
      appVersion: window.APP_VERSION || 'web'
    };
    
    // חשב אחוז מציון
    const scaleRange = window.getGlobalScale ? window.getGlobalScale() : {min:1, max:7};
    const scaleSpan = scaleRange.max - scaleRange.min;
    const percent = scaleSpan > 0 ? ((payload.scaled - scaleRange.min) / scaleSpan) * 100 : 0;
    
    enqueue(payload.id, {
      candidate_id: userId,
      test_id: payload.id,
      test_label: payload.id,
      stage: 'exam',
      raw_score: payload.raw,
      scaled_score: payload.scaled,
      percent: Math.max(0, Math.min(100, percent)),
      summary: extraData,
      raw_payload: extraData,
      completed_at: new Date(payload.ts).toISOString()
    });
  }

  window.addEventListener('tests-core:test-completed', (ev)=>handleTestCompleted(ev.detail));

  loadQueue();
  document.addEventListener('DOMContentLoaded', tryFlush);

  window.offlineQueue = { enqueue, tryFlush, getQueue: ()=> queue.slice() };
})();
