// flightcontrol.utils.js
export function fmtTime(sec){ const s=Math.floor(sec%60), m=Math.floor(sec/60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
export function maxRadius(canvas){ return Math.min(canvas.width, canvas.height)/2.6; }

// לוגיקת תזוזה חדשה - הכיוון משתנה רק כשהמשתמש מבצע תיקון ומשחרר את המקש
let noiseState = { 
  x: 0, 
  y: 0, 
  speed: 0.10,
  baseStrength: 40
};

// קביעת מהירות לפי רמת קושי - ערכים מוגברים משמעותית
export function setNoiseSpeed(difficulty = 'medium') {
  const speedMap = {
    easy:   { speed: 0.35, strength: 90 },
    medium: { speed: 0.55, strength: 140 },
    hard:   { speed: 0.80, strength: 200 }
  };
  const cfg = speedMap[difficulty] || speedMap.medium;
  noiseState.speed = cfg.speed;
  noiseState.baseStrength = cfg.strength;
}

// נקרא כשהמשתמש משחרר מקש - שינוי כיוון
export function changeDirection() {
  const angle = Math.random() * Math.PI * 2;
  const strength = (0.7 + Math.random() * 0.3) * noiseState.baseStrength;
  noiseState.x = Math.cos(angle) * strength;
  noiseState.y = Math.sin(angle) * strength;
}

// מחזיר את וקטור התזוזה הנוכחי - הכיוון נשאר קבוע עד שקוראים ל-changeDirection
export function noiseValue(){ 
  // רעש קטן למניעת צפיות מלאה
  const microNoise = 5;
  const jitterX = (Math.random() - 0.5) * microNoise;
  const jitterY = (Math.random() - 0.5) * microNoise;
  
  return { 
    x: noiseState.x * noiseState.speed + jitterX, 
    y: noiseState.y * noiseState.speed + jitterY 
  }; 
}

// איפוס מצב הרעש בתחילת מבחן חדש
export function resetNoise() {
  noiseState = { x: 0, y: 0, speed: 0.10, baseStrength: 40 };
  changeDirection(); // כיוון התחלתי אקראי
}
