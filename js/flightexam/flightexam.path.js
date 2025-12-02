// flightexam.path.js
let preloads = {};
export function closestDistanceToPath(px,py,pathPoints){
  if(!pathPoints || pathPoints.length<2) return 1;
  let minD=1;
  for(let i=1;i<pathPoints.length;i++){
    const a=pathPoints[i-1], b=pathPoints[i];
    const dx=b.x-a.x, dy=b.y-a.y;
    const len2=dx*dx+dy*dy;
    if(len2===0) continue;
    let t=((px-a.x)*dx+(py-a.y)*dy)/len2;
    t=Math.max(0,Math.min(1,t));
    const cx=a.x+dx*t, cy=a.y+dy*t;
    const ddx=px-cx, ddy=py-cy;
    const d=Math.sqrt(ddx*ddx+ddy*ddy);
    if(d<minD) minD=d;
  }
  return minD;
}
export function computePathLength(pathPoints){
  if(!pathPoints || pathPoints.length<2) return 0;
  let total=0;
  for(let i=1;i<pathPoints.length;i++){
    const a=pathPoints[i-1], b=pathPoints[i];
    const dx=b.x-a.x, dy=b.y-a.y;
    total+=Math.sqrt(dx*dx+dy*dy);
  }
  return total;
}
export function preloadPart(partsRef, i){
  if(preloads[i]) return preloads[i].promise;
  const part = partsRef[i];
  if(!part) return Promise.resolve();
  let pathDone = !part.pathImg, testDone = !part.testImg;
  const pathImgObj = part.pathImg ? new Image() : null;
  const testImgObj = part.testImg ? new Image() : null;
  let resolveFn;
  const promise = new Promise(res=> resolveFn = res);
  function check(){ if(pathDone && testDone) resolveFn(); }
  if(pathImgObj){ pathImgObj.onload = ()=>{ pathDone=true; check(); }; pathImgObj.onerror = ()=>{ pathDone=true; check(); }; pathImgObj.src = part.pathImg; }
  if(testImgObj){ testImgObj.onload = ()=>{ testDone=true; check(); }; testImgObj.onerror = ()=>{ testDone=true; check(); }; testImgObj.src = part.testImg; }
  preloads[i] = { promise, pathImgObj, testImgObj };
  return promise;
}
export function warmNext(partsRef, i){ const n=i+1; if(n < partsRef.length) preloadPart(partsRef, n).catch(()=>{}); }
export function getPreloadedImages(i){ return preloads[i] || null; }
export function resetPreloads(){ preloads = {}; }
