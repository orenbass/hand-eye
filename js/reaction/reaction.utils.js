// Reaction Test Utilities
// Pure helper functions extracted from legacy reaction.js
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
export function stddev(arr){ if(!arr.length) return 0; const m=mean(arr); return Math.sqrt(arr.reduce((s,v)=>(s+(v-m)*(v-m)),0)/arr.length)||0; }
