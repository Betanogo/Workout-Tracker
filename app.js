// ═══════════════════════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════════════════════
const SUPA_URL = 'https://qgweaaesbqzpsxvawxet.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd2VhYWVzYnF6cHN4dmF3eGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDkxOTMsImV4cCI6MjA5NzkyNTE5M30.F3w8uP92Bm1CTIaBCJR5ebbERX1QDz2N8XtZIwrHuWE';

async function supaLoad() {
  try {
    const res = await fetch(SUPA_URL+'/rest/v1/tatelift_data?id=eq.main&select=*', {
      headers: {'apikey': SUPA_KEY, 'Authorization': 'Bearer '+SUPA_KEY}
    });
    if(!res.ok) return false;
    const data = await res.json();
    if (data && data[0]) {
      // Only use cloud data if it has actual content
      const cloudBlocks = data[0].blocks;
      const cloudLifts = data[0].lifts;
      const cloudSettings = data[0].settings;
      const cloudUpdated = data[0].updated_at;

      // Check if cloud data is newer or has more data than local
      const localSaved = localStorage.getItem('tl_last_saved');
      const cloudIsNewer = !localSaved || (cloudUpdated && new Date(cloudUpdated) > new Date(localSaved));

      if(cloudBlocks && cloudBlocks.length && cloudIsNewer) blocks = cloudBlocks;
      if(cloudLifts && Object.keys(cloudLifts||{}).length && cloudIsNewer) lifts = cloudLifts;
      if(cloudSettings && Object.keys(cloudSettings||{}).length) settings = Object.assign({}, settings, cloudSettings);

      // Ensure migration
      blocks.forEach(b=>{
        if(!b.id)b.id=uid();
        (b.weeks||[]).forEach(w=>{if(!w.id)w.id=uid();(w.days||[]).forEach(d=>{if(!d.id)d.id=uid();(d.exercises||[]).forEach(e=>{if(!e.id)e.id=uid();if(e.note===undefined)e.note='';if(e.setsCompleted===undefined)e.setsCompleted=0;});});});
      });

      console.log('Loaded from Supabase, cloud newer:', cloudIsNewer);
      return true;
    }
  } catch(e) { console.warn('Supabase load failed, using localStorage', e); }
  return false;
}

async function supaSave() {
  try {
    const res = await fetch(SUPA_URL+'/rest/v1/tatelift_data?id=eq.main', {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer '+SUPA_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        blocks: blocks,
        lifts: lifts,
        settings: settings,
        updated_at: new Date().toISOString()
      })
    });
    if (res.ok) { console.log('Saved to Supabase'); return true; }
  } catch(e) { console.warn('Supabase save failed, using localStorage', e); }
  return false;
}

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
let undoStack=[]; // stores snapshots of blocks
const MAX_UNDO=20;

function pushUndo(){
  undoStack.push(JSON.stringify(blocks));
  if(undoStack.length>MAX_UNDO)undoStack.shift();
  const btn=document.getElementById('btn-undo');
  if(btn)btn.style.opacity='1';
}

function undo(){
  if(!undoStack.length){showToast('Nothing to undo');return;}
  blocks=JSON.parse(undoStack.pop());
  if(!undoStack.length){const btn=document.getElementById('btn-undo');if(btn)btn.style.opacity='.3';}
  renderProgram();
  showToast('Undo ✓');
}
let exNames=new Set(['Squat','Bench Press','Deadlift','OHP','Belt Squat','Larson Bench Press','Romanian Deadlift','Single Leg RDL','Copenhagen Plank','Ab Wheel','Cable Crunch','Cable Tricep Extension','Side Lateral Raise','Rear Delt Fly','Machine Press','Sandbag Bear Hug Carry','Back Extension','BSS','Pause Squat','Close Grip Bench','Incline Bench','Leg Press','Hip Thrust','Good Morning','Face Pull','Tricep Pushdown','Bicep Curl','Pause Deadlift','Deficit Deadlift','Box Squat','Front Squat','SQ','BP','DL']);

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
let _id=Date.now();
const uid=()=>'i'+(++_id);
const toDisplay=kg=>displayUnit==='kg'?kg:kg*KG2LB;
const toKg=v=>displayUnit==='kg'?v:v/KG2LB;
const fmt=(kg,d=0)=>kg==null||isNaN(kg)?'—':Math.round(toDisplay(kg))+' '+displayUnit;
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
  const now = new Date().toISOString();
  localStorage.setItem(SAVE_KEY,JSON.stringify({blocks,title:document.getElementById('prog-title').value||''}));
  localStorage.setItem(LIFT_KEY,JSON.stringify({lifts,displayUnit}));
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
  localStorage.setItem('tl_last_saved', now);
  supaSave().then(ok=>{ if(!ok) console.warn('Cloud save failed'); });
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
const makeEx=()=>({id:uid(),workout:'',rpe:'',tempo:'',sets:'',reps:'',done:false,note:'',setsCompleted:0});
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

  // Header
  const hdr=document.createElement('div');hdr.className='block-header';
  hdr.innerHTML=
    '<div class="block-hdr-top">'
    +'<span class="drag-handle">⠿</span>'
    +'<span class="block-dot '+block.color+'" style="width:10px;height:10px"></span>'
    +'<input class="block-name-in" value="'+(block.name||'')+'" placeholder="Block name"/>'
    +'<span style="font-size:10px;color:var(--text3);flex-shrink:0">'+block.weeks.length+' week'+(block.weeks.length!==1?'s':'')+'</span>'
    +'</div>'
    +'<div class="block-hdr-btns">'
    +'<button class="pill-btn acc" data-a="add-week">+ Week</button>'
    +'<button class="pill-btn red" data-a="rem-week">− Week</button>'
    +'<button class="pill-btn" data-a="copy">Copy</button>'
    +'<button class="pill-btn" data-a="archive">Archive</button>'
    +'<button class="pill-btn red" data-a="delete">Delete</button>'
    +'</div>';
  hdr.querySelector('.block-name-in').addEventListener('input',e=>block.name=e.target.value);
  hdr.querySelectorAll('[data-a]').forEach(btn=>btn.addEventListener('click',()=>blockAction(btn.dataset.a,block.id)));
  wrap.appendChild(hdr);

  // Body (weeks container)
  const body=document.createElement('div');body.className='block-body';
  const weeksWrap=document.createElement('div');weeksWrap.dataset.weeksOf=block.id;
  block.weeks.forEach((w,wi)=>weeksWrap.appendChild(renderWeek(w,block,wi,curId)));
  body.appendChild(weeksWrap);
  wrap.appendChild(body);
  return wrap;
}

function renderWeek(week,block,wi,curId){
  const wrap=document.createElement('div');wrap.className='week-wrap';wrap.dataset.wid=week.id;
  const state=getWeekDoneState(week);
  const doneDays=week.days.filter(d=>d.done).length;

  const hdr=document.createElement('div');hdr.className='week-header';
  const wState=state;
  const wRow1=document.createElement('div');wRow1.className='week-hdr-top';
  wRow1.innerHTML='<span class="drag-handle">⠿</span>'
    +'<span class="week-lbl">Week '+(wi+1)+'</span>'
    +'<span style="font-size:10px;color:var(--text3);flex:1">'+doneDays+'/'+week.days.length+' days</span>'
    +'<div class="check-box'+(wState==='done'?' done':wState==='partial'?' partial':'')+'" data-a="toggle-week">'+(wState==='done'?'✓':wState==='partial'?'–':'')+'</div>';
  const wRow2=document.createElement('div');wRow2.className='week-hdr-btns';
  wRow2.innerHTML='<button class="pill-btn acc" data-a="add-day">+Day</button>'
    +'<button class="pill-btn red" data-a="rem-day">−Day</button>'
    +'<button class="pill-btn red" data-a="del-week">✕</button>';
  hdr.appendChild(wRow1);hdr.appendChild(wRow2);
  hdr.querySelectorAll('[data-a]').forEach(el=>el.addEventListener('click',()=>weekAction(el.dataset.a,block,week,el)));
  wrap.appendChild(hdr);

  // Days container
  const daysWrap=document.createElement('div');daysWrap.className='week-days';
  week.days.forEach((d,di)=>daysWrap.appendChild(renderDay(d,block,week,di,curId)));
  wrap.appendChild(daysWrap);
  return wrap;
}

function renderDay(day,block,week,di,curId){
  const card=document.createElement('div');
  card.className='day-card'+(day.id===curId?' current-day':'');
  card.dataset.did=day.id;
  const state=getDayDoneState(day);
  const hdr=document.createElement('div');hdr.className='day-header';
  const dRow1=document.createElement('div');dRow1.className='day-hdr-row1';
  dRow1.innerHTML='<span class="drag-handle">⠿</span>'
    +'<span class="day-lbl">'+day.name+'</span>'
    +'<span class="day-chevron">›</span>';
  const dRow2=document.createElement('div');dRow2.className='day-hdr-row2';
  const doneLabel=state==='done'?'Done':state==='partial'?'In progress':'Not started';
  dRow2.innerHTML='<input type="date" class="day-date-in" value="'+(day.date||'')+'" onclick="event.stopPropagation()"/>'
    +'<span class="day-done-label">'+doneLabel+'</span>'
    +'<div class="check-box'+(state==='done'?' done':state==='partial'?' partial':'')+'" data-a="toggle-day" onclick="event.stopPropagation()">'+(state==='done'?'✓':state==='partial'?'–':'')+'</div>';
  hdr.appendChild(dRow1);hdr.appendChild(dRow2);
  hdr.addEventListener('click',()=>{
    const isOpen=body.classList.toggle('open');
    card.classList.toggle('open-card',isOpen);
  });

  // Long press on drag handle → show move options
  let lpTimer=null;
  const dayDragH=dRow1.querySelector('.drag-handle');
  if(dayDragH){
    const lpStart=(e)=>{
      e.preventDefault();
      e.stopPropagation();
      lpTimer=setTimeout(()=>{
        // Find current week index
        const allBlocks=blocks.filter(b=>!b.archived);
        for(const blk of allBlocks){
          for(let wi=0;wi<blk.weeks.length;wi++){
            const wk=blk.weeks[wi];
            const di=wk.days.indexOf(day);
            if(di>=0){
              // Show choice: prev week or next week
              const canPrev=wi>0;
              const canNext=true;
              const choice=canPrev
                ? confirm('Move "'+day.name+'" to next week? (Cancel = previous week)')
                : true;
              pushUndo();
              wk.days.splice(di,1);
              if(choice){
                // Move to next week
                if(wi+1<blk.weeks.length){
                  blk.weeks[wi+1].days.unshift(day);
                } else {
                  const nw=makeWeek(blk.weeks.length+1);
                  nw.days=[day];
                  blk.weeks.push(nw);
                }
                showToast('📅 Moved to Week '+(wi+2));
              } else {
                // Move to prev week
                blk.weeks[wi-1].days.push(day);
                showToast('📅 Moved to Week '+wi);
              }
              renderProgram();
              return;
            }
          }
        }
      },700);
    };
    const lpCancel=()=>clearTimeout(lpTimer);
    dayDragH.addEventListener('mousedown',lpStart);
    dayDragH.addEventListener('touchstart',lpStart,{passive:false});
    dayDragH.addEventListener('mouseup',lpCancel);
    dayDragH.addEventListener('mouseleave',lpCancel);
    dayDragH.addEventListener('touchend',lpCancel);
    dayDragH.addEventListener('touchmove',lpCancel,{passive:true});
  }
  dRow2.querySelector('.day-date-in').addEventListener('change',e=>day.date=e.target.value);
  dRow2.querySelector('[data-a="toggle-day"]').addEventListener('click',function(e){
    e.stopPropagation();
    day.done=!day.done;
    markDayExercises(day,day.done);
    renderProgram();
  });
  card.appendChild(hdr);
  // Prevent day card from being accidentally draggable
  card.draggable=false;
  const body=document.createElement('div');
  body.className='day-body'+(day.id===curId?' open':'');
  if(day.id===curId)card.classList.add('open-card');
  const exList=document.createElement('div');exList.className='ex-list';
  day.exercises.forEach((ex,ei)=>exList.appendChild(makeExRow(ex,day,ei,exList)));
  body.appendChild(exList);
  const addBtn=document.createElement('button');addBtn.className='add-ex-btn';addBtn.textContent='+ Add exercise';
  addBtn.addEventListener('click',()=>{const ex=makeEx();day.exercises.push(ex);exList.appendChild(makeExRow(ex,day,day.exercises.length-1,exList));});
  body.appendChild(addBtn);
  card.appendChild(body);
  return card;
}

function attachDotListeners(dotsEl,ex,numSpan,card,day){
  dotsEl.querySelectorAll('.set-dot').forEach(dot=>{
    dot.addEventListener('click',()=>{
      const idx=parseInt(dot.dataset.idx);
      const cur=ex.setsCompleted||0;
      // Toggle: clicking last done dot undoes it, else advances
      if(idx===cur-1){ex.setsCompleted=cur-1;}
      else{ex.setsCompleted=idx+1;}
      const total=parseInt(ex.sets)||0;
      // Update dots
      dotsEl.querySelectorAll('.set-dot').forEach((d,i)=>d.classList.toggle('set-dot-done',i<ex.setsCompleted));
      if(numSpan)numSpan.textContent=ex.setsCompleted+'/'+total;
      // Start timer after each set EXCEPT the last one
      if(ex.setsCompleted<total&&settings.timerAuto){
        startTimer(ex.workout);
      }
      // Auto-complete exercise when all sets done
      if(ex.setsCompleted>=total&&total>0){
        ex.done=true;
        const cb=card.querySelector('.check-box');
        if(cb){cb.classList.add('done');cb.textContent='✓';}
        card.classList.add('ex-card-done');
        // No timer on last set
        day.done=day.exercises.every(e=>e.done);
        const dayCard=card.closest('.day-card');
        if(dayCard){
          const doneBtn=dayCard.querySelector('.day-header .check-box');
          const s=getDayDoneState(day);
          if(doneBtn){doneBtn.className='check-box'+(s==='done'?' done':s==='partial'?' partial':'');doneBtn.textContent=s==='done'?'✓':s==='partial'?'–':'';}
        }
      } else if(ex.setsCompleted<(parseInt(ex.sets)||0)){
        // Un-complete if sets reduced
        ex.done=false;
        const cb=card.querySelector('.check-box');
        if(cb){cb.classList.remove('done');cb.textContent='';}
        card.classList.remove('ex-card-done');
      }
    });
  });
}

function makeExRow(ex,day,ei,container){
  const card=document.createElement('div');
  card.className='ex-card'+(ex.done?' ex-card-done':'');
  card.dataset.exid=ex.id;

  const numSets=parseInt(ex.sets)||0;
  const setDotsHtml=numSets>1?Array.from({length:Math.min(numSets,12)},(_,i)=>'<div class="set-dot'+(i<(ex.setsCompleted||0)?' set-dot-done':'')+'" data-idx="'+i+'"></div>').join(''):'';
  card.innerHTML=
    // Row 1: drag + name + actions
    '<div class="ex-row-header">'
      +'<span class="drag-handle ex-drag">⠿</span>'
      +'<div class="ac-wrap ex-name-wrap">'
        +'<input class="ex-name-in" value="'+(ex.workout||'')+'" placeholder="Exercise name"/>'
        +'<div class="ac-list"></div>'
      +'</div>'
      +'<div class="ex-actions">'
        +'<div class="check-box'+(ex.done?' done':'')+'" style="width:24px;height:24px;font-size:12px">'+(ex.done?'✓':'')+'</div>'
        +'<button class="note-btn '+(ex.note?'has-note':'no-note')+'">'+(ex.note?'📝':'✎')+'</button>'
        +'<button class="del-btn">✕</button>'
      +'</div>'
    +'</div>'
    // Row 2: 4-col metrics grid (RPE Tempo Sets Reps)
    +'<div class="ex-metrics">'
      +'<div class="ex-metric">'
        +'<div class="ex-metric-label">RPE</div>'
        +'<input class="ex-metric-in" type="text" inputmode="decimal" value="'+(ex.rpe||'')+'" placeholder="—"/>'
      +'</div>'
      +'<div class="ex-metric">'
        +'<div class="ex-metric-label">Tempo</div>'
        +'<input class="ex-metric-in" type="text" inputmode="numeric" value="'+(ex.tempo||'')+'" placeholder="311" maxlength="3"/>'
      +'</div>'
      +'<div class="ex-metric">'
        +'<div class="ex-metric-label">Sets</div>'
        +'<input class="ex-metric-in ex-sets-in" type="text" inputmode="numeric" value="'+(ex.sets||'')+'" placeholder="—"/>'
      +'</div>'
      +'<div class="ex-metric">'
        +'<div class="ex-metric-label">Reps</div>'
        +'<input class="ex-metric-in" type="text" inputmode="numeric" value="'+(ex.reps||'')+'" placeholder="—"/>'
      +'</div>'
    +'</div>'
    // Row 3: weight full-width bar
    +'<div class="ex-weight-row">'
      +'<span style="font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text3)">WEIGHT</span>'
      +'<div class="wt-val">—</div>'
      +'<div class="wt-alt"></div>'
    +'</div>'
    // Row 4: set counter
    +'<div class="ex-set-counter" style="display:'+(numSets>1?'flex':'none')+'">'
      +'<span class="set-counter-label">Set</span>'
      +'<div class="set-dots" data-sets="'+(ex.sets||0)+'" data-done="'+(ex.setsCompleted||0)+'">'
        +setDotsHtml
      +'</div>'
      +'<span class="set-counter-num">'+(ex.setsCompleted||0)+'/'+(ex.sets||0)+'</span>'
    +'</div>';

  const wIn=card.querySelector('.ex-name-in');
  const [rpeIn,tempoIn,setsIn,repsIn]=card.querySelectorAll('.ex-metric-in');
  const wDisp=card.querySelector('.wt-val');
  const wAlt=card.querySelector('.wt-alt');
  const acList=card.querySelector('.ac-list');
  let acSel=-1;

  function refreshW(){
    const kg=calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
    if(kg){wDisp.textContent=fmt(kg,0);wAlt.textContent=displayUnit==='kg'?Math.round(kg*KG2LB)+' lb':Math.round(kg/KG2LB)+' kg';}
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
  setsIn.addEventListener('input',()=>{
    ex.sets=setsIn.value;
    const n=parseInt(ex.sets)||0;
    const counter=card.querySelector('.ex-set-counter');
    const dots=card.querySelector('.set-dots');
    const numSpan=card.querySelector('.set-counter-num');
    if(counter){counter.style.display=n>1?'flex':'none';}
    if(dots&&n>1){
      dots.dataset.sets=n;
      dots.innerHTML=Array.from({length:Math.min(n,12)},(_,i)=>'<div class="set-dot'+(i<(ex.setsCompleted||0)?' set-dot-done':'')+'" data-idx="'+i+'"></div>').join('');
      attachDotListeners(dots,ex,numSpan,card,day);
    }
    if(numSpan)numSpan.textContent=(ex.setsCompleted||0)+'/'+n;
  });

  // Attach dot listeners
  const dotsEl=card.querySelector('.set-dots');
  const numSpanEl=card.querySelector('.set-counter-num');
  if(dotsEl)attachDotListeners(dotsEl,ex,numSpanEl,card,day);
  repsIn.addEventListener('input',()=>{ex.reps=repsIn.value;refreshW();});

  card.querySelector('.check-box').addEventListener('click',function(){
    ex.done=!ex.done;
    this.classList.toggle('done',ex.done);
    this.textContent=ex.done?'✓':'';
    card.classList.toggle('ex-card-done',ex.done);
    if(ex.done&&settings.timerAuto)startTimer(ex.workout);
    day.done=day.exercises.every(e=>e.done);
    const dayCard=card.closest('.day-card');
    if(dayCard){
      const doneBtn=dayCard.querySelector('.day-header .check-box');
      const s=getDayDoneState(day);
      if(doneBtn){doneBtn.className='check-box'+(s==='done'?' done':s==='partial'?' partial':'');doneBtn.textContent=s==='done'?'✓':s==='partial'?'–':'';}
    }
  });
  card.querySelector('.note-btn').addEventListener('click',()=>openNote(ex,ex.workout||('Exercise '+(ei+1)),card));
  card.querySelector('.del-btn').addEventListener('click',()=>{
    pushUndo();
    const idx=day.exercises.indexOf(ex);if(idx>=0)day.exercises.splice(idx,1);
    card.remove();
    container.querySelectorAll('.ex-card').forEach((c,i)=>{
      const drag=c.querySelector('.ex-drag');
      // update number if needed
    });
  });
  setTimeout(refreshW,0);
  return card;
}

// ═══════════════════════════════════════════════
// BLOCK / WEEK ACTIONS
// ═══════════════════════════════════════════════
function blockAction(action,bid){
  const block=blocks.find(b=>b.id===bid);if(!block)return;
  if(action==='add-week'){pushUndo();block.weeks.push(makeWeek(block.weeks.length+1));renderProgram();}
  else if(action==='rem-week'){if(block.weeks.length>1){pushUndo();block.weeks.pop();renderProgram();}}
  else if(action==='copy'){
    const c=JSON.parse(JSON.stringify(block));
    c.id=uid();c.name=block.name+' (copy)';c.color=BLOCK_COLS[(BLOCK_COLS.indexOf(block.color)+1)%BLOCK_COLS.length];
    c.weeks.forEach(w=>{w.id=uid();w.days.forEach(d=>{d.id=uid();d.exercises.forEach(e=>e.id=uid());});});
    const idx=blocks.indexOf(block);blocks.splice(idx+1,0,c);renderProgram();showToast('Copied');
  }
  else if(action==='archive'){
    confirmAction('Archive "'+block.name+'"?','Moves to Log.',()=>{pushUndo();block.archived=true;archiveToLog(block);renderProgram();renderLog();showToast('Archived');});
  }
  else if(action==='delete'){
    confirmAction('Delete "'+block.name+'"?','Cannot be undone.',()=>{pushUndo();blocks=blocks.filter(b=>b.id!==bid);renderProgram();showToast('Deleted');});
  }
}

function weekAction(action,block,week,el){
  if(action==='add-day'){pushUndo();week.days.push(makeDay('Day '+(week.days.length+1)));renderProgram();}
  else if(action==='rem-day'){if(week.days.length>1){pushUndo();week.days.pop();renderProgram();}}
  else if(action==='del-week'){
    confirmAction('Delete week?','All exercises will be removed.',()=>{pushUndo();block.weeks=block.weeks.filter(w=>w.id!==week.id);renderProgram();showToast('Week deleted');});
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
    // Only allow drag from handle
    handle.addEventListener('mousedown',()=>{item.draggable=true;});
    handle.addEventListener('touchstart',()=>{item.draggable=true;},{passive:true});
    item.addEventListener('dragstart',e=>{
      if(!item.draggable)return;
      dragging=item;
      e.dataTransfer.effectAllowed='move';
      e.stopPropagation();
      setTimeout(()=>item.style.opacity='.3',0);
    });
    item.addEventListener('dragend',()=>{
      dragging=null;
      item.draggable=false;
      item.style.opacity='';
      container.querySelectorAll(itemSel).forEach(i=>i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover',e=>{
      e.preventDefault();e.stopPropagation();
      if(dragging&&dragging!==item)item.classList.add('drag-over');
    });
    item.addEventListener('dragleave',()=>item.classList.remove('drag-over'));
    item.addEventListener('drop',e=>{
      e.preventDefault();e.stopPropagation();
      item.classList.remove('drag-over');
      if(dragging&&dragging!==item)onDrop(dragging,item);
    });
    // Start with draggable false
    item.draggable=false;
  });
}

// ═══════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════
const circumference=2*Math.PI*68;
(()=>{
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
  try{
    const result=[];
    if(!wb||!wb.SheetNames||!wb.SheetNames.length)return[makeBlock('Imported',0)];
    const skip=['how to use','program rules','rpe scale','lift progress'];
    const sheets=wb.SheetNames.filter(n=>typeof n==='string'&&!skip.some(s=>n.toLowerCase().includes(s)));
    const useSheets=sheets.length?sheets:wb.SheetNames.slice(0,1);
    useSheets.forEach(name=>{
      try{
        const ws=wb.Sheets[name];if(!ws)return;
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
        if(!rows||!rows.length)return;
        const block=parseSheet(rows,typeof name==='string'?name:'Imported');
        if(block)result.push(block);
      }catch(e){console.error('Sheet parse error:',e);}
    });
    return result.length?result:[makeBlock('Imported',0)];
  }catch(e){console.error('parseExcel error:',e);return[makeBlock('Imported',0)];}
}
function parseSheet(rows,name){
  try{
    const safeName=(name&&typeof name==='string')?name:'Imported';
    const block=makeBlock(safeName,blocks.length%BLOCK_COLS.length);block.weeks=[];
    let cw=null,cd=null;
    rows.forEach(row=>{
      if(!row||!Array.isArray(row)||!row.some(v=>v!=null))return;
      const wk=String(row[1]||'').trim();
      const day=String(row[2]||'').replace(/\n/g,' ').trim();
      const exNum=row[3];
      const workout=String(row[4]||'').trim();
      const rpe=row[5]!=null?String(row[5]):'';
      const tempo=row[10]!=null?String(row[10]):'';
      const sets=row[11]!=null?String(row[11]):'';
      const reps=row[12]!=null?String(row[12]):'';
      if(wk.toLowerCase().includes('week')&&!wk.toLowerCase().includes('workout')){
        cw={id:uid(),label:wk,date:'',done:false,days:[]};block.weeks.push(cw);cd=null;
      }
      if(day.toLowerCase().includes('day')){
        cd={id:uid(),name:day,date:'',done:false,media:[],exercises:[]};
        if(!cw){cw={id:uid(),label:'Week 1',date:'',done:false,days:[]};block.weeks.push(cw);}
        cw.days.push(cd);
      }
      if(workout&&exNum!=null&&cd){
        exNames.add(workout);
        cd.exercises.push({id:uid(),workout,rpe,tempo,sets:String(sets),reps:String(reps),done:false,note:''});
      }
    });
    block.weeks=block.weeks.filter(w=>(w.days||[]).some(d=>(d.exercises||[]).length>0));
    block.weeks.forEach(w=>w.days=w.days.filter(d=>(d.exercises||[]).length>0));
    return block.weeks.length?block:null;
  }catch(err){
    console.error('parseSheet error:',err);return null;
  }
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
// CALENDAR
// ═══════════════════════════════════════════════
let calYear=new Date().getFullYear();
let calMonth=new Date().getMonth();
let calSelected=null;

function getWorkedOutDates(){
  const map={};
  blocks.forEach(block=>{
    block.weeks.forEach(week=>{
      week.days.forEach(day=>{
        // Show day if it has a date AND at least one exercise is done
        if(day.date && day.exercises.some(e=>e.done)){
          if(!map[day.date])map[day.date]=[];
          map[day.date].push({
            blockName:block.name,weekLabel:week.label,dayName:day.name,
            exercises:day.exercises,done:day.done
          });
        }
      });
    });
  });
  return map;
}

function renderCalendar(){
  const grid=document.getElementById('cal-grid');
  const label=document.getElementById('cal-month-label');
  if(!grid||!label)return;

  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=months[calMonth]+' '+calYear;

  const workedDates=getWorkedOutDates();
  const today=new Date();
  const todayStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');

  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const daysInPrev=new Date(calYear,calMonth,0).getDate();

  let html='<div class="cal-weekdays">';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>html+='<div class="cal-weekday">'+d+'</div>');
  html+='</div><div class="cal-days">';

  // Prev month days
  for(let i=firstDay-1;i>=0;i--){
    html+='<div class="cal-day other-month"><span class="cal-day-num">'+(daysInPrev-i)+'</span></div>';
  }
  // Current month
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isToday=dateStr===todayStr;
    const isWorked=!!workedDates[dateStr];
    const isSelected=dateStr===calSelected;
    let cls='cal-day';
    if(isToday)cls+=' today';
    if(isWorked)cls+=' worked-out';
    if(isSelected)cls+=' selected';
    html+='<div class="'+cls+'" data-date="'+dateStr+'">'
      +'<span class="cal-day-num">'+d+'</span>'
      +(isWorked&&!isSelected?'<div class="cal-day-dot"></div>':'')
      +'</div>';
  }
  // Next month days
  const remaining=(7-((firstDay+daysInMonth)%7))%7;
  for(let d=1;d<=remaining;d++){
    html+='<div class="cal-day other-month"><span class="cal-day-num">'+d+'</span></div>';
  }
  html+='</div>';
  grid.innerHTML=html;

  // Click listeners
  grid.querySelectorAll('.cal-day[data-date]').forEach(el=>{
    el.addEventListener('click',()=>{
      calSelected=el.dataset.date;
      renderCalendar();
      showCalDetail(el.dataset.date,workedDates[el.dataset.date]);
    });
  });
}

function showCalDetail(dateStr,entries){
  const detail=document.getElementById('cal-detail');
  const title=document.getElementById('cal-detail-title');
  const detailContent=document.getElementById('cal-detail-content');
  if(!detail||!title||!detailContent)return;
  const d=new Date(dateStr+'T12:00:00');
  title.textContent=d.toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric'});
  if(!entries||!entries.length){
    detailContent.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No completed workouts for this day.<br><span style="font-size:11px;opacity:.7">Mark exercises as done and add a date to the Day card.</span></div>';
  } else {
    detailContent.innerHTML=entries.map(e=>{
      const doneEx=e.exercises.filter(ex=>ex.done&&ex.workout);
      const totalEx=e.exercises.filter(ex=>ex.workout).length;
      return '<div style="margin-bottom:12px">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
          +'<div style="font-size:12px;color:var(--acc);font-weight:700">'+e.dayName+'</div>'
          +'<div style="font-size:10px;color:var(--text3)">'+e.blockName+'</div>'
          +'<div style="margin-left:auto;font-family:var(--fm);font-size:10px;color:var(--text3)">'+doneEx.length+'/'+totalEx+' done</div>'
        +'</div>'
        +e.exercises.filter(ex=>ex.workout).map(ex=>{
          const wt=calcWeight(getOrm(ex.workout),ex.rpe,ex.reps,ex.tempo,ex.workout);
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">'
            +'<div style="width:20px;height:20px;border-radius:4px;background:'+(ex.done?'var(--acc)':'var(--s3)')+';border:1px solid '+(ex.done?'var(--acc)':'var(--border)')+';display:flex;align-items:center;justify-content:center;font-size:10px;color:'+(ex.done?'var(--acc-text)':'transparent')+';flex-shrink:0">'+(ex.done?'✓':'')+'</div>'
            +'<div style="flex:1;min-width:0">'
              +'<div style="font-size:12px;color:'+(ex.done?'var(--text)':'var(--text3)')+';font-weight:500">'+ex.workout+'</div>'
              +(ex.sets&&ex.reps?'<div style="font-family:var(--fm);font-size:10px;color:var(--text3)">'+ex.sets+'×'+ex.reps+(ex.rpe?' @RPE'+ex.rpe:'')+'</div>':'')
            +'</div>'
            +(wt?'<div style="font-family:var(--fm);font-size:12px;font-weight:700;color:var(--acc);flex-shrink:0">'+Math.round(toDisplay(wt))+' '+displayUnit+'</div>':'')
          +'</div>';
        }).join('')
        +'</div>';
    }).join('');
  }
  detail.classList.remove('hidden');
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

  // Calendar controls
  const calPrev=document.getElementById('cal-prev');
  const calNext=document.getElementById('cal-next');
  const calClose=document.getElementById('cal-detail-close');
  if(calPrev)calPrev.addEventListener('click',()=>{calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar();});
  if(calNext)calNext.addEventListener('click',()=>{calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar();});
  if(calClose)calClose.addEventListener('click',()=>{calSelected=null;document.getElementById('cal-detail').classList.add('hidden');renderCalendar();});

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
      if(tab.dataset.page==='calendar')renderCalendar();
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
  document.getElementById('btn-import').addEventListener('click',()=>{
    const input=document.createElement('input');
    input.type='file';
    input.accept='.xlsx,.xlsm,.xls';
    input.onchange=function(){
      if(!this.files.length)return;
      const file=this.files[0];
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(e.target.result,{type:'array'});
          pendingImport=parseExcel(wb,file.name);
          document.getElementById('import-sub').textContent='Found '+pendingImport.length+' block(s), '+pendingImport.reduce((s,b)=>s+b.weeks.length,0)+' weeks from "'+file.name+'"';
          document.getElementById('import-preview').innerHTML=pendingImport.map(b=>'<span style="color:var(--acc)">'+b.name+'</span><br>'+b.weeks.map(w=>'  '+w.label+': '+w.days.length+' days').join('<br>')).join('<br><br>');
          document.getElementById('modal-import').classList.remove('hidden');
        }catch(err){showToast('Import failed: '+err.message);console.error(err);}
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
  document.getElementById('btn-clear-log').addEventListener('click',()=>confirmAction('Clear all logs?','Cannot be undone.',()=>{localStorage.removeItem(LOG_KEY);renderLog();}));
  ['c1rm','crpe','creps'].forEach(id=>document.getElementById(id).addEventListener('input',updateCalc));
  document.getElementById('btn-undo').addEventListener('click',()=>undo());
  document.getElementById('fab').addEventListener('click',()=>{
    blocks.forEach(b=>b.weeks.forEach(w=>w.days.forEach(d=>d.exercises.forEach(e=>{if(e.workout)exNames.add(e.workout);}))));
    saveAll();showToast('Saved ✓');
  });

  // Service worker — network first for updates, cache for offline
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js')
      .then(reg=>{
        // Force update check every time
        reg.update();
      })
      .catch(()=>{});
  }

  // Boot — Supabase first, localStorage fallback, never overwrite with empty
  loadAll(); // localStorage fallback
  applySettings();
  supaLoad().then(fromCloud => {
    if(fromCloud) applySettings();
    // Only create default block if truly no data anywhere
    if(!blocks.length) blocks.push(makeBlock('My Program',0));
    renderProgram();
    renderStats();
    if(fromCloud) showToast('Synced ☁️');
  });
})();
