// orientation.config.js
export function getOrientationConfig(){
  const cfg = window.getTestConfig ? window.getTestConfig('orientation') : null;
  const orientCfg = window.getOrientationConfig ? window.getOrientationConfig() : {};
  
  // קבל ערכים מהשרת
  const seconds = (cfg && cfg.seconds) || (orientCfg.seconds) || 360;
  const difficulty = (cfg && cfg.difficulty) || (orientCfg.difficulty) || 'בינוני';
  const displayTimeSec = (orientCfg.displayTimeSec) || (cfg && cfg.displayTimeSec) || 10;
  const maxQuestions = (orientCfg.maxQuestions) || (cfg && cfg.maxQuestions) || 10;
  const practiceCount = (cfg && cfg.practiceCount) || (orientCfg.practiceCount) || 2;
  const answerTimeSec = (cfg && cfg.answerTimeSec) || (orientCfg.answerTimeSec) || 60;
  const examCountdownSec = Math.max(0, +(cfg && cfg.examCountdownSec) || 5);
  
  console.log('[orientation.config] seconds:', seconds, 'difficulty:', difficulty, 'practiceCount:', practiceCount, 'answerTimeSec:', answerTimeSec);
  
  return {
    seconds,
    difficulty,
    displayTimeSec,
    maxQuestions,
    practiceCount,
    answerTimeSec,
    examCountdownSec,
    showCompass: orientCfg.showCompass !== false
  };
}
