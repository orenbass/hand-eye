// memory.scoring.js
// Pure scoring logic for Spatial Memory test
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }

// Score based on total correct colors accumulated
// עד 35 צבעים = ציון 1, ואז כל רמה נוספת מעלה ב-1
// Scale: 0-35 = 1, 36-44 = 2, 45-54 = 3, 55-65 = 4, 66-77 = 5, 78-90 = 6, 91+ = 7
export function computeMemoryScore(totalCorrectColors){
  const thresholds = [
    { min: 91, score: 7 },
    { min: 78, score: 6 },
    { min: 66, score: 5 },
    { min: 55, score: 4 },
    { min: 45, score: 3 },
    { min: 36, score: 2 },
    { min: 0,  score: 1 }
  ];
  
  for(const t of thresholds){
    if(totalCorrectColors >= t.min) return t.score;
  }
  return 1;
}

// For backward compatibility - kept but not used in new scoring
export function computeMemoryRawScore(maxAchieved, maxSequenceForScale){
  const denom = Math.max(1, maxSequenceForScale);
  const ratio = clamp(maxAchieved/denom, 0, 1);
  return Math.round(ratio * 100);
}

export function scaleMemoryScore(raw, scaleRange){
  const g = scaleRange || {min:1,max:7};
  return g.min + (raw/100)*(g.max - g.min);
}
