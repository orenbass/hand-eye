// reaction.scoring.js
// Pure scoring logic for Reaction Test separated from UI & controller
import { clamp } from './reaction.utils.js';

/**
 * Compute raw percentage score (0-100) before scaling.
 * @param {number} mistakesClicks - wrong space presses (non target or double)
 * @param {number} missedTargets - targets not clicked
 * @param {number} patternLength - theoretical pattern length (targets + gaps)
 * @param {number} durationSec - actual test duration in seconds
 * @param {number} shapeDisplaySec - seconds each stimulus is visible
 * @param {number} targetGoal - total targets intended
 */
export function computeReactionRawScore(mistakesClicks, missedTargets, patternLength, durationSec, shapeDisplaySec, targetGoal){
  const mistakesTotal = mistakesClicks + missedTargets;
  // expected cycles: either pattern length or time based cycles (each stimulus fills full slot)
  const expectedCycles = Math.max(patternLength, Math.floor(durationSec / shapeDisplaySec));
  // penalty gives full loss if all cycles mistakes with slight buffer (1.1)
  const penaltyPerMistake = 100 / (expectedCycles * 1.1);
  return clamp(100 - mistakesTotal * penaltyPerMistake, 0, 100);
}

/**
 * Convert raw (0-100) score to global scaled score.
 * @param {number} raw - 0-100
 * @param {{min:number,max:number}} scaleRange - global scale
 */
export function scaleReactionScore(raw, scaleRange){
  const g = scaleRange || {min:1,max:7};
  return g.min + (raw/100)*(g.max - g.min);
}
