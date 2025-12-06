// flightcontrol.utils.js
export function fmtTime(sec){ const s=Math.floor(sec%60), m=Math.floor(sec/60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
export function maxRadius(canvas){ return Math.min(canvas.width, canvas.height)/2.6; }

// רעש משופר - לא מעגלי, עם שינויי כיוון פתאומיים
let noiseState = { x: 0, y: 0, targetX: 0, targetY: 0, lastChange: 0 };

export function noiseValue(t, difficulty){ 
  // עוצמת הרעש לפי רמת קושי
  const f = difficulty==='easy' ? 0.6 : difficulty==='hard' ? 1.6 : 1.0;
  const baseStrength = 40 * f;
  
  // מהירות תנועת העיגול - גבוהה יותר ברמות קשות
  const moveSpeed = difficulty==='easy' ? 0.06 : difficulty==='hard' ? 0.18 : 0.10;
  
  // שינוי כיוון אקראי - תכוף יותר ברמות קשות
  const changeInterval = difficulty==='easy' ? 1.4 : difficulty==='hard' ? 0.3 : 0.6;
  
  if(t - noiseState.lastChange > changeInterval + Math.random() * 0.4) {
    // בחירת כיוון חדש אקראי לחלוטין
    const angle = Math.random() * Math.PI * 2;
    const strength = (0.6 + Math.random() * 0.4) * baseStrength;
    noiseState.targetX = Math.cos(angle) * strength;
    noiseState.targetY = Math.sin(angle) * strength;
    noiseState.lastChange = t;
  }
  
  // מעבר לכיוון החדש - מהיר יותר ברמות קשות
  noiseState.x += (noiseState.targetX - noiseState.x) * moveSpeed;
  noiseState.y += (noiseState.targetY - noiseState.y) * moveSpeed;
  
  // הוספת רעש קטן נוסף למניעת צפיות
  const microNoise = 10 * f;
  const jitterX = (Math.random() - 0.5) * microNoise;
  const jitterY = (Math.random() - 0.5) * microNoise;
  
  return { 
    x: noiseState.x + jitterX, 
    y: noiseState.y + jitterY 
  }; 
}

// איפוס מצב הרעש בתחילת מבחן חדש
export function resetNoise() {
  noiseState = { x: 0, y: 0, targetX: 0, targetY: 0, lastChange: 0 };
}
