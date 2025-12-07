// feedback.config.js - הגדרות שאלון המשוב

export const FEEDBACK_QUESTIONS = [
    {
        id: 1,
        type: 'scale5',
        text: 'יש לי ניסיון קודם במבחנים שדומים למבחנים הממוחשבים שביצעתי',
        required: true,
        options: [
            { value: 1, label: 'במידה מועטה מאוד' },
            { value: 2, label: 'במידה מועטה' },
            { value: 3, label: 'במידה בינונית' },
            { value: 4, label: 'במידה רבה' },
            { value: 5, label: 'במידה רבה מאוד' }
        ]
    },
    {
        id: 2,
        type: 'scale5',
        text: 'היה לי נוח להפעיל את מערכת המבחנים ולבצע את המשימות השונות במבחנים',
        required: true,
        options: [
            { value: 1, label: 'במידה מועטה מאוד' },
            { value: 2, label: 'במידה מועטה' },
            { value: 3, label: 'במידה בינונית' },
            { value: 4, label: 'במידה רבה' },
            { value: 5, label: 'במידה רבה מאוד' }
        ]
    },
    {
        id: 3,
        type: 'yesno',
        text: 'האם נתקלת בבעיות טכניות בשימוש במערכת הבחינות?',
        required: true,
        options: [
            { value: 'no', label: 'לא' },
            { value: 'yes', label: 'כן' }
        ]
    },
    {
        id: 4,
        type: 'text',
        text: 'במידה ונתקלת בבעיות טכניות, אנא פרט:',
        required: false,
        conditional: { questionId: 3, value: 'yes' },
        placeholder: 'פרט את הבעיות הטכניות שנתקלת בהן...'
    },
    {
        id: 5,
        type: 'scale5',
        text: 'ההוראות של המבחנים היו לי ברורות',
        required: true,
        options: [
            { value: 1, label: 'במידה מועטה מאוד' },
            { value: 2, label: 'במידה מועטה' },
            { value: 3, label: 'במידה בינונית' },
            { value: 4, label: 'במידה רבה' },
            { value: 5, label: 'במידה רבה מאוד' }
        ]
    },
    {
        id: 6,
        type: 'scale5',
        text: 'התרגולים של המבחנים היו מועילים וברורים',
        required: true,
        options: [
            { value: 1, label: 'במידה מועטה מאוד' },
            { value: 2, label: 'במידה מועטה' },
            { value: 3, label: 'במידה בינונית' },
            { value: 4, label: 'במידה רבה' },
            { value: 5, label: 'במידה רבה מאוד' }
        ]
    },
    {
        id: 7,
        type: 'scale5',
        text: 'הזמנים לתרגול היו מספיקים',
        required: true,
        options: [
            { value: 1, label: 'במידה מועטה מאוד' },
            { value: 2, label: 'במידה מועטה' },
            { value: 3, label: 'במידה בינונית' },
            { value: 4, label: 'במידה רבה' },
            { value: 5, label: 'במידה רבה מאוד' }
        ]
    },
    {
        id: 8,
        type: 'choice',
        text: 'באיזה אופן חווית את זמני ההמתנה בין התרגול למבחן האמיתי',
        required: true,
        options: [
            { value: 'appropriate', label: 'הם היו באורך המתאים והטוב ביותר' },
            { value: 'too_long', label: 'הם היו ארוכים מדיי' },
            { value: 'too_short', label: 'הם היו קצרים מדיי' }
        ]
    },
    {
        id: 9,
        type: 'scale5',
        text: 'המבחנים היו מאתגרים',
        required: true,
        options: [
            { value: 1, label: 'במידה מועטה מאוד' },
            { value: 2, label: 'במידה מועטה' },
            { value: 3, label: 'במידה בינונית' },
            { value: 4, label: 'במידה רבה' },
            { value: 5, label: 'במידה רבה מאוד' }
        ]
    },
    {
        id: 10,
        type: 'scale5',
        text: 'באיזו מידה המבחנים העלו את המוטיבציה שלך לשרת כלוחם ביחידה',
        required: true,
        options: [
            { value: 1, label: 'במידה מועטה מאוד' },
            { value: 2, label: 'במידה מועטה' },
            { value: 3, label: 'במידה בינונית' },
            { value: 4, label: 'במידה רבה' },
            { value: 5, label: 'במידה רבה מאוד' }
        ]
    },
    {
        id: 11,
        type: 'choice',
        text: 'האם ביצעת מבחני ירפ"א א\' ו-ב\' לצוות אוויר',
        required: true,
        options: [
            { value: 'no', label: 'לא' },
            { value: 'yes', label: 'כן' },
            { value: 'partial', label: 'ביצעתי רק ירפ"א א\' ולא ירפ"א ב\'' }
        ]
    },
    {
        id: 12,
        type: 'textarea',
        text: 'נשמח אם תוכל לפרט ככל הניתן על החוויה שלך מביצוע המבחנים, מה היה מוצלח יותר ומה ניתן לשפר ובאיזה אופן',
        required: true,
        placeholder: 'שתף אותנו בחוויה שלך, מה היה טוב ומה ניתן לשפר...'
    }
];

export const FEEDBACK_INTRO = `השאלון הבא הינו משוב למטרות למידה ושיפור ולכן לא ישפיע על מועמדותך כלל.
השאלון מתייחס רק למבחנים הממוחשבים שביצעת ולא לאף חלק אחר במיון.
אנא ענה באופן מפורט וכנה ככל הניתן, תשובותייך יסייעו לנו לשפר את המיון העתידי.`;

export const FEEDBACK_THANK_YOU = `תודה רבה על מילוי השאלון!
תשובותייך יסייעו לנו לשפר את המיון העתידי.
בהצלחה בהמשך!`;
