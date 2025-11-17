// Orientation Test - Simplified
(function(){
  const DIRECTIONS = {
    'N2S': 'מצפון לדרום',
    'S2N': 'מדרום לצפון',
    'E2W': 'ממזרח למערב',
    'W2E': 'ממערב למזרח'
  };

  let orientationSets = []; // ייקלטו מההגדרות דרך window.loadOrientationSets
  window.loadOrientationSets = function(list){
    orientationSets = Array.isArray(list)? list.filter(s=>s && (s.topImage || (s.viewImages && s.viewImages.length))) : [];
    console.log('[orientation] received sets', orientationSets.length);
  };

  const SETS = [
    'תרגיל כיוונים 1', 'תרגיל כיוונים 2', 'תרגיל כיוונים 3', 'תרגיל כיוונים 4',
    'תרגיל כיוונים 5', 'תרגיל כיוונים 6', 'תרגיל כיוונים 7', 'תרגיל כיוונים 8'
  ];

  let currentSet = 0;
  let currentQuestion = 0;
  let questions = [];
  let results = [];
  let stage = 'idle'; // idle | viewing-top | question | complete
  let topViewTimer = null;
  let startTime = 0;

  function getConfig(){
    const cfg = window.getTestConfig ? window.getTestConfig('orientation') : null;
    const orientCfg = window.getOrientationConfig ? window.getOrientationConfig() : {};
    return {
      displayTimeSec: (orientCfg.displayTimeSec) || (cfg && cfg.displayTimeSec) || 10,
      maxQuestions: (orientCfg.maxQuestions) || (cfg && cfg.maxQuestions) || 10,
      timeLimitMin: (orientCfg.timeLimitMin) || (cfg && cfg.timeLimitMin) || 6,
      scoreScale: (orientCfg.scoreScale) || (cfg && cfg.scoreScale) || 7,
      showCompass: orientCfg.showCompass !== false
    };
  }

  function buildQuestions(){
    const cfg = getConfig();
    const qs = [];
    // אם קיימות קבוצות מההגדרות – השתמש בהן
    if(orientationSets.length){
      const shuffled = orientationSets.slice().sort(()=>Math.random()-0.5);
      for(const set of shuffled){
        if(!set.viewImages || !set.viewImages.length) continue;
        const view = set.viewImages[Math.floor(Math.random()*set.viewImages.length)];
        if(!view || !view.orient || !DIRECTIONS[view.orient]) continue;
        qs.push({
          setName: set.name || 'קבוצה',
            topImage: set.topImage || '',
          questionImage: view.url,
          correctAnswer: view.orient
        });
        if(qs.length >= cfg.maxQuestions) break;
      }
      return qs;
    }
    // אחרת – ברירת מחדל מתיקיית assets כמו קודם
    for(let i = 1; i <= Math.min(8, cfg.maxQuestions); i++){
      const setNum = i;
      const setName = `תרגיל כיוונים ${setNum}`;
      const dirs = Object.keys(DIRECTIONS);
      const selectedDir = dirs[Math.floor(Math.random() * dirs.length)];
      qs.push({
        setNum,
        setName,
        topImage: `assets/images/orientation/${setName}/${setNum}-TOP.jpeg`,
        questionImage: `assets/images/orientation/${setName}/${setNum}-${selectedDir}.jpeg`,
        correctAnswer: selectedDir
      });
    }
    return qs.slice(0, cfg.maxQuestions);
  }

  function start(){
    const cfg = getConfig();
    questions = buildQuestions();
    results = [];
    currentQuestion = 0;
    stage = 'viewing-top';
    startTime = Date.now();
    
    if(window.enterFullscreenMode) window.enterFullscreenMode();
    
    showTopView();
  }

  function showTopView(){
    const q = questions[currentQuestion];
    const cfg = getConfig();
    
    document.getElementById('orientation-intro').style.display = 'none';
    document.getElementById('orientation-test').style.display = 'block';
    document.getElementById('orientation-results').style.display = 'none';
    
    const compassHtml = cfg.showCompass ? `
        <div style="position: absolute; top: 20px; left: 20px; z-index: 10;">
          <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.5); border: 4px solid white;">
            <div style="font-size: 40px; margin-bottom: -8px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">↑</div>
            <div style="font-size: 28px; font-weight: bold; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">N</div>
          </div>
          <div style="margin-top: 8px; background: rgba(0,0,0,0.8); color: white; padding: 6px 12px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
            הצפון למעלה
          </div>
        </div>` : '';
    
    const container = document.getElementById('orientation-test');
    container.innerHTML = `
      <div style="position: relative; width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a;">
        ${compassHtml}
        <img src="${q.topImage}" style="max-width: 90%; max-height: 90vh; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
        <div style="position: absolute; bottom: 30px; background: rgba(0,0,0,0.7); color: white; padding: 20px 40px; border-radius: 12px; font-size: 24px;">
          התבונן במפה (${cfg.displayTimeSec} שניות)
        </div>
      </div>
    `;
    
    // טיימר מעבר לשאלה
    if(topViewTimer) clearTimeout(topViewTimer);
    topViewTimer = setTimeout(() => {
      stage = 'question';
      showQuestion();
    }, cfg.displayTimeSec * 1000);
  }

  function isAdmin(){ return window.testAuth && window.testAuth.isAdmin && window.testAuth.isAdmin(); }

  function showQuestion(){
    const q = questions[currentQuestion];
    const cfg = getConfig();
    const admin = isAdmin();
    const container = document.getElementById('orientation-test');
    const headerContent = admin ? `
          <button id="show-top-btn" style="
            padding: 10px 20px; font-size: 16px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3); transition: all 0.3s;">🗺️ הצג תמונת TOP</button>
          <div style="font-size: 18px;">נכונות: ${results.filter(r=>r.correct).length} | שגויות: ${results.filter(r=>!r.correct).length}</div>` : `
          <button id="show-top-btn" style="
            padding: 10px 20px; font-size: 16px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3); transition: all 0.3s;">🗺️ הצג תמונת TOP</button>`;
    container.innerHTML = `
      <div style="width: 100%; height: 100vh; display: flex; flex-direction: column; background: #0f172a; color: white;">
        <div style="padding: 20px; background: rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; gap:20px;">${headerContent}</div>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <img src="${q.questionImage}" style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
        </div>
        <div style="padding: 30px; background: rgba(0,0,0,0.5);">
          <div style="font-size: 22px; margin-bottom: 20px; text-align: center;">מאיזה כיוון לאיזה כיוון זווית הצילום?</div>
          <div id="answer-buttons" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
            ${Object.entries(DIRECTIONS).map(([key, label]) => `
              <button class="orient-answer-btn" data-answer="${key}" style="padding: 15px 30px; font-size: 18px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s; min-width: 180px;">${label}</button>
            `).join('')}
          </div>
        </div>
      </div>`;
    const showTopBtn = document.getElementById('show-top-btn');
    showTopBtn.addEventListener('click', () => openTopImageModal(q.topImage));
    showTopBtn.addEventListener('mouseenter', function(){ this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(14,165,233,0.5)'; });
    showTopBtn.addEventListener('mouseleave', function(){ this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(14,165,233,0.3)'; });
    const answerTime = Date.now();
    document.querySelectorAll('.orient-answer-btn').forEach(btn=>{
      btn.addEventListener('click',()=>handleAnswer(btn.dataset.answer, answerTime));
      btn.addEventListener('mouseenter', function(){ this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(102,126,234,0.4)'; });
      btn.addEventListener('mouseleave', function(){ this.style.transform='scale(1)'; this.style.boxShadow='none'; });
    });
  }

  function openTopImageModal(topImageUrl){
    const cfg = getConfig();
    const compassModal = cfg.showCompass ? `
        <div style="position: absolute; top: 20px; left: 20px; z-index: 10;">
          <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.5); border: 4px solid white;">
            <div style="font-size: 40px; margin-bottom: -8px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">↑</div>
            <div style="font-size: 28px; font-weight: bold; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">N</div>
          </div>
          <div style="margin-top: 8px; background: rgba(0,0,0,0.8); color: white; padding: 6px 12px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
            הצפון למעלה
          </div>
        </div>` : '';
    // יצירת modal להצגת תמונת TOP
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.95);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s;
    `;
    
    modal.innerHTML = `
      <div style="position: relative; max-width: 95%; max-height: 95vh; display: flex; flex-direction: column; align-items: center;">
        ${compassModal}
        <img src="${topImageUrl}" style="max-width: 100%; max-height: 85vh; object-fit: contain; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.6);">
        
        <button id="close-modal-btn" style="
          margin-top: 20px;
          padding: 12px 30px;
          font-size: 18px;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        ">✕ סגור</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // סגירה בלחיצה על הרקע או כפתור
    const closeBtn = modal.querySelector('#close-modal-btn');
    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if(e.target === modal) modal.remove();
    });
    
    // סגירה ב-ESC
    const escHandler = (e) => {
      if(e.key === 'Escape'){
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    
    // הוספת אנימציה
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function handleAnswer(answer, answerTime){
    const q = questions[currentQuestion];
    const correct = answer === q.correctAnswer;
    const duration = Math.round((Date.now() - answerTime) / 1000);
    
    results.push({
      questionNum: currentQuestion + 1,
      setName: q.setName,
      correctAnswer: DIRECTIONS[q.correctAnswer],
      userAnswer: DIRECTIONS[answer],
      correct,
      duration
    });
    
    // פידבק ויזואלי
    const btns = document.querySelectorAll('.orient-answer-btn');
    btns.forEach(btn => {
      btn.disabled = true;
      if(btn.dataset.answer === answer){
        btn.style.background = correct ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      }
      if(btn.dataset.answer === q.correctAnswer){
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btn.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.6)';
      }
    });
    
    // מעבר לשאלה הבאה או סיום
    setTimeout(() => {
      currentQuestion++;
      if(currentQuestion < questions.length){
        showTopView();
      } else {
        finish();
      }
    }, 1200);
  }

  function finish(){
    if(topViewTimer) clearTimeout(topViewTimer);
    if(window.exitFullscreenMode) window.exitFullscreenMode();
    const cfg = getConfig();
    const total = results.length;
    const correct = results.filter(r => r.correct).length;
    const percent = Math.round((correct / total) * 100);
    const score = Math.round((correct / total) * cfg.scoreScale);
    const admin = isAdmin();
    const container = document.getElementById('orientation-test');
    container.innerHTML = admin ? `
      <div style="width:100%;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:white;">
        <div style="background:rgba(0,0,0,0.7);padding:50px;border-radius:16px;text-align:center;max-width:600px;">
          <h2 style="font-size:36px;margin-bottom:30px;color:#3b82f6;">מבחן הסתיים (מנהל)</h2>
          <div style="font-size:24px;margin-bottom:40px;">
            <div style="margin:15px 0;">סה"כ שאלות: <strong>${total}</strong></div>
            <div style="margin:15px 0;color:#10b981;">תשובות נכונות: <strong>${correct}</strong></div>
            <div style="margin:15px 0;color:#ef4444;">תשובות שגויות: <strong>${total - correct}</strong></div>
            <div style="margin:15px 0;">אחוז הצלחה: <strong>${percent}%</strong></div>
            <div style="margin:25px 0;font-size:32px;color:#fbbf24;">ציון: <strong>${score} / ${cfg.scoreScale}</strong></div>
          </div>
          <button onclick="location.reload()" style="padding:15px 40px;font-size:20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;cursor:pointer;">חזור למסך הבית</button>
        </div>
      </div>` : `
      <div style="width:100%;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:white;">
        <div style="background:rgba(0,0,0,0.65);padding:50px;border-radius:20px;text-align:center;max-width:520px;">
          <h2 style="font-size:34px;margin-bottom:28px;color:#3b82f6;">המבחן הסתיים</h2>
          <p style="font-size:20px;margin:0 0 30px;color:#e2e8f0;">המשך למבחן הבא או יציאה.</p>
          <button onclick="location.reload()" style="padding:14px 36px;font-size:19px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:10px;cursor:pointer;">סיום</button>
        </div>
      </div>`;
    if(window.testAuth){
      window.testAuth.markTestCompleted('orientation');
      window.testAuth.showTestCompleteModal('orientation', score.toFixed(2));
    }
    console.log('[orientation] Test completed', {total, correct, percent, score});
  }

  // Event listeners
  const startBtn = document.getElementById('start-orientation');
  if(startBtn) startBtn.addEventListener('click', start);
  
  console.log('[orientation] Module loaded - simplified version');
})();
