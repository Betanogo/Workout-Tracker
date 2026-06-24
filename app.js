
// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const KG2LB=2.2046;
const RPE_SCALE={
  10:[1,.955,.922,.892,.863,.837,.811,.786,.762,.739],
  9.5:[.978,.938,.907,.878,.85,.824,.798,.774,.751,.732],
  9:[.955,.922,.892,.863,.837,.811,.786,.762,.739,.724],
  8.5:[.938,.907,.878,.85,.824,.798,.774,.751,.732,.716],
  8:[.922,.892,.863,.837,.811,.786,.762,.739,.724,.707],
  7.5:[.907,.878,.85,.824,.798,.774,.751,.732,.716,.699],
  7:[.892,.863,.837,.811,.786,.762,.739,.724,.707,.691],
  6.5:[.878,.85,.824,.798,.774,.751,.732,.716,.699,.683],
  6:[.863,.837,.811,.786,.762,.739,.724,.707,.691,.676],
  5.5:[.85,.824,.798,.774,.751,.732,.716,.699,.683,.669],
  5:[.837,.811,.786,.762,.739,.724,.707,.691,.676,.663],
};
const RPE_ROWS=[10,9.5,9,8.5,8,7.5,7,6.5,6,5.5,5];
const DEF_TEMPO={SQ:'311',BP:'111',DL:'101',OHP:'101'};
const BLOCK_COLS=['bc0','bc1','bc2','bc3','bc4','bc5'];
const DAY_NAMES=['Day 1  Mon','Day 2  Tue','Day 3  Wed','Day 4  Fri'];

// Storage keys — versioned for migration
const SAVE_KEY='tl_prog_v4';
const LOG_KEY='tl_log_v4';
const LIFT_KEY='tl_lifts_v4';
const SETTINGS_KEY='tl_settings_v4';

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let displayUnit='kg';
let lifts={current:{SQ:270,BP:165,DL:265,OHP:70},target:{SQ:320,BP:185,DL:320,OHP:null},bw:102,dots:411.35};
let blocks=[];
let settings={accentColor:'#e06c00',timerDuration:180,timerAuto:true,defaultUnit:'kg'};
let pendingConfirm=null;
let pendingImport=null;
let activeNote=null; // {ex, title}
let timerInterval=null;
let timerRemaining=0;
let timerTotal=0;

let exNames=new Set(['Squat','Bench Press','Deadlift','OHP','Belt Squat','Larson Bench Press','Romanian Deadlift','Single Leg RDL','Copenhagen Plank','Ab Wheel','Cable Crunch','Cable Tricep Extension','Side Lateral Raise','Rear Delt Fly','Machine Press','Sandbag Bear Hug Carry','Back Extension','BSS','Pause Squat','Close Grip Bench','Incline Bench','Leg Press','Hip Thrust','Good Morning','Face Pull','Tricep Pushdown','Bicep Curl','Pause Deadlift','Deficit Deadlift','Box Squat','Front Squat','SQ','BP','DL']);

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
let _id=Date.now();
const uid=()=>'i'+(++_id);
const toDisplay=kg=>displayUnit==='kg'?kg:kg*KG2LB;
const toKg=v=>displayUnit==='kg'?v:v/KG2LB;
const fmt=(kg,d=1)=>kg==null||isNaN(kg)?'—':toDisplay(kg).toFixed(d)+' '+displayUnit;
const parseAsKg=v=>{const n=parseFloat(v);return isNaN(n)?null:toKg(n);};

function rpeFactor(rpe,reps){const r=RPE_SCALE[parseFloat(rpe)];if(!r)return null;return r[Math.min(parseInt(reps)-1,9)];}
function tempoFactor(workout,tempo){
  if(!tempo||tempo.length<3)return 1;
  const pause=parseInt(tempo[1])||0,ecc=parseInt(tempo[0])||0;
  const def=DEF_TEMPO[(workout||'').toUpperCase().split(' ')[0]]||'111';
  return Math.max(.85,1-(pause*.5+Math.max(0,ecc-(parseInt(def[0])||1))*.3)*.02);
}
function calcWeight(ormKg,rpe,reps,tempo,workout){
  if(!ormKg||!rpe||!reps)return null;
  const f=rpeFactor(rpe,reps);return f?ormKg*f*tempoFactor(workout,tempo):null;
}
function getOrm(workout){
  const k=(workout||'').toUpperCase().replace('LARSON ','').replace(' PRESS','').trim();
  return lifts.current[k]||lifts.current['SQ'];
}

// ═══════════════════════════════════════════════
// SETTINGS APPLY
// ═══════════════════════════════════════════════
function applySettings(){
  document.documentElement.style.setProperty('--acc',settings.accentColor);
  // Compute dim (15% opacity)
  const hex=settings.accentColor.replace('#','');
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  document.documentElement.style.setProperty('--acc-dim',`rgba(${r},${g},${b},0.14)`);
  // Determine text color (black or white) based on luminance
  const lum=0.299*r+0.587*g+0.114*b;
  document.documentElement.style.setProperty('--acc-text',lum>128?'#000':'#fff');
  document.getElementById('acc-swatch').style.background=settings.accentColor;
  document.getElementById('acc-color-input').value=settings.accentColor;
  document.getElementById('timer-duration').value=settings.timerDuration;
  document.getElementById('timer-auto').checked=settings.timerAuto;
  displayUnit=settings.defaultUnit;
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.unit===displayUnit));
  document.querySelectorAll('[data-sunit]').forEach(b=>b.classList.toggle('active',b.dataset.sunit===displayUnit));

  document.getElementById('bw-ul').textContent=displayUnit;
  const bwI=document.getElementById('bw-input');bwI.value=lifts.bw?toDisplay(lifts.bw).toFixed(1):'';
  renderLiftGrid('lift-grid-cur','current');renderLiftGrid('lift-grid-tgt','target');updateTotals();
}
function renderLiftGrid(id,type){
  const g=document.getElementById(id);g.innerHTML='';
  ['SQ','BP','DL','OHP'].forEach(lift=>{
    const kg=lifts[type][lift];
    const pct=type==='target'&&lifts.current[lift]&&lifts.target[lift]?Math.min(100,(lifts.current[lift]/lifts.target[lift])*100):null;
    const div=document.createElement('div');div.className='lift-card';
    div.innerHTML=`<div class="lift-card-name">${lift}</div>
      <div class="lift-val-row"><input class="lift-in" type="number" step="0.5" value="${kg?toDisplay(kg).toFixed(1):''}" placeholder="—"/><span class="lift-ul">${displayUnit}</span></div>
      <div class="lift-alt" id="la-${type}-${lift}">${kg?(displayUnit==='kg'?'≈ '+(kg*KG2LB).toFixed(1)+' lb':'≈ '+(kg/KG2LB).toFixed(1)+' kg'):'&nbsp;'}</div>
      ${pct!==null?'<div class="lift-bar"><div class="lift-bar-fill" style="width:'+pct+'%"></div></div><div class="lift-pct">'+pct.toFixed(0)+'% of target</div>':''}`;
    div.querySelector('.lift-in').addEventListener('input',e=>{
      const kg2=parseAsKg(e.target.value);lifts[type][lift]=kg2;
      const alt=document.getElementById('la-'+type+'-'+lift);
      if(alt)alt.textContent=kg2?(displayUnit==='kg'?'≈ '+(kg2*KG2LB).toFixed(1)+' lb':'≈ '+(kg2/KG2LB).toFixed(1)+' kg'):'';
      updateTotals();
    });
    g.appendChild(div);
  });
}
function updateTotals(){
  const cur=['SQ','BP','DL'].reduce((s,l)=>s+(lifts.current[l]||0),0);
  const tgt=['SQ','BP','DL'].reduce((s,l)=>s+(lifts.target[l]||0),0);
  document.getElementById('tot-cur').textContent=cur?fmt(cur,0):'—';
  document.getElementById('tot-tgt').textContent=tgt?fmt(tgt,0):'—';
  document.getElementById('tot-dots').textContent=lifts.dots?lifts.dots.toFixed(2):'—';
}

// RPE
function renderRPETable(){
  const t=document.getElementById('rpe-tbl');
  let h='<thead><tr><th>RPE</th>';for(let r=1;r<=10;r++)h+=`<th>${r}R</th>`;h+='</tr></thead><tbody>';
  RPE_ROWS.forEach(rpe=>{h+=`<tr><td>${rpe}</td>`;RPE_SCALE[rpe].forEach(f=>h+=`<td>${(f*100).toFixed(1)}</td>`);h+='</tr>';});
  t.innerHTML=h+'</tbody>';
}
function updateCalc(){
  const orm=parseFloat(document.getElementById('c1rm').value);
  document.getElementById('cres-u').textContent=displayUnit;
  if(!orm){document.getElementById('cres').textContent='—';return;}
  const f=rpeFactor(document.getElementById('crpe').value,document.getElementById('creps').value);
  const kg=(displayUnit==='kg'?orm:orm/KG2LB)*f;
  document.getElementById('cres').textContent=fmt(kg,1).split(' ')[0];
}

// BACKUP
function backupToExcel(){
  const wb=XLSX.utils.book_new();
  blocks.filter(b=>!b.archived).forEach(block=>{
    const rows=[['','WEEK','DAY','#','WORKOUT','RPE','','','WEIGHT (kg)','','TEMPO','SETS','REPS','DONE','NOTE']];
    block.weeks.forEach((week)=>{
      week.days.forEach((day)=>{
        day.exercises.forEach((ex,ei)=>{
          const kg=calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
          rows.push(['',ei===0?week.label:'',ei===0?day.name:'',ei+1,ex.workout,ex.rpe,'','',kg?kg.toFixed(1):'','',ex.tempo,ex.sets,ex.reps,ex.done?'✓':'',ex.note||'']);
        });
      });
    });
    const ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,block.name.slice(0,31));
  });
  let log=[];try{log=JSON.parse(localStorage.getItem(LOG_KEY))||[];}catch{}
  if(log.length){
    const lr=[['Block','Archived At','Summary']];
    log.forEach(e=>lr.push([e.name,e.archivedAt,(e.summary||[]).join(', ')]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(lr),'Archived Log');
  }
  XLSX.writeFile(wb,'TATELIFT_backup_'+new Date().toISOString().slice(0,10)+'.xlsx');
  showToast('Backup downloaded');
}

// CONFIRM
function confirmAction(title,sub,onOk){
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-sub').textContent=sub;
  pendingConfirm=onOk;
  document.getElementById('modal-confirm').classList.remove('hidden');
}
document.getElementById('confirm-ok').addEventListener('click',()=>{
  document.getElementById('modal-confirm').classList.add('hidden');
  if(pendingConfirm){pendingConfirm();pendingConfirm=null;}
});
document.getElementById('confirm-cancel').addEventListener('click',()=>{document.getElementById('modal-confirm').classList.add('hidden');pendingConfirm=null;});

// SETTINGS
document.getElementById('acc-swatch').addEventListener('click',()=>document.getElementById('acc-color-input').click());
document.getElementById('acc-color-input').addEventListener('input',e=>{
  settings.accentColor=e.target.value;applySettings();
});
document.getElementById('timer-duration').addEventListener('input',e=>settings.timerDuration=parseInt(e.target.value)||180);
document.getElementById('timer-auto').addEventListener('change',e=>settings.timerAuto=e.target.checked);
document.querySelectorAll('[data-sunit]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    settings.defaultUnit=btn.dataset.sunit;displayUnit=settings.defaultUnit;
    applySettings();renderStats();renderProgram();updateCalc();
  });
});
document.getElementById('btn-backup').addEventListener('click',backupToExcel);
document.getElementById('btn-reset-all').addEventListener('click',()=>{
  confirmAction('Reset ALL data?','Cannot be undone.',()=>{localStorage.clear();location.reload();});
});

// NAV
document.querySelectorAll('.nav-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-'+tab.dataset.page).classList.add('active');
    if(tab.dataset.page==='stats')renderStats();
    if(tab.dataset.page==='rpe'){renderRPETable();updateCalc();}
    if(tab.dataset.page==='log')renderLog();
  });
});
document.getElementById('btn-settings').addEventListener('click',()=>{
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-settings').classList.add('active');
});
document.querySelectorAll('.seg-btn[data-unit]').forEach(btn=>{
  btn.addEventListener('click',()=>{displayUnit=btn.dataset.unit;settings.defaultUnit=displayUnit;applySettings();renderStats();renderProgram();updateCalc();});
});
document.getElementById('bw-input').addEventListener('input',e=>lifts.bw=parseAsKg(e.target.value));
document.getElementById('prog-title').addEventListener('input',e=>{programData=e.target.value;});
document.getElementById('btn-add-block').addEventListener('click',()=>{blocks.push(makeBlock('New Block',blocks.length));renderProgram();showToast('Block added');});
document.getElementById('btn-import').addEventListener('click',()=>document.getElementById('excel-input').click());
document.getElementById('btn-clear-log').addEventListener('click',()=>confirmAction('Clear all logs?','Cannot be undone.',()=>{localStorage.removeItem(LOG_KEY);renderLog();}));
['c1rm','crpe','creps'].forEach(id=>document.getElementById(id).addEventListener('input',updateCalc));
document.getElementById('fab').addEventListener('click',()=>{
  blocks.forEach(b=>b.weeks.forEach(w=>w.days.forEach(d=>d.exercises.forEach(e=>{if(e.workout)exNames.add(e.workout);}))));
  saveAll();showToast('Saved ✓');
});

// TOAST
let toastT;
function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2200);
}

// SERVICE WORKER
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

// BOOT
loadAll();
applySettings();
if(!blocks.length)blocks.push(makeBlock('My Program',0));
renderProgram();
renderStats();