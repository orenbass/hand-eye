// northfind.utils.js

// יצירת מפת שכונה צפופה (מידטאון) ממבט עילי
export function generateRandomMap(width=800, height=800, seed=0, elementCount=12){
  const c = document.createElement('canvas'); 
  c.width = width; 
  c.height = height; 
  const g = c.getContext('2d');
  
  // פונקציית random עם seed
  let s = seed >>> 0; 
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  
  // רקע - דשא ירוק
  g.fillStyle = '#7CB342';
  g.fillRect(0, 0, width, height);
  
  // טקסטורת דשא עדינה
  for(let i = 0; i < 300; i++){
    const gx = rnd() * width;
    const gy = rnd() * height;
    g.fillStyle = `rgba(0,100,0,${0.02 + rnd() * 0.03})`;
    g.beginPath();
    g.arc(gx, gy, 2 + rnd() * 4, 0, Math.PI * 2);
    g.fill();
  }
  
  // הגדרות כבישים
  const margin = 50;
  const roadWidth = 30;
  
  // כבישים אנכיים (2-3)
  const vCount = 2 + Math.floor(rnd() * 2);
  const vRoads = [];
  for(let i = 0; i < vCount; i++){
    const pos = margin + ((i + 0.5) / vCount) * (width - 2 * margin) + (rnd() - 0.5) * 60;
    vRoads.push(pos);
  }
  
  // כבישים אופקיים (2-3)
  const hCount = 2 + Math.floor(rnd() * 2);
  const hRoads = [];
  for(let i = 0; i < hCount; i++){
    const pos = margin + ((i + 0.5) / hCount) * (height - 2 * margin) + (rnd() - 0.5) * 60;
    hRoads.push(pos);
  }
  
  // ציור כבישים
  g.lineCap = 'butt';
  const roadColor = '#505050';
  const sidewalkColor = '#888888';
  
  // מדרכות
  g.strokeStyle = sidewalkColor;
  g.lineWidth = roadWidth + 8;
  vRoads.forEach(x => {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, height);
    g.stroke();
  });
  hRoads.forEach(y => {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();
  });
  
  // כבישים
  g.strokeStyle = roadColor;
  g.lineWidth = roadWidth;
  vRoads.forEach(x => {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, height);
    g.stroke();
  });
  hRoads.forEach(y => {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();
  });
  
  // קווי הפרדה צהובים
  g.setLineDash([12, 8]);
  g.strokeStyle = '#E8D44D';
  g.lineWidth = 2;
  vRoads.forEach(x => {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, height);
    g.stroke();
  });
  hRoads.forEach(y => {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();
  });
  g.setLineDash([]);
  
  // פונקציה לבדיקה אם מיקום על כביש
  const isOnRoad = (x, y) => {
    const buffer = roadWidth / 2 + 8;
    return vRoads.some(rx => Math.abs(rx - x) < buffer) || 
           hRoads.some(ry => Math.abs(ry - y) < buffer);
  };
  
  // צבעי גגות
  const roofColors = ['#8B4513', '#A0522D', '#CD853F', '#D2691E', '#B8860B', '#6B4423', '#8B0000', '#A52A2A', '#654321', '#5D4E37'];
  
  // יצירת בתים - מלאים את כל השכונה
  // כמות הבתים מושפעת מרמת הקושי
  const baseHouseCount = 25;
  const houseCount = baseHouseCount + elementCount * 3; // יותר אלמנטים = יותר בתים
  const houses = [];
  
  // גריד מסודר למיקום בתים
  const gridCols = Math.ceil(Math.sqrt(houseCount * 1.5));
  const gridRows = Math.ceil(houseCount / gridCols);
  const cellW = (width - 2 * margin) / gridCols;
  const cellH = (height - 2 * margin) / gridRows;
  
  for(let row = 0; row < gridRows; row++){
    for(let col = 0; col < gridCols; col++){
      // מרכז התא עם תזוזה קטנה
      const hx = margin + col * cellW + cellW / 2 + (rnd() - 0.5) * cellW * 0.5;
      const hy = margin + row * cellH + cellH / 2 + (rnd() - 0.5) * cellH * 0.5;
      
      // לא על כביש
      if(isOnRoad(hx, hy)) continue;
      
      // גודל בית
      const houseW = 22 + rnd() * 18;
      const houseH = 20 + rnd() * 15;
      
      houses.push({
        x: hx,
        y: hy,
        w: houseW,
        h: houseH,
        rotation: Math.floor(rnd() * 4) * Math.PI / 2,
        roofColor: roofColors[Math.floor(rnd() * roofColors.length)]
      });
    }
  }
  
  // ציור בתים - גגות ממבט עילי
  houses.forEach(h => {
    g.save();
    g.translate(h.x, h.y);
    g.rotate(h.rotation);
    
    const w = h.w;
    const hh = h.h;
    
    // גג ראשי
    g.fillStyle = h.roofColor;
    g.fillRect(-w/2, -hh/2, w, hh);
    
    // קווי גג - פס אמצעי
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-w/2, 0);
    g.lineTo(w/2, 0);
    g.stroke();
    
    // קווים אלכסוניים
    g.beginPath();
    g.moveTo(-w/2, -hh/2);
    g.lineTo(0, 0);
    g.lineTo(-w/2, hh/2);
    g.moveTo(w/2, -hh/2);
    g.lineTo(0, 0);
    g.lineTo(w/2, hh/2);
    g.stroke();
    
    // מסגרת
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1.5;
    g.strokeRect(-w/2, -hh/2, w, hh);
    
    // ארובה (לפעמים)
    if(rnd() < 0.4){
      g.fillStyle = '#444';
      g.fillRect(w * 0.2, -hh * 0.35, 5, 4);
    }
    
    g.restore();
  });
  
  // עצים קטנים בין הבתים
  const treeCount = 15 + Math.floor(elementCount / 2);
  const treeColors = ['#228B22', '#2E8B57', '#3CB371', '#006400'];
  
  for(let i = 0; i < treeCount; i++){
    let attempts = 0;
    while(attempts < 10){
      const tx = margin/2 + rnd() * (width - margin);
      const ty = margin/2 + rnd() * (height - margin);
      
      // לא על כביש
      if(isOnRoad(tx, ty)){
        attempts++;
        continue;
      }
      
      // לא בתוך בית
      const inHouse = houses.some(h => {
        const dx = Math.abs(h.x - tx);
        const dy = Math.abs(h.y - ty);
        return dx < h.w * 0.6 && dy < h.h * 0.6;
      });
      
      if(!inHouse){
        const treeSize = 4 + rnd() * 5;
        g.fillStyle = treeColors[Math.floor(rnd() * treeColors.length)];
        g.beginPath();
        g.arc(tx, ty, treeSize, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.15)';
        g.lineWidth = 1;
        g.stroke();
        break;
      }
      attempts++;
    }
  }
  
  // ויניט קל בקצוות
  const vg = g.createRadialGradient(width/2, height/2, width * 0.35, width/2, height/2, width * 0.55);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = vg;
  g.fillRect(0, 0, width, height);
  
  return c.toDataURL('image/png');
}

export function generateRandomMaps(count = 5, elementCount = 12){ 
  const arr = []; 
  for(let i = 0; i < count; i++){
    arr.push(generateRandomMap(800, 800, i * 777 + Date.now() % 1000, elementCount)); 
  }
  return arr; 
}

export function loadMapImage(mapImages, index){ 
  return new Promise((res, rej) => { 
    if(!mapImages[index]) return rej('no map'); 
    const img = new Image(); 
    img.onload = () => res(img); 
    img.onerror = () => rej('img load fail'); 
    img.src = mapImages[index]; 
  }); 
}
