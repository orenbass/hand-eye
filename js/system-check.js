// System Check Module - Wizard Flow
(function(){
    let checks = {
        mouse: false,
        camera: false,
        keyboard: false
    };
    
    let currentStep = 'mouse'; // mouse -> camera -> keyboard
    const REQUIRED_KEYS = ['1', '2', '3', '4', ' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    let pressedKeys = new Set();
    let stream = null;
    
    // Mouse check state
    let mouseTargets = ['top-left', 'top-right', 'bottom-right', 'bottom-left', 'center'];
    let currentTargetIndex = 0;

    function initSystemCheck() {
        const screen = document.getElementById('system-check-screen');
        if (!screen) return;

        // Reset state
        checks = { mouse: false, camera: false, keyboard: false };
        currentStep = 'mouse';
        pressedKeys.clear();
        currentTargetIndex = 0;
        
        // Reset UI
        resetAllPanels();
        updateStepIndicators();
        showPanel('mouse');

        // Setup mouse check button
        const startMouseBtn = document.getElementById('start-mouse-check-btn');
        if(startMouseBtn) {
            startMouseBtn.onclick = startMouseCheck;
        }
    }

    function resetAllPanels() {
        // Reset step circles text
        const stepNums = { 'mouse': '1', 'camera': '2', 'keyboard': '3' };
        ['mouse', 'camera', 'keyboard'].forEach(step => {
            const stepEl = document.getElementById(`step-${step}`);
            if (stepEl) {
                const circle = stepEl.querySelector('.step-circle');
                if (circle) circle.textContent = stepNums[step];
            }
        });
        
        // Reset keys UI
        document.querySelectorAll('.key-check').forEach(el => el.classList.remove('pressed'));
        
        // Reset camera
        const video = document.getElementById('camera-preview');
        if (video) video.srcObject = null;
        
        // Reset camera status
        const cameraStatus = document.getElementById('camera-status');
        if (cameraStatus) {
            cameraStatus.textContent = 'מחכה לאישור מצלמה...';
            cameraStatus.style.color = '#94a3b8';
        }
        
        // Hide complete section
        const completeSection = document.getElementById('check-complete-section');
        if (completeSection) completeSection.style.display = 'none';
    }

    function updateStepIndicators() {
        const steps = ['mouse', 'camera', 'keyboard'];
        steps.forEach(step => {
            const stepEl = document.getElementById(`step-${step}`);
            if (!stepEl) return;
            
            stepEl.classList.remove('active', 'completed');
            
            if (checks[step]) {
                stepEl.classList.add('completed');
                // Update circle to checkmark
                const circle = stepEl.querySelector('.step-circle');
                if (circle) circle.textContent = '✓';
            } else if (currentStep === step) {
                stepEl.classList.add('active');
            }
        });
    }

    function showPanel(panelName) {
        // Hide all panels
        document.querySelectorAll('.check-panel').forEach(p => p.style.display = 'none');
        
        // Show the requested panel
        const panel = document.getElementById(`panel-${panelName}`);
        if (panel) panel.style.display = 'block';
    }

    function goToNextStep() {
        if (currentStep === 'mouse') {
            currentStep = 'camera';
            updateStepIndicators();
            showPanel('camera');
            startCamera();
        } else if (currentStep === 'camera') {
            currentStep = 'keyboard';
            updateStepIndicators();
            showPanel('keyboard');
            document.addEventListener('keydown', handleKeyDown);
        } else if (currentStep === 'keyboard') {
            // All done!
            showCompleteSection();
        }
    }

    // ========== MOUSE CHECK ==========
    function startMouseCheck() {
        currentTargetIndex = 0;
        
        // Create overlay
        let overlay = document.getElementById('mouse-check-overlay');
        if(!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'mouse-check-overlay';
            overlay.className = 'mouse-check-overlay';
            document.body.appendChild(overlay);
        }
        
        overlay.innerHTML = `
            <div class="mouse-check-instructions">לחץ על העיגול האדום</div>
            <div id="mouse-target" class="mouse-target"></div>
        `;
        overlay.style.display = 'block';
        
        showNextMouseTarget();
    }
    
    function showNextMouseTarget() {
        const target = document.getElementById('mouse-target');
        const instructions = document.querySelector('.mouse-check-instructions');
        if(!target) return;
        
        if(currentTargetIndex >= mouseTargets.length) {
            finishMouseCheck();
            return;
        }
        
        // Update instructions
        if (instructions) {
            instructions.textContent = `לחץ על העיגול (${currentTargetIndex + 1}/${mouseTargets.length})`;
        }
        
        const pos = mouseTargets[currentTargetIndex];
        target.className = `mouse-target ${pos}`;
        
        // Remove old listener by cloning
        const newTarget = target.cloneNode(true);
        target.parentNode.replaceChild(newTarget, target);
        
        newTarget.addEventListener('click', () => {
            currentTargetIndex++;
            showNextMouseTarget();
        });
    }
    
    function finishMouseCheck() {
        const overlay = document.getElementById('mouse-check-overlay');
        if(overlay) overlay.remove();
        
        checks.mouse = true;
        goToNextStep();
    }

    // ========== CAMERA CHECK ==========
    async function startCamera() {
        const video = document.getElementById('camera-preview');
        const status = document.getElementById('camera-status');
        
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            
            checks.camera = true;
            if (status) {
                status.textContent = '✓ מצלמה תקינה!';
                status.style.color = '#10b981';
            }
            
            // Auto-advance after 1.5 seconds
            setTimeout(() => {
                goToNextStep();
            }, 1500);
            
        } catch (err) {
            console.error('Camera error:', err);
            if (status) {
                status.textContent = '❌ שגיאה בגישה למצלמה: ' + err.message;
                status.style.color = '#ef4444';
            }
        }
    }

    // ========== KEYBOARD CHECK ==========
    function handleKeyDown(e) {
        if (checks.keyboard) return;
        
        let key = e.key;
        
        // Map for display matching
        const displayKeyMap = {
            ' ': 'Space',
            'Enter': 'Enter',
            '1': '1', '2': '2', '3': '3', '4': '4',
            'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown', 
            'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight'
        };

        const mappedKey = displayKeyMap[key] || key;

        if (REQUIRED_KEYS.includes(key) || REQUIRED_KEYS.includes(mappedKey)) {
            pressedKeys.add(key);
            const keyEl = document.querySelector(`.key-check[data-key="${mappedKey}"]`);
            if (keyEl) keyEl.classList.add('pressed');
            
            if (checkAllKeysPressed()) {
                checks.keyboard = true;
                document.removeEventListener('keydown', handleKeyDown);
                goToNextStep();
            }
        }
    }

    function checkAllKeysPressed() {
        const allEls = document.querySelectorAll('.key-check');
        const pressedEls = document.querySelectorAll('.key-check.pressed');
        return allEls.length === pressedEls.length;
    }

    // ========== COMPLETE ==========
    function showCompleteSection() {
        // Hide all panels
        document.querySelectorAll('.check-panel').forEach(p => p.style.display = 'none');
        
        // Show complete section
        const completeSection = document.getElementById('check-complete-section');
        if (completeSection) completeSection.style.display = 'block';
        
        // Update all step indicators
        updateStepIndicators();
    }

    function closeSystemCheck() {
        const screen = document.getElementById('system-check-screen');
        if (screen) screen.style.display = 'none';
        
        // Stop listeners
        document.removeEventListener('keydown', handleKeyDown);
        
        // Remove overlay if exists
        const overlay = document.getElementById('mouse-check-overlay');
        if(overlay) overlay.remove();
        
        // Stop camera
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
    }

    // Expose to window
    window.showSystemCheck = function() {
        const screen = document.getElementById('system-check-screen');
        if (screen) {
            screen.style.display = 'flex';
            initSystemCheck();
        }
    };

    // Setup button listener
    document.addEventListener('DOMContentLoaded', () => {
        const startBtn = document.getElementById('system-check-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                // נעל את המבחן - fullscreen + חסימת מקשים (חייב להיות ראשון, בתוך ה-click handler!)
                if (window.examLock && !window.testAuth?.isAdmin()) {
                    // קודם כל נכנס ל-fullscreen (חייב להיות סינכרוני עם ה-click)
                    await window.examLock.enterFullscreen();
                    window.examLock.lock();
                }
                
                closeSystemCheck();
                
                // Call the original start function
                if (window.startTestsAfterCheck) {
                    window.startTestsAfterCheck();
                }
            });
        }
    });

})();
