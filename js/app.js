// Eye-Hand Coordination Test Application
// Main application logic and path generation

class EyeHandTest {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.path = [];
        this.pathWidth = 20; // הצרת המסלול
        this.wallWidth = 5; // דופן צרה יותר
        this.testDuration = 30000; // 30 seconds
        this.testActive = false;
        this.testStarted = false;
        this.startTime = 0;
        this.currentProgress = 0;
        this.penalties = 0;
        this.isMouseDown = false;
        this.lastPosition = null;
        this.timerInterval = null;
        this.pathSeed = Date.now();
        this.lastPenaltyTime = 0; // למניעת ספירה כפולה של טעויות
        this.penaltyThreshold = 150; // נשאר רק לסוגי טעויות אחרים (כעת אין אחרים)
        this.wasOutsidePath = false; // מעקב אם היינו בחוץ (כבר לא בשימוש לניקוד)
        this.isTouchingWall = false; // דגל אם כרגע הקו הכחול צמוד לקיר כדי לא לספור כפול
        this.trailWidth = 3; // עובי הקו הכחול לצורך דגימה
        this.maskCanvas = null; // קנבס סטטי למסלול
        this.maskCtx = null; // קונטקסט למסלול (קירות+מסלול) ללא הקו הכחול
        this.samplePoints = []; // נקודות דגימה לפריסת המסלול
        this.lastInsideIndex = 0; // ההתקדמות המקסימלית החוקית במסלול
        this.maxIndexJump = 30; // מניעת קפיצה קדימה מעבר לכמות זו
        this.lastOutsidePenaltyTime = 0; // תזמון עונש יציאה
        this.outsidePenaltyCooldown = 300; // ms בין עונשי יציאה
        this.mouseUpPenaltyGiven = false; // כדי שלא נספור פעמיים בסוף
        this.finishTolerance = 0.995; // סף לסיום מוקדם (99.5% מהנקודות)
        this.totalPathLength = 0; // אורך המסלול הכולל בפיקסלים
        this.insideLength = 0; // אורך חוקי שנסע בתוך המסלול
        this.wallLength = 0; // אורך תנועה על הקיר
        this.outsideLength = 0; // אורך תנועה מחוץ למסלול
        this.liftCount = 0; // הרמות עכבר
        // גורמי ענישה (ניתן לכוונון בעתיד)
        this.wallFactor = 1.5; // כל 1% מגע בקיר מוריד 1.5 נק'
        this.outsideFactor = 3; // כל 1% מחוץ למסלול מוריד 3 נק'
        this.liftFactor = 2; // כל הרמה מורידה 2 נק'
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const startButton = document.getElementById('start-button');
        const retryButton = document.getElementById('retry-button');
        const newPathButton = document.getElementById('new-path-button');

        startButton.addEventListener('click', () => this.showTestScreen());
        retryButton.addEventListener('click', () => this.retryTest());
        newPathButton.addEventListener('click', () => this.newPathTest());
    }

    showTestScreen() {
        this.switchScreen('test-screen');
        this.enterFullscreen();
        // המתן קצת שה-fullscreen ייכנס
        setTimeout(() => {
            this.setupCanvas();
            this.generatePath();
            this.drawPath();
            this.setupCanvasListeners();
        }, 100);
    }

    enterFullscreen() {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
    }

    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
    }

    setupCanvas() {
        this.canvas = document.getElementById('test-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size to full screen
        this.canvas.width = window.innerWidth - 40; // קצת מרווח מהקצוות
        this.canvas.height = window.innerHeight - 200; // מקום לסטטיסטיקות למעלה
        
        // Enable better rendering
        this.ctx.imageSmoothingEnabled = true;

        // יצירת קנבס נסתר למסלול הסטטי
        this.maskCanvas = document.createElement('canvas');
        this.maskCanvas.width = this.canvas.width;
        this.maskCanvas.height = this.canvas.height;
        this.maskCtx = this.maskCanvas.getContext('2d');
    }

    generatePath() {
        this.path = [];
        const width = this.canvas.width;
        const height = this.canvas.height;
        const margin = 60;
        
        // Create a winding path - מסלול קצר יותר בחצי
        const segments = 8; // הקטנה מ-15 ל-8
        const segmentLength = (width - 2 * margin) / segments;
        
        let x = margin;
        let y = height / 2;
        
        this.path.push({ x, y });
        
        // Use seed for reproducible paths
        const random = this.seededRandom(this.pathSeed);
        
        for (let i = 0; i < segments; i++) {
            const controlPoints = [];
            
            // Add variation - תנודות מותאמות
            const amplitude = 150 + random() * 100;
            const direction = i % 2 === 0 ? 1 : -1;
            
            // Control point 1
            controlPoints.push({
                x: x + segmentLength * 0.35,
                y: y + direction * amplitude * (0.6 + random() * 0.4)
            });
            
            // Control point 2
            controlPoints.push({
                x: x + segmentLength * 0.65,
                y: y + direction * amplitude * (0.4 + random() * 0.5)
            });
            
            // End point
            x += segmentLength;
            y = height / 2 + (random() - 0.5) * 250;
            
            // Keep within bounds
            y = Math.max(margin, Math.min(height - margin, y));
            
            this.path.push({
                type: 'bezier',
                cp1: controlPoints[0],
                cp2: controlPoints[1],
                end: { x, y }
            });
        }
        // בסיום בניית this.path נבצע שטיח נקודות למסלול
        this.flattenPath();
    }

    seededRandom(seed) {
        let value = seed;
        return function() {
            value = (value * 9301 + 49297) % 233280;
            return value / 233280;
        };
    }

    drawPath() {
        const ctx = this.ctx;
        const mctx = this.maskCtx; // קונטקסט למסכה
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        mctx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);

        // ציור קירות גם במסכה
        mctx.strokeStyle = '#757575';
        mctx.lineWidth = this.pathWidth + (this.wallWidth * 2);
        mctx.lineCap = 'round';
        mctx.lineJoin = 'round';
        mctx.beginPath();
        const start = this.path[0];
        mctx.moveTo(start.x, start.y);
        for (let i = 1; i < this.path.length; i++) {
            const segment = this.path[i];
            if (segment.type === 'bezier') {
                mctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.end.x, segment.end.y);
            }
        }
        mctx.stroke();

        // ציור קירות על הקנבס הראשי
        ctx.strokeStyle = '#757575';
        ctx.lineWidth = this.pathWidth + (this.wallWidth * 2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < this.path.length; i++) {
            const segment = this.path[i];
            if (segment.type === 'bezier') {
                ctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.end.x, segment.end.y);
            }
        }
        ctx.stroke();

        // ציור מסלול לבן גם במסכה
        mctx.strokeStyle = 'white';
        mctx.lineWidth = this.pathWidth;
        mctx.beginPath();
        mctx.moveTo(start.x, start.y);
        for (let i = 1; i < this.path.length; i++) {
            const segment = this.path[i];
            if (segment.type === 'bezier') {
                mctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.end.x, segment.end.y);
            }
        }
        mctx.stroke();

        // ציור מסלול לבן על הראשי
        ctx.strokeStyle = 'white';
        ctx.lineWidth = this.pathWidth;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < this.path.length; i++) {
            const segment = this.path[i];
            if (segment.type === 'bezier') {
                ctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.end.x, segment.end.y);
            }
        }
        ctx.stroke();

        // עיגול התחלה + סוף (לא נדרש במסכה לזיהוי קיר, אך נשאיר עקביות)
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(start.x, start.y, 20, 0, Math.PI * 2);
        ctx.fill();
        const end = this.path[this.path.length - 1].end;
        ctx.fillStyle = '#f44336';
        ctx.beginPath();
        ctx.arc(end.x, end.y, 20, 0, Math.PI * 2);
        ctx.fill();

        // בסוף ציור המסלול נוודא שהמסכה קיימת ודגימות מוכנות
        if (!this.samplePoints.length) {
            this.flattenPath();
        }
    }

    // --- פונקציה לדגימת המסלול לנקודות רציפות ---
    flattenPath() {
        this.samplePoints = [];
        if (!this.path.length) return;
        const start = this.path[0];
        let prev = { x: start.x, y: start.y };
        this.samplePoints.push({ x: prev.x, y: prev.y });
        // כמה דגימות לכל bezier
        const SAMPLES_PER_SEGMENT = 120;
        for (let i = 1; i < this.path.length; i++) {
            const seg = this.path[i];
            if (seg.type === 'bezier') {
                for (let s = 1; s <= SAMPLES_PER_SEGMENT; s++) {
                    const t = s / SAMPLES_PER_SEGMENT;
                    const x = this.bezierPoint(prev.x, seg.cp1.x, seg.cp2.x, seg.end.x, t);
                    const y = this.bezierPoint(prev.y, seg.cp1.y, seg.cp2.y, seg.end.y, t);
                    this.samplePoints.push({ x, y });
                }
                prev = { x: seg.end.x, y: seg.end.y };
            }
        }
        // חישוב אורך המסלול הכולל (סכום מרחקי נקודות הדגימה)
        this.totalPathLength = 0;
        for (let i = 1; i < this.samplePoints.length; i++) {
            const a = this.samplePoints[i - 1];
            const b = this.samplePoints[i];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            this.totalPathLength += Math.sqrt(dx * dx + dy * dy);
        }
    }

    bezierPoint(p0, p1, p2, p3, t) {
        const mt = 1 - t;
        return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
    }

    // --- בדיקה אם פיקסל בתוך המסלול הלבן ---
    isInsidePathPixel(x, y) {
        if (!this.maskCtx) return false;
        if (x < 0 || x >= this.maskCanvas.width || y < 0 || y >= this.maskCanvas.height) return false;
        const pixel = this.maskCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        const r = pixel[0], g = pixel[1], b = pixel[2];
        return (r >= 245 && g >= 245 && b >= 245); // לבן
    }

    // --- מציאת אינדקס ההתקדמות הקרוב ---
    getNearestPathIndex(pos) {
        if (!this.isInsidePathPixel(pos.x, pos.y)) return null; // רק אם באמת בתוך המסלול
        // חיפוש לוקאלי במקום חיפוש מלא: נטול קפיצות גדולות
        const searchRadius = 400; // פיקסלים מרחק מקס לחיפוש קדימה
        let bestIdx = null;
        let bestDist = Infinity;
        // נתחיל מהאינדקס האחרון כדי להגביל חזרה אחורה מינימלית
        const startIdx = Math.max(0, this.lastInsideIndex - 50);
        const endIdx = Math.min(this.samplePoints.length - 1, this.lastInsideIndex + 800); // חלון קדימה גדול
        for (let i = startIdx; i <= endIdx; i++) {
            const pt = this.samplePoints[i];
            const dx = pt.x - pos.x;
            const dy = pt.y - pos.y;
            const dist = dx*dx + dy*dy; // בלי sqrt לחיסכון
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
        // אם המרחק גדול מידי (לא באמת על המסלול) נתעלם
        if (bestDist > searchRadius*searchRadius) return null;
        return bestIdx;
    }

    // --- עדכון התקדמות אמיתי ---
    updateProgressAccurate(pos) {
        const idx = this.getNearestPathIndex(pos);
        if (idx === null) return; // לא בתוך המסלול
        // מניעת קפיצות רמאות: אם קפץ רחוק קדימה מעבר לסף – לא נאשר או נוסיף עונש
        if (idx > this.lastInsideIndex + this.maxIndexJump) {
            this.addPenalty(3, 'קפיצה קדימה לא חוקית');
            return; // לא מעדכן
        }
        if (idx > this.lastInsideIndex) {
            this.lastInsideIndex = idx;
            const percent = (this.lastInsideIndex / (this.samplePoints.length - 1)) * 100;
            this.currentProgress = Math.min(100, percent);
            this.updateStats();
        }
    }

    setupCanvasListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        
        // Check if starting at the start point
        if (!this.testStarted) {
            const start = this.path[0];
            const dist = Math.sqrt(Math.pow(pos.x - start.x, 2) + Math.pow(pos.y - start.y, 2));
            
            if (dist <= 20) {
                this.startTest();
                this.isMouseDown = true;
                this.lastPosition = pos;
                document.getElementById('start-prompt').style.display = 'none';
            }
        } else if (this.testActive) {
            this.isMouseDown = true;
            this.lastPosition = pos;
        }
        this.mouseUpPenaltyGiven = false;
    }

    handleMouseUp(e) {
        // הרמת עכבר באמצע המסלול = הרמה (עונש יחסי)
        if (this.testActive && this.currentProgress < 100) {
            this.liftCount++;
            this.updateStats();
        }
        this.isMouseDown = false;
        this.lastPosition = null;
        this.isTouchingWall = false;
    }

    handleMouseLeave(e) {
        if (this.testActive && this.isMouseDown) {
            this.addPenalty(2, 'יציאה מהקנבס');
        }
        this.isMouseDown = false;
        this.isTouchingWall = false;
    }

    handleMouseMove(e) {
        if (!this.testActive || !this.isMouseDown) return;
        const pos = this.getMousePos(e);
        if (!this.lastPosition) { this.lastPosition = pos; return; }
        // דגימת הקו שבין lastPosition לבין pos למקטעים קטנים
        const from = this.lastPosition;
        const to = pos;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const segmentLength = Math.sqrt(dx*dx + dy*dy);
        if (segmentLength === 0) return;
        const SUB_SAMPLES = 20; // כמות דגימות לאורך התנועה הנוכחית
        let prevPoint = from;
        for (let i = 1; i <= SUB_SAMPLES; i++) {
            const t = i / SUB_SAMPLES;
            const cx = from.x + dx * t;
            const cy = from.y + dy * t;
            const cls = this.classifyPixel(cx, cy);
            // מרחק בין נקודת הדגימה הקודמת לנוכחית
            const ddx = cx - prevPoint.x;
            const ddy = cy - prevPoint.y;
            const d = Math.sqrt(ddx*ddx + ddy*ddy);
            if (d > 0.0001) { // סף זעיר למניעת רעש
                if (cls === 'inside') this.insideLength += d;
                else if (cls === 'wall') this.wallLength += d;
                else if (cls === 'outside') this.outsideLength += d;
            }
            prevPoint = { x: cx, y: cy };
        }
        // עדכון אחוז התקדמות חוקית
        const insidePercent = (this.insideLength / this.totalPathLength) * 100;
        this.currentProgress = Math.min(100, insidePercent);
        // סיום אם כמעט הכל בוצע
        if (this.currentProgress >= 99.5) {
            this.currentProgress = 100;
            this.updateStats();
            this.endTest();
        } else {
            this.updateStats();
        }
        // ציור קו
        this.drawTrail(this.lastPosition, pos);
        this.lastPosition = pos;
    }

    classifyPixel(x, y) {
        if (this.isInsidePathPixel(x, y)) return 'inside';
        if (this.isWallPixel(x, y)) return 'wall';
        return 'outside';
    }

    segmentTouchesWall(from, to) {
        if (!from || !to) return false;
        const samples = 16; // יותר דגימות לדיוק
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        // וקטור נורמל לכיוון התנועה
        const nx = -dy / length;
        const ny = dx / length;
        const halfWidth = this.trailWidth / 2;
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const cx = from.x + dx * t;
            const cy = from.y + dy * t;
            // דגימה בשלוש נקודות לרוחב הקו: מרכז, שמאל, ימין
            const offsets = [0, -halfWidth, halfWidth];
            for (const off of offsets) {
                const sx = cx + nx * off;
                const sy = cy + ny * off;
                if (this.isWallPixel(sx, sy)) {
                    return true;
                }
            }
        }
        return false;
    }

    isWallPixel(x, y) {
        if (!this.maskCtx) return false;
        if (x < 0 || x >= this.maskCanvas.width || y < 0 || y >= this.maskCanvas.height) return false;
        const pixel = this.maskCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        const r = pixel[0], g = pixel[1], b = pixel[2];
        return (r >= 110 && r <= 125 && g >= 110 && g <= 125 && b >= 110 && b <= 125);
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    getPixelColor(pos) {
        if (pos.x < 0 || pos.x >= this.canvas.width || pos.y < 0 || pos.y >= this.canvas.height) {
            return null;
        }
        const imageData = this.ctx.getImageData(Math.floor(pos.x), Math.floor(pos.y), 1, 1);
        const pixel = imageData.data;
        return { r: pixel[0], g: pixel[1], b: pixel[2] };
    }

    drawTrail(from, to) {
        if (!from || !to) return;
        
        this.ctx.strokeStyle = '#667eea';
        this.ctx.lineWidth = this.trailWidth;
        this.ctx.lineCap = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();
    }

    addPenalty(points = 1, reason = '') {
        // פונקציה נשמרת לתאימות אך לא בשימוש לניקוד יחסי החדש
        console.log(`(deprecated addPenalty) ${points}: ${reason}`);
    }

    startTest() {
        this.testActive = true;
        this.testStarted = true;
        this.startTime = Date.now();
        this.currentProgress = 0;
        this.penalties = 0;
        
        this.startTimer();
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const remaining = Math.max(0, this.testDuration - elapsed);
            
            const seconds = (remaining / 1000).toFixed(1);
            document.getElementById('timer').textContent = seconds;
            
            if (remaining <= 0) {
                this.endTest();
            }
        }, 100);
    }

    endTest() {
        if (!this.testActive) return; // הגנה מפני קריאה כפולה
        this.testActive = false;
        clearInterval(this.timerInterval);
        this.showResults();
    }

    updateStats() {
        // אחוזים יחסיים
        const insidePercent = (this.insideLength / this.totalPathLength) * 100;
        const wallPercent = (this.wallLength / this.totalPathLength) * 100;
        const outsidePercent = (this.outsideLength / this.totalPathLength) * 100;
        // ענישה יחסית
        const wallPenaltyPercent = wallPercent * this.wallFactor;
        const outsidePenaltyPercent = outsidePercent * this.outsideFactor;
        const liftPenaltyPercent = this.liftCount * this.liftFactor; // כל הרמה כשווה לאחוזים קבועים
        // ציון סופי
        const rawScore = insidePercent - wallPenaltyPercent - outsidePenaltyPercent - liftPenaltyPercent;
        const finalScore = Math.max(0, Math.min(100, rawScore));
        // שמירה לשדות קיימים
        this.currentProgress = Math.min(100, insidePercent);
        this.penalties = Math.max(0, Math.floor(wallPenaltyPercent + outsidePenaltyPercent + liftPenaltyPercent));
        // עדכון תצוגה קיימת
        const progressEl = document.getElementById('progress');
        if (progressEl) progressEl.textContent = Math.floor(this.currentProgress) + '%';
        const penaltiesEl = document.getElementById('penalties');
        if (penaltiesEl) penaltiesEl.textContent = this.penalties;
        const scoreEl = document.getElementById('current-score');
        if (scoreEl) scoreEl.textContent = Math.floor(finalScore);
    }

    showResults() {
        const insidePercent = (this.insideLength / this.totalPathLength) * 100;
        const wallPercent = (this.wallLength / this.totalPathLength) * 100;
        const outsidePercent = (this.outsideLength / this.totalPathLength) * 100;
        const wallPenaltyPercent = wallPercent * this.wallFactor;
        const outsidePenaltyPercent = outsidePercent * this.outsideFactor;
        const liftPenaltyPercent = this.liftCount * this.liftFactor;
        const rawScore = insidePercent - wallPenaltyPercent - outsidePenaltyPercent - liftPenaltyPercent;
        const finalScore = Math.max(0, Math.min(100, rawScore));
        const elapsed = (Date.now() - this.startTime) / 1000;
        const finalScoreEl = document.getElementById('final-score');
        if (finalScoreEl) finalScoreEl.textContent = Math.floor(finalScore);
        const resultProgressEl = document.getElementById('result-progress');
        if (resultProgressEl) resultProgressEl.textContent = Math.floor(insidePercent) + '%';
        const resultPenaltiesEl = document.getElementById('result-penalties');
        if (resultPenaltiesEl) resultPenaltiesEl.textContent = Math.floor(wallPenaltyPercent + outsidePenaltyPercent + liftPenaltyPercent);
        const resultTimeEl = document.getElementById('result-time');
        if (resultTimeEl) resultTimeEl.textContent = elapsed.toFixed(1) + ' שניות';
        // דירוג
        let rating = '';
        if (finalScore >= 90) rating = '🏆 מצוין';
        else if (finalScore >= 75) rating = '⭐ טוב מאוד';
        else if (finalScore >= 60) rating = '👍 טוב';
        else if (finalScore >= 45) rating = '✓ בסדר';
        else rating = '💪 נסה שוב';
        const ratingEl = document.getElementById('result-rating');
        if (ratingEl) ratingEl.textContent = rating;
        this.exitFullscreen();
        this.switchScreen('results-screen');
    }

    retryTest() {
        // Reset with same path
        this.resetTest();
        this.showTestScreen(); // זה ייכנס שוב ל-fullscreen
    }

    newPathTest() {
        // Generate new path
        this.pathSeed = Date.now();
        this.resetTest();
        this.showTestScreen(); // זה ייכנס שוב ל-fullscreen
    }

    resetTest() {
        this.testActive = false;
        this.testStarted = false;
        this.currentProgress = 0;
        this.penalties = 0;
        this.isMouseDown = false;
        this.lastPosition = null;
        this.isTouchingWall = false;
        this.lastInsideIndex = 0;
        this.insideLength = 0;
        this.wallLength = 0;
        this.outsideLength = 0;
        this.liftCount = 0;
        this.totalPathLength = 0;
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        // Reset display
        document.getElementById('timer').textContent = '30.0';
        document.getElementById('progress').textContent = '0%';
        document.getElementById('penalties').textContent = '0';
        document.getElementById('current-score').textContent = '0';
        document.getElementById('start-prompt').style.display = 'block';
    }

    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const app = new EyeHandTest();
    app.init();
});