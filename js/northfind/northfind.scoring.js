// northfind.scoring.js
export function angularError(a,b){ let d=Math.abs(a-b)%(Math.PI*2); if(d>Math.PI) d=(Math.PI*2)-d; return d; }
export function scoreFromError(err, numArrows, scaleRange){
  const g = scaleRange || (window.getGlobalScale? window.getGlobalScale(): {min:1,max:7});
  const stepDeg = 360/numArrows;
  const deg = err*180/Math.PI;
  let ratio;
  if(deg<=stepDeg/2) ratio=1;
  else if(deg<=stepDeg*1.5) ratio=.85;
  else if(deg<=stepDeg*2.5) ratio=.7;
  else if(deg<=stepDeg*3.5) ratio=.55;
  else ratio=Math.max(0,1-deg/180)*.5;
  return g.min + ratio*(g.max-g.min);
}
