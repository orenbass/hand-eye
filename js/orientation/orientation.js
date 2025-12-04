// Orientation Test with practice phase + shared timer HUD
(function(){
  const DIRECTIONS = {
    'N2S': 'מצפון לדרום',
    'S2N': 'מדרום לצפון',
    'E2W': 'ממזרח למערב',
    'W2E': 'ממערב למזרח'
  };
  const PRACTICE_COUNT = 2;
  const ANSWER_TIME_SEC = 60;

  const startBtn = document.getElementById('start-orientation');
  const introView = document.getElementById('orientation-intro');
  const testView = document.getElementById('orientation-test');
  const resultsView = document.getElementById('orientation-results');
  if(!startBtn || !introView || !testView) return;

  // Supabase cache
  let supabaseOrientationSets = null;
  let supabaseLoading = false;
  let supabaseLoadError = null;

  // Preload cache
  let preloadStatus = {};

  // Runtime state
  let practiceQuestions = [];
  let examQuestions = [];
  let questions = [];
  let results = [];
  let stage = 'idle'; // idle | practice | practice-complete | exam | complete
  let currentQuestion = 0;
  let topViewTimer = null;
  let questionStartTime = 0;
  let observationTicker = null;
  let observationDeadline = 0;
  let observationActive = false;
  let answerTimerTicker = null;
  let answerDeadline = 0;
  let questionLocked = false;
  let practiceModalEl = null;
  let prePracticeShown = false;

  function lockViewport(){
    if(window.enterFullscreenMode){
      window.enterFullscreenMode();
    } else {
      if(document.documentElement) document.documentElement.classList.add('no-scroll');
      if(document.body) document.body.classList.add('no-scroll');
    }
  }

  function unlockViewport(){
    if(window.exitFullscreenMode){
      window.exitFullscreenMode();
    } else {
      if(document.documentElement) document.documentElement.classList.remove('no-scroll');
      if(document.body) document.body.classList.remove('no-scroll');
    }
  }

  function updatePracticeBanner(){
    if(window.practiceBanner){
      if(stage === 'practice'){
        window.practiceBanner.show({
        label: 'מצב תרגול',
         description: 'התוצאות אינן נשמרות',
        });
      } else {
        window.practiceBanner.hide();
      }
    }
  }

  function attachHeaderHUDs(){
    if(window.practiceBanner && typeof window.practiceBanner.attach === 'function'){
      const practiceSlot = document.getElementById('orientation-practice-slot');
      window.practiceBanner.attach(practiceSlot || null);
    }
    if(window.timerHUD && typeof window.timerHUD.attach === 'function'){
      const timerSlot = document.getElementById('orientation-timer-slot');
      window.timerHUD.attach(timerSlot || null);
    }
  }

  function detachHudToBody(){
    if(window.practiceBanner && typeof window.practiceBanner.attach === 'function'){
      window.practiceBanner.attach(null);
      window.practiceBanner.hide();
    }
    if(window.timerHUD && typeof window.timerHUD.attach === 'function'){
      window.timerHUD.attach(null);
      window.timerHUD.hide();
    }
  }

  function ensureInstructionsOverlay(section){
    if(!section) return null;
    let overlay = section.querySelector('.legacy-instructions-overlay');
    if(overlay) return overlay;
    const instr = section.querySelector('.instructions-view');
    if(!instr) return null;
    overlay = document.createElement('div');
    overlay.className = 'legacy-instructions-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;display:none;z-index:1000;background:rgba(0,0,0,0.55);overflow:auto;padding:40px';
    overlay.innerHTML = '<div class="instructions-box" style="max-width:800px;margin:0 auto;position:relative"><button type="button" class="close-legacy" style="position:absolute;top:12px;left:12px" title="סגור">✕</button>' + instr.innerHTML + '</div>';
    section.appendChild(overlay);
    const closeBtn = overlay.querySelector('.close-legacy');
    if(closeBtn){
      closeBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
      });
    }
    const overlayStartBtn = overlay.querySelector('.start-test-btn');
    if(overlayStartBtn){
      overlayStartBtn.style.display = 'none';
    }
    return overlay;
  }

  function mountOrientationInstructionsButton(){
    const slot = document.getElementById('orientation-instructions-slot');
    if(!slot) return;
    slot.innerHTML = '<button type="button" class="instructions-toggle-btn hud-instructions-btn" data-screen="orientation-screen">📖 הוראות</button>';
    const btn = slot.querySelector('button');
    if(!btn) return;
    const section = document.getElementById('orientation-screen');
    const overlay = ensureInstructionsOverlay(section);
    if(!overlay) return;
    if(!overlay.style.display){
      overlay.style.display = 'none';
    }
    btn.addEventListener('click', () => {
      overlay.style.display = overlay.style.display === 'block' ? 'none' : 'block';
    });
  }

  function renderOrientationLayout(mainHtml, footerHtml){
    return `
      <div class="orientation-layout" data-stage="${stage}">
        <div class="orientation-header-row">
          <div class="orientation-header-instructions" id="orientation-instructions-slot"></div>
          <div id="orientation-top-btn-slot" class="orientation-header-topbtn"></div>
          <div class="orientation-header-huds">
            <div id="orientation-practice-slot" class="orientation-header-slot orientation-header-slot-practice"></div>
            <div id="orientation-timer-slot" class="orientation-header-slot orientation-header-slot-timer"></div>
          </div>
        </div>
        <div class="orientation-main-row">
          ${mainHtml}
        </div>
        <div class="orientation-footer-row">
          ${footerHtml || ''}
        </div>
      </div>
    `;
  }

  // Legacy custom sets hook
  let orientationSets = [];
  window.loadOrientationSets = function(list){
    orientationSets = Array.isArray(list) ? list.filter(item => item && (item.topImage || (item.viewImages && item.viewImages.length))) : [];
    console.log('[orientation] received sets (custom config)', orientationSets.length);
  };

  function resetPreloadCache(){
    preloadStatus = {};
  }

  function resetTimers(){
    if(topViewTimer){
      clearTimeout(topViewTimer);
      topViewTimer = null;
    }
    stopObservationCountdown();
    stopAnswerCountdown();
  }

  function formatCountdown(ms){
    const totalMs = Math.max(0, ms);
    const totalSec = Math.ceil(totalMs / 1000);
    const minutes = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const seconds = (totalSec % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function showLoading(message){
    if(introView) introView.style.display = 'none';
    if(resultsView) resultsView.style.display = 'none';
    if(testView){
      testView.style.display = 'block';
      testView.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:70vh;color:#fff;gap:28px;">
          <div style="font-size:28px;font-weight:600;">${message}</div>
          <div style="width:90px;height:90px;position:relative;">
            <div style="position:absolute;inset:0;border-radius:50%;border:10px solid rgba(255,255,255,0.15);"></div>
            <div class="orient-spinner" style="position:absolute;inset:0;border-radius:50%;border:10px solid #3b82f6;border-top-color:transparent;animation:spin 1s linear infinite;"></div>
          </div>
          <div id="orient-preload-progress" style="font-size:16px;color:#94a3b8;">0%</div>
        </div>
      `;
      if(!document.getElementById('orient-preload-style')){
        const st = document.createElement('style');
        st.id = 'orient-preload-style';
        st.textContent = `@keyframes spin {from {transform:rotate(0deg);} to {transform:rotate(360deg);} }`;
        document.head.appendChild(st);
      }
    }
  }

  function preloadQuestion(idx){
    if(preloadStatus[idx]) return preloadStatus[idx].promise;
    const q = questions[idx];
    if(!q) return Promise.resolve();
    let topLoaded = false, viewLoaded = false;
    const p = new Promise(resolve => {
      const topImg = new Image();
      const viewImg = new Image();
      q._topImgEl = topImg;
      q._viewImgEl = viewImg;
      function updateProgress(){
        const progressEl = document.getElementById('orient-preload-progress');
        if(progressEl){
          const totalNeeded = 2;
          const done = (topLoaded ? 1 : 0) + (viewLoaded ? 1 : 0);
          progressEl.textContent = Math.round((done / totalNeeded) * 100) + '%';
        }
        if(topLoaded && viewLoaded){ resolve(); }
      }
      topImg.onload = () => { topLoaded = true; updateProgress(); };
      topImg.onerror = () => { topLoaded = true; console.warn('[orientation] top preload failed', q.topImage); updateProgress(); };
      viewImg.onload = () => { viewLoaded = true; updateProgress(); };
      viewImg.onerror = () => { viewLoaded = true; console.warn('[orientation] view preload failed', q.questionImage); updateProgress(); };
      topImg.src = q.topImage;
      viewImg.src = q.questionImage;
    });
    preloadStatus[idx] = { promise: p };
    return p;
  }

  function warmNext(idx){
    const next = idx + 1;
    if(next < questions.length){
      preloadQuestion(next).catch(() => {});
    }
  }

  async function fetchOrientationFromSupabase(){
    if(!window.supabaseClient){
      supabaseLoadError = 'Supabase לא מאותחל';
      return null;
    }
    if(supabaseOrientationSets) return supabaseOrientationSets;
    if(supabaseLoading) return null;
    supabaseLoading = true;
    try {
      const { data, error } = await window.supabaseClient
        .from('orientation_images')
        .select('*')
        .order('test_number', { ascending: true });
      if(error){
        supabaseLoadError = error.message;
        console.error('[orientation] DB error', error);
        return null;
      }
      const byTest = new Map();
      for(const row of data){
        if(!byTest.has(row.test_number)){
          byTest.set(row.test_number, { test_number: row.test_number, topRow: null, orientationRows: [] });
        }
        const obj = byTest.get(row.test_number);
        if(row.view_type === 'top') obj.topRow = row;
        else if(row.view_type === 'orientation') obj.orientationRows.push(row);
      }
      const sets = Array.from(byTest.values()).filter(s => s.topRow && s.orientationRows.length);
      const bucketRef = window.supabaseClient.storage.from('orientation');
      for(const set of sets){
        const pubTop = bucketRef.getPublicUrl(set.topRow.storage_path);
        if(pubTop && pubTop.data && pubTop.data.publicUrl){
          set.topRow.signed_url = pubTop.data.publicUrl;
        }
        for(const row of set.orientationRows){
          const pubView = bucketRef.getPublicUrl(row.storage_path);
          if(pubView && pubView.data && pubView.data.publicUrl){
            row.signed_url = pubView.data.publicUrl;
          }
        }
      }
      supabaseOrientationSets = sets;
      console.log('[orientation] Loaded sets from Supabase:', sets.length);
      return sets;
    } catch(err){
      supabaseLoadError = err.message;
      console.error('[orientation] Exception loading Supabase', err);
      return null;
    } finally {
      supabaseLoading = false;
    }
  }

  function getConfig(){
    const cfg = window.getTestConfig ? window.getTestConfig('orientation') : null;
    const orientCfg = window.getOrientationConfig ? window.getOrientationConfig() : {};
    const scaleRange = window.getGlobalScale ? window.getGlobalScale() : { min: 1, max: 7 };
    return {
      displayTimeSec: orientCfg.displayTimeSec || (cfg && cfg.displayTimeSec) || 10,
      maxQuestions: orientCfg.maxQuestions || (cfg && cfg.maxQuestions) || 10,
      scaleRange,
      showCompass: orientCfg.showCompass !== false,
      exampleSets: orientCfg.exampleSets || []
    };
  }

  function mapSupabaseSetToQuestion(set, options){
    if(!set || !set.topRow || !set.topRow.signed_url) return null;
    const rows = Array.isArray(set.orientationRows) ? set.orientationRows.filter(r => r && r.code && DIRECTIONS[r.code]) : [];
    if(!rows.length) return null;
    let row = rows[0];
    if(!options || !options.preferFirst){
      row = rows[Math.floor(Math.random() * rows.length)];
    }
    return {
      setName: `מבחן ${set.test_number}`,
      topImage: set.topRow.signed_url,
      questionImage: row.signed_url,
      correctAnswer: row.code
    };
  }

  function buildFallbackQuestionList(totalNeeded){
    const list = [];
    if(orientationSets.length){
      orientationSets.forEach((set, idx) => {
        if(!set || !set.viewImages || !set.viewImages.length) return;
        const view = set.viewImages[0];
        if(!view || !view.orient || !DIRECTIONS[view.orient]) return;
        list.push({
          setName: set.name || `קבוצה ${idx + 1}`,
          topImage: set.topImage || '',
          questionImage: view.url,
          correctAnswer: view.orient.toUpperCase()
        });
      });
      return list.slice(0, totalNeeded);
    }
    let counter = 1;
    while(list.length < totalNeeded && counter <= 20){
      const setName = `תרגיל כיוונים ${counter}`;
      const dirs = Object.keys(DIRECTIONS);
      const selectedDir = dirs[(counter - 1) % dirs.length];
      list.push({
        setName,
        topImage: `assets/images/orientation/${setName}/${counter}-TOP.jpeg`,
        questionImage: `assets/images/orientation/${setName}/${counter}-${selectedDir}.jpeg`,
        correctAnswer: selectedDir
      });
      counter += 1;
    }
    return list.slice(0, totalNeeded);
  }

  async function buildQuestionsAsync(){
    const cfg = getConfig();
    const maxExam = Math.max(1, cfg.maxQuestions || 10);
    const data = { practice: [], exam: [] };

    if(!orientationSets.length){
      const sets = await fetchOrientationFromSupabase();
      if(sets && sets.length){
        const ordered = sets.slice().sort((a, b) => (a.test_number || 0) - (b.test_number || 0));
        
        let practicePool = [];
        if(cfg.exampleSets && cfg.exampleSets.length > 0){
            practicePool = ordered.filter(s => cfg.exampleSets.includes(s.test_number));
        } else {
            practicePool = ordered.slice(0, PRACTICE_COUNT);
        }

        practicePool.forEach(set => {
          const q = mapSupabaseSetToQuestion(set, { preferFirst: true });
          if(q) data.practice.push(q);
        });
        
        const examPool = ordered.filter(s => !practicePool.includes(s))
                                .map(set => mapSupabaseSetToQuestion(set)).filter(Boolean);
        
        const shuffled = examPool.sort(() => Math.random() - 0.5);
        data.exam = shuffled.slice(0, maxExam);
        if(!data.exam.length && data.practice.length){
          data.exam = data.practice.slice();
          data.practice = [];
        }
        return data;
      }
    }

    const fallback = buildFallbackQuestionList(maxExam + PRACTICE_COUNT);
    data.practice = fallback.slice(0, PRACTICE_COUNT);
    data.exam = fallback.slice(PRACTICE_COUNT, PRACTICE_COUNT + maxExam);
    if(!data.exam.length && data.practice.length){
      data.exam = data.practice.slice();
      data.practice = [];
    }
    return data;
  }

  function setActiveQuestions(list){
    questions = Array.isArray(list) ? list.slice() : [];
    currentQuestion = 0;
    resetPreloadCache();
  }

  function startObservationCountdown(seconds){
    stopObservationCountdown();
    const duration = Math.max(1, seconds || 10);
    observationActive = true;
    observationDeadline = Date.now() + duration * 1000;
    updateObservationCard();
    observationTicker = setInterval(() => {
      updateObservationCard();
      if(Date.now() >= observationDeadline){
        stopObservationCountdown();
      }
    }, 120);
  }

  function updateObservationCard(){
    if(!window.timerHUD || !observationActive) return;
    const remaining = Math.max(0, observationDeadline - Date.now());
    const mode = stage === 'practice' ? 'practice' : 'observe';
    window.timerHUD.show('זמן צפייה', formatCountdown(remaining), mode);
  }

  function stopObservationCountdown(){
    observationActive = false;
    if(observationTicker){
      clearInterval(observationTicker);
      observationTicker = null;
    }
    if(!answerTimerTicker && !answerDeadline && window.timerHUD){
      window.timerHUD.hide();
    }
  }


  function startAnswerCountdown(seconds){
    stopAnswerCountdown();
    const duration = Math.max(1, seconds || ANSWER_TIME_SEC);
    answerDeadline = Date.now() + duration * 1000;
    updateAnswerCountdown();
    answerTimerTicker = setInterval(() => {
      updateAnswerCountdown();
      if(Date.now() >= answerDeadline){
        markAnswerTimerExpired();
        autoFailActiveQuestion();
      }
    }, 250);
  }

  function updateAnswerCountdown(){
    if(!answerDeadline) return;
    if(window.timerHUD){
      const remaining = Math.max(0, answerDeadline - Date.now());
      window.timerHUD.show('זמן למענה', formatCountdown(remaining), 'answer');
    }
  }

  function markAnswerTimerExpired(){
    if(window.timerHUD){
      window.timerHUD.show('זמן למענה', 'נגמר הזמן', 'answer');
    }
  }

  function stopAnswerCountdown(options){
    if(answerTimerTicker){
      clearInterval(answerTimerTicker);
      answerTimerTicker = null;
    }
    const preserve = options && options.preserveDisplay;
    if(!preserve){
      answerDeadline = 0;
      if(!observationActive && window.timerHUD){
        window.timerHUD.hide();
      }
    } else {
      answerDeadline = 0;
    }
  }

  function autoFailActiveQuestion(){
    handleAnswer(null, { timeout: true });
  }

  function ensurePracticeModal(){
    if(practiceModalEl) return practiceModalEl;
    const overlay = document.createElement('div');
    overlay.id = 'orientation-practice-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:14000;display:none;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="max-width:520px;width:100%;background:#ffffff;color:#0f172a;border-radius:20px;padding:32px;box-shadow:0 25px 55px rgba(15,23,42,0.45);text-align:center;">
        <!-- Content injected dynamically -->
      </div>`;
    document.body.appendChild(overlay);
    practiceModalEl = overlay;
    return overlay;
  }

  function showPracticeModal(onContinue){
    const modal = ensurePracticeModal();
    const contentBox = modal.querySelector('div');
    contentBox.innerHTML = `
        <div style="font-size:2.4rem;margin-bottom:10px">🧭</div>
        <h2 style="margin:0 0 12px;font-size:1.45rem;">התרגול הסתיים</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
          בלחיצה על הכפתור הבא <strong>המבחן האמיתי יתחיל מיד</strong>. התמונות שתקבלו כעת יספרו לציון הרשמי, לכן ודאו שאתם מוכנים.
        </p>
        <button type="button" data-action="confirm" style="padding:12px 20px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">הבנתי – להתחיל מבחן אמיתי</button>
    `;
    modal.style.display = 'flex';
    const confirmBtn = modal.querySelector('[data-action="confirm"]');
    if(confirmBtn){
        confirmBtn.onclick = () => {
            modal.style.display = 'none';
            if(typeof onContinue === 'function') onContinue();
        };
    }
  }

  function showPrePracticeModal(onStart){
    const modal = ensurePracticeModal();
    const contentBox = modal.querySelector('div');
    contentBox.innerHTML = `
        <div style="font-size:2.6rem;margin-bottom:12px">ℹ️</div>
        <h2 style="margin:0 0 12px;font-size:1.45rem;">מתחילים בתרגול</h2>
        <p style="margin:0 0 20px;font-size:1rem;color:#475569;line-height:1.6;">
          המבחן הראשון הוא תרגול בלבד ולא יכנס לציון הסופי ומטרתו היא להכיר את המבחן ולהתנסות בו.
        </p>
        <button type="button" data-action="start-practice" style="padding:12px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;min-width:240px;">התחל תרגול</button>
    `;
    modal.style.display = 'flex';
    const startBtn = modal.querySelector('[data-action="start-practice"]');
    if(startBtn){
        startBtn.onclick = () => {
            modal.style.display = 'none';
            if(typeof onStart === 'function') onStart();
        };
    }
  }

  function getActiveQuestion(){
    if(!questions.length) return null;
    return questions[currentQuestion] || null;
  }

  function showTopView(){
    const q = getActiveQuestion();
    if(!q){
      if(stage === 'practice') finishPractice();
      else finish();
      return;
    }
    if(introView) introView.style.display = 'none';
    testView.style.display = 'block';
    resultsView.style.display = 'none';

    const cfg = getConfig();
    const statusText = stage === 'practice'
      ? 'התבונן במפת התרגול – אין ניקוד. השעון העליון מציג את זמן הצפייה ולאחריו תינתן דקה לבחור תשובה.'
      : 'התבונן במפת הבחינה – התשובה תיספר לציון. השעון העליון מציג את זמן הצפייה ולאחריו תינתן דקה לבחור תשובה.';
    const compassHtml = cfg.showCompass ? `
        <div style="position: absolute; top: 16px; left: 16px; z-index: 10; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="width: 86px; height: 86px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.45); border: 4px solid white;">
            <div style="font-size: 38px; margin-bottom: -8px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.35);">↑</div>
            <div style="font-size: 26px; font-weight: 700; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.35);">N</div>
          </div>
          <div style="background: rgba(0,0,0,0.78); color: white; padding: 6px 14px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
            הצפון למעלה
          </div>
        </div>` : '';
    const mainHtml = `
      <div class="orientation-main-panel">
        <div class="orientation-image-wrapper">
          ${compassHtml}
          <img src="${q._topImgEl ? q._topImgEl.src : q.topImage}" alt="תצוגת מבט על" />
        </div>
      </div>`;
    const footerHtml = `
      <div class="orientation-footer-content">
        <div class="orientation-footer-note-box">
          <span>${statusText}</span>
          <strong style="display:block;margin-top:6px;">התבונן במפה (${cfg.displayTimeSec} שניות) ואז יש לך דקה לענות</strong>
        </div>
      </div>`;

    testView.innerHTML = renderOrientationLayout(mainHtml, footerHtml);
    attachHeaderHUDs();
    mountOrientationInstructionsButton();
    updatePracticeBanner();
    const topBtnSlot = document.getElementById('orientation-top-btn-slot');
    if(topBtnSlot) topBtnSlot.innerHTML = '';

    stopAnswerCountdown();
    startObservationCountdown(cfg.displayTimeSec);
    if(topViewTimer){
      clearTimeout(topViewTimer);
    }
    topViewTimer = setTimeout(() => {
      showQuestion();
    }, Math.max(1, cfg.displayTimeSec) * 1000);
    warmNext(currentQuestion);
  }

  function showQuestion(){
    const q = getActiveQuestion();
    if(!q){
      if(stage === 'practice') finishPractice();
      else finish();
      return;
    }
    if(topViewTimer){
      clearTimeout(topViewTimer);
      topViewTimer = null;
    }
    stopObservationCountdown();
    updatePracticeBanner();
    questionLocked = false;

    const questionPrompt = 'עקוב אחר השעון העליון, בחר את כיוון הצילום בתוך דקה (60 שניות), ואם הזמן מסתיים ללא בחירה – השאלה תסומן כשגויה.';
    const mainHtml = `
      <div class="orientation-main-panel">
        <div class="orientation-image-wrapper">
          <img src="${q._viewImgEl ? q._viewImgEl.src : q.questionImage}" alt="תמונת תצפית" />
        </div>
      </div>`;
    const footerHtml = `
      <div class="orientation-footer-content">
        <div class="orientation-footer-info">
          <p>${questionPrompt}</p>
        </div>
        <div id="answer-buttons" class="orientation-footer-choices">
          ${Object.entries(DIRECTIONS).map(([key, label]) => `
            <button class="orient-answer-btn" data-answer="${key}" style="padding: 15px 30px; font-size: 18px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s; min-width: 180px;">${label}</button>
          `).join('')}
        </div>
      </div>`;

    testView.innerHTML = renderOrientationLayout(mainHtml, footerHtml);
    attachHeaderHUDs();
    mountOrientationInstructionsButton();
    updatePracticeBanner();
    const topBtnSlot = document.getElementById('orientation-top-btn-slot');
    if(topBtnSlot){
      topBtnSlot.innerHTML = '<button id="show-top-btn" class="orientation-top-btn">🗺️ הצג תמונת TOP</button>';
    }

    const showTopBtn = document.getElementById('show-top-btn');
    if(showTopBtn){
      showTopBtn.addEventListener('click', () => openTopImageModal(q._topImgEl ? q._topImgEl.src : q.topImage));
    }
    questionStartTime = Date.now();
    startAnswerCountdown(ANSWER_TIME_SEC);
    document.querySelectorAll('.orient-answer-btn').forEach(btn => {
      btn.addEventListener('click', () => handleAnswer(btn.dataset.answer));
      btn.addEventListener('mouseenter', function(){ this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(102,126,234,0.4)'; });
      btn.addEventListener('mouseleave', function(){ this.style.transform='scale(1)'; this.style.boxShadow='none'; });
    });

    warmNext(currentQuestion);
  }

  function openTopImageModal(topImageUrl){
    const cfg = getConfig();
    const compassModal = cfg.showCompass ? `
        <div style="position: absolute; top: 20px; left: 20px; z-index: 10;">
          <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.5); border: 4px solid white;">
            <div style="font-size: 40px; margin-bottom: -8px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">↑</div>
            <div style="font-size: 28px; font-weight: bold; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">N</div>
          </div>
          <div style="margin-top: 8px; background: rgba(0,0,0,0.8); color: white; padding: 6px 12px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
            הצפון למעלה
          </div>
        </div>` : '';
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:15000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s;';
    modal.innerHTML = `
      <div style="position: relative; max-width: 95%; max-height: 95vh; display: flex; flex-direction: column; align-items: center;">
        ${compassModal}
        <img src="${topImageUrl}" style="max-width: 100%; max-height: 85vh; object-fit: contain; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.6);">
        <button id="close-modal-btn" style="margin-top: 20px;padding: 12px 30px;font-size: 18px;background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);color: white;border: none;border-radius: 8px;cursor: pointer;box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);">✕ סגור</button>
      </div>`;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal-btn');
    const closeModal = () => { modal.remove(); };
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
    const escHandler = (e) => {
      if(e.key === 'Escape'){
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    if(!document.getElementById('orientation-modal-anim')){
      const style = document.createElement('style');
      style.id = 'orientation-modal-anim';
      style.textContent = '@keyframes fadeIn {from {opacity:0;} to {opacity:1;}}';
      document.head.appendChild(style);
    }
  }

  function handleAnswer(answer, options){
    const q = getActiveQuestion();
    if(!q || questionLocked) return;
    questionLocked = true;
    const isTimeout = options && options.timeout;
    stopAnswerCountdown(isTimeout ? { preserveDisplay: true } : undefined);
    const selectedAnswer = isTimeout ? null : answer;
    const correct = selectedAnswer === q.correctAnswer;
    const duration = Math.max(0, Math.round((Date.now() - questionStartTime) / 1000));

    if(stage === 'exam'){
      results.push({
        questionNum: currentQuestion + 1,
        setName: q.setName,
        correctAnswer: DIRECTIONS[q.correctAnswer],
        userAnswer: isTimeout ? 'לא נבחרה תשובה (תם הזמן)' : DIRECTIONS[selectedAnswer],
        correct,
        duration,
        timeout: !!isTimeout
      });
    }

    const btns = document.querySelectorAll('.orient-answer-btn');
    btns.forEach(btn => {
      btn.disabled = true;
      if(!isTimeout && btn.dataset.answer === selectedAnswer){
        btn.style.background = correct ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      }
      if(btn.dataset.answer === q.correctAnswer){
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btn.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.6)';
      }
    });
    setTimeout(() => {
      currentQuestion += 1;
      if(currentQuestion < questions.length){
        showTopView();
      } else if(stage === 'practice'){
        finishPractice();
      } else {
        finish();
      }
    }, 1200);
  }

  function finishPractice(){
    stopObservationCountdown();
    stopAnswerCountdown();
    stage = 'practice-complete';
    updatePracticeBanner();
    showPracticeModal(() => {
      prepareExamPhase();
    });
  }

  async function prepareExamPhase(){
    setActiveQuestions(examQuestions);
    if(!questions.length){
      alert('לא נמצאו שאלות למבחן האמיתי');
      return;
    }
    showLoading('טוען שאלה ראשונה למבחן האמיתי...');
    try {
      await preloadQuestion(0);
    } catch(err){
      console.warn('[orientation] exam preload error', err);
    }
    warmNext(0);
    stage = 'exam';
    updatePracticeBanner();
    results = [];
    showTopView();
  }

  function finish(){
    stopObservationCountdown();
    stopAnswerCountdown();
    stage = 'complete';
    updatePracticeBanner();
    currentQuestion = 0;
    unlockViewport();
    const cfg = getConfig();
    const total = results.length;
    const correct = results.filter(r => r.correct).length;
    const percent = total ? Math.round((correct / total) * 100) : 0;
    const scaleRange = cfg.scaleRange || (window.getGlobalScale ? window.getGlobalScale() : { min: 1, max: 7 });
    const ratio = total ? (correct / total) : 0;
    const safeRatio = Math.max(0, Math.min(1, ratio));
    const rawScore = scaleRange.min + safeRatio * (scaleRange.max - scaleRange.min);
    const clampedScore = Math.min(scaleRange.max, Math.max(scaleRange.min, rawScore));
    const score = Number(clampedScore.toFixed(2));
    const admin = window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin();

    testView.innerHTML = admin ? `
      <div style="width:100%;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:white;">
        <div style="background:rgba(0,0,0,0.7);padding:50px;border-radius:16px;text-align:center;max-width:600px;">
          <h2 style="font-size:36px;margin-bottom:30px;color:#3b82f6;">מבחן הסתיים (מנהל)</h2>
          <div style="font-size:24px;margin-bottom:40px;">
            <div style="margin:15px 0;">סה"כ שאלות: <strong>${total}</strong></div>
            <div style="margin:15px 0;color:#10b981;">תשובות נכונות: <strong>${correct}</strong></div>
            <div style="margin:15px 0;color:#ef4444;">תשובות שגויות: <strong>${total - correct}</strong></div>
            <div style="margin:15px 0;">אחוז הצלחה: <strong>${percent}%</strong></div>
            <div style="margin:25px 0;font-size:32px;color:#fbbf24;">ציון מדורג: <strong>${score} (סקאלה ${scaleRange.min}-${scaleRange.max})</strong></div>
          </div>
          <button onclick="location.reload()" style="padding:15px 40px;font-size:20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;cursor:pointer;">חזור למסך הבית</button>
        </div>
      </div>` : `
      <div style="width:100%;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:white;">
        <div style="background:rgba(0,0,0,0.65);padding:50px;border-radius:20px;text-align:center;max-width:520px;">
          <h2 style="font-size:34px;margin-bottom:28px;color:#3b82f6;">המבחן הסתיים</h2>
          <p style="font-size:20px;margin:0 0 30px;color:#e2e8f0;">המשך למבחן הבא או יציאה.</p>
          <button onclick="location.reload()" style="padding:14px 36px;font-size:19px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:10px;cursor:pointer;">סיום</button>
        </div>
      </div>`;

      if(window.testAuth){
        window.testAuth.showTestCompleteModal('orientation', score.toFixed(2));
      }
    if(window.testsCore){
      window.testsCore.completeTest('orientation', percent, score, { correct, total });
    }
  }

  function resetState(){
    resetTimers();
    stage = 'idle';
    updatePracticeBanner();
    results = [];
    practiceQuestions = [];
    examQuestions = [];
    questions = [];
    currentQuestion = 0;
  }

  async function start(){
    if(startBtn) startBtn.disabled = true;
    
    if(!prePracticeShown){
        prePracticeShown = true;
        await new Promise(resolve => showPrePracticeModal(resolve));
    }

    resetState();
    lockViewport();
    try {
      showLoading('טוען תמונות לשאלה הראשונה...');
      const data = await buildQuestionsAsync();
      practiceQuestions = data.practice || [];
      examQuestions = data.exam || [];
      if(!examQuestions.length && practiceQuestions.length){
        examQuestions = practiceQuestions.slice();
        practiceQuestions = [];
      }
      stage = practiceQuestions.length ? 'practice' : 'exam';
      updatePracticeBanner();
      setActiveQuestions(stage === 'practice' ? practiceQuestions : examQuestions);
      if(!questions.length) throw new Error('לא נמצאו שאלות למבחן');
      await preloadQuestion(0);
      warmNext(0);
      showTopView();
    } catch(err){
      console.error('[orientation] start failed', err);
      alert(err && err.message ? err.message : 'טעינת המבחן נכשלה');
      if(introView) introView.style.display = 'block';
      testView.style.display = 'none';
      resultsView.style.display = 'none';
      unlockViewport();
      updatePracticeBanner();
    } finally {
      if(startBtn) startBtn.disabled = false;
    }
  }

  if(window.testsCore){
    window.testsCore.registerTest('orientation', { title: 'התמצאות וכיוונים' });
  }

  const startBtnEl = startBtn;
  if(startBtnEl) startBtnEl.addEventListener('click', start);
})();
