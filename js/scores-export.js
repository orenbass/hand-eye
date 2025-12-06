// scores-export.js
// לוגיקת סינון וייצוא לאקסל עבור דוח הנבחנים
(function(){
    'use strict';

    // ========== קונפיגורציה ==========
    const TEST_NAMES_MAP = {
        eyehand: 'קואורדינציה עין-יד',
        flightcontrol: 'בקרת טיסה',
        flightexam: 'מבחן טיסה',
        memory: 'זיכרון',
        northfind: 'איתור צפון',
        orientation: 'התמצאות',
        reaction: 'זמן תגובה',
        targetid: 'זיהוי מטרות',
        tracking: 'מעקב'
    };

    // ========== משתני מצב ==========
    let allCandidatesData = []; // כל הנתונים המקוריים
    let filteredCandidatesData = []; // נתונים מסוננים
    let filterState = {
        searchText: '',
        dateFrom: null,
        dateTo: null
    };

    // ========== אתחול ==========
    function init(){
        // המתן שה-DOM יהיה מוכן
        if(document.readyState === 'loading'){
            document.addEventListener('DOMContentLoaded', setupUI);
        } else {
            setupUI();
        }
    }

    function setupUI(){
        const scoresScreen = document.getElementById('scores-screen');
        if(!scoresScreen) return;

        // הוסף את אזור הסינון
        injectFilterUI(scoresScreen);
        
        // הוסף כפתור ייצוא כללי ליד "רענן נתונים"
        injectExportAllButton(scoresScreen);
        
        // האזן לאירועי טעינת נתונים
        hookIntoDataLoading();
    }

    // ========== הזרקת UI ==========
    function injectFilterUI(scoresScreen){
        const statusEl = document.getElementById('scores-status');
        if(!statusEl) return;

        // יצירת אזור הסינון
        const filterContainer = document.createElement('div');
        filterContainer.id = 'scores-filter-container';
        filterContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            align-items: flex-end;
            margin-bottom: 16px;
            padding: 16px;
            background: rgba(30, 41, 59, 0.6);
            border-radius: 12px;
            border: 1px solid rgba(148, 163, 184, 0.2);
        `;

        filterContainer.innerHTML = `
            <div style="flex: 1; min-width: 200px;">
                <label style="display: block; font-size: 0.85rem; color: #cbd5f5; margin-bottom: 4px;">חיפוש לפי שם או ת.ז</label>
                <input type="text" id="scores-search-input" placeholder="הקלד שם או תעודת זהות..." 
                    style="width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.3); 
                    background: rgba(15,23,42,0.8); color: #e2e8f0; font-size: 0.95rem; outline: none;"
                />
            </div>
            <div style="min-width: 150px;">
                <label style="display: block; font-size: 0.85rem; color: #cbd5f5; margin-bottom: 4px;">מתאריך</label>
                <input type="date" id="scores-date-from" 
                    style="width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.3); 
                    background: rgba(15,23,42,0.8); color: #e2e8f0; font-size: 0.95rem; outline: none;"
                />
            </div>
            <div style="min-width: 150px;">
                <label style="display: block; font-size: 0.85rem; color: #cbd5f5; margin-bottom: 4px;">עד תאריך</label>
                <input type="date" id="scores-date-to" 
                    style="width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.3); 
                    background: rgba(15,23,42,0.8); color: #e2e8f0; font-size: 0.95rem; outline: none;"
                />
            </div>
            <div>
                <button type="button" id="scores-clear-filter" class="btn btn-secondary" 
                    style="padding: 10px 16px; font-size: 0.9rem;">
                    נקה סינון
                </button>
            </div>
        `;

        // הכנס לפני הטבלה
        statusEl.parentNode.insertBefore(filterContainer, statusEl);

        // הוסף מאזינים לאירועים
        const searchInput = document.getElementById('scores-search-input');
        const dateFrom = document.getElementById('scores-date-from');
        const dateTo = document.getElementById('scores-date-to');
        const clearBtn = document.getElementById('scores-clear-filter');

        if(searchInput){
            searchInput.addEventListener('input', debounce(()=>{
                filterState.searchText = searchInput.value.trim();
                applyFilters();
            }, 300));
        }

        if(dateFrom){
            dateFrom.addEventListener('change', ()=>{
                filterState.dateFrom = dateFrom.value ? new Date(dateFrom.value) : null;
                applyFilters();
            });
        }

        if(dateTo){
            dateTo.addEventListener('change', ()=>{
                filterState.dateTo = dateTo.value ? new Date(dateTo.value + 'T23:59:59') : null;
                applyFilters();
            });
        }

        if(clearBtn){
            clearBtn.addEventListener('click', ()=>{
                filterState = { searchText: '', dateFrom: null, dateTo: null };
                if(searchInput) searchInput.value = '';
                if(dateFrom) dateFrom.value = '';
                if(dateTo) dateTo.value = '';
                applyFilters();
            });
        }
    }

    function injectExportAllButton(scoresScreen){
        const refreshBtn = document.getElementById('scores-refresh-button');
        if(!refreshBtn) return;

        // כפתור ייצוא כללי
        const exportAllBtn = document.createElement('button');
        exportAllBtn.id = 'scores-export-all-button';
        exportAllBtn.type = 'button';
        exportAllBtn.className = 'btn btn-secondary';
        exportAllBtn.innerHTML = '📥 ייצוא לאקסל';
        exportAllBtn.style.cssText = 'background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none;';
        exportAllBtn.addEventListener('click', exportAllToExcel);

        refreshBtn.parentNode.insertBefore(exportAllBtn, refreshBtn.nextSibling);
    }

    // ========== חיבור לטעינת נתונים ==========
    function hookIntoDataLoading(){
        // דריסת הפונקציה המקורית של renderGroups
        const originalScoresModule = window.scoresView;
        
        // יצירת proxy לעדכון הנתונים שלנו
        const tableBody = document.getElementById('scores-table-body');
        if(tableBody){
            // MutationObserver לזיהוי שינויים בטבלה
            const observer = new MutationObserver(()=>{
                // לא עושים כלום כאן - הנתונים מתעדכנים דרך interceptLoadScores
            });
            observer.observe(tableBody, { childList: true });
        }

        // Intercept של פונקציית הטעינה
        interceptLoadScores();
    }

    function interceptLoadScores(){
        // שמור reference לפונקציה המקורית דרך האובייקט הגלובלי
        const originalLoadScores = window._originalLoadScores;
        
        // יצירת wrapper שמעדכן את הנתונים שלנו
        window._scoresExportDataCallback = function(groups){
            allCandidatesData = groups || [];
            filteredCandidatesData = allCandidatesData.slice();
            updateExportButtonsState();
        };
    }

    // ========== סינון ==========
    function applyFilters(){
        if(!allCandidatesData.length){
            filteredCandidatesData = [];
            rerenderTable();
            return;
        }

        filteredCandidatesData = allCandidatesData.filter(group => {
            // סינון לפי טקסט (שם או ת.ז)
            if(filterState.searchText){
                const searchLower = filterState.searchText.toLowerCase();
                const fullName = `${group.firstName || ''} ${group.lastName || ''}`.toLowerCase();
                const nationalId = (group.nationalId || '').toLowerCase();
                
                if(!fullName.includes(searchLower) && !nationalId.includes(searchLower)){
                    return false;
                }
            }

            // סינון לפי תאריכים
            if(filterState.dateFrom || filterState.dateTo){
                const sessions = group.sessions || [];
                const hasMatchingDate = sessions.some(session => {
                    const sessionDate = new Date(session.updated_at || session.created_at || 0);
                    
                    if(filterState.dateFrom && sessionDate < filterState.dateFrom){
                        return false;
                    }
                    if(filterState.dateTo && sessionDate > filterState.dateTo){
                        return false;
                    }
                    return true;
                });
                
                if(!hasMatchingDate) return false;
            }

            return true;
        });

        rerenderTable();
    }

    function rerenderTable(){
        // שימוש בפונקציה מהמודול המקורי
        if(window._renderGroupsCallback){
            window._renderGroupsCallback(filteredCandidatesData);
        }
        
        const statusEl = document.getElementById('scores-status');
        if(statusEl){
            const total = allCandidatesData.length;
            const filtered = filteredCandidatesData.length;
            if(total === filtered){
                statusEl.textContent = filtered ? `מוצגים ${filtered} נבחנים` : 'אין נבחנים להצגה';
            } else {
                statusEl.textContent = `מוצגים ${filtered} מתוך ${total} נבחנים`;
            }
        }
    }

    function updateExportButtonsState(){
        const exportAllBtn = document.getElementById('scores-export-all-button');
        if(exportAllBtn){
            exportAllBtn.disabled = !allCandidatesData.length;
        }
    }

    // ========== ייצוא לאקסל ==========
    async function exportAllToExcel(){
        if(!allCandidatesData.length){
            alert('אין נתונים לייצוא. אנא רענן את הנתונים תחילה.');
            return;
        }

        const exportBtn = document.getElementById('scores-export-all-button');
        if(exportBtn){
            exportBtn.disabled = true;
            exportBtn.textContent = '⏳ מייצא...';
        }

        try {
            // אסוף את כל הנתונים המפורטים מהשרת
            const fullData = await collectAllDetailedData(allCandidatesData);
            
            // יצור את הקובץ
            const csvContent = generateExcelCSV(fullData);
            
            // הורד את הקובץ
            downloadCSV(csvContent, `דוח_נבחנים_${formatDateForFilename(new Date())}.csv`);
            
        } catch(err){
            console.error('[scores-export] Export failed:', err);
            alert('שגיאה בייצוא הנתונים: ' + (err.message || 'שגיאה לא ידועה'));
        } finally {
            if(exportBtn){
                exportBtn.disabled = false;
                exportBtn.innerHTML = '📥 ייצוא לאקסל';
            }
        }
    }

    async function exportCandidateToExcel(group){
        if(!group){
            alert('אין נתונים לייצוא.');
            return;
        }

        try {
            const fullData = await collectAllDetailedData([group]);
            const csvContent = generateExcelCSV(fullData);
            const fileName = `נבחן_${group.nationalId || 'unknown'}_${formatDateForFilename(new Date())}.csv`;
            downloadCSV(csvContent, fileName);
        } catch(err){
            console.error('[scores-export] Single export failed:', err);
            alert('שגיאה בייצוא: ' + (err.message || 'שגיאה לא ידועה'));
        }
    }

    async function collectAllDetailedData(groups){
        const results = [];

        for(const group of groups){
            const sessions = group.sessions || [];
            
            for(const session of sessions){
                // נסה לקבל נתונים מפורטים מהשרת
                let attempts = [];
                
                if(window.examData && typeof window.examData.fetchUserAttempts === 'function' && session.id){
                    try {
                        attempts = await window.examData.fetchUserAttempts(session.id);
                        if(!Array.isArray(attempts)) attempts = [];
                    } catch(e){
                        console.warn('[scores-export] Failed to fetch attempts:', e);
                    }
                }

                // אם אין נתונים מפורטים, השתמש בנתוני הסשן הבסיסיים
                if(!attempts.length && session.scores && typeof session.scores === 'object'){
                    attempts = Object.entries(session.scores).map(([testId, score]) => ({
                        test_id: testId,
                        scaled_score: score,
                        raw_score: null,
                        raw_payload: null,
                        completed_at: session.updated_at || session.created_at
                    }));
                }

                // קבץ את הניסיונות לפי מבחן
                const testMap = new Map();
                attempts.forEach(att => {
                    const testId = att.test_id || 'unknown';
                    if(!testMap.has(testId)){
                        testMap.set(testId, att);
                    }
                });

                // חשב ציון סופי - ממוצע כל הציונים המדורגים
                let finalScore = calcSessionFinalScore(session);
                if(finalScore === null && testMap.size > 0){
                    // חשב מה-attempts אם אין scores בסשן
                    const scores = [];
                    testMap.forEach(att => {
                        if(att.scaled_score !== undefined && att.scaled_score !== null){
                            const num = Number(att.scaled_score);
                            if(Number.isFinite(num)) scores.push(num);
                        }
                    });
                    if(scores.length > 0){
                        finalScore = scores.reduce((a, b) => a + b, 0) / scores.length;
                    }
                }

                results.push({
                    nationalId: group.nationalId || '',
                    firstName: group.firstName || '',
                    lastName: group.lastName || '',
                    sessionDate: session.updated_at || session.created_at || null,
                    entryPin: session.entry_pin || '',
                    finalScore: finalScore,
                    tests: testMap
                });
            }
        }

        return results;
    }

    function calcSessionFinalScore(session){
        if(!session || !session.scores || typeof session.scores !== 'object') return null;
        const values = Object.values(session.scores).map(Number).filter(v => Number.isFinite(v));
        if(!values.length) return null;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    function generateExcelCSV(data){
        // מצא את כל המבחנים הייחודיים ואת השדות הגולמיים שלהם
        const allTests = new Map(); // testId -> Set of raw field names
        
        data.forEach(row => {
            row.tests.forEach((testData, testId) => {
                if(!allTests.has(testId)){
                    allTests.set(testId, new Set());
                }
                // אסוף שדות גולמיים
                if(testData.raw_payload && typeof testData.raw_payload === 'object'){
                    Object.keys(testData.raw_payload).forEach(key => {
                        allTests.get(testId).add(key);
                    });
                }
            });
        });

        // מיון המבחנים לפי שם
        const sortedTests = Array.from(allTests.keys()).sort((a, b) => 
            (TEST_NAMES_MAP[a] || a).localeCompare(TEST_NAMES_MAP[b] || b, 'he')
        );

        // בנה את כותרות העמודות
        const headers = [
            'תעודת זהות',
            'שם פרטי',
            'שם משפחה',
            'תאריך מבחן',
            'קוד כניסה',
            'ציון סופי'
        ];

        // הוסף עמודות לכל מבחן
        sortedTests.forEach(testId => {
            const testName = TEST_NAMES_MAP[testId] || testId;
            headers.push(`${testName} - ציון`);
            headers.push(`${testName} - ציון גולמי`);
            
            // הוסף שדות גולמיים
            const rawFields = Array.from(allTests.get(testId) || []).sort();
            rawFields.forEach(field => {
                headers.push(`${testName} - ${translateRawField(field)}`);
            });
        });

        // בנה את שורות הנתונים
        const rows = data.map(row => {
            const rowData = [
                row.nationalId,
                row.firstName,
                row.lastName,
                row.sessionDate ? formatDateForExcel(row.sessionDate) : '',
                row.entryPin,
                row.finalScore !== null ? row.finalScore.toFixed(2) : ''
            ];

            // הוסף נתוני מבחנים
            sortedTests.forEach(testId => {
                const testData = row.tests.get(testId);
                const rawFields = Array.from(allTests.get(testId) || []).sort();

                if(testData){
                    rowData.push(testData.scaled_score !== undefined && testData.scaled_score !== null 
                        ? Number(testData.scaled_score).toFixed(2) : '');
                    rowData.push(testData.raw_score !== undefined && testData.raw_score !== null 
                        ? Number(testData.raw_score).toFixed(2) : '');
                    
                    // שדות גולמיים
                    rawFields.forEach(field => {
                        const value = testData.raw_payload ? testData.raw_payload[field] : null;
                        rowData.push(formatValueForCSV(value));
                    });
                } else {
                    // מבחן לא קיים לנבחן זה
                    rowData.push(''); // ציון
                    rowData.push(''); // ציון גולמי
                    rawFields.forEach(() => rowData.push('')); // שדות גולמיים
                }
            });

            return rowData;
        });

        // יצור CSV עם BOM לתמיכה בעברית באקסל
        const BOM = '\uFEFF';
        const csvLines = [
            headers.map(escapeCSVValue).join(','),
            ...rows.map(row => row.map(escapeCSVValue).join(','))
        ];

        return BOM + csvLines.join('\r\n');
    }

    function translateRawField(field){
        const fieldMap = {
            score: 'ציון',
            scaled_score: 'ציון מנורמל',
            raw_score: 'ציון גולמי',
            percent: 'אחוז',
            accuracy: 'דיוק',
            duration_ms: 'משך (ms)',
            duration: 'משך',
            time_ms: 'זמן (ms)',
            mistakes: 'טעויות',
            errors: 'שגיאות',
            hits: 'פגיעות',
            misses: 'החטאות',
            lifts: 'הרמות',
            wallPercent: 'אחוז קיר',
            outsidePercent: 'אחוז מחוץ',
            wall_percent: 'אחוז קיר',
            outside_percent: 'אחוז מחוץ',
            total_targets: 'סה"כ מטרות',
            correct: 'נכונים',
            incorrect: 'שגויים',
            average_reaction: 'זמן תגובה ממוצע',
            avg_reaction_ms: 'תגובה ממוצעת (ms)',
            max_sequence: 'רצף מקסימלי',
            trials: 'ניסיונות',
            success_rate: 'אחוז הצלחה'
        };

        return fieldMap[field] || field;
    }

    function formatValueForCSV(value){
        if(value === null || value === undefined) return '';
        if(typeof value === 'object'){
            try {
                return JSON.stringify(value);
            } catch(e){
                return '';
            }
        }
        if(typeof value === 'number'){
            return Number.isFinite(value) ? value.toString() : '';
        }
        if(typeof value === 'boolean'){
            return value ? 'כן' : 'לא';
        }
        return String(value);
    }

    function escapeCSVValue(value){
        if(value === null || value === undefined) return '';
        const str = String(value);
        // אם יש פסיק, מרכאות, או שורה חדשה - עטוף במרכאות
        if(str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')){
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    function formatDateForExcel(dateStr){
        if(!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('he-IL', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch(e){
            return dateStr;
        }
    }

    function formatDateForFilename(date){
        const d = date || new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function downloadCSV(content, filename){
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    }

    // ========== עזרים ==========
    function debounce(fn, delay){
        let timer = null;
        return function(...args){
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ========== API ציבורי ==========
    window.scoresExport = {
        exportAll: exportAllToExcel,
        exportCandidate: exportCandidateToExcel,
        setData: function(groups){
            allCandidatesData = groups || [];
            filteredCandidatesData = allCandidatesData.slice();
            updateExportButtonsState();
        },
        getFilteredData: function(){
            return filteredCandidatesData;
        }
    };

    // אתחול
    init();

})();
