// Authentication and Authorization Module
(function(){
    let currentUser = null;
    let currentUserUuid = null;
    let currentUserRecord = null;
    let isAdmin = false;
    let completedTests = new Set();
    let testScores = []; // {id, score}
    let attemptCounts = {}; // testId -> attempts
    
    let testOrder = []; // סדר דינמי ייקבע מההגדרות
    let previewState = {
        active: false,
        testId: null,
        returnTest: 'admin',
        reopenSettings: false
    };

    function isPreviewMode(){ return previewState.active === true; }
    function isEffectiveAdmin(){ return isAdmin && !isPreviewMode(); }

    function getSettingsObject(){
        if(window.appSettings && Array.isArray(window.appSettings.tests)) return window.appSettings;
        try { const raw = localStorage.getItem('app.settings.v1'); if(raw){ const obj = JSON.parse(raw); if(obj && Array.isArray(obj.tests)) return obj; } } catch(e) {}
        return null;
    }
    function refreshTestOrder(){
        const s = getSettingsObject();
        if(s){
            testOrder = s.tests.filter(t=>t.include).map(t=>t.id);
        } else {
            // fallback אם אין הגדרות עדיין
            testOrder = [];
        }
        console.log('[auth] testOrder refreshed:', testOrder);
        if(testOrder.length > 0 && testOrder[0] === 'orientation'){
             console.warn('[auth] ⚠️ Orientation is first in testOrder! This comes from Supabase settings.');
             console.warn('[auth] If this is incorrect, please update the test order in the Admin Panel.');
        }
    }
    function selectFirstAvailable(){
        // מצא את המבחן הבא שעדיין לא הושלם (המשך מאיפה שעצר)
        // הערה: לא קוראים ל-refreshTestOrder כאן כי מי שקורא לפונקציה הזו כבר עושה refresh לפני
        let nextTest = null;
        console.log('[auth] selectFirstAvailable checking against completed:', [...completedTests]);
        for(let i = 0; i < testOrder.length; i++){
            const testId = testOrder[i];
            if(!completedTests.has(testId)){
                nextTest = testId;
                console.log('[auth] Found next available test:', nextTest);
                break;
            }
        }
        // אם כל המבחנים הושלמו, אל תעשה כלום (המשתמש סיים)
        if(!isAdmin && nextTest){
            console.log('[auth] selectFirstAvailable: next test is', nextTest, 'completed:', [...completedTests]);
            if(window.switchTest) window.switchTest(nextTest);
        } else if(!isAdmin && !nextTest && testOrder.length > 0){
            console.log('[auth] selectFirstAvailable: all tests completed');
        }
    }

    function persistSession(){
        try {
            if(currentUser){ localStorage.setItem('currentUser', currentUser); } else { localStorage.removeItem('currentUser'); }
            if(currentUserUuid){ localStorage.setItem('currentUserUuid', currentUserUuid); } else { localStorage.removeItem('currentUserUuid'); }
            if(currentUserRecord){ localStorage.setItem('currentUserRecord', JSON.stringify(currentUserRecord)); } else { localStorage.removeItem('currentUserRecord'); }
            localStorage.setItem('isAdmin', isAdmin ? 'true' : 'false');
            localStorage.setItem('completedTests', JSON.stringify([...completedTests]));
            localStorage.setItem('testScores', JSON.stringify(testScores));
            localStorage.setItem('attemptCounts', JSON.stringify(attemptCounts));
        } catch(e){ console.warn('[auth] persistSession failed', e); }
    }

    function resetSessionState(){
        currentUser = null;
        currentUserUuid = null;
        currentUserRecord = null;
        isAdmin = false;
        completedTests = new Set();
        attemptCounts = {};
        testScores = [];
        previewState.active = false;
        previewState.testId = null;
        previewState.returnTest = 'admin';
        previewState.reopenSettings = false;
        
        // נקה localStorage כדי למנוע מצב לא עקבי
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentUserUuid');
        localStorage.removeItem('currentUserRecord');
        localStorage.removeItem('isAdmin');
        localStorage.removeItem('completedTests');
        localStorage.removeItem('testScores');
        localStorage.removeItem('attemptCounts');
    }

    function validateID(id) {
        // בדיקה בסיסית - לפחות 6 תווים
        return id && id.length >= 6;
    }
    function validatePin(pin){
        return /^\d{4}$/.test(pin||'');
    }
    function formatHebrewDateTime(iso){
        if(!iso) return '';
        try {
            return new Date(iso).toLocaleString('he-IL', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        } catch(err){
            return iso;
        }
    }
    function buildAccessRestrictionMessage(startIso, endIso, state){
        const startLabel = formatHebrewDateTime(startIso);
        const endLabel = formatHebrewDateTime(endIso);
        if(state === 'before'){
            if(startLabel && endLabel){
                return `חלון הכניסה טרם החל. ניתן להתחבר בין ${startLabel} ל-${endLabel}.`;
            }
            if(startLabel){
                return `חלון הכניסה טרם החל. ניתן להתחבר החל מ-${startLabel}.`;
            }
            return 'חלון הכניסה טרם החל.';
        }
        if(state === 'after'){
            if(startLabel && endLabel){
                return `חלון הכניסה הסתיים. ניתן היה להתחבר בין ${startLabel} ל-${endLabel}.`;
            }
            if(endLabel){
                return `חלון הכניסה הסתיים ב-${endLabel}. פנה למנהל להארכת מועד.`;
            }
            return 'חלון הכניסה הסתיים.';
        }
        return '';
    }
    
    async function login(id, pin) {
        const trimmed = (id || '').trim();
        const trimmedPin = (pin || '').trim();
        if (!validateID(trimmed)) {
            throw new Error('תעודת זהות חייבת להכיל לפחות 6 תווים');
        }
        if(!validatePin(trimmedPin)){
            throw new Error('יש להזין קוד כניסה בן 4 ספרות');
        }
        resetSessionState();
        const supaReady = window.examData && typeof window.examData.isReady === 'function' ? window.examData.isReady() : false;
        if(!supaReady){
            throw new Error('חיבור ל-Supabase אינו זמין. נסה שוב בעוד מספר רגעים.');
        }
        const service = window.examData;
        let adminRecord=null;
        if(typeof service.fetchAdminByIdentifier==='function'){
            try{
                adminRecord=await service.fetchAdminByIdentifier(trimmed);
            }catch(err){
                console.warn('[auth] fetchAdminByIdentifier failed', err);
            }
        }
        if(adminRecord){
            if(!adminRecord.entry_pin){
                throw new Error('למשתמש זה לא הוגדר קוד כניסה – פנה למנהל');
            }
            if(adminRecord.entry_pin !== trimmedPin){
                throw new Error('קוד הכניסה שגוי');
            }
            currentUser = trimmed;
            currentUserUuid = adminRecord.id || null;
            currentUserRecord = {
                identifier: trimmed,
                full_name: (adminRecord.full_name || 'מנהל מערכת').trim() || 'מנהל מערכת',
                is_admin: true,
                entry_pin: adminRecord.entry_pin
            };
            isAdmin = true;
            completedTests = new Set();
            attemptCounts = {};
            testScores = [];
            persistSession();
            refreshTestOrder();
            return true;
        }
        
        // חיפוש משתמש לפי שילוב תעודת זהות + קוד כניסה (תומך במספר רישומים לאותה ת.ז.)
        let record = null;
        if(typeof service.fetchUserByCredentials === 'function'){
            record = await service.fetchUserByCredentials(trimmed, trimmedPin);
        }
        
        if(!record){
            // בדוק אם תעודת הזהות קיימת בכלל (לצורך הודעת שגיאה מתאימה)
            const anyUser = await service.fetchUserByIdentifier(trimmed);
            if(anyUser){
                throw new Error('קוד הכניסה שגוי');
            } else {
                throw new Error('המשתמש לא נמצא במערכת');
            }
        }
        
        const windowStart = record.access_window_start ? new Date(record.access_window_start) : null;
        const windowEnd = record.access_window_end ? new Date(record.access_window_end) : null;
        const startMs = windowStart && !Number.isNaN(windowStart.getTime()) ? windowStart.getTime() : null;
        const endMs = windowEnd && !Number.isNaN(windowEnd.getTime()) ? windowEnd.getTime() : null;
        const nowMs = Date.now();
        if(startMs && nowMs < startMs){
            throw new Error(buildAccessRestrictionMessage(record.access_window_start, record.access_window_end, 'before'));
        }
        if(endMs && nowMs > endMs){
            throw new Error(buildAccessRestrictionMessage(record.access_window_start, record.access_window_end, 'after'));
        }

        // בדוק האם המשתמש כבר סיים את כל המבחנים
        if(record.all_tests_done === true){
            throw new Error('סיימת כבר את כל המבחנים עם קוד זה. לקבלת קוד חדש פנה למנהל.');
        }
        
        const fullName = [record.first_name, record.last_name].filter(Boolean).join(' ').trim();
        currentUser = record.national_id || trimmed;
        currentUserUuid = record.id || null;
        currentUserRecord = Object.assign({}, record, {
            identifier: record.national_id || trimmed,
            full_name: fullName || record.national_id || trimmed,
            is_admin: false
        });
        isAdmin = false;
        completedTests = new Set();
        attemptCounts = {};
        testScores = [];
        
        // טען הגדרות המבחנים מהדאטא בייס
        let requiredTests = [];
        if(service && typeof service.fetchActiveSettings === 'function'){
          try {
            const remoteSettings = await service.fetchActiveSettings();
            if(remoteSettings && remoteSettings.payload){
              const payload = remoteSettings.payload;
              let remoteTestsConfig = null;
              
              // תמיכה ב-2 פורמטים: settings.tests או testsLayout.tests
              if(payload.settings && Array.isArray(payload.settings.tests)){
                remoteTestsConfig = payload.settings;
                console.log('[auth] Using payload.settings format');
              } else if(payload.testsLayout && Array.isArray(payload.testsLayout.tests)){
                // המרת testsLayout לפורמט settings
                remoteTestsConfig = {
                  tests: payload.testsLayout.tests.map(t => ({
                    id: t.id,
                    name: t.name || t.id,
                    include: t.include !== false
                  }))
                };
                console.log('[auth] Using payload.testsLayout format');
              }
              
              if(remoteTestsConfig && Array.isArray(remoteTestsConfig.tests)){
                requiredTests = remoteTestsConfig.tests
                  .filter(t => t.include !== false)
                  .map(t => t.id);
                console.log('[auth] Loaded required tests from database:', requiredTests);
                
                // מיזוג עם הגדרות קיימות (שמור הגדרות ספציפיות כמו seconds, difficulty)
                if(!window.appSettings) window.appSettings = {};
                if(Array.isArray(window.appSettings.tests)){
                  // עדכן רק include וסדר, שמור על שאר ההגדרות
                  const orderMap = new Map();
                  remoteTestsConfig.tests.forEach((t, idx) => {
                    orderMap.set(t.id, { include: t.include !== false, order: idx });
                  });
                  window.appSettings.tests = window.appSettings.tests
                    .map(t => {
                      const remote = orderMap.get(t.id);
                      if(remote){
                        return Object.assign({}, t, { include: remote.include });
                      }
                      return t;
                    })
                    .sort((a, b) => {
                      const aOrder = orderMap.has(a.id) ? orderMap.get(a.id).order : 999;
                      const bOrder = orderMap.has(b.id) ? orderMap.get(b.id).order : 999;
                      return aOrder - bOrder;
                    });
                } else {
                  window.appSettings.tests = remoteTestsConfig.tests;
                }
                
                // שמור גם ב-localStorage
                localStorage.setItem('app.settings.v1', JSON.stringify(window.appSettings));
                localStorage.setItem('requiredTests', JSON.stringify(requiredTests));
                // שלח אירוע עדכון הגדרות כדי שהניווט יתעדכן
                window.dispatchEvent(new Event('settings-updated'));
                console.log('[auth] Dispatched settings-updated event');
                
                // בנייה מחדש של ה-UI באופן יזום אם הפונקציה קיימת
                if(typeof window.buildTestSelectorUI === 'function'){
                    console.log('[auth] Calling buildTestSelectorUI explicitly');
                    window.buildTestSelectorUI();
                } else {
                    console.warn('[auth] window.buildTestSelectorUI is not available');
                }
              }
            }
          } catch(err){
            console.warn('[auth] Failed to load settings from database, using local config', err);
            // fallback - קרא מהגדרות מקומיות
            if(window.appSettings && Array.isArray(window.appSettings.tests)){
              requiredTests = window.appSettings.tests
                .filter(t => t.include !== false)
                .map(t => t.id);
            }
          }
        }
        
        // קרא את רשימת המבחנים המושלמים מהדאטה בייס
        if(record.tests_completed && Array.isArray(record.tests_completed)){
            record.tests_completed.forEach(testId => {
                completedTests.add(testId);
            });
            console.log('[auth] Loaded completed tests from database:', [...completedTests]);
        }
        
        try {
            const attempts = await service.fetchUserAttempts(currentUserUuid);
            attempts.forEach(att=>{
                if(!att || !att.test_id) return;
                completedTests.add(att.test_id);
                const idx = att.attempt_index || 1;
                attemptCounts[att.test_id] = Math.max(attemptCounts[att.test_id] || 0, idx);
                if(typeof att.scaled_score === 'number'){
                    testScores = testScores.filter(s=>s.id!==att.test_id);
                    testScores.push({ id: att.test_id, score: att.scaled_score });
                }
            });
        } catch(err){
            console.warn('[auth] failed to pull attempts', err);
        }
        persistSession();
        refreshTestOrder();
        updateWelcomeGreeting();
        return true;
    }
    
    function updateWelcomeGreeting(){
        // עדכן ברכה במסך ההוראות
        const greetingEl = document.getElementById('welcome-greeting');
        if(greetingEl) greetingEl.style.display = 'none'; // הסתרה קבועה לפי בקשת משתמש
        
        // עדכן ברכה במסך ההקדמה הכללי
        const introGreetingEl = document.getElementById('intro-welcome-greeting');
        const introNameEl = document.getElementById('intro-user-name');
        
        const shouldShow = currentUserRecord && currentUserRecord.full_name && !currentUserRecord.is_admin;
        const userName = shouldShow ? currentUserRecord.full_name : '';
        
        // מסך ההקדמה הכללי
        if(introGreetingEl && introNameEl){
            if(shouldShow){
                introNameEl.textContent = userName;
                introGreetingEl.style.display = 'block';
            } else {
                introGreetingEl.style.display = 'none';
            }
        }
    }
    
    function logout() {
        exitPreviewMode();
        resetSessionState(); // זה גם מנקה localStorage
        
        // שחרר נעילת מבחן אם קיימת
        if(window.examLock) window.examLock.unlock();
        
        // הסתר ברכת שלום
        const greetingEl = document.getElementById('welcome-greeting');
        if(greetingEl) greetingEl.style.display = 'none';
    }
    
    // התחלת שאלון המשוב
    function startFeedbackSurvey() {
        console.log('[auth] Starting feedback survey');
        
        // שחרר נעילת מבחן כדי לאפשר הקלדה חופשית במשוב
        if(window.examLock && typeof window.examLock.unlock === 'function') {
            console.log('[auth] Unlocking exam for feedback survey');
            window.examLock.unlock();
        }
        
        // שחרר גם נעילת אינטראקציות אם קיימת
        if(window.testsCore && typeof window.testsCore.unlockAllInteractions === 'function') {
            console.log('[auth] Unlocking all interactions for feedback survey');
            window.testsCore.unlockAllInteractions();
        }
        
        // הסתר את כל הסקשנים
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
        document.querySelector('.container').style.display = 'none';
        
        // הצג את סקשן המשוב
        const feedbackSection = document.getElementById('feedback-section');
        if (feedbackSection) {
            feedbackSection.style.display = 'block';
        }
        
        // אתחל את שאלון המשוב
        const userId = localStorage.getItem('currentUserUuid');
        if (window.feedbackSurvey) {
            window.feedbackSurvey.init('feedback-container', userId, () => {
                // בסיום המשוב - התנתק
                logout();
                showLoginScreen();
                
                // הסתר את סקשן המשוב
                if (feedbackSection) feedbackSection.style.display = 'none';
                document.querySelector('.container').style.display = 'block';
            });
        }
    }
    
    function markTestCompleted(testName) {
        if(!testName) return;
        completedTests.add(testName);
        attemptCounts[testName] = (attemptCounts[testName] || 0) + 1;
        persistSession();
        updateTestButtons();
    }
    
    function getNextTest(currentTest) {
        const currentIndex = testOrder.indexOf(currentTest);
        if (currentIndex >= 0 && currentIndex < testOrder.length - 1) {
            return testOrder[currentIndex + 1];
        }
        return null;
    }
    
    function updateTestButtons() {
        refreshTestOrder();
        const buttons = document.querySelectorAll('#test-selector .nav-btn');
        // הסתרת כפתורים שאינם בסדר הנוכחי (אולי נשארו ישנים)
        buttons.forEach(btn=>{ if(!testOrder.includes(btn.dataset.test)) btn.style.display='none'; else btn.style.display=''; });
        
        // כפתורי מנהל - הצג רק למנהל, הסתר מכולם אחרים
        const adminBtn = document.getElementById('admin-button');
        const scoresBtn = document.getElementById('scores-button');
        
        if (isAdmin) {
            buttons.forEach(btn => { btn.disabled = false; btn.classList.remove('locked'); });
            if (adminBtn) adminBtn.style.display = 'block';
            if(scoresBtn) scoresBtn.style.display='block';
            console.log('[auth] updateTestButtons: Admin mode - showing admin controls');
            return;
        }
        
        // משתמש רגיל - הסתר כפתורי מנהל
        if (adminBtn) adminBtn.style.display = 'none';
        if(scoresBtn) scoresBtn.style.display='none';
        console.log('[auth] updateTestButtons: User mode - hiding admin controls');
        let highest = -1; completedTests.forEach(t=>{ const idx=testOrder.indexOf((t||'').trim()); if(idx>highest) highest=idx; });
        console.log('[auth] completedTests=', [...completedTests], 'highestIdx=', highest, 'order=', testOrder);
        buttons.forEach(btn => {
            const testName = (btn.dataset.test||'').trim();
            const testIndex = testOrder.indexOf(testName);
            if (testIndex === -1) { btn.disabled = true; btn.classList.add('locked'); return; }
            if (testIndex <= highest) { btn.disabled = true; btn.classList.add('locked'); return; }
            if (testIndex === highest + 1) { btn.disabled = false; btn.classList.remove('locked'); return; }
            btn.disabled = true; btn.classList.add('locked');
        });
        // ביטחון נוסף: ודא שהמבחן הבא אחרי האחרון שהושלם פתוח
        const nextIdx = highest + 1;
        if (nextIdx >= 0 && nextIdx < testOrder.length) {
            const nextName = testOrder[nextIdx];
            const nb = document.querySelector(`.nav-btn[data-test="${nextName}"]`);
            if (nb) { nb.disabled = false; nb.classList.remove('locked'); }
        }
    }
    
    function showLoginScreen() {
        const loginScreen = document.getElementById('login-screen');
        const container = document.querySelector('.container');
        
        if (loginScreen && container) {
            loginScreen.style.display = 'flex';
            container.style.display = 'none';
        }
    }
    
    function hideLoginScreen() {
        const loginScreen = document.getElementById('login-screen');
        const container = document.querySelector('.container');
        
        if (loginScreen && container) {
            loginScreen.style.display = 'none';
            container.style.display = 'block';
        }
    }
    
    function showTestCompleteModal(testName, score) {
        const modal = document.getElementById('test-complete-modal');
        const testNameEl = document.getElementById('modal-test-name');
        const scoreEl = document.getElementById('modal-score-value');
        const nextBtn = document.getElementById('next-test-button');
        const finishBtn = document.getElementById('finish-all-button');
        
        if (!modal) {
            console.warn('[auth] Modal not found, skipping showTestCompleteModal');
            return;
        }
        
        // שמות המבחנים בעברית
        const testNames = {
            'eyehand': 'תיאום עין-יד',
            'reaction': 'זמן תגובה',
            'memory': 'זיכרון מרחבי',
            'tracking': 'מעקב ודיוור קשב',
            // 'pathnav': 'ניווט נתיב', הוסר
            'northfind': 'מציאת הצפון',
            'flightcontrol': 'בקרת טיסה',
            'targetid': 'ירי במטרות',
            'orientation': 'התמצאות וכיוונים',
            'flightexam': 'מבחן הטסה'
        };
        
        if (testNameEl) {
            testNameEl.textContent = testNames[testName] || testName;
        }
        // שמירת הציון פנימית (גם אם לא מוצג)
        testScores = testScores.filter(s=>s.id!==testName); testScores.push({id:testName, score:score}); localStorage.setItem('testScores', JSON.stringify(testScores));
        persistSession();
        const nextTest = getNextTest(testName);
        const effectiveAdmin = isEffectiveAdmin();
        const previewActive = isPreviewMode();
        
        // כפתור המעבר למשוב
        const feedbackBtn = document.getElementById('go-to-feedback-button');
        if (feedbackBtn) feedbackBtn.style.display = 'none';
        
        if (!effectiveAdmin) {
            // הסתרת תיבת ציון למשתמש רגיל או במצב תצוגה
            if (scoreEl && scoreEl.parentElement) scoreEl.parentElement.style.display='none';
        } else {
            if (scoreEl) scoreEl.textContent = score;
            if (scoreEl && scoreEl.parentElement) scoreEl.parentElement.style.display='block';
        }
        
        if (previewActive) {
            nextBtn.style.display='none';
            finishBtn.style.display='block';
            finishBtn.textContent='חזרה להגדרות';
            finishBtn.onclick=()=>{
                modal.style.display='none';
                const target = previewState.returnTest || 'admin';
                const reopen = !!previewState.reopenSettings;
                exitPreviewMode();
                if(window.switchTest && target){ window.switchTest(target); }
                if(reopen){
                    const settingsPanel = document.getElementById('settingsPanel');
                    if(settingsPanel) settingsPanel.classList.add('open');
                }
            };
        } else if (nextTest && !effectiveAdmin) {
            nextBtn.style.display='block'; finishBtn.style.display='none';
            nextBtn.textContent='המשך';
            nextBtn.onclick=()=>{ modal.style.display='none'; if(window.switchTest) window.switchTest(nextTest); };
        } else if (nextTest && effectiveAdmin) {
            nextBtn.style.display='block'; finishBtn.style.display='none';
            nextBtn.onclick=()=>{ modal.style.display='none'; if(window.switchTest) window.switchTest(nextTest); };
        } else {
            // אין מבחן הבא => סיום כל המבחנים - מעבר לשאלון משוב
            nextBtn.style.display='none'; 
            finishBtn.style.display='none';
            
            // בדיקה אם המשוב מופעל בהגדרות
            const feedbackEnabledSetting = window.appSettings?.feedbackEnabled !== false;
            
            if (!effectiveAdmin && feedbackEnabledSetting) {
                // משתמש רגיל ומשוב מופעל - הצג כפתור מעבר למשוב
                if (feedbackBtn) {
                    feedbackBtn.style.display = 'block';
                    feedbackBtn.textContent = 'מעבר לשאלון משוב';
                    feedbackBtn.onclick = () => {
                        modal.style.display = 'none';
                        startFeedbackSurvey();
                    };
                }
            } else {
                // מנהל או משוב מבוטל - הצג כפתור סיום
                finishBtn.style.display='block';
                finishBtn.textContent='סיים';
                finishBtn.onclick=()=>{ modal.style.display='none'; alert('כל המבחנים הושלמו!'); };
            }
        }
        
        modal.style.display='flex';
    }
    
    function showIntroScreen() {
        const intro = document.getElementById('general-intro-screen');
        if(intro) intro.style.display = 'flex';
    }

    function hideIntroScreen() {
        const intro = document.getElementById('general-intro-screen');
        if(intro) intro.style.display = 'none';
    }

    function setupLoginForm() {
        const loginButton = document.getElementById('login-button');
        const idInput = document.getElementById('id-input');
        const pinInput = document.getElementById('pin-input');
        const errorMsg = document.getElementById('login-error');
        
        // Setup Intro Button
        const introStartBtn = document.getElementById('intro-start-btn');
        if(introStartBtn) {
            introStartBtn.textContent = 'מעבר לבדיקת אמצעים';
            introStartBtn.addEventListener('click', () => {
                hideIntroScreen();
                if(window.showSystemCheck) {
                    window.showSystemCheck();
                } else {
                    // Fallback if system check module not loaded
                    selectFirstAvailable();
                }
            });
        }
        
        // Bind the callback for when system check is done
        window.startTestsAfterCheck = () => {
            selectFirstAvailable();
        };
        
        if (!loginButton || !idInput || !pinInput) return;
        const defaultLabel = loginButton.textContent;
        
        const handleLogin = async () => {
            const id = idInput.value.trim();
            const pin = pinInput.value.trim();
            loginButton.disabled = true;
            loginButton.textContent = 'מתחבר...';
            errorMsg.style.display = 'none';
            try {
                await login(id, pin);
                console.log('[auth] Login successful. isAdmin:', isAdmin, 'user:', currentUser);
                errorMsg.style.display = 'none';
                hideLoginScreen();
                updateTestButtons();
                hideUserStatsIfNeeded();
                applyBodyMode();
                updateWelcomeGreeting(); // הצג ברכת שלום
                if(!isAdmin) {
                    console.log('[auth] User is not admin - showing intro screen');
                    showIntroScreen();
                } else {
                    console.log('[auth] User is admin - skipping intro screen');
                }
            } catch(err){
                errorMsg.style.display = 'block';
                errorMsg.textContent = (err && err.message) ? err.message : 'שגיאה בהתחברות';
            } finally {
                loginButton.disabled = false;
                loginButton.textContent = defaultLabel;
            }
        };
        
        loginButton.addEventListener('click', handleLogin);
        [idInput, pinInput].forEach(input=>{
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleLogin();
                }
            });
        });
        // פוקוס אוטומטי
        idInput.focus();
    }
    
    function setupLogoutButton() {
        const logoutButton = document.getElementById('logout-button');
        if (!logoutButton) {
            console.warn('[auth] logout-button not found');
            return;
        }
        
        console.log('[auth] Setting up logout button');
        
        logoutButton.addEventListener('click', (e) => {
            console.log('[auth] Logout button clicked');
            e.preventDefault();
            e.stopPropagation();
            
            if (confirm('האם אתה בטוח שברצונך לצאת מהמערכת?')) {
                console.log('[auth] User confirmed logout');
                logout(); 
                showLoginScreen();
                // במקום לכפות eyehand – מנקה מצבים
                const navButtons = document.querySelectorAll('.nav-btn'); 
                navButtons.forEach(btn => { btn.disabled = true; btn.classList.add('locked'); });
                const scoresBtn = document.getElementById('scores-button'); 
                if(scoresBtn) scoresBtn.style.display='none';
                if(window.scoresView && typeof window.scoresView.close === 'function') window.scoresView.close();
                applyBodyMode(); 
                hideUserStatsIfNeeded();
            } else {
                console.log('[auth] User cancelled logout');
            }
        });
    }
    
    function enterPreviewMode(testId, options){
        if(previewState.active) exitPreviewMode();
        const opts = options || {};
        previewState.active = true;
        previewState.testId = testId || null;
        previewState.returnTest = opts.returnTest || 'admin';
        previewState.reopenSettings = !!opts.reopenSettings;
        applyBodyMode();
        hideUserStatsIfNeeded();
    }

    function exitPreviewMode(){
        if(!previewState.active) return;
        previewState.active = false;
        previewState.testId = null;
        previewState.returnTest = 'admin';
        previewState.reopenSettings = false;
        applyBodyMode();
        hideUserStatsIfNeeded();
    }

    function hideUserStatsIfNeeded(){
        const hide = !isEffectiveAdmin();
        const targets = document.querySelectorAll('.test-stats, .stats-bar, .final-score-box, .results-details');
        targets.forEach(el=>{
            if(!el) return;
            if(hide){ el.style.display='none'; }
            else { el.style.removeProperty('display'); }
        });
    }

    function applyBodyMode(){
        const b=document.body; if(!b) return;
        if(isEffectiveAdmin()) b.classList.remove('user-mode'); else b.classList.add('user-mode');
    }

    function init() {
        // בדוק אם יש משתמש מחובר
        const savedUser = localStorage.getItem('currentUser');
        const savedAdmin = localStorage.getItem('isAdmin') === 'true';
        const savedUuid = localStorage.getItem('currentUserUuid');
        const savedRecordRaw = localStorage.getItem('currentUserRecord');
        
        if(savedRecordRaw){ try{ currentUserRecord = JSON.parse(savedRecordRaw); }catch(e){ currentUserRecord = null; } }
        
        if (savedUser) {
            currentUser = savedUser;
            currentUserUuid = savedUuid || null;
            isAdmin = savedAdmin;
            
            // אם מנהל - פשוט הכנס
            if (isAdmin) {
                hideLoginScreen(); 
                refreshTestOrder(); 
                updateTestButtons(); 
                hideUserStatsIfNeeded(); 
                applyBodyMode();
                return;
            }
            
            // אם משתמש רגיל - בדוק מול DB אם יש לו מבחנים שהושלמו
            hideLoginScreen();
            refreshTestOrder();
            updateTestButtons();
            hideUserStatsIfNeeded();
            applyBodyMode();
            updateWelcomeGreeting();
            
            // תמיד בדוק מול DB - אם אין מבחנים מושלמים, חזור למסך פתיחה
            if(savedUuid){
                checkUserProgressFromDb(savedUuid).then((hasProgress)=>{
                    if(hasProgress){
                        // יש מבחנים שהושלמו - המשך מאיפה שעצרת
                        updateTestButtons();
                        selectFirstAvailable();
                    } else {
                        // אין מבחנים שהושלמו - הצג מסך פתיחה ובדיקת אמצעים
                        showIntroScreen();
                    }
                });
            } else {
                // אין UUID - הצג מסך פתיחה
                showIntroScreen();
            }
        } else { 
            showLoginScreen(); 
        }
        
        setupLoginForm();
        setupLogoutButton();
    }
    
    // פונקציה לבדיקת התקדמות משתמש מה-DB
    async function checkUserProgressFromDb(userId){
        if(!userId) return false;
        const service = window.examData;
        if(!service) return false;
        
        // המתן שה-Supabase יהיה מוכן
        const isReady = typeof service.isReady === 'function' ? service.isReady() : true;
        if(!isReady){
            console.log('[auth] Supabase not ready, waiting...');
            // נסה להמתין קצת
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        try {
            // טען את ה-attempts של המשתמש מהדאטאבייס
            if(typeof service.fetchUserAttempts === 'function'){
                const attempts = await service.fetchUserAttempts(userId);
                
                // נקה מצב קודם
                completedTests = new Set();
                attemptCounts = {};
                testScores = [];
                
                attempts.forEach(att=>{
                    if(!att || !att.test_id) return;
                    completedTests.add(att.test_id);
                    const idx = att.attempt_index || 1;
                    attemptCounts[att.test_id] = Math.max(attemptCounts[att.test_id] || 0, idx);
                    if(typeof att.scaled_score === 'number'){
                        testScores.push({ id: att.test_id, score: att.scaled_score });
                    }
                });
                console.log('[auth] Loaded from DB - completed tests:', [...completedTests]);
                
                // עדכון localStorage (לצורך שמירה זמנית בלבד)
                persistSession();
                
                return completedTests.size > 0;
            }
        } catch(err){
            console.warn('[auth] checkUserProgressFromDb failed', err);
        }
        return false;
    }
    
    // חשיפת API גלובלי
    window.testAuth = {
        getCurrentUser: () => currentUser,
        getCurrentUserUuid: () => currentUserUuid,
        getCurrentUserRecord: () => currentUserRecord,
        isAdmin: () => isEffectiveAdmin(),
        hasAdminAccess: () => isAdmin,
        isPreviewMode: () => isPreviewMode(),
        getPreviewState: () => Object.assign({}, previewState),
        enterPreviewMode: (testId, options)=> enterPreviewMode(testId, options || {}),
        exitPreviewMode,
        markTestCompleted,
        showTestCompleteModal,
        logout,
        getNextTest,
        hasCompleted: (test)=> completedTests.has(test),
        getAttemptCount: (test)=> attemptCounts[test] || 0,
        getScores: () => testScores.slice(),
        refreshCompletedTests: async function(userId){
          // רענן את רשימת המבחנים המושלמים מהדאטה בייס
          if(!userId) return;
          const service = window.examData;
          if(!service || typeof service.fetchUserByIdentifier !== 'function') return;
          try {
            // קבל רשומה עדכנית של המשתמש
            const record = await service.fetchUserByIdentifier(currentUser);
            if(record && record.tests_completed && Array.isArray(record.tests_completed)){
              completedTests = new Set(record.tests_completed);
              console.log('[auth] Refreshed completed tests from database:', [...completedTests]);
              persistSession();
              updateTestButtons();
            }
          } catch(err){
            console.warn('[auth] Failed to refresh completed tests', err);
          }
        }
    };
    
    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('settings-updated', ()=>{
        // כל שינוי בהגדרות מעדכן סדר מבחנים ונעילות
        refreshTestOrder(); updateTestButtons(); if(!isAdmin) selectFirstAvailable();
    });
})();
