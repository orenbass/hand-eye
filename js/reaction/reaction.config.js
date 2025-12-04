// reaction.config.js
// Derives dynamic configuration for reaction test from global settings
export function getReactionConfig() {
  const baseCfg = (window.getTestConfig ? window.getTestConfig('reaction') : null) || {};
  const hebDifficulty = baseCfg.difficulty || 'קל';
  const HEB_DIFF_MAP = { 'קל':'easy', 'בינוני':'medium', 'קשה':'hard' };
  const difficulty = HEB_DIFF_MAP[hebDifficulty] || 'easy';
  const shapeDisplaySec = (window.appSettings && window.appSettings.reactionShapeDisplaySec)
    ? Math.max(0.2, +window.appSettings.reactionShapeDisplaySec)
    : 1;
  // duration from config or fallback
  let durationSec = baseCfg.seconds ? Math.max(5, +baseCfg.seconds) : 40;
  const targetGoal = 15;
  const minRequired = (targetGoal * 2 - 1) * shapeDisplaySec;
  if (durationSec < minRequired) durationSec = minRequired; // ensure enough timeline for all targets

  // Practice settings
  const practiceEnabled = baseCfg.enablePractice !== false;
  const practiceSeconds = baseCfg.practiceSeconds ? Math.max(5, +baseCfg.practiceSeconds) : 20;
  const practiceRuns = Math.max(1, baseCfg.practiceRuns || 1);
  const examCountdownSec = Math.max(0, baseCfg.examCountdownSec || 5);

  return {
    difficulty,
    shapeDisplaySec,
    durationSec,
    targetGoal,
    practiceEnabled,
    practiceDurationMs: practiceSeconds * 1000,
    practiceRuns,
    examCountdownSec
  };
}
