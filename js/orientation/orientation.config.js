// orientation.config.js
export function getOrientationConfig(){
  const cfg = window.getTestConfig ? window.getTestConfig('orientation') : null;
  const orientCfg = window.getOrientationConfig ? window.getOrientationConfig() : {};
  return {
    displayTimeSec: (orientCfg.displayTimeSec) || (cfg && cfg.displayTimeSec) || 10,
    maxQuestions: (orientCfg.maxQuestions) || (cfg && cfg.maxQuestions) || 10,
    showCompass: orientCfg.showCompass !== false
  };
}
