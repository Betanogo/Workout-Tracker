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
let activeNote=null;
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

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(window._toastT);
  window._toastT=setTimeout(()=>t.classList.remove('show'),2200);
}

function confirmAction(title,sub,onOk){
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-sub').textContent=sub;
  pendingConfirm=onOk;
  document.getElementById('modal-confirm').classList.remove('hidden');
}

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════
function applySettings(){
  document.documentElement.style.setProperty('--acc',settings.accentColor);
  const hex=settings.accentColor.replace('#','');
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  document.documentElement.style.setProperty('--acc-dim','rgba('+r+','+g+','+b+',0.14)');
  const lum=0.299*r+0.587*g+0.114*b;
  document.documentElement.style.setProperty('--acc-text',lum>128?'#000':'#fff');
  const swatch=document.getElementById('acc-swatch');
  if(swatch)swatch.style.background=settings.accentColor;
  const ci=document.getElementById('acc-color-input');
  if(ci)ci.value=settings.accentColor;
  const td=document.getElementById('timer-duration');
  if(td)td.value=settings.timerDuration;
  const ta=document.getElementById('timer-auto');
  if(ta)ta.checked=settings.timerAuto;
  displayUnit=settings.defaultUnit||'kg';
  document.querySelectorAll('.seg-btn[data-unit]').forEach(b=>b.classList.toggle('active',b.dataset.unit===displayUnit));
  document.querySelectorAll('[data-sunit]').forEach(b=>b.classList.toggle('active',b.dataset.sunit===displayUnit));
  const bwul=document.getElementById('bw-ul');if(bwul)bwul.textContent=displayUnit;
  const cu=document.getElementById('cres-u');if(cu)cu.textContent=displayUnit;
}

// ═══════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════
function saveAll(){
  localStorage.setItem(SAVE_KEY,JSON.stringify({blocks,title:document.getElementById('prog-title').value||''}));
  localStorage.setItem(LIFT_KEY,JSON.stringify({lifts,displayUnit}));
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
}

function loadAll(){
  try{const s=JSON.parse(localStorage.getItem(SETTINGS_KEY));if(s)settings=Object.assign({},settings,s);}catch{}
  const OLD_PROG=['tatelift_prog_v3','tl_prog_v3'];
  const OLD_LOG=['tatelift_log_v3','tl_log_v3'];
  const OLD_LIFT=['tatelift_lifts_v3','tl_lifts_v3'];
  try{
    const p=JSON.parse(localStorage.getItem(SAVE_KEY));
    if(p){blocks=p.blocks||[];const pt=document.getElementById('prog-title');if(pt)pt.value=p.title||'';}
    else{for(const k of OLD_PROG){const op=localStorage.getItem(k);if(op){const d=JSON.parse(op);blocks=d.blocks||[];const pt=document.getElementById('prog-title');if(pt)pt.value=d.title||'';break;}}}
  }catch{}
  try{
    const l=JSON.parse(localStorage.getItem(LIFT_KEY));
    if(l){lifts=l.lifts||lifts;}
    else{for(const k of OLD_LIFT){const ol=localStorage.getItem(k);if(ol){const d=JSON.parse(ol);lifts=d.lifts||lifts;break;}}}
  }catch{}
  try{
    if(!localStorage.getItem(LOG_KEY)){for(const k of OLD_LOG){const ol=localStorage.getItem(k);if(ol){localStorage.setItem(LOG_KEY,ol);break;}}}
  }catch{}
  blocks.forEach(b=>{
    if(!b.id)b.id=uid();
    (b.weeks||[]).forEach(w=>{if(!w.id)w.id=uid();(w.days||[]).forEach(d=>{if(!d.id)d.id=uid();(d.exercises||[]).forEach(e=>{if(!e.id)e.id=uid();if(e.note===undefined)e.note='';});});});
  });
}

// ═══════════════════════════════════════════════
// DEFAULT STRUCTURES
// ═══════════════════════════════════════════════
const makeEx=()=>({id:uid(),workout:'',rpe:'',tempo:'',sets:'',reps:'',done:false,note:''});
const makeDay=name=>({id:uid(),name:name||'Day 1',date:'',done:false,media:[],exercises:[0,1,2,3,4].map(makeEx)});
const makeWeek=n=>({id:uid(),label:'Week '+n,date:'',done:false,days:DAY_NAMES.map(makeDay)});
const makeBlock=(name,ci)=>({id:uid(),name:name||'New Block',color:BLOCK_COLS[ci%BLOCK_COLS.length],archived:false,weeks:[makeWeek(1)]});

// ═══════════════════════════════════════════════
// COMPLETE PROPAGATION
// ═══════════════════════════════════════════════
function markDayExercises(day,done){day.exercises.forEach(e=>e.done=done);}
function markWeekDays(week,done){week.days.forEach(d=>{d.done=done;markDayExercises(d,done);});}
function getWeekDoneState(week){
  if(!week.days.length)return'none';
  if(week.days.every(d=>d.done))return'done';
  if(week.days.some(d=>d.done||d.exercises.some(e=>e.done)))return'partial';
  return'none';
}
function getDayDoneState(day){
  if(!day.exercises.length)return'none';
  if(day.exercises.every(e=>e.done))return'done';
  if(day.exercises.some(e=>e.done))return'partial';
  return'none';
}

// ═══════════════════════════════════════════════
// FIND CURRENT DAY
// ═══════════════════════════════════════════════
function findCurrentDayId(){
  let allDays=[];
  blocks.filter(b=>!b.archived).forEach(b=>b.weeks.forEach(w=>w.days.forEach(d=>allDays.push(d))));
  let lastDoneIdx=-1;
  allDays.forEach((d,i)=>{if(d.done)lastDoneIdx=i;});
  if(lastDoneIdx>=0&&lastDoneIdx+1<allDays.length)return allDays[lastDoneIdx+1].id;
  if(allDays.length)return allDays[0].id;
  return null;
}

// ═══════════════════════════════════════════════
// RENDER PROGRAM
// ═══════════════════════════════════════════════
function renderProgram(){
  const c=document.getElementById('blocks-container');
  if(!c)return;
  c.innerHTML='';
  const curId=findCurrentDayId();
  blocks.filter(b=>!b.archived).forEach((block,bi)=>c.appendChild(renderBlock(block,bi,curId)));
  initBlockDrag();
}

function renderBlock(block,bi,curId){
  const wrap=document.createElement('div');wrap.className='block-wrap';wrap.dataset.bid=block.id;
  const hdr=document.createElement('div');hdr.className='block-header';
  hdr.innerHTML='<span class="drag-handle">⠿</span>'
    +'<span class="block-dot '+block.color+'"></span>'
    +'<input class="block-name-in" value="'+(block.name||'')+'" placeholder="Block name"/>'
    +'<button class="pill-btn acc" data-a="add-week">+Week</button>'
    +'<button class="pill-btn red" data-a="rem-week">−Week</button>'
    +'<button class="pill-btn acc" data-a="copy">Copy</button>'
    +'<button class="pill-btn" data-a="archive">Archive</button>'
    +'<button class="pill-btn red" data-a="delete">Delete</button>';
  hdr.querySelector('.block-name-in').addEventListener('input',e=>block.name=e.target.value);
  hdr.querySelectorAll('[data-a]').forEach(btn=>btn.addEventListener('click',()=>blockAction(btn.dataset.a,block.id)));
  wrap.appendChild(hdr);
  const weeksWrap=document.createElement('div');weeksWrap.dataset.weeksOf=block.id;
  block.weeks.forEach((w,wi)=>weeksWrap.appendChild(renderWeek(w,block,wi,curId)));
  wrap.appendChild(weeksWrap);
  return wrap;
}

function renderWeek(week,block,wi,curId){
  const wrap=document.createElement('div');wrap.className='week-wrap';wrap.dataset.wid=week.id;
  const state=getWeekDoneState(week);
  const hdr=document.createElement('div');hdr.className='week-header';
  hdr.innerHTML='<span class="drag-handle" style="font-size:12px">⠿</span>'
    +'<span class="week-lbl">Week '+(wi+1)+'</span>'
    +'<input type="date" class="week-date-in" value="'+(week.date||'')+'"/>'
    +'<button class="pill-btn acc" style="font-size:9px" data-a="add-day">+Day</button>'
    +'<button class="pill-btn red" style="font-size:9px" data-a="rem-day">−Day</button>'
    +'<button class="pill-btn red" style="font-size:9px" data-a="del-week">✕</button>'
    +'<div class="check-box'+(state==='done'?' done':state==='partial'?' partial':'')+'" data-a="toggle-week">'+(state==='done'?'✓':state==='partial'?'–':'')+'</div>';
  hdr.querySelector('.week-date-in').addEventListener('change',e=>week.date=e.target.value);
  hdr.querySelectorAll('[data-a]').forEach(el=>el.addEventListener('click',()=>weekAction(el.dataset.a,block,week,el)));
  wrap.appendChild(hdr);
  week.days.forEach((d,di)=>wrap.appendChild(renderDay(d,block,week,di,curId)));
  return wrap;
}

function renderDay(day,block,week,di,curId){
  const card=document.createElement('div');
  card.className='day-card'+(day.id===curId?' current-day':'');
  card.dataset.did=day.id;
  const state=getDayDoneState(day);
  const hdr=document.createElement('div');hdr.className='day-header';
  hdr.innerHTML='<span class="drag-handle" style="font-size:12px">⠿</span>'
    +'<span class="day-lbl">'+day.name+'</span>'
    +'<input type="date" class="day-date-in" value="'+(day.date||'')+'" onclick="event.stopPropagation()"/>'
    +'<div class="check-box'+(state==='done'?' done':state==='partial'?' partial':'')+'" data-a="toggle-day" onclick="event.stopPropagation()">'+(state==='done'?'✓':state==='partial'?'–':'')+'</div>';
  hdr.addEventListener('click',()=>body.classList.toggle('open'));
  hdr.querySelector('.day-date-in').addEventListener('change',e=>day.date=e.target.value);
  hdr.querySelector('[data-a="toggle-day"]').addEventListener('click',function(e){
    e.stopPropagation();
    day.done=!day.done;
    markDayExercises(day,day.done);
    renderProgram();
  });
  card.appendChild(hdr);
  const body=document.createElement('div');
  body.className='day-body'+(day.id===curId?' open':'');
  const scroll=document.createElement('div');scroll.className='ex-scroll';
  const tbl=document.createElement('table');tbl.className='ex-table';
  tbl.innerHTML='<thead><tr>'
    +'<th style="width:18px"></th><th style="width:16px"></th>'
    +'<th>Exercise</th>'
    +'<th class="c" style="width:40px">RPE</th>'
    +'<th class="c" style="width:40px">Tempo</th>'
    +'<th class="c" style="width:34px">Sets</th>'
    +'<th class="c" style="width:34px">Reps</th>'
    +'<th class="c" style="width:62px">Weight</th>'
    +'<th class="c" style="width:24px">✓</th>'
    +'<th class="c" style="width:22px">✎</th>'
    +'<th class="c" style="width:20px"></th>'
    +'</tr></thead>';
  const tbody=document.createElement('tbody');
  day.exercises.forEach((ex,ei)=>tbody.appendChild(makeExRow(ex,day,ei,tbody)));
  tbl.appendChild(tbody);scroll.appendChild(tbl);body.appendChild(scroll);
  const addBtn=document.createElement('button');addBtn.className='add-ex-btn';addBtn.textContent='+ Add exercise';
  addBtn.addEventListener('click',()=>{const ex=makeEx();day.exercises.push(ex);tbody.appendChild(makeExRow(ex,day,day.exercises.length-1,tbody));});
  body.appendChild(addBtn);
  card.appendChild(body);
  return card;
}

function makeExRow(ex,day,ei,tbody){
  const tr=document.createElement('tr');
  tr.className=ex.done?'ex-done-row':'';
  tr.innerHTML='<td class="rh drag-handle" style="cursor:grab">⠿</td>'
    +'<td class="rh">'+(ei+1)+'</td>'
    +'<td class="ac-wrap"><input class="ex-in" value="'+(ex.workout||'')+'" placeholder="Exercise"/><div class="ac-list"></div></td>'
    +'<td><input class="ex-in mono" type="text" inputmode="decimal" value="'+(ex.rpe||'')+'" placeholder="—" style="width:40px"/></td>'
    +'<td><input class="ex-in mono" type="text" inputmode="numeric" value="'+(ex.tempo||'')+'" placeholder="311" maxlength="3" style="width:40px"/></td>'
    +'<td><input class="ex-in mono" type="text" inputmode="numeric" value="'+(ex.sets||'')+'" placeholder="—" style="width:34px"/></td>'
    +'<td><input class="ex-in mono" type="text" inputmode="numeric" value="'+(ex.reps||'')+'" placeholder="—" style="width:34px"/></td>'
    +'<td><div class="wt-val">—</div><div class="wt-alt"></div></td>'
    +'<td><div class="check-box'+(ex.done?' done':'')+'" style="margin:0 auto;width:20px;height:20px;font-size:10px">'+(ex.done?'✓':'')+'</div></td>'
    +'<td><button class="note-btn '+(ex.note?'has-note':'no-note')+'" title="Note">'+(ex.note?'📝':'✎')+'</button></td>'
    +'<td><button class="del-btn">✕</button></td>';
  const inputs=tr.querySelectorAll('.ex-in');
  const wIn=inputs[0],rpeIn=inputs[1],tempoIn=inputs[2],setsIn=inputs[3],repsIn=inputs[4];
  const wDisp=tr.querySelector('.wt-val'),wAlt=tr.querySelector('.wt-alt');
  const acList=tr.querySelector('.ac-list');
  let acSel=-1;

  function refreshW(){
    const kg=calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
    if(kg){wDisp.textContent=fmt(kg,1);wAlt.textContent=displayUnit==='kg'?(kg*KG2LB).toFixed(1)+' lb':(kg/KG2LB).toFixed(1)+' kg';}
    else{wDisp.textContent='—';wAlt.textContent='';}
  }

  wIn.addEventListener('input',()=>{
    ex.workout=wIn.value;
    const q=wIn.value.trim().toLowerCase();
    if(q.length<2){acList.style.display='none';return;}
    const m=[...exNames].filter(n=>n.toLowerCase().includes(q)).slice(0,8);
    if(!m.length){acList.style.display='none';return;}
    acList.innerHTML='';acSel=-1;
    m.forEach(name=>{
      const item=document.createElement('div');item.className='ac-item';item.textContent=name;
      item.addEventListener('mousedown',e=>{e.preventDefault();wIn.value=name;ex.workout=name;exNames.add(name);acList.style.display='none';refreshW();});
      acList.appendChild(item);
    });
    acList.style.display='block';
  });
  wIn.addEventListener('keydown',e=>{
    const items=acList.querySelectorAll('.ac-item');
    if(acList.style.display==='none'||!items.length)return;
    if(e.key==='ArrowDown'){e.preventDefault();acSel=Math.min(acSel+1,items.length-1);items.forEach((el,i)=>el.classList.toggle('sel',i===acSel));}
    else if(e.key==='ArrowUp'){e.preventDefault();acSel=Math.max(acSel-1,0);items.forEach((el,i)=>el.classList.toggle('sel',i===acSel));}
    else if(e.key==='Tab'||e.key==='Enter'){if(acSel>=0){e.preventDefault();items[acSel].dispatchEvent(new MouseEvent('mousedown'));}else if(items.length){e.preventDefault();items[0].dispatchEvent(new MouseEvent('mousedown'));}acList.style.display='none';}
    else if(e.key==='Escape')acList.style.display='none';
  });
  wIn.addEventListener('blur',()=>setTimeout(()=>acList.style.display='none',150));
  rpeIn.addEventListener('input',()=>{ex.rpe=rpeIn.value;refreshW();});
  tempoIn.addEventListener('input',()=>{ex.tempo=tempoIn.value;refreshW();});
  setsIn.addEventListener('input',()=>ex.sets=setsIn.value);
  repsIn.addEventListener('input',()=>{ex.reps=repsIn.value;refreshW();});

  tr.querySelector('.check-box').addEventListener('click',function(){
    ex.done=!ex.done;
    this.classList.toggle('done',ex.done);
    this.textContent=ex.done?'✓':'';
    tr.classList.toggle('ex-done-row',ex.done);
    if(ex.done&&settings.timerAuto)startTimer(ex.workout);
    day.done=day.exercises.every(e=>e.done);
    const dayCard=tr.closest('.day-card');
    if(dayCard){
      const doneBtn=dayCard.querySelector('.day-header .check-box');
      const s=getDayDoneState(day);
      if(doneBtn){doneBtn.className='check-box'+(s==='done'?' done':s==='partial'?' partial':'');doneBtn.textContent=s==='done'?'✓':s==='partial'?'–':'';}
    }
  });
  tr.querySelector('.note-btn').addEventListener('click',()=>openNote(ex,ex.workout||('Exercise '+(ei+1)),tr));
  tr.querySelector('.del-btn').addEventListener('click',()=>{
    const idx=day.exercises.indexOf(ex);if(idx>=0)day.exercises.splice(idx,1);
    tr.remove();tbody.querySelectorAll('tr').forEach((r,i)=>r.cells[1].textContent=i+1);
  });
  setTimeout(refreshW,0);
  return tr;
}

// ═══════════════════════════════════════════════
// BLOCK / WEEK ACTIONS
// ═══════════════════════════════════════════════
function blockAction(action,bid){
  const block=blocks.find(b=>b.id===bid);if(!block)return;
  if(action==='add-week'){block.weeks.push(makeWeek(block.weeks.length+1));renderProgram();}
  else if(action==='rem-week'){if(block.weeks.length>1){block.weeks.pop();renderProgram();}}
  else if(action==='copy'){
    const c=JSON.parse(JSON.stringify(block));
    c.id=uid();c.name=block.name+' (copy)';c.color=BLOCK_COLS[(BLOCK_COLS.indexOf(block.color)+1)%BLOCK_COLS.length];
    c.weeks.forEach(w=>{w.id=uid();w.days.forEach(d=>{d.id=uid();d.exercises.forEach(e=>e.id=uid());});});
    const idx=blocks.indexOf(block);blocks.splice(idx+1,0,c);renderProgram();showToast('Copied');
  }
  else if(action==='archive'){
    confirmAction('Archive "'+block.name+'"?','Moves to Log.',()=>{block.archived=true;archiveToLog(block);renderProgram();renderLog();showToast('Archived');});
  }
  else if(action==='delete'){
    confirmAction('Delete "'+block.name+'"?','Cannot be undone.',()=>{blocks=blocks.filter(b=>b.id!==bid);renderProgram();showToast('Deleted');});
  }
}

function weekAction(action,block,week,el){
  if(action==='add-day'){week.days.push(makeDay('Day '+(week.days.length+1)));renderProgram();}
  else if(action==='rem-day'){if(week.days.length>1){week.days.pop();renderProgram();}}
  else if(action==='del-week'){
    confirmAction('Delete week?','All exercises will be removed.',()=>{block.weeks=block.weeks.filter(w=>w.id!==week.id);renderProgram();showToast('Week deleted');});
  }
  else if(action==='toggle-week'){week.done=!week.done;markWeekDays(week,week.done);renderProgram();}
}

// ═══════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════
function initBlockDrag(){
  const bc=document.getElementById('blocks-container');
  makeSortable(bc,'.block-wrap','.block-header .drag-handle',(from,to)=>{
    const a=blocks.findIndex(b=>b.id===from.dataset.bid);
    const b2=blocks.findIndex(b=>b.id===to.dataset.bid);
    if(a<0||b2<0)return;
    const[item]=blocks.splice(a,1);blocks.splice(b2,0,item);renderProgram();
  });
  document.querySelectorAll('[data-weeks-of]').forEach(wc=>{
    const bid=wc.dataset.weeksOf;
    makeSortable(wc,'.week-wrap','.week-header .drag-handle',(from,to)=>{
      const block=blocks.find(b=>b.id===bid);if(!block)return;
      const a=block.weeks.findIndex(w=>w.id===from.dataset.wid);
      const b2=block.weeks.findIndex(w=>w.id===to.dataset.wid);
      if(a<0||b2<0)return;
      const[item]=block.weeks.splice(a,1);block.weeks.splice(b2,0,item);renderProgram();
    });
  });
}
function makeSortable(container,itemSel,handleSel,onDrop){
  let dragging=null;
  container.querySelectorAll(itemSel).forEach(item=>{
    const handle=item.querySelector(handleSel);if(!handle)return;
    item.draggable=true;
    item.addEventListener('dragstart',e=>{dragging=item;e.dataTransfer.effectAllowed='move';setTimeout(()=>item.style.opacity='.3',0);});
    item.addEventListener('dragend',()=>{dragging=null;item.style.opacity='';container.querySelectorAll(itemSel).forEach(i=>i.classList.remove('drag-over'));});
    item.addEventListener('dragover',e=>{e.preventDefault();if(dragging&&dragging!==item)item.classList.add('drag-over');});
    item.addEventListener('dragleave',()=>item.classList.remove('drag-over'));
    item.addEventListener('drop',e=>{e.preventDefault();item.classList.remove('drag-over');if(dragging&&dragging!==item)onDrop(dragging,item);});
  });
}

// ═══════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════
const circumference=2*Math.PI*68;
window.addEventListener('DOMContentLoaded',()=>{
  const tc=document.getElementById('timer-circle');
  if(tc)tc.style.strokeDasharray=circumference;
});
function startTimer(exerciseName){
  clearInterval(timerInterval);
  timerTotal=settings.timerDuration;timerRemaining=timerTotal;
  const tl=document.getElementById('timer-label');if(tl)tl.textContent='Rest — '+(exerciseName||'');
  const to=document.getElementById('timer-overlay');if(to)to.classList.remove('hidden');
  updateTimerDisplay();
  timerInterval=setInterval(()=>{
    timerRemaining--;updateTimerDisplay();
    if(timerRemaining<=0){clearInterval(timerInterval);const to2=document.getElementById('timer-overlay');if(to2)to2.classList.add('hidden');showToast('Rest complete!');}
  },1000);
}
function updateTimerDisplay(){
  const m=Math.floor(timerRemaining/60),s=timerRemaining%60;
  const tn=document.getElementById('timer-num');if(tn)tn.textContent=m+':'+(s<10?'0':'')+s;
  const tc=document.getElementById('timer-circle');
  if(tc)tc.style.strokeDashoffset=circumference*(1-timerRemaining/timerTotal);
}

// ═══════════════════════════════════════════════
// NOTE
// ═══════════════════════════════════════════════
function openNote(ex,title,tr){
  activeNote={ex,tr};
  const nt=document.getElementById('note-title');if(nt)nt.textContent=title||'Note';
  const ta=document.getElementById('note-textarea');if(ta)ta.value=ex.note||'';
  const nm=document.getElementById('note-modal');if(nm)nm.classList.remove('hidden');
  setTimeout(()=>{const ta2=document.getElementById('note-textarea');if(ta2)ta2.focus();},100);
}

// ═══════════════════════════════════════════════
// EXCEL IMPORT
// ═══════════════════════════════════════════════
function parseExcel(wb,filename){
  const result=[];
  const templateSheet=wb.SheetNames.find(n=>n.toLowerCase().includes('template')||n.toLowerCase().includes('week'));
  const sheets=templateSheet?[templateSheet]:wb.SheetNames.slice(0,3);
  sheets.forEach(name=>{
    const ws=wb.Sheets[name];if(!ws)return;
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    const block=parseSheet(rows,name);
    if(block)result.push(block);
  });
  return result.length?result:[makeBlock('Imported',0)];
}
function parseSheet(rows,name){
  const block=makeBlock(name,blocks.length%BLOCK_COLS.length);block.weeks=[];
  let cw=null,cd=null;
  rows.forEach(row=>{
    if(!row||!row.some(v=>v!=null))return;
    const wk=String(row[1]||'').trim(),day=String(row[2]||'').trim();
    const exNum=row[3],workout=String(row[4]||'').trim();
    const rpe=row[5]!=null?String(row[5]):'',tempo=row[10]!=null?String(row[10]):'';
    const sets=row[11]!=null?String(row[11]):'',reps=row[12]!=null?String(row[12]):'';
    if(wk.toLowerCase().includes('week')){cw={id:uid(),label:wk,date:'',done:false,days:[]};block.weeks.push(cw);cd=null;}
    if(day.toLowerCase().includes('day')){cd={id:uid(),name:day.replace(/\n/g,' ').trim(),date:'',done:false,media:[],exercises:[]};if(!cw){cw={id:uid(),label:'Week 1',date:'',done:false,days:[]};block.weeks.push(cw);}cw.days.push(cd);}
    if(workout&&exNum!=null&&cd){exNames.add(workout);cd.exercises.push({id:uid(),workout,rpe,tempo,sets,reps,done:false,note:''});}
  });
  block.weeks=block.weeks.filter(w=>w.days.filter(d=>d.exercises.length>0).length>0);
  block.weeks.forEach(w=>w.days=w.days.filter(d=>d.exercises.length>0));
  return block.weeks.length?block:null;
}

// ═══════════════════════════════════════════════
// LOG
// ═══════════════════════════════════════════════
function archiveToLog(block){
  let log=[];try{log=JSON.parse(localStorage.getItem(LOG_KEY))||[];}catch{}
  log.unshift({id:block.id,name:block.name,archivedAt:new Date().toLocaleString('ko-KR'),weekCount:block.weeks.length,
    summary:block.weeks.flatMap(w=>w.days.flatMap(d=>d.exercises.filter(e=>e.workout).map(e=>e.workout+' '+(e.sets||'?')+'x'+(e.reps||'?')+'@'+(e.rpe||'?')))).slice(0,12),
    blockData:JSON.parse(JSON.stringify(block))});
  localStorage.setItem(LOG_KEY,JSON.stringify(log.slice(0,100)));
}
function renderLog(){
  const list=document.getElementById('log-list');if(!list)return;
  let log=[];try{log=JSON.parse(localStorage.getItem(LOG_KEY))||[];}catch{}
  if(!log.length){list.innerHTML='<div style="text-align:center;color:var(--text3);padding:50px 0;font-size:12px">No archived blocks yet</div>';return;}
  list.innerHTML='';
  log.forEach((entry,i)=>{
    const card=document.createElement('div');card.className='log-card';
    card.innerHTML='<div class="log-card-hdr"><div class="log-title">'+entry.name+'</div><div class="log-date">'+(entry.archivedAt||'')+'</div></div>'
      +'<div class="log-chips">'+(entry.summary||[]).map(t=>'<span class="log-chip">'+t+'</span>').join('')+'</div>'
      +'<div class="log-actions">'
      +'<button class="pill-btn acc" data-i="'+i+'" data-a="unarchive">Restore</button>'
      +'<button class="pill-btn acc" data-i="'+i+'" data-a="copy">Copy</button>'
      +'<button class="pill-btn red" data-i="'+i+'" data-a="delete">Delete</button>'
      +'</div>';
    card.querySelectorAll('[data-a]').forEach(btn=>btn.addEventListener('click',()=>logAction(btn.dataset.a,parseInt(btn.dataset.i))));
    list.appendChild(card);
  });
}
function logAction(action,i){
  let log=[];try{log=JSON.parse(localStorage.getItem(LOG_KEY))||[];}catch{}
  const entry=log[i];if(!entry)return;
  if(action==='unarchive'){
    const block=entry.blockData?JSON.parse(JSON.stringify(entry.blockData)):makeBlock(entry.name,blocks.length);
    block.archived=false;blocks.push(block);log.splice(i,1);
    localStorage.setItem(LOG_KEY,JSON.stringify(log));renderProgram();renderLog();showToast('Restored to Program');
  }else if(action==='copy'){
    const block=JSON.parse(JSON.stringify(entry.blockData||makeBlock(entry.name,blocks.length)));
    block.id=uid();block.name=entry.name+' (copy)';block.archived=false;
    block.weeks.forEach(w=>{w.id=uid();w.days.forEach(d=>{d.id=uid();d.exercises.forEach(e=>e.id=uid());});});
    blocks.push(block);renderProgram();showToast('Copied to Program');
  }else if(action==='delete'){
    confirmAction('Delete from Log?','Cannot be undone.',()=>{log.splice(i,1);localStorage.setItem(LOG_KEY,JSON.stringify(log));renderLog();showToast('Deleted');});
  }
}

// ═══════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════
function renderStats(){
  document.querySelectorAll('.seg-btn[data-unit]').forEach(b=>b.classList.toggle('active',b.dataset.unit===displayUnit));
  const bwul=document.getElementById('bw-ul');if(bwul)bwul.textContent=displayUnit;
  const bwI=document.getElementById('bw-input');if(bwI)bwI.value=lifts.bw?toDisplay(lifts.bw).toFixed(1):'';
  renderLiftGrid('lift-grid-cur','current');
  renderLiftGrid('lift-grid-tgt','target');
  updateTotals();
}
function renderLiftGrid(id,type){
  const g=document.getElementById(id);if(!g)return;g.innerHTML='';
  ['SQ','BP','DL','OHP'].forEach(lift=>{
    const kg=lifts[type][lift];
    const pct=type==='target'&&lifts.current[lift]&&lifts.target[lift]?Math.min(100,(lifts.current[lift]/lifts.target[lift])*100):null;
    const div=document.createElement('div');div.className='lift-card';
    const dispVal=kg?toDisplay(kg).toFixed(1):'';
    const altVal=kg?(displayUnit==='kg'?'≈ '+(kg*KG2LB).toFixed(1)+' lb':'≈ '+(kg/KG2LB).toFixed(1)+' kg'):'&nbsp;';
    div.innerHTML='<div class="lift-card-name">'+lift+'</div>'
      +'<div class="lift-val-row"><input class="lift-in" type="number" step="0.5" value="'+dispVal+'" placeholder="—"/><span class="lift-ul">'+displayUnit+'</span></div>'
      +'<div class="lift-alt" id="la-'+type+'-'+lift+'">'+altVal+'</div>'
      +(pct!==null?'<div class="lift-bar"><div class="lift-bar-fill" style="width:'+pct+'%"></div></div><div class="lift-pct">'+pct.toFixed(0)+'% of target</div>':'');
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
  const tc=document.getElementById('tot-cur');if(tc)tc.textContent=cur?fmt(cur,0):'—';
  const tt=document.getElementById('tot-tgt');if(tt)tt.textContent=tgt?fmt(tgt,0):'—';
  const td=document.getElementById('tot-dots');if(td)td.textContent=lifts.dots?lifts.dots.toFixed(2):'—';
}

// ═══════════════════════════════════════════════
// RPE
// ═══════════════════════════════════════════════
function renderRPETable(){
  const t=document.getElementById('rpe-tbl');if(!t)return;
  let h='<thead><tr><th>RPE</th>';for(let r=1;r<=10;r++)h+='<th>'+r+'R</th>';h+='</tr></thead><tbody>';
  RPE_ROWS.forEach(rpe=>{h+='<tr><td>'+rpe+'</td>';RPE_SCALE[rpe].forEach(f=>h+='<td>'+(f*100).toFixed(1)+'</td>');h+='</tr>';});
  t.innerHTML=h+'</tbody>';
}
function updateCalc(){
  const orm=parseFloat(document.getElementById('c1rm').value);
  const cu=document.getElementById('cres-u');if(cu)cu.textContent=displayUnit;
  const cr=document.getElementById('cres');if(!cr)return;
  if(!orm){cr.textContent='—';return;}
  const f=rpeFactor(document.getElementById('crpe').value,document.getElementById('creps').value);
  const kg=(displayUnit==='kg'?orm:orm/KG2LB)*f;
  cr.textContent=fmt(kg,1).split(' ')[0];
}

// ═══════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════
function backupToExcel(){
  const wb=XLSX.utils.book_new();
  blocks.filter(b=>!b.archived).forEach(block=>{
    const rows=[['','WEEK','DAY','#','WORKOUT','RPE','','','WEIGHT (kg)','','TEMPO','SETS','REPS','DONE','NOTE']];
    block.weeks.forEach(week=>{
      week.days.forEach(day=>{
        day.exercises.forEach((ex,ei)=>{
          const kg=calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
          rows.push(['',ei===0?week.label:'',ei===0?day.name:'',ei+1,ex.workout,ex.rpe,'','',kg?kg.toFixed(1):'','',ex.tempo,ex.sets,ex.reps,ex.done?'V':'',ex.note||'']);
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

// ═══════════════════════════════════════════════
// INIT — runs after DOM is ready
// ═══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded',()=>{

  // Timer skip
  const ts=document.getElementById('timer-skip');
  if(ts)ts.addEventListener('click',()=>{clearInterval(timerInterval);const to=document.getElementById('timer-overlay');if(to)to.classList.add('hidden');});

  // Note modal
  const ns=document.getElementById('note-save');
  if(ns)ns.addEventListener('click',()=>{
    if(!activeNote)return;
    activeNote.ex.note=document.getElementById('note-textarea').value.trim();
    const btn=activeNote.tr.querySelector('.note-btn');
    if(btn){btn.className='note-btn '+(activeNote.ex.note?'has-note':'no-note');btn.textContent=activeNote.ex.note?'📝':'✎';}
    document.getElementById('note-modal').classList.add('hidden');activeNote=null;showToast('Note saved');
  });
  const nc=document.getElementById('note-cancel');
  if(nc)nc.addEventListener('click',()=>{document.getElementById('note-modal').classList.add('hidden');activeNote=null;});

  // Import modal
  document.getElementById('excel-input').addEventListener('change',function(){
    if(!this.files.length)return;
    const reader=new FileReader();
    reader.onload=e=>{
      try{const wb=XLSX.read(e.target.result,{type:'array'});pendingImport=parseExcel(wb,this.files[0].name);
        document.getElementById('import-sub').textContent='Found '+pendingImport.length+' block(s), '+pendingImport.reduce((s,b)=>s+b.weeks.length,0)+' weeks from "'+this.files[0].name+'"';
        document.getElementById('import-preview').innerHTML=pendingImport.map(b=>'<span style="color:var(--acc)">'+b.name+'</span><br>'+b.weeks.map(w=>'  '+w.label+': '+w.days.length+' days').join('<br>')).join('<br><br>');
        document.getElementById('modal-import').classList.remove('hidden');
      }catch(err){showToast('Import failed: '+err.message);}
    };
    reader.readAsArrayBuffer(this.files[0]);this.value='';
  });
  document.getElementById('import-as-prog').addEventListener('click',()=>{
    if(!pendingImport)return;
    pendingImport.forEach(b=>blocks.push(b));renderProgram();
    document.getElementById('modal-import').classList.add('hidden');showToast(pendingImport.length+' block(s) added');pendingImport=null;
  });
  document.getElementById('import-as-log').addEventListener('click',()=>{
    if(!pendingImport)return;
    pendingImport.forEach(b=>{b.archived=true;archiveToLog(b);});renderLog();
    document.getElementById('modal-import').classList.add('hidden');showToast('Saved to Log');pendingImport=null;
  });
  document.getElementById('import-cancel').addEventListener('click',()=>{document.getElementById('modal-import').classList.add('hidden');pendingImport=null;});

  // Group modal
  document.getElementById('btn-group').addEventListener('click',()=>{
    const list=document.getElementById('group-week-list');list.innerHTML='';
    blocks.filter(b=>!b.archived).forEach(block=>block.weeks.forEach(week=>{
      const row=document.createElement('div');row.className='group-week-item';
      row.innerHTML='<div class="sel-check" data-bid="'+block.id+'" data-wid="'+week.id+'"></div>'
        +'<span style="font-size:12px;color:var(--text2)">'+block.name+' → '+week.label+'</span>';
      row.querySelector('.sel-check').addEventListener('click',function(){this.classList.toggle('sel');this.textContent=this.classList.contains('sel')?'✓':'';});
      list.appendChild(row);
    }));
    document.getElementById('modal-group').classList.remove('hidden');
  });
  document.getElementById('group-confirm').addEventListener('click',()=>{
    const sel=[...document.querySelectorAll('.sel-check.sel')].map(el=>({bid:el.dataset.bid,wid:el.dataset.wid}));
    if(!sel.length){showToast('Select at least one week');return;}
    const name=document.getElementById('group-name-in').value||'New Block';
    const nb=makeBlock(name,blocks.length);nb.weeks=[];
    sel.forEach(({bid,wid})=>{
      const block=blocks.find(b=>b.id===bid);if(!block)return;
      const week=block.weeks.find(w=>w.id===wid);if(!week)return;
      nb.weeks.push(JSON.parse(JSON.stringify(week)));
      block.weeks=block.weeks.filter(w=>w.id!==wid);
    });
    blocks=blocks.filter(b=>b.weeks.length>0);blocks.push(nb);
    document.getElementById('modal-group').classList.add('hidden');
    document.getElementById('group-name-in').value='';
    renderProgram();showToast('"'+name+'" created');
  });
  document.getElementById('group-cancel').addEventListener('click',()=>document.getElementById('modal-group').classList.add('hidden'));

  // Confirm modal
  document.getElementById('confirm-ok').addEventListener('click',()=>{
    document.getElementById('modal-confirm').classList.add('hidden');
    if(pendingConfirm){pendingConfirm();pendingConfirm=null;}
  });
  document.getElementById('confirm-cancel').addEventListener('click',()=>{document.getElementById('modal-confirm').classList.add('hidden');pendingConfirm=null;});

  // Settings
  document.getElementById('acc-swatch').addEventListener('click',()=>document.getElementById('acc-color-input').click());
  document.getElementById('acc-color-input').addEventListener('input',e=>{settings.accentColor=e.target.value;applySettings();});
  document.getElementById('timer-duration').addEventListener('input',e=>settings.timerDuration=parseInt(e.target.value)||180);
  document.getElementById('timer-auto').addEventListener('change',e=>settings.timerAuto=e.target.checked);
  document.querySelectorAll('[data-sunit]').forEach(btn=>{
    btn.addEventListener('click',()=>{settings.defaultUnit=btn.dataset.sunit;displayUnit=settings.defaultUnit;applySettings();renderStats();renderProgram();updateCalc();});
  });
  document.getElementById('btn-backup').addEventListener('click',backupToExcel);
  document.getElementById('btn-reset-all').addEventListener('click',()=>confirmAction('Reset ALL data?','Cannot be undone.',()=>{localStorage.clear();location.reload();}));

  // Nav tabs
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

  // Unit seg buttons
  document.querySelectorAll('.seg-btn[data-unit]').forEach(btn=>{
    btn.addEventListener('click',()=>{displayUnit=btn.dataset.unit;settings.defaultUnit=displayUnit;applySettings();renderStats();renderProgram();updateCalc();});
  });

  // Other controls
  document.getElementById('bw-input').addEventListener('input',e=>lifts.bw=parseAsKg(e.target.value));
  document.getElementById('prog-title').addEventListener('input',()=>{});
  document.getElementById('btn-add-block').addEventListener('click',()=>{blocks.push(makeBlock('New Block',blocks.length));renderProgram();showToast('Block added');});
  document.getElementById('btn-import').addEventListener('click',()=>document.getElementById('excel-input').click());
  document.getElementById('btn-clear-log').addEventListener('click',()=>confirmAction('Clear all logs?','Cannot be undone.',()=>{localStorage.removeItem(LOG_KEY);renderLog();}));
  ['c1rm','crpe','creps'].forEach(id=>document.getElementById(id).addEventListener('input',updateCalc));
  document.getElementById('fab').addEventListener('click',()=>{
    blocks.forEach(b=>b.weeks.forEach(w=>w.days.forEach(d=>d.exercises.forEach(e=>{if(e.workout)exNames.add(e.workout);}))));
    saveAll();showToast('Saved ✓');
  });

  // Service worker
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}

  // Boot
  loadAll();
  applySettings();
  if(!blocks.length)blocks.push(makeBlock('My Program',0));
  renderProgram();
  renderStats();
});
