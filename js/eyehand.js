// Eye-Hand Coordination Test Module - cleaned & formatted
class EyeHandTest {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.path = [];
    this.pathWidth = 20;
    this.wallWidth = 5;
    this.testDuration = 30000;
    this.testActive = false;
    this.testStarted = false;
    this.startTime = 0;
    this.currentProgress = 0;
    this.penalties = 0;
    this.isMouseDown = false;
    this.lastPosition = null;
    this.timerInterval = null;
    this.pathSeed = Date.now();
    this.lastPenaltyTime = 0;
    this.penaltyThreshold = 150;
    this.wasOutsidePath = false;
    this.isTouchingWall = false;
    this.trailWidth = 3;
    this.maskCanvas = null;
    this.maskCtx = null;
    this.samplePoints = [];
    this.lastInsideIndex = 0;
    this.maxIndexJump = 30;
    this.lastOutsidePenaltyTime = 0;
    this.outsidePenaltyCooldown = 300;
    this.mouseUpPenaltyGiven = false;
    this.finishTolerance = 0.995;
    this.totalPathLength = 0;
    this.insideLength = 0;
    this.wallLength = 0;
    this.outsideLength = 0;
    this.liftCount = 0;
    this.wallFactor = 1.5;
    this.outsideFactor = 3;
    this.liftFactor = 2;
    this.endPoint = null;
  }

  init() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    const startButton = document.getElementById('start-button');
    const retryButton = document.getElementById('retry-button');
    const newPathButton = document.getElementById('new-path-button');
    if (startButton) startButton.addEventListener('click', () => this.showTestScreen());
    if (retryButton) retryButton.addEventListener('click', () => this.retryTest());
    if (newPathButton) newPathButton.addEventListener('click', () => this.newPathTest());
  }

  showTestScreen() {
    this.switchScreen('test-screen');
    if (window.enterFullscreenMode) window.enterFullscreenMode();
    this.enterFullscreen();
    if (window.testAuth && !window.testAuth.isAdmin()) {
      const header = document.querySelector('#test-screen .test-header');
      if (header) header.style.display = 'none';
    }
    setTimeout(() => {
      this.setupCanvas();
      this.generatePath();
      this.drawPath();
      this.setupCanvasListeners();
      this.startTest(); // auto start
      const sp = document.getElementById('start-prompt');
      if (sp) sp.style.display = 'none';
    }, 100);
    window.addEventListener('resize', () => {
      if (this.testActive || !this.canvas) return;
      const size = Math.floor(window.innerHeight * 0.8);
      this.canvas.width = size;
      this.canvas.height = size;
      this.canvas.style.width = size + 'px';
      this.canvas.style.height = size + 'px';
    });
  }

  enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.log('Fullscreen request failed:', err));
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
  }

  exitFullscreen() {
    if (window.exitFullscreenMode) window.exitFullscreenMode();
    if (document.exitFullscreen) document.exitFullscreen().catch(err => console.log('Exit fullscreen failed:', err));
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }

  setupCanvas() {
    this.canvas = document.getElementById('test-canvas');
    this.ctx = this.canvas.getContext('2d');
    const size = Math.floor(window.innerHeight * 0.8);
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx.imageSmoothingEnabled = true;
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
    const segments = 8;
    const segmentLength = (width - 2 * margin) / segments;
    let x = margin;
    let y = height / 2;
    this.path.push({ x, y });
    const random = this.seededRandom(this.pathSeed);
    for (let i = 0; i < segments; i++) {
      const amplitude = 150 + random() * 100;
      const direction = i % 2 === 0 ? 1 : -1;
      const cp1 = { x: x + segmentLength * 0.35, y: y + direction * amplitude * (0.6 + random() * 0.4) };
      const cp2 = { x: x + segmentLength * 0.65, y: y + direction * amplitude * (0.4 + random() * 0.5) };
      x += segmentLength;
      y = height / 2 + (random() - 0.5) * 250;
      y = Math.max(margin, Math.min(height - margin, y));
      this.path.push({ type: 'bezier', cp1, cp2, end: { x, y } });
    }
    this.flattenPath();
  }

  seededRandom(seed) {
    let value = seed;
    return function () {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  drawPath() {
    const ctx = this.ctx;
    const mctx = this.maskCtx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    mctx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    // outer (wall) stroke
    mctx.strokeStyle = '#757575';
    mctx.lineWidth = this.pathWidth + this.wallWidth * 2;
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
    // visible outer
    ctx.strokeStyle = '#757575';
    ctx.lineWidth = this.pathWidth + this.wallWidth * 2;
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
    // inner white area
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
    // start point
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 20, 0, Math.PI * 2);
    ctx.fill();
    // end point
    const end = this.path[this.path.length - 1].end;
    ctx.fillStyle = '#f44336';
    ctx.beginPath();
    ctx.arc(end.x, end.y, 20, 0, Math.PI * 2);
    ctx.fill();
    this.endPoint = end;
    if (!this.samplePoints.length) this.flattenPath();
  }

  flattenPath() {
    this.samplePoints = [];
    if (!this.path.length) return;
    const start = this.path[0];
    let prev = { x: start.x, y: start.y };
    this.samplePoints.push({ x: prev.x, y: prev.y });
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
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }

  isInsidePathPixel(x, y) {
    if (!this.maskCtx) return false;
    if (x < 0 || x >= this.maskCanvas.width || y < 0 || y >= this.maskCanvas.height) return false;
    const pixel = this.maskCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return pixel[0] >= 245 && pixel[1] >= 245 && pixel[2] >= 245;
  }

  getNearestPathIndex(pos) {
    if (!this.isInsidePathPixel(pos.x, pos.y)) return null;
    const searchRadius = 400;
    let bestIdx = null;
    let bestDist = Infinity;
    const startIdx = Math.max(0, this.lastInsideIndex - 50);
    const endIdx = Math.min(this.samplePoints.length - 1, this.lastInsideIndex + 800);
    for (let i = startIdx; i <= endIdx; i++) {
      const pt = this.samplePoints[i];
      const dx = pt.x - pos.x;
      const dy = pt.y - pos.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestDist > searchRadius * searchRadius) return null;
    return bestIdx;
  }

  updateProgressAccurate(pos) {
    const idx = this.getNearestPathIndex(pos);
    if (idx === null) return;
    if (idx > this.lastInsideIndex + this.maxIndexJump) {
      this.addPenalty(3, 'קפיצה קדימה לא חוקית');
      return;
    }
    if (idx > this.lastInsideIndex) {
      this.lastInsideIndex = idx;
      const percent = (this.lastInsideIndex / (this.samplePoints.length - 1)) * 100;
      this.currentProgress = Math.min(100, percent);
      this.updateStats();
    }
  }

  setupCanvasListeners() {
    this.canvas.addEventListener('mousedown', e => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', e => this.handleMouseUp(e));
    this.canvas.addEventListener('mousemove', e => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
  }

  handleMouseDown(e) {
    const pos = this.getMousePos(e);
    if (!this.testStarted) {
      const start = this.path[0];
      const dist = Math.sqrt((pos.x - start.x) ** 2 + (pos.y - start.y) ** 2);
      if (dist <= 20) {
        this.startTest();
        this.isMouseDown = true;
        this.lastPosition = pos;
        const sp = document.getElementById('start-prompt');
        if (sp) sp.style.display = 'none';
      }
    } else if (this.testActive) {
      this.isMouseDown = true;
      this.lastPosition = pos;
    }
    this.mouseUpPenaltyGiven = false;
  }

  handleMouseUp() {
    if (this.testActive && this.currentProgress < 100) {
      this.liftCount++;
      this.updateStats();
    }
    this.isMouseDown = false;
    this.lastPosition = null;
    this.isTouchingWall = false;
  }

  handleMouseLeave() {
    if (this.testActive && this.isMouseDown) {
      this.addPenalty(2, 'יציאה מהקנבס');
    }
    this.isMouseDown = false;
    this.isTouchingWall = false;
  }

  handleMouseMove(e) {
    if (!this.testActive || !this.isMouseDown) return;
    const pos = this.getMousePos(e);
    // finish detection
    if (this.endPoint) {
      const distEnd = Math.hypot(pos.x - this.endPoint.x, pos.y - this.endPoint.y);
      if (distEnd <= 20) {
        this.currentProgress = 100;
        this.updateStats();
        this.endTest();
        return;
      }
    }
    if (!this.lastPosition) {
      this.lastPosition = pos;
      return;
    }
    const from = this.lastPosition;
    const to = pos;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    if (segmentLength === 0) return;
    const SUB_SAMPLES = 20;
    let prevPoint = from;
    for (let i = 1; i <= SUB_SAMPLES; i++) {
      const t = i / SUB_SAMPLES;
      const cx = from.x + dx * t;
      const cy = from.y + dy * t;
      const cls = this.classifyPixel(cx, cy);
      const ddx = cx - prevPoint.x;
      const ddy = cy - prevPoint.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d > 0.0001) {
        if (cls === 'inside') this.insideLength += d;
        else if (cls === 'wall') this.wallLength += d;
        else if (cls === 'outside') this.outsideLength += d;
      }
      prevPoint = { x: cx, y: cy };
    }
    const insidePercent = (this.insideLength / this.totalPathLength) * 100;
    this.currentProgress = Math.min(100, insidePercent);
    if (this.currentProgress >= 99.5) {
      this.currentProgress = 100;
      this.updateStats();
      this.endTest();
    } else {
      this.updateStats();
    }
    this.drawTrail(this.lastPosition, pos);
    this.lastPosition = pos;
  }

  classifyPixel(x, y) {
    if (this.isInsidePathPixel(x, y)) return 'inside';
    if (this.isWallPixel(x, y)) return 'wall';
    return 'outside';
  }

  isWallPixel(x, y) {
    if (!this.maskCtx) return false;
    if (x < 0 || x >= this.maskCanvas.width || y < 0 || y >= this.maskCanvas.height) return false;
    const pixel = this.maskCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return pixel[0] >= 110 && pixel[0] <= 125 && pixel[1] >= 110 && pixel[1] <= 125 && pixel[2] >= 110 && pixel[2] <= 125;
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
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
    // deprecated placeholder
    console.log('(deprecated addPenalty) ' + points + ': ' + reason);
  }

  startTest() {
    const cfg = window.getTestConfig ? window.getTestConfig('eyehand') : null;
    if (cfg) this.testDuration = (cfg.seconds || 30) * 1000;
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
      const tVal = (remaining / 1000).toFixed(1);
      const timerEl = document.getElementById('timer');
      if (timerEl) timerEl.textContent = tVal;
      const ext = document.getElementById('eyehand-external-timer');
      if (ext) ext.firstChild.nodeValue = tVal;
      if (remaining <= 0) this.endTest();
    }, 100);
  }

  endTest() {
    if (!this.testActive) return;
    this.testActive = false;
    clearInterval(this.timerInterval);
    this.showResults();
  }

  updateStats() {
    const insidePercent = (this.insideLength / this.totalPathLength) * 100;
    const wallPercent = (this.wallLength / this.totalPathLength) * 100;
    const outsidePercent = (this.outsideLength / this.totalPathLength) * 100;
    const wallPenaltyPercent = wallPercent * this.wallFactor;
    const outsidePenaltyPercent = outsidePercent * this.outsideFactor;
    const liftPenaltyPercent = this.liftCount * this.liftFactor;
    const rawScore = insidePercent - wallPenaltyPercent - outsidePenaltyPercent - liftPenaltyPercent;
    const finalScore = Math.max(0, Math.min(100, rawScore));
    const g = window.getGlobalScale ? window.getGlobalScale() : { min: 1, max: 7 };
    const scaled = g.min + (finalScore / 100) * (g.max - g.min);
    this.currentProgress = Math.min(100, insidePercent);
    this.penalties = Math.max(0, Math.floor(wallPenaltyPercent + outsidePenaltyPercent + liftPenaltyPercent));
    const progressEl = document.getElementById('progress');
    if (progressEl) progressEl.textContent = Math.floor(this.currentProgress) + '%';
    const penaltiesEl = document.getElementById('penalties');
    if (penaltiesEl) penaltiesEl.textContent = this.penalties;
    const scoreEl = document.getElementById('current-score');
    if (scoreEl && !(window.testAuth && !window.testAuth.isAdmin())) scoreEl.textContent = scaled.toFixed(2);
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
    const g = window.getGlobalScale ? window.getGlobalScale() : { min: 1, max: 7 };
    const scaled = g.min + (finalScore / 100) * (g.max - g.min);
    const elapsed = (Date.now() - this.startTime) / 1000;
    if (window.testAuth) {
      window.testAuth.markTestCompleted('eyehand');
      window.testAuth.showTestCompleteModal('eyehand', scaled.toFixed(2));
    }
    if (window.testAuth && !window.testAuth.isAdmin()) {
      const fs = document.querySelector('#results-screen .final-score-box');
      if (fs) fs.style.display = 'none';
      const rd = document.querySelector('#results-screen .results-details');
      if (rd) rd.style.display = 'none';
    } else {
      const finalScoreEl = document.getElementById('final-score');
      if (finalScoreEl) finalScoreEl.textContent = scaled.toFixed(2);
      const resultProgressEl = document.getElementById('result-progress');
      if (resultProgressEl) resultProgressEl.textContent = Math.floor(insidePercent) + '%';
      const resultPenaltiesEl = document.getElementById('result-penalties');
      if (resultPenaltiesEl) resultPenaltiesEl.textContent = Math.floor(wallPenaltyPercent + outsidePenaltyPercent + liftPenaltyPercent);
      const resultTimeEl = document.getElementById('result-time');
      if (resultTimeEl) resultTimeEl.textContent = elapsed.toFixed(1) + ' שניות';
      let rating = '';
      if (finalScore >= 90) rating = '🏆 מצוין';
      else if (finalScore >= 75) rating = '⭐ טוב מאוד';
      else if (finalScore >= 60) rating = '👍 טוב';
      else if (finalScore >= 45) rating = '✓ בסדר';
      else rating = '💪 נסה שוב';
      const ratingEl = document.getElementById('result-rating');
      if (ratingEl) ratingEl.textContent = rating;
    }
    this.exitFullscreen();
    this.switchScreen('results-screen');
  }

  retryTest() {
    this.resetTest();
    this.showTestScreen();
  }

  newPathTest() {
    this.pathSeed = Date.now();
    this.resetTest();
    this.showTestScreen();
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
    if (this.timerInterval) clearInterval(this.timerInterval);
    const timerEl = document.getElementById('timer'); if (timerEl) timerEl.textContent = '30.0';
    const progressEl = document.getElementById('progress'); if (progressEl) progressEl.textContent = '0%';
    const penaltiesEl = document.getElementById('penalties'); if (penaltiesEl) penaltiesEl.textContent = '0';
    const scoreEl = document.getElementById('current-score'); if (scoreEl) scoreEl.textContent = '0';
    const sp = document.getElementById('start-prompt'); if (sp) sp.style.display = 'block';
  }

  switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  window.eyeHandTest = new EyeHandTest();
  window.eyeHandTest.init();
});