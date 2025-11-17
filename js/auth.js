// Authentication and Authorization Module
(function(){
    const ADMIN_IDS = ['200419174', 'ronmalkin']; // תעודות זהות של מנהלים
    
    let currentUser = null;
    let isAdmin = false;
    let completedTests = new Set();
    let testScores = []; // {id, score}
    
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
        const first = testOrder[0];
        if(!isAdmin && first){
            if(window.switchTest) window.switchTest(first);
        }
    }

    function validateID(id) {
        // בדיקה בסיסית - לפחות 6 תווים
        return id && id.length >= 6;
    }
    
    function isAdminID(id) {
        return ADMIN_IDS.includes(id);
    }
    
    function login(id) {
        if (!validateID(id)) {
            return false;
        }
        
        currentUser = id;
        isAdmin = isAdminID(id);
        
        // אתחול התקדמות
        completedTests = new Set();
        
        // שמירה ב-localStorage
        localStorage.setItem('currentUser', currentUser);
        localStorage.setItem('isAdmin', isAdmin ? 'true' : 'false');
        localStorage.setItem('completedTests', JSON.stringify([]));
        
        refreshTestOrder();
        
        return true;
    }
    
    function logout() {
        currentUser = null;
        isAdmin = false;
        completedTests.clear();
        localStorage.removeItem('currentUser');
        localStorage.removeItem('isAdmin');
        localStorage.removeItem('completedTests');
    }
    
    function markTestCompleted(testName) {
        completedTests.add(testName);
        localStorage.setItem('completedTests', JSON.stringify([...completedTests]));
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
            return;
        }
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
                finishBtn.textContent='הורד תוצאות ויציאה';
                finishBtn.onclick=()=>{ downloadScoresFile(); logout(); modal.style.display='none'; showLoginScreen(); };
            } else {
                finishBtn.textContent='סיים';
                finishBtn.onclick=()=>{ modal.style.display='none'; alert('כל המבחנים הושלמו!'); };
            }
        }
        
        modal.style.display='flex';
    }
    
    function setupLoginForm() {
        const loginButton = document.getElementById('login-button');
        const idInput = document.getElementById('id-input');
        const errorMsg = document.getElementById('login-error');
        
        if (!loginButton || !idInput) return;
        
        const handleLogin = () => {
            const id = idInput.value.trim();
            
            if (login(id)) {
                errorMsg.style.display = 'none';
                hideLoginScreen();
                updateTestButtons();
                hideUserStatsIfNeeded();
                applyBodyMode();
                if(!isAdmin) selectFirstAvailable();
            } else {
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'תעודת זהות חייבת להכיל לפחות 6 תווים';
            }
        };
        
        loginButton.addEventListener('click', handleLogin);
        idInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
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
                applyBodyMode(); hideUserStatsIfNeeded();
            }
        });
    }
    
    function downloadScoresFile(){
        const header='test,score\n';
        const body=testScores.map(s=>`${s.id},${s.score}`).join('\n');
        const blob=new Blob([header+body],{type:'text/csv;charset=utf-8;'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download='scores_'+(currentUser||'user')+'.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
        
        if (savedUser) {
            currentUser = savedUser; isAdmin = savedAdmin; if (savedCompleted) { completedTests = new Set(JSON.parse(savedCompleted)); }
            hideLoginScreen(); refreshTestOrder(); updateTestButtons(); hideUserStatsIfNeeded(); applyBodyMode();
            if(!isAdmin) selectFirstAvailable();
        } else { showLoginScreen(); }
        
        setupLoginForm();
        setupLogoutButton();
    }
    
    // חשיפת API גלובלי
    window.testAuth = {
        getCurrentUser: () => currentUser,
        isAdmin: () => isAdmin,
        markTestCompleted,
        showTestCompleteModal,
        logout,
        getNextTest,
        hasCompleted: (test)=> completedTests.has(test),
        getScores: () => testScores.slice(),
        downloadScores: downloadScoresFile,
        forceRefreshNav: updateTestButtons
    };
    
    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('settings-updated', ()=>{
        // כל שינוי בהגדרות מעדכן סדר מבחנים ונעילות
        refreshTestOrder(); updateTestButtons(); if(!isAdmin) selectFirstAvailable();
    });
})();
