// feedback.js - מודול שאלון המשוב
import { FEEDBACK_QUESTIONS, FEEDBACK_INTRO, FEEDBACK_THANK_YOU } from './feedback.config.js';

class FeedbackSurvey {
    constructor() {
        this.currentQuestionIndex = 0;
        this.answers = {};
        this.container = null;
        this.userId = null;
        this.onComplete = null;
    }

    async init(containerId, userId, onComplete) {
        this.container = document.getElementById(containerId);
        this.userId = userId;
        this.onComplete = onComplete;
        
        if (!this.container) {
            console.error('[feedback] Container not found:', containerId);
            return;
        }

        this.currentQuestionIndex = 0;
        this.answers = {};
        this.renderIntro();
    }

    renderIntro() {
        this.container.innerHTML = `
            <div class="feedback-wrapper">
                <div class="feedback-card feedback-intro">
                    <div class="feedback-icon">📋</div>
                    <h2>שאלון משוב</h2>
                    <p class="feedback-intro-text">${FEEDBACK_INTRO.replace(/\n/g, '<br>')}</p>
                    <button class="feedback-btn feedback-btn-primary" id="feedback-start-btn">
                        התחל שאלון
                    </button>
                </div>
            </div>
        `;

        document.getElementById('feedback-start-btn').addEventListener('click', () => {
            this.renderQuestion();
        });
    }

    getVisibleQuestions() {
        return FEEDBACK_QUESTIONS.filter(q => {
            if (!q.conditional) return true;
            const conditionAnswer = this.answers[q.conditional.questionId];
            return conditionAnswer === q.conditional.value;
        });
    }

    getCurrentQuestion() {
        const visibleQuestions = this.getVisibleQuestions();
        return visibleQuestions[this.currentQuestionIndex];
    }

    getTotalVisibleQuestions() {
        return this.getVisibleQuestions().length;
    }

    renderQuestion() {
        const question = this.getCurrentQuestion();
        if (!question) {
            this.renderThankYou();
            return;
        }

        const totalQuestions = this.getTotalVisibleQuestions();
        const progress = ((this.currentQuestionIndex) / totalQuestions) * 100;
        const currentAnswer = this.answers[question.id];

        let optionsHtml = '';
        
        switch (question.type) {
            case 'scale5':
            case 'yesno':
            case 'choice':
                optionsHtml = this.renderOptions(question, currentAnswer);
                break;
            case 'text':
                optionsHtml = this.renderTextInput(question, currentAnswer);
                break;
            case 'textarea':
                optionsHtml = this.renderTextarea(question, currentAnswer);
                break;
        }

        this.container.innerHTML = `
            <div class="feedback-wrapper">
                <div class="feedback-card">
                    <div class="feedback-progress">
                        <div class="feedback-progress-bar" style="width: ${progress}%"></div>
                    </div>
                    <div class="feedback-progress-text">
                        שאלה ${this.currentQuestionIndex + 1} מתוך ${totalQuestions}
                    </div>
                    
                    <div class="feedback-question">
                        <h3>${question.text}</h3>
                        ${question.required ? '<span class="feedback-required">*</span>' : ''}
                    </div>
                    
                    <div class="feedback-options">
                        ${optionsHtml}
                    </div>
                    
                    <div class="feedback-validation" id="feedback-validation" style="display: none;">
                        יש לענות על שאלה זו
                    </div>
                    
                    <div class="feedback-nav">
                        <button class="feedback-btn feedback-btn-secondary" id="feedback-prev-btn" 
                            ${this.currentQuestionIndex === 0 ? 'disabled' : ''}>
                            → הקודם
                        </button>
                        <button class="feedback-btn feedback-btn-primary" id="feedback-next-btn">
                            ${this.currentQuestionIndex === totalQuestions - 1 ? 'סיום' : 'הבא ←'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners(question);
    }

    renderOptions(question, currentAnswer) {
        return question.options.map(option => `
            <label class="feedback-option ${currentAnswer === option.value ? 'selected' : ''}">
                <input type="radio" name="q${question.id}" value="${option.value}" 
                    ${currentAnswer === option.value ? 'checked' : ''}>
                <span class="feedback-option-label">${option.label}</span>
            </label>
        `).join('');
    }

    renderTextInput(question, currentAnswer) {
        return `
            <input type="text" class="feedback-text-input" id="feedback-text-${question.id}"
                placeholder="${question.placeholder || ''}"
                value="${currentAnswer || ''}">
        `;
    }

    renderTextarea(question, currentAnswer) {
        return `
            <textarea class="feedback-textarea" id="feedback-textarea-${question.id}"
                placeholder="${question.placeholder || ''}"
                rows="5">${currentAnswer || ''}</textarea>
        `;
    }

    attachEventListeners(question) {
        // Radio buttons
        const radioInputs = this.container.querySelectorAll('input[type="radio"]');
        radioInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                let value = e.target.value;
                // Convert numeric values
                if (!isNaN(value) && value !== '') {
                    value = parseInt(value);
                }
                this.answers[question.id] = value;
                
                // Update visual selection
                this.container.querySelectorAll('.feedback-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                e.target.closest('.feedback-option').classList.add('selected');
                
                // Hide validation error
                document.getElementById('feedback-validation').style.display = 'none';
            });
        });

        // Text input
        const textInput = this.container.querySelector('.feedback-text-input');
        if (textInput) {
            textInput.addEventListener('input', (e) => {
                this.answers[question.id] = e.target.value;
                document.getElementById('feedback-validation').style.display = 'none';
            });
        }

        // Textarea
        const textarea = this.container.querySelector('.feedback-textarea');
        if (textarea) {
            textarea.addEventListener('input', (e) => {
                this.answers[question.id] = e.target.value;
                document.getElementById('feedback-validation').style.display = 'none';
            });
        }

        // Navigation buttons
        document.getElementById('feedback-prev-btn').addEventListener('click', () => {
            this.goToPrevious();
        });

        document.getElementById('feedback-next-btn').addEventListener('click', () => {
            this.goToNext(question);
        });
    }

    goToPrevious() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.renderQuestion();
        }
    }

    goToNext(question) {
        // Validate required question
        if (question.required) {
            const answer = this.answers[question.id];
            if (answer === undefined || answer === null || answer === '') {
                document.getElementById('feedback-validation').style.display = 'block';
                return;
            }
        }

        const totalQuestions = this.getTotalVisibleQuestions();
        
        if (this.currentQuestionIndex < totalQuestions - 1) {
            this.currentQuestionIndex++;
            this.renderQuestion();
        } else {
            // Last question - submit
            this.submit();
        }
    }

    async submit() {
        // במצב תצוגה מקדימה - לא שומרים ל-DB
        if (this.userId === 'preview-mode') {
            console.log('[feedback] Preview mode - skipping save');
            this.renderThankYou();
            return;
        }
        
        this.container.innerHTML = `
            <div class="feedback-wrapper">
                <div class="feedback-card feedback-loading">
                    <div class="feedback-spinner"></div>
                    <p>שומר את התשובות...</p>
                </div>
            </div>
        `;

        try {
            await this.saveToDatabase();
            // סימון המשתמש כמי שסיים את כל המבחנים
            await this.markUserAsCompleted();
            this.renderThankYou();
        } catch (error) {
            console.error('[feedback] Error saving:', error);
            this.container.innerHTML = `
                <div class="feedback-wrapper">
                    <div class="feedback-card feedback-error">
                        <div class="feedback-icon">❌</div>
                        <h2>שגיאה בשמירה</h2>
                        <p>אירעה שגיאה בשמירת התשובות. אנא נסה שנית.</p>
                        <button class="feedback-btn feedback-btn-primary" id="feedback-retry-btn">
                            נסה שנית
                        </button>
                    </div>
                </div>
            `;
            document.getElementById('feedback-retry-btn').addEventListener('click', () => {
                this.submit();
            });
        }
    }

    async markUserAsCompleted() {
        if (!window.supabaseClient || !this.userId || this.userId === 'preview-mode') {
            return;
        }
        
        try {
            const { error } = await window.supabaseClient
                .from('exam_users')
                .update({ all_tests_done: true })
                .eq('id', this.userId);
            
            if (error) {
                console.warn('[feedback] Failed to mark user as completed:', error);
            } else {
                console.log('[feedback] User marked as completed all tests');
            }
        } catch (err) {
            console.warn('[feedback] Error marking user as completed:', err);
        }
    }

    async saveToDatabase() {
        if (!window.supabaseClient) {
            throw new Error('Supabase client not available');
        }

        const payload = {
            user_id: this.userId,
            answers: this.answers,
            submitted_at: new Date().toISOString()
        };

        const { error } = await window.supabaseClient
            .from('feedback_responses')
            .insert(payload);

        if (error) {
            throw error;
        }

        console.log('[feedback] Saved successfully');
    }

    renderThankYou() {
        this.container.innerHTML = `
            <div class="feedback-wrapper">
                <div class="feedback-card feedback-thankyou">
                    <div class="feedback-icon">🙏</div>
                    <h2>תודה רבה!</h2>
                    <p class="feedback-thankyou-text">${FEEDBACK_THANK_YOU.replace(/\n/g, '<br>')}</p>
                    <button class="feedback-btn feedback-btn-primary" id="feedback-exit-btn">
                        יציאה מהמערכת
                    </button>
                </div>
            </div>
        `;

        document.getElementById('feedback-exit-btn').addEventListener('click', () => {
            console.log('[feedback] Exit button clicked');
            
            // הסתר את סקשן המשוב
            const feedbackSection = document.getElementById('feedback-section');
            if (feedbackSection) {
                feedbackSection.style.display = 'none';
                console.log('[feedback] Hidden feedback section');
            }
            
            // הצג את ה-container הראשי
            const container = document.querySelector('.container');
            if (container) {
                container.style.display = 'block';
                console.log('[feedback] Shown container');
            }
            
            // הצג את מסך ההתחברות
            const loginScreen = document.getElementById('login-screen');
            if (loginScreen) {
                loginScreen.style.display = 'flex';
                console.log('[feedback] Shown login screen');
            }
            
            if (this.onComplete) {
                console.log('[feedback] Calling onComplete callback');
                this.onComplete();
            } else {
                console.log('[feedback] No onComplete callback, performing manual logout');
                // אם אין callback - בצע התנתקות ידנית
                if (window.testAuth && typeof window.testAuth.logout === 'function') {
                    window.testAuth.logout();
                }
                localStorage.removeItem('currentUser');
                localStorage.removeItem('currentUserUuid');
                localStorage.removeItem('currentUserRecord');
                localStorage.removeItem('isAdmin');
            }
        });
    }
}

// יצוא instance גלובלי
window.feedbackSurvey = new FeedbackSurvey();

export { FeedbackSurvey };
