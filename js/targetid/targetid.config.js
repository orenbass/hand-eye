// targetid.config.js
// Dynamic configuration for Target Identification test
export function getTargetIdConfig(){
  const base = (window.getTestConfig? window.getTestConfig('targetid'): null) || {};
  const hebDiff = base.difficulty || 'בינוני';
  const diffMap = { 'קל':'easy', 'בינוני':'medium', 'קשה':'hard' };
  const difficulty = diffMap[hebDiff] || 'medium';
  const seconds = Math.max(15, +(base.seconds||60));
  const practiceSeconds = Math.max(5, +(base.practiceSeconds||30));
  const examCountdownSec = Math.max(0, +(base.examCountdownSec || 5));
  // difficulty influences spawn rate, target speed, good target probability
  const spawnRate = difficulty==='easy'?1.2 : difficulty==='hard'?0.6 : 0.9;
  const speed = difficulty==='easy'?80 : difficulty==='hard'?170 : 120;
  const goodProb = difficulty==='easy'?0.7 : difficulty==='hard'?0.55 : 0.65;
  return { difficulty, seconds, practiceSeconds, examCountdownSec, spawnRate, speed, goodProb };
}
