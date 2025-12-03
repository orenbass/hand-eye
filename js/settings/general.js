const simpleTests = [];

export function registerSimpleTest(config){
  if(!config || !config.id) return;
  simpleTests.push(Object.assign({ minSeconds:5, maxSeconds:600 }, config));
}

export function initGeneralSection({ settings, buildTestSelectorUI }){
  if(!settings) return;

  function bindSimpleTests(){
    simpleTests.forEach(cfg=>{
      const test=settings.tests.find(t=>t.id===cfg.id);
      if(!test) return;
      if(cfg.secondsInputId){
        const secondsEl=document.getElementById(cfg.secondsInputId);
        if(secondsEl){
          secondsEl.value=test.seconds;
          secondsEl.oninput=()=>{
            let val=parseInt(secondsEl.value,10);
            if(!Number.isFinite(val)) val=test.seconds||cfg.minSeconds;
            val=Math.min(cfg.maxSeconds, Math.max(cfg.minSeconds, val));
            test.seconds=val;
            secondsEl.value=val;
          };
        }
      }
      if(cfg.difficultySelectId){
        const diffEl=document.getElementById(cfg.difficultySelectId);
        if(diffEl){
          diffEl.value=test.difficulty;
          diffEl.onchange=()=>{ test.difficulty=diffEl.value; };
        }
      }
    });
  }

  function rebuildTestsConfig(){
    const tbody=document.getElementById('testsOrderConfig');
    if(!tbody) return;
    tbody.innerHTML='';
    settings.tests.forEach((t,i)=>{
      const row=document.createElement('tr');
      row.className='test-row';
      row.draggable=true;
      row.dataset.index=i;
      row.innerHTML=`
        <td><span class="drag-handle" title="גרור לסידור">↕</span> ${t.name}</td>
        <td style="text-align:center"><input type="checkbox" data-i="${i}" class="t-include" ${t.include? 'checked':''}></td>
        <td style="text-align:center"><span class="pill-small">${t.id}</span></td>
      `;
      tbody.appendChild(row);
    });

    document.querySelectorAll('.t-include').forEach(el=>{
      el.onchange=()=>{
        const i=Number(el.dataset.i);
        if(Number.isNaN(i)) return;
        settings.tests[i].include=el.checked;
        buildTestSelectorUI();
      };
    });

    let dragIndex=null;
    tbody.querySelectorAll('.test-row').forEach(row=>{
      row.addEventListener('dragstart',e=>{
        dragIndex=Number(row.dataset.index);
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
      });
      row.addEventListener('dragend',()=>{
        row.classList.remove('dragging');
        dragIndex=null;
        tbody.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
      });
      row.addEventListener('dragover',e=>{
        e.preventDefault();
        if(Number(row.dataset.index)!==dragIndex){
          row.classList.add('drop-target');
        }
      });
      row.addEventListener('dragleave',()=> row.classList.remove('drop-target'));
      row.addEventListener('drop',e=>{
        e.preventDefault();
        const targetIndex=Number(row.dataset.index);
        if(dragIndex===null || dragIndex===targetIndex) return;
        const moved=settings.tests.splice(dragIndex,1)[0];
        settings.tests.splice(targetIndex,0,moved);
        rebuildTestsConfig();
        bindSimpleTests();
        buildTestSelectorUI();
      });
    });
  }

  function syncGeneralScale(){
    const minEl=document.getElementById('cfgScaleMin');
    const maxEl=document.getElementById('cfgScaleMax');
    if(!minEl && !maxEl) return;
    const fallbackMin=Number.isFinite(settings.scaleMin)? settings.scaleMin : 1;
    const fallbackMax=Number.isFinite(settings.scaleMax)? settings.scaleMax : 7;

    const clamp=(value,min,max)=>{
      const num=Number.parseInt(value,10);
      if(!Number.isFinite(num)) return null;
      return Math.min(max, Math.max(min, num));
    };

    const apply=(last)=>{
      let minVal=clamp(minEl? minEl.value : fallbackMin, 1, 99);
      if(minVal===null) minVal=fallbackMin;
      let maxVal=clamp(maxEl? maxEl.value : fallbackMax, 2, 100);
      if(maxVal===null) maxVal=fallbackMax;

      if(minVal>=maxVal){
        if(last==='min'){
          maxVal=Math.min(100, minVal+1);
          if(maxEl) maxEl.value=maxVal;
        } else {
          minVal=Math.max(1, maxVal-1);
          if(minEl) minEl.value=minVal;
        }
      }
      settings.scaleMin=minVal;
      settings.scaleMax=maxVal;
    };

    if(minEl){
      minEl.value=fallbackMin;
      minEl.onchange=()=>apply('min');
      minEl.onblur=()=>apply('min');
    }
    if(maxEl){
      maxEl.value=fallbackMax;
      maxEl.onchange=()=>apply('max');
      maxEl.onblur=()=>apply('max');
    }
    apply();
  }

  function syncNewExamTiming(){
    const defaults={ pathDisplaySec:15, preFlightDelaySec:10, flightDurationSec:60 };
    if(!settings.newExamTiming){ settings.newExamTiming=Object.assign({}, defaults); }
    const timing=Object.assign({}, defaults, settings.newExamTiming);
    settings.newExamTiming=timing;
    const fieldConfigs=[
      { id:'flightExamPathTime', key:'pathDisplaySec', min:3, max:300, fallback:defaults.pathDisplaySec },
      { id:'flightExamPreDelay', key:'preFlightDelaySec', min:0, max:180, fallback:defaults.preFlightDelaySec },
      { id:'flightExamFlightDur', key:'flightDurationSec', min:5, max:900, fallback:defaults.flightDurationSec }
    ];

    fieldConfigs.forEach(cfg=>{
      const el=document.getElementById(cfg.id);
      if(!el) return;
      const current=Number.isFinite(timing[cfg.key])? timing[cfg.key] : cfg.fallback;
      el.value=current;
      const apply=()=>{
        let val=Number.parseInt(el.value,10);
        if(!Number.isFinite(val)) val=cfg.fallback;
        val=Math.min(cfg.max, Math.max(cfg.min, val));
        el.value=val;
        timing[cfg.key]=val;
      };
      el.onchange=apply;
      el.onblur=apply;
      apply();
    });
  }

  rebuildTestsConfig();
  bindSimpleTests();
  syncGeneralScale();
  syncNewExamTiming();
}
