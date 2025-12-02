// northfind.utils.js
export function generateRandomMap(width=800,height=800,seed=0){
  const c=document.createElement('canvas'); c.width=width; c.height=height; const g=c.getContext('2d');
  let s=seed>>>0; const rnd=()=> (s=(s*1664525+1013904223)>>>0)/4294967296;
  const palettes=[['#d9e4cc','#c9d8b6','#b5c59a'],['#e2d7c3','#d3c3a5','#bba27c'],['#c8d6e5','#b1c6dc','#9bb4cf']];
  const pal=palettes[Math.floor(rnd()*palettes.length)];
  const grad=g.createLinearGradient(0,0,width,height); grad.addColorStop(0,pal[0]); grad.addColorStop(.5,pal[1]); grad.addColorStop(1,pal[2]); g.fillStyle=grad; g.fillRect(0,0,width,height);
  for(let i=0;i<100;i++){ g.fillStyle=`rgba(0,0,0,${0.05*rnd()})`; g.beginPath(); g.arc(rnd()*width,rnd()*height,20+rnd()*35,0,Math.PI*2); g.fill(); }
  const vCount=3+Math.floor(rnd()*3), hCount=3+Math.floor(rnd()*3), margin=40; const v=[],h=[]; for(let i=0;i<vCount;i++) v.push(margin+rnd()*(width-2*margin)); for(let i=0;i<hCount;i++) h.push(margin+rnd()*(height-2*margin)); v.sort((a,b)=>a-b); h.sort((a,b)=>a-b);
  g.lineCap='round'; v.forEach(x=>{ g.strokeStyle='#5a5a5a'; g.lineWidth=46; g.beginPath(); g.moveTo(x,margin/2); g.lineTo(x,height-margin/2); g.stroke(); }); h.forEach(y=>{ g.strokeStyle='#5a5a5a'; g.lineWidth=46; g.beginPath(); g.moveTo(margin/2,y); g.lineTo(width-margin/2,y); g.stroke(); });
  v.forEach(x=>{ g.strokeStyle='#7a7a7a'; g.lineWidth=40; g.beginPath(); g.moveTo(x,0); g.lineTo(x,height); g.stroke(); }); h.forEach(y=>{ g.strokeStyle='#7a7a7a'; g.lineWidth=40; g.beginPath(); g.moveTo(0,y); g.lineTo(width,y); g.stroke(); });
  g.setLineDash([22,14]); g.strokeStyle='#e9e08a'; g.lineWidth=4; v.forEach(x=>{ if(rnd()<0.6){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,height); g.stroke(); }}); h.forEach(y=>{ if(rnd()<0.6){ g.beginPath(); g.moveTo(0,y); g.lineTo(width,y); g.stroke(); }}); g.setLineDash([]);
  const roofs=['#b33b2e','#c9531f','#885f2d','#5e6d7a','#7d2f47']; for(let i=0;i<30;i++){ const cx=rnd()*width, cy=rnd()*height; if(v.some(x=>Math.abs(x-cx)<30)||h.some(y=>Math.abs(y-cy)<30)) continue; const w=26+rnd()*36,hg=26+rnd()*36; g.fillStyle=roofs[Math.floor(rnd()*roofs.length)]; g.fillRect(cx-w/2,cy-hg/2,w,hg); g.strokeStyle='rgba(255,255,255,.35)'; g.lineWidth=2; g.strokeRect(cx-w/2+2,cy-hg/2+2,w-4,hg-4); }
  const trees=60+Math.floor(rnd()*40); for(let i=0;i<trees;i++){ const tx=rnd()*width, ty=rnd()*height; if(v.some(x=>Math.abs(x-tx)<26)||h.some(y=>Math.abs(y-ty)<26)) continue; g.fillStyle=`hsl(${90+rnd()*40} 45% ${32+rnd()*20}%)`; g.beginPath(); g.arc(tx,ty,6+rnd()*5,0,Math.PI*2); g.fill(); }
  const vg=g.createRadialGradient(width/2,height/2,width*.2,width/2,height/2,width*.55); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.35)'); g.fillStyle=vg; g.fillRect(0,0,width,height); return c.toDataURL('image/png');
}
export function generateRandomMaps(count=5){ const arr=[]; for(let i=0;i<count;i++) arr.push(generateRandomMap(800,800,i*777)); return arr; }
export function loadMapImage(mapImages, index){ return new Promise((res,rej)=>{ if(!mapImages[index]) return rej('no map'); const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej('img load fail'); img.src=mapImages[index]; }); }
