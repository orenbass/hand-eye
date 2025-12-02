// orientation.preload.js
let preloadStatus = {};
export function preloadQuestion(questions, idx){
  if(preloadStatus[idx]) return preloadStatus[idx].promise;
  const q = questions[idx];
  if(!q) return Promise.resolve();
  let topLoaded = false, viewLoaded = false;
  const p = new Promise(resolve => {
    const topImg = new Image();
    const viewImg = new Image();
    q._topImgEl = topImg;
    q._viewImgEl = viewImg;
    function updateProgress(){
      const progressEl = document.getElementById('orient-preload-progress');
      if(progressEl){
        const totalNeeded = 2;
        let done = (topLoaded?1:0) + (viewLoaded?1:0);
        progressEl.textContent = Math.round((done/totalNeeded)*100) + '%';
      }
      if(topLoaded && viewLoaded){ resolve(); }
    }
    topImg.onload = () => { topLoaded = true; updateProgress(); };
    topImg.onerror = () => { topLoaded = true; console.warn('[orientation] top preload failed', q.topImage); updateProgress(); };
    viewImg.onload = () => { viewLoaded = true; updateProgress(); };
    viewImg.onerror = () => { viewLoaded = true; console.warn('[orientation] view preload failed', q.questionImage); updateProgress(); };
    topImg.src = q.topImage;
    viewImg.src = q.questionImage;
  });
  preloadStatus[idx] = { promise: p };
  return p;
}
export function warmNext(questions, idx){
  const next = idx + 1;
  if(next < questions.length){
    preloadQuestion(questions, next).catch(()=>{});
  }
}
export function resetPreloadStatus(){ preloadStatus = {}; }
