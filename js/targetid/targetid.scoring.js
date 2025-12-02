// targetid.scoring.js
export function computeTargetIdRaw(hits, shots, wrong){
  const accuracy = shots>0? hits/shots : 0;
  const penalty = wrong * 0.12; // keep previous logic
  const raw = Math.max(0, accuracy - penalty) * 100; // convert to 0-100 scale
  return Math.min(100, raw);
}
export function scaleTargetId(raw, scaleRange){
  const g = scaleRange || {min:1,max:7};
  return g.min + (raw/100)*(g.max-g.min);
}
