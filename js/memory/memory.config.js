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

  // Practice settings
  const practiceEnabled = base.enablePractice !== false; // default true
  const practiceSeconds = base.practiceSeconds ? Math.max(10, +base.practiceSeconds) : 45;
  const practiceRuns = Math.max(1, base.practiceRuns || 1);
  const examCountdownSec = Math.max(0, base.examCountdownSec || 5);

  return {
    difficulty,
    maxSequenceForScale: chosen.scale,
    seconds,
    retryDelaySec: 10,
    maxLives: 3,
    practiceEnabled,
    practiceDurationMs: practiceSeconds * 1000,
    practiceRuns,
    examCountdownSec
  };
}
