// northfind.config.js
export function getNorthfindConfig(){
  const testBase = (window.getTestConfig? window.getTestConfig('northfind'): null) || {};
  const northBase = (typeof window.getNorthConfig==='function'? window.getNorthConfig(): null) || {};
  console.log('[northfind.config] testBase:', JSON.stringify(testBase));
  
  // רמת קושי
  const difficulty = testBase.difficulty || northBase.difficulty || 'בינוני';
  
  // הגדרות לפי רמת קושי - קשה = יותר אלמנטים + סיבוב מהיר יותר
  const difficultySettings = {
    'קל': { 
      distractorCount: 5,      // מעט אלמנטים מסיחים (בתים ועצים)
      spinSpeed: 0.7,          // סיבוב איטי
      colorVariation: 0.4      // צבעים מגוונים (קל להבחין)
    },
    'בינוני': { 
      distractorCount: 12,     // כמות בינונית של אלמנטים
      spinSpeed: 1.0,          // סיבוב רגיל
      colorVariation: 0.25     // צבעים פחות מגוונים
    },
    'קשה': { 
      distractorCount: 25,     // הרבה מאוד אלמנטים (בתים ועצים)
      spinSpeed: 1.8,          // סיבוב מהיר מאוד
      colorVariation: 0.1      // צבעים דומים מאוד (קשה להבחין)
    }
  };
  const diffSettings = difficultySettings[difficulty] || difficultySettings['בינוני'];
  
  // הגדרות מבחן
  const trials = Math.max(1, +(testBase.trials ?? northBase.trials ?? 5));
  const learnSec = Math.max(1, +(testBase.learnSec ?? northBase.showNorthSec ?? northBase.learnSec ?? 10));
  const baseSpinSec = Math.max(2, +(testBase.spinSec ?? northBase.spinSec ?? 6));
  const spinSec = baseSpinSec / diffSettings.spinSpeed; // סיבוב מהיר יותר = זמן קצר יותר
  const answerSec = Math.max(3, +(testBase.answerSec ?? northBase.answerSec ?? 10));
  const numArrows = Math.max(8, +(northBase.numArrows ?? testBase.numArrows ?? 24));
  
  // תמונות מפה
  const mapEntries = Array.isArray(northBase.mapEntries)? northBase.mapEntries : [];
  const mapImages = Array.isArray(northBase.mapImages) && northBase.mapImages.length
    ? northBase.mapImages.filter(Boolean)
    : mapEntries.map(entry=> entry && (entry.publicUrl || entry.storagePath || entry.url)).filter(Boolean);

  // הגדרות תרגול
  const practiceRuns = typeof testBase.practiceRuns !== 'undefined' ? Math.max(1, +testBase.practiceRuns) : 1;
  const examCountdownSec = typeof testBase.examCountdownSec !== 'undefined' ? Math.max(0, +testBase.examCountdownSec) : 5;

  console.log('[northfind.config] difficulty:', difficulty, 'distractorCount:', diffSettings.distractorCount, 'spinSpeed:', diffSettings.spinSpeed);
  console.log('[northfind.config] trials:', trials, 'learnSec:', learnSec, 'spinSec:', spinSec, 'answerSec:', answerSec, 'practiceRuns:', practiceRuns, 'examCountdownSec:', examCountdownSec);

  return { 
    trials, learnSec, spinSec, answerSec, numArrows, mapImages, practiceRuns, examCountdownSec,
    difficulty,
    distractorCount: diffSettings.distractorCount,
    colorVariation: diffSettings.colorVariation
  };
}
