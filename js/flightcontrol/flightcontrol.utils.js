// flightcontrol.utils.js
export function fmtTime(sec){ const s=Math.floor(sec%60), m=Math.floor(sec/60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
export function maxRadius(canvas){ return Math.min(canvas.width, canvas.height)/2.6; }
export function noiseValue(t, difficulty){ const f = difficulty==='easy'?0.8: difficulty==='hard'?1.25:1.0; return { x:(Math.sin(t*1.7)+Math.sin(t*2.3+1))*24*f, y:(Math.cos(t*1.3)+Math.sin(t*2.7+2))*24*f }; }
