// Instructions overlay control (updated for inline-first pattern)
(function(){
  function setupSection(section){
    const inline = section.querySelector('.inline-instructions');
    const overlay = section.querySelector('.instructions-overlay');
    const testContent = section.querySelector('.test-content');
    const toggleBtn = section.querySelector('.instructions-toggle');
    if(!inline || !overlay || !toggleBtn) return; // not a test screen using pattern
    const startBtn = inline.querySelector('.start-test-btn');
    // initial state: show inline instructions, hide test content & toggle
    if(testContent) testContent.style.display='none';
    toggleBtn.style.display='none';
    let storedHTML = inline.innerHTML; // capture instructions markup

    function openOverlay(){
      overlay.innerHTML = '<div class="instructions-box">'+ storedHTML + '<button type="button" class="btn btn-secondary close-float" style="margin-top:14px">סגור</button></div>';
      overlay.classList.add('open');
      const closeBtn = overlay.querySelector('.close-float');
      if(closeBtn) closeBtn.onclick = closeOverlay;
      // remove start button inside overlay if test already running
      if(testStarted){ const sb = overlay.querySelector('.start-test-btn'); if(sb) sb.style.display='none'; }
    }
    function closeOverlay(){ overlay.classList.remove('open'); }

    let testStarted = false;
    startBtn && startBtn.addEventListener('click',()=>{
      // hide inline instructions; show test content & toggle button
      if(inline) inline.style.display='none';
      if(testContent) {
        testContent.style.display='block';
        testContent.style.visibility='visible';
        testContent.style.opacity='1';
        // Force canvases inside to be visible
        const canvases = testContent.querySelectorAll('canvas');
        canvases.forEach(c => {
          c.style.display = 'block';
          c.style.visibility = 'visible';
          c.style.opacity = '1';
        });
      }
      toggleBtn.style.display='inline-block';
      testStarted = true;
    }, { once:true });

    toggleBtn.addEventListener('click',()=>{
      if(!overlay.classList.contains('open')) openOverlay(); else closeOverlay();
    });
  }

  // Fallback for current structure (.instructions-view/.test-view + .instructions-toggle-btn)
  function setupLegacyStructure(){
    document.querySelectorAll('section.screen').forEach(sec=>{
      const instr = sec.querySelector('.instructions-view');
      const test = sec.querySelector('.test-view');
      if(!instr || !test) return; // Eye-hand or admin/results may differ
      const startBtn = instr.querySelector('.start-test-btn');
      const toggle = test.querySelector('.instructions-toggle-btn');
      if(startBtn){
        startBtn.addEventListener('click',()=>{
          instr.style.display='none';
          test.style.display='block';
        }, { once:true });
      }
      if(toggle){
        // Create a lightweight overlay element if not present
        let overlay = sec.querySelector('.legacy-instructions-overlay');
        if(!overlay){
          overlay = document.createElement('div');
          overlay.className='legacy-instructions-overlay';
          overlay.style.cssText='position:fixed;inset:0;display:none;z-index:1000;background:rgba(0,0,0,0.55);overflow:auto;padding:40px';
          overlay.innerHTML='<div class="instructions-box" style="max-width:800px;margin:0 auto;position:relative"><button type="button" class="close-legacy" style="position:absolute;top:12px;left:12px" title="סגור">✕</button>'+ (instr.innerHTML) +'</div>';
          sec.appendChild(overlay);
          overlay.querySelector('.close-legacy').addEventListener('click',()=>{ overlay.style.display='none'; });
        }
        toggle.addEventListener('click',()=>{ overlay.style.display = overlay.style.display==='none'? 'block':'none'; });
      }
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('section.screen').forEach(setupSection);
    setupLegacyStructure();
  });
})();