// Exam Lock Module - Prevents user from exiting exam
(function(){
    let isLocked = false;
    let allowedKeys = new Set();
    let fullscreenCheckInterval = null;
    let fullscreenRetryCount = 0;
    const MAX_RETRY_ATTEMPTS = 10;
    
    // המקשים שמותרים במבחנים
    const DEFAULT_ALLOWED_KEYS = [
        '1', '2', '3', '4',
        ' ', 'Space',
        'Enter',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
    ];
    
    // מקשים שתמיד חסומים (גם אם לא במצב נעול)
    const ALWAYS_BLOCKED_DURING_EXAM = [
        'F5',           // Refresh
        'F11',          // Toggle fullscreen
        'F12',          // DevTools
        'Escape'        // Exit fullscreen
    ];
    
    // קיצורי מקשים חסומים
    const BLOCKED_COMBOS = [
        { ctrl: true, key: 'r' },       // Ctrl+R - Refresh
        { ctrl: true, key: 'w' },       // Ctrl+W - Close tab
        { ctrl: true, key: 'n' },       // Ctrl+N - New window
        { ctrl: true, key: 't' },       // Ctrl+T - New tab
        { ctrl: true, key: 'l' },       // Ctrl+L - Address bar
        { ctrl: true, key: 'd' },       // Ctrl+D - Bookmark
        { ctrl: true, shift: true, key: 'i' },  // Ctrl+Shift+I - DevTools
        { ctrl: true, shift: true, key: 'j' },  // Ctrl+Shift+J - Console
        { ctrl: true, shift: true, key: 'c' },  // Ctrl+Shift+C - Inspector
        { alt: true, key: 'F4' },       // Alt+F4 - Close window
        { alt: true, key: 'Tab' },      // Alt+Tab - Switch window
        { meta: true, key: 'r' },       // Cmd+R (Mac)
        { meta: true, key: 'w' },       // Cmd+W (Mac)
        { meta: true, key: 'q' }        // Cmd+Q (Mac)
    ];
    
    function setAllowedKeys(keys) {
        allowedKeys = new Set(keys || DEFAULT_ALLOWED_KEYS);
    }
    
    function isKeyAllowed(e) {
        // בדוק אם זה combo חסום
        for (const combo of BLOCKED_COMBOS) {
            const ctrlMatch = combo.ctrl ? (e.ctrlKey || e.metaKey) : true;
            const shiftMatch = combo.shift ? e.shiftKey : !e.shiftKey || !combo.shift;
            const altMatch = combo.alt ? e.altKey : true;
            const metaMatch = combo.meta ? e.metaKey : true;
            const keyMatch = e.key.toLowerCase() === combo.key.toLowerCase();
            
            if (ctrlMatch && shiftMatch && altMatch && metaMatch && keyMatch) {
                return false;
            }
        }
        
        // בדוק מקשים שתמיד חסומים
        if (ALWAYS_BLOCKED_DURING_EXAM.includes(e.key)) {
            return false;
        }
        
        // בדוק אם יש Ctrl/Alt/Meta (חוץ מ-Space)
        if ((e.ctrlKey || e.altKey || e.metaKey) && e.key !== ' ') {
            return false;
        }
        
        // בדוק אם המקש ברשימה המותרת
        return allowedKeys.has(e.key);
    }
    
    function handleKeyDown(e) {
        if (!isLocked) return;
        
        if (!isKeyAllowed(e)) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[exam-lock] Blocked key:', e.key);
            return false;
        }
    }
    
    function handleContextMenu(e) {
        if (!isLocked) return;
        e.preventDefault();
        return false;
    }
    
    function handleBeforeUnload(e) {
        if (!isLocked) return;
        e.preventDefault();
        e.returnValue = 'המבחן עדיין בתהליך. האם אתה בטוח שברצונך לצאת?';
        return e.returnValue;
    }
    
    function isInFullscreen() {
        return !!(document.fullscreenElement || 
                  document.webkitFullscreenElement || 
                  document.mozFullScreenElement || 
                  document.msFullscreenElement);
    }
    
    function handleFullscreenChange() {
        if (!isLocked) return;
        
        // אם יצא מ-fullscreen, נסה לחזור אליו מיד
        if (!isInFullscreen()) {
            console.log('[exam-lock] User exited fullscreen, re-entering immediately...');
            fullscreenRetryCount = 0;
            forceFullscreen();
        }
    }
    
    function forceFullscreen() {
        if (isInFullscreen()) return;
        
        fullscreenRetryCount++;
        console.log('[exam-lock] Fullscreen attempt #' + fullscreenRetryCount);
        
        enterFullscreen().then(success => {
            if (!success && fullscreenRetryCount < MAX_RETRY_ATTEMPTS && isLocked) {
                // נסה שוב אחרי השהייה קצרה (רק אם נעול)
                setTimeout(forceFullscreen, 200);
            }
        });
    }
    
    function startFullscreenMonitor() {
        // בדיקה תקופתית שאנחנו עדיין במסך מלא
        if (fullscreenCheckInterval) {
            clearInterval(fullscreenCheckInterval);
        }
        
        fullscreenCheckInterval = setInterval(() => {
            if (!isLocked) return;
            
            if (!isInFullscreen()) {
                console.log('[exam-lock] Fullscreen check: not in fullscreen, forcing...');
                forceFullscreen();
            }
        }, 1000); // בדיקה כל שנייה
    }
    
    function stopFullscreenMonitor() {
        if (fullscreenCheckInterval) {
            clearInterval(fullscreenCheckInterval);
            fullscreenCheckInterval = null;
        }
    }
    
    function handleVisibilityChange() {
        if (!isLocked) return;
        
        if (document.hidden) {
            console.log('[exam-lock] Tab became hidden');
        } else {
            // כשחוזרים לטאב, וודא שאנחנו במסך מלא
            console.log('[exam-lock] Tab became visible, checking fullscreen...');
            setTimeout(() => {
                if (isLocked && !isInFullscreen()) {
                    forceFullscreen();
                }
            }, 100);
        }
    }
    
    async function enterFullscreen() {
        const elem = document.documentElement;
        
        try {
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                await elem.mozRequestFullScreen();
            } else if (elem.msRequestFullscreen) {
                await elem.msRequestFullscreen();
            }
            console.log('[exam-lock] Entered fullscreen');
            return true;
        } catch (err) {
            console.warn('[exam-lock] Failed to enter fullscreen:', err);
            return false;
        }
    }
    
    function exitFullscreen() {
        try {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        } catch (err) {
            console.warn('[exam-lock] Failed to exit fullscreen:', err);
        }
    }
    
    function lock(customAllowedKeys) {
        if (isLocked) return;
        
        isLocked = true;
        fullscreenRetryCount = 0;
        setAllowedKeys(customAllowedKeys || DEFAULT_ALLOWED_KEYS);
        
        // הוסף event listeners
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('contextmenu', handleContextMenu, true);
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // הכנס ל-fullscreen
        enterFullscreen();
        
        // התחל מעקב תקופתי
        startFullscreenMonitor();
        
        // הוסף class ל-body
        document.body.classList.add('exam-locked');
        
        console.log('[exam-lock] Exam locked');
    }
    
    function unlock() {
        if (!isLocked) return;
        
        isLocked = false;
        
        // עצור מעקב תקופתי
        stopFullscreenMonitor();
        
        // הסר event listeners
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('contextmenu', handleContextMenu, true);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        
        // צא מ-fullscreen
        exitFullscreen();
        
        // הסר class מה-body
        document.body.classList.remove('exam-locked');
        
        console.log('[exam-lock] Exam unlocked');
    }
    
    // חשיפת API גלובלי
    window.examLock = {
        lock: lock,
        unlock: unlock,
        isLocked: () => isLocked,
        setAllowedKeys: setAllowedKeys,
        enterFullscreen: enterFullscreen,
        exitFullscreen: exitFullscreen,
        forceFullscreen: forceFullscreen
    };
    
})();