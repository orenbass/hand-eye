// eyehand.scoring.js
// Pure scoring logic for Eye-Hand Coordination test
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }
/**
 * Compute scoring components and scaled score.
 * @param {object} p
 * @param {number} p.insideLength - length traced inside path
 * @param {number} p.wallLength - length traced on wall color
 * @param {number} p.outsideLength - length traced outside
 * @param {number} p.totalPathLength - precomputed total path length
 * @param {number} p.liftCount - number of mouse lifts (interruptions)
 * @param {number} p.wallFactor - penalty multiplier for wall
 * @param {number} p.outsideFactor - penalty multiplier for outside
 * @param {number} p.liftFactor - penalty per lift
 * @param {{min:number,max:number}} scaleRange - global scale
 */
export function computeEyeHandScores(p, scaleRange){
  const insidePercent = p.totalPathLength>0? (p.insideLength/p.totalPathLength)*100 : 0;
  const wallPercent = p.totalPathLength>0? (p.wallLength/p.totalPathLength)*100 : 0;
  const outsidePercent = p.totalPathLength>0? (p.outsideLength/p.totalPathLength)*100 : 0;
  const wallPenaltyPercent = wallPercent * p.wallFactor;
  const outsidePenaltyPercent = outsidePercent * p.outsideFactor;
  const liftPenaltyPercent = p.liftCount * p.liftFactor;
  const raw = insidePercent - wallPenaltyPercent - outsidePenaltyPercent - liftPenaltyPercent;
  const finalRaw = clamp(raw, 0, 100);
  const g = scaleRange || {min:1,max:7};
  const scaled = g.min + (finalRaw/100)*(g.max - g.min);
  return { insidePercent, wallPercent, outsidePercent, wallPenaltyPercent, outsidePenaltyPercent, liftPenaltyPercent, finalRaw, scaled };
}