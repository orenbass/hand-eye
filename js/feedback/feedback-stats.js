// feedback-stats.js - סטטיסטיקות שאלון המשוב
import { FEEDBACK_QUESTIONS } from './feedback.config.js';

class FeedbackStats {
    constructor() {
        this.responses = [];
    }

    async loadResponses() {
        if (!window.supabaseClient) {
            console.error('[feedback-stats] Supabase client not available');
            return [];
        }

        try {
            const { data, error } = await window.supabaseClient
                .from('feedback_responses')
                .select('*')
                .order('submitted_at', { ascending: false });

            if (error) throw error;
            
            this.responses = data || [];
            console.log('[feedback-stats] Loaded', this.responses.length, 'responses');
            return this.responses;
        } catch (error) {
            console.error('[feedback-stats] Error loading responses:', error);
            return [];
        }
    }

    getQuestionStats(questionId) {
        const question = FEEDBACK_QUESTIONS.find(q => q.id === questionId);
        if (!question) return null;

        const stats = {
            question: question,
            totalResponses: 0,
            answers: {}
        };

        // Initialize answer counts
        if (question.options) {
            question.options.forEach(opt => {
                stats.answers[opt.value] = {
                    label: opt.label,
                    count: 0,
                    percentage: 0
                };
            });
        }

        // Count answers
        this.responses.forEach(response => {
            const answer = response.answers?.[questionId];
            if (answer !== undefined && answer !== null && answer !== '') {
                stats.totalResponses++;
                
                if (question.type === 'text' || question.type === 'textarea') {
                    // For text questions, just count that there's an answer
                    if (!stats.textAnswers) stats.textAnswers = [];
                    stats.textAnswers.push(answer);
                } else if (stats.answers[answer]) {
                    stats.answers[answer].count++;
                }
            }
        });

        // Calculate percentages
        if (stats.totalResponses > 0 && question.options) {
            Object.keys(stats.answers).forEach(key => {
                stats.answers[key].percentage = Math.round(
                    (stats.answers[key].count / stats.totalResponses) * 100
                );
            });
        }

        return stats;
    }

    getAllStats() {
        return FEEDBACK_QUESTIONS.map(q => this.getQuestionStats(q.id));
    }

    renderStatsPanel(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const allStats = this.getAllStats();
        const totalResponses = this.responses.length;

        let html = `
            <div class="feedback-stats-header">
                <h3>📊 סטטיסטיקות שאלון משוב</h3>
                <p class="feedback-stats-total">סה"כ ${totalResponses} תשובות</p>
            </div>
        `;

        allStats.forEach((stats, index) => {
            if (!stats) return;
            
            const question = stats.question;
            html += `
                <div class="feedback-stats-question">
                    <h4>${index + 1}. ${question.text}</h4>
                    <p class="feedback-stats-responses">${stats.totalResponses} תשובות</p>
            `;

            if (question.type === 'text' || question.type === 'textarea') {
                // Show text answers
                if (stats.textAnswers && stats.textAnswers.length > 0) {
                    html += `<div class="feedback-text-answers">`;
                    stats.textAnswers.slice(0, 10).forEach(answer => {
                        html += `<div class="feedback-text-answer">"${this.escapeHtml(answer)}"</div>`;
                    });
                    if (stats.textAnswers.length > 10) {
                        html += `<p class="feedback-more">ועוד ${stats.textAnswers.length - 10} תשובות...</p>`;
                    }
                    html += `</div>`;
                }
            } else {
                // Show bar chart for options
                html += `<div class="feedback-stats-bars">`;
                Object.values(stats.answers).forEach(answer => {
                    html += `
                        <div class="feedback-stats-bar-row">
                            <span class="feedback-stats-label">${answer.label}</span>
                            <div class="feedback-stats-bar-container">
                                <div class="feedback-stats-bar" style="width: ${answer.percentage}%"></div>
                            </div>
                            <span class="feedback-stats-count">${answer.count} (${answer.percentage}%)</span>
                        </div>
                    `;
                });
                html += `</div>`;
            }

            html += `</div>`;
        });

        container.innerHTML = html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // פילוח ציונים לפי תשובות
    // ============================================
    
    // קבלת מזהי משתמשים לפי תשובה לשאלה מסוימת
    getUserIdsByAnswer(questionId, answerValue) {
        return this.responses
            .filter(r => r.answers?.[questionId] === answerValue)
            .map(r => r.user_id)
            .filter(id => id && id !== 'preview-mode');
    }

    // טעינת ציונים מהמערכת לפי מזהי משתמשים
    async loadScoresByUserIds(userIds) {
        if (!window.supabaseClient || !userIds.length) return [];
        
        try {
            const { data, error } = await window.supabaseClient
                .from('test_attempts')
                .select('*')
                .in('user_id', userIds);
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[feedback-stats] Error loading scores:', error);
            return [];
        }
    }

    // חישוב ממוצע ציונים
    calculateAverageScore(scores, testId = null) {
        let filteredScores = scores;
        if (testId) {
            filteredScores = scores.filter(s => s.test_id === testId);
        }
        
        if (!filteredScores.length) return null;
        
        const sum = filteredScores.reduce((acc, s) => acc + (s.score || 0), 0);
        return Math.round((sum / filteredScores.length) * 100) / 100;
    }

    // פילוח מלא - ציונים לפי תשובה לשאלה
    async getScoresByQuestionAnswer(questionId) {
        const question = FEEDBACK_QUESTIONS.find(q => q.id === questionId);
        if (!question || !question.options) return null;

        const results = {
            question: question,
            segments: []
        };

        for (const option of question.options) {
            const userIds = this.getUserIdsByAnswer(questionId, option.value);
            const scores = await this.loadScoresByUserIds(userIds);
            
            // קבץ ציונים לפי מבחן
            const testScores = {};
            scores.forEach(s => {
                if (!testScores[s.test_id]) {
                    testScores[s.test_id] = [];
                }
                testScores[s.test_id].push(s.score);
            });

            // חשב ממוצעים
            const testAverages = {};
            Object.keys(testScores).forEach(testId => {
                const arr = testScores[testId];
                testAverages[testId] = Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
            });

            results.segments.push({
                answer: option,
                userCount: userIds.length,
                totalAttempts: scores.length,
                testAverages: testAverages,
                overallAverage: this.calculateAverageScore(scores)
            });
        }

        return results;
    }

    // רינדור דף פילוח מתקדם
    async renderAdvancedStatsPanel(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // טען נתונים אם עוד לא נטענו
        if (!this.responses.length) {
            await this.loadResponses();
        }

        const testNames = {
            'eyehand': 'תיאום עין-יד',
            'reaction': 'זמן תגובה',
            'memory': 'זיכרון מרחבי',
            'tracking': 'מעקב ודיוור קשב',
            'northfind': 'מציאת הצפון',
            'flightcontrol': 'בקרת טיסה',
            'targetid': 'ירי במטרות',
            'orientation': 'התמצאות וכיוונים',
            'flightexam': 'מבחן הטסה'
        };

        // שאלות עם אפשרויות בחירה (לא טקסט חופשי)
        const filterableQuestions = FEEDBACK_QUESTIONS.filter(q => 
            q.options && q.type !== 'text' && q.type !== 'textarea'
        );

        let html = `
            <div class="advanced-stats-header">
                <h3>📈 פילוח ציונים לפי תשובות</h3>
                <p class="advanced-stats-desc">בחר שאלה לפילוח וראה ממוצעי ציונים לפי תשובות</p>
            </div>
            
            <div class="advanced-stats-controls">
                <label>בחר שאלה לפילוח:</label>
                <select id="advanced-stats-question-select">
                    <option value="">-- בחר שאלה --</option>
                    ${filterableQuestions.map(q => 
                        `<option value="${q.id}">${q.id}. ${q.text.substring(0, 60)}${q.text.length > 60 ? '...' : ''}</option>`
                    ).join('')}
                </select>
                <button id="advanced-stats-analyze-btn" class="btn btn-primary">נתח</button>
            </div>
            
            <div id="advanced-stats-results" class="advanced-stats-results"></div>
        `;

        container.innerHTML = html;

        // Event listeners
        const analyzeBtn = document.getElementById('advanced-stats-analyze-btn');
        const questionSelect = document.getElementById('advanced-stats-question-select');
        const resultsDiv = document.getElementById('advanced-stats-results');

        analyzeBtn.addEventListener('click', async () => {
            const questionId = parseInt(questionSelect.value);
            if (!questionId) {
                alert('יש לבחור שאלה');
                return;
            }

            resultsDiv.innerHTML = '<div class="advanced-stats-loading"><div class="feedback-spinner"></div><p>מנתח נתונים...</p></div>';

            try {
                const results = await this.getScoresByQuestionAnswer(questionId);
                this.renderSegmentResults(resultsDiv, results, testNames);
            } catch (error) {
                console.error('[feedback-stats] Analysis error:', error);
                resultsDiv.innerHTML = '<p class="advanced-stats-error">שגיאה בניתוח הנתונים</p>';
            }
        });
    }

    renderSegmentResults(container, results, testNames) {
        if (!results || !results.segments.length) {
            container.innerHTML = '<p class="advanced-stats-empty">אין נתונים זמינים</p>';
            return;
        }

        let html = `
            <div class="segment-results">
                <h4>תוצאות פילוח: ${results.question.text}</h4>
                <div class="segment-cards">
        `;

        results.segments.forEach(segment => {
            html += `
                <div class="segment-card">
                    <div class="segment-header">
                        <span class="segment-answer">${segment.answer.label}</span>
                        <span class="segment-count">${segment.userCount} נבחנים</span>
                    </div>
                    <div class="segment-overall">
                        <span class="segment-label">ממוצע כללי:</span>
                        <span class="segment-value ${this.getScoreClass(segment.overallAverage)}">
                            ${segment.overallAverage !== null ? segment.overallAverage : 'אין נתונים'}
                        </span>
                    </div>
                    <div class="segment-tests">
                        <h5>ציונים לפי מבחן:</h5>
            `;

            if (Object.keys(segment.testAverages).length > 0) {
                Object.entries(segment.testAverages).forEach(([testId, avg]) => {
                    html += `
                        <div class="segment-test-row">
                            <span class="segment-test-name">${testNames[testId] || testId}</span>
                            <span class="segment-test-score ${this.getScoreClass(avg)}">${avg}</span>
                        </div>
                    `;
                });
            } else {
                html += '<p class="segment-no-data">אין ציונים</p>';
            }

            html += `
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    getScoreClass(score) {
        if (score === null) return '';
        if (score >= 80) return 'score-high';
        if (score >= 60) return 'score-medium';
        return 'score-low';
    }
}

// Export
window.feedbackStats = new FeedbackStats();
export { FeedbackStats };