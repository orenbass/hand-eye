// orientation.scoring.js
export function computeOrientationScores(correct, total, scaleRange){
  const rawPercent = total>0 ? (correct/total)*100 : 0;
  const g = scaleRange || (window.getGlobalScale? window.getGlobalScale(): {min:1,max:7});
  const scaled = g.min + (rawPercent/100)*(g.max - g.min);
  return { rawPercent, scaled };
}
