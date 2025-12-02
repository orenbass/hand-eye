// targetid.utils.js
export function makeRng(seed=987654){ let s=seed>>>0; return ()=> (s=(s*1664525+1013904223)>>>0)/4294967296; }
export function spawnTarget(rng, canvas, speed, goodProb){
  const good = rng() < goodProb;
  const r = good?12:14;
  const x = rng()*canvas.width;
  const y = rng()*canvas.height;
  const ang = rng()*Math.PI*2;
  const v = speed*(0.7+rng()*0.6);
  return {x,y,vx:Math.cos(ang)*v,vy:Math.sin(ang)*v,r,good};
}
export function formatClock(sec){ const s=Math.floor(sec%60), m=Math.floor(sec/60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
