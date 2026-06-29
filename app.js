// ═══════════════════════════════════════════════
// TATELIFT — Workout Tracker v2
// ═══════════════════════════════════════════════

const SUPA_URL='https://qgweaaesbqzpsxvawxet.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd2VhYWVzYnF6cHN4dmF3eGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDkxOTMsImV4cCI6MjA5NzkyNTE5M30.F3w8uP92Bm1CTIaBCJR5ebbERX1QDz2N8XtZIwrHuWE';

async function supaLoad(){
  try{
    const res=await fetch(SUPA_URL+'/rest/v1/tatelift_data?id=eq.main&select=*',{headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}});
    if(!res.ok)return false;
    const data=await res.json();
    if(data&&data[0]){
      const cb=data[0].blocks,cl=data[0].lifts,cs=data[0].settings,cu=data[0].updated_at;
      const ls=localStorage.getItem('tl_last_saved');
      const newer=!ls||(cu&&new Date(cu)>new Date(ls));
      if(cb&&cb.length&&newer)blocks=cb;
      if(cl&&Object.keys(cl||{}).length&&newer)lifts=cl;
      if(cs&&Object.keys(cs||{}).length)settings=Object.assign({},settings,cs);
      migBlocks();
      return true;
    }
  }catch(e){console.warn('Supabase load failed:',e);}
  return false;
}

async function supaSave(){
  try{
    const res=await fetch(SUPA_URL+'/rest/v1/tatelift_data?id=eq.main',{
      method:'PATCH',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({blocks,lifts,settings,updated_at:new Date().toISOString()})
    });
    return res.ok;
  }catch(e){return false;}
}

const AUTO_BACKUP_KEY='tl_last_auto_backup';
async function autoBackup(){
  const last=localStorage.getItem(AUTO_BACKUP_KEY);
  if(last&&new Date(last).toDateString()===new Date().toDateString())return;
  if(!blocks.length)return;
  try{
    const res=await fetch(SUPA_URL+'/rest/v1/tatelift_backups',{
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({blocks,lifts,backed_up_at:new Date().toISOString()})
    });
    if(res.ok)localStorage.setItem(AUTO_BACKUP_KEY,new Date().toISOString());
  }catch(e){}
}

// ── Constants ─────────────────────────────────
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
const SAVE_KEY='tl_prog_v4',LOG_KEY='tl_log_v4',LIFT_KEY='tl_lifts_v4',SETTINGS_KEY='tl_settings_v4';

// ── State ─────────────────────────────────────
let displayUnit='kg';
let lifts={current:{SQ:270,BP:165,DL:265,OHP:70},target:{SQ:320,BP:185,DL:320,OHP:null},bw:102,dots:411.35};
let blocks=[];
let settings={accentColor:'#e06c00',timerDuration:180,timerAuto:true,defaultUnit:'kg'};
let pendingConfirm=null,activeNote=null;
let timerInterval=null,timerRemaining=0,timerTotal=0;
let undoStack=[];
let currentDetailEx=null; // exercise detail view state
let exNames=new Set(['Squat','Bench Press','Deadlift','OHP','Belt Squat','Larson Bench Press','Romanian Deadlift','Single Leg RDL','Copenhagen Plank','Ab Wheel','Cable Crunch','Cable Tricep Extension','Side Lateral Raise','Rear Delt Fly','Machine Press','Back Extension','BSS','Pause Squat','Close Grip Bench','Incline Bench','Leg Press','Hip Thrust','Good Morning','Face Pull','Tricep Pushdown','Bicep Curl','Pause Deadlift','Deficit Deadlift','Box Squat','Front Squat','SQ','BP','DL']);

let _id=Date.now();
const uid=()=>'i'+(++_id);
const toDisplay=kg=>displayUnit==='kg'?kg:kg*KG2LB;
const toKg=v=>displayUnit==='kg'?v:v/KG2LB;
const fmt=kg=>kg==null||isNaN(kg)?'—':Math.round(toDisplay(kg))+' '+displayUnit;
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

function showToast(msg,dur=2200){
  const t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.classList.add('show');
  clearTimeout(window._toastT);
  window._toastT=setTimeout(()=>t.classList.remove('show'),dur);
}

function confirmAction(title,sub,onOk){
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-sub').textContent=sub;
  pendingConfirm=onOk;
  document.getElementById('modal-confirm').classList.remove('hidden');
}

// ── Undo ──────────────────────────────────────
function pushUndo(){
  undoStack.push(JSON.stringify(blocks));
  if(undoStack.length>20)undoStack.shift();
  const btn=document.getElementById('btn-undo');
  if(btn)btn.style.opacity='1';
}
function undo(){
  if(!undoStack.length){showToast('Nothing to undo');return;}
  blocks=JSON.parse(undoStack.pop());
  if(!undoStack.length){const btn=document.getElementById('btn-undo');if(btn)btn.style.opacity='.3';}
  renderProgram();showToast('Undo ✓');
}

// ── Settings ──────────────────────────────────
function applySettings(){
  document.documentElement.style.setProperty('--acc',settings.accentColor);
  const hex=settings.accentColor.replace('#','');
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  document.documentElement.style.setProperty('--acc-dim','rgba('+r+','+g+','+b+',0.18)');
  document.documentElement.style.setProperty('--acc-solid','rgba('+r+','+g+','+b+',1)');
  const lum=0.299*r+0.587*g+0.114*b;
  document.documentElement.style.setProperty('--acc-text',lum>128?'#000':'#fff');
  const sw=document.getElementById('acc-swatch');if(sw)sw.style.background=settings.accentColor;
  const ci=document.getElementById('acc-color-input');if(ci)ci.value=settings.accentColor;
  const td=document.getElementById('timer-duration');if(td)td.value=settings.timerDuration;
  const ta=document.getElementById('timer-auto');if(ta)ta.checked=settings.timerAuto;
  displayUnit=settings.defaultUnit||'kg';
  document.querySelectorAll('.seg-btn[data-unit]').forEach(b=>b.classList.toggle('active',b.dataset.unit===displayUnit));
  document.querySelectorAll('[data-sunit]').forEach(b=>b.classList.toggle('active',b.dataset.sunit===displayUnit));
  const bwul=document.getElementById('bw-ul');if(bwul)bwul.textContent=displayUnit;
}

// ── Persistence ───────────────────────────────
function saveAll(){
  localStorage.setItem(SAVE_KEY,JSON.stringify({blocks,title:document.getElementById('prog-title')?.value||''}));
  localStorage.setItem(LIFT_KEY,JSON.stringify({lifts,displayUnit}));
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
  localStorage.setItem('tl_last_saved',new Date().toISOString());
  supaSave();
}

function migBlocks(){
  blocks.forEach(b=>{
    if(!b.id)b.id=uid();
    (b.weeks||[]).forEach(w=>{
      if(!w.id)w.id=uid();
      (w.days||[]).forEach(d=>{
        if(!d.id)d.id=uid();
        if(d.archived===undefined)d.archived=false;
        (d.exercises||[]).forEach(e=>{
          if(!e.id)e.id=uid();
          if(e.note===undefined)e.note='';
          if(e.setsCompleted===undefined)e.setsCompleted=0;
          if(e.setReps===undefined)e.setReps=[];
          if(e.weightKg===undefined)e.weightKg=null;
        });
      });
    });
  });
}

function loadAll(){
  try{const s=JSON.parse(localStorage.getItem(SETTINGS_KEY));if(s)settings=Object.assign({},settings,s);}catch{}
  try{const p=JSON.parse(localStorage.getItem(SAVE_KEY));if(p){blocks=p.blocks||[];const pt=document.getElementById('prog-title');if(pt)pt.value=p.title||'';}}catch{}
  try{const l=JSON.parse(localStorage.getItem(LIFT_KEY));if(l)lifts=l.lifts||lifts;}catch{}
  migBlocks();
}

// ── Default structures ────────────────────────
const makeEx=()=>({id:uid(),workout:'',rpe:'',tempo:'',sets:'',reps:'',done:false,note:'',setsCompleted:0,setReps:[],weightKg:null});
const makeDay=name=>({id:uid(),name:name||'Day 1',date:'',done:false,archived:false,exercises:[0,1,2,3,4].map(makeEx)});
const makeWeek=n=>({id:uid(),label:'Week '+n,date:'',done:false,days:DAY_NAMES.map(makeDay)});
const makeBlock=(name,ci)=>({id:uid(),name:name||'New Block',color:BLOCK_COLS[ci%BLOCK_COLS.length],archived:false,weeks:[makeWeek(1)]});

// ── Complete propagation ──────────────────────
function markDayExercises(day,done){day.exercises.forEach(e=>e.done=done);}
function markWeekDays(week,done){week.days.forEach(d=>{d.done=done;markDayExercises(d,done);});}
function getDayState(day){
  if(!day.exercises.length)return'none';
  if(day.exercises.every(e=>e.done))return'done';
  if(day.exercises.some(e=>e.done))return'partial';
  return'none';
}
function getWeekDoneState(week){
  const active=week.days.filter(d=>!d.archived);
  if(!active.length)return'none';
  if(active.every(d=>d.done))return'done';
  if(active.some(d=>d.done||d.exercises.some(e=>e.done)))return'partial';
  return'none';
}

function findCurrentDayId(){
  let allDays=[];
  blocks.filter(b=>!b.archived).forEach(b=>b.weeks.forEach(w=>w.days.filter(d=>!d.archived).forEach(d=>allDays.push(d))));
  let lastDoneIdx=-1;
  allDays.forEach((d,i)=>{if(d.done)lastDoneIdx=i;});
  if(lastDoneIdx>=0&&lastDoneIdx+1<allDays.length)return allDays[lastDoneIdx+1].id;
  if(allDays.length)return allDays[0].id;
  return null;
}

// ── Timer sound ───────────────────────────────
function playTimerSound(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    [0,150,300].forEach(delay=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=880;osc.type='sine';
      gain.gain.setValueAtTime(0.4,ctx.currentTime+delay/1000);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay/1000+0.3);
      osc.start(ctx.currentTime+delay/1000);
      osc.stop(ctx.currentTime+delay/1000+0.3);
    });
  }catch(e){}
}

// ── Timer ─────────────────────────────────────
const circumference=2*Math.PI*90;
function startTimer(exerciseName){
  clearInterval(timerInterval);
  timerTotal=settings.timerDuration;timerRemaining=timerTotal;
  const tl=document.getElementById('timer-label');if(tl)tl.textContent='Rest — '+(exerciseName||'');
  const to=document.getElementById('timer-overlay');if(to)to.classList.remove('hidden');
  updateTimerDisplay();
  timerInterval=setInterval(()=>{
    timerRemaining--;updateTimerDisplay();
    if(timerRemaining<=0){
      clearInterval(timerInterval);
      const to2=document.getElementById('timer-overlay');if(to2)to2.classList.add('hidden');
      playTimerSound();
      showToast('Rest done! 💪');
    }
  },1000);
}
function updateTimerDisplay(){
  const m=Math.floor(timerRemaining/60),s=timerRemaining%60;
  const tn=document.getElementById('timer-num');if(tn)tn.textContent=m+':'+(s<10?'0':'')+s;
  const tc=document.getElementById('timer-circle');
  if(tc)tc.style.strokeDashoffset=circumference*(1-timerRemaining/timerTotal);
}

// ── Note ──────────────────────────────────────
function openNote(ex,title){
  activeNote=ex;
  const nt=document.getElementById('note-title');if(nt)nt.textContent=title||'Note';
  const ta=document.getElementById('note-textarea');if(ta)ta.value=ex.note||'';
  const nm=document.getElementById('note-modal');if(nm)nm.classList.remove('hidden');
  setTimeout(()=>document.getElementById('note-textarea')?.focus(),100);
}

// ── Exercise Detail View ──────────────────────
function openExDetail(ex,day){
  currentDetailEx={ex,day};
  const overlay=document.getElementById('ex-detail-overlay');
  if(!overlay)return;

  // Fill in values
  overlay.querySelector('#det-name').value=ex.workout||'';
  overlay.querySelector('#det-rpe').value=ex.rpe||'';
  overlay.querySelector('#det-tempo').value=ex.tempo||'';
  overlay.querySelector('#det-sets').value=ex.sets||'';
  overlay.querySelector('#det-reps').value=ex.reps||'';

  // Weight - show actual weight or calculated
  const wIn=overlay.querySelector('#det-weight');
  if(ex.weightKg!=null){
    wIn.value=toDisplay(ex.weightKg).toFixed(1);
  } else {
    const kg=calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
    wIn.value=kg?toDisplay(kg).toFixed(1):'';
  }
  overlay.querySelector('#det-weight-unit').textContent=displayUnit;

  // Note
  overlay.querySelector('#det-note').value=ex.note||'';

  // Render set reps tracker
  renderSetRepsTracker(ex,overlay);

  // Check box
  const cb=overlay.querySelector('#det-check');
  cb.className='det-check-box'+(ex.done?' done':'');
  cb.textContent=ex.done?'✓':'';

  overlay.classList.add('open');
  // Push history state for back button
  history.pushState({exDetail:true},'');
}

function closeExDetail(){
  const overlay=document.getElementById('ex-detail-overlay');
  if(!overlay)return;
  overlay.classList.remove('open');

  // Save any changes back to exercise
  if(currentDetailEx){
    const {ex,day}=currentDetailEx;
    ex.workout=overlay.querySelector('#det-name').value;
    ex.rpe=overlay.querySelector('#det-rpe').value;
    ex.tempo=overlay.querySelector('#det-tempo').value;
    ex.sets=overlay.querySelector('#det-sets').value;
    ex.reps=overlay.querySelector('#det-reps').value;
    ex.note=overlay.querySelector('#det-note').value;
    // Weight
    const wVal=parseFloat(overlay.querySelector('#det-weight').value);
    ex.weightKg=isNaN(wVal)?null:toKg(wVal);
    currentDetailEx=null;
  }
  renderProgram();
}

function renderSetRepsTracker(ex,overlay){
  const container=overlay.querySelector('#det-set-tracker');
  if(!container)return;
  const numSets=parseInt(ex.sets)||0;
  if(numSets<1){container.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:8px">Set sets count to enable tracker</div>';return;}

  // Ensure setReps array is right length
  if(!ex.setReps)ex.setReps=[];
  while(ex.setReps.length<numSets)ex.setReps.push({reps:'',done:false});

  container.innerHTML='';
  const planned=ex.reps||'';
  ex.setReps.slice(0,numSets).forEach((setData,i)=>{
    const row=document.createElement('div');
    row.className='set-row'+(setData.done?' set-row-done':'');
    row.innerHTML=
      '<span class="set-row-num">Set '+(i+1)+'</span>'
      +'<div class="set-row-reps">'
        +'<input class="set-reps-in" type="number" inputmode="numeric" value="'+(setData.reps||planned)+'" placeholder="'+(planned||'Reps')+'"/>'
        +'<span class="set-reps-lbl">reps</span>'
      +'</div>'
      +'<div class="set-row-check'+(setData.done?' done':'')+'" data-si="'+i+'">'+( setData.done?'✓':'')+'</div>';

    row.querySelector('.set-reps-in').addEventListener('input',e=>{
      ex.setReps[i].reps=e.target.value;
    });
    row.querySelector('.set-row-check').addEventListener('click',function(){
      ex.setReps[i].done=!ex.setReps[i].done;
      this.classList.toggle('done',ex.setReps[i].done);
      this.textContent=ex.setReps[i].done?'✓':'';
      row.classList.toggle('set-row-done',ex.setReps[i].done);
      // Update setsCompleted
      ex.setsCompleted=ex.setReps.filter(s=>s.done).length;
      // Timer
      const prevDone=ex.setReps[i].done;
      if(prevDone&&ex.setsCompleted<numSets&&settings.timerAuto){
        startTimer(ex.workout);
      }
      // Auto complete exercise
      if(ex.setsCompleted>=numSets){
        ex.done=true;
        const cb=overlay.querySelector('#det-check');
        if(cb){cb.className='det-check-box done';cb.textContent='✓';}
      }
    });
    container.appendChild(row);
  });
}

// ── Render Program ────────────────────────────
function renderProgram(){
  const c=document.getElementById('blocks-container');if(!c)return;
  c.innerHTML='';
  const curId=findCurrentDayId();
  blocks.filter(b=>!b.archived).forEach((block,bi)=>c.appendChild(renderBlock(block,bi,curId)));
}

function renderBlock(block,bi,curId){
  const wrap=document.createElement('div');wrap.className='blk-card';wrap.dataset.bid=block.id;

  // Header
  const hdr=document.createElement('div');hdr.className='blk-header';
  const nameRow=document.createElement('div');nameRow.className='blk-name-row';
  nameRow.innerHTML='<input class="blk-name-in" value="'+(block.name||'')+'" placeholder="Block name"/>'
    +'<span class="blk-meta">'+block.weeks.length+' weeks</span>';
  const btnRow=document.createElement('div');btnRow.className='blk-btn-row';
  btnRow.innerHTML='<button class="pb acc" data-a="add-week">+Week</button>'
    +'<button class="pb" data-a="rem-week">−Week</button>'
    +'<button class="pb" data-a="copy">Copy</button>'
    +'<button class="pb" data-a="archive">Archive</button>'
    +'<button class="pb red" data-a="delete">Delete</button>';
  nameRow.querySelector('.blk-name-in').addEventListener('input',e=>block.name=e.target.value);
  btnRow.querySelectorAll('[data-a]').forEach(btn=>btn.addEventListener('click',()=>blockAction(btn.dataset.a,block.id)));
  hdr.appendChild(nameRow);hdr.appendChild(btnRow);
  wrap.appendChild(hdr);

  // Weeks
  block.weeks.forEach((w,wi)=>wrap.appendChild(renderWeek(w,block,wi,curId)));
  return wrap;
}

function renderWeek(week,block,wi,curId){
  const wrap=document.createElement('div');wrap.className='wk-card';wrap.dataset.wid=week.id;
  const state=getWeekDoneState(week);
  const activeDays=week.days.filter(d=>!d.archived);
  const doneDays=activeDays.filter(d=>d.done).length;

  const hdr=document.createElement('div');hdr.className='wk-header';
  hdr.innerHTML='<span class="wk-lbl">Week '+(wi+1)+'</span>'
    +'<span class="wk-meta">'+doneDays+'/'+activeDays.length+'</span>'
    +'<div class="wk-btns">'
      +'<button class="pb sm" data-a="add-day">+Day</button>'
      +'<button class="pb sm" data-a="rem-day">−Day</button>'
      +'<button class="pb sm red" data-a="del-week">✕</button>'
      +'<div class="check-box'+(state==='done'?' done':state==='partial'?' partial':'')+'" data-a="toggle-week">'+(state==='done'?'✓':state==='partial'?'–':'')+'</div>'
    +'</div>';
  hdr.querySelectorAll('[data-a]').forEach(el=>el.addEventListener('click',()=>weekAction(el.dataset.a,block,week,el)));
  wrap.appendChild(hdr);

  // Days
  const daysWrap=document.createElement('div');daysWrap.className='wk-days';
  week.days.forEach((d,di)=>daysWrap.appendChild(renderDay(d,block,week,di,curId)));
  wrap.appendChild(daysWrap);
  return wrap;
}

function renderDay(day,block,week,di,curId){
  const isCurrent=day.id===curId;
  const state=getDayState(day);
  const isDone=state==='done';
  const isArchived=state==='archived';

  const card=document.createElement('div');
  card.className='day-card'
    +(isCurrent?' day-current':'')
    +(isDone?' day-done':'')
    +(isArchived?' day-archived':'');
  card.dataset.did=day.id;

  // Day header
  const hdr=document.createElement('div');hdr.className='day-header';
  hdr.innerHTML='<span class="day-name">'+day.name+'</span>'
    +'<div class="day-hdr-right">'
      +(isArchived?'<span class="day-arc-badge">Archived</span>':'')
      +'<input type="date" class="day-date-in" value="'+(day.date||'')+'" onclick="event.stopPropagation()"/>'
      +'<div class="day-actions">'
        +'<div class="check-box sm'+(isDone?' done':state==='partial'?' partial':'')+'" data-a="toggle" onclick="event.stopPropagation()">'+(isDone?'✓':state==='partial'?'–':'')+'</div>'
        +'<button class="day-menu-btn" onclick="event.stopPropagation()" data-did="'+day.id+'">⋮</button>'
      +'</div>'
    +'</div>';

  hdr.querySelector('.day-date-in').addEventListener('change',e=>{day.date=e.target.value;event.stopPropagation();});
  hdr.querySelector('[data-a="toggle"]').addEventListener('click',e=>{
    e.stopPropagation();
    pushUndo();day.done=!day.done;markDayExercises(day,day.done);renderProgram();
  });
  hdr.querySelector('.day-menu-btn').addEventListener('click',e=>{
    e.stopPropagation();
    openDayMenu(day,block,week,e.target);
  });
  card.appendChild(hdr);

  // Exercise summary rows (collapsed view)
  if(!isArchived){
    const exWrap=document.createElement('div');exWrap.className='day-ex-list';
    const exToShow=day.exercises.filter(e=>e.workout);
    if(!exToShow.length){
      const empty=document.createElement('div');empty.className='day-empty';empty.textContent='No exercises — tap + to add';
      exWrap.appendChild(empty);
    }
    exToShow.forEach(ex=>{
      const row=document.createElement('div');
      row.className='ex-summary-row'+(ex.done?' ex-summary-done':'');
      const kg=ex.weightKg!=null?ex.weightKg:calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
      const wStr=kg?fmt(kg):'—';
      const setsStr=ex.sets?(ex.setsCompleted||0)+'/'+ex.sets+' sets':'';
      row.innerHTML='<div class="ex-sum-left">'
          +'<div class="ex-sum-name">'+(ex.done?'<span class="ex-done-check">✓</span> ':'')+ex.workout+'</div>'
          +'<div class="ex-sum-meta">'+(ex.reps?ex.reps+' reps':'')+(setsStr?' · '+setsStr:'')+'</div>'
        +'</div>'
        +'<div class="ex-sum-right">'
          +'<div class="ex-sum-weight">'+wStr+'</div>'
          +'<span class="ex-sum-arrow">›</span>'
        +'</div>';
      row.addEventListener('click',()=>openExDetail(ex,day));
      exWrap.appendChild(row);
    });

    // Add exercise button
    const addBtn=document.createElement('button');addBtn.className='day-add-ex-btn';addBtn.textContent='+ Add exercise';
    addBtn.addEventListener('click',()=>{
      pushUndo();
      const ex=makeEx();day.exercises.push(ex);
      renderProgram();
      // Auto open detail
      setTimeout(()=>openExDetail(ex,day),50);
    });
    exWrap.appendChild(addBtn);
    card.appendChild(exWrap);
  }

  return card;
}

// ── Day Menu ──────────────────────────────────
function openDayMenu(day,block,week,btn){
  // Remove existing menu
  document.querySelectorAll('.day-ctx-menu').forEach(m=>m.remove());
  const menu=document.createElement('div');menu.className='day-ctx-menu';
  const items=[
    {label:'Archive Day',action:()=>{
      pushUndo();
      // Archive day to log
      archiveDayToLog(day,block,week);
      // Remove from week
      week.days=week.days.filter(d=>d.id!==day.id);
      renderProgram();
      renderLog();
      showToast('Day archived to Log');
    }},
    {label:'Move to next week',action:()=>{
      for(const blk of blocks.filter(b=>!b.archived)){
        for(let wi=0;wi<blk.weeks.length;wi++){
          const wk=blk.weeks[wi];const di=wk.days.indexOf(day);
          if(di>=0){
            pushUndo();wk.days.splice(di,1);
            if(wi+1<blk.weeks.length){blk.weeks[wi+1].days.push(day);}
            else{const nw=makeWeek(blk.weeks.length+1);nw.days=[day];blk.weeks.push(nw);}
            renderProgram();showToast('Moved to next week');return;
          }
        }
      }
    }},
    {label:'Delete day',action:()=>{
      confirmAction('Delete "'+day.name+'"?','Cannot be undone.',()=>{
        pushUndo();week.days=week.days.filter(d=>d.id!==day.id);renderProgram();
      });
    },red:true},
  ];
  items.forEach(item=>{
    const el=document.createElement('div');el.className='ctx-item'+(item.red?' red':'');
    el.textContent=item.label;
    el.addEventListener('click',()=>{menu.remove();item.action();});
    menu.appendChild(el);
  });
  document.body.appendChild(menu);
  const rect=btn.getBoundingClientRect();
  menu.style.top=(rect.bottom+6)+'px';
  menu.style.right=(window.innerWidth-rect.right)+'px';
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),0);
}

// ── Block/Week actions ────────────────────────
function blockAction(action,bid){
  const block=blocks.find(b=>b.id===bid);if(!block)return;
  if(action==='add-week'){pushUndo();block.weeks.push(makeWeek(block.weeks.length+1));renderProgram();}
  else if(action==='rem-week'){if(block.weeks.length>1){pushUndo();block.weeks.pop();renderProgram();}}
  else if(action==='copy'){
    const c=JSON.parse(JSON.stringify(block));c.id=uid();c.name=block.name+' (copy)';
    c.color=BLOCK_COLS[(BLOCK_COLS.indexOf(block.color)+1)%BLOCK_COLS.length];
    c.weeks.forEach(w=>{w.id=uid();w.days.forEach(d=>{d.id=uid();d.exercises.forEach(e=>e.id=uid());});});
    blocks.splice(blocks.indexOf(block)+1,0,c);renderProgram();showToast('Copied');
  }
  else if(action==='archive'){confirmAction('Archive "'+block.name+'"?','Moves to Log.',()=>{pushUndo();block.archived=true;archiveToLog(block);renderProgram();renderLog();showToast('Archived');});}
  else if(action==='delete'){confirmAction('Delete "'+block.name+'"?','Cannot be undone.',()=>{pushUndo();blocks=blocks.filter(b=>b.id!==bid);renderProgram();showToast('Deleted');});}
}

function weekAction(action,block,week,el){
  if(action==='add-day'){pushUndo();week.days.push(makeDay('Day '+(week.days.length+1)));renderProgram();}
  else if(action==='rem-day'){if(week.days.length>1){pushUndo();week.days.pop();renderProgram();}}
  else if(action==='del-week'){confirmAction('Delete week?','All exercises will be removed.',()=>{pushUndo();block.weeks=block.weeks.filter(w=>w.id!==week.id);renderProgram();showToast('Deleted');});}
  else if(action==='toggle-week'){pushUndo();week.done=!week.done;markWeekDays(week,week.done);renderProgram();}
}

// ── Log ───────────────────────────────────────
function archiveDayToLog(day,block,week){
  let log=[];try{log=JSON.parse(localStorage.getItem(LOG_KEY))||[];}catch{}
  // Group by block+week — find existing entry
  const groupKey=block.id+'_'+week.id;
  const existing=log.find(e=>e.type==='day-group'&&e.groupKey===groupKey);
  const dayEntry={
    id:day.id,
    dayName:day.name,
    date:day.date||'',
    exercises:day.exercises,
    archivedAt:new Date().toLocaleString('ko-KR'),
  };
  if(existing){
    existing.days=existing.days||[];
    existing.days.push(dayEntry);
    existing.archivedAt=new Date().toLocaleString('ko-KR');
  } else {
    log.unshift({
      type:'day-group',
      groupKey,
      blockName:block.name,
      weekLabel:week.label,
      id:uid(),
      archivedAt:new Date().toLocaleString('ko-KR'),
      days:[dayEntry],
    });
  }
  localStorage.setItem(LOG_KEY,JSON.stringify(log.slice(0,200)));
}

function archiveToLog(block){
  let log=[];try{log=JSON.parse(localStorage.getItem(LOG_KEY))||[];}catch{}
  log.unshift({id:block.id,name:block.name,archivedAt:new Date().toLocaleString('ko-KR'),
    summary:block.weeks.flatMap(w=>w.days.flatMap(d=>d.exercises.filter(e=>e.workout).map(e=>e.workout+' '+(e.sets||'?')+'x'+(e.reps||'?')+'@'+(e.rpe||'?')))).slice(0,12),
    blockData:JSON.parse(JSON.stringify(block))});
  localStorage.setItem(LOG_KEY,JSON.stringify(log.slice(0,100)));
}

function renderLog(){
  const list=document.getElementById('log-list');if(!list)return;
  let log=[];try{log=JSON.parse(localStorage.getItem(LOG_KEY))||[];}catch{}
  if(!log.length){list.innerHTML='<div style="text-align:center;color:var(--text3);padding:50px 0;font-size:12px">No archived items yet</div>';return;}
  list.innerHTML='';
  log.forEach((entry,i)=>{
    const card=document.createElement('div');card.className='log-card';
    if(entry.type==='day-group'){
      // Day group card
      const days=entry.days||[];
      card.innerHTML='<div class="log-card-hdr">'
        +'<div><div class="log-title">'+entry.blockName+' — '+entry.weekLabel+'</div>'
        +'<div style="font-size:10px;color:var(--acc);margin-top:2px">'+days.length+' day'+(days.length!==1?'s':'')+'</div></div>'
        +'<div class="log-date">'+(entry.archivedAt||'')+'</div>'
        +'</div>'
        +'<div style="margin-bottom:8px">'
          +days.map(d=>'<div style="padding:6px 0;border-bottom:1px solid var(--border)">'
            +'<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:3px">'+d.dayName+(d.date?' <span style="font-size:10px;color:var(--text3);font-family:var(--fm)">'+d.date+'</span>':'')+'</div>'
            +'<div style="display:flex;flex-wrap:wrap;gap:3px">'
              +d.exercises.filter(e=>e.workout).map(e=>'<span class="log-chip">'+(e.done?'✓ ':'')+e.workout+(e.sets&&e.reps?' '+e.sets+'×'+e.reps:'')+'</span>').join('')
            +'</div>'
          +'</div>').join('')
        +'</div>'
        +'<div class="log-actions">'
        +'<button class="pb acc" data-i="'+i+'" data-a="restore-days">Restore</button>'
        +'<button class="pb red" data-i="'+i+'" data-a="delete">Delete</button>'
        +'</div>';
    } else {
      // Block card
      card.innerHTML='<div class="log-card-hdr"><div class="log-title">'+(entry.name||'Block')+'</div><div class="log-date">'+(entry.archivedAt||'')+'</div></div>'
        +'<div class="log-chips">'+(entry.summary||[]).map(t=>'<span class="log-chip">'+t+'</span>').join('')+'</div>'
        +'<div class="log-actions">'
        +'<button class="pb acc" data-i="'+i+'" data-a="unarchive">Restore</button>'
        +'<button class="pb red" data-i="'+i+'" data-a="delete">Delete</button>'
        +'</div>';
    }
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
    localStorage.setItem(LOG_KEY,JSON.stringify(log));renderProgram();renderLog();showToast('Restored');
  }else if(action==='restore-days'){
    // Restore days back to their block+week
    const days=entry.days||[];
    const groupKey=entry.groupKey||'';
    const [blockId,weekId]=groupKey.split('_');
    let targetBlock=blocks.find(b=>b.id===blockId);
    let targetWeek=targetBlock?.weeks.find(w=>w.id===weekId);
    if(!targetBlock){
      // Block gone — create new block
      targetBlock=makeBlock(entry.blockName||'Restored',blocks.length);
      targetBlock.weeks=[];
      blocks.push(targetBlock);
    }
    if(!targetWeek){
      targetWeek={id:weekId||uid(),label:entry.weekLabel||'Week 1',date:'',done:false,days:[]};
      targetBlock.weeks.push(targetWeek);
    }
    days.forEach(d=>{
      const day={id:d.id||uid(),name:d.dayName,date:d.date||'',done:false,archived:false,exercises:d.exercises||[]};
      migBlocks();
      targetWeek.days.push(day);
    });
    log.splice(i,1);
    localStorage.setItem(LOG_KEY,JSON.stringify(log));
    renderProgram();renderLog();showToast('Days restored!');
  }else if(action==='delete'){
    confirmAction('Delete from Log?','Cannot be undone.',()=>{log.splice(i,1);localStorage.setItem(LOG_KEY,JSON.stringify(log));renderLog();showToast('Deleted');});
  }
}

// ── Stats ─────────────────────────────────────
function renderStats(){
  document.querySelectorAll('.seg-btn[data-unit]').forEach(b=>b.classList.toggle('active',b.dataset.unit===displayUnit));
  const bwul=document.getElementById('bw-ul');if(bwul)bwul.textContent=displayUnit;
  const bwI=document.getElementById('bw-input');if(bwI)bwI.value=lifts.bw?toDisplay(lifts.bw).toFixed(1):'';
  renderLiftGrid('lift-grid-cur','current');renderLiftGrid('lift-grid-tgt','target');updateTotals();
}
function renderLiftGrid(id,type){
  const g=document.getElementById(id);if(!g)return;g.innerHTML='';
  ['SQ','BP','DL','OHP'].forEach(lift=>{
    const kg=lifts[type][lift];
    const pct=type==='target'&&lifts.current[lift]&&lifts.target[lift]?Math.min(100,(lifts.current[lift]/lifts.target[lift])*100):null;
    const div=document.createElement('div');div.className='lift-card';
    div.innerHTML='<div class="lift-card-name">'+lift+'</div>'
      +'<div class="lift-val-row"><input class="lift-in" type="number" step="0.5" value="'+(kg?toDisplay(kg).toFixed(1):'')+'" placeholder="—"/><span class="lift-ul">'+displayUnit+'</span></div>'
      +'<div class="lift-alt" id="la-'+type+'-'+lift+'">'+(kg?(displayUnit==='kg'?'≈ '+(kg*KG2LB).toFixed(1)+' lb':'≈ '+(kg/KG2LB).toFixed(1)+' kg'):'&nbsp;')+'</div>'
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
  const tc=document.getElementById('tot-cur');if(tc)tc.textContent=cur?fmt(cur):'—';
  const tt=document.getElementById('tot-tgt');if(tt)tt.textContent=tgt?fmt(tgt):'—';
  const td=document.getElementById('tot-dots');if(td)td.textContent=lifts.dots?lifts.dots.toFixed(2):'—';
}

// ── RPE ───────────────────────────────────────
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
  cr.textContent=Math.round(toDisplay((displayUnit==='kg'?orm:orm/KG2LB)*f))+' '+displayUnit;
}

// ── Calendar ──────────────────────────────────
let calYear=new Date().getFullYear(),calMonth=new Date().getMonth(),calSelected=null;
function getWorkedOutDates(){
  const map={};
  blocks.forEach(block=>{block.weeks.forEach(week=>{week.days.forEach(day=>{
    if(day.date&&day.exercises.some(e=>e.done)){
      if(!map[day.date])map[day.date]=[];
      map[day.date].push({blockName:block.name,weekLabel:week.label,dayName:day.name,exercises:day.exercises});
    }
  });});});
  return map;
}
function renderCalendar(){
  const grid=document.getElementById('cal-grid'),label=document.getElementById('cal-month-label');if(!grid||!label)return;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=months[calMonth]+' '+calYear;
  const workedDates=getWorkedOutDates();
  const todayStr=new Date().toISOString().slice(0,10);
  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const daysInPrev=new Date(calYear,calMonth,0).getDate();
  let html='<div class="cal-weekdays">';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>html+='<div class="cal-weekday">'+d+'</div>');
  html+='</div><div class="cal-days">';
  for(let i=firstDay-1;i>=0;i--)html+='<div class="cal-day other-month"><span class="cal-day-num">'+(daysInPrev-i)+'</span></div>';
  for(let d=1;d<=daysInMonth;d++){
    const ds=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    let cls='cal-day';if(ds===todayStr)cls+=' today';if(workedDates[ds])cls+=' worked-out';if(ds===calSelected)cls+=' selected';
    html+='<div class="'+cls+'" data-date="'+ds+'"><span class="cal-day-num">'+d+'</span>'+(workedDates[ds]&&ds!==calSelected?'<div class="cal-day-dot"></div>':'')+'</div>';
  }
  const rem=(7-((firstDay+daysInMonth)%7))%7;
  for(let d=1;d<=rem;d++)html+='<div class="cal-day other-month"><span class="cal-day-num">'+d+'</span></div>';
  html+='</div>';
  grid.innerHTML=html;
  grid.querySelectorAll('.cal-day[data-date]').forEach(el=>{
    el.addEventListener('click',()=>{calSelected=el.dataset.date;renderCalendar();showCalDetail(el.dataset.date,workedDates[el.dataset.date]);});
  });
}
function showCalDetail(dateStr,entries){
  const detail=document.getElementById('cal-detail'),title=document.getElementById('cal-detail-title'),dc=document.getElementById('cal-detail-content');
  if(!detail||!title||!dc)return;
  const d=new Date(dateStr+'T12:00:00');
  title.textContent=d.toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric'});
  if(!entries||!entries.length){dc.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px">No workouts logged</div>';}
  else{
    dc.innerHTML=entries.map(e=>{
      const done=e.exercises.filter(ex=>ex.done&&ex.workout).length,total=e.exercises.filter(ex=>ex.workout).length;
      return '<div style="margin-bottom:10px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        +'<div style="font-size:12px;color:var(--acc);font-weight:700">'+e.dayName+'</div>'
        +'<div style="font-size:10px;color:var(--text3)">'+e.blockName+'</div>'
        +'<div style="margin-left:auto;font-family:var(--fm);font-size:10px;color:var(--text3)">'+done+'/'+total+'</div></div>'
        +e.exercises.filter(ex=>ex.workout).map(ex=>{
          const kg=ex.weightKg!=null?ex.weightKg:calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
          return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">'
            +'<div style="width:18px;height:18px;border-radius:4px;background:'+(ex.done?'var(--acc)':'var(--s3)')+';border:1px solid '+(ex.done?'var(--acc)':'var(--border)')+';display:flex;align-items:center;justify-content:center;font-size:9px;color:'+(ex.done?'var(--acc-text)':'transparent')+'">'+(ex.done?'✓':'')+'</div>'
            +'<div style="flex:1"><div style="font-size:12px;color:'+(ex.done?'var(--text)':'var(--text3)')+'">'+ex.workout+'</div>'
            +(ex.sets&&ex.reps?'<div style="font-size:10px;color:var(--text3);font-family:var(--fm)">'+ex.sets+'×'+ex.reps+(ex.rpe?' @'+ex.rpe:'')+'</div>':'')+'</div>'
            +(kg?'<div style="font-family:var(--fm);font-size:12px;font-weight:700;color:var(--acc)">'+fmt(kg)+'</div>':'')
          +'</div>';
        }).join('')+'</div>';
    }).join('');
  }
  detail.classList.remove('hidden');
}

// ── Excel Import ──────────────────────────────
function parseExcel(wb,filename){
  if(!wb||!wb.SheetNames||!wb.SheetNames.length)return[makeBlock('Imported',0)];
  const skip=['how to use','program rules','rpe scale'];
  const sheets=wb.SheetNames.filter(n=>typeof n==='string'&&!skip.some(s=>n.toLowerCase().includes(s)));
  const result=[];
  (sheets.length?sheets:wb.SheetNames.slice(0,1)).forEach(name=>{
    try{
      const ws=wb.Sheets[name];if(!ws)return;
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});if(!rows.length)return;
      const block=parseSheet(rows,name);if(block)result.push(block);
    }catch(e){console.error(e);}
  });
  return result.length?result:[makeBlock('Imported',0)];
}
function parseSheet(rows,name){
  try{
    const block=makeBlock(name,blocks.length%BLOCK_COLS.length);block.weeks=[];
    let cw=null,cd=null;
    rows.forEach(row=>{
      if(!row||!row.some(v=>v!=null))return;
      const wk=String(row[1]||'').trim(),dy=String(row[2]||'').replace(/\n/g,' ').trim();
      const exNum=row[3],workout=String(row[4]||'').trim();
      const rpe=row[5]!=null?String(row[5]):'',tempo=row[10]!=null?String(row[10]):'';
      const sets=row[11]!=null?String(row[11]):'',reps=row[12]!=null?String(row[12]):'';
      if(wk.toLowerCase().includes('week')&&!wk.toLowerCase().includes('workout')){cw={id:uid(),label:wk,date:'',done:false,days:[]};block.weeks.push(cw);cd=null;}
      if(dy.toLowerCase().includes('day')){cd={id:uid(),name:dy,date:'',done:false,archived:false,exercises:[]};if(!cw){cw={id:uid(),label:'Week 1',date:'',done:false,days:[]};block.weeks.push(cw);}cw.days.push(cd);}
      if(workout&&exNum!=null&&cd){exNames.add(workout);cd.exercises.push({id:uid(),workout,rpe,tempo,sets:String(sets),reps:String(reps),done:false,note:'',setsCompleted:0,setReps:[],weightKg:null});}
    });
    block.weeks=block.weeks.filter(w=>(w.days||[]).some(d=>(d.exercises||[]).length>0));
    block.weeks.forEach(w=>w.days=w.days.filter(d=>(d.exercises||[]).length>0));
    return block.weeks.length?block:null;
  }catch(e){console.error(e);return null;}
}

// ── Backup ────────────────────────────────────
function backupToExcel(silent=false){
  const wb=XLSX.utils.book_new();
  blocks.filter(b=>!b.archived).forEach(block=>{
    const rows=[['','WEEK','DAY','#','WORKOUT','RPE','','','WEIGHT (kg)','','TEMPO','SETS','REPS','DONE','NOTE']];
    block.weeks.forEach(week=>{week.days.forEach(day=>{day.exercises.forEach((ex,ei)=>{
      const kg=ex.weightKg!=null?ex.weightKg:calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
      rows.push(['',ei===0?week.label:'',ei===0?day.name:'',ei+1,ex.workout,ex.rpe,'','',kg?Math.round(kg):'','',ex.tempo,ex.sets,ex.reps,ex.done?'V':'',ex.note||'']);
    });});});
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),block.name.slice(0,31));
  });
  XLSX.writeFile(wb,'TATELIFT_backup_'+new Date().toISOString().slice(0,10)+'.xlsx');
  if(!silent)showToast('Backup downloaded ✓');
}

// ── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  // Timer circle
  const tc=document.getElementById('timer-circle');
  if(tc)tc.style.strokeDasharray=circumference;
  document.getElementById('timer-skip')?.addEventListener('click',()=>{clearInterval(timerInterval);document.getElementById('timer-overlay')?.classList.add('hidden');});

  // Note modal
  document.getElementById('note-save')?.addEventListener('click',()=>{
    if(!activeNote)return;
    activeNote.note=document.getElementById('note-textarea').value.trim();
    document.getElementById('note-modal')?.classList.add('hidden');activeNote=null;showToast('Note saved');
  });
  document.getElementById('note-cancel')?.addEventListener('click',()=>{document.getElementById('note-modal')?.classList.add('hidden');activeNote=null;});

  // Exercise detail overlay
  const detOverlay=document.getElementById('ex-detail-overlay');
  if(detOverlay){
    document.getElementById('det-back')?.addEventListener('click',closeExDetail);
    document.getElementById('det-check')?.addEventListener('click',function(){
      if(!currentDetailEx)return;
      const {ex,day}=currentDetailEx;
      const wasDone=ex.done;
      ex.done=!ex.done;
      this.className='det-check-box'+(ex.done?' done':'');
      this.textContent=ex.done?'✓':'';
      if(ex.done&&!wasDone&&settings.timerAuto)startTimer(ex.workout);
      // Update set reps all to done/undone
      if(ex.setReps)ex.setReps.forEach(s=>s.done=ex.done);
      ex.setsCompleted=ex.done?(parseInt(ex.sets)||0):0;
      renderSetRepsTracker(ex,detOverlay);
    });
    document.getElementById('det-note-btn')?.addEventListener('click',()=>{
      if(!currentDetailEx)return;
      openNote(currentDetailEx.ex,currentDetailEx.ex.workout||'Note');
    });
    // Auto-save fields on input
    ['det-name','det-rpe','det-tempo','det-sets','det-reps','det-weight','det-note'].forEach(id=>{
      document.getElementById(id)?.addEventListener('input',()=>{
        if(!currentDetailEx)return;
        const {ex}=currentDetailEx;
        if(id==='det-name')ex.workout=document.getElementById(id).value;
        if(id==='det-rpe'){ex.rpe=document.getElementById(id).value;}
        if(id==='det-tempo')ex.tempo=document.getElementById(id).value;
        if(id==='det-reps')ex.reps=document.getElementById(id).value;
        if(id==='det-note')ex.note=document.getElementById(id).value;
        if(id==='det-sets'){
          ex.sets=document.getElementById(id).value;
          renderSetRepsTracker(ex,detOverlay);
        }
        if(id==='det-weight'){
          const v=parseFloat(document.getElementById(id).value);
          ex.weightKg=isNaN(v)?null:toKg(v);
        }
        // Refresh weight display
        const wIn=document.getElementById('det-weight');
        const wCalc=document.getElementById('det-weight-calc');
        if(wCalc&&ex.weightKg==null){
          const kg=calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
          wCalc.textContent=kg?'Calculated: '+fmt(kg):'';
        }
      });
    });
  }

  // Import
  document.getElementById('btn-import')?.addEventListener('click',()=>{
    const input=document.createElement('input');input.type='file';input.accept='.xlsx,.xlsm,.xls';
    input.onchange=function(){
      if(!this.files.length)return;
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(e.target.result,{type:'array'});
          const parsed=parseExcel(wb,this.files[0].name);
          window._pendingImport=parsed;
          document.getElementById('import-sub').textContent='Found '+parsed.length+' block(s) from "'+this.files[0].name+'"';
          document.getElementById('import-preview').innerHTML=parsed.map(b=>'<span style="color:var(--acc)">'+b.name+'</span><br>'+b.weeks.map(w=>'  '+w.label+': '+w.days.length+' days').join('<br>')).join('<br><br>');
          document.getElementById('modal-import')?.classList.remove('hidden');
        }catch(err){showToast('Import failed: '+err.message);}
      };
      reader.readAsArrayBuffer(this.files[0]);
    };
    input.click();
  });
  document.getElementById('import-as-prog')?.addEventListener('click',()=>{
    if(!window._pendingImport)return;
    window._pendingImport.forEach(b=>blocks.push(b));renderProgram();
    document.getElementById('modal-import')?.classList.add('hidden');showToast('Added!');window._pendingImport=null;
  });
  document.getElementById('import-as-log')?.addEventListener('click',()=>{
    if(!window._pendingImport)return;
    window._pendingImport.forEach(b=>{b.archived=true;archiveToLog(b);});renderLog();
    document.getElementById('modal-import')?.classList.add('hidden');showToast('Saved to Log');window._pendingImport=null;
  });
  document.getElementById('import-cancel')?.addEventListener('click',()=>{document.getElementById('modal-import')?.classList.add('hidden');window._pendingImport=null;});

  // Confirm modal
  document.getElementById('confirm-ok')?.addEventListener('click',()=>{document.getElementById('modal-confirm')?.classList.add('hidden');if(pendingConfirm){pendingConfirm();pendingConfirm=null;}});
  document.getElementById('confirm-cancel')?.addEventListener('click',()=>{document.getElementById('modal-confirm')?.classList.add('hidden');pendingConfirm=null;});

  // Settings
  document.getElementById('acc-swatch')?.addEventListener('click',()=>document.getElementById('acc-color-input')?.click());
  document.getElementById('acc-color-input')?.addEventListener('input',e=>{settings.accentColor=e.target.value;applySettings();});
  document.getElementById('timer-duration')?.addEventListener('input',e=>settings.timerDuration=parseInt(e.target.value)||180);
  document.getElementById('timer-auto')?.addEventListener('change',e=>settings.timerAuto=e.target.checked);
  document.querySelectorAll('[data-sunit]').forEach(btn=>{btn.addEventListener('click',()=>{settings.defaultUnit=btn.dataset.sunit;displayUnit=settings.defaultUnit;applySettings();renderStats();renderProgram();});});
  document.getElementById('btn-backup')?.addEventListener('click',()=>backupToExcel(false));
  document.getElementById('btn-reset-all')?.addEventListener('click',()=>confirmAction('Reset ALL data?','Cannot be undone.',()=>{localStorage.clear();location.reload();}));

  // Nav
  document.querySelectorAll('.nav-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('page-'+tab.dataset.page)?.classList.add('active');
      if(tab.dataset.page==='stats')renderStats();
      if(tab.dataset.page==='rpe'){renderRPETable();updateCalc();}
      if(tab.dataset.page==='log')renderLog();
      if(tab.dataset.page==='calendar')renderCalendar();
    });
  });
  document.getElementById('btn-settings')?.addEventListener('click',()=>{
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-settings')?.classList.add('active');
  });
  document.querySelectorAll('.seg-btn[data-unit]').forEach(btn=>{btn.addEventListener('click',()=>{displayUnit=btn.dataset.unit;settings.defaultUnit=displayUnit;applySettings();renderStats();renderProgram();updateCalc();});});
  document.getElementById('bw-input')?.addEventListener('input',e=>lifts.bw=parseAsKg(e.target.value));
  document.getElementById('btn-add-block')?.addEventListener('click',()=>{pushUndo();blocks.push(makeBlock('New Block',blocks.length));renderProgram();showToast('Block added');});
  document.getElementById('btn-import-nav')?.addEventListener('click',()=>document.getElementById('btn-import')?.click());
  document.getElementById('btn-clear-log')?.addEventListener('click',()=>confirmAction('Clear all?','Cannot be undone.',()=>{localStorage.removeItem(LOG_KEY);renderLog();}));
  ['c1rm','crpe','creps'].forEach(id=>document.getElementById(id)?.addEventListener('input',updateCalc));
  document.getElementById('btn-undo')?.addEventListener('click',undo);
  document.getElementById('fab')?.addEventListener('click',()=>{saveAll();showToast('Saved ✓');});

  // Calendar
  document.getElementById('cal-prev')?.addEventListener('click',()=>{calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar();});
  document.getElementById('cal-next')?.addEventListener('click',()=>{calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar();});
  document.getElementById('cal-detail-close')?.addEventListener('click',()=>{calSelected=null;document.getElementById('cal-detail')?.classList.add('hidden');renderCalendar();});

  // Back button (browser/phone)
  window.addEventListener('popstate',e=>{
    if(document.getElementById('ex-detail-overlay')?.classList.contains('open')){
      closeExDetail();
    }
  });

  // SW
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

  // Boot
  loadAll();applySettings();
  supaLoad().then(fromCloud=>{
    if(fromCloud)applySettings();
    if(!blocks.length)blocks.push(makeBlock('My Program',0));
    renderProgram();renderStats();
    if(fromCloud)showToast('Synced ☁️');
    setTimeout(()=>autoBackup(),3000);
    // Loading video
    const ls=document.getElementById('loading-screen');
    const vidH=document.getElementById('load-vid-h');
    const vidV=document.getElementById('load-vid-v');
    if(ls&&vidH&&vidV){
      const isMobile=window.innerWidth<=768||/Mobi|Android/i.test(navigator.userAgent);
      const vid=isMobile?vidV:vidH;
      vid.classList.add('active');
      const dismiss=()=>{
        ls.classList.add('hide');
        setTimeout(()=>ls.style.display='none',600);
      };
      vid.addEventListener('ended',dismiss);
      vid.addEventListener('error',dismiss);
      vid.play().catch(dismiss);
      // Tap/click to skip
      ls.addEventListener('click',dismiss,{once:true});
      ls.addEventListener('touchstart',dismiss,{once:true,passive:true});
    } else if(ls){
      setTimeout(()=>{ls.classList.add('hide');setTimeout(()=>ls.style.display='none',600);},500);
    }
  });
});
