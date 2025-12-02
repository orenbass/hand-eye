// tracking.config.js
// Derive dynamic configuration for Tracking + Number Typing test
export function getTrackingConfig(){
  const base = (window.getTestConfig? window.getTestConfig('tracking'): null) || {};
  const hebDiff = base.difficulty || 'בינוני';
  const diffMap = { 'קל':'easy', 'בינוני':'medium', 'קשה':'hard' };
  const difficulty = diffMap[hebDiff] || 'medium';
  const seconds = base.seconds? Math.max(10, +base.seconds): 30;
  // Difficulty affects target speed (px/sec), radius, number timeout
  const speed = difficulty==='easy'?160 : difficulty==='hard'?240 : 200;
  const radiusFactor = difficulty==='hard'?0.045 : difficulty==='easy'?0.065 : 0.055; // relative to canvas height
  const numberTimeoutSec = difficulty==='hard'?1.6 : difficulty==='easy'?2.4 : 2.0;
  return { difficulty, seconds, speed, radiusFactor, numberTimeoutSec };
}
