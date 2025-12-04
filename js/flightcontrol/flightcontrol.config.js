// flightcontrol.config.js
// Dynamic configuration for Flight Control test
export function getFlightControlConfig(){
  const base = (window.getTestConfig? window.getTestConfig('flightcontrol'): null) || {};
  const hebDiff = base.difficulty || 'בינוני';
  const diffMap = { 'קל':'easy', 'בינוני':'medium', 'קשה':'hard' };
  const difficulty = diffMap[hebDiff] || 'medium';
  const seconds = Math.max(10, +(base.seconds||60));
  // difficulty affects noise amplitude, cursor speed
  const speed = difficulty==='easy'?160 : difficulty==='hard'?240 : 200;
  const noiseFactor = difficulty==='easy'?0.8 : difficulty==='hard'?1.25 : 1.0;

  const practiceSeconds = base.practiceSeconds ? Math.max(5, +base.practiceSeconds) : 30;
  const practiceRuns = typeof base.practiceRuns !== 'undefined' ? Math.max(0, +base.practiceRuns) : 1;
  const examCountdownSec = typeof base.examCountdownSec !== 'undefined' ? Math.max(0, +base.examCountdownSec) : 10;

  return { difficulty, seconds, speed, noiseFactor, practiceSeconds, practiceRuns, examCountdownSec };
}
