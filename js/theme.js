// Theme toggle + persistence
(function(){
  const KEY='app.theme';
  const root=document.documentElement;
  function apply(mode){
    root.setAttribute('data-theme', mode);
    // Sync with CSS that expects body.dark-mode
    document.body && document.body.classList.toggle('dark-mode', mode==='dark');
    const btn=document.getElementById('theme-toggle');
    if(btn) btn.textContent = mode==='dark'?'☀':'🌙';
  }
  let saved=localStorage.getItem(KEY)||''; if(saved!=='dark'&&saved!=='light'){ saved=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'; }
  apply(saved);
  document.addEventListener('DOMContentLoaded',()=>{
    const btn=document.getElementById('theme-toggle'); if(!btn) return;
    btn.addEventListener('click',()=>{ const cur=root.getAttribute('data-theme')==='dark'?'dark':'light'; const next=cur==='dark'?'light':'dark'; localStorage.setItem(KEY,next); apply(next); });
  });
})();