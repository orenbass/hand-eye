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
        else if(test==='pathnav') document.getElementById('pathnav-screen').classList.add('active');
        else if(test==='northfind') document.getElementById('northfind-screen').classList.add('active');
        else if(test==='flightcontrol') document.getElementById('flightcontrol-screen').classList.add('active');
        else if(test==='targetid') document.getElementById('targetid-screen').classList.add('active');
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
        // default highlight
        markActive('eyehand');
    }
    
    document.addEventListener('DOMContentLoaded',()=>{ setupNavigation(); });
    window.switchTest=switchTo;
    window.enterFullscreenMode=enterFullscreenMode;
    window.exitFullscreenMode=exitFullscreenMode;
})();