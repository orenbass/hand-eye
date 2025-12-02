// eyehand.config.js
// Dynamic configuration resolver for Eye-Hand Coordination test
export function getEyeHandConfig(){
  const base = (window.getTestConfig? window.getTestConfig('eyehand'): null) || {};
  const hebDiff = base.difficulty || 'בינוני';
  const diffMap = { 'קל':'easy', 'בינוני':'medium', 'קשה':'hard' };
  const difficulty = diffMap[hebDiff] || 'medium';
  // Duration from settings (seconds)
  const durationMs = (base.seconds? Math.max(5,+base.seconds):30) * 1000;
  // Path width adjusted by difficulty
  const pathWidth = difficulty==='easy'? 26 : difficulty==='hard'? 16 : 20;
  const wallWidth = 5; // constant stroke extra width
  // Penalty factors can vary with difficulty (hard penalizes more)
  const wallFactor   = difficulty==='hard'? 1.8 : difficulty==='easy'? 1.2 : 1.5;
  const outsideFactor= difficulty==='hard'? 3.5 : difficulty==='easy'? 2.5 : 3;
  const liftFactor   = difficulty==='hard'? 2.4 : difficulty==='easy'? 1.8 : 2;

  const practiceEnabled = base.enablePractice !== false;
  const practiceSeconds = base.practiceSeconds ? Math.max(5, +base.practiceSeconds) : Math.min(30, durationMs / 1000);
  const practiceRuns = Math.max(1, base.practiceRuns || 1);
  const examCountdownSec = Math.max(0, base.examCountdownSec || 5);

  return {
    difficulty,
    durationMs,
    pathWidth,
    wallWidth,
    wallFactor,
    outsideFactor,
    liftFactor,
    practiceEnabled,
    practiceDurationMs: practiceSeconds * 1000,
    practiceRuns,
    examCountdownSec
  };
}
