const KEY='bird_planner_v35_fresh_blank_slate';
const BUILD='V50.1';
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const SECTIONS={
 schedule:{sub:'Schedule / Calendar + Agenda',tabs:[['calendar','Calendar + Agenda','Calendar view, agenda, and tasks'],['newJob','New Job Entry','Add scheduled or completed jobs'],['newEvent','New Event Entry','Add personal events']]},
 clients:{sub:'Clients / Directory',tabs:[['directory','Directory','Alphabetical client list.'],['client','Client','Selected client record and totals.'],['invoices','Invoices','All client invoices in numerical order.']]},
 supplies:{sub:'Supplies / Supply List',tabs:[['list','Supply List','All supplies. Add item or tap item to open details.'],['item','Item','Specific supply item details.'],['receipts','Receipts','Receipts for supply purchases.']]},
 banking:{sub:'Banking / Accounts',tabs:[['accounts','Accounts','Main spending and savings accounts.'],['trackers','Trackers','Money received, spent, saved, and categories.'],['receipts','Receipts','All banking receipts.']]},
 studio:{sub:'Studio / Scratch Pad + Gallery',tabs:[['pad','Scratch Pad','Sketch ideas and mark up photos.'],['gallery','Gallery','Saved drawings and markup images.']]}
};
const now=new Date();
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{section:'schedule',tabs:{schedule:'calendar',clients:'directory',supplies:'list',banking:'accounts',studio:'pad'},notes:{},year:now.getFullYear(),month:now.getMonth(),selectedDate:dateKey(now),calendarData:{},clients:{},selectedClient:'',invoices:[],invoiceCounter:1,services:[],supplies:[],supplyItems:{},selectedSupplyId:'',supplyReceipts:[],supplyCounter:1,timeLogs:[],timeClock:{status:'out'},reminders:[],firedReminders:{}};
function ensureCollections(){if(!state.clients)state.clients={};if(!state.invoices)state.invoices=[];if(!state.invoiceCounter)state.invoiceCounter=1;if(!Array.isArray(state.services))state.services=[];if(!Array.isArray(state.supplies))state.supplies=[];if(!state.supplyItems)state.supplyItems={};if(!state.supplyReceipts)state.supplyReceipts=[];if(!state.supplyCounter)state.supplyCounter=1;if(!state.tabs)state.tabs={schedule:'calendar',clients:'directory',supplies:'list',banking:'accounts',studio:'pad'};if(!state.tabs.supplies)state.tabs.supplies='list';if(!state.tabs.studio)state.tabs.studio='pad';if(!Array.isArray(state.timeLogs))state.timeLogs=[];if(!state.timeClock)state.timeClock={status:'out'};if(!Array.isArray(state.reminders))state.reminders=[];if(!state.firedReminders)state.firedReminders={};if(!state.drafts)state.drafts={};if(!state.scratchPad)state.scratchPad={activeTab:'pad',gallery:[],tool:'pencil',size:6,color:'#111111',undo:[],canvasData:''}}
const DB_NAME='bird_planner_offline_db';
const DB_STORE='state_snapshots';
let saveTimer=null, lastSavedAt=0, dbReady=null;
function openOfflineDb(){
  if(dbReady)return dbReady;
  dbReady=new Promise((resolve)=>{
    if(!('indexedDB' in window)){resolve(null);return;}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>resolve(null);
  });
  return dbReady;
}
async function writeOfflineSnapshot(payload){
  try{
    const db=await openOfflineDb();
    if(!db)return;
    const tx=db.transaction(DB_STORE,'readwrite');
    tx.objectStore(DB_STORE).put({id:'latest',updatedAt:new Date().toISOString(),payload});
  }catch(e){console.warn('Offline DB mirror failed',e)}
}
function save(reason='manual'){
  ensureCollections();
  normalizeMathState();
  state._meta={build:BUILD,updatedAt:new Date().toISOString(),reason};
  const payload=JSON.stringify(state);
  localStorage.setItem(KEY,payload);
  lastSavedAt=Date.now();
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>writeOfflineSnapshot(payload),250);
}
function flushSave(reason='flush'){
  ensureCollections();
  normalizeMathState();
  state._meta={build:BUILD,updatedAt:new Date().toISOString(),reason};
  const payload=JSON.stringify(state);
  localStorage.setItem(KEY,payload);
  writeOfflineSnapshot(payload);
}
window.addEventListener('pagehide',()=>flushSave('pagehide'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave('hidden')});
window.addEventListener('online',()=>{state._online=true;save('online')});
window.addEventListener('offline',()=>{state._online=false;save('offline')});
ensureCollections();
repairStateIndexes();

function repairStateIndexes(){
  ensureCollections();
  const ids=new Set(Object.keys(state.supplyItems||{}));
  (state.invoices||[]).forEach(inv=>{
    if(!Array.isArray(inv.services))inv.services=[];
    if(!Array.isArray(inv.supplies))inv.supplies=[];
    inv.supplies.forEach(s=>{
      if(s.supplyId && !ids.has(s.supplyId))s.supplyId='';
      s.qty=Number(s.qty||0);
      s.amount=Number(s.amount||0);
    });
    recalcInvoice?.(inv);
  });
  Object.keys(state.supplyItems||{}).forEach(id=>recalcSupplyRemaining?.(id));
}

let NORMALIZING_STATE=false;
function normalizeMathState(){
  if(NORMALIZING_STATE)return;
  NORMALIZING_STATE=true;
  try{
    ensureCollections();
    // Normalize invoice totals without triggering render/save recursion.
    (state.invoices||[]).forEach(inv=>{
      if(!Array.isArray(inv.services))inv.services=[];
      if(!Array.isArray(inv.supplies))inv.supplies=[];
      inv.services.forEach(line=>{line.amount=Number(roundMoney(line.amount||0));});
      inv.supplies.forEach(line=>recalcSupplyLine(line));
      const total=[...(inv.services||[]),...(inv.supplies||[])].reduce((sum,line)=>sum+Number(line.amount||0),0);
      inv.total=Number(roundMoney(total));
      inv.paid=Number(roundMoney(inv.paid||0));
      inv.status=getInvoiceStatus(inv).toLowerCase();
    });
    // Normalize supply remaining from inventory purchased minus invoice usage.
    Object.keys(state.supplyItems||{}).forEach(id=>{
      const item=state.supplyItems[id];
      if(!item)return;
      if(!Array.isArray(item.inventoryLog))item.inventoryLog=[];
      const totals=supplyTotals(id);
      item.quantityRemaining=Math.max(Number(roundMoney(Number(totals.purchased||0)-Number(totals.used||0),4)),0);
      if(item.price!=='' && item.quantityForPrice!==''){
        const cost=Number(item.price||0), amount=Number(item.quantityForPrice||0);
        item.pricePerUnit=(cost>0&&amount>0)?roundMoney(cost/amount,4):'';
      }
    });
  }catch(e){console.warn('State normalization warning',e)}
  finally{NORMALIZING_STATE=false;}
}
function firstTab(section){return SECTIONS[section]?.tabs?.[0]?.[0]||''}
function goToFirstTab(section=state.section){if(!SECTIONS[section])section='schedule';state.section=section;state.tabs[section]=firstTab(section);save();render()}
function forceStartupTab(){state.section='schedule';state.tabs.schedule='calendar'}
forceStartupTab();
function uid(){return crypto.randomUUID?crypto.randomUUID():'id'+Date.now()+Math.random().toString(16).slice(2)}
function dateKey(d){let x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function makeKey(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function parseKey(k){let [y,m,d]=k.split('-').map(Number);return {y,m:m-1,d}}
function ensureDay(k){if(!state.calendarData[k])state.calendarData[k]={agenda:[],tasks:[],notes:''};if(!state.calendarData[k].agenda)state.calendarData[k].agenda=[];if(!state.calendarData[k].tasks)state.calendarData[k].tasks=[];if(state.calendarData[k].notes===undefined)state.calendarData[k].notes='';return state.calendarData[k]}
function setSection(s){autosaveCurrentPage('section-change');if(!SECTIONS[s])s='schedule';state.section=s;state.tabs[s]=firstTab(s);save();render()}
function setTab(t){autosaveCurrentPage('tab-change');ensureCollections();let tabs=SECTIONS[state.section]?.tabs||[];let valid=tabs.some(tab=>tab[0]===t);let next=valid?t:(tabs[0]?.[0]||'');if(state.section==='supplies'&&next==='item'){state.selectedSupplyId='';}state.tabs[state.section]=next;save();render()}
function render(){ensureCollections();if(!SECTIONS[state.section])state.section='schedule';document.body.dataset.section=state.section;if(!state.tabs[state.section])state.tabs[state.section]=SECTIONS[state.section].tabs[0][0];document.querySelectorAll('.sideTab').forEach(b=>b.classList.toggle('active',b.dataset.section===state.section));subtitle.textContent=SECTIONS[state.section].sub;subtabs.innerHTML=SECTIONS[state.section].tabs.map(t=>`<button class="subtab ${state.tabs[state.section]===t[0]?'active':''}" onclick="setTab('${t[0]}')">${t[1]}</button>`).join('');let tab=SECTIONS[state.section].tabs.find(t=>t[0]===state.tabs[state.section])||SECTIONS[state.section].tabs[0];state.tabs[state.section]=tab[0];if(state.section==='schedule'&&tab[0]==='calendar'){content.innerHTML=renderScheduleCalendar();return}if(state.section==='schedule'&&tab[0]==='newJob'){content.innerHTML=renderJobForm();return}if(state.section==='schedule'&&tab[0]==='newEvent'){content.innerHTML=renderEventForm();return}if(state.section==='clients'&&tab[0]==='directory'){content.innerHTML=renderClientDirectory();return}if(state.section==='clients'&&tab[0]==='client'){content.innerHTML=renderClientRecord();let inv=findOpenInvoice(state.selectedClient||Object.keys(state.clients||{}).sort()[0]||'');if(inv)setTimeout(()=>setupClientSignaturePad(inv.id),50);return}if(state.section==='clients'&&tab[0]==='invoices'){content.innerHTML=renderClientInvoices();return}if(state.section==='supplies'&&tab[0]==='list'){content.innerHTML=renderSupplyList();return}if(state.section==='supplies'&&tab[0]==='item'){content.innerHTML=renderSupplyItem();return}if(state.section==='supplies'&&tab[0]==='receipts'){content.innerHTML=renderSupplyReceipts();return}if(state.section==='studio'&&tab[0]==='pad'){state.scratchPad.activeTab='pad';content.innerHTML=renderStudioPage();setTimeout(initScratchPad,50);return}if(state.section==='studio'&&tab[0]==='gallery'){state.scratchPad.activeTab='gallery';content.innerHTML=renderStudioPage();return}content.innerHTML=pageTemplate(state.section,tab)}
function pageTemplate(section,tab){return `<div class="titleRow"><div><h2>${tab[1]}</h2><p>${tab[2]}</p></div><div class="note">Blank Page Template</div></div><div class="box"><p>This page is ready to build next.</p></div>`}
function renderScheduleCalendar(){let y=state.year||now.getFullYear(),m=state.month??now.getMonth();state.year=y;state.month=m;let first=new Date(y,m,1).getDay(),total=new Date(y,m+1,0).getDate(),todayKey=dateKey(new Date());let monthTabs=MONTHS.map((name,i)=>`<button class="monthBtn ${i===m?'active':''}" onclick="setCalendarMonth(${i})">${name}</button>`).join('');let days=['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d=>`<div>${d}</div>`).join('');let grid='';for(let i=0;i<first;i++)grid+=`<div class="calDay blank"></div>`;for(let d=1;d<=total;d++){let k=makeKey(y,m,d),data=ensureDay(k),agenda=data.agenda||[];let previews=agenda.slice(0,3).map(item=>`<div class="preview ${item.canceled?'canceled':''}">${formatTime(item.time)}: ${escapeHtml(item.title||'')}</div>`).join('');if(agenda.length>3)previews+=`<div class="preview">+${agenda.length-3} more</div>`;grid+=`<div class="calDay ${k===state.selectedDate?'selected':''} ${k===todayKey?'today':''}" onclick="selectCalendarDay('${k}')"><div class="dayNum">${d}</div>${previews}</div>`}let selectedData=ensureDay(state.selectedDate),selectedDateObj=new Date(state.selectedDate+'T12:00:00');return `<div class="monthTabs">${monthTabs}</div><div class="calendarTitle"><button onclick="changeCalendarYear(-1)">‹ ${y-1}</button><h2>${FULL_MONTHS[m]} ${y}</h2><button onclick="changeCalendarYear(1)">${y+1} ›</button></div><div class="weekdays">${days}</div><div class="calendarGrid">${grid}</div><div class="dayBottom compactDayBottom"><div class="dailyBox compactDailyBox"><h3>${selectedDateObj.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'})}</h3><h4>Agenda</h4><div class="compactScrollArea">${selectedData.agenda.map((item,idx)=>`<div class="agendaRow ${item.canceled?'canceled':''}"><span>${formatTime(item.time)}: ${escapeHtml(item.title||'')}</span><button class="smallBtn" onclick="toggleCancel(${idx})">×</button></div>`).join('')||'<p class="note">No agenda items yet.</p>'}</div><div class="addRow compactAddRow"><input id="newAgendaTime"><input id="newAgendaTitle"><button onclick="addAgenda()">Add</button></div></div><div class="dailyBox compactDailyBox"><h4>Tasks</h4><div class="compactScrollArea">${selectedData.tasks.map((task,idx)=>`<div class="taskRow ${task.done?'done':''}"><input type="checkbox" ${task.done?'checked':''} onchange="updateTask(${idx},'done',this.checked)"><input type="text" value="${escapeHtml(task.text||'')}" oninput="updateTask(${idx},'text',this.value)"><button class="smallBtn" onclick="deleteTask(${idx})">×</button></div>`).join('')||'<p class="note">No tasks yet.</p>'}</div><div class="addTaskRow compactAddRow"><input id="newTaskText"><button onclick="addTask()">Add</button></div><textarea class="notesArea compactNotesArea" placeholder="Notes" oninput="updateNotes(this.value)">${escapeHtml(selectedData.notes||'')}</textarea></div></div>${renderTimeCardModule()}${renderReminderModule()}`}
function renderJobForm(){let names=Object.keys(state.clients||{}).sort();let draft=state.drafts?.newJob||{};return `<div class="titleRow"><div><h2>New Job Entry</h2><p>Saves to calendar, creates client file, and starts/updates client invoice.</p></div><div class="note">Schedule / Job</div></div><div class="box"><datalist id="clientNames">${names.map(n=>`<option value="${escapeHtml(n)}"></option>`).join('')}</datalist><label>Date</label><input id="jobDate" type="date" value="${escapeHtml(draft.date||state.selectedDate)}"><label>Job Status</label><select id="jobStatus"><option value="scheduled" ${draft.status==='scheduled'?'selected':''}>Scheduled Job</option><option value="completed" ${draft.status==='completed'?'selected':''}>Completed Job</option></select><label>Title / Service</label><input id="jobTitle" value="${escapeHtml(draft.title||'')}"><div class="two"><div><label>Time In</label><input id="jobStart" value="${escapeHtml(draft.time||'')}" oninput="calcJobPay()"></div><div><label>Time Out</label><input id="jobEnd" value="${escapeHtml(draft.end||'')}" oninput="calcJobPay()"></div></div><label>Total Hours</label><input id="jobHours" type="number" step="0.25" value="${escapeHtml(draft.hours||'')}" oninput="calcJobPay()"><div class="two"><div><label>Pay Type</label><select id="jobPayType" onchange="calcJobPay()"><option value="hourly" ${draft.payType!=='flat'?'selected':''}>Hourly</option><option value="flat" ${draft.payType==='flat'?'selected':''}>Flat Rate</option></select></div><div><label>Rate / Flat Amount</label><input id="jobRate" type="number" step="0.01" value="${escapeHtml(draft.rate||'')}" oninput="calcJobPay()"></div></div><label>Total Price</label><input id="jobOwed" type="number" step="0.01" value="${escapeHtml(draft.owed||'')}" readonly><label>Amount Received</label><input id="jobReceived" type="number" step="0.01" value="${escapeHtml(draft.received||'')}"><label>Client / Contact Name</label><input id="jobClient" list="clientNames" autocomplete="off" value="${escapeHtml(draft.client||'')}" oninput="handleClientPredictiveInput('jobClient','job')" onfocus="showClientSuggestions('jobClient','job')"><div id="jobClientSuggest" class="suggestBox"></div><label>Phone</label><input id="jobPhone" value="${escapeHtml(draft.phone||'')}"><label>Address</label><input id="jobAddress" value="${escapeHtml(draft.address||'')}"><label>Notes</label><textarea id="jobNotes">${escapeHtml(draft.notes||'')}</textarea><div class="actions"><button class="save" onclick="saveJob()">Save Job</button><button onclick="setTab('calendar')">Back</button></div></div>`}
function renderEventForm(){let draft=state.drafts?.newEvent||{};return `<div class="titleRow"><div><h2>New Event Entry</h2><p>Add personal events. Events show on the calendar but do not count as jobs.</p></div><div class="note">Schedule / Event</div></div><div class="box"><label>Date</label><input id="eventDate" type="date" value="${escapeHtml(draft.date||state.selectedDate)}"><label>Title</label><input id="eventTitle" value="${escapeHtml(draft.title||'')}"><label>Time</label><input id="eventTime" value="${escapeHtml(draft.time||'')}"><label>Location</label><input id="eventLocation" value="${escapeHtml(draft.location||'')}"><label>Notes</label><textarea id="eventNotes">${escapeHtml(draft.notes||'')}</textarea><div class="actions"><button class="save" onclick="saveEvent()">Save Event</button><button onclick="setTab('calendar')">Back</button></div></div>`}
function renderClientDirectory(){syncClientsFromJobs();let names=Object.keys(state.clients||{}).sort((a,b)=>a.localeCompare(b));return `<div class="titleRow"><div><h2>Client Directory</h2><p>Alphabetical list. Tap a client to open their file.</p></div><div class="actions"><button class="save" onclick="openNewClientJob()">+ Add Client</button><div class="note">${names.length} clients</div></div></div><div class="clientList">${names.map(n=>{let t=clientTotals(n);return `<div class="clientCard" onclick="openClient('${escapeAttr(n)}')"><b>${escapeHtml(n)}</b><small>${escapeHtml(state.clients[n].phone||'')} ${escapeHtml(state.clients[n].address||'')}</small><br><small>${t.hours.toFixed(2)} hrs • Paid ${money(t.paid)} • Owed ${money(t.balance)}</small></div>`}).join('')||'<p class="note">No clients yet. Save a job with a client name to auto-create one.</p>'}</div>`}
function renderClientRecord(){syncClientsFromJobs();let n=state.selectedClient||Object.keys(state.clients||{}).sort()[0]||'';state.selectedClient=n;if(!n)return `<div class="titleRow"><div><h2>Client Record</h2><p>No client selected yet.</p></div></div>`;let c=state.clients[n]||{},t=clientTotals(n),jobs=jobsForClient(n);let inv=findOpenInvoice(n);return `<div class="titleRow"><div><h2>${escapeHtml(n)}</h2><p>Client file, current invoice, and job history.</p></div><button onclick="setTab('directory')">Directory</button></div><div class="trackers"><div class="tracker">Hours<b>${t.hours.toFixed(2)}</b></div><div class="tracker">Charged<b>${money(t.charged)}</b></div><div class="tracker">Paid<b>${money(t.paid)}</b></div><div class="tracker">Balance<b>${money(t.balance)}</b></div></div><div class="box"><label>Name</label><input id="clientNameEdit" value="${escapeHtml(n)}" autocomplete="off" oninput="handleClientPredictiveInput('clientNameEdit','clientEdit')" onfocus="showClientSuggestions('clientNameEdit','clientEdit')"><div id="clientNameEditSuggest" class="suggestBox"></div><label>Phone</label><input id="clientPhoneEdit" value="${escapeHtml(c.phone||'')}"><label>Address</label><input id="clientAddressEdit" value="${escapeHtml(c.address||'')}"><label>Notes</label><textarea id="clientNotesEdit">${escapeHtml(c.notes||'')}</textarea><div class="actions"><button class="save" onclick="saveClientEdit()">Save Client</button></div></div><h3>Current Invoice</h3><div id="clientInvoiceEmbed" class="clientInvoiceEmbed">${inv?clientInvoiceEmbedHtml(inv):`<div class="box"><p class="note">No current invoice for this client.</p><button class="save" onclick="createInvoiceForSelectedClient()">+ Start Invoice</button></div>`}</div><h3>Job History</h3><div class="clientList">${jobs.map(j=>`<div class="historyCard"><b>${escapeHtml(j.date)} — ${formatTime(j.time)}: ${escapeHtml(j.title)}</b><small>${j.status||''} • ${Number(j.hours||0).toFixed(2)} hrs • Charged ${money(j.owed)} • Paid ${money(j.received)}</small></div>`).join('')||'<p class="note">No jobs for this client yet.</p>'}</div>`}
function renderClientInvoices(){ensureCollections();let invoices=state.invoices||[];return `<div class="titleRow"><div><h2>Invoices</h2><p>Create, sign, send, and store payment receipts.</p></div><button class="save" onclick="newInvoice()">+ New Invoice</button></div><div class="clientList">${invoices.map(inv=>`<div class="invoiceCard ${invoiceStatusClass(inv)}" onclick="openInvoice('${inv.id}')"><b>#${inv.number} — ${escapeHtml(inv.client||'No Client')}</b><small>${escapeHtml(inv.date||'')} • ${getInvoiceStatus(inv)}</small><br><small>Total ${money(inv.total)} • Paid ${money(inv.paid)} • Balance ${money(invoiceBalance(inv))}</small></div>`).join('')||'<p class="note">No invoices yet. Save a job with a client to auto-start one, or tap New Invoice.</p>'}</div>`}

function renderSupplyList(){
 ensureCollections();
 let items=getSupplyArray();
 return `<div class="titleRow"><div><h2>Supplies List</h2><p>Tap Add for quick entry, or tap + Add Item to open the full blank item form.</p></div><div class="actions"><button class="save" type="button" onclick="openQuickSupplyModal()">Add</button><button class="save" type="button" onclick="newSupplyItem()">+ Add Item</button></div></div><div class="box"><div class="supplyHeader"><b>Item #</b><b>Item Name</b><b>Qty Remaining</b><b>Action</b></div>${items.map(item=>`<div class="supplyRowList"><span onclick="openSupplyItem('${item.id}')">${item.itemNumber}</span><span onclick="openSupplyItem('${item.id}')">${escapeHtml(item.name||'Untitled Supply')}</span><span onclick="openSupplyItem('${item.id}')">${formatQty(item.quantityRemaining,item.unit)}</span><button class="delete smallBtn" type="button" onclick="deleteSupplyItemFromList(event,'${item.id}')">Delete</button></div>`).join('')||'<p class="note">No supplies yet. Tap Add for quick entry or + Add Item for the full form.</p>'}</div><div id="quickSupplyModal" class="quickSupplyOverlay hidden" onclick="closeQuickSupplyModal(event)"><div class="quickSupplyBox" onclick="event.stopPropagation()"><div class="titleRow miniTitle"><div><h3>Quick Add Supply</h3><p class="note">Enter the basic item info. You can fill in more details later.</p></div><button class="smallBtn" type="button" onclick="closeQuickSupplyModal()">×</button></div><label>Item Name</label><input id="quickSupplyName" placeholder="Example: String" onkeydown="quickSupplyKey(event)"><label>Price / Cost</label><input id="quickSupplyPrice" type="number" step="0.01" placeholder="Example: 11.99" onkeydown="quickSupplyKey(event)"><div class="actions"><button class="save" type="button" onclick="addQuickSupplyFromList()">Save Item</button><button type="button" onclick="closeQuickSupplyModal()">Cancel</button></div></div></div>`
}
function renderSupplyItem(){ensureCollections();let item=getSelectedSupply();if(!item){item=createBlankSupplyItemDraft();}calcSupplyUnitPrice(item.id,{silent:true});recalcSupplyRemaining(item.id,{silent:true});let t=supplyTotals(item.id);let title=item.name?escapeHtml(item.name):'New Supply Item';return `<div class="titleRow"><div><h2>${title}</h2><p>Supply item record + inventory tracker. Inputs autosave as you type.</p></div><button type="button" onclick="autosaveSupplyItemPage();setTab('list')">Supply List</button></div><div class="trackers"><div class="tracker">YTD Spent<b>${money(t.spent)}</b></div><div class="tracker">YTD Used<b>${formatQty(t.used,item.unit)}</b></div><div class="tracker">Remaining<b>${formatQty(item.quantityRemaining,item.unit)}</b></div><div class="tracker">Cost/Unit<b>${money(item.pricePerUnit)}</b></div></div><div class="box"><div class="supplyDetailGrid"><div><label>Picture</label><input type="file" accept="image/*" capture="environment" onchange="attachSupplyPhoto(event,'${item.id}')">${item.photo?`<img class="photo supplyPhoto" src="${item.photo}">`:`<div class="photoPlaceholder">No Picture</div>`}</div><div><label>Item #</label><input id="sItemNumber" value="${escapeHtml(item.itemNumber||'')}" readonly><label>Item Name</label><input id="sName" value="${escapeHtml(item.name||'')}" oninput="updateSupplyField('${item.id}','name',this.value)"><label>Description</label><textarea id="sDesc" oninput="updateSupplyField('${item.id}','description',this.value)">${escapeHtml(item.description||'')}</textarea><label>Supplier / Store / Website</label><input id="sSupplier" value="${escapeHtml(item.supplier||'')}" oninput="updateSupplyField('${item.id}','supplier',this.value)"></div></div><h3>Product / Cost Info</h3><label>Actual Store Item Number / SKU</label><div class="two"><input id="sStoreNumber" value="${escapeHtml(item.storeItemNumber||'')}" oninput="updateSupplyField('${item.id}','storeItemNumber',this.value)"><button type="button" onclick="scanBarcode('${item.id}')">Scan</button></div><div class="two"><div><label>Cost</label><input id="sPrice" type="number" step="0.01" value="${escapeHtml(item.price||'')}" oninput="updateSupplyField('${item.id}','price',this.value);calcSupplyUnitPrice('${item.id}')"></div><div><label>Amount Of Item For That Cost</label><input id="sQtyForPrice" type="number" step="0.01" value="${escapeHtml(item.quantityForPrice||'')}" oninput="updateSupplyField('${item.id}','quantityForPrice',this.value);calcSupplyUnitPrice('${item.id}')"></div></div><div class="two"><div><label>Unit</label><input id="sUnit" value="${escapeHtml(item.unit||'unit')}" oninput="updateSupplyField('${item.id}','unit',this.value);recalcSupplyRemaining('${item.id}',{silent:true})"></div><div><label>Cost Per Unit</label><input id="sPricePerUnit" type="number" step="0.0001" value="${escapeHtml(item.pricePerUnit||'')}" readonly></div></div><h3>Add Inventory</h3><p class="note">Add new inventory here, or correct the current remaining count below if you physically counted stock.</p><div class="two"><div><label>Quantity / Amount Added</label><input id="invAddQty" type="number" step="0.01"></div><div><label>Date</label><input id="invAddDate" value="${new Date().toLocaleDateString()}"></div></div><button class="save" type="button" onclick="addInventoryToSupply('${item.id}')">Add Inventory</button><label>Quantity Remaining / Physical Count</label><input id="sRemaining" type="number" step="0.01" value="${escapeHtml(item.quantityRemaining||0)}" oninput="previewSupplyRemaining('${item.id}',this.value)" onblur="commitSupplyRemainingCorrection('${item.id}',this.value)"><p class="note">This box can be edited for a physical inventory correction. Invoice usage still subtracts from remaining quantity.</p><div class="actions"><button class="save" type="button" onclick="saveSupplyItem('${item.id}')">Save Item</button><button class="delete" type="button" onclick="deleteSupplyItem('${item.id}')">Delete</button></div></div>`}
function renderSupplyInventory(){ensureSupplyDbFromNames();let items=getSupplyArray();return `<div class="titleRow"><div><h2>Inventory</h2><p>All supplies and remaining quantity.</p></div></div><div class="box"><div class="supplyHeader"><b>Item</b><b>Remaining</b><b>Value Left</b></div>${items.map(item=>`<div class="supplyRowList" onclick="openSupplyItem('${item.id}')"><span>${escapeHtml(item.name)}</span><span>${formatQty(item.quantityRemaining,item.unit)}</span><span>${money(Number(item.quantityRemaining||0)*Number(item.pricePerUnit||0))}</span></div>`).join('')||'<p class="note">No inventory yet.</p>'}</div>`}
function renderSupplyReceipts(){let receipts=state.supplyReceipts||[];return `<div class="titleRow"><div><h2>Supply Receipts</h2><p>Take receipt pictures and categorize purchases.</p></div><button class="save" onclick="newSupplyReceipt()">+ Add Receipt</button></div><div class="clientList">${receipts.map(r=>`<div class="invoiceCard" onclick="openSupplyReceipt('${r.id}')"><b>${escapeHtml(r.title||'Receipt')}</b><small>${escapeHtml(r.date||'')} • ${escapeHtml(r.category||'Uncategorized')} • ${money(r.amount)}</small></div>`).join('')||'<p class="note">No receipts yet.</p>'}</div>`}

function readSupplyFormIntoState(id){
 let item=state.supplyItems?.[id];
 if(!item)return null;
 let fields=[
  ['sName','name'],['sDesc','description'],['sSupplier','supplier'],['sStoreNumber','storeItemNumber'],
  ['sPrice','price'],['sQtyForPrice','quantityForPrice'],['sUnit','unit']
 ];
 fields.forEach(([elId,key])=>{
  let el=document.getElementById(elId);
  if(el)item[key]=el.value;
 });
 item.name=String(item.name||'').trim();
 item.unit=String(item.unit||'').trim()||'unit';
 return item;
}
function finalizeSupplyItemName(item){
 if(!item)return '';
 item.name=String(item.name||'').trim()||`Supply ${item.itemNumber||''}`.trim()||'Untitled Supply';
 return item.name;
}
function createBlankSupplyItemDraft(){
 ensureCollections();
 let id=uid();
 let number=nextSupplyNumber();
 let item={id,itemNumber:number,name:'',description:'',storeItemNumber:'',price:'',quantityForPrice:'',unit:'unit',pricePerUnit:'',quantityRemaining:0,supplier:'',photo:'',inventoryLog:[],isDraft:true};
 state.supplyItems[id]=item;
 state.selectedSupplyId=id;
 save();
 return item;
}

function saveSupplyItem(id){
 let item=readSupplyFormIntoState(id);
 if(!item)return;
 finalizeSupplyItemName(item);
 item.isDraft=false;
 calcSupplyUnitPrice(id);
 recalcSupplyRemaining(id);
 addSupplyToDb(item.name);
 goToFirstTab('supplies');
}
function newSupplyItem(){ensureCollections();createBlankSupplyItemDraft();state.section='supplies';state.tabs.supplies='item';save();render()}
function openQuickSupplyModal(){
 let modal=document.getElementById('quickSupplyModal');
 if(!modal)return;
 modal.classList.remove('hidden');
 setTimeout(()=>document.getElementById('quickSupplyName')?.focus(),30);
}
function closeQuickSupplyModal(event){
 if(event && event.target && event.currentTarget && event.target!==event.currentTarget)return;
 let modal=document.getElementById('quickSupplyModal');
 if(modal)modal.classList.add('hidden');
}
function quickSupplyKey(event){
 if(event && event.key==='Enter'){
   event.preventDefault();
   addQuickSupplyFromList();
 }
 if(event && event.key==='Escape'){
   event.preventDefault();
   closeQuickSupplyModal();
 }
}
function addQuickSupplyFromList(){
 ensureCollections();
 let name=String(document.getElementById('quickSupplyName')?.value||'').trim();
 let price=Number(document.getElementById('quickSupplyPrice')?.value||0);
 if(!name){alert('Enter an item name first.');return;}
 if(price<0){alert('Price cannot be negative.');return;}
 let existing=findSupplyByName(name);
 if(existing){
   state.selectedSupplyId=existing.id;
   state.section='supplies';
   state.tabs.supplies='item';
   save('quick-supply-existing');
   render();
   return;
 }
 let id=uid();
 let number=nextSupplyNumber();
 let item={id,itemNumber:number,name,description:'',storeItemNumber:'',price:price?price:'',quantityForPrice:price?1:'',unit:'unit',pricePerUnit:price?roundMoney(price,4):'',quantityRemaining:0,supplier:'',photo:'',inventoryLog:[],isDraft:false};
 state.supplyItems[id]=item;
 state.selectedSupplyId=id;
 addSupplyToDb(name);
 save('quick-supply-new');
 render();
}
function deleteSupplyItemFromList(event,id){
 if(event)event.stopPropagation();
 deleteSupplyItem(id);
}

function openSupplyItem(id){state.selectedSupplyId=id;state.tabs.supplies='item';save();render()}
function getSelectedSupply(){return state.supplyItems?.[state.selectedSupplyId]||null}
function getSupplyArray(){ensureCollections();return Object.values(state.supplyItems||{}).filter(item=>!item.isDraft).sort((a,b)=>Number(a.itemNumber||0)-Number(b.itemNumber||0))}
function nextSupplyNumber(){
 ensureCollections();
 let max=Object.values(state.supplyItems||{}).reduce((highest,item)=>Math.max(highest,Number(item.itemNumber||0)),0);
 let next=Math.max(Number(state.supplyCounter||1),max+1);
 state.supplyCounter=next+1;
 return next;
}

function ensureSupplyDbFromNames(){
 ensureCollections();
 let names=new Set();
 (state.supplies||[]).forEach(name=>{name=String(name||'').trim();if(name)names.add(name)});
 Object.values(state.supplyItems||{}).forEach(item=>{let name=String(item.name||'').trim();if(name&&!item.isDraft)names.add(name)});
 state.supplies=Array.from(names).sort((a,b)=>a.localeCompare(b));
 return state.supplies;
}
function supplyDatalistOptions(){
 return ensureSupplyDbFromNames().map(s=>`<option value="${escapeHtml(s)}"></option>`).join('');
}
function createSupplyFromInvoiceName(name){
 ensureCollections();
 name=String(name||'').trim();
 if(!name)return null;
 let existing=findSupplyByName(name);
 if(existing)return existing;
 let id=uid();
 let item={id,itemNumber:nextSupplyNumber(),name,description:'Created from invoice supply entry',storeItemNumber:'',price:'',quantityForPrice:'',unit:'unit',pricePerUnit:'',quantityRemaining:0,supplier:'',photo:'',inventoryLog:[],isDraft:false};
 state.supplyItems[id]=item;
 addSupplyToDb(name);
 return item;
}
function calcSupplyLineAmount(name,qty){
 let item=findSupplyByName(name);
 return item?Number(item.pricePerUnit||0)*Number(qty||0):0;
}
function supplyLineMeta(line){
 let item=line?.supplyId?state.supplyItems?.[line.supplyId]:findSupplyByName(line?.name);
 let unit=item?.unit||line?.unit||'unit';
 let pricePerUnit=Number(item?.pricePerUnit||line?.pricePerUnit||0);
 return {item,unit,pricePerUnit};
}
function recalcSupplyLine(line){
 if(!line)return line;
 let meta=supplyLineMeta(line);
 line.unit=meta.unit;
 line.pricePerUnit=meta.pricePerUnit;
 line.amount=Number(roundMoney(Number(line.qty||0)*Number(line.pricePerUnit||0)));
 if(meta.item)line.supplyId=meta.item.id;
 return line;
}
function invoiceSupplyLineHtml(inv,line,idx,mode){
 let meta=supplyLineMeta(line);
 let prefix=mode==='client'?'clientInv':'fullInv';
 return `<div class="lineItem supplyLine"><span>${escapeHtml(line.name)}<small>${Number(line.qty||0)} ${escapeHtml(meta.unit)} × ${money(meta.pricePerUnit)} / ${escapeHtml(meta.unit)}</small></span><input aria-label="Quantity used" type="number" step="0.01" value="${Number(line.qty||0)}" oninput="updateInvoiceSupplyQty('${inv.id}',${idx},this.value,'${mode}')"><input aria-label="Supply cost" type="number" step="0.01" value="${Number(line.amount||0).toFixed(2)}" oninput="updateInvoiceLine('${inv.id}','supplies',${idx},this.value)"><button class="smallBtn" type="button" onclick="${mode==='client'?'removeClientInvoiceLine':'removeInvoiceLine'}('${inv.id}','supplies',${idx})">×</button></div>`;
}
function invoiceSupplyAddHtml(inv,mode){
 let nameId=mode==='client'?'clientNewSupplyName':'newSupplyName';
 let qtyId=mode==='client'?'clientNewSupplyQty':'newSupplyQty';
 let dataId=mode==='client'?'clientSupplyOptions':'supplyOptions';
 let addFn=mode==='client'?'addClientInvoiceSupply':'addInvoiceSupply';
 return `<datalist id="${dataId}">${supplyDatalistOptions()}</datalist><div class="invoiceSupplyAdd"><div><label>Supply Item Used</label><input id="${nameId}" list="${dataId}" placeholder="Type new or choose saved supply"></div><div><label>Amount Used</label><input id="${qtyId}" type="number" step="0.01" placeholder="Qty used"></div><button class="save" type="button" onclick="${addFn}('${inv.id}')">Add Supply</button></div><p class="note">Saved supplies auto-calculate cost from Cost Per Unit. New typed supplies are added to the supply list with $0 cost until their product cost info is filled in.</p>`;
}

function updateSupplyField(id,key,value){let item=state.supplyItems[id];if(!item)return;item[key]=value;if(key==='name'){addSupplyToDb(value);item.isDraft=!String(value||'').trim()}if(['price','quantityForPrice'].includes(key))calcSupplyUnitPrice(id,{silent:true});if(key==='unit')recalcSupplyRemaining(id,{silent:true});save('supply-field')}
function calcSupplyUnitPrice(id,opts={}){
 let item=state.supplyItems[id];
 if(!item)return;
 let priceEl=document.getElementById('sPrice');
 let qtyEl=document.getElementById('sQtyForPrice');
 if(priceEl)item.price=priceEl.value;
 if(qtyEl)item.quantityForPrice=qtyEl.value;
 let cost=Number(item.price||0);
 let amount=Number(item.quantityForPrice||0);
 if(cost>0 && amount>0){
   item.pricePerUnit=roundMoney(cost/amount,4);
 }else{
   item.pricePerUnit='';
 }
 let el=document.getElementById('sPricePerUnit');
 if(el)el.value=item.pricePerUnit||'';
 if(!opts.silent)save('supply-unit-price');
 return item.pricePerUnit;
}
function attachSupplyPhoto(e,id){let file=e.target.files[0];if(!file)return;let reader=new FileReader();reader.onload=()=>{let item=state.supplyItems[id];if(item){item.photo=reader.result;save();render()}};reader.readAsDataURL(file)}
function deleteSupplyItem(id){ensureCollections();let item=state.supplyItems[id];if(!item)return;let used=(state.invoices||[]).some(inv=>(inv.supplies||[]).some(s=>s.supplyId===id));let msg=used?'This supply is already used on at least one invoice. Delete it from the supply list anyway? Existing invoices will keep their line item history.':'Delete this supply item?';if(!confirm(msg))return;delete state.supplyItems[id];state.supplies=(state.supplies||[]).filter(name=>String(name||'').trim().toLowerCase()!==String(item.name||'').trim().toLowerCase() || findSupplyByName(name));if(state.selectedSupplyId===id)state.selectedSupplyId='';state.section='supplies';state.tabs.supplies='list';save();render()}
function supplyTotals(id){
 let item=state.supplyItems[id];
 if(!item)return{spent:0,used:0,purchased:0};
 let spent=0,used=0,purchased=0;
 (item.inventoryLog||[]).forEach(log=>{
   purchased+=Number(log.qty||0);
   spent+=Number(log.cost||0);
 });
 (state.supplyReceipts||[]).forEach(r=>{
   (r.items||[]).forEach(i=>{
     if(i.supplyId===id){
       purchased+=Number(i.qty||0);
       spent+=Number(i.amount||0);
     }
   });
 });
 (state.invoices||[]).forEach(inv=>{
   (inv.supplies||[]).forEach(s=>{
     if(s.supplyId===id || s.name===item.name){
       used+=Number(s.qty||0);
     }
   });
 });
 return{spent,used,purchased};
}
function findSupplyByName(name){
 ensureCollections();
 let target=String(name||'').trim().toLowerCase();
 if(!target)return null;
 return Object.values(state.supplyItems||{}).find(item=>!item.isDraft&&String(item.name||'').trim().toLowerCase()===target)||null;
}
function recalcSupplyRemaining(id,opts={}){
 let item=state.supplyItems?.[id];
 if(!item)return;
 if(!item.inventoryLog)item.inventoryLog=[];
 let totals=supplyTotals(id);
 item.quantityRemaining=Math.max(Number(totals.purchased||0)-Number(totals.used||0),0);
 let el=document.getElementById('sRemaining');
 if(el&&document.activeElement!==el)el.value=item.quantityRemaining;
 if(!opts.silent)save('supply-remaining');
}
function previewSupplyRemaining(id,value){let item=state.supplyItems?.[id];if(!item)return;item.quantityRemaining=Number(value||0);save('supply-remaining-preview')}
function commitSupplyRemainingCorrection(id,value){let item=readSupplyFormIntoState(id);if(!item)return;let desired=Number(value||0);let totals=supplyTotals(id);let current=Math.max(Number(totals.purchased||0)-Number(totals.used||0),0);let diff=roundMoney(desired-current,4);if(!item.inventoryLog)item.inventoryLog=[];if(Math.abs(diff)>0.0001){item.inventoryLog.push({id:uid(),qty:diff,date:new Date().toLocaleDateString(),cost:0,type:'manual-count-adjustment'});}item.isDraft=false;finalizeSupplyItemName(item);calcSupplyUnitPrice(id,{silent:true});recalcSupplyRemaining(id);addSupplyToDb(item.name);save('supply-remaining-correction')}
function recalcAllSupplyRemaining(){ensureCollections();Object.keys(state.supplyItems||{}).forEach(id=>recalcSupplyRemaining(id));}
function addInventoryToSupply(id){
 let item=readSupplyFormIntoState(id);
 if(!item)return;
 let qty=Number(document.getElementById('invAddQty')?.value||0);
 if(!qty || qty<0){
   alert('Enter a quantity greater than 0.');
   return;
 }
 finalizeSupplyItemName(item);
 calcSupplyUnitPrice(id);
 if(!item.inventoryLog)item.inventoryLog=[];
 item.inventoryLog.push({id:uid(),qty,date:document.getElementById('invAddDate')?.value||new Date().toLocaleDateString(),cost:Number(item.pricePerUnit||0)*qty});
 item.isDraft=false;
 recalcSupplyRemaining(id);
 addSupplyToDb(item.name);
 save();
 state.section='supplies';
 state.tabs.supplies='item';
 state.selectedSupplyId=id;
 render();
}
function formatQty(q,unit){if(q===''||q===undefined||q===null)return'—';return `${Number(q||0)} ${unit||'unit'}`}
function newSupplyReceipt(){let id=uid();let r={id,title:'New Receipt',date:new Date().toLocaleDateString(),category:'Yard Supplies',amount:0,image:'',items:[]};state.supplyReceipts.push(r);save();openSupplyReceipt(id)}
function openSupplyReceipt(id){let r=state.supplyReceipts.find(x=>x.id===id);if(!r)return;content.innerHTML=`<div class="titleRow"><div><h2>${escapeHtml(r.title||'Receipt')}</h2><p>${escapeHtml(r.date||'')} • ${escapeHtml(r.category||'')}</p></div><button onclick="setTab('receipts')">Back</button></div><div class="box"><label>Receipt Name</label><input id="receiptTitle" value="${escapeHtml(r.title||'')}" oninput="updateReceipt('${id}','title',this.value)"><label>Date</label><input id="receiptDate" value="${escapeHtml(r.date||'')}" oninput="updateReceipt('${id}','date',this.value)"><label>Category</label><input id="receiptCategory" value="${escapeHtml(r.category||'')}" oninput="updateReceipt('${id}','category',this.value)"><label>Total Price</label><input id="receiptAmount" type="number" step="0.01" value="${Number(r.amount||0)}" oninput="updateReceipt('${id}','amount',this.value)"><label>Receipt Photo</label><input type="file" accept="image/*" capture="environment" onchange="attachReceiptPhoto(event,'${id}')">${r.image?`<img class="photo" src="${r.image}">`:''}<div class="actions"><button class="save" onclick="goToFirstTab('supplies')">Save Receipt</button><button onclick="setTab('receipts')">Back</button><button class="delete" onclick="deleteReceipt('${id}')">Delete</button></div></div>`}
function updateReceipt(id,key,value){let r=state.supplyReceipts.find(x=>x.id===id);if(!r)return;r[key]=key==='amount'?Number(value||0):value;save()}
function attachReceiptPhoto(e,id){let file=e.target.files[0];if(!file)return;let reader=new FileReader();reader.onload=()=>{let r=state.supplyReceipts.find(x=>x.id===id);if(r){r.image=reader.result;save();openSupplyReceipt(id)}};reader.readAsDataURL(file)}
function deleteReceipt(id){state.supplyReceipts=state.supplyReceipts.filter(r=>r.id!==id);save();setTab('receipts')}


function createInvoiceForSelectedClient(){let client=state.selectedClient||'';if(!client)return;let inv=createBlankInvoice(client);save();render()}
function getOrCreateClientActiveInvoice(client){ensureCollections();let inv=findOpenInvoice(client);if(!inv){inv=createBlankInvoice(client);save()}return inv}
function clientInvoiceEmbedHtml(inv){if(!inv)return'<p class="note">No current invoice.</p>';let serviceOptions=(state.services||[]).map(s=>`<option value="${escapeHtml(s)}"></option>`).join('');return `<div class="box embeddedInvoice"><div class="titleRow miniTitle"><div><h2>Invoice #${inv.number}</h2><p>${getInvoiceStatus(inv)} • Total ${money(inv.total)} • Balance ${money(invoiceBalance(inv))}</p></div><button onclick="openInvoice('${inv.id}')">Full View</button></div><datalist id="clientServiceOptions">${serviceOptions}</datalist><label>Date</label><input value="${escapeHtml(inv.date||'')}" oninput="updateInvoiceField('${inv.id}','date',this.value)"><h4>Services</h4>${(inv.services||[]).map((s,idx)=>`<div class="lineItem"><span>${escapeHtml(s.name)}${s.qty?` (${s.qty})`:''}</span><input type="number" step="0.01" value="${Number(s.amount||0)}" oninput="updateInvoiceLine('${inv.id}','services',${idx},this.value)"><button class="smallBtn" onclick="removeClientInvoiceLine('${inv.id}','services',${idx})">×</button></div>`).join('')||'<p class="note">No services yet.</p>'}<div class="two"><input id="clientNewServiceName" list="clientServiceOptions"><input id="clientNewServiceAmount" type="number" step="0.01"></div><button onclick="addClientInvoiceService('${inv.id}')">Add Service</button><h4>Supplies</h4>${(inv.supplies||[]).map((s,idx)=>invoiceSupplyLineHtml(inv,s,idx,'client')).join('')||'<p class="note">No supplies yet.</p>'}${invoiceSupplyAddHtml(inv,'client')}<div class="two"><div><label>Amount Paid</label><input type="number" step="0.01" value="${Number(inv.paid||0)}" oninput="updateClientInvoicePaid('${inv.id}',this.value)"></div><div><label>Status</label><input value="${getInvoiceStatus(inv)}" readonly></div></div><label>Notes</label><textarea oninput="updateInvoiceField('${inv.id}','notes',this.value)">${escapeHtml(inv.notes||'')}</textarea><h4>Client Signature</h4><canvas id="clientSignaturePad" class="signature"></canvas><div class="actions"><button onclick="clearInvoiceSignature('${inv.id}')">Clear Signature</button></div><h4>Check Photo</h4><input type="file" accept="image/*" capture="environment" onchange="attachCheckPhoto(event,'${inv.id}')">${inv.checkPhoto?`<img class="photo" src="${inv.checkPhoto}">`:''}<div class="actions"><button class="save" onclick="shareInvoice('${inv.id}','text')">Text Invoice</button><button class="save" onclick="shareInvoice('${inv.id}','email')">Email Invoice</button><button onclick="markClientInvoicePaid('${inv.id}')">Mark Paid</button><button onclick="toggleInvoiceTimeLogs('${inv.id}')">View Time Logs</button></div>${state.invoiceTimeLogOpen===inv.id?invoiceTimeLogsHtml(inv):''}<div class="receipt smallReceipt">${invoiceReceiptHtml(inv)}</div></div>`}
function refreshClientInvoiceEmbed(id){let inv=state.invoices.find(i=>i.id===id);let el=document.getElementById('clientInvoiceEmbed');if(el&&inv){el.innerHTML=clientInvoiceEmbedHtml(inv);setTimeout(()=>setupClientSignaturePad(id),50)}else render()}
function addClientInvoiceService(id){let inv=state.invoices.find(i=>i.id===id);let name=document.getElementById('clientNewServiceName')?.value.trim(),amount=Number(document.getElementById('clientNewServiceAmount')?.value||0);if(!inv||!name)return;addServiceToDb(name);inv.services.push({name,amount});recalcInvoice(inv);refreshClientInvoiceEmbed(id)}
function addClientInvoiceSupply(id){
 let inv=state.invoices.find(i=>i.id===id);
 let name=document.getElementById('clientNewSupplyName')?.value.trim();
 let qty=Number(document.getElementById('clientNewSupplyQty')?.value||0);
 if(!inv||!name)return;
 if(!qty||qty<0)qty=1;
 let item=findSupplyByName(name)||createSupplyFromInvoiceName(name);
 let line={name:item?item.name:name,qty,supplyId:item?item.id:'',unit:item?.unit||'unit',pricePerUnit:Number(item?.pricePerUnit||0),amount:0};
 recalcSupplyLine(line);
 addSupplyToDb(line.name);
 inv.supplies.push(line);
 recalcInvoice(inv);
 if(item)recalcSupplyRemaining(item.id);
 save();
 refreshClientInvoiceEmbed(id);
}
function removeClientInvoiceLine(id,type,idx){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;let line=inv[type]?.[idx];inv[type].splice(idx,1);recalcInvoice(inv);if(type==='supplies'&&line?.supplyId)recalcSupplyRemaining(line.supplyId);refreshClientInvoiceEmbed(id)}
function updateClientInvoicePaid(id,value){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;inv.paid=Number(value||0);recalcInvoice(inv);refreshClientInvoiceEmbed(id)}
function markClientInvoicePaid(id){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;inv.paid=Number(inv.total||0);recalcInvoice(inv);refreshClientInvoiceEmbed(id)}
function setupClientSignaturePad(id){let c=document.getElementById('clientSignaturePad');if(!c)return;let inv=state.invoices.find(i=>i.id===id);let r=c.getBoundingClientRect();c.width=Math.max(300,Math.floor(r.width*2));c.height=220;let ctx=c.getContext('2d');ctx.lineWidth=4;ctx.lineCap='round';ctx.strokeStyle='#111';if(inv&&inv.signature){let img=new Image();img.onload=()=>ctx.drawImage(img,0,0,c.width,c.height);img.src=inv.signature}let drawing=false;let point=e=>{let rr=c.getBoundingClientRect();return{x:(e.clientX-rr.left)*(c.width/rr.width),y:(e.clientY-rr.top)*(c.height/rr.height)}};c.onpointerdown=e=>{drawing=true;let p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};c.onpointermove=e=>{if(!drawing)return;let p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke()};c.onpointerup=()=>{drawing=false;let inv=state.invoices.find(i=>i.id===id);if(inv){inv.signature=c.toDataURL('image/png');save()}};c.onpointerleave=()=>drawing=false}

function setCalendarMonth(m){state.month=m;state.selectedDate=makeKey(state.year,m,1);save();render()}function changeCalendarYear(n){state.year+=n;state.selectedDate=makeKey(state.year,state.month,1);save();render()}function selectCalendarDay(k){state.selectedDate=k;let p=parseKey(k);state.year=p.y;state.month=p.m;save();render()}
function addAgenda(){let time=document.getElementById('newAgendaTime').value.trim(),title=document.getElementById('newAgendaTitle').value.trim();if(!time||!title)return;let d=ensureDay(state.selectedDate);d.agenda.push({time,title,type:'quick',canceled:false});sortAgenda(d.agenda);save();render()}
function saveJob(){let date=document.getElementById('jobDate').value,title=document.getElementById('jobTitle').value,time=document.getElementById('jobStart').value;if(!date||!title)return;calcJobPay();let client=document.getElementById('jobClient').value.trim();let d=ensureDay(date);let job={id:uid(),time,title,type:'job',status:document.getElementById('jobStatus').value,end:document.getElementById('jobEnd').value,payType:document.getElementById('jobPayType').value,rate:document.getElementById('jobRate').value,client,phone:document.getElementById('jobPhone').value,address:document.getElementById('jobAddress').value,hours:document.getElementById('jobHours').value,owed:document.getElementById('jobOwed').value,received:document.getElementById('jobReceived').value,notes:document.getElementById('jobNotes').value,canceled:false};d.agenda.push(job);addServiceToDb(title);if(client){upsertClientFromJob(job);autoInvoiceFromJob(job,date)}sortAgenda(d.agenda);if(state.drafts)delete state.drafts.newJob;state.selectedDate=date;let p=parseKey(date);state.year=p.y;state.month=p.m;goToFirstTab('schedule')}
function saveEvent(){let date=document.getElementById('eventDate').value,title=document.getElementById('eventTitle').value,time=document.getElementById('eventTime').value;if(!date||!title)return;let d=ensureDay(date);d.agenda.push({time,title,type:'event',location:document.getElementById('eventLocation').value,notes:document.getElementById('eventNotes').value,canceled:false});sortAgenda(d.agenda);if(state.drafts)delete state.drafts.newEvent;state.selectedDate=date;let p=parseKey(date);state.year=p.y;state.month=p.m;goToFirstTab('schedule')}
function autoFillClient(){let name=document.getElementById('jobClient')?.value.trim();let c=state.clients?.[name];if(!c)return;let phone=document.getElementById('jobPhone'),address=document.getElementById('jobAddress');if(phone&&!phone.value)phone.value=c.phone||'';if(address&&!address.value)address.value=c.address||''}
function getClientNames(){ensureCollections();syncClientsFromJobs();return Object.keys(state.clients||{}).filter(Boolean).sort((a,b)=>a.localeCompare(b))}
function handleClientPredictiveInput(inputId,mode,invoiceId=''){
 showClientSuggestions(inputId,mode,invoiceId);
 let input=document.getElementById(inputId);
 if(!input)return;
 let name=input.value.trim();
 let c=state.clients?.[name];
 if(c){applyClientDetailsToVisibleForm(name,mode,invoiceId,false)}
}
function showClientSuggestions(inputId,mode,invoiceId=''){
 let input=document.getElementById(inputId),box=document.getElementById(inputId+'Suggest');
 if(!input||!box)return;
 let q=input.value.trim().toLowerCase();
 let names=getClientNames().filter(n=>!q||n.toLowerCase().includes(q)).slice(0,8);
 if(!names.length){box.innerHTML='';box.classList.remove('open');return}
 box.innerHTML=names.map(n=>{let c=state.clients[n]||{};let details=[c.phone,c.address].filter(Boolean).join(' • ');return `<button type="button" class="suggestItem" onclick="selectClientSuggestion('${inputId}','${escapeAttr(n)}','${mode}','${invoiceId}')"><b>${escapeHtml(n)}</b>${details?`<small>${escapeHtml(details)}</small>`:''}</button>`}).join('');
 box.classList.add('open');
}
function selectClientSuggestion(inputId,name,mode,invoiceId=''){
 let input=document.getElementById(inputId);if(input)input.value=name;
 let box=document.getElementById(inputId+'Suggest');if(box){box.innerHTML='';box.classList.remove('open')}
 applyClientDetailsToVisibleForm(name,mode,invoiceId,true);
}
function applyClientDetailsToVisibleForm(name,mode,invoiceId='',force=false){
 let c=state.clients?.[name];if(!c)return;
 if(mode==='job'){
   let phone=document.getElementById('jobPhone'),address=document.getElementById('jobAddress');
   if(phone&&(force||!phone.value))phone.value=c.phone||'';
   if(address&&(force||!address.value))address.value=c.address||'';
 }
 if(mode==='clientEdit'){
   let phone=document.getElementById('clientPhoneEdit'),address=document.getElementById('clientAddressEdit'),notes=document.getElementById('clientNotesEdit');
   if(phone&&(force||!phone.value))phone.value=c.phone||'';
   if(address&&(force||!address.value))address.value=c.address||'';
   if(notes&&(force||!notes.value))notes.value=c.notes||'';
 }
 if(mode==='invoice'&&invoiceId){updateInvoiceClientFromInput(invoiceId,name)}
}
function updateInvoiceClientFromInput(id,value){
 let inv=state.invoices.find(i=>i.id===id);if(!inv)return;
 inv.client=value;
 let name=String(value||'').trim();
 if(name){
   ensureCollections();
   if(!state.clients[name])state.clients[name]={name,phone:'',address:'',notes:''};
 }
 save();
}
function upsertClientFromJob(job){if(!state.clients)state.clients={};let n=job.client.trim();if(!n)return;if(!state.clients[n])state.clients[n]={name:n,phone:'',address:'',notes:''};if(job.phone)state.clients[n].phone=job.phone;if(job.address)state.clients[n].address=job.address;if(job.notes&&!state.clients[n].notes)state.clients[n].notes=job.notes}
function syncClientsFromJobs(){if(!state.clients)state.clients={};Object.keys(state.calendarData||{}).forEach(date=>{(state.calendarData[date].agenda||[]).forEach(a=>{if(a.type==='job'&&a.client)upsertClientFromJob(a)})});save()}

function renderAddClientForm(){
 let draft=state.drafts?.newClient||{};
 content.innerHTML=`<div class="titleRow"><div><h2>Add Client</h2><p>Create a new client file.</p></div><button onclick="setTab('directory')">Back</button></div>
 <div class="box">
   <label>Client Name</label>
   <input id="newClientName" value="${escapeHtml(draft.name||'')}">
   <label>Phone</label>
   <input id="newClientPhone" value="${escapeHtml(draft.phone||'')}">
   <label>Address</label>
   <input id="newClientAddress" value="${escapeHtml(draft.address||'')}">
   <label>Notes</label>
   <textarea id="newClientNotes">${escapeHtml(draft.notes||'')}</textarea>
   <div class="actions">
     <button class="save" onclick="saveNewClient()">Save Client</button>
     <button onclick="setTab('directory')">Cancel</button>
   </div>
 </div>`;
}
function saveNewClient(){
 let name=document.getElementById('newClientName')?.value.trim();
 if(!name)return;
 if(!state.clients)state.clients={};
 state.clients[name]={
   name,
   phone:document.getElementById('newClientPhone')?.value||'',
   address:document.getElementById('newClientAddress')?.value||'',
   notes:document.getElementById('newClientNotes')?.value||''
 };
 state.selectedClient=name;
 if(state.drafts)delete state.drafts.newClient;
 goToFirstTab('clients');
}

function openNewClientJob(){renderAddClientForm()}
function openClient(n){state.selectedClient=n;state.tabs.clients='client';save();render()}function saveClientEdit(){let old=state.selectedClient;let name=document.getElementById('clientNameEdit').value.trim();if(!name)return;if(!state.clients)state.clients={};if(name!==old){delete state.clients[old];renameClientInJobs(old,name)}state.clients[name]={name,phone:document.getElementById('clientPhoneEdit').value,address:document.getElementById('clientAddressEdit').value,notes:document.getElementById('clientNotesEdit').value};state.selectedClient=name;goToFirstTab('clients')}
function renameClientInJobs(oldName,newName){Object.keys(state.calendarData||{}).forEach(date=>(state.calendarData[date].agenda||[]).forEach(a=>{if(a.client===oldName)a.client=newName}))}
function jobsForClient(n){let out=[];Object.keys(state.calendarData||{}).forEach(date=>(state.calendarData[date].agenda||[]).forEach(a=>{if(a.type==='job'&&a.client===n)out.push({...a,date})}));return out.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))}
function clientTotals(n){let jobs=jobsForClient(n),hours=0,charged=0,paid=0;jobs.forEach(j=>{if(!j.canceled){hours+=Number(j.hours||0);charged+=Number(j.owed||0);paid+=Number(j.received||0)}});return{hours,charged,paid,balance:Math.max(charged-paid,0)}}
function addServiceToDb(name){ensureCollections();name=String(name||'').trim();if(name&&!state.services.some(s=>s.toLowerCase()===name.toLowerCase()))state.services.push(name)}function addSupplyToDb(name){ensureCollections();name=String(name||'').trim();if(name&&!state.supplies.some(s=>String(s||'').trim().toLowerCase()===name.toLowerCase()))state.supplies.push(name);ensureSupplyDbFromNames()}
function nextInvoiceNumber(){ensureCollections();return state.invoiceCounter++}function createBlankInvoice(client=''){ensureCollections();let inv={id:uid(),number:nextInvoiceNumber(),client,date:new Date().toLocaleDateString(),services:[],supplies:[],jobs:[],notes:'',total:0,paid:0,signature:'',checkPhoto:'',status:'unpaid'};state.invoices.push(inv);return inv}function findOpenInvoice(client){ensureCollections();return state.invoices.find(i=>i.client===client&&getInvoiceStatus(i)!=='PAID')}function autoInvoiceFromJob(job,date){let inv=findOpenInvoice(job.client)||createBlankInvoice(job.client);inv.jobs.push({date,time:job.time,title:job.title,hours:job.hours,rate:job.rate,payType:job.payType,total:Number(job.owed||0),paid:Number(job.received||0)});inv.services.push({name:job.title,qty:job.hours||1,amount:Number(job.owed||0)});inv.paid=Number(inv.paid||0)+Number(job.received||0);recalcInvoice(inv)}
function newInvoice(){let client=prompt('Client name?')||'';let inv=createBlankInvoice(client);state.selectedInvoiceId=inv.id;save();renderInvoiceEditor(inv.id)}function openInvoice(id){state.selectedInvoiceId=id;save();renderInvoiceEditor(id)}
function renderInvoiceEditor(id){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;content.innerHTML=invoiceEditorHtml(inv);setTimeout(()=>setupSignaturePad(inv.id),50)}
function invoiceEditorHtml(inv){let serviceOptions=(state.services||[]).map(s=>`<option value="${escapeHtml(s)}"></option>`).join('');return `<div class="titleRow"><div><h2>Invoice #${inv.number}</h2><p>${escapeHtml(inv.client||'No client selected')} • ${getInvoiceStatus(inv)}</p></div><button onclick="setTab('invoices')">Back</button></div><div class="invoiceGrid"><div class="box"><label>Client / Contact</label><input id="invClient" value="${escapeHtml(inv.client||'')}" autocomplete="off" oninput="updateInvoiceClientFromInput('${inv.id}',this.value);handleClientPredictiveInput('invClient','invoice','${inv.id}')" onfocus="showClientSuggestions('invClient','invoice','${inv.id}')"><div id="invClientSuggest" class="suggestBox"></div><label>Date</label><input id="invDate" value="${escapeHtml(inv.date||'')}" oninput="updateInvoiceField('${inv.id}','date',this.value)"><h3>Services</h3><datalist id="serviceOptions">${serviceOptions}</datalist><div>${(inv.services||[]).map((s,idx)=>`<div class="lineItem"><span>${escapeHtml(s.name)}${s.qty?` (${s.qty})`:''}</span><input type="number" step="0.01" value="${Number(s.amount||0)}" oninput="updateInvoiceLine('${inv.id}','services',${idx},this.value)"><button class="smallBtn" onclick="removeInvoiceLine('${inv.id}','services',${idx})">×</button></div>`).join('')||'<p class="note">No services yet.</p>'}</div><div class="two"><input id="newServiceName" list="serviceOptions"><input id="newServiceAmount" type="number" step="0.01"></div><button onclick="addInvoiceService('${inv.id}')">Add Service</button><h3>Supplies</h3><div>${(inv.supplies||[]).map((s,idx)=>invoiceSupplyLineHtml(inv,s,idx,'full')).join('')||'<p class="note">No supplies yet.</p>'}</div>${invoiceSupplyAddHtml(inv,'full')}<h3>Payment</h3><label>Amount Paid</label><input id="invPaid" type="number" step="0.01" value="${Number(inv.paid||0)}" oninput="updateInvoicePaid('${inv.id}',this.value)"><label>Notes</label><textarea id="invNotes" oninput="updateInvoiceField('${inv.id}','notes',this.value)">${escapeHtml(inv.notes||'')}</textarea><h3>Signature</h3><canvas id="signaturePad" class="signature"></canvas><div class="actions"><button onclick="clearInvoiceSignature('${inv.id}')">Clear Signature</button></div><h3>Check Photo</h3><input type="file" accept="image/*" capture="environment" onchange="attachCheckPhoto(event,'${inv.id}')">${inv.checkPhoto?`<img class="photo" src="${inv.checkPhoto}">`:''}<div class="actions"><button class="save" onclick="shareInvoice('${inv.id}','text')">Text Invoice</button><button class="save" onclick="shareInvoice('${inv.id}','email')">Email Invoice</button><button onclick="toggleInvoiceTimeLogs('${inv.id}')">View Time Logs</button><button class="delete" onclick="deleteInvoice('${inv.id}')">Delete</button></div>${state.invoiceTimeLogOpen===inv.id?invoiceTimeLogsHtml(inv):''}</div><div class="box receipt">${invoiceReceiptHtml(inv)}</div></div>`}
function invoiceReceiptHtml(inv){return `<h2>Invoice #${inv.number}</h2><p><b>Client:</b> ${escapeHtml(inv.client||'')}<br><b>Date:</b> ${escapeHtml(inv.date||'')}</p><h3>Services</h3>${(inv.services||[]).map(s=>`<div class="receiptLine"><span>${escapeHtml(s.name)}</span><b>${money(s.amount)}</b></div>`).join('')||'<p>No services.</p>'}<h3>Supplies</h3>${(inv.supplies||[]).map(s=>{let meta=supplyLineMeta(s);return `<div class="receiptLine"><span>${escapeHtml(s.name)}${s.qty?` (${Number(s.qty||0)} ${escapeHtml(meta.unit)})`:''}</span><b>${money(s.amount)}</b></div>`}).join('')||'<p>No supplies.</p>'}<hr><p><b>Total:</b> ${money(inv.total)}<br><b>Paid:</b> ${money(inv.paid)}<br><b>Balance:</b> ${money(invoiceBalance(inv))}<br><b>Status:</b> ${getInvoiceStatus(inv)}</p>${inv.signature?`<p><b>Signed:</b><br><img class="sigImg" src="${inv.signature}"></p>`:''}${inv.checkPhoto?'<p><b>Check photo saved.</b></p>':''}`}
function recalcInvoice(inv){(inv.supplies||[]).forEach(recalcSupplyLine);inv.total=Number(roundMoney([...(inv.services||[]),...(inv.supplies||[])].reduce((a,l)=>a+Number(l.amount||0),0)));inv.paid=Number(roundMoney(inv.paid||0));inv.status=getInvoiceStatus(inv).toLowerCase();recalcAllSupplyRemaining();save()}
function updateInvoiceField(id,key,value){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;inv[key]=value;save()}
function updateInvoicePaid(id,value){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;inv.paid=Number(value||0);recalcInvoice(inv);renderInvoiceEditor(id)}
function updateInvoiceLine(id,type,idx,value){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;inv[type][idx].amount=Number(value||0);recalcInvoice(inv)}
function updateInvoiceSupplyQty(id,idx,value,mode='full'){
 let inv=state.invoices.find(i=>i.id===id);if(!inv||!inv.supplies?.[idx])return;
 let line=inv.supplies[idx];
 let oldSupplyId=line.supplyId;
 line.qty=Math.max(Number(value||0),0);
 recalcSupplyLine(line);
 recalcInvoice(inv);
 if(oldSupplyId)recalcSupplyRemaining(oldSupplyId);
 if(line.supplyId&&line.supplyId!==oldSupplyId)recalcSupplyRemaining(line.supplyId);
 if(mode==='client')refreshClientInvoiceEmbed(id);else renderInvoiceEditor(id);
}
function addInvoiceService(id){let inv=state.invoices.find(i=>i.id===id);let name=document.getElementById('newServiceName').value.trim(),amount=Number(document.getElementById('newServiceAmount').value||0);if(!inv||!name)return;addServiceToDb(name);inv.services.push({name,amount});recalcInvoice(inv);renderInvoiceEditor(id)}
function addInvoiceSupply(id){
 let inv=state.invoices.find(i=>i.id===id);
 let name=document.getElementById('newSupplyName')?.value.trim(),qty=Number(document.getElementById('newSupplyQty')?.value||0);
 if(!inv||!name)return;
 if(!qty||qty<0)qty=1;
 let item=findSupplyByName(name)||createSupplyFromInvoiceName(name);
 let line={name:item?item.name:name,qty,supplyId:item?item.id:'',unit:item?.unit||'unit',pricePerUnit:Number(item?.pricePerUnit||0),amount:0};
 recalcSupplyLine(line);
 addSupplyToDb(line.name);
 inv.supplies.push(line);
 recalcInvoice(inv);
 if(item)recalcSupplyRemaining(item.id);
 save();
 renderInvoiceEditor(id);
}
function removeInvoiceLine(id,type,idx){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;let line=inv[type][idx];inv[type].splice(idx,1);recalcInvoice(inv);if(type==='supplies'&&line?.supplyId)recalcSupplyRemaining(line.supplyId);renderInvoiceEditor(id)}
function invoiceBalance(inv){return Math.max(Number(inv.total||0)-Number(inv.paid||0),0)}function getInvoiceStatus(inv){let total=Number(inv.total||0),paid=Number(inv.paid||0);if(total>0&&paid>=total)return'PAID';if(paid>0)return'PARTIAL';return'UNPAID'}function invoiceStatusClass(inv){return getInvoiceStatus(inv).toLowerCase()}function shareInvoice(id,type){let inv=state.invoices.find(i=>i.id===id);if(!inv)return;let msg=encodeURIComponent(`Invoice #${inv.number}\nClient: ${inv.client}\nTotal: ${money(inv.total)}\nPaid: ${money(inv.paid)}\nBalance: ${money(invoiceBalance(inv))}\nStatus: ${getInvoiceStatus(inv)}`);if(type==='text')location.href='sms:?body='+msg;else if(type==='email')location.href='mailto:?subject=Invoice #'+inv.number+'&body='+msg;else if(navigator.share)navigator.share({title:'Invoice #'+inv.number,text:decodeURIComponent(msg)});else alert(decodeURIComponent(msg))}function deleteInvoice(id){state.invoices=state.invoices.filter(i=>i.id!==id);save();setTab('invoices')}
function attachCheckPhoto(e,id){let file=e.target.files[0];if(!file)return;let reader=new FileReader();reader.onload=()=>{let inv=state.invoices.find(i=>i.id===id);if(inv){inv.checkPhoto=reader.result;save();renderInvoiceEditor(id)}};reader.readAsDataURL(file)}let sigCtx=null,sigDraw=false;function setupSignaturePad(id){let c=document.getElementById('signaturePad');if(!c)return;let inv=state.invoices.find(i=>i.id===id);let r=c.getBoundingClientRect();c.width=Math.max(300,Math.floor(r.width*2));c.height=220;sigCtx=c.getContext('2d');sigCtx.lineWidth=4;sigCtx.lineCap='round';sigCtx.strokeStyle='#111';if(inv&&inv.signature){let img=new Image();img.onload=()=>sigCtx.drawImage(img,0,0,c.width,c.height);img.src=inv.signature}c.onpointerdown=e=>{sigDraw=true;let p=sigPoint(e,c);sigCtx.beginPath();sigCtx.moveTo(p.x,p.y)};c.onpointermove=e=>{if(!sigDraw)return;let p=sigPoint(e,c);sigCtx.lineTo(p.x,p.y);sigCtx.stroke()};c.onpointerup=()=>{sigDraw=false;let inv=state.invoices.find(i=>i.id===id);if(inv){inv.signature=c.toDataURL('image/png');save();renderInvoiceEditor(id)}};c.onpointerleave=()=>sigDraw=false}function sigPoint(e,c){let r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*(c.width/r.width),y:(e.clientY-r.top)*(c.height/r.height)}}function clearInvoiceSignature(id){let inv=state.invoices.find(i=>i.id===id);if(inv){inv.signature='';save();renderInvoiceEditor(id)}}

function fieldValue(id){return document.getElementById(id)?.value||''}
function hasAnyValue(obj){return Object.values(obj||{}).some(v=>String(v??'').trim()!=='')}
function clearFields(ids){ids.forEach(id=>{let el=document.getElementById(id);if(el)el.value='';});}
function readJobFormDraft(){
 if(!document.getElementById('jobDate'))return null;
 calcJobPay();
 return {date:fieldValue('jobDate'),status:fieldValue('jobStatus'),title:fieldValue('jobTitle'),time:fieldValue('jobStart'),end:fieldValue('jobEnd'),payType:fieldValue('jobPayType'),rate:fieldValue('jobRate'),client:fieldValue('jobClient'),phone:fieldValue('jobPhone'),address:fieldValue('jobAddress'),hours:fieldValue('jobHours'),owed:fieldValue('jobOwed'),received:fieldValue('jobReceived'),notes:fieldValue('jobNotes')};
}
function commitJobDraft(draft){
 if(!draft||!draft.date||!draft.title)return false;
 let d=ensureDay(draft.date);
 let job={id:uid(),time:draft.time,title:draft.title,type:'job',status:draft.status||'scheduled',end:draft.end,payType:draft.payType||'hourly',rate:draft.rate,client:String(draft.client||'').trim(),phone:draft.phone,address:draft.address,hours:draft.hours,owed:draft.owed,received:draft.received,notes:draft.notes,canceled:false};
 d.agenda.push(job);
 addServiceToDb(job.title);
 if(job.client){upsertClientFromJob(job);autoInvoiceFromJob(job,draft.date)}
 sortAgenda(d.agenda);
 state.selectedDate=draft.date;
 let p=parseKey(draft.date);state.year=p.y;state.month=p.m;
 if(state.drafts)delete state.drafts.newJob;
 clearFields(['jobTitle','jobStart','jobEnd','jobHours','jobRate','jobOwed','jobReceived','jobClient','jobPhone','jobAddress','jobNotes']);
 save();
 return true;
}
function readEventFormDraft(){
 if(!document.getElementById('eventDate'))return null;
 return {date:fieldValue('eventDate'),title:fieldValue('eventTitle'),time:fieldValue('eventTime'),location:fieldValue('eventLocation'),notes:fieldValue('eventNotes')};
}
function commitEventDraft(draft){
 if(!draft||!draft.date||!draft.title)return false;
 let d=ensureDay(draft.date);
 d.agenda.push({time:draft.time,title:draft.title,type:'event',location:draft.location,notes:draft.notes,canceled:false});
 sortAgenda(d.agenda);
 state.selectedDate=draft.date;
 let p=parseKey(draft.date);state.year=p.y;state.month=p.m;
 if(state.drafts)delete state.drafts.newEvent;
 clearFields(['eventTitle','eventTime','eventLocation','eventNotes']);
 save();
 return true;
}
function readNewClientDraft(){
 if(!document.getElementById('newClientName'))return null;
 return {name:fieldValue('newClientName').trim(),phone:fieldValue('newClientPhone'),address:fieldValue('newClientAddress'),notes:fieldValue('newClientNotes')};
}
function commitNewClientDraft(draft){
 if(!draft||!draft.name)return false;
 if(!state.clients)state.clients={};
 state.clients[draft.name]={name:draft.name,phone:draft.phone||'',address:draft.address||'',notes:draft.notes||''};
 state.selectedClient=draft.name;
 if(state.drafts)delete state.drafts.newClient;
 clearFields(['newClientName','newClientPhone','newClientAddress','newClientNotes']);
 save();
 return true;
}
function autosaveSupplyItemPage(){
 let id=state.selectedSupplyId;
 if(!id||!document.getElementById('sName'))return false;
 let item=readSupplyFormIntoState(id);
 if(!item)return false;
 if(hasAnyValue({name:item.name,description:item.description,supplier:item.supplier,storeItemNumber:item.storeItemNumber,price:item.price,quantityForPrice:item.quantityForPrice})){item.isDraft=false;finalizeSupplyItemName(item);calcSupplyUnitPrice(id);recalcSupplyRemaining(id);addSupplyToDb(item.name);save();return true;}
 save();
 return false;
}
function autosaveInvoiceEditorPage(){
 let invId=state.selectedInvoiceId;
 let inv=invId?state.invoices.find(i=>i.id===invId):null;
 if(!inv||!document.getElementById('invClient'))return false;
 inv.client=fieldValue('invClient');
 inv.date=fieldValue('invDate')||inv.date;
 inv.paid=Number(fieldValue('invPaid')||0);
 inv.notes=fieldValue('invNotes');
 let serviceName=fieldValue('newServiceName').trim();
 let serviceAmount=Number(fieldValue('newServiceAmount')||0);
 if(serviceName){addServiceToDb(serviceName);inv.services.push({name:serviceName,amount:serviceAmount});clearFields(['newServiceName','newServiceAmount']);}
 let supplyName=fieldValue('newSupplyName').trim();
 let supplyQty=Number(fieldValue('newSupplyQty')||0);
 if(supplyName){
   if(!supplyQty||supplyQty<0)supplyQty=1;
   let item=findSupplyByName(supplyName)||createSupplyFromInvoiceName(supplyName);
   let line={name:item?item.name:supplyName,qty:supplyQty,supplyId:item?item.id:'',unit:item?.unit||'unit',pricePerUnit:Number(item?.pricePerUnit||0),amount:0};
   recalcSupplyLine(line);addSupplyToDb(line.name);inv.supplies.push(line);if(item)recalcSupplyRemaining(item.id);clearFields(['newSupplyName','newSupplyQty']);
 }
 if(inv.client){if(!state.clients[inv.client])state.clients[inv.client]={name:inv.client,phone:'',address:'',notes:''};}
 recalcInvoice(inv);
 save();
 return true;
}
function autosaveClientEditPage(){
 if(!document.getElementById('clientNameEdit'))return false;
 let old=state.selectedClient;
 let name=fieldValue('clientNameEdit').trim();
 if(!name)return false;
 if(!state.clients)state.clients={};
 if(old&&name!==old){delete state.clients[old];renameClientInJobs(old,name)}
 state.clients[name]={name,phone:fieldValue('clientPhoneEdit'),address:fieldValue('clientAddressEdit'),notes:fieldValue('clientNotesEdit')};
 state.selectedClient=name;
 save();
 return true;
}
let autosaveLock=false;
function autosaveCurrentPage(reason='manual'){
 if(autosaveLock)return;
 autosaveLock=true;
 try{
   ensureCollections();
   let job=readJobFormDraft();
   if(job){if(!commitJobDraft(job)&&hasAnyValue(job)){state.drafts.newJob=job;save();}return;}
   let event=readEventFormDraft();
   if(event){if(!commitEventDraft(event)&&hasAnyValue(event)){state.drafts.newEvent=event;save();}return;}
   let newClient=readNewClientDraft();
   if(newClient){if(!commitNewClientDraft(newClient)&&hasAnyValue(newClient)){state.drafts.newClient=newClient;save();}return;}
   if(autosaveClientEditPage())return;
   if(autosaveSupplyItemPage())return;
   if(autosaveInvoiceEditorPage())return;
   save();
 }catch(err){console.warn('Autosave skipped:',err)}
 finally{autosaveLock=false;}
}
window.addEventListener('beforeunload',()=>autosaveCurrentPage('app-close'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')autosaveCurrentPage('app-hidden')});


/* ===== V44 SCRATCH PAD / GALLERY ENGINE + SYNC HARDENING ===== */


function renderStudioPage(){
  ensureScratchPad();
  return `<div class="titleRow"><div><h2>Studio</h2><p>Sketch ideas, mark up yard photos, and save drawings to the gallery.</p></div><div class="note">Creative Workspace</div></div>${renderScratchModule()}`;
}
function renderTimeCardModule(){
  ensureCollections();
  const today=state.selectedDate||dateKey(new Date());
  const logs=(state.timeLogs||[]).filter(l=>l.date===today).sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
  const totals=timeTotalsForDate(today);
  const status=state.timeClock?.status||'out';
  return `<div class="timeCardModule box"><div class="titleRow miniTitle"><div><h3>Time Card</h3><p class="note">Clock jobs, breaks, and day-end punches with date/time stamps.</p></div><b class="timeStatus ${escapeAttr(status)}">${timeStatusLabel(status)}</b></div><div class="timeButtonGrid"><button class="save" onclick="timePunch('clockIn')">Clock In</button><button onclick="timePunch('breakStart')">Start Break</button><button onclick="timePunch('breakEnd')">End Break</button><button class="delete" onclick="timePunch('clockOut')">Clock Out</button></div><div class="two timeMetaRow"><input id="timeJobTitle" placeholder="Job / task label optional"><input id="timeClientName" placeholder="Client optional" list="timeClientOptions"></div><datalist id="timeClientOptions">${Object.keys(state.clients||{}).sort().map(n=>`<option value="${escapeHtml(n)}"></option>`).join('')}</datalist><p class="note">Today: ${formatDuration(totals.worked)} worked • ${formatDuration(totals.breaks)} breaks</p><div class="timeLogList">${logs.map(l=>`<div class="timeLogRow"><span>${escapeHtml(timePunchLabel(l.type))}</span><b>${escapeHtml(l.time)}</b><small>${escapeHtml(l.job||'')}${l.client?' • '+escapeHtml(l.client):''}</small></div>`).join('')||'<p class="note">No time punches for this date yet.</p>'}</div></div>`;
}
function timePunch(type){
  ensureCollections();
  const d=new Date();
  const log={id:uid(),type,ts:d.toISOString(),date:dateKey(d),time:d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}),job:fieldValue('timeJobTitle'),client:fieldValue('timeClientName')};
  state.timeLogs.push(log);
  if(type==='clockIn')state.timeClock={status:'in',startedAt:log.ts};
  if(type==='breakStart')state.timeClock={...(state.timeClock||{}),status:'break',breakStartedAt:log.ts};
  if(type==='breakEnd')state.timeClock={...(state.timeClock||{}),status:'in',breakStartedAt:''};
  if(type==='clockOut')state.timeClock={status:'out',endedAt:log.ts};
  save();render();
}
function timeStatusLabel(status){return status==='in'?'CLOCKED IN':status==='break'?'ON BREAK':'CLOCKED OUT'}
function timePunchLabel(type){return ({clockIn:'Clock In',breakStart:'Break Start',breakEnd:'Break End',clockOut:'Clock Out'}[type]||type)}
function timeTotalsForDate(date){
  const logs=(state.timeLogs||[]).filter(l=>l.date===date).sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));
  let worked=0,breaks=0,lastIn=null,lastBreak=null;
  logs.forEach(l=>{const t=new Date(l.ts).getTime();if(l.type==='clockIn')lastIn=t;if(l.type==='breakStart'){if(lastIn){worked+=t-lastIn;lastIn=null;}lastBreak=t;}if(l.type==='breakEnd'){if(lastBreak){breaks+=t-lastBreak;lastBreak=null;}lastIn=t;}if(l.type==='clockOut'){if(lastIn){worked+=t-lastIn;lastIn=null;}if(lastBreak){breaks+=t-lastBreak;lastBreak=null;}}});
  return {worked:worked/3600000,breaks:breaks/3600000};
}
function formatDuration(hours){const mins=Math.round(Number(hours||0)*60);return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}m`}
function invoiceTimeLogsHtml(inv){
  const logs=(state.timeLogs||[]).filter(l=>!inv.client||l.client===inv.client||!l.client).sort((a,b)=>String(b.ts).localeCompare(String(a.ts))).slice(0,30);
  const byDate={};logs.forEach(l=>{(byDate[l.date] ||= []).push(l)});
  return `<div class="invoiceTimeLogs box"><h3>Time Logs${inv.client?' — '+escapeHtml(inv.client):''}</h3>${Object.keys(byDate).map(date=>{const totals=timeTotalsForDate(date);return `<div class="timeDateGroup"><b>${escapeHtml(date)} • ${formatDuration(totals.worked)} worked</b>${byDate[date].map(l=>`<div class="timeLogRow"><span>${escapeHtml(timePunchLabel(l.type))}</span><b>${escapeHtml(l.time)}</b><small>${escapeHtml(l.job||'')}</small></div>`).join('')}</div>`}).join('')||'<p class="note">No matching time logs yet.</p>'}</div>`;
}
function toggleInvoiceTimeLogs(id){state.invoiceTimeLogOpen=state.invoiceTimeLogOpen===id?'':id;save();renderInvoiceEditor(id)}
function renderReminderModule(){
  ensureCollections();
  const upcoming=(state.reminders||[]).filter(r=>!r.done).sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time)).slice(0,5);
  return `<div class="reminderModule box"><div class="titleRow miniTitle"><div><h3>Reminders / Alarms</h3><p class="note">Schedule job and event reminders. Alerts fire while the app is open.</p></div><button onclick="requestReminderPermission()">Enable Alerts</button></div><div class="reminderAddGrid"><input id="reminderTitle" placeholder="Reminder title"><input id="reminderDate" type="date" value="${escapeHtml(state.selectedDate||dateKey(new Date()))}"><input id="reminderTime" type="time"><button class="save" onclick="addReminder()">Add</button></div><div class="reminderList">${upcoming.map(r=>`<div class="reminderRow"><span>${escapeHtml(r.title)}</span><b>${escapeHtml(r.date)} ${escapeHtml(r.time)}</b><button class="smallBtn" onclick="completeReminder('${r.id}')">×</button></div>`).join('')||'<p class="note">No reminders set.</p>'}</div></div>`;
}
function addReminder(){
  ensureCollections();
  const title=fieldValue('reminderTitle').trim(),date=fieldValue('reminderDate'),time=fieldValue('reminderTime');
  if(!title||!date||!time){alert('Add a title, date, and time for the reminder.');return;}
  state.reminders.push({id:uid(),title,date,time,done:false,createdAt:new Date().toISOString()});
  save();scheduleReminderChecks();render();
}
function completeReminder(id){const r=(state.reminders||[]).find(x=>x.id===id);if(r){r.done=true;save();render();}}
function requestReminderPermission(){if('Notification' in window)Notification.requestPermission().then(()=>alert('Reminder alerts enabled for this browser when the app is open.'));else alert('This browser does not support notifications. Reminders will use app alerts.');}
let reminderTimer=null;
function scheduleReminderChecks(){clearInterval(reminderTimer);reminderTimer=setInterval(checkDueReminders,30000);checkDueReminders();}
function checkDueReminders(){
  ensureCollections();const nowMs=Date.now();
  (state.reminders||[]).forEach(r=>{if(r.done||state.firedReminders[r.id])return;const due=new Date(`${r.date}T${r.time}`).getTime();if(!isNaN(due)&&nowMs>=due){state.firedReminders[r.id]=true;save();if('Notification' in window&&Notification.permission==='granted')new Notification('Ahtelleeay Reminder',{body:r.title});else alert('Reminder: '+r.title);}})
}

function mountScratchPadFallback(){
  try{
    ensureScratchPad();
    if(state.section!=='schedule' || state.tabs.schedule!=='calendar')return;
    if(document.getElementById('calendarScratchModule'))return;
    const target=document.getElementById('content');
    if(target){target.insertAdjacentHTML('beforeend', renderScratchModule());}
  }catch(e){console.warn('Scratch pad fallback mount failed', e)}
}

function ensureScratchPad(){
  ensureCollections();
  if(!state.scratchPad)state.scratchPad={};
  if(!Array.isArray(state.scratchPad.gallery))state.scratchPad.gallery=[];
  if(!Array.isArray(state.scratchPad.undo))state.scratchPad.undo=[];
  if(!state.scratchPad.activeTab)state.scratchPad.activeTab='pad';
  if(!state.scratchPad.tool)state.scratchPad.tool='pencil';
  if(!state.scratchPad.size)state.scratchPad.size=6;
  if(!state.scratchPad.color)state.scratchPad.color='#111111';if(state.scratchPad.opacity===undefined)state.scratchPad.opacity=1;
}
function renderScratchModule(){
  ensureScratchPad();
  const sp=state.scratchPad;
  const padActive=sp.activeTab!=='gallery';
  return `<div class="scratchModule box" id="calendarScratchModule"><div class="scratchModuleHeader"><h3>Quick Scratch Pad</h3><p class="note">Sketch quick job ideas, draw over yard photos, and save them to Gallery.</p></div><div class="scratchMiniTabs"><button type="button" class="miniFolderTab ${padActive?'active':''}" onclick="setScratchTab('pad')">Scratch Pad</button><button type="button" class="miniFolderTab ${!padActive?'active':''}" onclick="setScratchTab('gallery')">Gallery</button></div>${padActive?renderScratchPadView():renderScratchGalleryView()}</div>`;
}
function renderScratchPadView(){
  ensureScratchPad();
  const sp=state.scratchPad;
  const menu=sp.menu||'';
  const drawLabel=sp.tool==='eraser'?'Eraser':'Draw';
  const shapeLabel=['line','circle','square','triangle'].includes(sp.tool)?({line:'Line',circle:'Circle',square:'Square',triangle:'Triangle'}[sp.tool]):'Shape';
  return `<div class="scratchPadWrap elegantScratch upgradedScratch"><div class="scratchToolbarCompact"><button type="button" class="toolBtn ${['pencil','eraser'].includes(sp.tool)?'activeTool':''}" onclick="toggleScratchMenu('draw')">✎ ${drawLabel}</button><button type="button" class="toolBtn ${['line','circle','square','triangle'].includes(sp.tool)?'activeTool':''}" onclick="toggleScratchMenu('shape')">◇ ${shapeLabel}</button><button type="button" class="toolBtn" onclick="toggleScratchMenu('style')">☼ Style</button><button type="button" class="toolBtn" onclick="toggleScratchMenu('image')">▣ Image</button><button type="button" class="toolBtn" onclick="undoScratch()">↶ Undo</button></div>${renderScratchPopover(menu)}<div class="scratchCanvasBox"><canvas id="scratchCanvas" class="scratchCanvas"></canvas><div id="scratchHint" class="note">Sketch ideas or draw over yard photos, then save to Gallery.</div></div><div class="scratchActionsCompact"><button type="button" class="save" onclick="saveScratchToGallery()">Save</button><button type="button" onclick="clearScratchPad()">Clear</button><button type="button" onclick="shareScratchPad()">Share</button></div></div>`;
}
function renderScratchPopover(menu){
  ensureScratchPad();
  const sp=state.scratchPad;
  if(menu==='draw'){
    return `<div class="scratchPopover"><button type="button" class="${sp.tool==='pencil'?'activeTool':''}" onclick="setScratchTool('pencil')">✎ Pencil</button><button type="button" class="${sp.tool==='eraser'?'activeTool':''}" onclick="setScratchTool('eraser')">⌫ Eraser</button></div>`;
  }
  if(menu==='shape'){
    return `<div class="scratchPopover"><button type="button" class="${sp.tool==='line'?'activeTool':''}" onclick="setScratchTool('line')">╱ Line</button><button type="button" class="${sp.tool==='circle'?'activeTool':''}" onclick="setScratchTool('circle')">○ Circle</button><button type="button" class="${sp.tool==='square'?'activeTool':''}" onclick="setScratchTool('square')">□ Square</button><button type="button" class="${sp.tool==='triangle'?'activeTool':''}" onclick="setScratchTool('triangle')">△ Triangle</button></div>`;
  }
  if(menu==='style'){
    return `<div class="scratchPopover stylePopover upgradedStyle"><div class="colorWheelWrap"><label>Color Wheel <input class="colorWheelInput" type="color" value="${escapeHtml(sp.color)}" oninput="setScratchColor(this.value)"><span class="colorSwatch" style="background:${escapeHtml(sp.color)}"></span></label></div><label>Size <input type="range" min="2" max="44" value="${Number(sp.size||6)}" oninput="setScratchSize(this.value)"> <b>${Number(sp.size||6)}px</b></label><label>Opacity <input type="range" min="0.05" max="1" step="0.05" value="${Number(sp.opacity??1)}" oninput="setScratchOpacity(this.value)"> <b>${Math.round(Number(sp.opacity??1)*100)}%</b></label></div>`;
  }
  if(menu==='image'){
    return `<div class="scratchPopover imagePopover"><label class="toolBtn uploadBtnCompact">📁 Choose from Files<input type="file" accept="image/*" onchange="addScratchImage(event)"></label><label class="toolBtn uploadBtnCompact">📷 Take Photo<input type="file" accept="image/*" capture="environment" onchange="addScratchImage(event)"></label></div>`;
  }
  return '';
}
function renderScratchGalleryView(){
  ensureScratchPad();
  const items=state.scratchPad.gallery||[];
  return `<div class="scratchGallery"><div class="titleRow miniTitle"><div><h3>Saved Sketches</h3><p class="note">View, add to client notes, share, or delete.</p></div></div>${items.map(g=>`<div class="galleryCard"><img src="${g.image}" class="galleryImg"><div><b>${escapeHtml(g.title||'Sketch')}</b><small>${escapeHtml(g.date||'')}</small><div class="actions"><button type="button" onclick="addSketchToClient('${g.id}')">Add</button><button type="button" onclick="shareGallerySketch('${g.id}')">Share</button><button type="button" class="delete" onclick="deleteGallerySketch('${g.id}')">Delete</button></div></div></div>`).join('')||'<p class="note">No saved sketches yet.</p>'}</div>`;
}
function toggleScratchMenu(menu){ensureScratchPad();state.scratchPad.menu=state.scratchPad.menu===menu?'':menu;save();render()}
function setScratchTab(tab){ensureScratchPad();state.scratchPad.activeTab=tab;state.scratchPad.menu='';save();render()}
function setScratchTool(tool){ensureScratchPad();state.scratchPad.tool=tool;state.scratchPad.menu='';save();render()}
function setScratchColor(color){ensureScratchPad();state.scratchPad.color=color;save();initScratchPad()}
function setScratchSize(size){ensureScratchPad();state.scratchPad.size=Number(size||6);save();}
function setScratchOpacity(opacity){ensureScratchPad();state.scratchPad.opacity=Math.max(.05,Math.min(1,Number(opacity||1)));save();}

function initScratchPad(){
  ensureScratchPad();
  const canvas=document.getElementById('scratchCanvas');
  if(!canvas)return;
  const box=canvas.parentElement;
  const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,2));
  const rect=box.getBoundingClientRect();
  const cssW=Math.max(320,Math.round(rect.width||320));
  const cssH=Math.max(460,Math.round(rect.height||460));
  canvas.style.width='100%';
  canvas.style.height='100%';
  if(canvas.width!==Math.round(cssW*dpr)||canvas.height!==Math.round(cssH*dpr)){
    canvas.width=Math.round(cssW*dpr);
    canvas.height=Math.round(cssH*dpr);
  }
  const ctx=canvas.getContext('2d',{alpha:false});
  const resetTransform=()=>ctx.setTransform(dpr,0,0,dpr,0,0);
  resetTransform();
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';

  const paintBackground=()=>{ctx.save();resetTransform();ctx.globalCompositeOperation='source-over';ctx.fillStyle='#fffdf7';ctx.fillRect(0,0,cssW,cssH);ctx.restore();};
  paintBackground();
  const existing=state.scratchPad.canvasData;
  if(existing){const img=new Image();img.onload=()=>{paintBackground();ctx.drawImage(img,0,0,cssW,cssH)};img.src=existing;}

  let drawing=false,start=null,last=null,raf=0,queue=[],shapePoint=null,snap=null;
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(cssW/r.width),y:(e.clientY-r.top)*(cssH/r.height),t:performance.now(),p:(e.pressure&&e.pressure>0)?e.pressure:.6}};
  const snapshot=()=>canvas.toDataURL('image/png');
  const pushUndo=()=>{state.scratchPad.undo.push(snapshot());if(state.scratchPad.undo.length>60)state.scratchPad.undo.shift();save('scratch-undo')};
  const commit=()=>{state.scratchPad.canvasData=snapshot();save('scratch-commit')};
  const drawSegment=(a,b,c)=>{
    ctx.save();resetTransform();ctx.lineCap='round';ctx.lineJoin='round';ctx.globalCompositeOperation=state.scratchPad.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=state.scratchPad.color;ctx.globalAlpha=Number(state.scratchPad.opacity??1);
    const base=Number(state.scratchPad.size||6)*(state.scratchPad.tool==='eraser'?1.45:1);
    const dist=Math.hypot(c.x-a.x,c.y-a.y);
    ctx.lineWidth=Math.max(1,base*(dist>60?.85:1));
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(b.x,b.y,c.x,c.y);ctx.stroke();ctx.restore();
  };
  const process=()=>{
    raf=0;
    while(queue.length>0){
      const p=queue.shift();
      if(!last){last=p;continue;}
      const mid={x:(last.x+p.x)/2,y:(last.y+p.y)/2};
      drawSegment(last,last,mid);
      last=p;
    }
  };
  const redrawSnap=(done)=>{
    paintBackground();
    if(!snap){done?.();return;}
    const img=new Image();img.onload=()=>{paintBackground();ctx.drawImage(img,0,0,cssW,cssH);done?.()};img.src=snap;
  };
  const shape=(p)=>{ctx.save();resetTransform();ctx.globalCompositeOperation='source-over';ctx.lineWidth=Number(state.scratchPad.size||6);ctx.strokeStyle=state.scratchPad.color;ctx.globalAlpha=Number(state.scratchPad.opacity??1);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();const x=start.x,y=start.y,w=p.x-start.x,h=p.y-start.y;if(state.scratchPad.tool==='line'){ctx.moveTo(x,y);ctx.lineTo(p.x,p.y)}else if(state.scratchPad.tool==='circle'){ctx.ellipse(x+w/2,y+h/2,Math.abs(w/2),Math.abs(h/2),0,0,Math.PI*2)}else if(state.scratchPad.tool==='square'){ctx.roundRect?ctx.roundRect(x,y,w,h,8):ctx.rect(x,y,w,h)}else if(state.scratchPad.tool==='triangle'){ctx.moveTo(x+w/2,y);ctx.lineTo(p.x,p.y);ctx.lineTo(x,y+h);ctx.closePath()}ctx.stroke();ctx.restore();};
  const preview=()=>{const p=shapePoint;if(!p)return;redrawSnap(()=>shape(p));};

  canvas.onpointerdown=e=>{e.preventDefault();canvas.setPointerCapture?.(e.pointerId);drawing=true;start=point(e);last=null;queue=[];shapePoint=null;pushUndo();snap=snapshot();if(['pencil','eraser'].includes(state.scratchPad.tool)){queue.push(start);if(!raf)raf=requestAnimationFrame(process)}};
  canvas.onpointermove=e=>{if(!drawing)return;e.preventDefault();const p=point(e);if(['pencil','eraser'].includes(state.scratchPad.tool)){queue.push(p);if(!raf)raf=requestAnimationFrame(process)}else{shapePoint=p;if(!raf)raf=requestAnimationFrame(()=>{raf=0;preview()})}};
  const finish=()=>{if(!drawing)return;drawing=false;if(raf){cancelAnimationFrame(raf);raf=0}if(queue.length)process();if(shapePoint&&!['pencil','eraser'].includes(state.scratchPad.tool))preview();commit()};
  canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onpointerleave=finish;
}
function undoScratch(){ensureScratchPad();const data=state.scratchPad.undo.pop();if(!data)return;state.scratchPad.canvasData=data;save();initScratchPad()}
function clearScratchPad(){if(!confirm('Clear the scratch pad?'))return;ensureScratchPad();state.scratchPad.canvasData='';state.scratchPad.undo=[];save();initScratchPad()}
function addScratchImage(e){
  const file=e.target.files?.[0];
  if(!file)return;
  ensureScratchPad();
  const reader=new FileReader();
  reader.onload=()=>{
    const canvas=document.getElementById('scratchCanvas');
    if(!canvas)return;
    const ctx=canvas.getContext('2d');
    const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,2));
    const r=canvas.getBoundingClientRect();
    const cssW=Math.max(320,Math.round(r.width||320));
    const cssH=Math.max(460,Math.round(r.height||460));
    const img=new Image();
    img.onload=()=>{
      state.scratchPad.undo.push(canvas.toDataURL('image/png'));
      if(state.scratchPad.undo.length>60)state.scratchPad.undo.shift();
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      const ratio=Math.min((cssW*.86)/img.width,(cssH*.86)/img.height,1);
      const w=img.width*ratio,h=img.height*ratio;
      ctx.drawImage(img,(cssW-w)/2,(cssH-h)/2,w,h);
      state.scratchPad.canvasData=canvas.toDataURL('image/png');
      save('scratch-image');
      e.target.value='';
    };
    img.src=reader.result;
  };
  reader.readAsDataURL(file)
}
function saveScratchToGallery(){ensureScratchPad();const canvas=document.getElementById('scratchCanvas');if(!canvas)return;const image=canvas.toDataURL('image/png');if(!image)return;state.scratchPad.gallery.unshift({id:uid(),title:'Sketch '+new Date().toLocaleString(),date:new Date().toLocaleString(),image});state.scratchPad.activeTab='gallery';save();render()}
function scratchCurrentImage(){const canvas=document.getElementById('scratchCanvas');return canvas?canvas.toDataURL('image/png'):state.scratchPad?.canvasData}
async function shareDataUrl(data,title='Ahtelleeay Sketch'){try{const blob=await(await fetch(data)).blob();const file=new File([blob],'ahtelleeay-sketch.png',{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title});return true}}catch(e){}return false}
async function shareScratchPad(){const data=scratchCurrentImage();if(!data)return;if(await shareDataUrl(data,'Ahtelleeay Sketch'))return;alert('Native share is not available in this browser. Save to Gallery first, then share from there.')}
async function shareGallerySketch(id){const g=(state.scratchPad?.gallery||[]).find(x=>x.id===id);if(!g)return;if(await shareDataUrl(g.image,g.title))return;alert('Share is not available on this device/browser.')}
function deleteGallerySketch(id){if(!confirm('Delete this saved sketch?'))return;state.scratchPad.gallery=(state.scratchPad.gallery||[]).filter(g=>g.id!==id);save();render()}
function addSketchToClient(id){const g=(state.scratchPad?.gallery||[]).find(x=>x.id===id);if(!g)return;const name=prompt('Add sketch to which client/contact? Type saved or new name:');if(!name)return;ensureCollections();if(!state.clients[name])state.clients[name]={name,phone:'',address:'',notes:''};if(!Array.isArray(state.clients[name].sketches))state.clients[name].sketches=[];state.clients[name].sketches.push({id:g.id,title:g.title,date:g.date,image:g.image});state.clients[name].notes=((state.clients[name].notes||'')+`\n[Sketch added: ${g.title} — ${g.date}]`).trim();save();alert('Sketch added to client notes/gallery.')}

function toggleCancel(idx){let d=ensureDay(state.selectedDate);d.agenda[idx].canceled=!d.agenda[idx].canceled;save();render()}function updateTask(idx,key,value){ensureDay(state.selectedDate).tasks[idx][key]=value;save();renderCalendarOnlySoon()}function deleteTask(idx){ensureDay(state.selectedDate).tasks.splice(idx,1);save();render()}function addTask(){let text=document.getElementById('newTaskText').value.trim();if(!text)return;ensureDay(state.selectedDate).tasks.push({text,done:false});save();render()}function updateNotes(value){ensureDay(state.selectedDate).notes=value;save()}
function calcJobPay(){let start=document.getElementById('jobStart')?.value||'',end=document.getElementById('jobEnd')?.value||'',hoursEl=document.getElementById('jobHours'),rateEl=document.getElementById('jobRate'),typeEl=document.getElementById('jobPayType'),owedEl=document.getElementById('jobOwed');if(hoursEl&&start&&end){let h=hoursBetween(start,end);if(h!==null)hoursEl.value=h.toFixed(h%1===0?0:2)}let hours=Number(hoursEl?.value||0),rate=Number(rateEl?.value||0),type=typeEl?.value||'hourly',total=type==='flat'?rate:hours*rate;if(owedEl)owedEl.value=total?total.toFixed(2):''}function hoursBetween(start,end){let a=parseFlexibleTime(start),b=parseFlexibleTime(end);if(a===null||b===null)return null;let mins=b-a;if(mins<0)mins+=1440;return mins/60}function parseFlexibleTime(t){t=String(t||'').trim().toLowerCase();let m=t.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?m?$/);if(!m)return null;let h=Number(m[1]),min=Number(m[2]||0),ap=m[3];if(ap==='p'&&h<12)h+=12;if(ap==='a'&&h===12)h=0;if(h>23||min>59)return null;return h*60+min}function sortAgenda(arr){arr.sort((a,b)=>timeValue(a.time)-timeValue(b.time))}function timeValue(t){t=String(t||'').toLowerCase().trim();let m=t.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?/);if(!m)return 9999;let h=Number(m[1]),min=Number(m[2]||0),ap=m[3];if(ap==='p'&&h<12)h+=12;if(ap==='a'&&h===12)h=0;return h*60+min}function formatTime(t){t=String(t||'').trim().toLowerCase();if(!t)return'';if(t.includes('a')||t.includes('p'))return t.replace(':00','');if(t.includes(':')){let [h,min]=t.split(':');h=Number(h);let ap=h>=12?'p':'a';h=h%12||12;return min==='00'?`${h}${ap}`:`${h}:${min}${ap}`}return t}let softRenderTimer=null;function renderCalendarOnlySoon(){clearTimeout(softRenderTimer);softRenderTimer=setTimeout(()=>render(),650)}function roundMoney(n,places=2){let factor=Math.pow(10,places);return (Math.round((Number(n||0)+Number.EPSILON)*factor)/factor).toFixed(places)}function money(n){return '$'+Number(n||0).toFixed(2)}function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}function escapeAttr(s=''){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;')}function backup(){autosaveCurrentPage('backup');let b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});let u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='ahtelleeay-backup.json';a.click();URL.revokeObjectURL(u)}
async function forceFreshApp(){
  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
  }catch(e){console.warn('Cache reset failed',e)}
  location.reload(true);
}
if('serviceWorker'in navigator){
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./service-worker.js?v=44');
      reg.update();
    }catch(e){}
  });
}

async function scanBarcode(id){
  if(!('BarcodeDetector' in window)){
    alert('Barcode scanning not supported on this device. Enter manually.');
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();

    const detector = new BarcodeDetector();
    const scan = async ()=>{
      const codes = await detector.detect(video);
      if(codes.length){
        const value = codes[0].rawValue;
        let item = state.supplyItems[id];
        if(item){
          item.storeItemNumber = value;
          save();
          render();
        }
        stream.getTracks().forEach(t=>t.stop());
      }else{
        requestAnimationFrame(scan);
      }
    };
    scan();
  }catch(e){
    alert('Camera error');
  }
}


function updatePwaStatus(){
  const el=document.getElementById('pwaStatus');
  if(!el)return;
  el.textContent=navigator.onLine?'Online / Saved locally':'Offline / Saved locally';
  el.classList.toggle('offline',!navigator.onLine);
}
window.addEventListener('online',updatePwaStatus);
window.addEventListener('offline',updatePwaStatus);
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=50.1').then(()=>updatePwaStatus()).catch(()=>updatePwaStatus()));
}else{window.addEventListener('load',updatePwaStatus);}

scheduleReminderChecks();
render();
setTimeout(updatePwaStatus,200);


/* ===== V50 STATIC SCRATCH PAD NOTE ===== */

/* Static V40 emergency scratchpad removed in V43. Calendar-mounted scratchpad is now the single source of truth. */

