// tests-core.js
// Central test lifecycle & results registry
(function(){
  const listeners = new Set();
  const registry = new Map(); // id -> meta {title, version}
  let results = []; // {id, raw, scaled, extra, user, ts}

  function emit(event, payload){
    listeners.forEach(l=>{ try{ l(event,payload); }catch(e){ console.warn('[tests-core] listener error', e); } });
    window.dispatchEvent(new CustomEvent('tests-core:'+event,{detail:payload}));
  }

  function registerTest(id, meta){
    registry.set(id, { id, title: meta && meta.title || id, version: meta && meta.version || 1 });
  }

  function completeTest(id, raw, scaled, extra){
    const authApi = window.testAuth || null;
    const previewModeActive = authApi && typeof authApi.isPreviewMode === 'function' ? authApi.isPreviewMode() : false;
    const user = authApi && typeof authApi.getCurrentUser==='function' ? authApi.getCurrentUser() : null;
    const userUuid = authApi && typeof authApi.getCurrentUserUuid==='function' ? authApi.getCurrentUserUuid() : null;
    const rec = { id, raw:+raw||0, scaled:+scaled||0, extra: extra||{}, user, userUuid, ts: Date.now() };
    results = results.filter(r=> r.id!==id); // keep last attempt only per id (optional)
    results.push(rec);
    try{ localStorage.setItem('testResults', JSON.stringify(results)); }catch(e){}
    
    // שמור את התוצאה בדאטה בייס
    if(userUuid && !previewModeActive && window.examData && typeof window.examData.saveTestResult === 'function'){
      window.examData.saveTestResult(userUuid, id, +raw||0, +scaled||0, extra||{})
        .then(()=>{
          console.log('[tests-core] Test result saved to database:', id);
          // סגור את אפשרות הבחינה החוזרת
          if(window.examData && typeof window.examData.markUserTestAsCompleted === 'function'){
            return window.examData.markUserTestAsCompleted(userUuid, id);
          }
        })
        .then(()=>{
          console.log('[tests-core] Test marked as completed in database:', id);
          // בדוק האם כל המבחנים הושלמו
          if(window.examData && typeof window.examData.checkAndUpdateAllTestsDone === 'function'){
            return window.examData.checkAndUpdateAllTestsDone(userUuid);
          }
        })
        .then((allDone)=>{
          if(allDone){
            console.log('[tests-core] All tests completed for user');
          }
          // רענן את רשימת המבחנים המושלמים והנעילות
          if(window.testAuth && typeof window.testAuth.refreshCompletedTests === 'function'){
            return window.testAuth.refreshCompletedTests(userUuid);
          }
        })
        .then(()=>{
          console.log('[tests-core] Navigation locks refreshed');
        })
        .catch(err=>{
          console.warn('[tests-core] Failed to save test result to database:', err);
        });
    }
    
    // Chain to auth module for navigation unlock
    if(!previewModeActive && window.testAuth && typeof window.testAuth.markTestCompleted==='function'){
      window.testAuth.markTestCompleted(id);
    }
    emit('test-completed', rec);
  }

  function getResult(id){ return results.find(r=>r.id===id)||null; }
  function getAllResults(){ return results.slice(); }

  function loadPersisted(){
    try{ const raw=localStorage.getItem('testResults'); if(raw){ const arr=JSON.parse(raw); if(Array.isArray(arr)) results=arr; } }catch(e){}
  }

  function on(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }

  let interactionLockState = null;
  let interactionTokenCounter = 0;

  function normalizeKeyValue(code, key){
    const base = code || key || '';
    return String(base).toLowerCase();
  }

  function normalizeLockOptions(options){
    const defaults = {
      allowedKeys: [],
      allowedMouseButtons: [0],
      allowWheel: false,
      allowContextMenu: false,
      allowTouchScroll: false,
      allowScroll: false,
      allowSelection: false
    };
    const merged = Object.assign({}, defaults, options || {});
    const keys = Array.isArray(merged.allowedKeys) ? merged.allowedKeys.map(k=>String(k).toLowerCase()) : [];
    if(!keys.includes('*') && !keys.includes('escape')) keys.push('escape');
    merged.allowedKeys = keys;
    merged.allowAllKeys = keys.includes('*');
    if(merged.allowedMouseButtons === '*'){
      merged.allowedMouseButtons = '*';
    } else {
      const btns = Array.isArray(merged.allowedMouseButtons) ? merged.allowedMouseButtons.map(n=>Number(n)) : [];
      if(!btns.length) btns.push(0);
      merged.allowedMouseButtons = Array.from(new Set(btns));
    }
    return merged;
  }

  function detachInteractionHandlers(){
    if(!interactionLockState || !interactionLockState.handlers) return;
    const handlers = interactionLockState.handlers;
    document.removeEventListener('keydown', handlers.key, true);
    document.removeEventListener('keyup', handlers.key, true);
    document.removeEventListener('keypress', handlers.key, true);
    document.removeEventListener('mousedown', handlers.mouse, true);
    document.removeEventListener('mouseup', handlers.mouse, true);
    document.removeEventListener('click', handlers.mouse, true);
    document.removeEventListener('auxclick', handlers.mouse, true);
    document.removeEventListener('contextmenu', handlers.context, true);
    document.removeEventListener('touchstart', handlers.touch, { capture:true });
    document.removeEventListener('touchmove', handlers.touch, { capture:true });
    document.removeEventListener('touchend', handlers.touch, { capture:true });
    if(handlers.wheel){ document.removeEventListener('wheel', handlers.wheel, { capture:true }); }
    interactionLockState.handlers = null;
  }

  function applyInteractionHandlers(options){
    if(!document || !document.body) return;
    const normalized = normalizeLockOptions(options);
    if(!interactionLockState){
      interactionLockState = { token: null, options: normalized, handlers: null, savedStyles: null };
    } else {
      interactionLockState.options = normalized;
    }

    if(!interactionLockState.savedStyles){
      interactionLockState.savedStyles = {
        bodyOverflow: document.body.style.overflow,
        htmlOverflow: document.documentElement.style.overflow,
        bodyUserSelect: document.body.style.userSelect,
        bodyTouchAction: document.body.style.touchAction
      };
    }

    detachInteractionHandlers();

    if(!normalized.allowScroll){
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    if(!normalized.allowSelection){
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none';
    }

    document.body.classList.add('test-input-lock');
    document.documentElement.classList.add('test-input-lock');

    const allowAllKeys = normalized.allowAllKeys;
    const allowedKeys = new Set(normalized.allowedKeys);
    const allowAllButtons = normalized.allowedMouseButtons === '*';
    const allowedButtons = allowAllButtons ? null : new Set(normalized.allowedMouseButtons);

    const keyHandler = (ev) => {
      const key = normalizeKeyValue(ev.code, ev.key);
      if(allowAllKeys || allowedKeys.has(key)) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };

    const mouseHandler = (ev) => {
      if(allowAllButtons || (allowedButtons && allowedButtons.has(ev.button))) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };

    const contextHandler = (ev) => {
      if(normalized.allowContextMenu) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };

    const touchHandler = (ev) => {
      if(normalized.allowTouchScroll) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };

    const handlers = {
      key: keyHandler,
      mouse: mouseHandler,
      context: contextHandler,
      touch: touchHandler,
      wheel: null
    };

    document.addEventListener('keydown', keyHandler, true);
    document.addEventListener('keyup', keyHandler, true);
    document.addEventListener('keypress', keyHandler, true);
    document.addEventListener('mousedown', mouseHandler, true);
    document.addEventListener('mouseup', mouseHandler, true);
    document.addEventListener('click', mouseHandler, true);
    document.addEventListener('auxclick', mouseHandler, true);
    document.addEventListener('contextmenu', contextHandler, true);
    document.addEventListener('touchstart', touchHandler, { capture:true, passive:false });
    document.addEventListener('touchmove', touchHandler, { capture:true, passive:false });
    document.addEventListener('touchend', touchHandler, { capture:true, passive:false });

    if(!normalized.allowWheel){
      const wheelHandler = (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      };
      handlers.wheel = wheelHandler;
      document.addEventListener('wheel', wheelHandler, { capture:true, passive:false });
    }

    interactionLockState.handlers = handlers;
  }

  function lockInteractions(options){
    interactionTokenCounter += 1;
    const token = interactionTokenCounter;
    if(!interactionLockState){ interactionLockState = { token:null, options:null, handlers:null, savedStyles:null }; }
    interactionLockState.token = token;
    applyInteractionHandlers(options);
    return token;
  }

  function updateInteractionLock(token, options){
    if(!interactionLockState || interactionLockState.token !== token) return;
    const merged = Object.assign({}, interactionLockState.options || {}, options || {});
    applyInteractionHandlers(merged);
  }

  function unlockInteractions(token){
    if(!interactionLockState || interactionLockState.token !== token) return;
    detachInteractionHandlers();
    if(interactionLockState.savedStyles){
      const st = interactionLockState.savedStyles;
      document.body.style.overflow = st.bodyOverflow;
      document.documentElement.style.overflow = st.htmlOverflow;
      document.body.style.userSelect = st.bodyUserSelect;
      document.body.style.touchAction = st.bodyTouchAction;
    }
    document.body.classList.remove('test-input-lock');
    document.documentElement.classList.remove('test-input-lock');
    interactionLockState = null;
  }

  // שחרור כל הנעילות ללא צורך ב-token (לשימוש במשוב)
  function unlockAllInteractions(){
    if(interactionLockState){
      detachInteractionHandlers();
      if(interactionLockState.savedStyles){
        const st = interactionLockState.savedStyles;
        document.body.style.overflow = st.bodyOverflow;
        document.documentElement.style.overflow = st.htmlOverflow;
        document.body.style.userSelect = st.bodyUserSelect;
        document.body.style.touchAction = st.bodyTouchAction;
      }
      document.body.classList.remove('test-input-lock');
      document.documentElement.classList.remove('test-input-lock');
      interactionLockState = null;
      console.log('[testsCore] All interactions unlocked');
    }
  }

  // expose
  window.testsCore = {
    registerTest,
    completeTest,
    getResult,
    getAllResults,
    on,
    lockInteractions,
    updateInteractionLock,
    unlockInteractions,
    unlockAllInteractions
  };
  document.addEventListener('DOMContentLoaded', loadPersisted);
})();