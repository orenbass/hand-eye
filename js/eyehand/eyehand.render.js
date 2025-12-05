// eyehand.render.js
// Rendering & geometry helpers for Eye-Hand test (pure, stateless)

// Draw full path (wall + inner) onto visible ctx and maskCtx.
// path: [{x,y}, {type:'bezier', cp1:{x,y}, cp2:{x,y}, end:{x,y}}, ...]
export function drawFullPath({ctx, maskCtx, path, pathWidth, wallWidth}) {
  if(!ctx || !maskCtx || !path || !path.length) return { endPoint:null };
  const start = path[0];
  // Clear canvases
  ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
  maskCtx.clearRect(0,0,maskCtx.canvas.width, maskCtx.canvas.height);

  // Helper to stroke a path with provided context & style
  function strokePath(c, color, width){
    c.strokeStyle=color; c.lineWidth=width; c.lineCap='round'; c.lineJoin='round';
    c.beginPath(); c.moveTo(start.x, start.y);
    for(let i=1;i<path.length;i++){
      const seg=path[i];
      if(seg.type==='bezier') c.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.end.x, seg.end.y);
      else c.lineTo(seg.x, seg.y);
    }
    c.stroke();
  }
  // Outer wall (mask + visible)
  strokePath(maskCtx, '#757575', pathWidth + wallWidth*2);
  strokePath(ctx,     '#757575', pathWidth + wallWidth*2);
  // Inner path (mask white + visible white)
  strokePath(maskCtx, 'white', pathWidth);
  strokePath(ctx,     'white', pathWidth);

  // Start point (green)
  ctx.fillStyle='#4CAF50'; ctx.beginPath(); ctx.arc(start.x, start.y, 20, 0, Math.PI*2); ctx.fill();
  // End point (red)
  let endPath=path[path.length-1];
  let end=endPath.end || endPath; // safety
  ctx.fillStyle='#f44336'; ctx.beginPath(); ctx.arc(end.x, end.y, 20, 0, Math.PI*2); ctx.fill();

  return { endPoint:end };
}

// Flatten bezier segments into uniform samples for progress & length calculation
export function flattenPathSamples(path){
  const points=[]; if(!path || !path.length) return { points, totalLength:0 };
  const start=path[0]; let prev={x:start.x,y:start.y}; points.push({...prev});
  const SAMPLES_PER_SEGMENT=120;
  for(let i=1;i<path.length;i++){
    const seg=path[i];
    if(seg.type==='bezier'){
      for(let s=1;s<=SAMPLES_PER_SEGMENT;s++){
        const t=s/SAMPLES_PER_SEGMENT; const x=bezier(prev.x, seg.cp1.x, seg.cp2.x, seg.end.x, t); const y=bezier(prev.y, seg.cp1.y, seg.cp2.y, seg.end.y, t); points.push({x,y});
      }
      prev={x:seg.end.x,y:seg.end.y};
    } else {
      points.push({x: seg.x, y: seg.y});
      prev = {x: seg.x, y: seg.y};
    }
  }
  let total=0; for(let i=1;i<points.length;i++){ const a=points[i-1], b=points[i]; const dx=b.x-a.x, dy=b.y-a.y; total+=Math.sqrt(dx*dx+dy*dy); }
  return { points, totalLength:total };
}

function bezier(p0,p1,p2,p3,t){ const mt=1-t; return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3; }

// Draw a trail segment
export function drawTrailSegment(ctx, from, to, width){ if(!ctx||!from||!to) return; ctx.strokeStyle='#667eea'; ctx.lineWidth=width; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); }
