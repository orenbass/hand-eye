// Navigation Module
(function(){
    function markActive(test){ 
        const all=document.querySelectorAll('#test-selector .nav-btn'); 
        all.forEach(b=>b.classList.remove('active')); 
        const btn=[...all].find(b=>b.dataset.test===test); 
        if(btn) btn.classList.add('active'); 
    }
    
    function enterFullscreenMode() {
        const container = document.querySelector('.container');
        if (container) {
            container.classList.add('fullscreen-test');
        }
    }
    
    function exitFullscreenMode() {
        const container = document.querySelector('.container');
        if (container) {
            container.classList.remove('fullscreen-test');
        }
    }
    
    function switchTo(test){
        // בדוק אם המבחן נעול (אלא אם זה מנהל)
        if (window.testAuth && !window.testAuth.isAdmin()) {
            const btn = document.querySelector(`.nav-btn[data-test="${test}"]`);
            if (btn && btn.disabled) {
                alert('מבחן זה נעול. יש להשלים תחילה את המבחנים הקודמים.');
                return;
            }
        }
        
        // מניעת מעבר למבחנים שכבר הושלמו עבור משתמש רגיל (כבר קיים לוגיקה, הוספת בדיקת isAdmin API החדשה).
        if (window.testAuth && !window.testAuth.isAdmin()) {
            const btn = document.querySelector(`.nav-btn[data-test="${test}"]`);
            if (btn && btn.disabled) {
                alert('לא ניתן לחזור למבחן זה לאחר השלמתו.');
                return;
            }
        }
        
        // יציאה ממצב מסך מלא כשעוברים בין מסכים
        exitFullscreenMode();
        
        document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
        if(test==='eyehand') document.getElementById('welcome-screen').classList.add('active');
        else if(test==='reaction') document.getElementById('reaction-screen').classList.add('active');
        else if(test==='memory') document.getElementById('memory-screen').classList.add('active');
        else if(test==='tracking') document.getElementById('tracking-screen').classList.add('active');
        /* pathnav הוסר */
        else if(test==='northfind') document.getElementById('northfind-screen').classList.add('active');
        else if(test==='flightcontrol') document.getElementById('flightcontrol-screen').classList.add('active');
        else if(test==='targetid') document.getElementById('targetid-screen').classList.add('active');
        else if(test==='orientation') document.getElementById('orientation-screen').classList.add('active');
        else if(test==='flightexam') document.getElementById('flightexam-screen').classList.add('active');
        else if(test==='admin') document.getElementById('admin-screen').classList.add('active');
        markActive(test);
    }
    
    function setupNavigation(){
        const navButtons=document.querySelectorAll('#test-selector .nav-btn');
        navButtons.forEach(btn=>{ 
            btn.addEventListener('click',()=>{
                if (!btn.disabled) {
                    switchTo(btn.dataset.test);
                }
            }); 
        });
        const adminBtn=document.getElementById('admin-button');
        adminBtn && adminBtn.addEventListener('click',()=>{
            if (window.testAuth && window.testAuth.isAdmin()) {
                switchTo('admin');
            } else {
                alert('נדרשת הרשאת מנהל לגישה להגדרות');
            }
        });
    }
    
    function mapScreenId(id){ return id==='welcome'? 'eyehand': id; }
    
    function ensureActiveTest(){
        const included = getIncludedTests();
        if(!included.length) return;
        const activeScreen = document.querySelector('.screen.active');
        if(activeScreen){
            const testId = mapScreenId(activeScreen.id.replace('-screen',''));
            if(!included.includes(testId)){
                switchTo(included[0]);
            }
        } else {
            switchTo(included[0]);
        }
    }
    
    function initDynamicNav(){
        const container=document.getElementById('test-selector');
        if(!container) return;
        const adminActive = !!document.getElementById('admin-screen')?.classList.contains('active');
        // שמירת מבחן פעיל קודם אם קיים (לא מנהל)
        const prevActive = [...container.querySelectorAll('.nav-btn')].find(b=>b.classList.contains('active'))?.dataset.test || null;
        const btns=[...container.querySelectorAll('.nav-btn')];
        // ניקוי מאזינים ישנים: יצירת קלון
        btns.forEach(b=>{ const clone=b.cloneNode(true); if(b.classList.contains('active')) clone.classList.add('active'); b.parentNode.replaceChild(clone,b); });
        const freshBtns=[...container.querySelectorAll('.nav-btn')];
        freshBtns.forEach((btn,idx)=>{
            btn.dataset.order=idx+1;
            btn.addEventListener('click',()=>{ if(!btn.disabled) switchTo(btn.dataset.test); });
        });
        // החלת נעילת משתמש רגיל: רק הראשון פעיל אם לא מנהל
        if(window.testAuth && !window.testAuth.isAdmin()){
            freshBtns.forEach((b,i)=>{ b.disabled = i>0; });
        }
        // השבת מצב פעיל קודם אם קיים
        if(prevActive){
            const match = freshBtns.find(b=>b.dataset.test===prevActive);
            if(match){ match.classList.add('active'); }
        }
        // הימנעות מסוויץ' אוטומטי כאשר במסך הגדרות מנהל
        if(adminActive) return;
        // סימון אקטיבי אם לא קיים
        if(!freshBtns.some(b=>b.classList.contains('active')) && freshBtns.length){
            markActive(freshBtns[0].dataset.test);
            switchTo(freshBtns[0].dataset.test);
        }
    }
    
    function getIncludedTests(){
        const s = window.appSettings || (window.getTestConfig? null: null);
        if(s && Array.isArray(s.tests)) return s.tests.filter(t=>t.include).map(t=>t.id);
        try { const raw = localStorage.getItem('app.settings.v1'); if(raw){ const obj=JSON.parse(raw); if(obj.tests) return obj.tests.filter(t=>t.include).map(t=>t.id); } } catch(e){}
        return [];
    }
    
    function hideExcludedScreens(){
        const included = new Set(getIncludedTests());
        document.querySelectorAll('.screen').forEach(sc=>{
            let id=sc.id.replace('-screen','');
            id = mapScreenId(id);
            if(id==='admin') return; // לא מסתירים אדמין
            if(!included.has(id)) sc.classList.remove('active');
        });
    }
    
    function selectFirstIncluded(force=false){
        const included = getIncludedTests();
        if(!included.length){ return; }
        const current = document.querySelector('#test-selector .nav-btn.active')?.dataset.test;
        if(force || !current || !included.includes(current)){
            switchTo(included[0]);
        }
    }
    
    function initAndSelectFirst(){
        initDynamicNav();
        hideExcludedScreens();
        selectFirstIncluded(true);
    }
    
    window.initDynamicNav=initDynamicNav;
    window.addEventListener('settings-updated', ()=>{ 
        const adminActive = !!document.getElementById('admin-screen')?.classList.contains('active');
        initDynamicNav(); 
        hideExcludedScreens(); 
        if(adminActive) return; // אל תחליף מסך כשנמצאים בהגדרות
        selectFirstIncluded(false); 
    });
    
    document.addEventListener('DOMContentLoaded',()=>{ 
        if(window.settingsReady){ window.settingsReady.then(()=>{ initAndSelectFirst(); ensureActiveTest(); }); } else { initAndSelectFirst(); ensureActiveTest(); }
    });
    window.switchTest=switchTo;
    window.enterFullscreenMode=enterFullscreenMode;
    window.exitFullscreenMode=exitFullscreenMode;
})();