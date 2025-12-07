// memory.config.js
// Dynamic configuration for the Simon-style memory test
// מקבל הגדרות רק מה-DB - לא משתמש ב-localStorage בכלל!

// ברירות מחדל - רק אם אין שום דבר מה-DB
const DEFAULTS = {
  practiceRuns: 1,
  practiceSeconds: 45,
  examCountdownSec: 5,
  examRuns: 1,
  examRetryDelaySec: 3
};

// cache להגדרות שנטענו מה-DB
let cachedRemoteConfig = null;

// פונקציה לטעינת הגדרות מה-DB (נקראת פעם אחת לפני התחלת המבחן)
export async function loadMemoryConfigFromDB() {
  if (!window.supabaseClient) {
    console.log('[memory.config] ⚠️ Supabase לא זמין, משתמש בברירות מחדל');
    return null;
  }
  
  try {
    const { data, error } = await window.supabaseClient
      .from('memory_settings')
      .select('payload')
      .eq('id', 'default')
      .maybeSingle();
    
    if (error) {
      console.error('[memory.config] ❌ שגיאה בטעינה מ-DB:', error);
      return null;
    }
    
    if (data && data.payload) {
      console.log('[memory.config] ✅ נטען מ-DB:', JSON.stringify(data.payload));
      cachedRemoteConfig = data.payload;
      return data.payload;
    }
    
    console.log('[memory.config] ℹ️ אין הגדרות ב-DB');
    return null;
  } catch (e) {
    console.error('[memory.config] ❌ שגיאה:', e);
    return null;
  }
}

// פונקציה להמרת שמות שדות מ-DB לשמות config
function mapDBFieldToConfig(key) {
  const mapping = {
    'memoryPracticeRuns': 'practiceRuns',
    'memoryPracticeSeconds': 'practiceSeconds',
    'memoryExamCountdownSec': 'examCountdownSec',
    'memoryExamRuns': 'examRuns',
    'memoryExamRetryDelaySec': 'examRetryDelaySec'
  };
  return mapping[key] || key;
}

export function getMemoryConfig() {
  console.log('[memory.config] 📥 cachedRemoteConfig:', JSON.stringify(cachedRemoteConfig));
  
  // אם אין cache - החזר ברירות מחדל
  if (!cachedRemoteConfig) {
    console.log('[memory.config] ⚠️ אין cache, משתמש בברירות מחדל:', JSON.stringify(DEFAULTS));
    return {
      startingLevel: 1,
      maxLives: 3,
      practiceEnabled: true,
      practiceDurationMs: DEFAULTS.practiceSeconds * 1000,
      practiceRuns: DEFAULTS.practiceRuns,
      examCountdownSec: DEFAULTS.examCountdownSec,
      examRuns: DEFAULTS.examRuns,
      examRetryDelaySec: DEFAULTS.examRetryDelaySec
    };
  }
  
  // ממפה את הערכים מה-DB לשמות הנכונים
  const dbValues = {};
  Object.keys(cachedRemoteConfig).forEach(key => {
    const configKey = mapDBFieldToConfig(key);
    const value = cachedRemoteConfig[key];
    if (value !== undefined && value !== null && value !== '') {
      // המרה למספר
      dbValues[configKey] = typeof value === 'string' ? Number(value) : value;
    }
  });
  
  console.log('[memory.config] 🔄 ערכים ממופים מ-DB (כמספרים):', JSON.stringify(dbValues));

  // קח ערכים מ-DB - אם אין, השתמש בברירות מחדל
  const practiceSeconds = dbValues.practiceSeconds ?? DEFAULTS.practiceSeconds;
  const practiceRuns = dbValues.practiceRuns ?? DEFAULTS.practiceRuns;
  const examCountdownSec = dbValues.examCountdownSec ?? DEFAULTS.examCountdownSec;
  const examRuns = dbValues.examRuns ?? DEFAULTS.examRuns;
  const examRetryDelaySec = dbValues.examRetryDelaySec ?? DEFAULTS.examRetryDelaySec;

  console.log('[memory.config] 📊 ערכים סופיים:', {
    practiceSeconds, practiceRuns, examCountdownSec, examRuns, examRetryDelaySec
  });

  // בניית הקונפיג הסופי - ללא Math.max שיכול לדרוס ערכים
  const config = {
    startingLevel: 1,
    maxLives: 3,
    practiceEnabled: practiceRuns > 0,
    practiceDurationMs: practiceSeconds * 1000,
    practiceRuns: practiceRuns,
    examCountdownSec: examCountdownSec,
    examRuns: examRuns,
    examRetryDelaySec: examRetryDelaySec
  };
  
  console.log('[memory.config] 📤 final config:', JSON.stringify(config));
  return config;
}

// פונקציה לניקוי cache (לשימוש בטעינה מחדש)
export function clearMemoryConfigCache() {
  cachedRemoteConfig = null;
}
