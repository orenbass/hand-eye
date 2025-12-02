// tracking.utils.js
// Utility functions for Tracking test logic (movement & math)
export function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }
export function randomAngleVelocity(speed){ const a = Math.random()*Math.PI*2; return { vx: Math.cos(a)*speed, vy: Math.sin(a)*speed }; }
export function normalizeVelocity(obj, speed){ const cur = Math.sqrt(obj.vx*obj.vx + obj.vy*obj.vy); if(!cur) return; const factor = speed/cur; obj.vx*=factor; obj.vy*=factor; }
export function insideCircle(px,py,cx,cy,r){ const dx=px-cx, dy=py-cy; return (dx*dx+dy*dy) <= r*r; }
export function percent(part,total){ if(total<=0) return 0; return (part/total)*100; }
