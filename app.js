const KEY='bird_binder_calendar_v2';
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

const SECTIONS={
 schedule:{sub:'Schedule / Calendar + Agenda',tabs:[
  ['calendar','Calendar + Agenda','Calendar view, agenda, and tasks'],
  ['newJob','New Job Entry','Add scheduled or completed jobs'],
  ['newEvent','New Event Entry','Add personal events']
]},
 clients:{sub:'Clients / Directory',tabs:[
  ['directory','Directory','Alphabetical client list.'],
  ['client','Client','Selected client record and totals.'],
  ['invoices','Invoices','All client invoices in numerical order.']
 ]},
 supplies:{sub:'Supplies / Supply List',tabs:[
  ['list','Supply List','All supplies. Selecting item opens item page.'],
  ['item','Item','Specific supply item details.'],
  ['inventory','Inventory','All supply quantities remaining.'],
  ['receipts','Receipts','Receipts for supply purchases.']
 ]},
 banking:{sub:'Banking / Accounts',tabs:[
  ['accounts','Accounts','Main spending and savings accounts.'],
  ['trackers','Trackers','Money received, spent, saved, and categories.'],
  ['receipts','Receipts','All banking receipts.']
 ]}
};

const now=new Date();
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{
  section:'schedule',
  tabs:{schedule:'calendar',clients:'directory',supplies:'list',banking:'accounts'},
  notes:{},
  year:now.getFullYear(),
  month:now.getMonth(),
  selectedDate:dateKey(now),
  calendarData:{}
};

function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function dateKey(d){
  let x=new Date(d);
  x.setMinutes(x.getMinutes()-x.getTimezoneOffset());
  return x.toISOString().slice(0,10);
}
function makeKey(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function parseKey(k){let [y,m,d]=k.split('-').map(Number);return {y,m:m-1,d}}
function ensureDay(k){if(!state.calendarData[k]) state.calendarData[k]={agenda:[],tasks:[],notes:''};return state.calendarData[k]}
function setSection(s){state.section=s;save();render()}
function setTab(t){state.tabs[state.section]=t;save();render()}

function render(){
 document.querySelectorAll('.sideTab').forEach(b=>b.classList.toggle('active',b.dataset.section===state.section));
 subtitle.textContent=SECTIONS[state.section].sub;
 subtabs.innerHTML=SECTIONS[state.section].tabs.map(t=>`<button class="subtab ${state.tabs[state.section]===t[0]?'active':''}" onclick="setTab('${t[0]}')">${t[1]}</button>`).join('');
 let tab=SECTIONS[state.section].tabs.find(t=>t[0]===state.tabs[state.section]);

 if(state.section==='schedule' && tab[0]==='calendar'){
   content.innerHTML=renderScheduleCalendar();
   return;
 }

 content.innerHTML=pageTemplate(state.section,tab);
}

function pageTemplate(section,tab){
 let key=section+':'+tab[0];
 return `<div class="titleRow"><div><h2>${tab[1]}</h2><p>${tab[2]}</p></div><div class="note">Blank Page Template</div></div>
 <div class="layout">
  <div class="box"><h3>Main Content Area</h3><p>This is where the ${tab[1]} tools will go.</p><div class="line"></div><div class="line"></div><div class="line"></div><div class="actions"><button class="save">Save</button><button>Add</button><button class="delete">Delete</button><button>Back</button></div></div>
  <div class="box"><h3>Side / Detail Area</h3><p>Selected records, trackers, or linked info will go here.</p><textarea style="width:100%;min-height:120px;border-radius:10px;padding:8px" oninput="state.notes['${key}']=this.value;save()">${state.notes[key]||''}</textarea></div>
 </div>`;
}

function renderScheduleCalendar(){
 let selected=parseKey(state.selectedDate);
 state.year=state.year||now.getFullYear();
 state.month=state.month??now.getMonth();
 let y=state.year,m=state.month;
 let first=new Date(y,m,1).getDay();
 let total=new Date(y,m+1,0).getDate();
 let todayKey=dateKey(new Date());
 let monthTabs=MONTHS.map((name,i)=>`<button class="monthBtn ${i===m?'active':''}" onclick="setCalendarMonth(${i})">${name}</button>`).join('');
 let days=['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d=>`<div>${d}</div>`).join('');
 let grid='';
 for(let i=0;i<first;i++) grid += `<div class="calDay blank"></div>`;
 for(let d=1; d<=total; d++){
   let k=makeKey(y,m,d);
   let data=ensureDay(k);
   let agenda=data.agenda||[];
   let previews=agenda.slice(0,3).map(item=>`<div class="preview">${formatTime(item.time)}: ${escapeHtml(item.title||'')}</div>`).join('');
   if(agenda.length>3) previews+=`<div class="preview">+${agenda.length-3} more</div>`;
   grid += `<div class="calDay ${k===state.selectedDate?'selected':''} ${k===todayKey?'today':''}" onclick="selectCalendarDay('${k}')"><div class="dayNum">${d}</div>${previews}</div>`;
 }
 let selectedData=ensureDay(state.selectedDate);
 let selectedDateObj=new Date(state.selectedDate+'T12:00:00');
 return `<div class="monthTabs">${monthTabs}</div>
 <div class="calendarTitle"><button onclick="changeCalendarYear(-1)">‹ ${y-1}</button><h2>${FULL_MONTHS[m]} ${y}</h2><button onclick="changeCalendarYear(1)">${y+1} ›</button></div>
 <div class="weekdays">${days}</div>
 <div class="calendarGrid">${grid}</div>
 <div class="dayBottom">
   <div class="dailyBox">
     <h3>${selectedDateObj.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'})}</h3>
     <h4>Agenda</h4>
     <div>${selectedData.agenda.map((item,idx)=>`<div class="agendaRow"><input value="${escapeHtml(item.time||'')}" oninput="updateAgenda(${idx},'time',this.value)"><input value="${escapeHtml(item.title||'')}" oninput="updateAgenda(${idx},'title',this.value)"><button class="smallBtn" onclick="deleteAgenda(${idx})">×</button></div>`).join('')||'<p class="note">No agenda items yet.</p>'}</div>
     <div class="addRow"><input id="newAgendaTime" placeholder="8a"><input id="newAgendaTitle" placeholder="Weed Eating"><button onclick="addAgenda()">Add</button></div>
   </div>
   <div class="dailyBox">
     <h4>Tasks</h4>
     <div>${selectedData.tasks.map((task,idx)=>`<div class="taskRow ${task.done?'done':''}"><input type="checkbox" ${task.done?'checked':''} onchange="updateTask(${idx},'done',this.checked)"><input type="text" value="${escapeHtml(task.text||'')}" oninput="updateTask(${idx},'text',this.value)"><button class="smallBtn" onclick="deleteTask(${idx})">×</button></div>`).join('')||'<p class="note">No tasks yet.</p>'}</div>
     <div class="addTaskRow"><input id="newTaskText" placeholder="Add task"><button onclick="addTask()">Add</button></div>
     <h4>Notes</h4>
     <textarea class="notesArea" oninput="updateNotes(this.value)" placeholder="Daily notes...">${escapeHtml(selectedData.notes||'')}</textarea>
   </div>
 </div>`;
}
function saveJob(){
  let date = document.getElementById('jobDate').value;
  let title = document.getElementById('jobTitle').value;
  let time = document.getElementById('jobStart').value;

  if(!date || !title) return;

  let d = ensureDay(date);
  d.agenda.push({ 
    time: time, 
    title: title,
    type: 'job'
  });

  state.selectedDate = date;

  let parts = parseKey(date);
  state.year = parts.y;
  state.month = parts.m;

  save();
  setTab('calendar');
}
function saveEvent(){
  let date = document.getElementById('eventDate').value;
  let title = document.getElementById('eventTitle').value;
  let time = document.getElementById('eventTime').value;

  if(!date || !title) return;

  let d = ensureDay(date);
  d.agenda.push({ 
    time: time, 
    title: title,
    type: 'event'
  });

  state.selectedDate = date;

  let parts = parseKey(date);
  state.year = parts.y;
  state.month = parts.m;

  save();
  setTab('calendar');
}
function setCalendarMonth(m){state.month=m;state.selectedDate=makeKey(state.year,m,1);save();render()}
function changeCalendarYear(n){state.year+=n;state.selectedDate=makeKey(state.year,state.month,1);save();render()}
function selectCalendarDay(k){state.selectedDate=k;save();render()}
function addAgenda(){
 let time=document.getElementById('newAgendaTime').value.trim();
 let title=document.getElementById('newAgendaTitle').value.trim();
 if(!time||!title) return;
 let d=ensureDay(state.selectedDate);
 d.agenda.push({time,title});
 sortAgenda(d.agenda);
 save();render();
}
function saveJob(){
  let date = document.getElementById('jobDate').value;
  let title = document.getElementById('jobTitle').value;
  let time = document.getElementById('jobStart').value;

  if(!date || !title) return;

  let d = ensureDay(date);
  d.agenda.push({ time: time, title: title });

  state.selectedDate = date;

  let parts = parseKey(date);
  state.year = parts.y;
  state.month = parts.m;

  save();
  setTab('calendar');
}
function updateAgenda(idx,key,value){let d=ensureDay(state.selectedDate);d.agenda[idx][key]=value;sortAgenda(d.agenda);save();renderCalendarOnlySoon()}
function deleteAgenda(idx){let d=ensureDay(state.selectedDate);d.agenda.splice(idx,1);save();render()}
function addTask(){let text=document.getElementById('newTaskText').value.trim();if(!text)return;ensureDay(state.selectedDate).tasks.push({text,done:false});save();render()}
function updateTask(idx,key,value){ensureDay(state.selectedDate).tasks[idx][key]=value;save();renderCalendarOnlySoon()}
function deleteTask(idx){ensureDay(state.selectedDate).tasks.splice(idx,1);save();render()}
function updateNotes(value){ensureDay(state.selectedDate).notes=value;save()}
function sortAgenda(arr){arr.sort((a,b)=>timeValue(a.time)-timeValue(b.time))}
function timeValue(t){
 t=String(t||'').toLowerCase().trim();
 let m=t.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?/);
 if(!m) return 9999;
 let h=Number(m[1]), min=Number(m[2]||0), ap=m[3];
 if(ap==='p' && h<12) h+=12;
 if(ap==='a' && h===12) h=0;
 return h*60+min;
}
function formatTime(t){
 t=String(t||'').trim().toLowerCase();
 if(t.includes('a')||t.includes('p')) return t.replace(':00','');
 if(t.includes(':')){
   let [h,min]=t.split(':');h=Number(h);
   let ap=h>=12?'p':'a';h=h%12||12;
   return min==='00'?`${h}${ap}`:`${h}:${min}${ap}`;
 }
 return t;
}
let softRenderTimer=null;
function renderCalendarOnlySoon(){clearTimeout(softRenderTimer);softRenderTimer=setTimeout(()=>render(),650)}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function backup(){
 let b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
 let u=URL.createObjectURL(b),a=document.createElement('a');
 a.href=u;a.download='bird-planner-backup.json';a.click();URL.revokeObjectURL(u);
}
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}))}
render();
