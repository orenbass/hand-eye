// Instructions overlay control (unified for all tests)
(function(){
  // ????? overlay ????
  function createUnifiedOverlay(section, instructionsHTML){
    let overlay = section.querySelector('.unified-instructions-overlay');
    if(overlay) return overlay;
    
    overlay = document.createElement('div');
    overlay.className = 'unified-instructions-overlay';
    
    // ??? ?? ?-HTML ?????? ???? ????
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = instructionsHTML;
    const startBtns = tempDiv.querySelectorAll('.start-test-btn, .btn-primary');
    startBtns.forEach(btn => btn.remove());
    // ???? ?? ???? ???? ?? ?????
    const greeting = tempDiv.querySelector('#welcome-greeting');
    if(greeting) greeting.remove();
    const cleanHTML = tempDiv.innerHTML;
    
    overlay.innerHTML = `
      <div class="unified-instructions-box">
        <button type="button" class="unified-close-btn" aria-label="סגור">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width:24px;height:24px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span class="close-tooltip">יציאה</span>
        </button>
        <div class="unified-instructions-content">
          ${cleanHTML}
        </div>
      </div>
    `;
    
    section.appendChild(overlay);
    
    // ????? ?????
    const closeBtn = overlay.querySelector('.unified-close-btn');
    if(closeBtn){
      closeBtn.addEventListener('click', () => { 
        overlay.style.display = 'none'; 
      });
    }
    
    // ????? ?? ???? ?????
    overlay.addEventListener('click', (e) => {
      if(e.target === overlay){
        overlay.style.display = 'none';
      }
    });
    
    return overlay;
  }

  // ESC ???? - ????? ?????? ???
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){
      document.querySelectorAll('.unified-instructions-overlay').forEach(overlay => {
        if(overlay.style.display === 'flex'){
          overlay.style.display = 'none';
        }
      });
    }
  });

  // ????? overlay
  function openOverlay(overlay){
    if(!overlay) return;
    overlay.style.display = 'flex';
  }
  
  // ????? overlay
  function closeOverlay(overlay){
    if(!overlay) return;
    overlay.style.display = 'none';
  }

  // ??????? ??????? ?????? ?????? ???? ??? ??????
  window.openInstructionsOverlay = function(screenId){
    const section = document.getElementById(screenId);
    if(!section) return;
    let overlay = section.querySelector('.unified-instructions-overlay');
    if(!overlay){
      // ????? overlay ?? ?? ????
      const instr = section.querySelector('.instructions-view');
      if(instr){
        overlay = createUnifiedOverlay(section, instr.innerHTML);
      }
    }
    if(overlay){
      openOverlay(overlay);
    }
  };
  
  // ??????? ??????? ?????? ??????
  window.closeInstructionsOverlay = function(screenId){
    const section = document.getElementById(screenId);
    if(!section) return;
    const overlay = section.querySelector('.unified-instructions-overlay');
    if(overlay){
      closeOverlay(overlay);
    }
  };

  // ????? ?????? ?????? ??????
  function setupInstructionsButtons(){
    document.querySelectorAll('.instructions-toggle-btn').forEach(btn => {
      // ??? ??????? ??????
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', () => {
        // ??? ?? ???? ?????
        const screenAttr = newBtn.dataset.screen;
        let section = screenAttr ? document.getElementById(screenAttr) : null;
        if(!section){
          section = newBtn.closest('section.screen');
        }
        if(!section) return;
        
        // ??? ?? ??? overlay
        let overlay = section.querySelector('.unified-instructions-overlay');
        if(!overlay){
          const instr = section.querySelector('.instructions-view');
          if(instr){
            overlay = createUnifiedOverlay(section, instr.innerHTML);
          }
        }
        
        if(overlay){
          overlay.style.display = overlay.style.display === 'flex' ? 'none' : 'flex';
        }
      });
    });
  }

  // ????? ???? ??? (?????? ???? ????)
  function setupLegacyStructure(){
    document.querySelectorAll('section.screen').forEach(sec => {
      const instr = sec.querySelector('.instructions-view');
      const test = sec.querySelector('.test-view');
      if(!instr || !test) return;
      
      const startBtn = instr.querySelector('.start-test-btn');
      if(startBtn){
        startBtn.addEventListener('click', () => {
          instr.style.display = 'none';
          test.style.display = 'block';
        }, { once: true });
      }
      
      // ????? overlay ????
      createUnifiedOverlay(sec, instr.innerHTML);
    });
    
    // ????? ????? ?-eyehand ??? ?? ???? ????
    setupEyehandInstructions();
  }
  
  // ????? ????? ????? eyehand
  function setupEyehandInstructions(){
    const testScreen = document.getElementById('test-screen');
    const welcomeScreen = document.getElementById('welcome-screen');
    if(!testScreen || !welcomeScreen) return;
    
    const instrBox = welcomeScreen.querySelector('.instructions-box');
    if(!instrBox) return;
    
    // ????? overlay ???? test-screen (eyehand)
    createUnifiedOverlay(testScreen, instrBox.innerHTML);
  }

  // ???? overlays ????? ????? ??????
  function cleanupOldOverlays(){
    document.querySelectorAll('.legacy-instructions-overlay').forEach(el => {
      el.remove();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupLegacyStructure();
    setupInstructionsButtons();
    cleanupOldOverlays();
  });
})();
