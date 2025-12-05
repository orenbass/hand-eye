import { registerSimpleTest } from './general.js';

registerSimpleTest({
  id: 'eyehand',
  secondsInputId: 'eyehandSeconds',
  difficultySelectId: 'eyehandDifficulty',
  minSeconds: 5,
  maxSeconds: 600
});

const STORAGE_KEY_FALLBACK = 'app.eyehand.customPath';
const UI_IDS = {
  canvas: 'eyehandPathCanvas',
  editBtn: 'eyehandPathEditMode',
  undoBtn: 'eyehandPathUndo',
  clearBtn: 'eyehandPathClear',
  saveBtn: 'eyehandPathSave',
  defaultBtn: 'eyehandPathDefault',
  status: 'eyehandPathStatus',
  instructions: 'eyehandPathInstructions'
};
const STATUS_COLORS = { info: '#94a3b8', success: '#10b981', warn: '#f97316', error: '#ef4444' };
const seenCanvases = new WeakSet();
let retryHandle = null;

function getStore(){
  return window.eyehandPathStore || null;
}

function fallbackRead(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY_FALLBACK);
    if(!raw) return null;
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)? parsed : null;
  }catch(err){
    console.warn('[eyehand-editor] failed to read fallback path', err);
    return null;
  }
}

function fallbackWrite(points){
  if(!Array.isArray(points) || points.length<2){
    localStorage.removeItem(STORAGE_KEY_FALLBACK);
    return;
  }
  try{
    localStorage.setItem(STORAGE_KEY_FALLBACK, JSON.stringify(points));
  }catch(err){
    console.warn('[eyehand-editor] failed to persist fallback path', err);
  }
}

function readLocalPath(){
  const store=getStore();
  if(store && typeof store.readLocal==='function') return store.readLocal();
  return fallbackRead();
}

function writeLocalPath(points){
  const store=getStore();
  if(store && typeof store.writeLocal==='function') return store.writeLocal(points);
  return fallbackWrite(points);
}

function deleteLocalPath(){
  const store=getStore();
  if(store && typeof store.writeLocal==='function') return store.writeLocal([]);
  localStorage.removeItem(STORAGE_KEY_FALLBACK);
}

function collectUiElements(){
  const canvas=document.getElementById(UI_IDS.canvas);
  if(!canvas) return null;
  const refs={
    canvas,
    editBtn: document.getElementById(UI_IDS.editBtn),
    undoBtn: document.getElementById(UI_IDS.undoBtn),
    clearBtn: document.getElementById(UI_IDS.clearBtn),
    saveBtn: document.getElementById(UI_IDS.saveBtn),
    defaultBtn: document.getElementById(UI_IDS.defaultBtn),
    statusEl: document.getElementById(UI_IDS.status),
    instructionsEl: document.getElementById(UI_IDS.instructions)
  };
  if(!refs.editBtn || !refs.clearBtn || !refs.saveBtn || !refs.defaultBtn || !refs.statusEl){
    return null;
  }
  return refs;
}

function clonePoints(list){
  return (list || []).map(pt=>({ x: pt.x, y: pt.y }));
}

function setupEyehandEditor(ui){
  if(seenCanvases.has(ui.canvas)) return;
  const store=getStore();
  const baseWidth = store?.canvasSize?.width || ui.canvas.width;
  const baseHeight = store?.canvasSize?.height || ui.canvas.height;
  const ctx = ui.canvas.getContext('2d');
  const saveLabel = ui.saveBtn.textContent;
  const defaultLabel = ui.defaultBtn.textContent;
  if(ui.instructionsEl){
    ui.instructionsEl.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">איך עובדים במצב עריכה?</div>
      <ul style="margin:0;padding-inline-start:18px;font-size:0.85rem;line-height:1.5;color:#92400e;">
        <li>לחיצה שמאלית על הקנבס מוסיפה נקודה חדשה.</li>
        <li>גרירת נקודה קיימת מאפשרת להזיז אותה.</li>
        <li>קליק ימני מוחק נקודה.</li>
        <li>הנקודה הירוקה היא ההתחלה והאדומה היא הסיום – התחילו משמאל וסיימו מימין.</li>
      </ul>
    `;
  }

  let points=[];
  let editMode=false;
  let dragIndex=-1;
  let isDragging=false;
  let hoverIndex=-1;
  let hoverSegment=-1;
  let hasUnsavedChanges=false;

  function setStatus(text, tone='info'){
    if(!ui.statusEl) return;
    ui.statusEl.textContent=text;
    ui.statusEl.style.color=STATUS_COLORS[tone] || STATUS_COLORS.info;
  }

  function getScale(){
    return {
      x: ui.canvas.width / baseWidth,
      y: ui.canvas.height / baseHeight
    };
  }

  function clampPoint(pt){
    return {
      x: Math.max(0, Math.min(baseWidth, Number(pt.x)||0)),
      y: Math.max(0, Math.min(baseHeight, Number(pt.y)||0))
    };
  }

  function toCanvasPoint(pt){
    const scale=getScale();
    return { x: pt.x * scale.x, y: pt.y * scale.y };
  }

  function fromCanvasPoint(pt){
    const scale=getScale();
    return clampPoint({ x: pt.x / scale.x, y: pt.y / scale.y });
  }

  function getPointerBaseCoords(e){
    const rect=ui.canvas.getBoundingClientRect();
    const ratioX=ui.canvas.width / rect.width;
    const ratioY=ui.canvas.height / rect.height;
    const canvasX=(e.clientX - rect.left) * ratioX;
    const canvasY=(e.clientY - rect.top) * ratioY;
    return fromCanvasPoint({ x: canvasX, y: canvasY });
  }

  function distancePointToSegment(p,a,b){
    const vx=b.x - a.x;
    const vy=b.y - a.y;
    const wx=p.x - a.x;
    const wy=p.y - a.y;
    const c1=vx*wx + vy*wy;
    if(c1<=0) return Math.hypot(p.x - a.x, p.y - a.y);
    const c2=vx*vx + vy*vy;
    if(c2<=c1) return Math.hypot(p.x - b.x, p.y - b.y);
    const t=c1/c2;
    const proj={ x: a.x + vx*t, y: a.y + vy*t };
    return Math.hypot(p.x - proj.x, p.y - proj.y);
  }

  function findPointIndex(pos, threshold=20){
    for(let i=0;i<points.length;i+=1){
      const pt=points[i];
      if(Math.hypot(pos.x - pt.x, pos.y - pt.y) <= threshold) return i;
    }
    return -1;
  }

  function closestSegment(pos, threshold=28){
    if(points.length<2) return -1;
    let idx=-1;
    let min=threshold;
    for(let i=0;i<points.length-1;i+=1){
      const dist=distancePointToSegment(pos, points[i], points[i+1]);
      if(dist<min){
        min=dist;
        idx=i;
      }
    }
    return idx;
  }

  function insertPoint(pos){
    if(points.length<2){
      points.push(clampPoint(pos));
      return;
    }
    const segIdx=closestSegment(pos);
    if(segIdx>=0){
      points.splice(segIdx+1,0,clampPoint(pos));
    }else{
      points.push(clampPoint(pos));
    }
  }

  function updateUndoButton(){
    const disabled=points.length===0;
    if(ui.undoBtn) ui.undoBtn.disabled=disabled;
    if(ui.clearBtn) ui.clearBtn.disabled=disabled;
  }

  function markDirty(){
    hasUnsavedChanges=true;
    setStatus(`⚠️ ${points.length} נקודות - לחץ "שמור מסלול" לשמירה`, 'warn');
  }

  function redrawCanvas(){
    ctx.fillStyle='#f8fafc';
    ctx.fillRect(0,0,ui.canvas.width, ui.canvas.height);
    ctx.strokeStyle='#e2e8f0';
    ctx.lineWidth=1;
    for(let x=0;x<ui.canvas.width;x+=50){
      ctx.beginPath();
      ctx.moveTo(x,0);
      ctx.lineTo(x,ui.canvas.height);
      ctx.stroke();
    }
    for(let y=0;y<ui.canvas.height;y+=50){
      ctx.beginPath();
      ctx.moveTo(0,y);
      ctx.lineTo(ui.canvas.width,y);
      ctx.stroke();
    }

    if(points.length>1){
      const scaledPoints=points.map(toCanvasPoint);
      ctx.strokeStyle='#64748b';
      ctx.lineWidth=28;
      ctx.lineCap='round';
      ctx.lineJoin='round';
      ctx.beginPath();
      ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
      for(let i=1;i<scaledPoints.length;i+=1){
        ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
      }
      ctx.stroke();

      ctx.strokeStyle='#ffffff';
      ctx.lineWidth=20;
      ctx.beginPath();
      ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
      for(let i=1;i<scaledPoints.length;i+=1){
        ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
      }
      ctx.stroke();

      if(editMode && hoverSegment>=0 && scaledPoints[hoverSegment+1]){
        ctx.save();
        ctx.strokeStyle='#f97316';
        ctx.lineWidth=6;
        ctx.setLineDash([12,10]);
        ctx.beginPath();
        ctx.moveTo(scaledPoints[hoverSegment].x, scaledPoints[hoverSegment].y);
        ctx.lineTo(scaledPoints[hoverSegment+1].x, scaledPoints[hoverSegment+1].y);
        ctx.stroke();
        ctx.restore();
      }
    }else if(points.length===0){
      ctx.fillStyle='#94a3b8';
      ctx.font='16px sans-serif';
      ctx.textAlign='center';
      ctx.fillText(editMode? 'לחץ להוספת נקודה ראשונה' : 'לחץ על "מצב עריכה" כדי להתחיל', ui.canvas.width/2, ui.canvas.height/2);
    }

    points.forEach((pt, idx)=>{
      const draw=toCanvasPoint(pt);
      const isFirst=idx===0;
      const isLast=idx===points.length-1;
      ctx.beginPath();
      ctx.arc(draw.x, draw.y, isFirst || isLast ? 16 : 10, 0, Math.PI*2);
      if(isFirst) ctx.fillStyle='#22c55e';
      else if(isLast) ctx.fillStyle='#ef4444';
      else ctx.fillStyle='#3b82f6';
      ctx.fill();
      ctx.strokeStyle='#ffffff';
      ctx.lineWidth=3;
      ctx.stroke();
      if(editMode){
        ctx.fillStyle='#ffffff';
        ctx.font='bold 11px sans-serif';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.fillText(String(idx+1), draw.x, draw.y);
      }
    });
  }

  function setEditMode(active){
    editMode=!!active;
    ui.editBtn.textContent = editMode? '✅ סיים עריכה' : '✏️ מצב עריכה';
    ui.editBtn.classList.toggle('btn-primary', !editMode);
    ui.editBtn.classList.toggle('btn-secondary', editMode);
    ui.editBtn.style.background = editMode? '#22c55e' : '';
    ui.canvas.style.cursor = editMode? 'crosshair' : 'not-allowed';
    if(ui.instructionsEl) ui.instructionsEl.style.display = editMode? 'block' : 'none';
    hoverIndex=-1;
    hoverSegment=-1;
    redrawCanvas();
  }

  async function loadSavedPath(options={}){
    const preferRemote=options.preferRemote;
    const store=getStore();
    if(preferRemote && window.supabaseClient && store && typeof store.fetchRemote==='function'){
      setStatus('טוען מסלול מ-Supabase...', 'info');
      const remote=await store.fetchRemote({ silent:false }).catch(err=>{ console.warn('[eyehand-editor] remote load failed', err); return null; });
      if(remote && remote.length){
        points=clonePoints(remote);
        hasUnsavedChanges=false;
        updateUndoButton();
        redrawCanvas();
        setStatus(`✅ נטען מסלול מ-Supabase (${points.length} נקודות)`, 'success');
        return;
      }
    }

    const local=readLocalPath();
    if(local && local.length){
      points=clonePoints(local);
      hasUnsavedChanges=false;
      updateUndoButton();
      redrawCanvas();
      setStatus(`✅ נטען מסלול מקומי (${points.length} נקודות)`, 'success');
    }else{
      points=[];
      hasUnsavedChanges=false;
      updateUndoButton();
      redrawCanvas();
      setStatus('לא נשמר מסלול מותאם אישית - יוצג מסלול ברירת מחדל', 'info');
    }
  }

  ui.editBtn.addEventListener('click', ()=> setEditMode(!editMode));

  ui.canvas.addEventListener('mousedown', e=>{
    if(!editMode || e.button!==0) return;
    const pos=getPointerBaseCoords(e);
    const idx=findPointIndex(pos);
    if(idx>=0){
      dragIndex=idx;
      isDragging=true;
      ui.canvas.style.cursor='grabbing';
    }
  });

  ui.canvas.addEventListener('mousemove', e=>{
    if(!editMode) return;
    const pos=getPointerBaseCoords(e);
    if(isDragging && dragIndex>=0){
      points[dragIndex]=clampPoint(pos);
      markDirty();
      redrawCanvas();
      return;
    }
    hoverIndex=findPointIndex(pos);
    if(hoverIndex>=0){
      ui.canvas.style.cursor='grab';
      hoverSegment=-1;
    }else{
      hoverSegment=closestSegment(pos);
      ui.canvas.style.cursor = hoverSegment>=0 ? 'copy' : 'crosshair';
    }
    redrawCanvas();
  });

  ui.canvas.addEventListener('mouseleave', ()=>{
    if(!editMode) return;
    hoverIndex=-1;
    hoverSegment=-1;
    if(!isDragging) ui.canvas.style.cursor='crosshair';
    redrawCanvas();
  });

  ui.canvas.addEventListener('mouseup', e=>{
    if(!editMode || e.button!==0) return;
    const pos=getPointerBaseCoords(e);
    if(isDragging && dragIndex>=0){
      points[dragIndex]=clampPoint(pos);
      dragIndex=-1;
      isDragging=false;
      ui.canvas.style.cursor='crosshair';
      markDirty();
      redrawCanvas();
      return;
    }
    const idx=findPointIndex(pos);
    if(idx<0){
      insertPoint(pos);
      updateUndoButton();
      markDirty();
      redrawCanvas();
    }
  });

  ui.canvas.addEventListener('contextmenu', e=>{
    e.preventDefault();
    if(!editMode) return;
    const pos=getPointerBaseCoords(e);
    const idx=findPointIndex(pos);
    if(idx>=0){
      points.splice(idx,1);
      updateUndoButton();
      markDirty();
      redrawCanvas();
    }
  });

  if(ui.undoBtn){
    ui.undoBtn.addEventListener('click', ()=>{
      if(!points.length) return;
      points.pop();
      updateUndoButton();
      markDirty();
      redrawCanvas();
    });
  }

  ui.clearBtn.addEventListener('click', ()=>{
    if(points.length>0 && !confirm('למחוק את כל הנקודות במסלול הנוכחי?')) return;
    points=[];
    updateUndoButton();
    markDirty();
    redrawCanvas();
  });

  ui.saveBtn.addEventListener('click', async ()=>{
    if(points.length<2){
      alert('יש להוסיף לפחות שתי נקודות ליצירת מסלול.');
      return;
    }
    ui.saveBtn.disabled=true;
    ui.saveBtn.textContent='⏳ שומר...';
    try{
      if(window.supabaseClient && store && typeof store.saveRemote==='function'){
        await store.saveRemote(points);
        setStatus(`✅ המסלול נשמר ב-Supabase (${points.length} נקודות)`, 'success');
      }else{
        writeLocalPath(points);
        setStatus(`⚠️ המסלול נשמר מקומית בלבד (${points.length} נקודות)`, 'warn');
      }
      hasUnsavedChanges=false;
      setEditMode(false);
      if(store && typeof store.requestHydration==='function') store.requestHydration();
      alert('✅ המסלול נשמר! הוא יוחל במבחן הבא.');
    }catch(err){
      console.error('[eyehand-editor] save failed', err);
      setStatus('❌ שגיאה בשמירה - נסה שוב', 'error');
      alert('❌ שגיאה בשמירה: '+(err && err.message? err.message : err));
    }finally{
      ui.saveBtn.disabled=false;
      ui.saveBtn.textContent=saveLabel;
    }
  });

  ui.defaultBtn.addEventListener('click', async ()=>{
    if(!confirm('להחזיר למסלול ברירת המחדל? המסלול המותאם יימחק.')) return;
    ui.defaultBtn.disabled=true;
    ui.defaultBtn.textContent='⏳ מאפס...';
    try{
      if(window.supabaseClient && store && typeof store.deleteRemote==='function'){
        await store.deleteRemote();
        setStatus('✅ המסלול המותאם הוסר מהשרת - יופעל מסלול ברירת מחדל', 'success');
      }else{
        deleteLocalPath();
        setStatus('המסלול המקומי נמחק - תופעל ברירת מחדל', 'info');
      }
      points=[];
      hasUnsavedChanges=false;
      updateUndoButton();
      setEditMode(false);
      redrawCanvas();
      if(store && typeof store.requestHydration==='function') store.requestHydration();
    }catch(err){
      console.error('[eyehand-editor] reset failed', err);
      setStatus('❌ לא ניתן למחוק את המסלול כרגע', 'error');
      alert('❌ שגיאה במחיקה: '+(err && err.message? err.message : err));
    }finally{
      ui.defaultBtn.disabled=false;
      ui.defaultBtn.textContent=defaultLabel;
    }
  });

  loadSavedPath({ preferRemote:true }).then(()=>{
    updateUndoButton();
    redrawCanvas();
    if(points.length===0){
      setEditMode(true);
    }else{
      setEditMode(false);
    }
  }).catch(err=>{
    console.warn('[eyehand-editor] initial load failed', err);
    setStatus('❌ שגיאה בטעינה - נסה לרענן', 'error');
    setEditMode(true);
  });

  seenCanvases.add(ui.canvas);
}

function ensureEditorInitialized(){
  const ui=collectUiElements();
  if(ui){
    setupEyehandEditor(ui);
    return true;
  }
  return false;
}

function scheduleRetry(delay=400){
  clearTimeout(retryHandle);
  retryHandle=setTimeout(()=>{
    ensureEditorInitialized();
  }, delay);
}

function startWatching(){
  if(!document.body) return;
  const observer=new MutationObserver(()=>{
    ensureEditorInitialized();
  });
  observer.observe(document.body, { childList:true, subtree:true });
  ensureEditorInitialized();
  document.addEventListener('click', evt=>{
    const target=evt.target;
    if(!target) return;
    if(target.closest && (target.closest('#admin-button') || target.closest('.admin-tab-btn[data-admin-tab="eyehand"]'))){
      scheduleRetry(250);
    }
  });
}

if(typeof window!=='undefined'){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', startWatching, { once:true });
  }else{
    startWatching();
  }
}
