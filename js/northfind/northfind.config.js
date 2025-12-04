// northfind.config.js
export function getNorthfindConfig(){
  const testBase = (window.getTestConfig? window.getTestConfig('northfind'): null) || {};
  const northBase = (typeof window.getNorthConfig==='function'? window.getNorthConfig(): null) || {};
  const trials = Math.max(1, +(northBase.trials ?? testBase.trials ?? 5));
  const learnSec = Math.max(3, +(northBase.showNorthSec ?? northBase.learnSec ?? testBase.learnSec ?? 10));
  const spinSec = Math.max(2, +(northBase.spinSec ?? testBase.spinSec ?? 6));
  const answerSec = Math.max(3, +(northBase.answerSec ?? testBase.answerSec ?? 10));
  const numArrows = Math.max(8, +(northBase.numArrows ?? testBase.numArrows ?? 24));
  const mapEntries = Array.isArray(northBase.mapEntries)? northBase.mapEntries : [];
  const mapImages = Array.isArray(northBase.mapImages) && northBase.mapImages.length
    ? northBase.mapImages.filter(Boolean)
    : mapEntries.map(entry=> entry && (entry.publicUrl || entry.storagePath || entry.url)).filter(Boolean);

  const practiceSeconds = testBase.practiceSeconds ? Math.max(5, +testBase.practiceSeconds) : 30;
  const practiceRuns = typeof testBase.practiceRuns !== 'undefined' ? Math.max(0, +testBase.practiceRuns) : 1;
  const examCountdownSec = typeof testBase.examCountdownSec !== 'undefined' ? Math.max(0, +testBase.examCountdownSec) : 10;

  return { trials, learnSec, spinSec, answerSec, numArrows, mapImages, practiceSeconds, practiceRuns, examCountdownSec };
}
