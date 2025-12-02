// flightcontrol.scoring.js
export function computeFlightControlRaw(avgDist, maxRadius){
  if(!Number.isFinite(avgDist) || avgDist<0) return 0;
  if(!Number.isFinite(maxRadius) || maxRadius<=0) return 0;
  const ratio = Math.max(0, 1 - (avgDist / maxRadius));
  // emphasize accuracy non-linearly
  return Math.min(100, Math.max(0, Math.pow(ratio, 2.2) * 100));
}
export function scaleFlightControl(raw, scaleRange){
  const g = scaleRange || {min:1,max:7};
  return g.min + (raw/100)*(g.max-g.min);
}
