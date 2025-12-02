// Global timer HUD shared across tests
(function(){
  function resolveHost(target){
    if(target instanceof HTMLElement) return target;
    return document.body;
  }

  let cardEl = null;
  let labelEl = null;
  let valueEl = null;

  function ensureCard(){
    if(cardEl) return cardEl;
    cardEl = document.createElement('div');
    cardEl.id = 'global-timer-card';
    cardEl.className = 'global-timer-card hidden';
    cardEl.innerHTML = `
      <div class="global-timer-label">זמן</div>
      <div class="global-timer-value">--:--</div>
    `;
    document.body.appendChild(cardEl);
    labelEl = cardEl.querySelector('.global-timer-label');
    valueEl = cardEl.querySelector('.global-timer-value');
    return cardEl;
  }

  function show(label, value, mode){
    const card = ensureCard();
    if(typeof label === 'string' && labelEl){
      labelEl.textContent = label;
    }
    if(typeof value === 'string' && valueEl){
      valueEl.textContent = value;
    }
    if(mode){
      card.setAttribute('data-mode', mode);
    } else {
      card.removeAttribute('data-mode');
    }
    card.classList.remove('hidden');
  }

  function update(value){
    ensureCard();
    valueEl.textContent = typeof value === 'string' ? value : '--:--';
  }

  function hide(){
    if(!cardEl) return;
    cardEl.classList.add('hidden');
    cardEl.removeAttribute('data-mode');
  }

  function setPosition(position){
    const card = ensureCard();
    if(card.classList.contains('inline-mode')) return;
    if(position === 'left'){
      card.style.left = '24px';
      card.style.right = 'auto';
    } else {
      card.style.right = '24px';
      card.style.left = 'auto';
    }
  }

  function attach(target){
    const card = ensureCard();
    const host = resolveHost(target);
    if(card.parentNode !== host){
      host.appendChild(card);
    }
    if(host === document.body){
      card.classList.remove('inline-mode');
      card.style.position = 'fixed';
    } else {
      card.classList.add('inline-mode');
    }
  }

  window.timerHUD = {
    show,
    update,
    hide,
    setPosition,
    attach
  };
})();
