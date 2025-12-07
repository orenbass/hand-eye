-- SQL ליצירת טבלת תשובות המשוב ב-Supabase
-- יש להריץ את הסקריפט הזה ב-Supabase SQL Editor

-- ============================================
-- פקודה ליצירת הטבלה (העתק והרץ ב-SQL Editor)
-- ============================================

-- יצירת הטבלה
CREATE TABLE IF NOT EXISTS feedback_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT,
    answers JSONB NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- הוספת אינדקסים
CREATE INDEX IF NOT EXISTS idx_feedback_responses_user_id ON feedback_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_submitted_at ON feedback_responses(submitted_at DESC);

-- הגדרת RLS (Row Level Security)
ALTER TABLE feedback_responses ENABLE ROW LEVEL SECURITY;

-- מדיניות: כל משתמש מאומת יכול להוסיף תשובה
CREATE POLICY "Anyone can insert feedback"
ON feedback_responses FOR INSERT
TO authenticated
WITH CHECK (true);

-- מדיניות: כל משתמש מאומת יכול לקרוא (למנהלים)
CREATE POLICY "Authenticated users can read feedback"
ON feedback_responses FOR SELECT
TO authenticated
USING (true);

-- ============================================
-- מבנה עמודות הטבלה:
-- ============================================
-- id: מזהה ייחודי (UUID)
-- user_id: מזהה המשתמש (TEXT - יכול להיות UUID או 'preview-mode')
-- answers: אובייקט JSON עם התשובות { "1": 3, "2": 4, "3": "yes", ... }
-- submitted_at: תאריך ושעת שליחה
-- created_at: תאריך יצירה

-- ============================================
-- דוגמה למבנה answers:
-- ============================================
-- {
--   "1": 3,           // שאלה 1: סקאלה 1-5
--   "2": 4,           // שאלה 2: סקאלה 1-5
--   "3": "yes",       // שאלה 3: כן/לא
--   "4": "טקסט...",   // שאלה 4: טקסט חופשי
--   "5": 5,           // שאלה 5: סקאלה 1-5
--   ...
-- }
