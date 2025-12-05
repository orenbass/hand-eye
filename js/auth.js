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
        console.log('[auth] testOrder refreshed', testOrder);
    }
    function selectFirstAvailable(){
        refreshTestOrder();
        // מצא את המבחן הבא שעדיין לא הושלם (המשך מאיפה שעצר)
        let nextTest = null;
        for(let i = 0; i < testOrder.length; i++){
            const testId = testOrder[i];
            if(!completedTests.has(testId)){
                nextTest = testId;
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
            if(remoteSettings && remoteSettings.payload && remoteSettings.payload.settings && Array.isArray(remoteSettings.payload.settings.tests)){
              requiredTests = remoteSettings.payload.settings.tests
                .filter(t => t.include !== false)
                .map(t => t.id);
              console.log('[auth] Loaded required tests from database:', requiredTests);
              // שמור את רשימת המבחנים הנדרשים בסשן
              localStorage.setItem('requiredTests', JSON.stringify(requiredTests));
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
        return true;
    }
    
    function logout() {
        resetSessionState();
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentUserUuid');
        localStorage.removeItem('currentUserRecord');
        localStorage.removeItem('isAdmin');
        localStorage.removeItem('completedTests');
        localStorage.removeItem('testScores');
        localStorage.removeItem('attemptCounts');
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
        if (isAdmin) {
            buttons.forEach(btn => { btn.disabled = false; btn.classList.remove('locked'); });
            const adminBtn = document.getElementById('admin-button'); if (adminBtn) adminBtn.style.display = 'block';
            const scoresBtn = document.getElementById('scores-button'); if(scoresBtn) scoresBtn.style.display='block';
            return;
        }
        const scoresBtn = document.getElementById('scores-button'); if(scoresBtn) scoresBtn.style.display='none';
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
        
        if (!modal) return;
        
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
        
        testNameEl.textContent = testNames[testName] || testName;
        // שמירת הציון פנימית (גם אם לא מוצג)
        testScores = testScores.filter(s=>s.id!==testName); testScores.push({id:testName, score:score}); localStorage.setItem('testScores', JSON.stringify(testScores));
        persistSession();
        const nextTest = getNextTest(testName);
        
        if (!isAdmin) {
            // הסתרת תיבת ציון למשתמש רגיל
            if (scoreEl && scoreEl.parentElement) scoreEl.parentElement.style.display='none';
        } else {
            scoreEl.textContent = score;
            if (scoreEl && scoreEl.parentElement) scoreEl.parentElement.style.display='block';
        }
        
        if (nextTest && !isAdmin) {
            nextBtn.style.display='block'; finishBtn.style.display='none';
            nextBtn.textContent='המשך';
            nextBtn.onclick=()=>{ modal.style.display='none'; if(window.switchTest) window.switchTest(nextTest); };
        } else if (nextTest && isAdmin) {
            nextBtn.style.display='block'; finishBtn.style.display='none';
            nextBtn.onclick=()=>{ modal.style.display='none'; if(window.switchTest) window.switchTest(nextTest); };
        } else {
            // אין מבחן הבא => סיום כל המבחנים
            nextBtn.style.display='none'; finishBtn.style.display='block';
            if (!isAdmin) {
                finishBtn.textContent='סיים';
                finishBtn.onclick=()=>{ logout(); modal.style.display='none'; showLoginScreen(); };
            } else {
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
            introStartBtn.addEventListener('click', () => {
                hideIntroScreen();
                selectFirstAvailable();
            });
        }
        
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
                errorMsg.style.display = 'none';
                hideLoginScreen();
                updateTestButtons();
                hideUserStatsIfNeeded();
                applyBodyMode();
                if(!isAdmin) {
                    showIntroScreen();
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
        if (!logoutButton) return;
        
        logoutButton.addEventListener('click', () => {
            if (confirm('האם אתה בטוח שברצונך לצאת מהמערכת?')) {
                logout(); showLoginScreen();
                // במקום לכפות eyehand – מנקה מצבים
                const navButtons = document.querySelectorAll('.nav-btn'); navButtons.forEach(btn => { btn.disabled = true; btn.classList.add('locked'); });
                const scoresBtn = document.getElementById('scores-button'); if(scoresBtn) scoresBtn.style.display='none';
                if(window.scoresView && typeof window.scoresView.close === 'function') window.scoresView.close();
                applyBodyMode(); hideUserStatsIfNeeded();
            }
        });
    }
    
    function hideUserStatsIfNeeded(){
        if(!isAdmin){
            document.querySelectorAll('.test-stats, .stats-bar, .final-score-box, .results-details').forEach(el=>{ el.style.display='none'; });
        }
    }

    function applyBodyMode(){ const b=document.body; if(!b) return; if(isAdmin) b.classList.remove('user-mode'); else b.classList.add('user-mode'); }

    function init() {
        // בדוק אם יש משתמש מחובר
        const savedUser = localStorage.getItem('currentUser');
        const savedAdmin = localStorage.getItem('isAdmin') === 'true';
        const savedCompleted = localStorage.getItem('completedTests');
        const savedScores = localStorage.getItem('testScores'); if(savedScores){ try{ testScores = JSON.parse(savedScores)||[]; }catch(e){ testScores=[]; } }
        const savedUuid = localStorage.getItem('currentUserUuid');
        const savedRecordRaw = localStorage.getItem('currentUserRecord');
        const savedAttempts = localStorage.getItem('attemptCounts');
        if(savedRecordRaw){ try{ currentUserRecord = JSON.parse(savedRecordRaw); }catch(e){ currentUserRecord = null; } }
        if(savedAttempts){ try{ attemptCounts = JSON.parse(savedAttempts) || {}; }catch(e){ attemptCounts = {}; } } else { attemptCounts = {}; }
        
        if (savedUser) {
            currentUser = savedUser;
            currentUserUuid = savedUuid || null;
            isAdmin = savedAdmin;
            if (savedCompleted) {
                try { completedTests = new Set(JSON.parse(savedCompleted)); }
                catch(e){ completedTests = new Set(); }
            }
            hideLoginScreen(); refreshTestOrder(); updateTestButtons(); hideUserStatsIfNeeded(); applyBodyMode();
            
            // רענן את המבחנים שהושלמו מהדאטאבייס (למקרה שהשתנו)
            if(!isAdmin && savedUuid){
                refreshCompletedTestsFromDb(savedUuid).then(()=>{
                    updateTestButtons();
                    selectFirstAvailable();
                });
            } else if(!isAdmin) {
                selectFirstAvailable();
            }
        } else { showLoginScreen(); }
        
        setupLoginForm();
        setupLogoutButton();
    }
    
    // פונקציה פנימית לרענון מבחנים שהושלמו מהדאטאבייס
    async function refreshCompletedTestsFromDb(userId){
        if(!userId) return;
        const service = window.examData;
        if(!service) return;
        
        // המתן שה-Supabase יהיה מוכן
        const isReady = typeof service.isReady === 'function' ? service.isReady() : true;
        if(!isReady){
            console.log('[auth] Supabase not ready, skipping refresh');
            return;
        }
        
        try {
            // טען את ה-attempts של המשתמש מהדאטאבייס
            if(typeof service.fetchUserAttempts === 'function'){
                const attempts = await service.fetchUserAttempts(userId);
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
                console.log('[auth] Refreshed completed tests from DB:', [...completedTests]);
                persistSession();
            }
        } catch(err){
            console.warn('[auth] refreshCompletedTestsFromDb failed', err);
        }
    }
    
    // חשיפת API גלובלי
    window.testAuth = {
        getCurrentUser: () => currentUser,
        getCurrentUserUuid: () => currentUserUuid,
        getCurrentUserRecord: () => currentUserRecord,
        isAdmin: () => isAdmin,
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
