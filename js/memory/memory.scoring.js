// memory.scoring.js
// Pure scoring logic for Spatial Memory test
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }

const DIFFICULTY_ALIASES = {
  hard: 'hard',
  קשה: 'hard',
  medium: 'medium',
  בינוני: 'medium',
  easy: 'easy',
  קל: 'easy'
};

const DIFFICULTY_SCORE_OFFSETS = { hard:0, medium:1, easy:2 };

function normalizeDifficulty(value){
  if(value === undefined || value === null) return 'hard';
  const str = String(value).trim();
  if(!str) return 'hard';
  const direct = DIFFICULTY_ALIASES[str];
  if(direct) return direct;
  const lower = str.toLowerCase();
  return DIFFICULTY_ALIASES[lower] || 'hard';
}

// Score based on total correct colors accumulated
// עד 35 צבעים = ציון 1, ואז כל רמה נוספת מעלה ב-1
// Scale: 0-35 = 1, 36-44 = 2, 45-54 = 3, 55-65 = 4, 66-77 = 5, 78-90 = 6, 91+ = 7
export function computeMemoryScore(totalCorrectColors, difficulty){
  const thresholds = [
    { min: 91, score: 7 },
    { min: 78, score: 6 },
    { min: 66, score: 5 },
    { min: 55, score: 4 },
    { min: 45, score: 3 },
    { min: 36, score: 2 },
    { min: 0,  score: 1 }
  ];

  let baseScore = 1;
  for(const t of thresholds){
    if(totalCorrectColors >= t.min){
      baseScore = t.score;
      break;
    }
  }

  const normalizedDifficulty = normalizeDifficulty(difficulty);
  const bonus = DIFFICULTY_SCORE_OFFSETS[normalizedDifficulty] || 0;
  return Math.min(7, baseScore + bonus);
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
