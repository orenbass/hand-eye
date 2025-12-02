// memory.scoring.js
// Pure scoring logic for Spatial Memory test
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }

// raw score 0-100 based on proportion of achieved max length to configured scale length
export function computeMemoryRawScore(maxAchieved, maxSequenceForScale){
  const denom = Math.max(1, maxSequenceForScale);
  const ratio = clamp(maxAchieved/denom, 0, 1);
  return Math.round(ratio * 100);
}

export function scaleMemoryScore(raw, scaleRange){
  const g = scaleRange || {min:1,max:7};
  return g.min + (raw/100)*(g.max - g.min);
}
