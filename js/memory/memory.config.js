// memory.config.js
// Dynamic configuration for the Simon-style memory test
export function getMemoryConfig(){
  const base = (window.getTestConfig ? window.getTestConfig('memory') : null) || {};
  const hebDiff = base.difficulty || 'בינוני';
  const diffMap = { 'קל': 'easy', 'בינוני': 'medium', 'קשה': 'hard' };
  const difficulty = diffMap[hebDiff] || 'medium';

  const diffSettings = {
    easy:   { scale: 10, seconds: 90 },
    medium: { scale: 15, seconds: 120 },
    hard:   { scale: 20, seconds: 150 }
  };

  const chosen = diffSettings[difficulty] || diffSettings.medium;
  const seconds = base.seconds ? Math.max(45, +base.seconds) : chosen.seconds;

  return {
    difficulty,
    maxSequenceForScale: chosen.scale,
    seconds,
    retryDelaySec: 10,
    maxLives: 3
  };
}
