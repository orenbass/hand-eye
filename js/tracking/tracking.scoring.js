// tracking.scoring.js
// Pure scoring for Tracking + Number Typing test
import { clamp, percent } from './tracking.utils.js';

/**
 * Compute component scores and final raw (0-100) plus scaled value.
 * @param {object} p - params
 * @param {number} p.inTimeSec - total seconds pointer was inside
 * @param {number} p.totalElapsedSec - total elapsed test seconds
 * @param {number} p.outs - exits count
 * @param {number} p.correct - correct number presses
 * @param {number} p.wrong - wrong presses
 * @param {number} p.missed - missed numbers (timeout)
 * @param {{min:number,max:number}} scaleRange - global scale
 */
export function computeTrackingScores(p, scaleRange){
  const insidePercent = percent(p.inTimeSec, p.totalElapsedSec);
  // Tracking component (subtract penalty 2 points per exit)
  const trackingScore = clamp(insidePercent - p.outs * 2, 0, 100);
  const totalAttempts = p.correct + p.wrong + p.missed;
  const clickAccuracy = totalAttempts > 0 ? percent(p.correct, totalAttempts) : 100;
  const finalRaw = trackingScore * 0.5 + clickAccuracy * 0.5; // weighted average
  const g = scaleRange || {min:1,max:7};
  const scaled = g.min + (finalRaw/100)*(g.max - g.min);
  return { insidePercent, trackingScore, clickAccuracy, finalRaw, scaled };
}