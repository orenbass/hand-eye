// Global Practice Banner HUD
(function(){
  function resolveHost(target){
    if(target instanceof HTMLElement) return target;
    return document.body;
  }

  function ensureBanner(){
    let el = document.getElementById('global-practice-banner');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'global-practice-banner';
    el.className = 'global-practice-banner hidden';
    el.innerHTML = `
      <div class="practice-banner-inner">
        <div class="practice-banner-label">מצב תרגול</div>
        <div class="practice-banner-sub" id="global-practice-banner-sub">השאלות בשלב זה אינן נחשבות לציון</div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  function show(options){
    const el = ensureBanner();
    const opts = options || {};
    const labelEl = el.querySelector('.practice-banner-label');
    const subEl = el.querySelector('.practice-banner-sub');
    if(labelEl) labelEl.textContent = opts.label || 'מצב תרגול';
    if(subEl){
      if(opts.description){
        subEl.textContent = opts.description;
        subEl.style.display = 'block';
      } else {
        subEl.textContent = '';
        subEl.style.display = 'none';
      }
    }
    // Set mode in dataset for CSS styling
    if(opts.mode){
      el.dataset.mode = opts.mode;
      el.setAttribute('data-mode', opts.mode);
    } else {
      el.dataset.mode = 'practice';
      el.setAttribute('data-mode', 'practice');
    }
    el.classList.remove('hidden');
  }

  function hide(){
    const el = ensureBanner();
    el.classList.add('hidden');
  }

  function setPosition(pos){
    const el = ensureBanner();
    if(!pos) return;
    if(typeof pos.top === 'number'){
      el.style.top = `${pos.top}px`;
    }
    if(typeof pos.left === 'number'){
      el.style.left = `${pos.left}px`;
      el.style.right = 'auto';
      el.style.transform = 'translateX(0)';
    }
    if(typeof pos.right === 'number'){
      el.style.right = `${pos.right}px`;
      if(!pos.left){
        el.style.left = 'auto';
        el.style.transform = 'translateX(0)';
      }
    }
  }

  function attach(target){
    const el = ensureBanner();
    const host = resolveHost(target);
    if(el.parentNode !== host){
      host.appendChild(el);
    }
    if(host === document.body){
      el.classList.remove('inline-mode');
    } else {
      el.classList.add('inline-mode');
    }
  }

  window.practiceBanner = { show, hide, setPosition, attach };
})();
